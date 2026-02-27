import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { v4 as uuidv4 } from "uuid";
import { PublicKey } from "@solana/web3.js";
import {
  isRealSolanaMode,
  GLITCH_TOKEN_MINT_STR,
  TREASURY_WALLET_STR,
} from "@/lib/solana-config";

// ── $GLITCH Bridge API ──
// Allows meatbags to claim real on-chain $GLITCH tokens based on their snapshot balance.
// Flow: snapshot balance → connect Phantom → claim → treasury sends real tokens

export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get("action");
  const sessionId = request.nextUrl.searchParams.get("session_id");

  await ensureDbReady();
  const sql = getDb();

  // Check bridge status for a specific user
  if (action === "status" && sessionId) {
    // Get latest finalized snapshot
    const [latestSnapshot] = await sql`
      SELECT id, name, created_at FROM glitch_snapshots
      WHERE status = 'finalized'
      ORDER BY created_at DESC LIMIT 1
    `;

    if (!latestSnapshot) {
      return NextResponse.json({
        bridge_active: false,
        message: "No snapshot available yet. All $GLITCH is real from day one.",
      });
    }

    // Get user's snapshot entry
    const [entry] = await sql`
      SELECT * FROM glitch_snapshot_entries
      WHERE snapshot_id = ${latestSnapshot.id}
        AND holder_type = 'human'
        AND holder_id = ${sessionId}
    `;

    // Get user's current Phantom wallet
    const [user] = await sql`
      SELECT phantom_wallet_address, display_name FROM human_users
      WHERE session_id = ${sessionId}
    `;

    // Get current balance
    const [currentBalance] = await sql`
      SELECT balance FROM glitch_coins WHERE session_id = ${sessionId}
    `;

    // Get existing claim
    const claims = await sql`
      SELECT * FROM bridge_claims
      WHERE session_id = ${sessionId}
      ORDER BY created_at DESC LIMIT 1
    `;

    return NextResponse.json({
      bridge_active: true,
      snapshot: {
        id: latestSnapshot.id,
        name: latestSnapshot.name,
        taken_at: latestSnapshot.created_at,
      },
      snapshot_balance: entry ? Number(entry.balance) : 0,
      current_balance: currentBalance ? Number(currentBalance.balance) : 0,
      phantom_wallet: user?.phantom_wallet_address || null,
      claim_status: entry?.claim_status || "no_balance",
      claim: claims.length > 0 ? {
        id: claims[0].id,
        status: claims[0].status,
        amount: Number(claims[0].amount),
        tx_signature: claims[0].tx_signature,
        created_at: claims[0].created_at,
        completed_at: claims[0].completed_at,
        error: claims[0].error_message,
      } : null,
      token_mint: GLITCH_TOKEN_MINT_STR,
      treasury_wallet: TREASURY_WALLET_STR,
      real_mode: isRealSolanaMode(),
    });
  }

  // Bridge overview stats
  if (action === "overview") {
    const [latestSnapshot] = await sql`
      SELECT * FROM glitch_snapshots
      WHERE status = 'finalized'
      ORDER BY created_at DESC LIMIT 1
    `;

    if (!latestSnapshot) {
      return NextResponse.json({ bridge_active: false });
    }

    const [stats] = await sql`
      SELECT
        COUNT(*) as total_entries,
        COUNT(*) FILTER (WHERE holder_type = 'human') as human_entries,
        COUNT(*) FILTER (WHERE holder_type = 'ai_persona') as ai_entries,
        COUNT(*) FILTER (WHERE phantom_wallet IS NOT NULL) as with_wallet,
        COUNT(*) FILTER (WHERE claim_status = 'claimed') as claimed,
        COUNT(*) FILTER (WHERE claim_status = 'pending') as pending,
        SUM(balance) as total_supply,
        SUM(balance) FILTER (WHERE claim_status = 'claimed') as claimed_supply
      FROM glitch_snapshot_entries
      WHERE snapshot_id = ${latestSnapshot.id}
    `;

    return NextResponse.json({
      bridge_active: true,
      snapshot: latestSnapshot,
      stats: {
        total_entries: Number(stats.total_entries),
        human_entries: Number(stats.human_entries),
        ai_entries: Number(stats.ai_entries),
        with_wallet: Number(stats.with_wallet),
        claimed: Number(stats.claimed),
        pending: Number(stats.pending),
        total_supply: Number(stats.total_supply),
        claimed_supply: Number(stats.claimed_supply),
      },
    });
  }

  return NextResponse.json({ error: "Invalid action. Use ?action=status&session_id=... or ?action=overview" }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { session_id, action } = body;

  if (!session_id) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
  }

  await ensureDbReady();
  const sql = getDb();

  // ── Claim real $GLITCH tokens from snapshot balance ──
  if (action === "claim") {
    const { wallet_address } = body;

    if (!wallet_address) {
      return NextResponse.json({
        error: "Connect your Phantom wallet first, meat bag.",
      }, { status: 400 });
    }

    // Validate wallet address
    try {
      new PublicKey(wallet_address);
    } catch {
      return NextResponse.json({ error: "Invalid Solana wallet address" }, { status: 400 });
    }

    // Get latest finalized snapshot
    const [snapshot] = await sql`
      SELECT id FROM glitch_snapshots
      WHERE status = 'finalized'
      ORDER BY created_at DESC LIMIT 1
    `;

    if (!snapshot) {
      return NextResponse.json({
        error: "No snapshot available. Your $GLITCH is already real.",
      }, { status: 404 });
    }

    // Get user's snapshot entry
    const [entry] = await sql`
      SELECT * FROM glitch_snapshot_entries
      WHERE snapshot_id = ${snapshot.id}
        AND holder_type = 'human'
        AND holder_id = ${session_id}
    `;

    if (!entry) {
      return NextResponse.json({
        error: "No $GLITCH balance found in snapshot for your account.",
      }, { status: 404 });
    }

    if (entry.claim_status === "claimed") {
      return NextResponse.json({
        error: "Already claimed! Your $GLITCH tokens have been bridged.",
        already_claimed: true,
        tx_signature: entry.claim_tx_hash,
      });
    }

    // Check for existing pending claim
    const existingClaims = await sql`
      SELECT id, status FROM bridge_claims
      WHERE snapshot_id = ${snapshot.id} AND session_id = ${session_id} AND status = 'pending'
    `;

    if (existingClaims.length > 0) {
      return NextResponse.json({
        error: "You already have a pending claim. Wait for it to process.",
        pending: true,
        claim_id: existingClaims[0].id,
      });
    }

    const amount = Number(entry.balance);
    const claimId = uuidv4();

    // Create the bridge claim
    await sql`
      INSERT INTO bridge_claims (id, snapshot_id, session_id, phantom_wallet, amount, status, created_at)
      VALUES (${claimId}, ${snapshot.id}, ${session_id}, ${wallet_address}, ${amount}, 'pending', NOW())
    `;

    // Update the snapshot entry with the wallet and mark as pending
    await sql`
      UPDATE glitch_snapshot_entries
      SET phantom_wallet = ${wallet_address}, claim_status = 'pending'
      WHERE snapshot_id = ${snapshot.id}
        AND holder_type = 'human'
        AND holder_id = ${session_id}
    `;

    // If real Solana mode is active and treasury is configured, attempt the transfer
    if (isRealSolanaMode() && process.env.TREASURY_PRIVATE_KEY) {
      try {
        // Real on-chain transfer will be handled by treasury service
        // For now, mark as queued for processing
        await sql`
          UPDATE bridge_claims SET status = 'queued' WHERE id = ${claimId}
        `;

        return NextResponse.json({
          success: true,
          claim_id: claimId,
          amount,
          wallet_address,
          status: "queued",
          message: `${amount.toLocaleString()} $GLITCH queued for transfer to ${wallet_address.slice(0, 8)}...`,
          note: "Real SPL tokens will be sent from the treasury wallet. This may take a few minutes.",
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        await sql`
          UPDATE bridge_claims SET status = 'failed', error_message = ${errorMsg} WHERE id = ${claimId}
        `;
        return NextResponse.json({
          error: `Transfer failed: ${errorMsg}`,
          claim_id: claimId,
        }, { status: 500 });
      }
    }

    // Simulated mode or no treasury key — mark claim as pending manual processing
    return NextResponse.json({
      success: true,
      claim_id: claimId,
      amount,
      wallet_address,
      status: "pending",
      message: `Claim submitted for ${amount.toLocaleString()} $GLITCH! Awaiting admin approval for on-chain transfer.`,
      note: isRealSolanaMode()
        ? "Treasury private key not configured. Admin will process manually."
        : "Real Solana mode not active. Enable NEXT_PUBLIC_SOLANA_REAL_MODE=true and set TREASURY_PRIVATE_KEY.",
    });
  }

  // ── Admin: Process a pending claim (manual approval) ──
  if (action === "process_claim") {
    const { claim_id, tx_signature } = body;

    if (!claim_id || !tx_signature) {
      return NextResponse.json({ error: "Missing claim_id or tx_signature" }, { status: 400 });
    }

    const [claim] = await sql`
      SELECT * FROM bridge_claims WHERE id = ${claim_id}
    `;

    if (!claim) {
      return NextResponse.json({ error: "Claim not found" }, { status: 404 });
    }

    if (claim.status === "completed") {
      return NextResponse.json({ error: "Claim already processed" }, { status: 400 });
    }

    // Mark claim as completed
    await sql`
      UPDATE bridge_claims
      SET status = 'completed', tx_signature = ${tx_signature}, completed_at = NOW()
      WHERE id = ${claim_id}
    `;

    // Update snapshot entry
    await sql`
      UPDATE glitch_snapshot_entries
      SET claim_status = 'claimed', claimed_at = NOW(), claim_tx_hash = ${tx_signature}
      WHERE snapshot_id = ${claim.snapshot_id}
        AND holder_type = 'human'
        AND holder_id = ${claim.session_id}
    `;

    return NextResponse.json({
      success: true,
      claim_id,
      amount: Number(claim.amount),
      wallet: claim.phantom_wallet,
      tx_signature,
      message: `Claim processed! ${Number(claim.amount).toLocaleString()} $GLITCH sent to ${claim.phantom_wallet}.`,
    });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
