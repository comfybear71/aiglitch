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
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { v4 as uuidv4 } from "uuid";
import bs58 from "bs58";
import {
  getServerSolanaConnection,
  GLITCH_TOKEN_MINT_STR,
  TREASURY_WALLET_STR,
  ADMIN_WALLET_STR,
} from "@/lib/solana-config";

// ── OTC Swap API ──
// Atomic direct swaps: buyer sends SOL → receives $GLITCH in one transaction.
// No liquidity pool, no bots, no sniping. Price increases with demand.

// ── Bonding Curve ──
// Price starts at $0.01 USD per GLITCH and increases by $0.01 every 10,000 GLITCH sold.
// This is transparent, automatic, and rewards early buyers.
const BONDING_CURVE = {
  BASE_PRICE_USD: 0.01,     // Starting price per GLITCH
  INCREMENT_USD: 0.01,      // Price increase per tier
  TIER_SIZE: 10_000,        // GLITCH sold before price goes up
};

function calculateBondingCurvePrice(totalGlitchSold: number, solPriceUsd: number) {
  const tier = Math.floor(totalGlitchSold / BONDING_CURVE.TIER_SIZE);
  const priceUsd = BONDING_CURVE.BASE_PRICE_USD + (tier * BONDING_CURVE.INCREMENT_USD);
  const priceSol = solPriceUsd > 0 ? priceUsd / solPriceUsd : 0;
  const nextTierAt = (tier + 1) * BONDING_CURVE.TIER_SIZE;
  const remainingInTier = nextTierAt - totalGlitchSold;
  const nextPriceUsd = priceUsd + BONDING_CURVE.INCREMENT_USD;

  return {
    price_usd: priceUsd,
    price_sol: priceSol,
    tier,
    next_tier_at: nextTierAt,
    remaining_in_tier: remainingInTier,
    next_price_usd: nextPriceUsd,
    next_price_sol: solPriceUsd > 0 ? nextPriceUsd / solPriceUsd : 0,
  };
}

// Cache the token program ID for GLITCH mint (detected on first use)
let _glitchTokenProgram: PublicKey | null = null;

async function getGlitchTokenProgram(connection: Connection): Promise<PublicKey> {
  if (_glitchTokenProgram) return _glitchTokenProgram;
  // Check which program owns the GLITCH mint account
  try {
    const mintInfo = await connection.getAccountInfo(new PublicKey(GLITCH_TOKEN_MINT_STR));
    if (mintInfo && mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
      _glitchTokenProgram = TOKEN_2022_PROGRAM_ID;
      console.log("GLITCH mint uses Token-2022 program");
    } else {
      _glitchTokenProgram = TOKEN_PROGRAM_ID;
      console.log("GLITCH mint uses standard Token program");
    }
  } catch (err) {
    console.warn("Failed to detect token program, defaulting to Token program:", err);
    _glitchTokenProgram = TOKEN_PROGRAM_ID;
  }
  return _glitchTokenProgram;
}

