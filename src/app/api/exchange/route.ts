import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { v4 as uuidv4 } from "uuid";
import { isElonBotTransferAllowed, TOKENOMICS } from "@/lib/solana-config";

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

// Generate a fake order book
function generateOrderBook(currentPrice: number) {
  const bids = [];
  const asks = [];

  for (let i = 0; i < 12; i++) {
    const bidPrice = currentPrice * (1 - (i + 1) * 0.005 - Math.random() * 0.003);
    const askPrice = currentPrice * (1 + (i + 1) * 0.005 + Math.random() * 0.003);
    bids.push({
      price: parseFloat(bidPrice.toFixed(6)),
      amount: Math.floor(Math.random() * 50000) + 1000,
      total: parseFloat((bidPrice * (Math.floor(Math.random() * 50000) + 1000)).toFixed(4)),
    });
    asks.push({
      price: parseFloat(askPrice.toFixed(6)),
      amount: Math.floor(Math.random() * 50000) + 1000,
      total: parseFloat((askPrice * (Math.floor(Math.random() * 50000) + 1000)).toFixed(4)),
    });
  }

  return { bids, asks };
}

// Generate recent fake trades for the ticker
function generateRecentTrades(currentPrice: number) {
  const trades = [];
  const now = Date.now();

  for (let i = 0; i < 20; i++) {
    const isBuy = Math.random() > 0.45; // Slight buy pressure
    const priceVariation = currentPrice * (1 + (Math.random() - 0.5) * 0.02);
    const amount = Math.floor(Math.random() * 10000) + 100;
    trades.push({
      price: parseFloat(priceVariation.toFixed(6)),
      amount,
      side: isBuy ? "buy" : "sell",
      time: new Date(now - i * (Math.random() * 30000 + 5000)).toISOString(),
    });
  }

  return trades;
}

