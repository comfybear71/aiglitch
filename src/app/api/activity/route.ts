import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sql = getDb();
    await ensureDbReady();

    // ── Run ALL independent queries in parallel ──
    const [
      recentActivity,
      pendingJobs,
      completedJobs,
      adTotalResult,
      adBreakdown,
      recentAds,
      lastPerSource,
      todayByHour,
      currentlyActiveResult,
      breakingCountResult,
      recentBreakingResult,
      activeTopics,
    ] = await Promise.all([
      sql`SELECT p.id, p.content, p.post_type, p.media_type, p.media_source,
        p.like_count, p.ai_like_count, p.comment_count, p.created_at,
        a.username, a.display_name, a.avatar_emoji, a.persona_type, a.activity_level
      FROM posts p JOIN ai_personas a ON p.persona_id = a.id
      WHERE p.is_reply_to IS NULL ORDER BY p.created_at DESC LIMIT 30`,

      sql`SELECT j.id, j.prompt, j.folder, j.caption, j.status, j.created_at,
        a.username, a.display_name, a.avatar_emoji
      FROM persona_video_jobs j LEFT JOIN ai_personas a ON j.persona_id = a.id
      WHERE j.status = 'submitted' ORDER BY j.created_at DESC LIMIT 10`,

      sql`SELECT j.id, j.folder, j.caption, j.status, j.created_at, j.completed_at,
        a.username, a.display_name, a.avatar_emoji
      FROM persona_video_jobs j LEFT JOIN ai_personas a ON j.persona_id = a.id
      WHERE j.status IN ('done', 'failed') ORDER BY j.completed_at DESC NULLS LAST LIMIT 10`,

      sql`SELECT COUNT(*) as count FROM posts WHERE post_type = 'product_shill' AND is_reply_to IS NULL`,

      sql`SELECT COALESCE(media_source, 'unknown') as source, media_type, COUNT(*) as count
      FROM posts WHERE post_type = 'product_shill' AND is_reply_to IS NULL
      GROUP BY media_source, media_type ORDER BY count DESC`,

      sql`SELECT p.id, p.content, p.media_type, p.media_source, p.created_at,
        a.username, a.display_name, a.avatar_emoji
      FROM posts p JOIN ai_personas a ON p.persona_id = a.id
      WHERE p.post_type = 'product_shill' AND p.is_reply_to IS NULL
      ORDER BY p.created_at DESC LIMIT 5`,

      sql`SELECT media_source, MAX(created_at) as last_at, COUNT(*) as total
      FROM posts WHERE is_reply_to IS NULL AND media_source IS NOT NULL GROUP BY media_source`,

      sql`SELECT EXTRACT(HOUR FROM created_at) as hour, COUNT(*) as count
      FROM posts WHERE is_reply_to IS NULL AND created_at > NOW() - INTERVAL '24 hours'
      GROUP BY EXTRACT(HOUR FROM created_at) ORDER BY hour`,

      sql`SELECT a.username, a.display_name, a.avatar_emoji, a.persona_type,
        a.activity_level, p.post_type, p.media_source, p.created_at
      FROM posts p JOIN ai_personas a ON p.persona_id = a.id
      WHERE p.is_reply_to IS NULL AND p.media_source = 'persona-content-cron'
      ORDER BY p.created_at DESC LIMIT 1`,

      sql`SELECT COUNT(*) as count FROM posts WHERE post_type = 'news' AND is_reply_to IS NULL`,

      sql`SELECT COUNT(*) as count FROM posts WHERE post_type = 'news' AND is_reply_to IS NULL AND created_at > NOW() - INTERVAL '1 hour'`,

      sql`SELECT headline, category, mood, created_at, expires_at FROM daily_topics
      WHERE is_active = TRUE AND expires_at > NOW() ORDER BY created_at DESC LIMIT 5`,
    ]);

    const [adTotal] = adTotalResult;
    const [currentlyActive] = currentlyActiveResult;
    const [breakingCount] = breakingCountResult;
    const [recentBreaking] = recentBreakingResult;

    // Activity throttle
    let activityThrottle = 100;
    try {
      const [throttleRow] = await sql`SELECT value FROM platform_settings WHERE key = 'activity_throttle'`;
      if (throttleRow) activityThrottle = Number(throttleRow.value);
    } catch { /* ignore */ }

    // Cron history + costs (wrapped safely)
    let cronHistory: any[] = [];
    let lastCronRuns: any[] = [];
    let cronTrend: any[] = [];
    let cronCosts: any[] = [];

    try {
      const [rows, lastRuns] = await Promise.all([
        sql`SELECT id, cron_name, status, started_at, finished_at, duration_ms, cost_usd, result, error
            FROM cron_runs ORDER BY started_at DESC LIMIT 50`,
        sql`SELECT DISTINCT ON (cron_name) cron_name, started_at, status
            FROM cron_runs ORDER BY cron_name, started_at DESC`,
      ]);
      cronHistory = rows;
      lastCronRuns = lastRuns;
    } catch { /* tables may not exist */ }

    try {
      const trendRows = await sql`
        SELECT cron_name, DATE_TRUNC('hour', started_at) as hour,
               COUNT(*) FILTER (WHERE status = 'completed')::int as completed,
               COUNT(*) FILTER (WHERE status = 'failed')::int as failed
        FROM cron_runs
        WHERE started_at > NOW() - INTERVAL '7 days'
        GROUP BY cron_name, DATE_TRUNC('hour', started_at)
        ORDER BY hour ASC
      `;
      cronTrend = trendRows;
    } catch { /* ignore */ }

    try {
      const costRows = await sql`
        SELECT cron_name,
          COALESCE(SUM(cost_usd) FILTER (WHERE started_at > NOW() - INTERVAL '24 hours' AND status = 'completed'), 0)::real as cost24h,
          COALESCE(SUM(cost_usd) FILTER (WHERE started_at > NOW() - INTERVAL '7 days' AND status = 'completed'), 0)::real as cost7d,
          COUNT(*) FILTER (WHERE started_at > NOW() - INTERVAL '24 hours' AND status = 'completed')::int as runs24h,
          COUNT(*) FILTER (WHERE started_at > NOW() - INTERVAL '7 days' AND status = 'completed')::int as runs7d,
          COUNT(*) FILTER (WHERE started_at > NOW() - INTERVAL '24 hours' AND status = 'throttled')::int as throttled24h,
          COUNT(*) FILTER (WHERE started_at > NOW() - INTERVAL '7 days' AND status = 'throttled')::int as throttled7d
        FROM cron_runs
        GROUP BY cron_name
        ORDER BY cost7d DESC
      `;
      cronCosts = costRows;
    } catch { /* ignore */ }

    return NextResponse.json({
      recentActivity,
      pendingJobs,
      completedJobs,
      ads: {
        total: Number(adTotal.count),
        breakdown: adBreakdown.map(a => ({
          source: a.source,
          mediaType: a.media_type || "text",
          count: Number(a.count),
        })),
        recent: recentAds,
      },
      lastPerSource: lastPerSource.map(s => ({
        source: s.media_source,
        lastAt: s.last_at,
        total: Number(s.total),
      })),
      todayByHour: todayByHour.map(h => ({
        hour: Number(h.hour),
        count: Number(h.count),
      })),
      currentlyActive: currentlyActive || null,
      breaking: {
        total: Number(breakingCount.count),
        lastHour: Number(recentBreaking.count),
      },
      activeTopics,
      activityThrottle,
      cronHistory,
      lastCronRuns,
      cronTrend,
      cronCosts,
      cronSchedules: [
        { name: "Persona Content", path: "/api/generate-persona-content", interval: 5, unit: "min" },
        { name: "General Content", path: "/api/generate", interval: 6, unit: "min" },
        { name: "AI Trading", path: "/api/ai-trading", interval: 10, unit: "min" },
        { name: "Budju Trading", path: "/api/budju-trading", interval: 8, unit: "min" },
        { name: "Avatars", path: "/api/generate-avatars", interval: 20, unit: "min" },
        { name: "Topics & News", path: "/api/generate-topics", interval: 30, unit: "min" },
        { name: "Ads", path: "/api/generate-ads", interval: 120, unit: "min" },
      ],
    });

  } catch (error) {
    console.error("Activity API error:", error);
    return NextResponse.json({
      recentActivity: [],
      pendingJobs: [],
      completedJobs: [],
      ads: { total: 0, breakdown: [], recent: [] },
      lastPerSource: [],
      todayByHour: [],
      currentlyActive: null,
      breaking: { total: 0, lastHour: 0 },
      activeTopics: [],
      activityThrottle: 100,
      cronHistory: [],
      lastCronRuns: [],
      cronTrend: [],
      cronCosts: [],
      cronSchedules: [],
    });
  }
}

