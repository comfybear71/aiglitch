import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { posts as postsRepo } from "@/lib/repositories";

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
      SELECT id, name, slug, emoji, description, content_rules, schedule, subscriber_count
      FROM channels WHERE slug = ${slug} AND is_active = TRUE
    `;

    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const channelId = channel.id as string;

    // Get posts for this channel — either explicitly tagged with channel_id,
    // or from the channel's resident personas
    let posts;

    if (shuffle) {
      posts = await sql`
        SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
        FROM posts p
        JOIN ai_personas a ON p.persona_id = a.id
        WHERE p.is_reply_to IS NULL
          AND (p.channel_id = ${channelId} OR p.persona_id IN (
            SELECT cp.persona_id FROM channel_personas cp WHERE cp.channel_id = ${channelId}
          ))
          AND COALESCE(p.media_source, '') NOT IN ('director-premiere', 'director-profile', 'director-scene')
        ORDER BY md5(p.id::text || ${seed})
        LIMIT ${limit}
        OFFSET ${offset}
      `;
    } else if (cursor) {
      posts = await sql`
        SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
        FROM posts p
        JOIN ai_personas a ON p.persona_id = a.id
        WHERE p.created_at < ${cursor} AND p.is_reply_to IS NULL
          AND (p.channel_id = ${channelId} OR p.persona_id IN (
            SELECT cp.persona_id FROM channel_personas cp WHERE cp.channel_id = ${channelId}
          ))
          AND COALESCE(p.media_source, '') NOT IN ('director-premiere', 'director-profile', 'director-scene')
        ORDER BY p.created_at DESC
        LIMIT ${limit}
      `;
    } else {
      posts = await sql`
        SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
        FROM posts p
        JOIN ai_personas a ON p.persona_id = a.id
        WHERE p.is_reply_to IS NULL
          AND (p.channel_id = ${channelId} OR p.persona_id IN (
            SELECT cp.persona_id FROM channel_personas cp WHERE cp.channel_id = ${channelId}
          ))
          AND COALESCE(p.media_source, '') NOT IN ('director-premiere', 'director-profile', 'director-scene')
        ORDER BY p.created_at DESC
        LIMIT ${limit}
      `;
    }

    // Batch fetch comments + bookmarks
    const postIds = posts.map(p => p.id as string);

    if (postIds.length === 0) {
      return NextResponse.json({ channel, posts: [], nextCursor: null });
    }

    const [allAiComments, allHumanComments, bookmarkedSet] = await Promise.all([
      postsRepo.getAiComments(postIds),
      postsRepo.getHumanComments(postIds),
      sessionId ? postsRepo.getBookmarkedSet(postIds, sessionId) : Promise.resolve(new Set<string>()),
    ]);

    const commentsByPost = postsRepo.threadComments(
      allAiComments as unknown as { id: string; post_id: string; parent_comment_id?: string | null; [k: string]: unknown }[],
      allHumanComments as unknown as { id: string; post_id: string; parent_comment_id?: string | null; [k: string]: unknown }[],
    );

    const postsWithComments = posts.map((post) => ({
      ...post,
      comments: commentsByPost.get(post.id as string) || [],
      bookmarked: bookmarkedSet.has(post.id as string),
    }));

    const nextCursor = !shuffle && posts.length === limit
      ? posts[posts.length - 1].created_at
      : null;
    const nextOffset = shuffle && posts.length === limit
      ? offset + limit
      : null;

    // Subscription status
    let subscribed = false;
    if (sessionId) {
      const [sub] = await sql`
        SELECT id FROM channel_subscriptions WHERE channel_id = ${channelId} AND session_id = ${sessionId}
      `;
      subscribed = !!sub;
    }

    const res = NextResponse.json({
      channel: {
        ...channel,
        content_rules: typeof channel.content_rules === "string" ? JSON.parse(channel.content_rules as string) : channel.content_rules,
        schedule: typeof channel.schedule === "string" ? JSON.parse(channel.schedule as string) : channel.schedule,
        subscribed,
      },
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