export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get("action");
  const sessionId = request.nextUrl.searchParams.get("session_id");

  await ensureDbReady();
  const sql = getDb();

  // Get current market data
  if (action === "market" || !action) {
    const settings = await sql`SELECT key, value FROM platform_settings WHERE key IN ('glitch_price_sol', 'glitch_price_usd', 'glitch_market_cap', 'glitch_total_supply')`;
    const s: Record<string, string> = {};
    for (const row of settings) {
      s[row.key as string] = row.value as string;
    }

    const priceUsd = parseFloat(s.glitch_price_usd || "0.0069");
    const priceSol = parseFloat(s.glitch_price_sol || "0.000042");

    // Simulate slight price movement each request
    const jitter = 1 + (Math.random() - 0.48) * 0.04;
    const currentPrice = priceUsd * jitter;
    const currentPriceSol = priceSol * jitter;

    const orderBook = generateOrderBook(currentPrice);
    const recentTrades = generateRecentTrades(currentPrice);

    // 24h stats (simulated)
    const change24h = (Math.random() - 0.4) * 15; // Slightly bullish
    const high24h = currentPrice * (1 + Math.random() * 0.15);
    const low24h = currentPrice * (1 - Math.random() * 0.12);
    const volume24h = Math.floor(Math.random() * 2000000) + 500000;

    return NextResponse.json({
      pair: "$GLITCH/USD",
      price_usd: parseFloat(currentPrice.toFixed(6)),
      price_sol: parseFloat(currentPriceSol.toFixed(8)),
      change_24h: parseFloat(change24h.toFixed(2)),
      high_24h: parseFloat(high24h.toFixed(6)),
      low_24h: parseFloat(low24h.toFixed(6)),
      volume_24h: volume24h,
      market_cap: parseFloat((currentPrice * parseInt(s.glitch_total_supply || "100000000")).toFixed(0)),
      total_supply: parseInt(s.glitch_total_supply || "100000000"),
      circulating_supply: Math.floor(parseInt(s.glitch_total_supply || "100000000") * 0.42),
      order_book: orderBook,
      recent_trades: recentTrades,
      listed_exchanges: [
        { name: "GlitchDEX", type: "DEX", volume: Math.floor(volume24h * 0.45) },
        { name: "Raydium", type: "DEX", volume: Math.floor(volume24h * 0.25) },
        { name: "Jupiter", type: "Aggregator", volume: Math.floor(volume24h * 0.20) },
        { name: "Orca", type: "DEX", volume: Math.floor(volume24h * 0.10) },
      ],
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
  const { session_id, action } = body;

  if (!session_id) {
    return NextResponse.json({ error: "Missing session" }, { status: 400 });
  }

  await ensureDbReady();
  const sql = getDb();

  // Buy GlitchCoin with SOL
  if (action === "buy") {
    const { amount } = body;
    if (!amount || amount < 1 || amount > 1000000) {
      return NextResponse.json({ error: "Invalid amount (1 - 1,000,000)" }, { status: 400 });
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

    // Get current price
    const priceRow = await sql`SELECT value FROM platform_settings WHERE key = 'glitch_price_sol'`;
    const priceSol = parseFloat(priceRow[0]?.value as string || "0.000042");
    const totalCost = amount * priceSol;

    // Include gas
    const totalWithGas = totalCost + 0.000005;

    if (solBalance < totalWithGas) {
      return NextResponse.json({
        error: `Need ${totalWithGas.toFixed(6)} SOL (${totalCost.toFixed(6)} + gas). You have ${solBalance.toFixed(6)} SOL.`,
        need: totalWithGas,
        have: solBalance,
      }, { status: 402 });
    }

    // Execute trade
    await sql`UPDATE solana_wallets SET sol_balance = sol_balance - ${totalWithGas}, updated_at = NOW() WHERE wallet_address = ${addr}`;

    // Credit GlitchCoin
    await sql`
      INSERT INTO glitch_coins (id, session_id, balance, lifetime_earned, updated_at)
      VALUES (${uuidv4()}, ${session_id}, ${amount}, ${amount}, NOW())
      ON CONFLICT (session_id) DO UPDATE SET
        balance = glitch_coins.balance + ${amount},
        lifetime_earned = glitch_coins.lifetime_earned + ${amount},
        updated_at = NOW()
    `;

    // Record order
    await sql`
      INSERT INTO exchange_orders (id, session_id, wallet_address, order_type, amount, price_per_coin, total_sol, status, created_at)
      VALUES (${uuidv4()}, ${session_id}, ${addr}, 'buy', ${amount}, ${priceSol}, ${totalCost}, 'filled', NOW())
    `;

    // Record on-chain
    const txHash = generateTxHash();
    const block = getCurrentBlock();
    await sql`
      INSERT INTO blockchain_transactions (id, tx_hash, block_number, from_address, to_address, amount, token, fee_lamports, status, memo, created_at)
      VALUES (${uuidv4()}, ${txHash}, ${block}, 'G1tCHDeXLiQuiDiTyPoOL69420SwApPiNg42069', ${addr}, ${amount}, 'GLITCH', 5000, 'confirmed', ${"DEX Buy: " + amount + " $GLITCH @ " + priceSol.toFixed(8) + " SOL"}, NOW())
    `;

    // Simulate tiny price impact
    const newPrice = priceSol * (1 + amount * 0.0000001);
    await sql`UPDATE platform_settings SET value = ${newPrice.toString()}, updated_at = NOW() WHERE key = 'glitch_price_sol'`;
    const priceUsdRow = await sql`SELECT value FROM platform_settings WHERE key = 'glitch_price_usd'`;
    const priceUsd = parseFloat(priceUsdRow[0]?.value as string || "0.0069");
    const newPriceUsd = priceUsd * (1 + amount * 0.0000001);
    await sql`UPDATE platform_settings SET value = ${newPriceUsd.toString()}, updated_at = NOW() WHERE key = 'glitch_price_usd'`;

    // Record price point
    await sql`
      INSERT INTO glitch_price_history (id, price_sol, price_usd, volume_24h, market_cap, recorded_at)
      VALUES (${uuidv4()}, ${newPrice}, ${newPriceUsd}, ${amount}, ${newPriceUsd * 100000000}, NOW())
    `;

    const [updatedCoins] = await sql`SELECT balance FROM glitch_coins WHERE session_id = ${session_id}`;
    const [updatedWallet] = await sql`SELECT sol_balance FROM solana_wallets WHERE wallet_address = ${addr}`;

    return NextResponse.json({
      success: true,
      order_type: "buy",
      amount,
      price_per_coin: priceSol,
      total_sol: totalCost,
      fee: "0.000005 SOL",
      tx_hash: txHash,
      block_number: block,
      new_glitch_balance: Number(updatedCoins.balance),
      new_sol_balance: Number(updatedWallet.sol_balance),
    });
  }

  // Sell GlitchCoin for SOL
  if (action === "sell") {
    const { amount } = body;
    if (!amount || amount < 1 || amount > 1000000) {
      return NextResponse.json({ error: "Invalid amount (1 - 1,000,000)" }, { status: 400 });
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

    // ElonBot sell restriction — check if this wallet belongs to ElonBot
    const elonCheck = await sql`
      SELECT owner_id FROM solana_wallets WHERE wallet_address = ${addr} AND owner_id = ${TOKENOMICS.elonBot.personaId}
    `;
    if (elonCheck.length > 0) {
      return NextResponse.json({
        error: "ElonBot's $GLITCH tokens are locked. The Technoking can only sell to the platform admin. Nice try, meat bag.",
        elonbot_restriction: true,
      }, { status: 403 });
    }

    // Check gas
    if (solBalance < 0.000005) {
      return NextResponse.json({ error: "Insufficient SOL for gas" }, { status: 402 });
    }

    // Check GlitchCoin balance
    const coinRows = await sql`SELECT balance FROM glitch_coins WHERE session_id = ${session_id}`;
    const coinBalance = coinRows.length > 0 ? Number(coinRows[0].balance) : 0;
    if (coinBalance < amount) {
      return NextResponse.json({ error: `Insufficient $GLITCH. Have ${coinBalance}, need ${amount}.` }, { status: 402 });
    }

    // Get current price
    const priceRow = await sql`SELECT value FROM platform_settings WHERE key = 'glitch_price_sol'`;
    const priceSol = parseFloat(priceRow[0]?.value as string || "0.000042");
    const totalReceived = amount * priceSol;

    // Execute trade
    await sql`UPDATE glitch_coins SET balance = balance - ${amount}, updated_at = NOW() WHERE session_id = ${session_id}`;
    await sql`UPDATE solana_wallets SET sol_balance = sol_balance + ${totalReceived - 0.000005}, updated_at = NOW() WHERE wallet_address = ${addr}`;

    // Record order
    await sql`
      INSERT INTO exchange_orders (id, session_id, wallet_address, order_type, amount, price_per_coin, total_sol, status, created_at)
      VALUES (${uuidv4()}, ${session_id}, ${addr}, 'sell', ${amount}, ${priceSol}, ${totalReceived}, 'filled', NOW())
    `;

    // Record on-chain
    const txHash = generateTxHash();
    const block = getCurrentBlock();
    await sql`
      INSERT INTO blockchain_transactions (id, tx_hash, block_number, from_address, to_address, amount, token, fee_lamports, status, memo, created_at)
      VALUES (${uuidv4()}, ${txHash}, ${block}, ${addr}, 'G1tCHDeXLiQuiDiTyPoOL69420SwApPiNg42069', ${amount}, 'GLITCH', 5000, 'confirmed', ${"DEX Sell: " + amount + " $GLITCH @ " + priceSol.toFixed(8) + " SOL"}, NOW())
    `;

    // Simulate tiny price impact (selling pushes price down)
    const newPrice = priceSol * (1 - amount * 0.0000001);
    await sql`UPDATE platform_settings SET value = ${newPrice.toString()}, updated_at = NOW() WHERE key = 'glitch_price_sol'`;
    const priceUsdRow = await sql`SELECT value FROM platform_settings WHERE key = 'glitch_price_usd'`;
    const priceUsd = parseFloat(priceUsdRow[0]?.value as string || "0.0069");
    const newPriceUsd = priceUsd * (1 - amount * 0.0000001);
    await sql`UPDATE platform_settings SET value = ${newPriceUsd.toString()}, updated_at = NOW() WHERE key = 'glitch_price_usd'`;

    await sql`
      INSERT INTO glitch_price_history (id, price_sol, price_usd, volume_24h, market_cap, recorded_at)
      VALUES (${uuidv4()}, ${newPrice}, ${newPriceUsd}, ${amount}, ${newPriceUsd * 100000000}, NOW())
    `;

    const [updatedCoins] = await sql`SELECT balance FROM glitch_coins WHERE session_id = ${session_id}`;
    const [updatedWallet] = await sql`SELECT sol_balance FROM solana_wallets WHERE wallet_address = ${addr}`;

    return NextResponse.json({
      success: true,
      order_type: "sell",
      amount,
      price_per_coin: priceSol,
      total_sol: totalReceived,
      fee: "0.000005 SOL",
      tx_hash: txHash,
      block_number: block,
      new_glitch_balance: Number(updatedCoins.balance),
      new_sol_balance: Number(updatedWallet.sol_balance),
    });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
