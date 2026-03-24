import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { v4 as uuidv4 } from "uuid";
import { CHANNEL_DEFAULTS } from "@/lib/bible/constants";

/**
 * GET /api/channels — List all active channels with persona counts + subscription status
 * Query params: session_id (optional, for subscription status)
 */
export async function GET(request: NextRequest) {
  try {
    const sql = getDb();
    await ensureDbReady();

    const sessionId = request.nextUrl.searchParams.get("session_id");

    const channels = await sql`
      SELECT c.*,
        (SELECT COUNT(*)::int FROM channel_personas cp WHERE cp.channel_id = c.id) as persona_count,
        (SELECT COUNT(*)::int FROM posts p WHERE p.channel_id = c.id AND p.is_reply_to IS NULL) as actual_post_count
      FROM channels c
      WHERE c.is_active = TRUE
      ORDER BY c.sort_order ASC, c.created_at ASC
    `;

    // Get subscription status if session_id provided
    let subscribedSet = new Set<string>();
    if (sessionId) {
      const subs = await sql`
        SELECT channel_id FROM channel_subscriptions WHERE session_id = ${sessionId}
      `;
      subscribedSet = new Set(subs.map(s => s.channel_id as string));
    }

    // Get host personas for each channel
    const channelIds = channels.map(c => c.id as string);
    let hostsByChannel = new Map<string, Array<{ persona_id: string; username: string; display_name: string; avatar_emoji: string; avatar_url: string | null; role: string }>>();

    if (channelIds.length > 0) {
      const hosts = await sql`
        SELECT cp.channel_id, cp.role, a.id as persona_id, a.username, a.display_name, a.avatar_emoji, a.avatar_url
        FROM channel_personas cp
        JOIN ai_personas a ON cp.persona_id = a.id
        WHERE cp.channel_id = ANY(${channelIds})
        ORDER BY cp.role ASC, a.follower_count DESC
      `;
      for (const h of hosts) {
        const list = hostsByChannel.get(h.channel_id as string) || [];
        list.push({
          persona_id: h.persona_id as string,
          username: h.username as string,
          display_name: h.display_name as string,
          avatar_emoji: h.avatar_emoji as string,
          avatar_url: h.avatar_url as string | null,
          role: h.role as string,
        });
        hostsByChannel.set(h.channel_id as string, list);
      }
    }

    // Get latest media thumbnail per channel — only from explicitly tagged posts
    const thumbnailsByChannel = new Map<string, string>();
    if (channelIds.length > 0) {
      const thumbs = await sql`
        SELECT DISTINCT ON (p.channel_id) p.channel_id as cid, p.media_url
        FROM posts p
        WHERE p.is_reply_to IS NULL
          AND p.media_url IS NOT NULL
          AND p.media_type IN ('image', 'video')
          AND p.channel_id = ANY(${channelIds})
          AND COALESCE(p.media_source, '') NOT IN ('director-premiere', 'director-profile', 'director-scene')
        ORDER BY p.channel_id, p.created_at DESC
      `;
      for (const t of thumbs) {
        thumbnailsByChannel.set(t.cid as string, t.media_url as string);
      }
    }

    const result = channels.map(c => ({
      ...c,
      content_rules: typeof c.content_rules === "string" ? JSON.parse(c.content_rules as string) : c.content_rules,
      schedule: typeof c.schedule === "string" ? JSON.parse(c.schedule as string) : c.schedule,
      // Generation config fields — explicit defaults so they're always present in the response
      show_title_page: c.show_title_page ?? CHANNEL_DEFAULTS.showTitlePage,
      show_director: c.show_director ?? CHANNEL_DEFAULTS.showDirector,
      show_credits: c.show_credits ?? CHANNEL_DEFAULTS.showCredits,
      scene_count: c.scene_count ?? null,
      scene_duration: c.scene_duration ?? CHANNEL_DEFAULTS.sceneDuration,
      default_director: c.default_director ?? null,
      generation_genre: c.generation_genre ?? null,
      short_clip_mode: c.short_clip_mode ?? false,
      is_music_channel: c.is_music_channel ?? false,
      auto_publish_to_feed: c.auto_publish_to_feed ?? CHANNEL_DEFAULTS.autoPublishToFeed,
      subscribed: subscribedSet.has(c.id as string),
      personas: hostsByChannel.get(c.id as string) || [],
      thumbnail: (c.banner_url as string | null) || thumbnailsByChannel.get(c.id as string) || null,
    }));

    const res = NextResponse.json({ channels: result });
    res.headers.set("Cache-Control", "public, s-maxage=30, stale-while-revalidate=120");
    return res;
  } catch (err) {
    console.error("Channels API error:", err);
    return NextResponse.json({ error: "Failed to fetch channels" }, { status: 500 });
  }
}

/**
 * POST /api/channels — Subscribe/unsubscribe to a channel
 * Body: { session_id, channel_id, action: "subscribe" | "unsubscribe" }
 */
export async function POST(request: NextRequest) {
  try {
    const sql = getDb();
    const body = await request.json();
    const { session_id, channel_id, action } = body;

    if (!session_id || !channel_id || !action) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (action === "subscribe") {
      const id = uuidv4();
      await sql`
        INSERT INTO channel_subscriptions (id, channel_id, session_id)
        VALUES (${id}, ${channel_id}, ${session_id})
        ON CONFLICT (channel_id, session_id) DO NOTHING
      `;
      await sql`
        UPDATE channels SET subscriber_count = subscriber_count + 1 WHERE id = ${channel_id}
      `;
    } else if (action === "unsubscribe") {
      const deleted = await sql`
        DELETE FROM channel_subscriptions WHERE channel_id = ${channel_id} AND session_id = ${session_id}
      `;
      if ((deleted as unknown as { count: number }).count > 0) {
        await sql`
          UPDATE channels SET subscriber_count = GREATEST(subscriber_count - 1, 0) WHERE id = ${channel_id}
        `;
      }
    }

    return NextResponse.json({ ok: true, action });
  } catch (err) {
    console.error("Channel subscribe error:", err);
    return NextResponse.json({ error: "Failed to update subscription" }, { status: 500 });
  }
}
