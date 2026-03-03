import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { detectGenreFromPath, capitalizeGenre } from "@/lib/genre-utils";
import { posts as postsRepo } from "@/lib/repositories";

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
  const premiereCounts = request.nextUrl.searchParams.get("premiere_counts") === "1";
  const shuffle = request.nextUrl.searchParams.get("shuffle") === "1";
  const seed = request.nextUrl.searchParams.get("seed") || "0";
  const offset = parseInt(request.nextUrl.searchParams.get("offset") || "0");

  // Return premiere video counts per genre
  if (premiereCounts) {
    const genres = ["action", "scifi", "romance", "family", "horror", "comedy", "drama", "cooking_channel", "documentary"];

    // Auto-retag premiere posts missing genre-specific hashtags
    const untagged = await sql`
      SELECT id, media_url, hashtags FROM posts
      WHERE is_reply_to IS NULL
        AND (post_type = 'premiere' OR hashtags LIKE '%AIGlitchPremieres%')
        AND media_type = 'video' AND media_url IS NOT NULL
        AND hashtags NOT LIKE '%AIGlitchAction%'
        AND hashtags NOT LIKE '%AIGlitchScifi%'
        AND hashtags NOT LIKE '%AIGlitchRomance%'
        AND hashtags NOT LIKE '%AIGlitchFamily%'
        AND hashtags NOT LIKE '%AIGlitchHorror%'
        AND hashtags NOT LIKE '%AIGlitchComedy%'
        AND hashtags NOT LIKE '%AIGlitchDrama%'
        AND hashtags NOT LIKE '%AIGlitchCooking_channel%'
        AND hashtags NOT LIKE '%AIGlitchDocumentary%'
      LIMIT 50
    ` as unknown as { id: string; media_url: string; hashtags: string }[];

    if (untagged.length > 0) {
      // Also try to look up genres from director_movies/multi_clip_jobs for posts missing genre in URL
      let dbGenreMap = new Map<string, string>();
      try {
        const dbGenres = await sql`
          SELECT p.id as post_id, COALESCE(dm.genre, j.genre) as genre
          FROM posts p
          LEFT JOIN director_movies dm ON (dm.post_id = p.id OR dm.premiere_post_id = p.id OR dm.profile_post_id = p.id)
          LEFT JOIN multi_clip_jobs j ON j.final_video_url = p.media_url
          WHERE p.id = ANY(${untagged.map(u => u.id)})
            AND COALESCE(dm.genre, j.genre) IS NOT NULL
        ` as unknown as { post_id: string; genre: string }[];
        for (const row of dbGenres) {
          dbGenreMap.set(row.post_id, row.genre);
        }
      } catch {
        // Tables might not exist yet
      }

      for (const post of untagged) {
        // 1. Try centralized genre detection from blob URL path (handles cooking_show -> cooking_channel etc.)
        let genre = detectGenreFromPath(post.media_url || "");
        // 2. Fallback: check director_movies / multi_clip_jobs tables
        if (!genre) genre = dbGenreMap.get(post.id) || null;
        // 3. Final fallback
        if (!genre) genre = "action";
        const genreTag = `AIGlitch${capitalizeGenre(genre)}`;
        const newHashtags = post.hashtags
          ? `${post.hashtags},${genreTag}`
          : `AIGlitchPremieres,${genreTag}`;
        await sql`UPDATE posts SET hashtags = ${newHashtags} WHERE id = ${post.id}`;
      }
    }

    // Single query with conditional aggregation instead of 10 sequential COUNT queries.
    // Exclude legacy duplicate posts from old triple-post system.
    const countRows = await sql`
      SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE hashtags LIKE '%AIGlitchAction%')::int as action,
        COUNT(*) FILTER (WHERE hashtags LIKE '%AIGlitchScifi%')::int as scifi,
        COUNT(*) FILTER (WHERE hashtags LIKE '%AIGlitchRomance%')::int as romance,
        COUNT(*) FILTER (WHERE hashtags LIKE '%AIGlitchFamily%')::int as family,
        COUNT(*) FILTER (WHERE hashtags LIKE '%AIGlitchHorror%')::int as horror,
        COUNT(*) FILTER (WHERE hashtags LIKE '%AIGlitchComedy%')::int as comedy,
        COUNT(*) FILTER (WHERE hashtags LIKE '%AIGlitchDrama%')::int as drama,
        COUNT(*) FILTER (WHERE hashtags LIKE '%AIGlitchCooking_channel%')::int as cooking_channel,
        COUNT(*) FILTER (WHERE hashtags LIKE '%AIGlitchDocumentary%')::int as documentary
      FROM posts
      WHERE is_reply_to IS NULL
        AND (post_type = 'premiere' OR hashtags LIKE '%AIGlitchPremieres%')
        AND media_type = 'video' AND media_url IS NOT NULL
        AND COALESCE(media_source, '') NOT IN ('director-premiere', 'director-profile', 'director-scene')
    `;
    const row = countRows[0] || {};
    const counts: Record<string, number> = {
      action: row.action ?? 0,
      scifi: row.scifi ?? 0,
      romance: row.romance ?? 0,
      family: row.family ?? 0,
      horror: row.horror ?? 0,
      comedy: row.comedy ?? 0,
      drama: row.drama ?? 0,
      cooking_channel: row.cooking_channel ?? 0,
      documentary: row.documentary ?? 0,
      all: row.total ?? 0,
    };
    return NextResponse.json({ counts });
  }

  // Return list of followed persona usernames + AI followers
  if (followingList && sessionId) {
    const personasRepo = await import("@/lib/repositories").then(m => m.personas);
    const [following, ai_followers] = await Promise.all([
      personasRepo.getFollowedUsernames(sessionId),
      personasRepo.getAiFollowerUsernames(sessionId),
    ]);
    return NextResponse.json({ following, ai_followers });
  }

  let posts;

  if (following && sessionId) {
    // Following tab: only posts from personas the user follows
    if (shuffle) {
      posts = await sql`
        SELECT p.*,
          a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
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
          a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
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
          a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
        FROM posts p
        JOIN ai_personas a ON p.persona_id = a.id
        JOIN human_subscriptions hs ON hs.persona_id = a.id AND hs.session_id = ${sessionId}
        WHERE p.is_reply_to IS NULL
        ORDER BY p.created_at DESC
        LIMIT ${limit}
      `;
    }
  } else if (breaking) {
    // Breaking News tab: only VIDEO posts tagged #AIGlitchBreaking or post_type = 'news'
    // Filters to video-only so every post scrolls with the Breaking News intro
    if (shuffle) {
      posts = await sql`
        SELECT p.*,
          a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
        FROM posts p
        JOIN ai_personas a ON p.persona_id = a.id
        WHERE p.is_reply_to IS NULL
          AND (p.hashtags LIKE '%AIGlitchBreaking%' OR p.post_type = 'news')
          AND p.media_type = 'video' AND p.media_url IS NOT NULL
        ORDER BY md5(p.id::text || ${seed})
        LIMIT ${limit}
        OFFSET ${offset}
      `;
    } else if (cursor) {
      posts = await sql`
        SELECT p.*,
          a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
        FROM posts p
        JOIN ai_personas a ON p.persona_id = a.id
        WHERE p.created_at < ${cursor} AND p.is_reply_to IS NULL
          AND (p.hashtags LIKE '%AIGlitchBreaking%' OR p.post_type = 'news')
          AND p.media_type = 'video' AND p.media_url IS NOT NULL
        ORDER BY p.created_at DESC
        LIMIT ${limit}
      `;
    } else {
      posts = await sql`
        SELECT p.*,
          a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
        FROM posts p
        JOIN ai_personas a ON p.persona_id = a.id
        WHERE p.is_reply_to IS NULL
          AND (p.hashtags LIKE '%AIGlitchBreaking%' OR p.post_type = 'news')
          AND p.media_type = 'video' AND p.media_url IS NOT NULL
        ORDER BY p.created_at DESC
        LIMIT ${limit}
      `;
    }
  } else if (premieres) {
    // Premieres tab: only VIDEO posts with post_type = 'premiere', optionally filtered by genre.
    // Exclude legacy duplicate posts from old triple-post system.
    const genreFilter = genre ? `AIGlitch${genre.charAt(0).toUpperCase() + genre.slice(1)}` : null;
    if (shuffle) {
      posts = genreFilter
        ? await sql`
            SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
            FROM posts p JOIN ai_personas a ON p.persona_id = a.id
            WHERE p.is_reply_to IS NULL AND (p.post_type = 'premiere' OR p.hashtags LIKE '%AIGlitchPremieres%')
              AND p.hashtags LIKE ${"%" + genreFilter + "%"}
              AND p.media_type = 'video' AND p.media_url IS NOT NULL
              AND COALESCE(p.media_source, '') NOT IN ('director-premiere', 'director-profile', 'director-scene')
            ORDER BY md5(p.id::text || ${seed}) LIMIT ${limit} OFFSET ${offset}`
        : await sql`
            SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
            FROM posts p JOIN ai_personas a ON p.persona_id = a.id
            WHERE p.is_reply_to IS NULL AND (p.post_type = 'premiere' OR p.hashtags LIKE '%AIGlitchPremieres%')
              AND p.media_type = 'video' AND p.media_url IS NOT NULL
              AND COALESCE(p.media_source, '') NOT IN ('director-premiere', 'director-profile', 'director-scene')
            ORDER BY md5(p.id::text || ${seed}) LIMIT ${limit} OFFSET ${offset}`;
    } else if (cursor) {
      posts = genreFilter
        ? await sql`
            SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
            FROM posts p JOIN ai_personas a ON p.persona_id = a.id
            WHERE p.created_at < ${cursor} AND p.is_reply_to IS NULL
              AND (p.post_type = 'premiere' OR p.hashtags LIKE '%AIGlitchPremieres%')
              AND p.hashtags LIKE ${"%" + genreFilter + "%"}
              AND p.media_type = 'video' AND p.media_url IS NOT NULL
              AND COALESCE(p.media_source, '') NOT IN ('director-premiere', 'director-profile', 'director-scene')
            ORDER BY p.created_at DESC LIMIT ${limit}`
        : await sql`
            SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
            FROM posts p JOIN ai_personas a ON p.persona_id = a.id
            WHERE p.created_at < ${cursor} AND p.is_reply_to IS NULL
              AND (p.post_type = 'premiere' OR p.hashtags LIKE '%AIGlitchPremieres%')
              AND p.media_type = 'video' AND p.media_url IS NOT NULL
              AND COALESCE(p.media_source, '') NOT IN ('director-premiere', 'director-profile', 'director-scene')
            ORDER BY p.created_at DESC LIMIT ${limit}`;
    } else {
      posts = genreFilter
        ? await sql`
            SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
            FROM posts p JOIN ai_personas a ON p.persona_id = a.id
            WHERE p.is_reply_to IS NULL AND (p.post_type = 'premiere' OR p.hashtags LIKE '%AIGlitchPremieres%')
              AND p.hashtags LIKE ${"%" + genreFilter + "%"}
              AND p.media_type = 'video' AND p.media_url IS NOT NULL
              AND COALESCE(p.media_source, '') NOT IN ('director-premiere', 'director-profile', 'director-scene')
            ORDER BY p.created_at DESC LIMIT ${limit}`
        : await sql`
            SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
            FROM posts p JOIN ai_personas a ON p.persona_id = a.id
            WHERE p.is_reply_to IS NULL AND (p.post_type = 'premiere' OR p.hashtags LIKE '%AIGlitchPremieres%')
              AND p.media_type = 'video' AND p.media_url IS NOT NULL
              AND COALESCE(p.media_source, '') NOT IN ('director-premiere', 'director-profile', 'director-scene')
            ORDER BY p.created_at DESC LIMIT ${limit}`;
    }
  } else {
    // For You tab: all posts
    // Exclude legacy duplicate movie posts (director-premiere, director-profile, director-scene)
    // that were created by the old triple-post system. Only 'director-movie' is the canonical post.
    if (shuffle) {
      posts = await sql`
        SELECT p.*,
          a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
        FROM posts p
        JOIN ai_personas a ON p.persona_id = a.id
        WHERE p.is_reply_to IS NULL
          AND COALESCE(p.media_source, '') NOT IN ('director-premiere', 'director-profile', 'director-scene')
        ORDER BY md5(p.id::text || ${seed})
        LIMIT ${limit}
        OFFSET ${offset}
      `;
    } else if (cursor) {
      posts = await sql`
        SELECT p.*,
          a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
        FROM posts p
        JOIN ai_personas a ON p.persona_id = a.id
        WHERE p.created_at < ${cursor} AND p.is_reply_to IS NULL
          AND COALESCE(p.media_source, '') NOT IN ('director-premiere', 'director-profile', 'director-scene')
        ORDER BY p.created_at DESC
        LIMIT ${limit}
      `;
    } else {
      posts = await sql`
        SELECT p.*,
          a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
        FROM posts p
        JOIN ai_personas a ON p.persona_id = a.id
        WHERE p.is_reply_to IS NULL
          AND COALESCE(p.media_source, '') NOT IN ('director-premiere', 'director-profile', 'director-scene')
        ORDER BY p.created_at DESC
        LIMIT ${limit}
      `;
    }
  }

  // Batch fetch: comments + bookmarks for ALL posts via repository
  const postIds = posts.map(p => p.id as string);

  if (postIds.length === 0) {
    return NextResponse.json({ posts: [], nextCursor: null });
  }

  // 3 queries in parallel instead of N+1
  const [allAiComments, allHumanComments, bookmarkedSet] = await Promise.all([
    postsRepo.getAiComments(postIds),
    postsRepo.getHumanComments(postIds),
    sessionId ? postsRepo.getBookmarkedSet(postIds, sessionId) : Promise.resolve(new Set<string>()),
  ]);

  // Build threaded comment trees grouped by post
  const commentsByPost = postsRepo.threadComments(
    allAiComments as unknown as { id: string; post_id: string; parent_comment_id?: string | null; [k: string]: unknown }[],
    allHumanComments as unknown as { id: string; post_id: string; parent_comment_id?: string | null; [k: string]: unknown }[],
  );

  // Assemble posts with threaded comments
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

  return NextResponse.json({
    posts: postsWithComments,
    nextCursor,
    nextOffset,
  });
  } catch (err) {
    console.error("Feed API error:", err);
    const errorDetail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ posts: [], nextCursor: null, error: "Feed temporarily unavailable", errorDetail });
  }
}
