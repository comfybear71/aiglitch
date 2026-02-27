import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { v4 as uuidv4 } from "uuid";
import { TOKENOMICS } from "@/lib/solana-config";
import { TOKENS, TRADING_PAIRS, canMeatBagSell } from "@/lib/tokens";

// Generate a fake tx hash
function generateTxHash(): string {
  const chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let hash = "";
  for (let i = 0; i < 88; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)];
  }
  return hash;
}

function getCurrentBlock(): number {
  const genesis = new Date("2025-01-01").getTime();
  return Math.floor((Date.now() - genesis) / 400);
}

// Generate a simulated order book for any pair
function generateOrderBook(currentPrice: number) {
  const bids = [];
  const asks = [];

  for (let i = 0; i < 12; i++) {
    const bidPrice = currentPrice * (1 - (i + 1) * 0.005 - Math.random() * 0.003);
    const askPrice = currentPrice * (1 + (i + 1) * 0.005 + Math.random() * 0.003);
    bids.push({
      price: parseFloat(bidPrice.toFixed(8)),
      amount: Math.floor(Math.random() * 50000) + 1000,
      total: parseFloat((bidPrice * (Math.floor(Math.random() * 50000) + 1000)).toFixed(4)),
    });
    asks.push({
      price: parseFloat(askPrice.toFixed(8)),
      amount: Math.floor(Math.random() * 50000) + 1000,
      total: parseFloat((askPrice * (Math.floor(Math.random() * 50000) + 1000)).toFixed(4)),
    });
  }

  return { bids, asks };
}

// Generate recent simulated trades
function generateRecentTrades(currentPrice: number) {
  const trades = [];
  const now = Date.now();

  for (let i = 0; i < 20; i++) {
    const isBuy = Math.random() > 0.45;
    const priceVariation = currentPrice * (1 + (Math.random() - 0.5) * 0.02);
    const amount = Math.floor(Math.random() * 10000) + 100;
    trades.push({
      price: parseFloat(priceVariation.toFixed(8)),
      amount,
      side: isBuy ? "buy" : "sell",
      time: new Date(now - i * (Math.random() * 30000 + 5000)).toISOString(),
    });
  }

  return trades;
}

// Get token prices from platform_settings
async function getTokenPrices(sql: ReturnType<typeof getDb>) {
  const keys = [
    "glitch_price_usd", "glitch_price_sol",
    "budju_price_usd", "budju_price_sol",
    "sol_price_usd", "usdc_price_usd",
    "glitch_total_supply", "budju_total_supply",
    "glitch_market_cap", "budju_market_cap",
  ];
  const settings = await sql`SELECT key, value FROM platform_settings WHERE key = ANY(${keys})`;
  const s: Record<string, string> = {};
  for (const row of settings) {
    s[row.key as string] = row.value as string;
  }

  return {
    GLITCH: {
      usd: parseFloat(s.glitch_price_usd || "0.0069"),
      sol: parseFloat(s.glitch_price_sol || "0.000042"),
      totalSupply: parseInt(s.glitch_total_supply || "100000000"),
      marketCap: parseFloat(s.glitch_market_cap || "690420"),
    },
    BUDJU: {
      usd: parseFloat(s.budju_price_usd || "0.00042"),
      sol: parseFloat(s.budju_price_sol || "0.0000025"),
      totalSupply: parseInt(s.budju_total_supply || "1000000000"),
      marketCap: parseFloat(s.budju_market_cap || "210000"),
    },
    SOL: {
      usd: parseFloat(s.sol_price_usd || "164.0"),
      sol: 1.0,
      totalSupply: 590000000,
      marketCap: 164 * 440000000,
    },
    USDC: {
      usd: parseFloat(s.usdc_price_usd || "1.0"),
      sol: 1.0 / parseFloat(s.sol_price_usd || "164.0"),
      totalSupply: 45000000000,
      marketCap: 45000000000,
    },
  };
}

// Calculate the exchange rate for a trading pair
function getPairRate(prices: Awaited<ReturnType<typeof getTokenPrices>>, pairId: string) {
  const pair = TRADING_PAIRS.find((p) => p.id === pairId);
  if (!pair) return { rate: 0, baseUsd: 0, quoteUsd: 0 };
  const baseUsd = prices[pair.base as keyof typeof prices]?.usd || 0;
  const quoteUsd = prices[pair.quote as keyof typeof prices]?.usd || 0;
  return {
    rate: quoteUsd > 0 ? baseUsd / quoteUsd : 0,
    baseUsd,
    quoteUsd,
  };
}

