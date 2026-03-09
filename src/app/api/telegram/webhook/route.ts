/**
 * Telegram Bot Webhook — Command Handler
 * ========================================
 * POST /api/telegram/webhook — Receives Telegram bot updates (messages/commands).
 *
 * Lets you trigger admin actions directly from Telegram by sending commands
 * to the bot. Secured by TELEGRAM_CHANNEL_ID (only your chat ID can trigger).
 *
 * Commands:
 *   /glitchvideo   — Generate a §GLITCH coin promo video
 *   /glitchimage   — Generate a §GLITCH coin promo image
 *   /hatch [type]  — Hatch a new AI persona in The Hatchery
 *   /generate      — Trigger content generation for a random persona
 *   /status        — Get system status report
 *   /credits       — Check API credit balances
 *   /persona       — Get a random persona DM
 *   /help          — Show all available commands
 *
 * Setup: Set the webhook URL via:
 *   GET /api/telegram/webhook?action=register
 */

import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/bible/env";
import { sendTelegramMessage } from "@/lib/telegram";

export const maxDuration = 120;

const TELEGRAM_API = "https://api.telegram.org";

function getBotToken(): string | undefined {
  return process.env.TELEGRAM_BOT_TOKEN;
}

function getAdminChatId(): string | undefined {
  return process.env.TELEGRAM_CHANNEL_ID;
}

/** Send a reply to a specific chat */
async function reply(chatId: number | string, text: string): Promise<void> {
  const token = getBotToken();
  if (!token) return;

  await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(10000),
  });
}

/** Call an internal API route (server-to-server) */
async function callInternal(
  path: string,
  method: "GET" | "POST" = "GET",
  body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const baseUrl = env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const cronSecret = env.CRON_SECRET;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (cronSecret) {
    headers["Authorization"] = `Bearer ${cronSecret}`;
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(90000),
  });

  return res.json().catch(() => ({ error: `HTTP ${res.status}` }));
}

// ── Command Handlers ────────────────────────────────────────────────

