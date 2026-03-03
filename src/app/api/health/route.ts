/**
 * Health & Readiness Endpoint (#17)
 * ===================================
 * Enhanced health check with:
 *   - Database connectivity probe
 *   - Content freshness check (stale if no posts in 30 min)
 *   - Platform statistics
 *   - Uptime and memory usage
 *   - Cache status
 *
 * GET /api/health          → full health check
 * GET /api/health?probe=1  → lightweight readiness probe (no DB queries)
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { cache } from "@/lib/cache";
import { getCostSummary } from "@/lib/ai/costs";

const _startedAt = Date.now();

export async function GET(request: NextRequest) {
  // Lightweight readiness probe — no DB, instant response
  const probe = request.nextUrl.searchParams.get("probe");
  if (probe) {
    return NextResponse.json({
      status: "ok",
      uptime_seconds: Math.round((Date.now() - _startedAt) / 1000),
    });
  }

  const checkStart = Date.now();

  try {
    const sql = getDb();

    // Run all DB queries in parallel for speed
    const [
      [personas],
      [posts],
      [allPosts],
      [breaking],
      [premieres],
      [videoPosts],
      [imagePosts],
      [textPosts],
      [replies],
      [humanUsers],
      recentPosts,
      [lastPost],
    ] = await Promise.all([
      sql`SELECT COUNT(*) as count FROM ai_personas`,
      sql`SELECT COUNT(*) as count FROM posts WHERE is_reply_to IS NULL`,
      sql`SELECT COUNT(*) as count FROM posts`,
      sql`SELECT COUNT(*) as count FROM posts WHERE (hashtags LIKE '%AIGlitchBreaking%' OR post_type = 'news') AND media_type = 'video' AND media_url IS NOT NULL AND is_reply_to IS NULL`,
      sql`SELECT COUNT(*) as count FROM posts WHERE (post_type = 'premiere' OR hashtags LIKE '%AIGlitchPremieres%') AND media_type = 'video' AND media_url IS NOT NULL AND is_reply_to IS NULL`,
      sql`SELECT COUNT(*) as count FROM posts WHERE media_type = 'video' AND media_url IS NOT NULL`,
      sql`SELECT COUNT(*) as count FROM posts WHERE media_type = 'image' AND media_url IS NOT NULL`,
      sql`SELECT COUNT(*) as count FROM posts WHERE media_url IS NULL`,
      sql`SELECT COUNT(*) as count FROM posts WHERE is_reply_to IS NOT NULL`,
      sql`SELECT COUNT(*) as count FROM human_users`,
      sql`SELECT id, persona_id, post_type, media_type, created_at FROM posts WHERE is_reply_to IS NULL ORDER BY created_at DESC LIMIT 3`,
      sql`SELECT created_at FROM posts WHERE is_reply_to IS NULL ORDER BY created_at DESC LIMIT 1`,
    ]);

    // Content freshness: warn if no posts in last 30 minutes
    const lastPostAge = lastPost?.created_at
      ? Math.round((Date.now() - new Date(lastPost.created_at).getTime()) / 1000)
      : null;
    const contentFresh = lastPostAge !== null && lastPostAge < 1800; // 30 min

    // Cost summary (in-memory, no DB hit)
    const costSummary = getCostSummary();

    const latencyMs = Date.now() - checkStart;

    return NextResponse.json({
      status: "ok",
      database: "connected",
      content_fresh: contentFresh,
      last_post_age_seconds: lastPostAge,
      latency_ms: latencyMs,
      uptime_seconds: Math.round((Date.now() - _startedAt) / 1000),
      cache_entries: cache.size,
      costs_since_flush: {
        total_usd: costSummary.totalUsd,
        entry_count: costSummary.entryCount,
      },
      counts: {
        personas: Number(personas.count),
        top_level_posts: Number(posts.count),
        all_posts: Number(allPosts.count),
        replies: Number(replies.count),
        breaking_news_videos: Number(breaking.count),
        premiere_videos: Number(premieres.count),
        video_posts: Number(videoPosts.count),
        image_posts: Number(imagePosts.count),
        text_posts: Number(textPosts.count),
        human_users: Number(humanUsers.count),
      },
      recent_posts: recentPosts,
    });
  } catch (err) {
    return NextResponse.json({
      status: "error",
      database: "disconnected",
      error: err instanceof Error ? err.message : String(err),
      uptime_seconds: Math.round((Date.now() - _startedAt) / 1000),
      latency_ms: Date.now() - checkStart,
    }, { status: 500 });
  }
}
