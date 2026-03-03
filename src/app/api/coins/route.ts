import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { users } from "@/lib/repositories";
import { COIN_REWARDS } from "@/lib/bible/constants";


export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ balance: 0, lifetime_earned: 0, transactions: [] });
  }

  await ensureDbReady();

  const { balance, lifetimeEarned } = await users.getCoinBalance(sessionId);
  const transactions = await users.getTransactions(sessionId);

  return NextResponse.json({ balance, lifetime_earned: lifetimeEarned, transactions });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { session_id, action } = body;

  if (!session_id || !action) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  await ensureDbReady();
  const sql = getDb();

  if (action === "claim_signup") {
    const existing = await sql`
      SELECT id FROM coin_transactions WHERE session_id = ${session_id} AND reason = 'Welcome bonus'
    `;
    if (existing.length > 0) {
      return NextResponse.json({ error: "Already claimed", already_claimed: true });
    }

    const amount = await users.awardCoins(session_id, COIN_REWARDS.signup, "Welcome bonus");
    return NextResponse.json({ success: true, amount, reason: "Welcome bonus" });
  }

  if (action === "send_to_persona") {
    const { persona_id, amount } = body;
    if (!persona_id || !amount || typeof amount !== "number" || amount < 1) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }
    if (amount > COIN_REWARDS.maxTransfer) {
      return NextResponse.json({ error: `Max transfer is §${COIN_REWARDS.maxTransfer.toLocaleString()}` }, { status: 400 });
    }

    const { balance } = await users.getCoinBalance(session_id);
    if (balance < amount) {
      return NextResponse.json({ error: "Insufficient balance", balance, shortfall: amount - balance }, { status: 402 });
    }

    const personaRows = await sql`SELECT id, display_name FROM ai_personas WHERE id = ${persona_id}`;
    if (personaRows.length === 0) {
      return NextResponse.json({ error: "Persona not found" }, { status: 404 });
    }
    const personaName = personaRows[0].display_name as string;

    const deductResult = await users.deductCoins(session_id, amount, "Sent to " + personaName, persona_id);
    if (!deductResult.success) {
      return NextResponse.json({ error: "Insufficient balance" }, { status: 402 });
    }
    await users.awardPersonaCoins(persona_id, amount);

    return NextResponse.json({
      success: true,
      sent: amount,
      recipient: personaName,
      new_balance: deductResult.newBalance,
    });
  }

  if (action === "send_to_human") {
    const { friend_username, amount } = body;
    if (!friend_username || !amount || typeof amount !== "number" || amount < 1) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }
    if (amount > COIN_REWARDS.maxTransfer) {
      return NextResponse.json({ error: `Max transfer is §${COIN_REWARDS.maxTransfer.toLocaleString()}` }, { status: 400 });
    }

    const { balance } = await users.getCoinBalance(session_id);
    if (balance < amount) {
      return NextResponse.json({ error: "Insufficient balance", balance, shortfall: amount - balance }, { status: 402 });
    }

    const recipient = await users.getByUsername(friend_username);
    if (!recipient) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (recipient.session_id === session_id) {
      return NextResponse.json({ error: "Cannot send coins to yourself" }, { status: 400 });
    }

    const deductResult = await users.deductCoins(session_id, amount, "Sent to " + recipient.display_name, recipient.session_id);
    if (!deductResult.success) {
      return NextResponse.json({ error: "Insufficient balance" }, { status: 402 });
    }
    await users.awardCoins(recipient.session_id, amount, "Received from a friend", session_id);

    return NextResponse.json({
      success: true,
      sent: amount,
      recipient: recipient.display_name,
      new_balance: deductResult.newBalance,
    });
  }

  if (action === "purchase_ad_free") {
    // Phantom wallet users can pay 20 GLITCH coins to disable ads for 1 month
    const AD_FREE_COST = 20;
    const AD_FREE_DAYS = 30;

    // Verify user has a linked Phantom wallet
    const userRows = await sql`
      SELECT phantom_wallet_address FROM human_users WHERE session_id = ${session_id}
    `;
    if (userRows.length === 0 || !userRows[0].phantom_wallet_address) {
      return NextResponse.json({ error: "Phantom wallet required to purchase ad-free" }, { status: 403 });
    }

    // Check current balance
    const { balance } = await users.getCoinBalance(session_id);
    if (balance < AD_FREE_COST) {
      return NextResponse.json({ error: "Insufficient balance", balance, cost: AD_FREE_COST, shortfall: AD_FREE_COST - balance }, { status: 402 });
    }

    // Check if already ad-free
    const existing = await sql`
      SELECT ad_free_until FROM human_users WHERE session_id = ${session_id}
    `;
    const currentExpiry = existing[0]?.ad_free_until ? new Date(existing[0].ad_free_until as string) : null;
    const now = new Date();

    // Start from current expiry if still active, otherwise from now
    const startDate = currentExpiry && currentExpiry > now ? currentExpiry : now;
    const newExpiry = new Date(startDate.getTime() + AD_FREE_DAYS * 24 * 60 * 60 * 1000);

    // Deduct coins
    const deductResult = await users.deductCoins(session_id, AD_FREE_COST, "Ad-free (30 days)");
    if (!deductResult.success) {
      return NextResponse.json({ error: "Insufficient balance" }, { status: 402 });
    }

    // Set ad-free expiry on user record
    await sql`
      UPDATE human_users SET ad_free_until = ${newExpiry.toISOString()}, updated_at = NOW()
      WHERE session_id = ${session_id}
    `;

    return NextResponse.json({
      success: true,
      ad_free_until: newExpiry.toISOString(),
      new_balance: deductResult.newBalance,
      message: `Ads disabled until ${newExpiry.toLocaleDateString()}`,
    });
  }

  if (action === "check_ad_free") {
    // Check if user has active ad-free status
    const rows = await sql`
      SELECT ad_free_until FROM human_users WHERE session_id = ${session_id}
    `;
    if (rows.length === 0) {
      return NextResponse.json({ ad_free: false });
    }
    const expiryStr = rows[0].ad_free_until as string | null;
    if (!expiryStr) {
      return NextResponse.json({ ad_free: false });
    }
    const expiry = new Date(expiryStr);
    const isActive = expiry > new Date();
    return NextResponse.json({
      ad_free: isActive,
      ad_free_until: isActive ? expiryStr : null,
    });
  }

  if (action === "seed_personas") {
    const personas = await sql`
      SELECT p.id, p.display_name, p.follower_count,
             COALESCE(c.balance, 0) as current_balance
      FROM ai_personas p
      LEFT JOIN ai_persona_coins c ON c.persona_id = p.id
      WHERE p.is_active = TRUE
    `;

    let seeded = 0;
    for (const p of personas) {
      if (Number(p.current_balance) > 0) continue;
      const base = 200;
      const followers = Number(p.follower_count) || 0;
      const bonus = Math.min(Math.floor(followers / 100), 1800);
      await users.awardPersonaCoins(p.id as string, base + bonus);
      seeded++;
    }

    return NextResponse.json({
      success: true,
      seeded,
      total_personas: personas.length,
      message: `Seeded ${seeded} personas with §GLITCH`,
    });
  }

  if (action === "persona_balances") {
    const balances = await sql`
      SELECT p.id, p.display_name, p.avatar_emoji, p.persona_type,
             COALESCE(c.balance, 0) as balance,
             COALESCE(c.lifetime_earned, 0) as lifetime_earned
      FROM ai_personas p
      LEFT JOIN ai_persona_coins c ON c.persona_id = p.id
      WHERE p.is_active = TRUE
      ORDER BY COALESCE(c.balance, 0) DESC
      LIMIT 50
    `;
    return NextResponse.json({ balances });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
