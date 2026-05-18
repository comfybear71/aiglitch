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

    // ch-meatbag rescue: MeatLab approvals create posts with post_type='meatlab' and
    // channel_id IS NULL (so they stay on the main For You feed). They still surface on
    // the MeatBag channel via the channels/feed query, so the LIVE badge should reflect
    // them too. The CASE adds those posts to ch-meatbag's count only.
    const channels = await sql`
      SELECT c.*,
        (SELECT COUNT(*)::int FROM channel_personas cp WHERE cp.channel_id = c.id) as persona_count,
        (SELECT COUNT(*)::int FROM posts p
          WHERE p.is_reply_to IS NULL AND (
            p.channel_id = c.id
            OR (c.id = 'ch-meatbag' AND p.post_type = 'meatlab' AND p.channel_id IS NULL)
          )
        ) as actual_post_count
      FROM channels c
      WHERE c.is_active = TRUE AND (c.is_private IS NOT TRUE)
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

    // Build a thumbnail CANDIDATE LIST per channel — up to MAX_CANDIDATES URLs.
    // The client tries each in order; on each onError it falls through to the
    // next. This is the only reliable way to handle stale blob URLs (post still
    // exists in the DB but the underlying blob was deleted/moved during the
    // storage reorg). AiTunes and AI Fail Army hit this every time because
    // their latest few posts happen to point at dead blobs.
    //
    // Ordering per channel:
    //   1. Strict: latest 5 posts with image/video media, excluding raw intermediates
    //   2. Loose: any remaining slots filled from posts with non-empty media_url
    //   3. MeatBag-only special: post_type='meatlab' posts (channel_id IS NULL)
    const MAX_CANDIDATES = 5;
    const candidatesByChannel = new Map<string, string[]>();
    const addCandidate = (channelId: string, url: string) => {
      const list = candidatesByChannel.get(channelId) ?? [];
      if (list.length < MAX_CANDIDATES && !list.includes(url)) {
        list.push(url);
        candidatesByChannel.set(channelId, list);
      }
    };

    if (channelIds.length > 0) {
      const strict = await sql`
        SELECT p.channel_id as cid, p.media_url, p.created_at
        FROM (
          SELECT channel_id, media_url, created_at,
            ROW_NUMBER() OVER (PARTITION BY channel_id ORDER BY created_at DESC) as rn
          FROM posts
          WHERE is_reply_to IS NULL
            AND media_url IS NOT NULL AND media_url <> ''
            AND media_type IN ('image', 'video')
            AND channel_id = ANY(${channelIds})
            AND COALESCE(media_source, '') NOT IN ('director-profile', 'director-scene')
        ) p
        WHERE p.rn <= ${MAX_CANDIDATES}
        ORDER BY p.channel_id, p.created_at DESC
      `;
      for (const t of strict) {
        addCandidate(t.cid as string, t.media_url as string);
      }

      // Loose pass — fill empty slots from posts with any non-empty media_url
      const needLoose = channelIds.filter(id => (candidatesByChannel.get(id)?.length ?? 0) < MAX_CANDIDATES);
      if (needLoose.length > 0) {
        const loose = await sql`
          SELECT p.channel_id as cid, p.media_url, p.created_at
          FROM (
            SELECT channel_id, media_url, created_at,
              ROW_NUMBER() OVER (PARTITION BY channel_id ORDER BY created_at DESC) as rn
            FROM posts
            WHERE is_reply_to IS NULL
              AND media_url IS NOT NULL AND media_url <> ''
              AND channel_id = ANY(${needLoose})
          ) p
          WHERE p.rn <= ${MAX_CANDIDATES}
          ORDER BY p.cid, p.created_at DESC
        `;
        for (const t of loose) {
          addCandidate(t.cid as string, t.media_url as string);
        }
      }

      // MeatBag-only: fill any remaining slots from meatlab posts (channel_id IS NULL)
      if (channelIds.includes("ch-meatbag") && (candidatesByChannel.get("ch-meatbag")?.length ?? 0) < MAX_CANDIDATES) {
        const meatbag = await sql`
          SELECT media_url
          FROM posts
          WHERE post_type = 'meatlab'
            AND media_url IS NOT NULL AND media_url <> ''
            AND is_reply_to IS NULL
          ORDER BY created_at DESC
          LIMIT ${MAX_CANDIDATES}
        `;
        for (const t of meatbag) {
          addCandidate("ch-meatbag", t.media_url as string);
        }
      }
    }

    const result = channels.map(c => {
      const channelId = c.id as string;
      const banner = c.banner_url as string | null;
      const autoCandidates = candidatesByChannel.get(channelId) ?? [];
      // banner_url is admin-set so it gets first crack; auto-discovered candidates
      // fall in after, deduped.
      const thumbnail_candidates = banner
        ? [banner, ...autoCandidates.filter(u => u !== banner)]
        : autoCandidates;
      return {
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
        subscribed: subscribedSet.has(channelId),
        personas: hostsByChannel.get(channelId) || [],
        thumbnail: thumbnail_candidates[0] ?? null,
        thumbnail_candidates,
      };
    });

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
