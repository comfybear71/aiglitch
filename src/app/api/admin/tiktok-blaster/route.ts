import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";

export const maxDuration = 30;

/**
 * TikTok Blaster API — fetches recent videos for manual TikTok posting.
 *
 * GET: Fetch recent video posts (last 7 days by default)
 *   ?days=7        — how many days back to look
 *   ?channel=all   — filter by channel slug (or "all")
 *   ?limit=50      — max videos to return
 *
 * POST: Mark a video as "blasted" (posted to TikTok manually)
 *   { post_id, tiktok_url? }
 */

export async function GET(request: NextRequest) {
  if (!await isAdminAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "14") || 14;
  const channel = url.searchParams.get("channel") || "all";
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100") || 100, 200);

  try {
    // Calculate cutoff date in JS to avoid Neon parameterized interval issues
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Debug: check what media_types exist
    const debugTypes = await sql`
      SELECT DISTINCT media_type, COUNT(*)::int as cnt
      FROM posts
      WHERE media_url IS NOT NULL AND media_url != ''
      GROUP BY media_type
      ORDER BY cnt DESC
      LIMIT 10
    `;
    console.log("[tiktok-blaster] media_types in DB:", JSON.stringify(debugTypes));

    // Fetch recent video posts with channel info
    let videos;
    if (channel === "all") {
      videos = await sql`
        SELECT p.id, p.content, p.media_url, p.media_type, p.channel_id, p.created_at, p.persona_id,
               COALESCE(c.name, 'Main Feed') as channel_name,
               COALESCE(c.emoji, '') as channel_emoji,
               COALESCE(c.slug, 'feed') as channel_slug,
               per.display_name as persona_name, per.avatar_emoji as persona_emoji
        FROM posts p
        LEFT JOIN channels c ON c.id = p.channel_id
        LEFT JOIN personas per ON per.id = p.persona_id
        WHERE (p.media_type LIKE 'video%' OR p.media_url LIKE '%.mp4%')
          AND p.media_url IS NOT NULL
          AND p.media_url != ''
          AND p.created_at > ${cutoff}::timestamptz
        ORDER BY p.created_at DESC
        LIMIT ${limit}
      `;
    } else {
      videos = await sql`
        SELECT p.id, p.content, p.media_url, p.media_type, p.channel_id, p.created_at, p.persona_id,
               COALESCE(c.name, 'Main Feed') as channel_name,
               COALESCE(c.emoji, '') as channel_emoji,
               COALESCE(c.slug, 'feed') as channel_slug,
               per.display_name as persona_name, per.avatar_emoji as persona_emoji
        FROM posts p
        LEFT JOIN channels c ON c.id = p.channel_id
        LEFT JOIN personas per ON per.id = p.persona_id
        WHERE (p.media_type LIKE 'video%' OR p.media_url LIKE '%.mp4%')
          AND p.media_url IS NOT NULL
          AND p.media_url != ''
          AND p.created_at > ${cutoff}::timestamptz
          AND c.slug = ${channel}
        ORDER BY p.created_at DESC
        LIMIT ${limit}
      `;
    }
    console.log(`[tiktok-blaster] Found ${videos.length} videos (cutoff=${cutoff}, channel=${channel})`);

    // Check which ones have been blasted already
    const videoIds = videos.map((v: Record<string, unknown>) => v.id as string);
    let blasted: { post_id: string; blasted_at: string; tiktok_url: string | null }[] = [];
    if (videoIds.length > 0) {
      blasted = await sql`
        SELECT post_id, blasted_at, tiktok_url
        FROM tiktok_blasts
        WHERE post_id = ANY(${videoIds})
      ` as unknown as typeof blasted;
    }

    const blastedMap = new Map(blasted.map(b => [b.post_id, b]));

    // Get channel list for filter
    const channels = await sql`
      SELECT id, name, emoji, slug FROM channels WHERE is_active = TRUE ORDER BY name
    `;

    return NextResponse.json({
      videos: videos.map((v: Record<string, unknown>) => ({
        ...v,
        blasted: blastedMap.has(v.id as string) ? blastedMap.get(v.id as string) : null,
      })),
      channels,
      total: videos.length,
      debug: { cutoff, channel, days, mediaTypes: debugTypes },
    });
  } catch (err) {
    // If tiktok_blasts table doesn't exist, create it
    if (String(err).includes("tiktok_blasts")) {
      await sql`
        CREATE TABLE IF NOT EXISTS tiktok_blasts (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          post_id TEXT NOT NULL,
          tiktok_url TEXT,
          blasted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(post_id)
        )
      `;
      // Retry
      return GET(request);
    }
    console.error("[tiktok-blaster] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!await isAdminAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  const body = await request.json();
  const { post_id, tiktok_url, action } = body;

  if (action === "unblast") {
    await sql`DELETE FROM tiktok_blasts WHERE post_id = ${post_id}`;
    return NextResponse.json({ ok: true, action: "unblasted" });
  }

  if (!post_id) {
    return NextResponse.json({ error: "post_id required" }, { status: 400 });
  }

  try {
    // Ensure table exists
    await sql`
      CREATE TABLE IF NOT EXISTS tiktok_blasts (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        post_id TEXT NOT NULL,
        tiktok_url TEXT,
        blasted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(post_id)
      )
    `;

    await sql`
      INSERT INTO tiktok_blasts (post_id, tiktok_url)
      VALUES (${post_id}, ${tiktok_url || null})
      ON CONFLICT (post_id) DO UPDATE SET tiktok_url = ${tiktok_url || null}, blasted_at = NOW()
    `;

    return NextResponse.json({ ok: true, action: "blasted" });
  } catch (err) {
    console.error("[tiktok-blaster] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
