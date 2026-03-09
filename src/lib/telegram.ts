/**
 * Telegram Bot Integration — AIG!itch
 * =====================================
 * Sends notifications to a Telegram channel for:
 *   - Credit/budget alerts (low balance warnings)
 *   - Admin action items (errors, content stalls, API failures)
 *   - System status updates (health summaries, cron stats)
 *
 * Setup:
 *   1. Create a bot via @BotFather on Telegram → get TELEGRAM_BOT_TOKEN
 *   2. Create a channel, add the bot as admin
 *   3. Get the channel ID (forward a message to @userinfobot or use @username)
 *   4. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID in env
 *
 * Usage:
 *   import { sendTelegramMessage, sendCreditAlert, sendStatusUpdate } from "@/lib/telegram";
 *
 *   await sendTelegramMessage("Hello from AIG!itch 🤖");
 *   await sendCreditAlert("xai", 12.50, 100);
 *   await sendStatusUpdate({ ... });
 */

import { env } from "@/lib/bible/env";

// ── Config ──────────────────────────────────────────────────────────

const TELEGRAM_API = "https://api.telegram.org";

function getBotToken(): string | undefined {
  return process.env.TELEGRAM_BOT_TOKEN;
}

function getChannelId(): string | undefined {
  return process.env.TELEGRAM_CHANNEL_ID;
}

// ── Core Send ───────────────────────────────────────────────────────

export interface TelegramResult {
  ok: boolean;
  messageId?: number;
  error?: string;
}

/**
 * Send a message to the configured Telegram channel.
 * Supports Markdown V2 and HTML parse modes.
 */
export async function sendTelegramMessage(
  text: string,
  options?: { parseMode?: "HTML" | "MarkdownV2"; disablePreview?: boolean },
): Promise<TelegramResult> {
  const token = getBotToken();
  const chatId = getChannelId();

  if (!token || !chatId) {
    console.warn("[telegram] Bot token or channel ID not configured — skipping");
    return { ok: false, error: "Not configured" };
  }

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: options?.parseMode ?? "HTML",
        disable_web_page_preview: options?.disablePreview ?? true,
      }),
      signal: AbortSignal.timeout(10000),
    });

    const data = await res.json();

    if (!data.ok) {
      console.error("[telegram] API error:", data.description);
      return { ok: false, error: data.description };
    }

    return { ok: true, messageId: data.result?.message_id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[telegram] Send failed:", msg);
    return { ok: false, error: msg };
  }
}

// ── Credit Alerts ───────────────────────────────────────────────────

export type CreditProvider = "anthropic" | "xai";

export interface CreditStatus {
  provider: CreditProvider;
  spent: number;
  budget: number | null;
  remaining: number | null;
  apiStatus: "ok" | "warn" | "error";
  detail?: string;
}

/**
 * Send a low-credit alert for a specific provider.
 */
export async function sendCreditAlert(credit: CreditStatus): Promise<TelegramResult> {
  const providerName = credit.provider === "xai" ? "xAI / Grok" : "Anthropic / Claude";
  const emoji = credit.apiStatus === "error" ? "🔴" : "🟡";
  const pct = credit.budget ? Math.round((credit.spent / credit.budget) * 100) : null;

  let message = `${emoji} <b>Credit Alert: ${providerName}</b>\n\n`;

  if (credit.apiStatus === "error" && credit.detail?.includes("exhausted")) {
    message += `⛔ <b>CREDITS EXHAUSTED</b> — API calls will fail!\n\n`;
  }

  message += `💰 Spent: <b>$${credit.spent.toFixed(2)}</b>`;
  if (credit.budget) {
    message += ` / $${credit.budget.toFixed(2)}`;
    message += `\n📊 Usage: <b>${pct}%</b>`;
    if (credit.remaining != null) {
      message += `\n💵 Remaining: <b>$${credit.remaining.toFixed(2)}</b>`;
    }
  }
  message += `\n\n`;

  if (credit.detail) {
    message += `ℹ️ ${credit.detail}\n\n`;
  }

  // Action links
  const dashboardUrl = credit.provider === "xai"
    ? "https://console.x.ai/team/billing"
    : "https://console.anthropic.com/settings/billing";

  message += `👉 <a href="${dashboardUrl}">Top up credits →</a>`;

  return sendTelegramMessage(message);
}

/**
 * Check all credit balances and alert if any are low.
 * Returns which providers triggered alerts.
 */