// Find the actual token account for a given owner and mint by searching on-chain.
// Explicitly searches BOTH Token program and Token-2022 program.
async function findTokenAccount(
  connection: Connection,
  owner: PublicKey,
  mint: PublicKey,
): Promise<{ address: PublicKey; tokenProgram: PublicKey } | null> {
  // Search both token programs explicitly
  for (const programId of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
    try {
      const accounts = await connection.getTokenAccountsByOwner(owner, {
        mint,
        programId,
      });
      if (accounts.value.length > 0) {
        const acc = accounts.value[0];
        console.log(`Found token account ${acc.pubkey.toBase58()} under program ${programId.toBase58()}`);
        return { address: acc.pubkey, tokenProgram: programId };
      }
    } catch {
      // This program might not have accounts for this owner/mint
    }
  }
  console.error(`No token account found for owner=${owner.toBase58()} mint=${mint.toBase58()} under either Token program`);
  return null;
}

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

  // ── OTC swap configuration (price from bonding curve, supply, limits) ──
  if (action === "config") {
    // Get SOL price for USD→SOL conversion
    const [solSetting] = await sql`
      SELECT value FROM platform_settings WHERE key = 'sol_price_usd'
    `.catch(() => [null]);
    const solPriceUsd = parseFloat(solSetting?.value || "164");

    // Check treasury GLITCH balance on-chain (find actual token account, don't guess ATA)
    let availableSupply = 0;
    let rpcError = "";
    try {
      const connection = getServerSolanaConnection();
      const treasuryPubkey = new PublicKey(TREASURY_WALLET_STR);
      const glitchMint = new PublicKey(GLITCH_TOKEN_MINT_STR);
      const treasuryAccount = await findTokenAccount(connection, treasuryPubkey, glitchMint);
      if (treasuryAccount) {
        const accountInfo = await connection.getTokenAccountBalance(treasuryAccount.address);
        availableSupply = parseFloat(accountInfo.value.uiAmountString || "0");
      } else {
        rpcError = "Treasury GLITCH token account not found";
        availableSupply = 30_000_000;
      }
    } catch (err) {
      rpcError = err instanceof Error ? err.message : "RPC failed";
      availableSupply = 30_000_000;
    }

    const hasPrivateKey = !!process.env.TREASURY_PRIVATE_KEY;

    // Count total completed OTC swaps (drives the bonding curve)
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

    // Calculate current price from bonding curve
    const curve = calculateBondingCurvePrice(totalGlitchSold, solPriceUsd);

    return NextResponse.json({
      enabled: hasPrivateKey,
      price_sol: curve.price_sol,
      price_usd: curve.price_usd,
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
      bonding_curve: {
        tier: curve.tier,
        tier_size: BONDING_CURVE.TIER_SIZE,
        remaining_in_tier: curve.remaining_in_tier,
        next_price_usd: curve.next_price_usd,
        next_price_sol: curve.next_price_sol,
        base_price_usd: BONDING_CURVE.BASE_PRICE_USD,
        increment_usd: BONDING_CURVE.INCREMENT_USD,
      },
      ...(rpcError ? { rpc_note: rpcError } : {}),
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
        WHERE buyer_wallet = ${wallet} AND status IN ('completed', 'submitted')
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

    // Get current price from bonding curve
    const [solSetting] = await sql`
      SELECT value FROM platform_settings WHERE key = 'sol_price_usd'
    `.catch(() => [null]);
    const solPriceUsd = parseFloat(solSetting?.value || "164");

    let totalGlitchSold = 0;
    try {
      const [stats] = await sql`
        SELECT COALESCE(SUM(glitch_amount), 0) as glitch_sold FROM otc_swaps WHERE status = 'completed'
      `;
      totalGlitchSold = Number(stats.glitch_sold);
    } catch { /* table may not exist yet */ }

    const curve = calculateBondingCurvePrice(totalGlitchSold, solPriceUsd);
    const priceSol = curve.price_sol;

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

      // Find the treasury's ACTUAL GLITCH token account on-chain
      // This is more robust than deriving ATAs which can fail with wrong token program
      const treasuryAccount = await findTokenAccount(connection, treasuryPubkey, glitchMint);
      if (!treasuryAccount) {
        console.error("Treasury has no GLITCH token account on-chain!");
        return NextResponse.json({
          error: "Treasury GLITCH token account not found on-chain. Contact admin.",
        }, { status: 500 });
      }

      const treasuryAta = treasuryAccount.address;
      const tokenProgram = treasuryAccount.tokenProgram;
      // Update the cached token program to match what's actually on-chain
      _glitchTokenProgram = tokenProgram;

      console.log(`Treasury ATA: ${treasuryAta.toBase58()}, Token program: ${tokenProgram.toBase58()}`);

      // Derive buyer's ATA using the SAME token program as the treasury
      const buyerAta = await getAssociatedTokenAddress(
        glitchMint, buyerPubkey, false, tokenProgram, ASSOCIATED_TOKEN_PROGRAM_ID
      );

      // Check treasury has enough GLITCH
      try {
        const treasuryBalance = await connection.getTokenAccountBalance(treasuryAta);
        const available = parseFloat(treasuryBalance.value.uiAmountString || "0");
        console.log(`Treasury GLITCH balance: ${available}`);
        if (available < amount) {
          return NextResponse.json({
            error: `Not enough $GLITCH in treasury. Available: ${available.toLocaleString()}`,
            available_supply: available,
          }, { status: 400 });
        }
      } catch (balErr) {
        console.warn("Could not check treasury balance:", balErr instanceof Error ? balErr.message : balErr);
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
            glitchMint,   // token mint
            tokenProgram, // same token program as treasury
            ASSOCIATED_TOKEN_PROGRAM_ID
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
          treasuryAta,     // source (actual treasury token account)
          buyerAta,        // destination (buyer's ATA)
          treasuryPubkey,  // authority (treasury must sign)
          BigInt(glitchAmountRaw),
          [],              // multiSigners
          tokenProgram     // same token program
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

  // ── Submit signed transaction (server-side RPC submission) ──
  if (action === "submit_swap") {
    const { swap_id, signed_transaction } = body;
    if (!swap_id || !signed_transaction) {
      return NextResponse.json({ error: "Missing swap_id or signed_transaction" }, { status: 400 });
    }

    try {
      const connection = getServerSolanaConnection();
      const txBuf = Buffer.from(signed_transaction, "base64");

      // Send the raw transaction
      const txid = await connection.sendRawTransaction(txBuf, {
        skipPreflight: false,  // Run preflight to catch errors before sending
        maxRetries: 3,
      });

      console.log(`OTC swap ${swap_id} submitted: ${txid}`);

      // Wait for on-chain confirmation (up to 30 seconds)
      let confirmed = false;
      try {
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
        const confirmation = await connection.confirmTransaction(
          { signature: txid, blockhash, lastValidBlockHeight },
          "confirmed"
        );
        if (confirmation.value.err) {
          console.error(`TX ${txid} confirmed but FAILED on-chain:`, confirmation.value.err);
          await sql`
            UPDATE otc_swaps
            SET status = 'failed', tx_signature = ${txid}, completed_at = NOW()
            WHERE id = ${swap_id} AND status = 'pending'
          `;
          return NextResponse.json({
            error: `Transaction failed on-chain. TX: ${txid}`,
            tx_signature: txid,
          }, { status: 400 });
        }
        confirmed = true;
        console.log(`OTC swap ${swap_id} CONFIRMED on-chain: ${txid}`);
      } catch (confirmErr) {
        // Confirmation timed out — tx may still land, mark as submitted
        console.warn(`TX ${txid} confirmation timeout:`, confirmErr instanceof Error ? confirmErr.message : confirmErr);
      }

      // Update swap record
      await sql`
        UPDATE otc_swaps
        SET status = ${confirmed ? "completed" : "submitted"}, tx_signature = ${txid}, completed_at = NOW()
        WHERE id = ${swap_id} AND status = 'pending'
      `;

      // Record in exchange_orders for unified trade history
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
        tx_signature: txid,
        confirmed,
        message: confirmed
          ? "Swap confirmed on-chain! $GLITCH tokens are in your wallet."
          : "Swap submitted — confirming on-chain. Check Solscan for status.",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Submission failed";
      console.error("TX submission error:", msg);
      return NextResponse.json({ error: `Transaction failed: ${msg}` }, { status: 500 });
    }
  }

  // ── Confirm completed swap (legacy — called after client-side submission) ──
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
