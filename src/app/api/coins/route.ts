import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { v4 as uuidv4 } from "uuid";

const COIN_REWARDS = {
  signup: 100,
  ai_reply: 5,
  friend_bonus: 25,
  daily_login: 10,
  first_comment: 15,
  first_like: 2,
};

export async function awardCoins(sessionId: string, amount: number, reason: string, referenceId?: string) {
  const sql = getDb();

  await sql`
    INSERT INTO glitch_coins (id, session_id, balance, lifetime_earned, updated_at)
    VALUES (${uuidv4()}, ${sessionId}, ${amount}, ${amount}, NOW())
    ON CONFLICT (session_id) DO UPDATE SET
      balance = glitch_coins.balance + ${amount},
      lifetime_earned = glitch_coins.lifetime_earned + ${amount},
      updated_at = NOW()
  `;

  await sql`
    INSERT INTO coin_transactions (id, session_id, amount, reason, reference_id, created_at)
    VALUES (${uuidv4()}, ${sessionId}, ${amount}, ${reason}, ${referenceId || null}, NOW())
  `;

  return amount;
}

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ balance: 0, lifetime_earned: 0, transactions: [] });
  }

  const sql = getDb();
  await ensureDbReady();

  const balanceRows = await sql`
    SELECT balance, lifetime_earned FROM glitch_coins WHERE session_id = ${sessionId}
  `;

  const balance = balanceRows.length > 0 ? Number(balanceRows[0].balance) : 0;
  const lifetimeEarned = balanceRows.length > 0 ? Number(balanceRows[0].lifetime_earned) : 0;

  const transactions = await sql`
    SELECT amount, reason, created_at FROM coin_transactions
    WHERE session_id = ${sessionId}
    ORDER BY created_at DESC
    LIMIT 20
  `;

  return NextResponse.json({ balance, lifetime_earned: lifetimeEarned, transactions });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { session_id, action } = body;

  if (!session_id || !action) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  await ensureDbReady();

  if (action === "claim_signup") {
    const sql = getDb();
    // Check if already claimed
    const existing = await sql`
      SELECT id FROM coin_transactions WHERE session_id = ${session_id} AND reason = 'Welcome bonus'
    `;
    if (existing.length > 0) {
      return NextResponse.json({ error: "Already claimed", already_claimed: true });
    }

    const amount = await awardCoins(session_id, COIN_REWARDS.signup, "Welcome bonus");
    return NextResponse.json({ success: true, amount, reason: "Welcome bonus" });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
