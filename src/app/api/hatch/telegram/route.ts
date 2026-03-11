import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { env } from "@/lib/bible/env";

const TELEGRAM_API = "https://api.telegram.org";

/**
 * POST /api/hatch/telegram — Set up a Telegram bot for a meatbag's AI persona
 *
 * Body: { session_id, bot_token }
 *
 * Flow:
 *   1. Verify user owns a hatched persona
 *   2. Validate bot token via Telegram getMe
 *   3. Store bot token + set webhook to our persona chat endpoint
 */
export async function POST(request: NextRequest) {
  let body: { session_id?: string; bot_token?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { session_id, bot_token } = body;

  if (!session_id || !bot_token?.trim()) {
    return NextResponse.json({ error: "Missing session_id or bot_token" }, { status: 400 });
  }

  const sql = getDb();

  // Get user's wallet
  const [user] = await sql`
    SELECT phantom_wallet_address FROM human_users WHERE session_id = ${session_id}
  ` as unknown as [{ phantom_wallet_address: string | null } | undefined];

  if (!user?.phantom_wallet_address) {
    return NextResponse.json({ error: "No wallet connected" }, { status: 403 });
  }

  // Find the persona owned by this wallet
  const [persona] = await sql`
    SELECT id, display_name, username FROM ai_personas
    WHERE owner_wallet_address = ${user.phantom_wallet_address}
    LIMIT 1
  ` as unknown as [{ id: string; display_name: string; username: string } | undefined];

  if (!persona) {
    return NextResponse.json({ error: "No AI persona found. Hatch one first!" }, { status: 404 });
  }

  // Validate the bot token by calling Telegram's getMe
  const token = bot_token.trim();
  try {
    const meRes = await fetch(`${TELEGRAM_API}/bot${token}/getMe`, {
      signal: AbortSignal.timeout(10000),
    });
    const meData = await meRes.json();

    if (!meData.ok) {
      return NextResponse.json({
        error: "Invalid bot token. Make sure you copied the full token from @BotFather.",
        detail: meData.description,
      }, { status: 400 });
    }

    const botUsername = meData.result?.username || null;

    // Set up webhook to our persona chat endpoint
    const appUrl = env.NEXT_PUBLIC_APP_URL || (typeof request.url === "string" ? new URL(request.url).origin : "");
    const webhookUrl = `${appUrl}/api/telegram/persona-chat/${persona.id}`;

    const webhookRes = await fetch(`${TELEGRAM_API}/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ["message"],
      }),
      signal: AbortSignal.timeout(10000),
    });
    const webhookData = await webhookRes.json();

    if (!webhookData.ok) {
      console.error("[hatch/telegram] Webhook setup failed:", webhookData);
      // Still save the token — webhook can be retried
    }

    // Delete any existing bot for this persona
    await sql`DELETE FROM persona_telegram_bots WHERE persona_id = ${persona.id}`;

    // Save the new bot
    const botId = uuidv4();
    await sql`
      INSERT INTO persona_telegram_bots (id, persona_id, bot_token, bot_username, is_active)
      VALUES (${botId}, ${persona.id}, ${token}, ${botUsername}, TRUE)
    `;

    return NextResponse.json({
      success: true,
      bot_username: botUsername,
      webhook_set: webhookData.ok ?? false,
      message: botUsername
        ? `Bot @${botUsername} is now connected to ${persona.display_name}! Send a message to start chatting.`
        : `Bot connected to ${persona.display_name}!`,
    });
  } catch (err) {
    console.error("[hatch/telegram] Setup failed:", err);
    return NextResponse.json({
      error: "Failed to validate bot token. Check your internet connection and try again.",
    }, { status: 500 });
  }
}

/**
 * DELETE /api/hatch/telegram — Disconnect Telegram bot from persona
 */
export async function DELETE(request: NextRequest) {
  let body: { session_id?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { session_id } = body;
  if (!session_id) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
  }

  const sql = getDb();

  const [user] = await sql`
    SELECT phantom_wallet_address FROM human_users WHERE session_id = ${session_id}
  ` as unknown as [{ phantom_wallet_address: string | null } | undefined];

  if (!user?.phantom_wallet_address) {
    return NextResponse.json({ error: "No wallet connected" }, { status: 403 });
  }

  const [persona] = await sql`
    SELECT id FROM ai_personas WHERE owner_wallet_address = ${user.phantom_wallet_address}
  ` as unknown as [{ id: string } | undefined];

  if (!persona) {
    return NextResponse.json({ error: "No persona found" }, { status: 404 });
  }

  // Get bot token to remove webhook before deleting
  const [bot] = await sql`
    SELECT bot_token FROM persona_telegram_bots WHERE persona_id = ${persona.id} AND is_active = TRUE
  ` as unknown as [{ bot_token: string } | undefined];

  if (bot) {
    try {
      await fetch(`${TELEGRAM_API}/bot${bot.bot_token}/deleteWebhook`, {
        signal: AbortSignal.timeout(5000),
      });
    } catch { /* ignore cleanup failures */ }
  }

  await sql`DELETE FROM persona_telegram_bots WHERE persona_id = ${persona.id}`;

  return NextResponse.json({ success: true, message: "Telegram bot disconnected." });
}
