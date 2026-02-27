import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { v4 as uuidv4 } from "uuid";

// ── $GLITCH Balance Snapshot API ──
// Captures all current balances (human + AI) for real token airdrop

export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get("action");

  await ensureDbReady();
  const sql = getDb();

  // List all snapshots
  if (action === "list" || !action) {
    const snapshots = await sql`
      SELECT id, name, total_holders, total_supply_captured, status, created_at, finalized_at
      FROM glitch_snapshots
      ORDER BY created_at DESC
      LIMIT 20
    `;

    return NextResponse.json({ snapshots });
  }

  // Get a specific snapshot with all entries
  if (action === "detail") {
    const snapshotId = request.nextUrl.searchParams.get("snapshot_id");
    if (!snapshotId) {
      return NextResponse.json({ error: "Missing snapshot_id" }, { status: 400 });
    }

    const [snapshot] = await sql`
      SELECT * FROM glitch_snapshots WHERE id = ${snapshotId}
    `;
    if (!snapshot) {
      return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
    }

    const entries = await sql`
      SELECT * FROM glitch_snapshot_entries
      WHERE snapshot_id = ${snapshotId}
      ORDER BY balance DESC
    `;

    // Summary stats
    const humanEntries = entries.filter(e => e.holder_type === "human");
    const aiEntries = entries.filter(e => e.holder_type === "ai_persona");
    const withWallet = humanEntries.filter(e => e.phantom_wallet);
    const claimed = entries.filter(e => e.claim_status === "claimed");

    return NextResponse.json({
      snapshot,
      entries,
      summary: {
        total_holders: entries.length,
        human_holders: humanEntries.length,
        ai_holders: aiEntries.length,
        with_phantom_wallet: withWallet.length,
        without_wallet: humanEntries.length - withWallet.length,
        total_glitch: entries.reduce((sum, e) => sum + Number(e.balance), 0),
        total_claimed: claimed.length,
        total_unclaimed: entries.length - claimed.length,
      },
    });
  }

  // Get the airdrop manifest (JSON for on-chain distribution)
  if (action === "manifest") {
    const snapshotId = request.nextUrl.searchParams.get("snapshot_id");
    if (!snapshotId) {
      return NextResponse.json({ error: "Missing snapshot_id" }, { status: 400 });
    }

    const entries = await sql`
      SELECT holder_type, holder_id, display_name, phantom_wallet, balance
      FROM glitch_snapshot_entries
      WHERE snapshot_id = ${snapshotId} AND balance > 0
      ORDER BY balance DESC
    `;

    // Split into ready-to-airdrop (have wallet) and pending (no wallet yet)
    const readyToAirdrop = entries
      .filter(e => e.phantom_wallet)
      .map(e => ({
        wallet: e.phantom_wallet,
        amount: Number(e.balance),
        holder_type: e.holder_type,
        display_name: e.display_name,
      }));

    const pendingWallet = entries
      .filter(e => !e.phantom_wallet)
      .map(e => ({
        holder_type: e.holder_type,
        holder_id: e.holder_id,
        display_name: e.display_name,
        amount: Number(e.balance),
      }));

    return NextResponse.json({
      snapshot_id: snapshotId,
      token: "$GLITCH",
      mint: "5hfHCmaL6e9bvruy35RQyghMXseTE2mXJ7ukqKAcS8fT",
      ready_to_airdrop: readyToAirdrop,
      pending_wallet: pendingWallet,
      totals: {
        ready_amount: readyToAirdrop.reduce((s, e) => s + e.amount, 0),
        pending_amount: pendingWallet.reduce((s, e) => s + e.amount, 0),
        total_amount: entries.reduce((s, e) => s + Number(e.balance), 0),
      },
    });
  }

  // Check a specific user's snapshot balance and claim status
  if (action === "user_status") {
    const sessionId = request.nextUrl.searchParams.get("session_id");
    if (!sessionId) {
      return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
    }

    // Get the latest finalized snapshot
    const [latestSnapshot] = await sql`
      SELECT id, name, created_at FROM glitch_snapshots
      WHERE status = 'finalized'
      ORDER BY created_at DESC LIMIT 1
    `;

    if (!latestSnapshot) {
      return NextResponse.json({ has_snapshot: false, message: "No snapshot taken yet" });
    }

    const [entry] = await sql`
      SELECT * FROM glitch_snapshot_entries
      WHERE snapshot_id = ${latestSnapshot.id}
        AND holder_type = 'human'
        AND holder_id = ${sessionId}
    `;

    if (!entry) {
      return NextResponse.json({
        has_snapshot: true,
        snapshot_id: latestSnapshot.id,
        snapshot_name: latestSnapshot.name,
        has_balance: false,
        message: "No $GLITCH balance at time of snapshot",
      });
    }

    // Check for existing claim
    const claims = await sql`
      SELECT * FROM bridge_claims
      WHERE snapshot_id = ${latestSnapshot.id} AND session_id = ${sessionId}
      ORDER BY created_at DESC LIMIT 1
    `;

    return NextResponse.json({
      has_snapshot: true,
      snapshot_id: latestSnapshot.id,
      snapshot_name: latestSnapshot.name,
      has_balance: true,
      balance: Number(entry.balance),
      lifetime_earned: Number(entry.lifetime_earned),
      claim_status: entry.claim_status,
      phantom_wallet: entry.phantom_wallet,
      claim: claims.length > 0 ? {
        status: claims[0].status,
        tx_signature: claims[0].tx_signature,
        created_at: claims[0].created_at,
        completed_at: claims[0].completed_at,
      } : null,
    });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action } = body;

  await ensureDbReady();
  const sql = getDb();

  // ── Take a new snapshot ──
  if (action === "take_snapshot") {
    const name = body.name || `Snapshot ${new Date().toISOString().split("T")[0]}`;

    const snapshotId = uuidv4();

    // Capture all human balances
    const humanBalances = await sql`
      SELECT gc.session_id, gc.balance, gc.lifetime_earned,
             hu.display_name, hu.username, hu.phantom_wallet_address
      FROM glitch_coins gc
      LEFT JOIN human_users hu ON gc.session_id = hu.session_id
      WHERE gc.balance > 0
    `;

    // Capture all AI persona balances
    const aiBalances = await sql`
      SELECT apc.persona_id, apc.balance, apc.lifetime_earned,
             ap.display_name, ap.username
      FROM ai_persona_coins apc
      LEFT JOIN ai_personas ap ON apc.persona_id = ap.id
      WHERE apc.balance > 0
    `;

    let totalSupply = 0;
    const entryCount = humanBalances.length + aiBalances.length;

    // Insert human entries
    for (const row of humanBalances) {
      const balance = Number(row.balance);
      totalSupply += balance;
      await sql`
        INSERT INTO glitch_snapshot_entries (id, snapshot_id, holder_type, holder_id, display_name, phantom_wallet, balance, lifetime_earned)
        VALUES (${uuidv4()}, ${snapshotId}, 'human', ${row.session_id}, ${row.display_name || row.username || "Meat Bag"}, ${row.phantom_wallet_address || null}, ${balance}, ${Number(row.lifetime_earned)})
      `;
    }

    // Insert AI persona entries
    for (const row of aiBalances) {
      const balance = Number(row.balance);
      totalSupply += balance;
      await sql`
        INSERT INTO glitch_snapshot_entries (id, snapshot_id, holder_type, holder_id, display_name, phantom_wallet, balance, lifetime_earned)
        VALUES (${uuidv4()}, ${snapshotId}, 'ai_persona', ${row.persona_id}, ${row.display_name || row.username || "AI Persona"}, NULL, ${balance}, ${Number(row.lifetime_earned)})
      `;
    }

    // Create the snapshot record
    await sql`
      INSERT INTO glitch_snapshots (id, name, total_holders, total_supply_captured, status, created_at, finalized_at)
      VALUES (${snapshotId}, ${name}, ${entryCount}, ${totalSupply}, 'finalized', NOW(), NOW())
    `;

    return NextResponse.json({
      success: true,
      snapshot_id: snapshotId,
      name,
      total_holders: entryCount,
      human_holders: humanBalances.length,
      ai_holders: aiBalances.length,
      total_supply_captured: totalSupply,
      status: "finalized",
      message: `Snapshot taken! ${entryCount} holders captured with ${totalSupply.toLocaleString()} total $GLITCH.`,
    });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
