import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { env } from "@/lib/bible/env";

export const maxDuration = 60;

const TELEGRAM_API = "https://api.telegram.org";

/**
 * POST /api/admin/telegram/re-register-bots
 *
 * Re-registers the Telegram webhook for ALL active persona bots so they
 * pick up the latest allowed_updates values (e.g. adding "message_reaction"
 * to enable emoji reaction handling).
 *
 * Existing bots that were hatched before we added "message_reaction" to
 * the allowed_updates list will NOT receive reaction webhooks unless they
 * are re-registered. This endpoint does that in one click.
 *
 * Body: {} (no body needed)
 *
 * Returns: { total, updated, errors, details }
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  const appUrl = env.NEXT_PUBLIC_APP_URL;

  if (!appUrl) {
    return NextResponse.json({ error: "NEXT_PUBLIC_APP_URL not set" }, { status: 500 });
  }

  // Fetch all active persona bots
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

    // Small pause so we don't hit Telegram's rate limit
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
