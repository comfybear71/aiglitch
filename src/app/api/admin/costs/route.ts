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
      days,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