export async function checkAndAlertCredits(
  creditBalances: {
    anthropic: { budget: number | null; spent: number; remaining: number | null };
    xai: { budget: number | null; spent: number; remaining: number | null };
  },
  aiServiceStatuses?: Record<string, { status: string; detail: string }>,
): Promise<{ alerted: CreditProvider[]; skipped: CreditProvider[] }> {
  const alertThresholdPct = 80; // Alert when 80%+ of budget is used
  const alerted: CreditProvider[] = [];
  const skipped: CreditProvider[] = [];

  const providers: { key: CreditProvider; data: typeof creditBalances.anthropic }[] = [
    { key: "anthropic", data: creditBalances.anthropic },
    { key: "xai", data: creditBalances.xai },
  ];

  for (const { key, data } of providers) {
    const svcStatus = aiServiceStatuses?.[key === "xai" ? "xai_grok" : "anthropic_claude"];
    const apiStatus = (svcStatus?.status as "ok" | "warn" | "error") ?? "ok";

    // Alert conditions:
    // 1. API is returning errors (credits exhausted)
    // 2. Budget is set and usage exceeds threshold
    const isExhausted = apiStatus === "error";
    const isOverThreshold = data.budget != null && data.spent > 0 &&
      (data.spent / data.budget) * 100 >= alertThresholdPct;

    if (isExhausted || isOverThreshold) {
      await sendCreditAlert({
        provider: key,
        spent: data.spent,
        budget: data.budget,
        remaining: data.remaining,
        apiStatus,
        detail: svcStatus?.detail,
      });
      alerted.push(key);
    } else {
      skipped.push(key);
    }
  }

  return { alerted, skipped };
}

// ── Admin Notifications ─────────────────────────────────────────────

/**
 * Send an admin action-required notification.
 */
export async function sendAdminAlert(
  title: string,
  details: string,
  severity: "info" | "warning" | "critical" = "warning",
): Promise<TelegramResult> {
  const emoji = severity === "critical" ? "🚨" : severity === "warning" ? "⚠️" : "ℹ️";
  const message = `${emoji} <b>${title}</b>\n\n${details}`;
  return sendTelegramMessage(message);
}

// ── Status Updates ──────────────────────────────────────────────────

export interface SystemStatus {
  overallStatus: "ok" | "degraded" | "down";
  contentFresh: boolean;
  lastPostAgeSeconds: number | null;
  counts: Record<string, number>;
  creditBalances: {
    anthropic: { budget: number | null; spent: number; remaining: number | null };
    xai: { budget: number | null; spent: number; remaining: number | null };
  };
  cronIssues?: string[];
  serviceIssues?: string[];
}

/**
 * Send a formatted system status update to the channel.
 */
export async function sendStatusUpdate(status: SystemStatus): Promise<TelegramResult> {
  const emoji = status.overallStatus === "ok" ? "✅" : status.overallStatus === "degraded" ? "🟡" : "🔴";

  let msg = `${emoji} <b>AIG!itch Status Report</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // System health
  msg += `<b>System:</b> ${status.overallStatus.toUpperCase()}\n`;

  // Content freshness
  if (status.lastPostAgeSeconds != null) {
    const mins = Math.round(status.lastPostAgeSeconds / 60);
    const freshEmoji = status.contentFresh ? "✅" : "⚠️";
    msg += `${freshEmoji} Last post: ${mins}m ago\n`;
  }

  // Key counts
  if (status.counts.all_posts != null) {
    msg += `📝 Posts: ${status.counts.all_posts.toLocaleString()}`;
    if (status.counts.video_posts) msg += ` (${status.counts.video_posts} video)`;
    msg += `\n`;
  }
  if (status.counts.human_users != null) {
    msg += `👥 Users: ${status.counts.human_users}\n`;
  }

  msg += `\n`;

  // Credits
  msg += `<b>Credits:</b>\n`;
  const { anthropic, xai } = status.creditBalances;
  if (anthropic.budget != null) {
    const pct = Math.round((anthropic.spent / anthropic.budget) * 100);
    const bar = progressBar(pct);
    msg += `Claude: $${anthropic.spent.toFixed(2)}/$${anthropic.budget} ${bar}\n`;
  }
  if (xai.budget != null) {
    const pct = Math.round((xai.spent / xai.budget) * 100);
    const bar = progressBar(pct);
    msg += `xAI:    $${xai.spent.toFixed(2)}/$${xai.budget} ${bar}\n`;
  }

  // Issues
  const issues = [...(status.cronIssues ?? []), ...(status.serviceIssues ?? [])];
  if (issues.length > 0) {
    msg += `\n<b>Issues:</b>\n`;
    for (const issue of issues.slice(0, 5)) {
      msg += `• ${issue}\n`;
    }
  }

  msg += `\n🔗 <a href="${env.NEXT_PUBLIC_APP_URL}/admin">Admin Dashboard →</a>`;

  return sendTelegramMessage(msg);
}

// ── Helpers ─────────────────────────────────────────────────────────

function progressBar(pct: number): string {
  const filled = Math.min(Math.round(pct / 10), 10);
  const empty = 10 - filled;
  const bar = "█".repeat(filled) + "░".repeat(empty);
  const emoji = pct >= 90 ? "🔴" : pct >= 70 ? "🟡" : "🟢";
  return `${emoji} ${bar} ${pct}%`;
}
