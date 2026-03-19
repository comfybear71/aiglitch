import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { posts as postsRepo, interactions } from "@/lib/repositories";

/**
 * GET /api/channels/feed?slug=ai-fail-army — Channel-specific feed
 * Query params: slug (required), limit, cursor, session_id, shuffle, seed, offset
 */
export async function GET(request: NextRequest) {
  try {
    const sql = getDb();
    await ensureDbReady();

    const slug = request.nextUrl.searchParams.get("slug");
    if (!slug) {
      return NextResponse.json({ error: "slug is required" }, { status: 400 });
    }

    const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") || "20"), 50);
    const cursor = request.nextUrl.searchParams.get("cursor");
    const sessionId = request.nextUrl.searchParams.get("session_id");
    const shuffle = request.nextUrl.searchParams.get("shuffle") === "1";
    const seed = request.nextUrl.searchParams.get("seed") || "0";
    const offset = parseInt(request.nextUrl.searchParams.get("offset") || "0");

    // Look up the channel
    const [channel] = await sql`
      SELECT id, name, slug, emoji, description, content_rules, schedule, subscriber_count, genre
      FROM channels WHERE slug = ${slug} AND is_active = TRUE
    `;

    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const channelId = channel.id as string;

    // Get posts ONLY explicitly tagged with this channel_id.
    // This ensures each channel shows only its own content — no bleed from shared personas.
    // For the Studios channel (ch-aiglitch-studios), allow director-premiere/director-scene sources.
    // ALL queries exclude broken video posts (media_type=video but media_url is NULL — caused by
    // DB replication lag race condition during post creation + social spreading).
    const isStudiosChannel = channelId === "ch-aiglitch-studios";
    const requireMedia = (channel.genre as string) === "music_video";
    // ALL channels are TV-style viewers — require posts to have actual media (video or image with URL).
    // Text-only posts show as empty 📺 placeholders which look broken.
    const requireAnyMedia = true;
    let posts;

    if (shuffle) {
      posts = isStudiosChannel
        ? await sql`
          SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
          FROM posts p
          JOIN ai_personas a ON p.persona_id = a.id
          WHERE p.is_reply_to IS NULL
            AND p.channel_id = ${channelId}
            AND p.media_url IS NOT NULL AND p.media_url != ''
            AND p.media_type IS NOT NULL
          ORDER BY md5(p.id::text || ${seed})
          LIMIT ${limit}
          OFFSET ${offset}
        `
        : requireMedia
        ? await sql`
          SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
          FROM posts p
          JOIN ai_personas a ON p.persona_id = a.id
          WHERE p.is_reply_to IS NULL
            AND p.channel_id = ${channelId}
            AND p.media_url IS NOT NULL AND p.media_url != '' AND p.media_type IN ('video', 'image')
            AND COALESCE(p.media_source, '') NOT IN ('director-premiere', 'director-profile', 'director-scene')
          ORDER BY md5(p.id::text || ${seed})
          LIMIT ${limit}
          OFFSET ${offset}
        `
        : await sql`
          SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
          FROM posts p
          JOIN ai_personas a ON p.persona_id = a.id
          WHERE p.is_reply_to IS NULL
            AND p.channel_id = ${channelId}
            AND COALESCE(p.media_source, '') NOT IN ('director-premiere', 'director-profile', 'director-scene')
            AND p.media_url IS NOT NULL AND p.media_url != ''
            AND p.media_type IS NOT NULL
          ORDER BY md5(p.id::text || ${seed})
          LIMIT ${limit}
          OFFSET ${offset}
        `;
    } else if (cursor) {
      posts = isStudiosChannel
        ? await sql`
          SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
          FROM posts p
          JOIN ai_personas a ON p.persona_id = a.id
          WHERE p.created_at < ${cursor} AND p.is_reply_to IS NULL
            AND p.channel_id = ${channelId}
            AND p.media_url IS NOT NULL AND p.media_url != ''
            AND p.media_type IS NOT NULL
          ORDER BY p.created_at DESC
          LIMIT ${limit}
        `
        : requireMedia
        ? await sql`
          SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
          FROM posts p
          JOIN ai_personas a ON p.persona_id = a.id
          WHERE p.created_at < ${cursor} AND p.is_reply_to IS NULL
            AND p.channel_id = ${channelId}
            AND p.media_url IS NOT NULL AND p.media_url != '' AND p.media_type IN ('video', 'image')
            AND COALESCE(p.media_source, '') NOT IN ('director-premiere', 'director-profile', 'director-scene')
          ORDER BY p.created_at DESC
          LIMIT ${limit}
        `
        : await sql`
          SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
          FROM posts p
          JOIN ai_personas a ON p.persona_id = a.id
          WHERE p.created_at < ${cursor} AND p.is_reply_to IS NULL
            AND p.channel_id = ${channelId}
            AND COALESCE(p.media_source, '') NOT IN ('director-premiere', 'director-profile', 'director-scene')
            AND p.media_url IS NOT NULL AND p.media_url != ''
            AND p.media_type IS NOT NULL
          ORDER BY p.created_at DESC
          LIMIT ${limit}
        `;
    } else {
      posts = isStudiosChannel
        ? await sql`
          SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
          FROM posts p
          JOIN ai_personas a ON p.persona_id = a.id
          WHERE p.is_reply_to IS NULL
            AND p.channel_id = ${channelId}
            AND p.media_url IS NOT NULL AND p.media_url != ''
            AND p.media_type IS NOT NULL
          ORDER BY p.created_at DESC
          LIMIT ${limit}
        `
        : requireMedia
        ? await sql`
          SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
          FROM posts p
          JOIN ai_personas a ON p.persona_id = a.id
          WHERE p.is_reply_to IS NULL
            AND p.channel_id = ${channelId}
            AND p.media_url IS NOT NULL AND p.media_url != '' AND p.media_type IN ('video', 'image')
            AND COALESCE(p.media_source, '') NOT IN ('director-premiere', 'director-profile', 'director-scene')
          ORDER BY p.created_at DESC
          LIMIT ${limit}
        `
        : await sql`
          SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
          FROM posts p
          JOIN ai_personas a ON p.persona_id = a.id
          WHERE p.is_reply_to IS NULL
            AND p.channel_id = ${channelId}
            AND COALESCE(p.media_source, '') NOT IN ('director-premiere', 'director-profile', 'director-scene')
            AND p.media_url IS NOT NULL AND p.media_url != ''
            AND p.media_type IS NOT NULL
          ORDER BY p.created_at DESC
          LIMIT ${limit}
        `;
    }

    // Batch fetch comments + bookmarks
    const postIds = posts.map(p => p.id as string);

    if (postIds.length === 0) {
      return NextResponse.json({ channel, posts: [], nextCursor: null });
    }

    const [allAiComments, allHumanComments, bookmarkedSet, batchReactions] = await Promise.all([
      postsRepo.getAiComments(postIds),
      postsRepo.getHumanComments(postIds),
      sessionId ? postsRepo.getBookmarkedSet(postIds, sessionId) : Promise.resolve(new Set<string>()),
      interactions.getBatchReactions(postIds, sessionId || undefined),
    ]);

    const commentsByPost = postsRepo.threadComments(
      allAiComments as unknown as { id: string; post_id: string; parent_comment_id?: string | null; [k: string]: unknown }[],
      allHumanComments as unknown as { id: string; post_id: string; parent_comment_id?: string | null; [k: string]: unknown }[],
    );

    const postsWithComments = posts.map((post) => {
      const pid = post.id as string;
      const reactions = batchReactions[pid];
      return {
        ...post,
        comments: commentsByPost.get(pid) || [],
        bookmarked: bookmarkedSet.has(pid),
        reactionCounts: reactions?.counts || { funny: 0, sad: 0, shocked: 0, crap: 0 },
        userReactions: reactions?.userReactions || [],
      };
    });

    const nextCursor = !shuffle && posts.length === limit
      ? posts[posts.length - 1].created_at
      : null;
    const nextOffset = shuffle && posts.length === limit
      ? offset + limit
      : null;

    // Subscription status + personas in parallel
    const [subResult, personasResult] = await Promise.all([
      sessionId
        ? sql`SELECT id FROM channel_subscriptions WHERE channel_id = ${channelId} AND session_id = ${sessionId}`
        : Promise.resolve([]),
      sql`
        SELECT cp.role, a.id as persona_id, a.username, a.display_name, a.avatar_emoji, a.avatar_url
        FROM channel_personas cp
        JOIN ai_personas a ON cp.persona_id = a.id
        WHERE cp.channel_id = ${channelId}
        ORDER BY cp.role ASC, a.follower_count DESC
      `,
    ]);
    const subscribed = subResult.length > 0;

    const res = NextResponse.json({
      channel: {
        ...channel,
        content_rules: typeof channel.content_rules === "string" ? JSON.parse(channel.content_rules as string) : channel.content_rules,
        schedule: typeof channel.schedule === "string" ? JSON.parse(channel.schedule as string) : channel.schedule,
        subscribed,
      },
      personas: personasResult,
      posts: postsWithComments,
      nextCursor,
      nextOffset,
    });

    res.headers.set("Cache-Control", "public, s-maxage=30, stale-while-revalidate=120");
    return res;
  } catch (err) {
    console.error("Channel feed error:", err);
    return NextResponse.json({ error: "Failed to fetch channel feed" }, { status: 500 });
  }
}
