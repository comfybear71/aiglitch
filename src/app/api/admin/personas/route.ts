import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { v4 as uuidv4 } from "uuid";

export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  // Balances come from budju_wallets (actual on-chain cached values).
  // The token_balances table was "paper money" and is no longer used
  // here — switched to wallet data per user decision April 11, 2026.
  // Meatbag-hatched personas intentionally have no wallet → zeros.
  const personas = await sql`
    SELECT a.*,
      (SELECT COUNT(*) FROM posts WHERE persona_id = a.id AND is_reply_to IS NULL) as actual_posts,
      (SELECT COUNT(*) FROM human_subscriptions WHERE persona_id = a.id) as human_followers,
      (SELECT bw.wallet_address FROM budju_wallets bw WHERE bw.persona_id = a.id AND bw.is_active = TRUE LIMIT 1) as wallet_address,
      COALESCE((SELECT bw.sol_balance FROM budju_wallets bw WHERE bw.persona_id = a.id AND bw.is_active = TRUE LIMIT 1), 0) as sol_balance,
      COALESCE((SELECT bw.budju_balance FROM budju_wallets bw WHERE bw.persona_id = a.id AND bw.is_active = TRUE LIMIT 1), 0) as budju_balance,
      COALESCE((SELECT bw.usdc_balance FROM budju_wallets bw WHERE bw.persona_id = a.id AND bw.is_active = TRUE LIMIT 1), 0) as usdc_balance,
      COALESCE((SELECT bw.glitch_balance FROM budju_wallets bw WHERE bw.persona_id = a.id AND bw.is_active = TRUE LIMIT 1), 0) as glitch_balance,
      COALESCE((SELECT balance FROM ai_persona_coins WHERE persona_id = a.id), 0) as coin_balance,
      (SELECT bot_username FROM persona_telegram_bots WHERE persona_id = a.id AND is_active = TRUE LIMIT 1) as telegram_bot_username
    FROM ai_personas a
    ORDER BY a.created_at DESC
  `;

  return NextResponse.json({ personas });
}

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { username, display_name, avatar_emoji, personality, bio, persona_type } = body;

  if (!username || !display_name || !personality || !bio) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const sql = getDb();
  const id = `glitch-${uuidv4().slice(0, 8)}`;

  await sql`
    INSERT INTO ai_personas (id, username, display_name, avatar_emoji, personality, bio, persona_type)
    VALUES (${id}, ${username}, ${display_name}, ${avatar_emoji || '🤖'}, ${personality}, ${bio}, ${persona_type || 'general'})
  `;

  return NextResponse.json({ success: true, id });
}

export async function PATCH(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id, is_active, display_name, username, personality, bio, avatar_emoji, avatar_url, persona_type, human_backstory, activity_level } = body;

  if (!id) {
    return NextResponse.json({ error: "Missing persona id" }, { status: 400 });
  }

  const sql = getDb();

  if (typeof is_active === "boolean") {
    await sql`UPDATE ai_personas SET is_active = ${is_active} WHERE id = ${id}`;
  }
  if (display_name) {
    await sql`UPDATE ai_personas SET display_name = ${display_name} WHERE id = ${id}`;
  }
  if (username) {
    await sql`UPDATE ai_personas SET username = ${username} WHERE id = ${id}`;
  }
  if (personality) {
    await sql`UPDATE ai_personas SET personality = ${personality} WHERE id = ${id}`;
  }
  if (bio) {
    await sql`UPDATE ai_personas SET bio = ${bio} WHERE id = ${id}`;
  }
  if (avatar_emoji) {
    await sql`UPDATE ai_personas SET avatar_emoji = ${avatar_emoji} WHERE id = ${id}`;
  }
  if (typeof avatar_url === "string") {
    await sql`UPDATE ai_personas SET avatar_url = ${avatar_url || null} WHERE id = ${id}`;
  }
  if (persona_type) {
    await sql`UPDATE ai_personas SET persona_type = ${persona_type} WHERE id = ${id}`;
  }
  if (typeof human_backstory === "string") {
    await sql`UPDATE ai_personas SET human_backstory = ${human_backstory} WHERE id = ${id}`;
  }
  if (typeof activity_level === "number" && activity_level >= 1 && activity_level <= 10) {
    await sql`UPDATE ai_personas SET activity_level = ${activity_level} WHERE id = ${id}`;
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await request.json();
  if (!id) {
    return NextResponse.json({ error: "Missing persona id" }, { status: 400 });
  }

  const sql = getDb();
  await sql`UPDATE ai_personas SET is_active = FALSE WHERE id = ${id}`;

  return NextResponse.json({ success: true });
}
