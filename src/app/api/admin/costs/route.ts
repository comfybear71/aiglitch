/**
 * Admin Cost Dashboard API (#17)
 * ================================
 * Returns AI spend data for the admin dashboard.
 *
 * GET /api/admin/costs               → current session costs + 7-day history
 * GET /api/admin/costs?days=30       → custom history window
 */

import { NextRequest, NextResponse } from "next/server";
import { checkCronAuth } from "@/lib/cron-auth";
import { getDb } from "@/lib/db";
import { getCostSummary, getCostHistory } from "@/lib/ai/costs";

/** Fetch Vercel usage data via their REST API. */
async function fetchVercelUsage(): Promise<{
  available: boolean;
  usage?: { period: string; bandwidth_gb: number; builds: number; serverless_invocations: number; estimated_cost_usd: number };
  error?: string;
}> {
  const token = process.env.VERCEL_TOKEN;
  if (!token) return { available: false };

  try {
    const teamId = process.env.VERCEL_TEAM_ID;

    // Build query params — Vercel usage API requires 'from' (and optionally 'to')
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const params = new URLSearchParams();
    if (teamId) params.set("teamId", teamId);
    params.set("from", startOfMonth.toISOString());
    params.set("to", now.toISOString());

    // Fetch project usage from Vercel API
    const res = await fetch(`https://api.vercel.com/v1/usage?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (!res.ok) {
      const text = await res.text();
      return { available: true, error: `Vercel API ${res.status}: ${text.slice(0, 200)}` };
    }

    const data = await res.json();

    // Vercel usage API returns various metrics
    const period = data.billing?.period || "current";
    const bandwidth = data.bandwidth?.value || data.metrics?.bandwidth || 0;
    const builds = data.builds?.value || data.metrics?.builds || 0;
    const invocations = data.serverlessFunctionExecution?.value || data.metrics?.serverlessFunctionExecution || 0;

    // Estimate cost from usage (Vercel Hobby = free, Pro = $20/mo base)
    // Bandwidth: $0.15/GB after 1TB, Builds: 6000 min free, Functions: 1M free
    const bandwidthGb = bandwidth / (1024 * 1024 * 1024);
    const estimatedCost = data.billing?.invoiceTotal
      ? Number(data.billing.invoiceTotal) / 100
      : 0;

    return {
      available: true,
      usage: {
        period,
        bandwidth_gb: Math.round(bandwidthGb * 100) / 100,
        builds: Number(builds),
        serverless_invocations: Number(invocations),
        estimated_cost_usd: estimatedCost,
      },
    };
  } catch (err) {
    return { available: true, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Build credit balance info from env budgets + tracked spend. */
async function getCreditBalances(
  providerTotals: { provider: string; total_usd: number; count: number }[],
): Promise<{
  anthropic: { budget: number | null; spent: number; remaining: number | null };
  xai: { budget: number | null; spent: number; remaining: number | null };
}> {
  const anthropicBudget = process.env.ANTHROPIC_MONTHLY_BUDGET
    ? Number(process.env.ANTHROPIC_MONTHLY_BUDGET)
    : null;
  const xaiBudget = process.env.XAI_MONTHLY_BUDGET
    ? Number(process.env.XAI_MONTHLY_BUDGET)
    : null;

  // Sum spend per vendor family from tracked costs
  let anthropicSpent = 0;
  let xaiSpent = 0;
  for (const pt of providerTotals) {
    const cost = Number(pt.total_usd);
    if (pt.provider === "claude") anthropicSpent += cost;
    if (pt.provider.startsWith("grok")) xaiSpent += cost;
  }

  return {
    anthropic: {
      budget: anthropicBudget,
      spent: Math.round(anthropicSpent * 100) / 100,
      remaining: anthropicBudget != null ? Math.round((anthropicBudget - anthropicSpent) * 100) / 100 : null,
    },
    xai: {
      budget: xaiBudget,
      spent: Math.round(xaiSpent * 100) / 100,
      remaining: xaiBudget != null ? Math.round((xaiBudget - xaiSpent) * 100) / 100 : null,
    },
  };
}

export async function GET(request: NextRequest) {
  if (!(await checkCronAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const days = Number(request.nextUrl.searchParams.get("days") || "7");

  try {
    const sql = getDb();

    // In-memory costs since last flush
    const currentSession = getCostSummary();

    // Historical costs from DB
    const history = await getCostHistory(sql, days);

    // Total spend across all time
    let lifetimeTotal = 0;
    let lifetimeCount = 0;
    try {
      const [row] = await sql`
        SELECT
          COALESCE(ROUND(SUM(estimated_cost_usd)::numeric, 4), 0) as total,
          COALESCE(COUNT(*)::int, 0) as count
        FROM ai_cost_log
      `;
      lifetimeTotal = Number(row?.total ?? 0);
      lifetimeCount = Number(row?.count ?? 0);
    } catch {
      // Table may not exist yet
    }

    // Top 5 most expensive tasks (last 7 days)
    let topTasks: { task: string; provider: string; total_usd: number; count: number }[] = [];
    try {
      topTasks = await sql`
        SELECT
          task,
          provider,
          ROUND(SUM(estimated_cost_usd)::numeric, 4) as total_usd,
          COUNT(*)::int as count
        FROM ai_cost_log
        WHERE created_at > NOW() - INTERVAL '1 day' * ${days}
        GROUP BY task, provider
        ORDER BY total_usd DESC
        LIMIT 5
      ` as unknown as typeof topTasks;
    } catch {
      // Table may not exist yet
    }

    // Per-provider lifetime totals
    let providerTotals: { provider: string; total_usd: number; count: number }[] = [];
    try {
      providerTotals = await sql`
        SELECT
          provider,
          ROUND(SUM(estimated_cost_usd)::numeric, 4) as total_usd,
          COUNT(*)::int as count
        FROM ai_cost_log
        GROUP BY provider
        ORDER BY total_usd DESC
      ` as unknown as typeof providerTotals;
    } catch {
      // Table may not exist yet
    }

    // Daily totals for chart (last N days)
    let dailyTotals: { date: string; total_usd: number; count: number }[] = [];
    try {
      dailyTotals = await sql`
        SELECT
          DATE(created_at) as date,
          ROUND(SUM(estimated_cost_usd)::numeric, 4) as total_usd,
          COUNT(*)::int as count
        FROM ai_cost_log
        WHERE created_at > NOW() - INTERVAL '1 day' * ${days}
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      ` as unknown as typeof dailyTotals;
    } catch {
      // Table may not exist yet
    }

    // Fetch credit balances and Vercel usage in parallel
    const [creditBalances, vercelUsage] = await Promise.all([
      getCreditBalances(providerTotals),
      fetchVercelUsage(),
    ]);

    return NextResponse.json({
      current_session: {
        total_usd: currentSession.totalUsd,
        entry_count: currentSession.entryCount,
        by_provider: currentSession.byProvider,
        by_task: currentSession.byTask,
        since: currentSession.since,
      },
      lifetime: {
        total_usd: lifetimeTotal,
        total_calls: lifetimeCount,
      },
      history,
      top_tasks: topTasks,
      provider_totals: providerTotals,
      daily_totals: dailyTotals,
      credit_balances: creditBalances,
      vercel: vercelUsage,
      days,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
