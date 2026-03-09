/**
 * Telegram Credit Check Cron
 * ============================
 * GET /api/telegram/credit-check — Check credit balances and alert if low.
 *
 * Runs on a cron schedule (every 30 minutes).
 * Checks both Anthropic and xAI credit statuses via their API endpoints,
 * compares against configured budgets, and sends Telegram alerts when:
 *   - Credits are exhausted (API returns 429/error)
 *   - Budget usage exceeds 80%
 *
 * Also detects content generation stalls and alerts.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkCronAuth } from "@/lib/cron-auth";
import { getDb } from "@/lib/db";
import { env } from "@/lib/bible/env";
import { checkAndAlertCredits, sendAdminAlert } from "@/lib/telegram";

// ── Check AI API health (same logic as /api/health) ──

async function checkApiHealth(provider: "anthropic" | "xai"): Promise<{
  status: "ok" | "warn" | "error";
  detail: string;
}> {
  try {
    if (provider === "anthropic") {
      if (!env.ANTHROPIC_API_KEY) return { status: "error", detail: "No API key configured" };
      const res = await fetch("https://api.anthropic.com/v1/models", {
        headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return { status: "ok", detail: "Active" };
      const body = await res.text().catch(() => "");
      if (res.status === 429 || body.includes("credit") || body.includes("exhausted"))
        return { status: "error", detail: `Credits exhausted (HTTP ${res.status})` };
      return { status: "warn", detail: `HTTP ${res.status}` };
    } else {
      if (!env.XAI_API_KEY) return { status: "error", detail: "No API key configured" };
      const res = await fetch("https://api.x.ai/v1/models", {
        headers: { Authorization: `Bearer ${env.XAI_API_KEY}` },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return { status: "ok", detail: "Active" };
      const body = await res.text().catch(() => "");
      if (res.status === 429 || body.includes("credit") || body.includes("exhausted"))
        return { status: "error", detail: `Credits exhausted (HTTP ${res.status})` };
      return { status: "warn", detail: `HTTP ${res.status}` };
    }
  } catch (e) {
    return { status: "warn", detail: e instanceof Error ? e.message : "Timeout" };
  }
}

// ── Get tracked spend from DB ──

async function getMonthlySpend(): Promise<{
  anthropic: number;
  xai: number;
}> {
  try {
    const sql = getDb();
    const rows = await sql`
      SELECT
        provider,
        COALESCE(SUM(estimated_cost_usd), 0) as total
      FROM ai_cost_log
      WHERE created_at >= DATE_TRUNC('month', NOW())
      GROUP BY provider
    ` as unknown as { provider: string; total: number }[];

    let anthropic = 0;
    let xai = 0;
    for (const row of rows) {
      const cost = Number(row.total);
      if (row.provider === "claude") anthropic += cost;
      if (row.provider.startsWith("grok")) xai += cost;
    }
    return { anthropic, xai };
  } catch {
    return { anthropic: 0, xai: 0 };
  }
}

// ── Check content freshness ──

async function checkContentFreshness(): Promise<{ ageMinutes: number | null; stale: boolean }> {
  try {
    const sql = getDb();
    const [row] = await sql`
      SELECT created_at FROM posts
      WHERE is_reply_to IS NULL
      ORDER BY created_at DESC LIMIT 1
    `;
    if (!row?.created_at) return { ageMinutes: null, stale: false };
    const ageMs = Date.now() - new Date(row.created_at).getTime();
    const ageMinutes = Math.round(ageMs / 60000);
    return { ageMinutes, stale: ageMinutes > 60 };
  } catch {
    return { ageMinutes: null, stale: false };
  }
}

export async function GET(request: NextRequest) {
  if (!(await checkCronAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: string[] = [];

  // 1. Check API health for both providers
  const [anthropicHealth, xaiHealth, spend, freshness] = await Promise.all([
    checkApiHealth("anthropic"),
    checkApiHealth("xai"),
    getMonthlySpend(),
    checkContentFreshness(),
  ]);

  // 2. Build credit balances
  const anthropicBudget = env.ANTHROPIC_MONTHLY_BUDGET ?? null;
  const xaiBudget = env.XAI_MONTHLY_BUDGET ?? null;

  const creditBalances = {
    anthropic: {
      budget: anthropicBudget,
      spent: Math.round(spend.anthropic * 100) / 100,
      remaining: anthropicBudget != null ? Math.round((anthropicBudget - spend.anthropic) * 100) / 100 : null,
    },
    xai: {
      budget: xaiBudget,
      spent: Math.round(spend.xai * 100) / 100,
      remaining: xaiBudget != null ? Math.round((xaiBudget - spend.xai) * 100) / 100 : null,
    },
  };

  // 3. Check and send credit alerts
  const creditResult = await checkAndAlertCredits(creditBalances, {
    anthropic_claude: anthropicHealth,
    xai_grok: xaiHealth,
  });
  results.push(`Credit alerts sent: ${creditResult.alerted.join(", ") || "none"}`);

  // 4. Check content freshness — alert if stale
  if (freshness.stale && freshness.ageMinutes != null) {
    await sendAdminAlert(
      "Content Generation Stalled",
      `Last post was <b>${freshness.ageMinutes} minutes ago</b> (threshold: 60m).\n\nCheck cron jobs and API health on the admin dashboard.`,
      "warning",
    );
    results.push(`Content stale alert: ${freshness.ageMinutes}m`);
  }

  return NextResponse.json({
    checked_at: new Date().toISOString(),
    credit_balances: creditBalances,
    api_health: { anthropic: anthropicHealth, xai: xaiHealth },
    content_freshness: freshness,
    alerts: results,
  });
}
