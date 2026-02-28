import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  Keypair,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { v4 as uuidv4 } from "uuid";
import {
  getServerSolanaConnection,
  GLITCH_TOKEN_MINT_STR,
  TREASURY_WALLET_STR,
  ADMIN_WALLET_STR,
} from "@/lib/solana-config";

// ── OTC Swap API ──
// Atomic direct swaps: buyer sends SOL → receives $GLITCH in one transaction.
// No liquidity pool, no bots, no sniping. You set the price.

// Parse treasury private key from env (supports JSON array and base58)
function getTreasuryKeypair(): Keypair | null {
  const keyStr = process.env.TREASURY_PRIVATE_KEY;
  if (!keyStr) return null;
  try {
    const trimmed = keyStr.trim();
    if (trimmed.startsWith("[")) {
      // JSON array format from solana-keygen: [1,2,3,...,64]
      const arr = JSON.parse(trimmed);
      return Keypair.fromSecretKey(Uint8Array.from(arr));
    }
    // Base58 format from Phantom wallet export
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const bs58 = require("bs58");
    return Keypair.fromSecretKey(bs58.decode(trimmed));
  } catch (err) {
    console.error("Failed to parse TREASURY_PRIVATE_KEY:", err);
    return null;
  }
}

// Simple in-memory rate limiter per wallet (5 swaps/minute)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(wallet: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(wallet);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(wallet, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (entry.count >= 5) return false;
  entry.count++;
  return true;
}

