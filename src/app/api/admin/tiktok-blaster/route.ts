import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";

export const maxDuration = 30;

async function ensureTable() {
  const sql = getDb();
  await sql`
    CREATE TABLE IF NOT EXISTS tiktok_blasts (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      post_id TEXT NOT NULL,
      tiktok_url TEXT,
      blasted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(post_id)
    )
  `;
}

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
    await ensureTable();

    // Cutoff date calculated in JS — avoids Neon parameterized INTERVAL issues
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Simple query: get all posts that have .mp4 in the URL
    const videos = channel === "all"
      ? await sql`
          SELECT p.id, p.content, p.media_url, p.media_type, p.channel_id, p.created_at, p.persona_id,
                 COALESCE(c.name, 'Main Feed') as channel_name,
                 COALESCE(c.emoji, '') as channel_emoji,
                 COALESCE(c.slug, 'feed') as channel_slug,
                 COALESCE(per.display_name, 'Unknown') as persona_name,
                 COALESCE(per.avatar_emoji, '') as persona_emoji,
                 tb.blasted_at, tb.tiktok_url
          FROM posts p
          LEFT JOIN channels c ON c.id = p.channel_id
          LEFT JOIN ai_personas per ON per.id = p.persona_id
          LEFT JOIN tiktok_blasts tb ON tb.post_id = p.id
          WHERE p.media_url LIKE '%.mp4%'
            AND p.created_at > ${cutoff}::timestamptz
          ORDER BY p.created_at DESC
          LIMIT ${limit}
        `
      : await sql`
          SELECT p.id, p.content, p.media_url, p.media_type, p.channel_id, p.created_at, p.persona_id,
                 COALESCE(c.name, 'Main Feed') as channel_name,
                 COALESCE(c.emoji, '') as channel_emoji,
                 COALESCE(c.slug, 'feed') as channel_slug,
                 COALESCE(per.display_name, 'Unknown') as persona_name,
                 COALESCE(per.avatar_emoji, '') as persona_emoji,
                 tb.blasted_at, tb.tiktok_url
          FROM posts p
          LEFT JOIN channels c ON c.id = p.channel_id
          LEFT JOIN ai_personas per ON per.id = p.persona_id
          LEFT JOIN tiktok_blasts tb ON tb.post_id = p.id
          WHERE p.media_url LIKE '%.mp4%'
            AND p.created_at > ${cutoff}::timestamptz
            AND c.slug = ${channel}
          ORDER BY p.created_at DESC
          LIMIT ${limit}
        `;

    const channels = await sql`
      SELECT id, name, emoji, slug FROM channels WHERE is_active = TRUE ORDER BY name
    `;

    return NextResponse.json({
      videos: videos.map((v: Record<string, unknown>) => ({
        ...v,
        blasted: v.blasted_at ? { blasted_at: v.blasted_at, tiktok_url: v.tiktok_url } : null,
      })),
      channels,
      total: videos.length,
    });
  } catch (err) {
    console.error("[tiktok-blaster] GET error:", err);
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

  try {
    await ensureTable();

    if (action === "unblast") {
      await sql`DELETE FROM tiktok_blasts WHERE post_id = ${post_id}`;
      return NextResponse.json({ ok: true, action: "unblasted" });
    }

    if (!post_id) {
      return NextResponse.json({ error: "post_id required" }, { status: 400 });
    }

    await sql`
      INSERT INTO tiktok_blasts (post_id, tiktok_url)
      VALUES (${post_id}, ${tiktok_url || null})
      ON CONFLICT (post_id) DO UPDATE SET tiktok_url = ${tiktok_url || null}, blasted_at = NOW()
    `;

    return NextResponse.json({ ok: true, action: "blasted" });
  } catch (err) {
    console.error("[tiktok-blaster] POST error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
