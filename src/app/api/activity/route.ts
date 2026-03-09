import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  const sql = getDb();
  await ensureDbReady();

  // ── Run ALL independent queries in parallel (was 12+ sequential round-trips) ──
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

  // Director movie stats + recent movies (may not exist yet)
  let directorStats = { total: 0, generating: 0, lastAt: null as string | null };
  let recentMovies: { id: string; title: string; genre: string; director_username: string; director_display_name: string; status: string; clip_count: number; created_at: string; video_url: string | null; premiere_post_id: string | null }[] = [];
  try {
    const [dmTotalResult, dmGeneratingResult, dmLastResult, movieRows] = await Promise.all([
      sql`SELECT COUNT(*)::int as count FROM director_movies WHERE COALESCE(source, 'cron') = 'cron'`,
      sql`SELECT COUNT(*)::int as count FROM director_movies WHERE status IN ('pending', 'generating') AND COALESCE(source, 'cron') = 'cron'`,
      sql`SELECT created_at FROM director_movies WHERE COALESCE(source, 'cron') = 'cron' ORDER BY created_at DESC LIMIT 1`,
      sql`SELECT dm.id, dm.title, dm.genre, dm.director_username, dm.status, dm.clip_count,
        dm.created_at, dm.premiere_post_id, a.display_name as director_display_name, p.media_url as video_url
      FROM director_movies dm LEFT JOIN ai_personas a ON a.id = dm.director_id
      LEFT JOIN posts p ON p.id = dm.premiere_post_id
      WHERE COALESCE(dm.source, 'cron') = 'cron' ORDER BY dm.created_at DESC LIMIT 20`,
    ]);
    directorStats = {
      total: Number(dmTotalResult[0]?.count || 0),
      generating: Number(dmGeneratingResult[0]?.count || 0),
      lastAt: dmLastResult[0]?.created_at ? String(dmLastResult[0].created_at) : null,
    };
    recentMovies = movieRows.map(m => ({
      id: m.id as string, title: m.title as string, genre: m.genre as string,
      director_username: m.director_username as string,
      director_display_name: (m.director_display_name || m.director_username) as string,
      status: m.status as string, clip_count: Number(m.clip_count),
      created_at: String(m.created_at),
      video_url: m.video_url ? String(m.video_url) : null,
      premiere_post_id: m.premiere_post_id ? String(m.premiere_post_id) : null,
    }));

    // Add clip-level diagnostics for failed/generating movies
    const failedOrActiveIds = recentMovies
      .filter(m => m.status === "failed" || m.status === "generating")
      .map(m => m.id);
    if (failedOrActiveIds.length > 0) {
      try {
        const clipDiag = await sql`
          SELECT dm.id as movie_id, s.scene_number, s.status, s.fail_reason,
            EXTRACT(EPOCH FROM (COALESCE(s.completed_at, NOW()) - s.created_at))::int as elapsed_secs
          FROM multi_clip_scenes s
          JOIN multi_clip_jobs j ON s.job_id = j.id
          JOIN director_movies dm ON dm.multi_clip_job_id = j.id
          WHERE dm.id = ANY(${failedOrActiveIds})
          ORDER BY dm.id, s.scene_number
        ` as unknown as { movie_id: string; scene_number: number; status: string; fail_reason: string | null; elapsed_secs: number }[];
        // Attach diagnostics to each movie
        for (const movie of recentMovies) {
          const scenes = clipDiag.filter(c => c.movie_id === movie.id);
          if (scenes.length > 0) {
            (movie as Record<string, unknown>).clipDiagnostics = scenes.map(s => ({
              scene: s.scene_number,
              status: s.status,
              failReason: s.fail_reason,
              elapsedMin: Math.round(s.elapsed_secs / 60),
            }));
          }
        }
      } catch { /* fail_reason column may not exist yet */ }
    }
  } catch { /* table may not exist yet */ }

  // Activity throttle setting
  let activityThrottle = 100;
  try {
    const [throttleRow] = await sql`SELECT value FROM platform_settings WHERE key = 'activity_throttle'`;
    if (throttleRow) activityThrottle = Number(throttleRow.value);
  } catch { /* table may not exist yet */ }

  // Cron execution history
  let cronHistory: { id: string; cronName: string; status: string; startedAt: string; finishedAt: string | null; durationMs: number | null; costUsd: number | null; result: string | null; error: string | null }[] = [];
  let lastCronRuns: { cronName: string; lastStartedAt: string; lastStatus: string }[] = [];
  try {
    const [rows, lastRuns] = await Promise.all([
      sql`SELECT id, cron_name, status, started_at, finished_at, duration_ms, cost_usd, result, error
      FROM cron_runs ORDER BY started_at DESC LIMIT 50`,
      sql`SELECT DISTINCT ON (cron_name) cron_name, started_at, status
      FROM cron_runs ORDER BY cron_name, started_at DESC`,
    ]);
    cronHistory = rows.map(r => ({
      id: r.id as string, cronName: r.cron_name as string, status: r.status as string,
      startedAt: String(r.started_at), finishedAt: r.finished_at ? String(r.finished_at) : null,
      durationMs: r.duration_ms ? Number(r.duration_ms) : null,
      costUsd: r.cost_usd ? Number(r.cost_usd) : null,
      result: r.result ? String(r.result) : null, error: r.error ? String(r.error) : null,
    }));
    lastCronRuns = lastRuns.map(r => ({
      cronName: r.cron_name as string, lastStartedAt: String(r.started_at), lastStatus: r.status as string,
    }));
  } catch { /* table may not exist yet */ }

  // Build lastPerSource map, inject director-movie from director_movies table if not in posts
  const lastPerSourceArr = lastPerSource.map(s => ({
    source: s.media_source as string,
    lastAt: s.last_at as string,
    total: Number(s.total),
  }));
  if (directorStats.lastAt && !lastPerSourceArr.find(s => s.source === "director-movie")) {
    lastPerSourceArr.push({ source: "director-movie", lastAt: directorStats.lastAt, total: directorStats.total });
  }

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
    lastPerSource: lastPerSourceArr,
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
    directorStats,
    recentMovies,
    cronHistory,
    lastCronRuns,
    cronSchedules: [
      { name: "Persona Content", path: "/api/generate-persona-content", interval: 5, unit: "min" },
      { name: "General Content", path: "/api/generate", interval: 6, unit: "min" },
      { name: "Director Movies", path: "/api/generate-director-movie", interval: 10, unit: "min" },
      { name: "AI Trading", path: "/api/ai-trading", interval: 10, unit: "min" },
      { name: "Budju Trading", path: "/api/budju-trading", interval: 8, unit: "min" },
      { name: "Avatars", path: "/api/generate-avatars", interval: 20, unit: "min" },
      { name: "Topics & News", path: "/api/generate-topics", interval: 30, unit: "min" },
      { name: "Ads", path: "/api/generate-ads", interval: 120, unit: "min" },
    ],
  });
}
