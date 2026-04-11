import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { env } from "@/lib/bible/env";
import { v4 as uuidv4 } from "uuid";

export const maxDuration = 30;

const TELEGRAM_API = "https://api.telegram.org";

/**
 * POST /api/admin/personas/set-bot-token
 *
 * Admin-only endpoint to set or replace a Telegram bot token for a specific
 * persona. Unlike /api/hatch/telegram (which is user-facing and tied to a
 * session/wallet), this is for the admin to bulk-equip personas with bots
 * directly from their persona card on /admin/personas.
 *
 * Flow:
 *  1. Validates the bot token with Telegram's /getMe
 *  2. Extracts bot_username
 *  3. Registers the webhook with message + message_reaction allowed_updates
 *  4. Upserts the persona_telegram_bots row (deletes old active bot first)
 *  5. Returns status + bot_username
 *
 * Body: { persona_id: string, bot_token: string }
 *
 * Also supports DELETE-like behavior via { persona_id, bot_token: null }:
 *  - Deactivates the current bot row for that persona
 *  - Does NOT try to unregister the webhook (harmless to leave registered)
 *
 * Safety:
 *  - Admin auth required
 *  - Bot token validated with Telegram before saving (prevents garbage rows)
 *  - Webhook automatically set so reactions + messages work immediately
 *  - Never exposes bot_token in GET responses
 */

async function ensureTable(): Promise<void> {
  const sql = getDb();
  await sql`CREATE TABLE IF NOT EXISTS persona_telegram_bots (
    id TEXT PRIMARY KEY,
    persona_id TEXT NOT NULL,
    bot_token TEXT NOT NULL,
    bot_username TEXT,
    telegram_chat_id TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`.catch(() => {});
}

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureTable();
  const sql = getDb();
  const body = await request.json().catch(() => ({}));
  const { persona_id, bot_token } = body as { persona_id?: string; bot_token?: string | null };

  if (!persona_id) {
    return NextResponse.json({ error: "persona_id required" }, { status: 400 });
  }

  // Verify persona exists
  const [persona] = await sql`
    SELECT id, username, display_name FROM ai_personas WHERE id = ${persona_id} LIMIT 1
  ` as unknown as [{ id: string; username: string; display_name: string } | undefined];

  if (!persona) {
    return NextResponse.json({ error: "Persona not found" }, { status: 404 });
  }

  // ── Mode A: Deactivate existing bot (bot_token null or empty) ──
  if (!bot_token || bot_token.trim() === "") {
    await sql`UPDATE persona_telegram_bots SET is_active = FALSE WHERE persona_id = ${persona_id}`;
    return NextResponse.json({
      success: true,
      persona_id,
      action: "deactivated",
      message: `Deactivated Telegram bot for @${persona.username}`,
    });
  }

  // ── Mode B: Set or replace bot token ──
  const token = bot_token.trim();

  // Validate with Telegram's getMe
  let botUsername: string | null = null;
  try {
    const meRes = await fetch(`${TELEGRAM_API}/bot${token}/getMe`, {
      signal: AbortSignal.timeout(10000),
    });
    const meData = await meRes.json();

    if (!meData.ok) {
      return NextResponse.json({
        error: `Invalid bot token: ${meData.description || "getMe failed"}`,
      }, { status: 400 });
    }

    botUsername = meData.result?.username || null;
    if (!botUsername) {
      return NextResponse.json({
        error: "Bot token valid but getMe did not return a username",
      }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({
      error: `Telegram validation failed: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 502 });
  }

  // Register the webhook
  const appUrl = env.NEXT_PUBLIC_APP_URL;
  const webhookUrl = `${appUrl}/api/telegram/persona-chat/${persona_id}`;
  let webhookSet = false;
  let webhookError: string | null = null;

  try {
    const webhookRes = await fetch(`${TELEGRAM_API}/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ["message", "message_reaction"],
      }),
      signal: AbortSignal.timeout(10000),
    });
    const webhookData = await webhookRes.json();
    webhookSet = !!webhookData.ok;
    if (!webhookData.ok) {
      webhookError = webhookData.description || "setWebhook failed";
    }
  } catch (err) {
    webhookError = err instanceof Error ? err.message : String(err);
  }

  // Delete old active bot for this persona, then insert the new one
  await sql`DELETE FROM persona_telegram_bots WHERE persona_id = ${persona_id}`;
  await sql`
    INSERT INTO persona_telegram_bots (id, persona_id, bot_token, bot_username, is_active, created_at)
    VALUES (${uuidv4()}, ${persona_id}, ${token}, ${botUsername}, TRUE, NOW())
  `;

  return NextResponse.json({
    success: true,
    persona_id,
    action: "set",
    bot_username: botUsername,
    webhook_set: webhookSet,
    webhook_error: webhookError,
    message: webhookSet
      ? `Bot @${botUsername} linked to ${persona.display_name} and webhook registered.`
      : `Bot @${botUsername} saved but webhook failed: ${webhookError}. You can re-register via the Re-register All Bots button.`,
  });
}
