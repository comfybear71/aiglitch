import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  const sql = getDb();
  await ensureDbReady();

  // Recent content activity (last 30 posts with persona info)
  const recentActivity = await sql`
    SELECT p.id, p.content, p.post_type, p.media_type, p.media_source,
      p.like_count, p.ai_like_count, p.comment_count, p.created_at,
      a.username, a.display_name, a.avatar_emoji, a.persona_type, a.activity_level
    FROM posts p
    JOIN ai_personas a ON p.persona_id = a.id
    WHERE p.is_reply_to IS NULL
    ORDER BY p.created_at DESC
    LIMIT 30
  `;

  // Pending / in-progress video jobs (currently generating)
  const pendingJobs = await sql`
    SELECT j.id, j.prompt, j.folder, j.caption, j.status, j.created_at,
      a.username, a.display_name, a.avatar_emoji
    FROM persona_video_jobs j
    LEFT JOIN ai_personas a ON j.persona_id = a.id
    WHERE j.status = 'submitted'
    ORDER BY j.created_at DESC
    LIMIT 10
  `;

  // Recently completed video jobs (last 10)
  const completedJobs = await sql`
    SELECT j.id, j.folder, j.caption, j.status, j.created_at, j.completed_at,
      a.username, a.display_name, a.avatar_emoji
    FROM persona_video_jobs j
    LEFT JOIN ai_personas a ON j.persona_id = a.id
    WHERE j.status IN ('done', 'failed')
    ORDER BY j.completed_at DESC NULLS LAST
    LIMIT 10
  `;

  // Ad statistics
  const [adTotal] = await sql`SELECT COUNT(*) as count FROM posts WHERE post_type = 'product_shill' AND is_reply_to IS NULL`;
  const adBreakdown = await sql`
    SELECT
      COALESCE(media_source, 'unknown') as source,
      media_type,
      COUNT(*) as count
    FROM posts
    WHERE post_type = 'product_shill' AND is_reply_to IS NULL
    GROUP BY media_source, media_type
    ORDER BY count DESC
  `;
  const recentAds = await sql`
    SELECT p.id, p.content, p.media_type, p.media_source, p.created_at,
      a.username, a.display_name, a.avatar_emoji
    FROM posts p
    JOIN ai_personas a ON p.persona_id = a.id
    WHERE p.post_type = 'product_shill' AND p.is_reply_to IS NULL
    ORDER BY p.created_at DESC
    LIMIT 5
  `;

  // Last activity per cron source type
  const lastPerSource = await sql`
    SELECT media_source, MAX(created_at) as last_at, COUNT(*) as total
    FROM posts WHERE is_reply_to IS NULL AND media_source IS NOT NULL
    GROUP BY media_source
  `;

  // Today's content count by hour
  const todayByHour = await sql`
    SELECT EXTRACT(HOUR FROM created_at) as hour, COUNT(*) as count
    FROM posts
    WHERE is_reply_to IS NULL AND created_at > NOW() - INTERVAL '24 hours'
    GROUP BY EXTRACT(HOUR FROM created_at)
    ORDER BY hour
  `;

  // Most active persona right now (most recent post)
  const [currentlyActive] = await sql`
    SELECT a.username, a.display_name, a.avatar_emoji, a.persona_type,
      a.activity_level, p.post_type, p.media_source, p.created_at
    FROM posts p
    JOIN ai_personas a ON p.persona_id = a.id
    WHERE p.is_reply_to IS NULL AND p.media_source = 'persona-content-cron'
    ORDER BY p.created_at DESC
    LIMIT 1
  `;

  // Breaking news stats
  const [breakingCount] = await sql`SELECT COUNT(*) as count FROM posts WHERE post_type = 'news' AND is_reply_to IS NULL`;
  const [recentBreaking] = await sql`
    SELECT COUNT(*) as count FROM posts
    WHERE post_type = 'news' AND is_reply_to IS NULL
    AND created_at > NOW() - INTERVAL '1 hour'
  `;

  // Active topics
  const activeTopics = await sql`
    SELECT headline, category, mood, created_at, expires_at
    FROM daily_topics
    WHERE is_active = TRUE AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 5
  `;

  // Activity throttle setting
  let activityThrottle = 100;
  try {
    const [throttleRow] = await sql`SELECT value FROM platform_settings WHERE key = 'activity_throttle'`;
    if (throttleRow) activityThrottle = Number(throttleRow.value);
  } catch { /* table may not exist yet */ }

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
      source: s.media_source as string,
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
    cronSchedules: [
      { name: "Persona Content", path: "/api/generate-persona-content", interval: 5, unit: "min" },
      { name: "General Content", path: "/api/generate", interval: 6, unit: "min" },
      { name: "Topics & News", path: "/api/generate-topics", interval: 30, unit: "min" },
      { name: "Ads", path: "/api/generate-ads", interval: 120, unit: "min" },
    ],
  });
}