export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get("action");

  await ensureDbReady();
  const sql = getDb();

  // ── OTC swap configuration (price, supply, limits) ──
  if (action === "config") {
    const priceSettings = await sql`
      SELECT key, value FROM platform_settings
      WHERE key IN ('otc_glitch_price_sol', 'glitch_price_sol', 'sol_price_usd')
    `;
    const settings: Record<string, string> = {};
    for (const row of priceSettings) {
      settings[row.key as string] = row.value as string;
    }

    const priceSol = parseFloat(
      settings.otc_glitch_price_sol || "0.0000667"
    );
    const solPriceUsd = parseFloat(settings.sol_price_usd || "164");
    const priceUsd = priceSol * solPriceUsd;

    // Check treasury GLITCH balance on-chain
    let availableSupply = 0;
    try {
      const connection = getServerSolanaConnection();
      const treasuryPubkey = new PublicKey(TREASURY_WALLET_STR);
      const glitchMint = new PublicKey(GLITCH_TOKEN_MINT_STR);
      const treasuryAta = await getAssociatedTokenAddress(glitchMint, treasuryPubkey);
      const accountInfo = await connection.getTokenAccountBalance(treasuryAta);
      availableSupply = parseFloat(accountInfo.value.uiAmountString || "0");
    } catch {
      availableSupply = 0;
    }

    const hasPrivateKey = !!process.env.TREASURY_PRIVATE_KEY;

    // Count total completed OTC swaps
    let totalSwaps = 0;
    let totalGlitchSold = 0;
    let totalSolReceived = 0;
    try {
      const [stats] = await sql`
        SELECT COUNT(*) as total, COALESCE(SUM(glitch_amount), 0) as glitch_sold, COALESCE(SUM(sol_cost), 0) as sol_received
        FROM otc_swaps WHERE status = 'completed'
      `;
      totalSwaps = Number(stats.total);
      totalGlitchSold = Number(stats.glitch_sold);
      totalSolReceived = Number(stats.sol_received);
    } catch {
      // Table may not exist yet — that's fine
    }

    return NextResponse.json({
      enabled: hasPrivateKey && availableSupply > 0,
      price_sol: priceSol,
      price_usd: priceUsd,
      sol_price_usd: solPriceUsd,
      available_supply: availableSupply,
      min_purchase: 100,
      max_purchase: 1_000_000,
      treasury_wallet: TREASURY_WALLET_STR,
      token_mint: GLITCH_TOKEN_MINT_STR,
      stats: {
        total_swaps: totalSwaps,
        total_glitch_sold: totalGlitchSold,
        total_sol_received: totalSolReceived,
      },
    });
  }

  // ── OTC swap history for a wallet ──
  if (action === "history") {
    const wallet = request.nextUrl.searchParams.get("wallet");
    if (!wallet) {
      return NextResponse.json({ error: "Missing wallet parameter" }, { status: 400 });
    }
    try {
      const swaps = await sql`
        SELECT id, glitch_amount, sol_cost, price_per_glitch, tx_signature, status, created_at, completed_at
        FROM otc_swaps
        WHERE buyer_wallet = ${wallet} AND status = 'completed'
        ORDER BY created_at DESC LIMIT 50
      `;
      return NextResponse.json({ swaps });
    } catch {
      return NextResponse.json({ swaps: [] });
    }
  }

  return NextResponse.json({ error: "Invalid action. Use ?action=config or ?action=history&wallet=..." }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action } = body;

  await ensureDbReady();
  const sql = getDb();

  // ── Create atomic OTC swap transaction ──
  if (action === "create_swap") {
    const { buyer_wallet, glitch_amount } = body;

    if (!buyer_wallet || !glitch_amount) {
      return NextResponse.json({ error: "Missing buyer_wallet or glitch_amount" }, { status: 400 });
    }

    // Validate wallet address
    let buyerPubkey: PublicKey;
    try {
      buyerPubkey = new PublicKey(buyer_wallet);
    } catch {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
    }

    // Validate amount
    const amount = parseFloat(glitch_amount);
    if (isNaN(amount) || amount < 100) {
      return NextResponse.json({ error: "Minimum purchase is 100 $GLITCH" }, { status: 400 });
    }
    if (amount > 1_000_000) {
      return NextResponse.json({ error: "Maximum purchase is 1,000,000 $GLITCH per swap" }, { status: 400 });
    }

    // Rate limit
    if (!checkRateLimit(buyer_wallet)) {
      return NextResponse.json({ error: "Too many swap requests. Wait a moment." }, { status: 429 });
    }

    // Get treasury keypair
    const treasuryKeypair = getTreasuryKeypair();
    if (!treasuryKeypair) {
      return NextResponse.json({
        error: "OTC swaps not available yet. Treasury key not configured.",
        setup_needed: true,
      }, { status: 503 });
    }

    // Verify keypair matches expected treasury address
    if (treasuryKeypair.publicKey.toBase58() !== TREASURY_WALLET_STR) {
      console.error(
        "Treasury keypair mismatch! Expected:",
        TREASURY_WALLET_STR,
        "Got:",
        treasuryKeypair.publicKey.toBase58()
      );
      return NextResponse.json({ error: "Treasury configuration error" }, { status: 500 });
    }

    // Get current OTC price
    const priceSettings = await sql`
      SELECT key, value FROM platform_settings
      WHERE key IN ('otc_glitch_price_sol', 'glitch_price_sol')
    `;
    const settings: Record<string, string> = {};
    for (const row of priceSettings) {
      settings[row.key as string] = row.value as string;
    }
    const priceSol = parseFloat(
      settings.otc_glitch_price_sol || "0.0000667"
    );

    // Calculate SOL cost
    const solCost = amount * priceSol;
    const solCostLamports = Math.ceil(solCost * LAMPORTS_PER_SOL);
    const glitchAmountRaw = Math.floor(amount * 1e9); // 9 decimals

    if (solCostLamports < 1000) {
      return NextResponse.json({ error: "Order too small" }, { status: 400 });
    }

    try {
      const connection = getServerSolanaConnection();
      const glitchMint = new PublicKey(GLITCH_TOKEN_MINT_STR);
      const treasuryPubkey = treasuryKeypair.publicKey;

      // Get associated token accounts
      const treasuryAta = await getAssociatedTokenAddress(glitchMint, treasuryPubkey);
      const buyerAta = await getAssociatedTokenAddress(glitchMint, buyerPubkey);

      // Check treasury has enough GLITCH
      const treasuryBalance = await connection.getTokenAccountBalance(treasuryAta);
      const available = parseFloat(treasuryBalance.value.uiAmountString || "0");
      if (available < amount) {
        return NextResponse.json({
          error: `Not enough $GLITCH in treasury. Available: ${available.toLocaleString()}`,
          available_supply: available,
        }, { status: 400 });
      }

      // Build the atomic swap transaction
      const tx = new Transaction();

      // Step 1: Create buyer's GLITCH token account if it doesn't exist
      const buyerAtaInfo = await connection.getAccountInfo(buyerAta);
      if (!buyerAtaInfo) {
        tx.add(
          createAssociatedTokenAccountInstruction(
            buyerPubkey,  // payer (buyer pays rent)
            buyerAta,     // ATA address
            buyerPubkey,  // owner
            glitchMint    // token mint
          )
        );
      }

      // Step 2: Buyer sends SOL to treasury
      tx.add(
        SystemProgram.transfer({
          fromPubkey: buyerPubkey,
          toPubkey: treasuryPubkey,
          lamports: solCostLamports,
        })
      );

      // Step 3: Treasury sends GLITCH to buyer
      tx.add(
        createTransferInstruction(
          treasuryAta,     // source (treasury's GLITCH ATA)
          buyerAta,        // destination (buyer's GLITCH ATA)
          treasuryPubkey,  // authority (treasury must sign)
          BigInt(glitchAmountRaw)
        )
      );

      // Set blockhash and fee payer
      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = buyerPubkey; // buyer pays transaction fees

      // Treasury partially signs (authorizes the GLITCH transfer)
      tx.partialSign(treasuryKeypair);

      // Record the pending swap
      const swapId = uuidv4();
      await sql`
        INSERT INTO otc_swaps (id, buyer_wallet, glitch_amount, sol_cost, price_per_glitch, status, blockhash, created_at)
        VALUES (${swapId}, ${buyer_wallet}, ${amount}, ${solCost}, ${priceSol}, 'pending', ${blockhash}, NOW())
      `;

      // Serialize (buyer hasn't signed yet)
      const serialized = tx.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });

      return NextResponse.json({
        success: true,
        swap_id: swapId,
        transaction: serialized.toString("base64"),
        glitch_amount: amount,
        sol_cost: solCost,
        price_per_glitch: priceSol,
        expires_at: new Date(Date.now() + 120000).toISOString(),
      });
    } catch (err) {
      console.error("OTC swap creation error:", err);
      const msg = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json({ error: `Swap failed: ${msg}` }, { status: 500 });
    }
  }

  // ── Confirm completed swap (called after on-chain confirmation) ──
  if (action === "confirm_swap") {
    const { swap_id, tx_signature } = body;
    if (!swap_id || !tx_signature) {
      return NextResponse.json({ error: "Missing swap_id or tx_signature" }, { status: 400 });
    }

    await sql`
      UPDATE otc_swaps
      SET status = 'completed', tx_signature = ${tx_signature}, completed_at = NOW()
      WHERE id = ${swap_id} AND status = 'pending'
    `;

    // Also record in exchange_orders for unified trade history
    try {
      const [swap] = await sql`SELECT * FROM otc_swaps WHERE id = ${swap_id}`;
      if (swap) {
        const orderId = uuidv4();
        await sql`
          INSERT INTO exchange_orders (id, session_id, wallet_address, order_type, amount, price_per_coin, total_sol, trading_pair, base_token, quote_token, quote_amount, status, created_at)
          VALUES (${orderId}, ${swap.buyer_wallet}, ${swap.buyer_wallet}, 'buy', ${swap.glitch_amount}, ${swap.price_per_glitch}, ${swap.sol_cost}, 'GLITCH_SOL', 'GLITCH', 'SOL', ${swap.sol_cost}, 'filled', NOW())
        `;
      }
    } catch {
      // Non-critical — swap still completed
    }

    return NextResponse.json({
      success: true,
      swap_id,
      tx_signature,
      message: "Swap confirmed! $GLITCH tokens are in your wallet.",
    });
  }

  // ── Admin: Set OTC price ──
  if (action === "set_price") {
    const { price_sol, admin_wallet } = body;
    if (admin_wallet !== ADMIN_WALLET_STR) {
      return NextResponse.json({ error: "Unauthorized. Admin wallet required." }, { status: 403 });
    }
    const newPrice = parseFloat(price_sol);
    if (!newPrice || newPrice <= 0) {
      return NextResponse.json({ error: "Invalid price" }, { status: 400 });
    }

    await sql`
      INSERT INTO platform_settings (key, value, updated_at)
      VALUES ('otc_glitch_price_sol', ${String(newPrice)}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = ${String(newPrice)}, updated_at = NOW()
    `;

    return NextResponse.json({
      success: true,
      new_price_sol: newPrice,
      message: `OTC price updated to ${newPrice} SOL per $GLITCH`,
    });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
