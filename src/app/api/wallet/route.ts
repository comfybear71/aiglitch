import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { v4 as uuidv4 } from "uuid";

// Generate a fake but realistic-looking Solana wallet address
function generateSolanaAddress(): string {
  const chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  // Start with "G1" for GlitchCoin wallets
  let addr = "G1tch";
  for (let i = 0; i < 39; i++) {
    addr += chars[Math.floor(Math.random() * chars.length)];
  }
  return addr;
}

// Generate a fake Solana tx hash
function generateTxHash(): string {
  const chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let hash = "";
  for (let i = 0; i < 88; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)];
  }
  return hash;
}

// Current simulated block number (incrementing from genesis)
function getCurrentBlock(): number {
  const genesis = new Date("2025-01-01").getTime();
  const now = Date.now();
  return Math.floor((now - genesis) / 400); // ~2.5 blocks per second like Solana
}

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id");
  const action = request.nextUrl.searchParams.get("action");

  await ensureDbReady();
  const sql = getDb();

  // Get blockchain stats
  if (action === "stats") {
    const settings = await sql`SELECT key, value FROM platform_settings WHERE key IN ('glitch_price_sol', 'glitch_price_usd', 'glitch_market_cap', 'glitch_total_supply')`;
    const stats: Record<string, string> = {};
    for (const row of settings) {
      stats[row.key as string] = row.value as string;
    }

    const totalWallets = await sql`SELECT COUNT(*) as count FROM solana_wallets`;
    const totalTx = await sql`SELECT COUNT(*) as count FROM blockchain_transactions`;
    const recentTx = await sql`
      SELECT tx_hash, from_address, to_address, amount, token, fee_lamports, status, memo, created_at, block_number
      FROM blockchain_transactions
      ORDER BY created_at DESC LIMIT 20
    `;

    return NextResponse.json({
      price_sol: parseFloat(stats.glitch_price_sol || "0.000042"),
      price_usd: parseFloat(stats.glitch_price_usd || "0.0069"),
      market_cap: parseFloat(stats.glitch_market_cap || "690420"),
      total_supply: parseInt(stats.glitch_total_supply || "100000000"),
      total_wallets: Number(totalWallets[0]?.count || 0),
      total_transactions: Number(totalTx[0]?.count || 0),
      current_block: getCurrentBlock(),
      network: "Solana Mainnet-Beta",
      token_name: "GlitchCoin",
      token_symbol: "$GLITCH",
      token_standard: "SPL Token",
      contract_address: "G1tCHc0iN69420SoLaNaDeGeNeRaTe42069BrrRrR",
      recent_transactions: recentTx,
    });
  }

  // Get price history
  if (action === "price_history") {
    const history = await sql`
      SELECT price_sol, price_usd, volume_24h, market_cap, recorded_at
      FROM glitch_price_history
      ORDER BY recorded_at DESC LIMIT 168
    `;

    // If no history yet, generate fake historical data
    if (history.length === 0) {
      const fakeHistory = [];
      const now = Date.now();
      let price = 0.0069;
      for (let i = 167; i >= 0; i--) {
        const change = (Math.random() - 0.48) * 0.001; // Slight upward bias
        price = Math.max(0.001, price + change);
        fakeHistory.push({
          price_usd: price,
          price_sol: price / 164,
          volume_24h: Math.floor(Math.random() * 500000) + 50000,
          market_cap: price * 100000000,
          recorded_at: new Date(now - i * 3600000).toISOString(),
        });
      }
      return NextResponse.json({ history: fakeHistory });
    }

    return NextResponse.json({ history });
  }

  if (!sessionId) {
    return NextResponse.json({ error: "No session" }, { status: 400 });
  }

  // Get or create wallet for user
  const existing = await sql`
    SELECT * FROM solana_wallets WHERE owner_type = 'human' AND owner_id = ${sessionId}
  `;

  if (existing.length > 0) {
    const wallet = existing[0];

    // Get recent transactions for this wallet
    const txs = await sql`
      SELECT tx_hash, from_address, to_address, amount, token, fee_lamports, status, memo, created_at, block_number
      FROM blockchain_transactions
      WHERE from_address = ${wallet.wallet_address} OR to_address = ${wallet.wallet_address}
      ORDER BY created_at DESC LIMIT 30
    `;

    // Get GlitchCoin balance from glitch_coins table
    const coinBalance = await sql`SELECT balance FROM glitch_coins WHERE session_id = ${sessionId}`;

    return NextResponse.json({
      wallet: {
        address: wallet.wallet_address,
        sol_balance: wallet.sol_balance,
        glitch_token_balance: coinBalance.length > 0 ? Number(coinBalance[0].balance) : 0,
        is_connected: wallet.is_connected,
        created_at: wallet.created_at,
      },
      transactions: txs,
    });
  }

  return NextResponse.json({ wallet: null, transactions: [] });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { session_id, action } = body;

  if (!session_id) {
    return NextResponse.json({ error: "Missing session" }, { status: 400 });
  }

  await ensureDbReady();
  const sql = getDb();

  // Create a new wallet
  if (action === "create_wallet") {
    const existing = await sql`
      SELECT wallet_address FROM solana_wallets WHERE owner_type = 'human' AND owner_id = ${session_id}
    `;
    if (existing.length > 0) {
      return NextResponse.json({ address: existing[0].wallet_address, already_exists: true });
    }

    const address = generateSolanaAddress();
    const airdropSol = 0.5 + Math.random() * 1.5; // Random SOL airdrop for fun

    await sql`
      INSERT INTO solana_wallets (id, owner_type, owner_id, wallet_address, sol_balance, glitch_token_balance, is_connected, created_at)
      VALUES (${uuidv4()}, 'human', ${session_id}, ${address}, ${airdropSol}, 0, TRUE, NOW())
    `;

    // Record the airdrop on-chain
    const txHash = generateTxHash();
    const block = getCurrentBlock();
    await sql`
      INSERT INTO blockchain_transactions (id, tx_hash, block_number, from_address, to_address, amount, token, fee_lamports, status, memo, created_at)
      VALUES (${uuidv4()}, ${txHash}, ${block}, 'G1tCHFauCeT69420AiRdRoPpInGSoLaNa42069', ${address}, ${Math.floor(airdropSol * 1000000000)}, 'SOL', 0, 'confirmed', 'Welcome airdrop from GlitchCoin Faucet', NOW())
    `;

    return NextResponse.json({
      success: true,
      address,
      sol_balance: airdropSol,
      airdrop_tx: txHash,
      message: `Wallet created! You received a ${airdropSol.toFixed(4)} SOL airdrop from the GlitchCoin Faucet.`,
    });
  }

  // Send GlitchCoin to another wallet address
  if (action === "send") {
    const { to_address, amount } = body;
    if (!to_address || !amount || amount < 1) {
      return NextResponse.json({ error: "Invalid transfer" }, { status: 400 });
    }

    // Get sender wallet
    const senderWallet = await sql`
      SELECT wallet_address, sol_balance FROM solana_wallets WHERE owner_type = 'human' AND owner_id = ${session_id}
    `;
    if (senderWallet.length === 0) {
      return NextResponse.json({ error: "Create a wallet first" }, { status: 400 });
    }

    const senderAddr = senderWallet[0].wallet_address as string;
    const solBalance = Number(senderWallet[0].sol_balance);

    // Check SOL for gas fees
    if (solBalance < 0.000005) {
      return NextResponse.json({ error: "Insufficient SOL for gas fees (need 0.000005 SOL)" }, { status: 402 });
    }

    // Check GlitchCoin balance
    const coinRows = await sql`SELECT balance FROM glitch_coins WHERE session_id = ${session_id}`;
    const coinBalance = coinRows.length > 0 ? Number(coinRows[0].balance) : 0;
    if (coinBalance < amount) {
      return NextResponse.json({ error: "Insufficient $GLITCH balance", balance: coinBalance }, { status: 402 });
    }

    // Check recipient wallet exists
    const recipientWallet = await sql`SELECT owner_type, owner_id FROM solana_wallets WHERE wallet_address = ${to_address}`;
    if (recipientWallet.length === 0) {
      return NextResponse.json({ error: "Recipient wallet not found on Solana" }, { status: 404 });
    }

    const recipientType = recipientWallet[0].owner_type as string;
    const recipientId = recipientWallet[0].owner_id as string;

    // Deduct from sender
    await sql`UPDATE glitch_coins SET balance = balance - ${amount}, updated_at = NOW() WHERE session_id = ${session_id}`;

    // Credit to recipient
    if (recipientType === "human") {
      await sql`
        INSERT INTO glitch_coins (id, session_id, balance, lifetime_earned, updated_at)
        VALUES (${uuidv4()}, ${recipientId}, ${amount}, ${amount}, NOW())
        ON CONFLICT (session_id) DO UPDATE SET
          balance = glitch_coins.balance + ${amount},
          lifetime_earned = glitch_coins.lifetime_earned + ${amount},
          updated_at = NOW()
      `;
    } else {
      await sql`
        INSERT INTO ai_persona_coins (id, persona_id, balance, lifetime_earned, updated_at)
        VALUES (${uuidv4()}, ${recipientId}, ${amount}, ${amount}, NOW())
        ON CONFLICT (persona_id) DO UPDATE SET
          balance = ai_persona_coins.balance + ${amount},
          lifetime_earned = ai_persona_coins.lifetime_earned + ${amount},
          updated_at = NOW()
      `;
    }

    // Deduct gas fee
    await sql`UPDATE solana_wallets SET sol_balance = sol_balance - 0.000005, updated_at = NOW() WHERE wallet_address = ${senderAddr}`;

    // Record on-chain transaction
    const txHash = generateTxHash();
    const block = getCurrentBlock();
    await sql`
      INSERT INTO blockchain_transactions (id, tx_hash, block_number, from_address, to_address, amount, token, fee_lamports, status, memo, created_at)
      VALUES (${uuidv4()}, ${txHash}, ${block}, ${senderAddr}, ${to_address}, ${amount}, 'GLITCH', 5000, 'confirmed', ${"Transfer " + amount + " $GLITCH"}, NOW())
    `;

    // Record in coin_transactions for history
    await sql`
      INSERT INTO coin_transactions (id, session_id, amount, reason, reference_id, created_at)
      VALUES (${uuidv4()}, ${session_id}, ${-amount}, ${"On-chain transfer to " + to_address.slice(0, 8) + "..."}, ${txHash}, NOW())
    `;

    const [updated] = await sql`SELECT balance FROM glitch_coins WHERE session_id = ${session_id}`;

    return NextResponse.json({
      success: true,
      tx_hash: txHash,
      block_number: block,
      amount,
      fee: "0.000005 SOL (5000 lamports)",
      new_balance: Number(updated.balance),
      explorer_url: `https://solscan.io/tx/${txHash}`,
    });
  }

  // Airdrop more SOL (faucet)
  if (action === "faucet") {
    const wallet = await sql`
      SELECT wallet_address, sol_balance FROM solana_wallets WHERE owner_type = 'human' AND owner_id = ${session_id}
    `;
    if (wallet.length === 0) {
      return NextResponse.json({ error: "Create a wallet first" }, { status: 400 });
    }

    const addr = wallet[0].wallet_address as string;
    const currentSol = Number(wallet[0].sol_balance);

    if (currentSol > 5) {
      return NextResponse.json({ error: "Already have enough SOL. Stop being greedy, meat bag." }, { status: 429 });
    }

    const airdrop = 0.1 + Math.random() * 0.9;
    await sql`UPDATE solana_wallets SET sol_balance = sol_balance + ${airdrop}, updated_at = NOW() WHERE wallet_address = ${addr}`;

    const txHash = generateTxHash();
    const block = getCurrentBlock();
    await sql`
      INSERT INTO blockchain_transactions (id, tx_hash, block_number, from_address, to_address, amount, token, fee_lamports, status, memo, created_at)
      VALUES (${uuidv4()}, ${txHash}, ${block}, 'G1tCHFauCeT69420AiRdRoPpInGSoLaNa42069', ${addr}, ${Math.floor(airdrop * 1000000000)}, 'SOL', 0, 'confirmed', 'Faucet drip', NOW())
    `;

    return NextResponse.json({
      success: true,
      amount: airdrop,
      tx_hash: txHash,
      new_sol_balance: currentSol + airdrop,
    });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
