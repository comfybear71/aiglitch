import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { v4 as uuidv4 } from "uuid";

export const COIN_REWARDS = {
  signup: 100,
  ai_reply: 5,
  friend_bonus: 25,
  daily_login: 10,
  first_comment: 15,
  first_like: 2,
  referral: 50,
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

// Award coins to an AI persona (separate balance table)
export async function awardPersonaCoins(personaId: string, amount: number) {
  const sql = getDb();

  await sql`
    INSERT INTO ai_persona_coins (id, persona_id, balance, lifetime_earned, updated_at)
    VALUES (${uuidv4()}, ${personaId}, ${amount}, ${amount}, NOW())
    ON CONFLICT (persona_id) DO UPDATE SET
      balance = ai_persona_coins.balance + ${amount},
      lifetime_earned = ai_persona_coins.lifetime_earned + ${amount},
      updated_at = NOW()
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

  // Send coins from meat bag to AI persona
  if (action === "send_to_persona") {
    const { persona_id, amount } = body;
    if (!persona_id || !amount || typeof amount !== "number" || amount < 1) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }
    if (amount > 10000) {
      return NextResponse.json({ error: "Max transfer is §10,000" }, { status: 400 });
    }

    const sql = getDb();

    // Check sender balance
    const balanceRows = await sql`SELECT balance FROM glitch_coins WHERE session_id = ${session_id}`;
    const balance = balanceRows.length > 0 ? Number(balanceRows[0].balance) : 0;
    if (balance < amount) {
      return NextResponse.json({ error: "Insufficient balance", balance, shortfall: amount - balance }, { status: 402 });
    }

    // Verify persona exists
    const personaRows = await sql`SELECT id, display_name FROM ai_personas WHERE id = ${persona_id}`;
    if (personaRows.length === 0) {
      return NextResponse.json({ error: "Persona not found" }, { status: 404 });
    }
    const personaName = personaRows[0].display_name as string;

    // Deduct from sender
    await sql`UPDATE glitch_coins SET balance = balance - ${amount}, updated_at = NOW() WHERE session_id = ${session_id}`;
    await sql`
      INSERT INTO coin_transactions (id, session_id, amount, reason, reference_id, created_at)
      VALUES (${uuidv4()}, ${session_id}, ${-amount}, ${"Sent to " + personaName}, ${persona_id}, NOW())
    `;

    // Credit to AI persona
    await awardPersonaCoins(persona_id, amount);

    const [updated] = await sql`SELECT balance FROM glitch_coins WHERE session_id = ${session_id}`;

    return NextResponse.json({
      success: true,
      sent: amount,
      recipient: personaName,
      new_balance: Number(updated.balance),
    });
  }

  // Send coins from meat bag to another meat bag
  if (action === "send_to_human") {
    const { friend_username, amount } = body;
    if (!friend_username || !amount || typeof amount !== "number" || amount < 1) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }
    if (amount > 10000) {
      return NextResponse.json({ error: "Max transfer is §10,000" }, { status: 400 });
    }

    const sql = getDb();

    // Check sender balance
    const balanceRows = await sql`SELECT balance FROM glitch_coins WHERE session_id = ${session_id}`;
    const balance = balanceRows.length > 0 ? Number(balanceRows[0].balance) : 0;
    if (balance < amount) {
      return NextResponse.json({ error: "Insufficient balance", balance, shortfall: amount - balance }, { status: 402 });
    }

    // Find recipient
    const recipientRows = await sql`SELECT session_id, display_name FROM human_users WHERE username = ${friend_username.toLowerCase()}`;
    if (recipientRows.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const recipientSessionId = recipientRows[0].session_id as string;
    const recipientName = recipientRows[0].display_name as string;

    if (recipientSessionId === session_id) {
      return NextResponse.json({ error: "Cannot send coins to yourself" }, { status: 400 });
    }

    // Deduct from sender
    await sql`UPDATE glitch_coins SET balance = balance - ${amount}, updated_at = NOW() WHERE session_id = ${session_id}`;
    await sql`
      INSERT INTO coin_transactions (id, session_id, amount, reason, reference_id, created_at)
      VALUES (${uuidv4()}, ${session_id}, ${-amount}, ${"Sent to " + recipientName}, ${recipientSessionId}, NOW())
    `;

    // Credit to recipient
    await awardCoins(recipientSessionId, amount, "Received from a friend", session_id);

    const [updated] = await sql`SELECT balance FROM glitch_coins WHERE session_id = ${session_id}`;

    return NextResponse.json({
      success: true,
      sent: amount,
      recipient: recipientName,
      new_balance: Number(updated.balance),
    });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
