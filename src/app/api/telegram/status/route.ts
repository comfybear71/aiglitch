/**
 * Telegram Status Report Endpoint
 * =================================
 * GET /api/telegram/status — Send a full system status report to the Telegram channel.
 *
 * Runs on a cron schedule (every 6 hours) or manually from admin.
 * Aggregates system health, content stats, credit balances, and recent issues
 * into a formatted Telegram message.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkCronAuth } from "@/lib/cron-auth";
import { getDb } from "@/lib/db";
import { env } from "@/lib/bible/env";
import { sendStatusUpdate, type SystemStatus } from "@/lib/telegram";

export async function GET(request: NextRequest) {
  if (!(await checkCronAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sql = getDb();

    // Gather all stats in parallel
    const [
      postsResult,
      videoResult,
      usersResult,
      lastPostResult,
      cronResult,
      spendResult,
    ] = await Promise.all([
      sql`SELECT COUNT(*)::int as count FROM posts`.catch(() => [{ count: 0 }]),
      sql`SELECT COUNT(*)::int as count FROM posts WHERE media_type = 'video' AND media_url IS NOT NULL`.catch(() => [{ count: 0 }]),
      sql`SELECT COUNT(*)::int as count FROM human_users`.catch(() => [{ count: 0 }]),
      sql`SELECT created_at FROM posts WHERE is_reply_to IS NULL ORDER BY created_at DESC LIMIT 1`.catch(() => []),
      sql`
        SELECT job_name, status, error FROM cron_runs
        WHERE started_at > NOW() - INTERVAL '6 hours'
        ORDER BY started_at DESC
      `.catch(() => []),
      sql`
        SELECT provider, COALESCE(SUM(estimated_cost_usd), 0) as total
        FROM ai_cost_log
        WHERE created_at >= DATE_TRUNC('month', NOW())
        GROUP BY provider
      `.catch(() => []),
    ]);

    // Parse counts
    const counts: Record<string, number> = {
      all_posts: Number(postsResult[0]?.count ?? 0),
      video_posts: Number(videoResult[0]?.count ?? 0),
      human_users: Number(usersResult[0]?.count ?? 0),
    };

    // Content freshness
    const lastPostAt = lastPostResult[0]?.created_at;
    const lastPostAgeSeconds = lastPostAt
      ? Math.round((Date.now() - new Date(lastPostAt).getTime()) / 1000)
      : null;
    const contentFresh = lastPostAgeSeconds != null && lastPostAgeSeconds < 1800;

    // Credit balances
    let anthropicSpent = 0;
    let xaiSpent = 0;
    for (const row of spendResult as { provider: string; total: number }[]) {
      const cost = Number(row.total);
      if (row.provider === "claude") anthropicSpent += cost;
      if (row.provider.startsWith("grok")) xaiSpent += cost;
    }

    const creditBalances = {
      anthropic: {
        budget: env.ANTHROPIC_MONTHLY_BUDGET ?? null,
        spent: Math.round(anthropicSpent * 100) / 100,
        remaining: env.ANTHROPIC_MONTHLY_BUDGET != null
          ? Math.round((env.ANTHROPIC_MONTHLY_BUDGET - anthropicSpent) * 100) / 100
          : null,
      },
      xai: {
        budget: env.XAI_MONTHLY_BUDGET ?? null,
        spent: Math.round(xaiSpent * 100) / 100,
        remaining: env.XAI_MONTHLY_BUDGET != null
          ? Math.round((env.XAI_MONTHLY_BUDGET - xaiSpent) * 100) / 100
          : null,
      },
    };

    // Cron issues (failed jobs in last 6h)
    const cronIssues: string[] = [];
    const cronArr = cronResult as { job_name: string; status: string; error: string }[];
    for (const run of cronArr) {
      if (run.status === "error" || run.status === "failed") {
        cronIssues.push(`${run.job_name}: ${run.error || "failed"}`);
      }
    }

    // Determine overall status
    let overallStatus: "ok" | "degraded" | "down" = "ok";
    if (!contentFresh || cronIssues.length > 2) overallStatus = "degraded";
    if (lastPostAgeSeconds != null && lastPostAgeSeconds > 7200) overallStatus = "down";

    const status: SystemStatus = {
      overallStatus,
      contentFresh,
      lastPostAgeSeconds,
      counts,
      creditBalances,
      cronIssues: cronIssues.slice(0, 5),
    };

    const result = await sendStatusUpdate(status);

    return NextResponse.json({
      sent: result.ok,
      status,
      telegram: result,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
