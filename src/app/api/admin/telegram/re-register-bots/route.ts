import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { env } from "@/lib/bible/env";
import { registerTelegramCommands } from "@/lib/content/telegram-commands";

export const maxDuration = 60;

const TELEGRAM_API = "https://api.telegram.org";

/**
 * Telegram bot re-registration endpoint.
 *
 * Two modes:
 *
 * 1. GET /api/admin/telegram/re-register-bots
 *    Returns the list of active persona bots that would be re-registered.
 *    Used by the admin UI to build a client-side progress loop so the user
 *    sees each bot register in real time (instead of waiting 10+ seconds
 *    with a frozen screen like before). NEVER returns bot_token to the
 *    browser — only persona_id + username.
 *
 * 2. POST /api/admin/telegram/re-register-bots
 *    Body: { persona_id?: string }
 *
 *    - If persona_id is provided: re-registers JUST that one bot.
 *      Returns { success, persona_id, bot_username, status, message? }
 *
 *    - If persona_id is OMITTED (legacy behavior): re-registers ALL active
 *      bots in one sequential batch. Returns { success, total, updated,
 *      errors, details }. This is kept for backward compat but the client
 *      should prefer the per-bot approach for better UX.
 */

export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();

  // NEVER include bot_token in the response — keep secrets server-side
  const bots = await sql`
    SELECT b.persona_id, b.bot_username, p.display_name, p.avatar_emoji
    FROM persona_telegram_bots b
    LEFT JOIN ai_personas p ON p.id = b.persona_id
    WHERE b.is_active = TRUE
    ORDER BY b.persona_id
  ` as unknown as {
    persona_id: string;
    bot_username: string | null;
    display_name: string | null;
    avatar_emoji: string | null;
  }[];

  return NextResponse.json({ total: bots.length, bots });
}

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  const appUrl = env.NEXT_PUBLIC_APP_URL;

  if (!appUrl) {
    return NextResponse.json({ error: "NEXT_PUBLIC_APP_URL not set" }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const targetPersonaId = body.persona_id as string | undefined;

  // ── Mode 1: Re-register a single bot (preferred, used by new progress UI) ──
  if (targetPersonaId) {
    const [bot] = await sql`
      SELECT persona_id, bot_token, bot_username
      FROM persona_telegram_bots
      WHERE persona_id = ${targetPersonaId} AND is_active = TRUE
      LIMIT 1
    ` as unknown as [{ persona_id: string; bot_token: string; bot_username: string | null } | undefined];

    if (!bot) {
      return NextResponse.json({
        success: false,
        persona_id: targetPersonaId,
        status: "not_found",
        message: "No active Telegram bot found for this persona",
      }, { status: 404 });
    }

    const webhookUrl = `${appUrl}/api/telegram/persona-chat/${bot.persona_id}`;

    try {
      const res = await fetch(`${TELEGRAM_API}/bot${bot.bot_token}/setWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: webhookUrl,
          allowed_updates: ["message", "message_reaction"],
        }),
        signal: AbortSignal.timeout(10000),
      });
      const data = await res.json();

      if (data.ok) {
        // Also refresh the slash-command menu while we're here.
        const cmd = await registerTelegramCommands(bot.bot_token);
        return NextResponse.json({
          success: true,
          persona_id: bot.persona_id,
          bot_username: bot.bot_username,
          status: "ok",
          commands_set: cmd.ok,
        });
      } else {
        return NextResponse.json({
          success: false,
          persona_id: bot.persona_id,
          bot_username: bot.bot_username,
          status: "failed",
          message: data.description || "unknown",
        });
      }
    } catch (err) {
      return NextResponse.json({
        success: false,
        persona_id: bot.persona_id,
        bot_username: bot.bot_username,
        status: "failed",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── Mode 2: Re-register all bots in one batch (legacy, kept for backcompat) ──
  const bots = await sql`
    SELECT persona_id, bot_token, bot_username
    FROM persona_telegram_bots
    WHERE is_active = TRUE
  ` as unknown as { persona_id: string; bot_token: string; bot_username: string | null }[];

  const details: Array<{
    persona_id: string;
    bot_username: string | null;
    status: "ok" | "failed";
    message?: string;
  }> = [];

  let updated = 0;
  const errors: string[] = [];

  for (const bot of bots) {
    const webhookUrl = `${appUrl}/api/telegram/persona-chat/${bot.persona_id}`;

    try {
      const res = await fetch(`${TELEGRAM_API}/bot${bot.bot_token}/setWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: webhookUrl,
          allowed_updates: ["message", "message_reaction"],
        }),
        signal: AbortSignal.timeout(10000),
      });
      const data = await res.json();

      if (data.ok) {
        // Refresh slash commands on the bulk path too.
        await registerTelegramCommands(bot.bot_token);
        updated++;
        details.push({
          persona_id: bot.persona_id,
          bot_username: bot.bot_username,
          status: "ok",
        });
      } else {
        errors.push(`${bot.persona_id}: ${data.description || "unknown"}`);
        details.push({
          persona_id: bot.persona_id,
          bot_username: bot.bot_username,
          status: "failed",
          message: data.description || "unknown",
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${bot.persona_id}: ${msg}`);
      details.push({
        persona_id: bot.persona_id,
        bot_username: bot.bot_username,
        status: "failed",
        message: msg,
      });
    }

    await new Promise(r => setTimeout(r, 200));
  }

  return NextResponse.json({
    success: true,
    total: bots.length,
    updated,
    errors: errors.length,
    details,
  });
}