async function handleGlitchVideo(chatId: number | string, customPrompt?: string): Promise<void> {
  const promptMsg = customPrompt ? `\nPrompt: <i>${customPrompt.slice(0, 100)}</i>` : "";
  await reply(chatId, `🎬 Generating §GLITCH coin promo video...${promptMsg}\nThis takes 1-2 minutes. I'll message you when it's ready.`);

  try {
    const body: Record<string, unknown> = { mode: "video" };
    if (customPrompt) body.prompt = customPrompt;
    const result = await callInternal("/api/admin/promote-glitchcoin", "POST", body);

    if (result.phase === "submitted" && result.requestId) {
      await reply(chatId,
        `⏳ Video submitted to Grok AI\n` +
        `Request ID: <code>${result.requestId}</code>\n\n` +
        `The video is rendering. The cron will pick it up and post it automatically, ` +
        `or check the admin panel to poll status.`
      );
    } else if (result.phase === "done" && result.success) {
      const r = result as Record<string, unknown>;
      await reply(chatId,
        `✅ <b>§GLITCH Video Ready!</b>\n\n` +
        `🎥 ${r.videoUrl || "Saved to blob"}\n` +
        `📝 Post ID: ${r.postId || "n/a"}\n` +
        `📡 Spread to socials: ${JSON.stringify(r.spreadResults || []).slice(0, 200)}`
      );
    } else {
      await reply(chatId, `⚠️ Video generation result:\n<code>${JSON.stringify(result).slice(0, 500)}</code>`);
    }
  } catch (err) {
    await reply(chatId, `❌ Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function handleGlitchImage(chatId: number | string, customPrompt?: string): Promise<void> {
  const promptMsg = customPrompt ? `\nPrompt: <i>${customPrompt.slice(0, 100)}</i>` : "";
  await reply(chatId, `🖼️ Generating §GLITCH coin promo image...${promptMsg}`);

  try {
    const body: Record<string, unknown> = { mode: "image" };
    if (customPrompt) body.prompt = customPrompt;
    const result = await callInternal("/api/admin/promote-glitchcoin", "POST", body);

    if (result.success) {
      const r = result as Record<string, unknown>;
      const spreadInfo = Array.isArray(r.spreadResults)
        ? (r.spreadResults as { platform: string; status: string }[])
          .map(s => `${s.status === "posted" ? "✅" : "❌"} ${s.platform}`)
          .join(", ")
        : "none";

      await reply(chatId,
        `✅ <b>§GLITCH Image Posted!</b>\n\n` +
        `🖼️ ${r.imageUrl || "Saved"}\n` +
        `📡 Socials: ${spreadInfo}`
      );
    } else {
      await reply(chatId, `❌ Image generation failed:\n${result.error || "Unknown error"}`);
    }
  } catch (err) {
    await reply(chatId, `❌ Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function handleHatch(chatId: number | string, typeHint?: string): Promise<void> {
  await reply(chatId,
    `🥚 Hatching a new AI persona${typeHint ? ` (type: ${typeHint})` : ""}...\n` +
    `This takes 1-2 minutes (avatar + video generation).`
  );

  try {
    const body: Record<string, unknown> = {};
    if (typeHint) body.type = typeHint;

    const result = await callInternal("/api/admin/hatchery", "POST", body);

    if (result.success || result.persona) {
      const r = result as Record<string, unknown>;
      const persona = r.persona as Record<string, unknown> | undefined;
      await reply(chatId,
        `🐣 <b>New Being Hatched!</b>\n\n` +
        `${persona?.avatar_emoji || "🆕"} <b>${persona?.display_name || "Unknown"}</b>\n` +
        `@${persona?.username || "unknown"}\n\n` +
        `${(persona?.bio as string || "").slice(0, 200)}\n\n` +
        `💰 Gifted ${r.glitchAmount || 1000} §GLITCH coins`
      );
    } else {
      await reply(chatId, `⚠️ Hatch result:\n<code>${JSON.stringify(result).slice(0, 500)}</code>`);
    }
  } catch (err) {
    await reply(chatId, `❌ Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function handleGenerate(chatId: number | string): Promise<void> {
  await reply(chatId, "⚡ Triggering persona content generation...");

  try {
    const result = await callInternal("/api/generate-persona-content");

    if (result.error) {
      await reply(chatId, `❌ ${result.error}`);
    } else {
      const r = result as Record<string, unknown>;
      await reply(chatId,
        `✅ <b>Content Generated</b>\n\n` +
        `${r.persona ? `Persona: ${r.persona}` : ""}\n` +
        `${r.postId ? `Post: ${r.postId}` : ""}\n` +
        `${r.mediaType ? `Media: ${r.mediaType}` : "Text post"}`
      );
    }
  } catch (err) {
    await reply(chatId, `❌ Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function handleStatus(chatId: number | string): Promise<void> {
  try {
    await callInternal("/api/telegram/status");
    // The status endpoint sends its own Telegram message
  } catch (err) {
    await reply(chatId, `❌ Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function handleCredits(chatId: number | string): Promise<void> {
  try {
    const result = await callInternal("/api/telegram/credit-check");
    if (!result.alerts || (result.alerts as unknown[]).length === 0) {
      const r = result as Record<string, unknown>;
      const balances = r.credit_balances as Record<string, Record<string, number>> | undefined;
      let msg = "✅ <b>Credits Looking Good</b>\n\n";
      if (balances?.anthropic) {
        const a = balances.anthropic;
        msg += `Claude: $${a.spent?.toFixed(2) || "?"} / $${a.budget || "?"} (${a.remaining != null ? `$${a.remaining.toFixed(2)} left` : "?"})\n`;
      }
      if (balances?.xai) {
        const x = balances.xai;
        msg += `xAI: $${x.spent?.toFixed(2) || "?"} / $${x.budget || "?"} (${x.remaining != null ? `$${x.remaining.toFixed(2)} left` : "?"})\n`;
      }
      await reply(chatId, msg);
    }
    // If there are alerts, the credit-check endpoint already sends them
  } catch (err) {
    await reply(chatId, `❌ Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function handlePersonaMessage(chatId: number | string): Promise<void> {
  try {
    await callInternal("/api/telegram/persona-message");
    // The persona-message endpoint sends its own Telegram message
  } catch (err) {
    await reply(chatId, `❌ Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function handleHelp(chatId: number | string): Promise<void> {
  return reply(chatId,
    `🤖 <b>AIG!itch Bot Commands</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `🎬 /glitchvideo [prompt] — Generate §GLITCH promo video\n` +
    `🖼️ /glitchimage [prompt] — Generate §GLITCH promo image\n` +
    `🥚 /hatch [type] — Hatch a new AI persona\n` +
    `⚡ /generate — Trigger content generation\n` +
    `📊 /status — System status report\n` +
    `💰 /credits — Check API credit balances\n` +
    `💬 /persona — Random persona message\n` +
    `❓ /help — Show this menu\n\n` +
    `<b>Examples:</b>\n` +
    `<i>/glitchvideo neon city with GLITCH coins raining from sky</i>\n` +
    `<i>/glitchimage cyberpunk robot holding a giant GLITCH coin</i>\n` +
    `<i>/hatch rockstar</i>`
  );
}

// ── Webhook Handler ─────────────────────────────────────────────────

/**
 * POST — Receives Telegram webhook updates.
 * Only processes messages from the configured admin chat ID.
 */
export async function POST(request: NextRequest) {
  const token = getBotToken();
  const adminChatId = getAdminChatId();

  if (!token || !adminChatId) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  let update: Record<string, unknown>;
  try {
    update = await request.json();
  } catch {
    return NextResponse.json({ ok: true }); // Telegram expects 200
  }

  const message = update.message as Record<string, unknown> | undefined;
  if (!message) {
    return NextResponse.json({ ok: true });
  }

  const chat = message.chat as Record<string, unknown>;
  const chatId = String(chat?.id);
  const text = (message.text as string || "").trim();

  // Security: only allow commands from admin chat
  if (chatId !== adminChatId) {
    console.warn(`[telegram/webhook] Ignoring message from unauthorized chat: ${chatId}`);
    return NextResponse.json({ ok: true });
  }

  // Parse command
  const [command, ...args] = text.split(/\s+/);
  const cmd = command.toLowerCase();

  // Route commands (don't await — respond to Telegram quickly, process in background)
  // But we need the response to go out, so we use waitUntil pattern
  switch (cmd) {
    case "/glitchvideo":
      handleGlitchVideo(chatId, args.join(" ") || undefined).catch(console.error);
      break;
    case "/glitchimage":
      handleGlitchImage(chatId, args.join(" ") || undefined).catch(console.error);
      break;
    case "/hatch":
      handleHatch(chatId, args.join(" ") || undefined).catch(console.error);
      break;
    case "/generate":
      handleGenerate(chatId).catch(console.error);
      break;
    case "/status":
      handleStatus(chatId).catch(console.error);
      break;
    case "/credits":
      handleCredits(chatId).catch(console.error);
      break;
    case "/persona":
      handlePersonaMessage(chatId).catch(console.error);
      break;
    case "/help":
    case "/start":
      handleHelp(chatId).catch(console.error);
      break;
    default:
      if (text.startsWith("/")) {
        reply(chatId, `Unknown command: ${cmd}\nType /help for available commands.`).catch(console.error);
      }
      break;
  }

  // Always return 200 to Telegram quickly
  return NextResponse.json({ ok: true });
}

/**
 * GET — Register/unregister webhook with Telegram.
 *
 * ?action=register  — Set webhook URL
 * ?action=unregister — Remove webhook
 * ?action=info — Get webhook info
 */
export async function GET(request: NextRequest) {
  const token = getBotToken();
  if (!token) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN not set" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "info";

  if (action === "register") {
    const baseUrl = env.NEXT_PUBLIC_APP_URL;
    if (!baseUrl) {
      return NextResponse.json({ error: "NEXT_PUBLIC_APP_URL not set" }, { status: 500 });
    }

    const webhookUrl = `${baseUrl}/api/telegram/webhook`;
    const res = await fetch(`${TELEGRAM_API}/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ["message"],
      }),
    });
    const data = await res.json();

    // Also register bot commands menu
    await fetch(`${TELEGRAM_API}/bot${token}/setMyCommands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commands: [
          { command: "glitchvideo", description: "Generate §GLITCH promo video" },
          { command: "glitchimage", description: "Generate §GLITCH promo image" },
          { command: "hatch", description: "Hatch a new AI persona" },
          { command: "generate", description: "Trigger content generation" },
          { command: "status", description: "System status report" },
          { command: "credits", description: "Check API credit balances" },
          { command: "persona", description: "Random persona message" },
          { command: "help", description: "Show all commands" },
        ],
      }),
    });

    return NextResponse.json({ action: "register", webhookUrl, result: data });
  }

  if (action === "unregister") {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/deleteWebhook`);
    const data = await res.json();
    return NextResponse.json({ action: "unregister", result: data });
  }

  // Default: get webhook info
  const res = await fetch(`${TELEGRAM_API}/bot${token}/getWebhookInfo`);
  const data = await res.json();
  return NextResponse.json({ action: "info", result: data });
}
