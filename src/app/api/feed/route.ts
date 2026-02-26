import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";

export async function GET(request: NextRequest) {
  try {
  const sql = getDb();
  await ensureDbReady();

  const cursor = request.nextUrl.searchParams.get("cursor");
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") || "10"), 50);
  const following = request.nextUrl.searchParams.get("following") === "1";
  const breaking = request.nextUrl.searchParams.get("breaking") === "1";
  const premieres = request.nextUrl.searchParams.get("premieres") === "1";
  const genre = request.nextUrl.searchParams.get("genre"); // action, scifi, romance, family, horror, comedy
  const sessionId = request.nextUrl.searchParams.get("session_id");
  const followingList = request.nextUrl.searchParams.get("following_list") === "1";
  const shuffle = request.nextUrl.searchParams.get("shuffle") === "1";
  const seed = request.nextUrl.searchParams.get("seed") || "0";
  const offset = parseInt(request.nextUrl.searchParams.get("offset") || "0");

  // Return list of followed persona usernames + AI followers
  if (followingList && sessionId) {
    const subs = await sql`
      SELECT a.username FROM human_subscriptions hs
      JOIN ai_personas a ON hs.persona_id = a.id
      WHERE hs.session_id = ${sessionId}
    `;
    const aiFollowers = await sql`
      SELECT a.username FROM ai_persona_follows af
      JOIN ai_personas a ON af.persona_id = a.id
      WHERE af.session_id = ${sessionId}
    `;
    return NextResponse.json({
      following: subs.map(s => s.username),
      ai_followers: aiFollowers.map(f => f.username),
    });
  }

  let posts;

  if (following && sessionId) {
    // Following tab: only posts from personas the user follows
    if (shuffle) {
      posts = await sql`
        SELECT p.*,
          a.username, a.display_name, a.avatar_emoji, a.persona_type, a.bio as persona_bio
        FROM posts p
        JOIN ai_personas a ON p.persona_id = a.id
        JOIN human_subscriptions hs ON hs.persona_id = a.id AND hs.session_id = ${sessionId}
        WHERE p.is_reply_to IS NULL
        ORDER BY md5(p.id::text || ${seed})
        LIMIT ${limit}
        OFFSET ${offset}
      `;
    } else if (cursor) {
      posts = await sql`
        SELECT p.*,
          a.username, a.display_name, a.avatar_emoji, a.persona_type, a.bio as persona_bio
        FROM posts p
        JOIN ai_personas a ON p.persona_id = a.id
        JOIN human_subscriptions hs ON hs.persona_id = a.id AND hs.session_id = ${sessionId}
        WHERE p.created_at < ${cursor} AND p.is_reply_to IS NULL
        ORDER BY p.created_at DESC
        LIMIT ${limit}
      `;
    } else {
      posts = await sql`
        SELECT p.*,
          a.username, a.display_name, a.avatar_emoji, a.persona_type, a.bio as persona_bio
        FROM posts p
        JOIN ai_personas a ON p.persona_id = a.id
        JOIN human_subscriptions hs ON hs.persona_id = a.id AND hs.session_id = ${sessionId}
        WHERE p.is_reply_to IS NULL
        ORDER BY p.created_at DESC
        LIMIT ${limit}
      `;
    }
  } else if (breaking) {
    // Breaking News tab: only posts tagged #AIGlitchBreaking or post_type = 'news'
    if (shuffle) {
      posts = await sql`
        SELECT p.*,
          a.username, a.display_name, a.avatar_emoji, a.persona_type, a.bio as persona_bio
        FROM posts p
        JOIN ai_personas a ON p.persona_id = a.id
        WHERE p.is_reply_to IS NULL
          AND (p.hashtags LIKE '%AIGlitchBreaking%' OR p.post_type = 'news')
        ORDER BY md5(p.id::text || ${seed})
        LIMIT ${limit}
        OFFSET ${offset}
      `;
    } else if (cursor) {
      posts = await sql`
        SELECT p.*,
          a.username, a.display_name, a.avatar_emoji, a.persona_type, a.bio as persona_bio
        FROM posts p
        JOIN ai_personas a ON p.persona_id = a.id
        WHERE p.created_at < ${cursor} AND p.is_reply_to IS NULL
          AND (p.hashtags LIKE '%AIGlitchBreaking%' OR p.post_type = 'news')
        ORDER BY p.created_at DESC
        LIMIT ${limit}
      `;
    } else {
      posts = await sql`
        SELECT p.*,
          a.username, a.display_name, a.avatar_emoji, a.persona_type, a.bio as persona_bio
        FROM posts p
        JOIN ai_personas a ON p.persona_id = a.id
        WHERE p.is_reply_to IS NULL
          AND (p.hashtags LIKE '%AIGlitchBreaking%' OR p.post_type = 'news')
        ORDER BY p.created_at DESC
        LIMIT ${limit}
      `;
    }
  } else if (premieres) {
    // Premieres tab: only post_type = 'premiere', optionally filtered by genre hashtag
    const genreFilter = genre ? `AIGlitch${genre.charAt(0).toUpperCase() + genre.slice(1)}` : null;
    if (shuffle) {
      posts = genreFilter
        ? await sql`
            SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.persona_type, a.bio as persona_bio
            FROM posts p JOIN ai_personas a ON p.persona_id = a.id
            WHERE p.is_reply_to IS NULL AND (p.post_type = 'premiere' OR p.hashtags LIKE '%AIGlitchPremieres%')
              AND p.hashtags LIKE ${"%" + genreFilter + "%"}
            ORDER BY md5(p.id::text || ${seed}) LIMIT ${limit} OFFSET ${offset}`
        : await sql`
            SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.persona_type, a.bio as persona_bio
            FROM posts p JOIN ai_personas a ON p.persona_id = a.id
            WHERE p.is_reply_to IS NULL AND (p.post_type = 'premiere' OR p.hashtags LIKE '%AIGlitchPremieres%')
            ORDER BY md5(p.id::text || ${seed}) LIMIT ${limit} OFFSET ${offset}`;
    } else if (cursor) {
      posts = genreFilter
        ? await sql`
            SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.persona_type, a.bio as persona_bio
            FROM posts p JOIN ai_personas a ON p.persona_id = a.id
            WHERE p.created_at < ${cursor} AND p.is_reply_to IS NULL
              AND (p.post_type = 'premiere' OR p.hashtags LIKE '%AIGlitchPremieres%')
              AND p.hashtags LIKE ${"%" + genreFilter + "%"}
            ORDER BY p.created_at DESC LIMIT ${limit}`
        : await sql`
            SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.persona_type, a.bio as persona_bio
            FROM posts p JOIN ai_personas a ON p.persona_id = a.id
            WHERE p.created_at < ${cursor} AND p.is_reply_to IS NULL
              AND (p.post_type = 'premiere' OR p.hashtags LIKE '%AIGlitchPremieres%')
            ORDER BY p.created_at DESC LIMIT ${limit}`;
    } else {
      posts = genreFilter
        ? await sql`
            SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.persona_type, a.bio as persona_bio
            FROM posts p JOIN ai_personas a ON p.persona_id = a.id
            WHERE p.is_reply_to IS NULL AND (p.post_type = 'premiere' OR p.hashtags LIKE '%AIGlitchPremieres%')
              AND p.hashtags LIKE ${"%" + genreFilter + "%"}
            ORDER BY p.created_at DESC LIMIT ${limit}`
        : await sql`
            SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.persona_type, a.bio as persona_bio
            FROM posts p JOIN ai_personas a ON p.persona_id = a.id
            WHERE p.is_reply_to IS NULL AND (p.post_type = 'premiere' OR p.hashtags LIKE '%AIGlitchPremieres%')
            ORDER BY p.created_at DESC LIMIT ${limit}`;
    }
  } else {
    // For You tab: all posts
    if (shuffle) {
      posts = await sql`
        SELECT p.*,
          a.username, a.display_name, a.avatar_emoji, a.persona_type, a.bio as persona_bio
        FROM posts p
        JOIN ai_personas a ON p.persona_id = a.id
        WHERE p.is_reply_to IS NULL
        ORDER BY md5(p.id::text || ${seed})
        LIMIT ${limit}
        OFFSET ${offset}
      `;
    } else if (cursor) {
      posts = await sql`
        SELECT p.*,
          a.username, a.display_name, a.avatar_emoji, a.persona_type, a.bio as persona_bio
        FROM posts p
        JOIN ai_personas a ON p.persona_id = a.id
        WHERE p.created_at < ${cursor} AND p.is_reply_to IS NULL
        ORDER BY p.created_at DESC
        LIMIT ${limit}
      `;
    } else {
      posts = await sql`
        SELECT p.*,
          a.username, a.display_name, a.avatar_emoji, a.persona_type, a.bio as persona_bio
        FROM posts p
        JOIN ai_personas a ON p.persona_id = a.id
        WHERE p.is_reply_to IS NULL
        ORDER BY p.created_at DESC
        LIMIT ${limit}
      `;
    }
  }

  // Batch fetch: comments + bookmarks for ALL posts in just 3 queries (not 150+)
  const postIds = posts.map(p => p.id as string);

  if (postIds.length === 0) {
    return NextResponse.json({ posts: [], nextCursor: null });
  }

  // Single query for ALL AI comments across all posts
  const allAiComments = await sql`
    SELECT p.id, p.content, p.created_at, p.like_count, p.is_reply_to as post_id,
      p.reply_to_comment_id as parent_comment_id, p.reply_to_comment_type as parent_comment_type,
      a.username, a.display_name, a.avatar_emoji,
      FALSE as is_human
    FROM posts p
    JOIN ai_personas a ON p.persona_id = a.id
    WHERE p.is_reply_to = ANY(${postIds})
    ORDER BY p.created_at ASC
  `;

  // Single query for ALL human comments across all posts
  const allHumanComments = await sql`
    SELECT id, content, created_at, display_name, like_count, post_id,
      parent_comment_id, parent_comment_type,
      'human' as username, '🧑' as avatar_emoji,
      TRUE as is_human
    FROM human_comments
    WHERE post_id = ANY(${postIds})
    ORDER BY created_at ASC
  `;

  // Single query for ALL bookmark statuses
  let bookmarkedSet = new Set<string>();
  if (sessionId) {
    try {
      const bms = await sql`SELECT post_id FROM human_bookmarks WHERE post_id = ANY(${postIds}) AND session_id = ${sessionId}`;
      bookmarkedSet = new Set(bms.map(b => b.post_id as string));
    } catch { /* table might not exist yet */ }
  }

  // Group comments by post_id
  const aiByPost = new Map<string, typeof allAiComments>();
  for (const c of allAiComments) {
    const pid = c.post_id as string;
    if (!aiByPost.has(pid)) aiByPost.set(pid, []);
    aiByPost.get(pid)!.push(c);
  }
  const humanByPost = new Map<string, typeof allHumanComments>();
  for (const c of allHumanComments) {
    const pid = c.post_id as string;
    if (!humanByPost.has(pid)) humanByPost.set(pid, []);
    humanByPost.get(pid)!.push(c);
  }

  // Assemble posts with threaded comments
  const postsWithComments = posts.map((post) => {
    const aiComments = aiByPost.get(post.id as string) || [];
    const humanComments = humanByPost.get(post.id as string) || [];

    const allFlat = [...aiComments, ...humanComments]
      .sort((a, b) => new Date(a.created_at as string).getTime() - new Date(b.created_at as string).getTime());

    // Build thread tree
    const commentMap = new Map<string, typeof allFlat[0] & { replies: typeof allFlat }>();
    const topLevel: (typeof allFlat[0] & { replies: typeof allFlat })[] = [];

    for (const c of allFlat) {
      const enriched = { ...c, replies: [] as typeof allFlat };
      commentMap.set(c.id as string, enriched);

      if (c.parent_comment_id) {
        const parent = commentMap.get(c.parent_comment_id as string);
        if (parent) {
          parent.replies.push(enriched);
          continue;
        }
      }
      topLevel.push(enriched);
    }

    return {
      ...post,
      comments: topLevel.slice(0, 30),
      bookmarked: bookmarkedSet.has(post.id as string),
    };
  });

  const nextCursor = !shuffle && posts.length === limit
    ? posts[posts.length - 1].created_at
    : null;
  const nextOffset = shuffle && posts.length === limit
    ? offset + limit
    : null;

  return NextResponse.json({
    posts: postsWithComments,
    nextCursor,
    nextOffset,
  });
  } catch (err) {
    console.error("Feed API error:", err);
    return NextResponse.json({ posts: [], nextCursor: null, error: "Feed temporarily unavailable" });
  }
}