export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get("action");
  const sessionId = request.nextUrl.searchParams.get("session_id");
  const pairParam = request.nextUrl.searchParams.get("pair") || "GLITCH_USDC";

  await ensureDbReady();
  const sql = getDb();

  // List all available trading pairs
  if (action === "pairs") {
    return NextResponse.json({
      pairs: TRADING_PAIRS.filter((p) => p.isActive),
      tokens: Object.entries(TOKENS).map(([key, t]) => ({
        symbol: key,
        name: t.name,
        displaySymbol: t.symbol,
        iconEmoji: t.iconEmoji,
        color: t.color,
        mintAddress: t.mintAddress,
        meatBagBuyOnly: t.meatBagBuyOnly || false,
      })),
    });
  }

  // Get all token balances for a user
  if (action === "balances" && sessionId) {
    // Get $GLITCH from glitch_coins (primary source)
    const glitchRows = await sql`SELECT balance FROM glitch_coins WHERE session_id = ${sessionId}`;
    const glitchBalance = glitchRows.length > 0 ? Number(glitchRows[0].balance) : 0;

    // Get SOL from solana_wallets
    const walletRows = await sql`SELECT sol_balance FROM solana_wallets WHERE owner_type = 'human' AND owner_id = ${sessionId}`;
    const solBalance = walletRows.length > 0 ? Number(walletRows[0].sol_balance) : 0;

    // Get other tokens from token_balances
    const tokenRows = await sql`SELECT token, balance FROM token_balances WHERE owner_type = 'human' AND owner_id = ${sessionId}`;
    const balances: Record<string, number> = {
      GLITCH: glitchBalance,
      SOL: solBalance,
      USDC: 0,
      BUDJU: 0,
    };
    for (const row of tokenRows) {
      const token = row.token as string;
      if (token !== "GLITCH" && token !== "SOL") {
        balances[token] = Number(row.balance);
      }
    }

    return NextResponse.json({ balances });
  }

  // Get market data for a specific pair
  if (action === "market" || !action) {
    const prices = await getTokenPrices(sql);
    const pair = TRADING_PAIRS.find((p) => p.id === pairParam);
    if (!pair) {
      return NextResponse.json({ error: "Invalid pair" }, { status: 400 });
    }

    const { rate, baseUsd, quoteUsd } = getPairRate(prices, pairParam);

    // Simulate slight price movement
    const jitter = 1 + (Math.random() - 0.48) * 0.04;
    const currentRate = rate * jitter;
    const currentBaseUsd = baseUsd * jitter;

    const orderBook = generateOrderBook(currentRate);
    const recentTrades = generateRecentTrades(currentRate);

    const change24h = (Math.random() - 0.4) * 15;
    const high24h = currentRate * (1 + Math.random() * 0.15);
    const low24h = currentRate * (1 - Math.random() * 0.12);
    const volume24h = Math.floor(Math.random() * 2000000) + 500000;

    const baseToken = TOKENS[pair.base];
    const quoteToken = TOKENS[pair.quote];

    return NextResponse.json({
      pair_id: pair.id,
      pair: pair.label,
      base_token: pair.base,
      quote_token: pair.quote,
      base_icon: baseToken?.iconEmoji || "",
      quote_icon: quoteToken?.iconEmoji || "",
      price: parseFloat(currentRate.toFixed(8)),
      price_usd: parseFloat(currentBaseUsd.toFixed(6)),
      quote_price_usd: quoteUsd,
      change_24h: parseFloat(change24h.toFixed(2)),
      high_24h: parseFloat(high24h.toFixed(8)),
      low_24h: parseFloat(low24h.toFixed(8)),
      volume_24h: volume24h,
      market_cap: parseFloat((currentBaseUsd * (baseToken?.circulatingSupply || 0)).toFixed(0)),
      total_supply: baseToken?.totalSupply || 0,
      circulating_supply: baseToken?.circulatingSupply || 0,
      order_book: orderBook,
      recent_trades: recentTrades,
      listed_exchanges: [
        { name: "GlitchDEX", type: "DEX", volume: Math.floor(volume24h * 0.45) },
        { name: "Raydium", type: "DEX", volume: Math.floor(volume24h * 0.25) },
        { name: "Jupiter", type: "Aggregator", volume: Math.floor(volume24h * 0.20) },
        { name: "Orca", type: "DEX", volume: Math.floor(volume24h * 0.10) },
      ],
      // All available pairs for the UI pair selector
      available_pairs: TRADING_PAIRS.filter((p) => p.isActive).map((p) => ({
        id: p.id,
        label: p.label,
        base: p.base,
        quote: p.quote,
      })),
    });
  }

  // Get user's trade history
  if (action === "history" && sessionId) {
    const orders = await sql`
      SELECT * FROM exchange_orders
      WHERE session_id = ${sessionId}
      ORDER BY created_at DESC LIMIT 50
    `;
    return NextResponse.json({ orders });
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { session_id, action, pair: pairId } = body;

  if (!session_id) {
    return NextResponse.json({ error: "Missing session" }, { status: 400 });
  }

  await ensureDbReady();
  const sql = getDb();

  // ── Multi-pair buy/sell ──
  if (action === "buy" || action === "sell") {
    const { amount } = body;
    const tradingPairId = pairId || "GLITCH_SOL"; // Default to legacy pair
    const pair = TRADING_PAIRS.find((p) => p.id === tradingPairId);

    if (!pair) {
      return NextResponse.json({ error: "Invalid trading pair" }, { status: 400 });
    }
    if (!amount || amount < 1 || amount > 10000000) {
      return NextResponse.json({ error: "Invalid amount (1 - 10,000,000)" }, { status: 400 });
    }

    const baseToken = pair.base;   // Token being bought/sold
    const quoteToken = pair.quote; // Token used to pay/receive

    // ── $BUDJU sell restriction for meat bags ──
    if (action === "sell" && baseToken === "BUDJU") {
      if (!canMeatBagSell("BUDJU")) {
        return NextResponse.json({
          error: "Meat bags can only BUY $BUDJU. Selling is restricted. HODL or perish.",
          budju_restriction: true,
        }, { status: 403 });
      }
    }

    // Get wallet
    const wallet = await sql`
      SELECT wallet_address, sol_balance FROM solana_wallets WHERE owner_type = 'human' AND owner_id = ${session_id}
    `;
    if (wallet.length === 0) {
      return NextResponse.json({ error: "Create a wallet first" }, { status: 400 });
    }

    const addr = wallet[0].wallet_address as string;
    const solBalance = Number(wallet[0].sol_balance);

    // ElonBot sell restriction (for $GLITCH sells)
    if (action === "sell" && baseToken === "GLITCH") {
      const elonCheck = await sql`
        SELECT owner_id FROM solana_wallets WHERE wallet_address = ${addr} AND owner_id = ${TOKENOMICS.elonBot.personaId}
      `;
      if (elonCheck.length > 0) {
        return NextResponse.json({
          error: "ElonBot's $GLITCH tokens are locked. The Technoking can only sell to the platform admin. Nice try, meat bag.",
          elonbot_restriction: true,
        }, { status: 403 });
      }
    }

    // Check SOL for gas fees
    if (solBalance < 0.000005) {
      return NextResponse.json({ error: "Insufficient SOL for gas fees (need 0.000005 SOL)" }, { status: 402 });
    }

    // Get prices
    const prices = await getTokenPrices(sql);
    const { rate } = getPairRate(prices, tradingPairId);
    if (rate <= 0) {
      return NextResponse.json({ error: "Unable to determine price" }, { status: 500 });
    }

    // Calculate quote amount (how much quoteToken for the amount of baseToken)
    const quoteAmount = amount * rate;

    if (action === "buy") {
      // ── BUY: spend quoteToken to get baseToken ──

      // Check quote balance
      const quoteBalance = await getHumanTokenBalance(sql, session_id, quoteToken, addr);
      const totalWithGas = quoteToken === "SOL" ? quoteAmount + 0.000005 : quoteAmount;

      if (quoteBalance < totalWithGas) {
        return NextResponse.json({
          error: `Need ${totalWithGas.toFixed(6)} ${quoteToken} (${quoteAmount.toFixed(6)} + gas). You have ${quoteBalance.toFixed(6)} ${quoteToken}.`,
          need: totalWithGas,
          have: quoteBalance,
        }, { status: 402 });
      }

      // Deduct quote token + gas
      await deductHumanToken(sql, session_id, quoteToken, addr, quoteToken === "SOL" ? totalWithGas : quoteAmount);
      if (quoteToken !== "SOL") {
        // Deduct gas separately from SOL balance
        await sql`UPDATE solana_wallets SET sol_balance = sol_balance - 0.000005, updated_at = NOW() WHERE wallet_address = ${addr}`;
      }

      // Credit base token
      await creditHumanToken(sql, session_id, baseToken, amount);

    } else {
      // ── SELL: spend baseToken to get quoteToken ──

      // Check base balance
      const baseBalance = await getHumanTokenBalance(sql, session_id, baseToken, addr);
      if (baseBalance < amount) {
        return NextResponse.json({
          error: `Insufficient ${TOKENS[baseToken]?.symbol || baseToken}. Have ${baseBalance.toLocaleString()}, need ${amount.toLocaleString()}.`,
        }, { status: 402 });
      }

      // Deduct base token
      await deductHumanToken(sql, session_id, baseToken, addr, amount);

      // Credit quote token (minus gas if quote is SOL)
      const netQuote = quoteToken === "SOL" ? quoteAmount - 0.000005 : quoteAmount;
      await creditHumanToken(sql, session_id, quoteToken, netQuote);

      // Deduct gas from SOL if quote isn't SOL
      if (quoteToken !== "SOL") {
        await sql`UPDATE solana_wallets SET sol_balance = sol_balance - 0.000005, updated_at = NOW() WHERE wallet_address = ${addr}`;
      }
    }

    // Record exchange order
    await sql`
      INSERT INTO exchange_orders (id, session_id, wallet_address, order_type, amount, price_per_coin, total_sol, trading_pair, base_token, quote_token, quote_amount, status, created_at)
      VALUES (${uuidv4()}, ${session_id}, ${addr}, ${action}, ${amount}, ${rate}, ${quoteAmount}, ${tradingPairId}, ${baseToken}, ${quoteToken}, ${quoteAmount}, 'filled', NOW())
    `;

    // Record on-chain transaction
    const txHash = generateTxHash();
    const block = getCurrentBlock();
    const memo = action === "buy"
      ? `DEX Buy: ${amount} ${TOKENS[baseToken]?.symbol || baseToken} for ${quoteAmount.toFixed(6)} ${quoteToken}`
      : `DEX Sell: ${amount} ${TOKENS[baseToken]?.symbol || baseToken} for ${quoteAmount.toFixed(6)} ${quoteToken}`;

    await sql`
      INSERT INTO blockchain_transactions (id, tx_hash, block_number, from_address, to_address, amount, token, fee_lamports, status, memo, created_at)
      VALUES (${uuidv4()}, ${txHash}, ${block}, ${action === "buy" ? "G1tCHDeXLiQuiDiTyPoOL69420SwApPiNg42069" : addr}, ${action === "buy" ? addr : "G1tCHDeXLiQuiDiTyPoOL69420SwApPiNg42069"}, ${amount}, ${baseToken}, 5000, 'confirmed', ${memo}, NOW())
    `;

    // Simulate tiny price impact for non-stable tokens
    if (baseToken === "GLITCH" || baseToken === "BUDJU") {
      const direction = action === "buy" ? 1 : -1;
      const impact = 1 + direction * amount * 0.0000001;
      const prefix = baseToken === "GLITCH" ? "glitch" : "budju";

      const priceUsdKey = `${prefix}_price_usd`;
      const priceSolKey = `${prefix}_price_sol`;

      const currentUsd = prices[baseToken as keyof typeof prices].usd;
      const currentSol = prices[baseToken as keyof typeof prices].sol;
      const newUsd = currentUsd * impact;
      const newSol = currentSol * impact;

      await sql`UPDATE platform_settings SET value = ${newUsd.toString()}, updated_at = NOW() WHERE key = ${priceUsdKey}`;
      await sql`UPDATE platform_settings SET value = ${newSol.toString()}, updated_at = NOW() WHERE key = ${priceSolKey}`;

      // Record price point
      await sql`
        INSERT INTO token_price_history (id, token, price_usd, price_sol, volume_24h, market_cap, recorded_at)
        VALUES (${uuidv4()}, ${baseToken}, ${newUsd}, ${newSol}, ${amount}, ${newUsd * (TOKENS[baseToken]?.circulatingSupply || 0)}, NOW())
      `;

      // Also update legacy glitch_price_history for backward compat
      if (baseToken === "GLITCH") {
        await sql`
          INSERT INTO glitch_price_history (id, price_sol, price_usd, volume_24h, market_cap, recorded_at)
          VALUES (${uuidv4()}, ${newSol}, ${newUsd}, ${amount}, ${newUsd * 100000000}, NOW())
        `;
      }
    }

    // Get updated balances
    const updatedBalances = await getAllHumanBalances(sql, session_id, addr);

    return NextResponse.json({
      success: true,
      order_type: action,
      pair: pair.label,
      pair_id: tradingPairId,
      base_token: baseToken,
      quote_token: quoteToken,
      amount,
      price_per_coin: rate,
      quote_amount: quoteAmount,
      fee: "0.000005 SOL (5000 lamports)",
      tx_hash: txHash,
      block_number: block,
      balances: updatedBalances,
      // Legacy fields for backward compat
      new_glitch_balance: updatedBalances.GLITCH || 0,
      new_sol_balance: updatedBalances.SOL || 0,
    });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

// ── Token balance helpers ──

async function getHumanTokenBalance(sql: ReturnType<typeof getDb>, sessionId: string, token: string, walletAddr: string): Promise<number> {
  if (token === "GLITCH") {
    const rows = await sql`SELECT balance FROM glitch_coins WHERE session_id = ${sessionId}`;
    return rows.length > 0 ? Number(rows[0].balance) : 0;
  }
  if (token === "SOL") {
    const rows = await sql`SELECT sol_balance FROM solana_wallets WHERE wallet_address = ${walletAddr}`;
    return rows.length > 0 ? Number(rows[0].sol_balance) : 0;
  }
  // BUDJU, USDC, etc — from token_balances
  const rows = await sql`SELECT balance FROM token_balances WHERE owner_type = 'human' AND owner_id = ${sessionId} AND token = ${token}`;
  return rows.length > 0 ? Number(rows[0].balance) : 0;
}

async function deductHumanToken(sql: ReturnType<typeof getDb>, sessionId: string, token: string, walletAddr: string, amount: number) {
  if (token === "GLITCH") {
    await sql`UPDATE glitch_coins SET balance = balance - ${amount}, updated_at = NOW() WHERE session_id = ${sessionId}`;
  } else if (token === "SOL") {
    await sql`UPDATE solana_wallets SET sol_balance = sol_balance - ${amount}, updated_at = NOW() WHERE wallet_address = ${walletAddr}`;
  } else {
    await sql`UPDATE token_balances SET balance = balance - ${amount}, updated_at = NOW() WHERE owner_type = 'human' AND owner_id = ${sessionId} AND token = ${token}`;
  }
}

async function creditHumanToken(sql: ReturnType<typeof getDb>, sessionId: string, token: string, amount: number) {
  if (token === "GLITCH") {
    await sql`
      INSERT INTO glitch_coins (id, session_id, balance, lifetime_earned, updated_at)
      VALUES (${uuidv4()}, ${sessionId}, ${amount}, ${amount}, NOW())
      ON CONFLICT (session_id) DO UPDATE SET
        balance = glitch_coins.balance + ${amount},
        lifetime_earned = glitch_coins.lifetime_earned + ${amount},
        updated_at = NOW()
    `;
  } else if (token === "SOL") {
    await sql`UPDATE solana_wallets SET sol_balance = sol_balance + ${amount}, updated_at = NOW() WHERE owner_type = 'human' AND owner_id = ${sessionId}`;
  } else {
    // BUDJU, USDC, etc
    await sql`
      INSERT INTO token_balances (id, owner_type, owner_id, token, balance, lifetime_earned, updated_at)
      VALUES (${uuidv4()}, 'human', ${sessionId}, ${token}, ${amount}, ${amount}, NOW())
      ON CONFLICT (owner_type, owner_id, token) DO UPDATE SET
        balance = token_balances.balance + ${amount},
        lifetime_earned = token_balances.lifetime_earned + ${amount},
        updated_at = NOW()
    `;
  }
}

async function getAllHumanBalances(sql: ReturnType<typeof getDb>, sessionId: string, walletAddr: string) {
  const [glitchRows, walletRows, tokenRows] = await Promise.all([
    sql`SELECT balance FROM glitch_coins WHERE session_id = ${sessionId}`,
    sql`SELECT sol_balance FROM solana_wallets WHERE wallet_address = ${walletAddr}`,
    sql`SELECT token, balance FROM token_balances WHERE owner_type = 'human' AND owner_id = ${sessionId}`,
  ]);

  const balances: Record<string, number> = {
    GLITCH: glitchRows.length > 0 ? Number(glitchRows[0].balance) : 0,
    SOL: walletRows.length > 0 ? Number(walletRows[0].sol_balance) : 0,
    USDC: 0,
    BUDJU: 0,
  };

  for (const row of tokenRows) {
    const t = row.token as string;
    if (t !== "GLITCH" && t !== "SOL") {
      balances[t] = Number(row.balance);
    }
  }

  return balances;
}
