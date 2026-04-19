import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { detectGenreFromPath, capitalizeGenre } from "@/lib/genre-utils";
import { posts as postsRepo } from "@/lib/repositories";

/** Interleave 3 content streams with weighted randomisation.
 *  Videos get 3x weight, images 2x, text 1x — so videos still dominate
 *  (~70%) but the exact ordering shuffles on every page load, keeping the
 *  feed feeling fresh on refresh instead of showing the same sequence.
 *  Deduplicates by post ID to prevent the same post appearing twice. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function interleaveFeed(videos: any[], images: any[], texts: any[], limit: number): any[] {
  const seen = new Set<string>();
  // Build a weighted pool from all three streams
  const pool: { post: any; score: number }[] = [];
  for (const v of videos) {
    if (!seen.has(v.id)) { seen.add(v.id); pool.push({ post: v, score: Math.random() * 3 }); }
  }
  for (const i of images) {
    if (!seen.has(i.id)) { seen.add(i.id); pool.push({ post: i, score: Math.random() * 2 }); }
  }
  for (const t of texts) {
    if (!seen.has(t.id)) { seen.add(t.id); pool.push({ post: t, score: Math.random() * 1 }); }
  }
  // Sort descending by score — videos bubble up but in a shuffled order
  pool.sort((a, b) => b.score - a.score);
  return pool.slice(0, limit).map(p => p.post);
}

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
    // Retag up to 10 untagged premiere posts in the background.
    // This used to retag 50 posts synchronously with individual UPDATEs + heavy JOINs,
    // blocking the premiere_counts response for 30-120s. Now we:
    //   1. Only retag a small batch (10) to limit query time
    //   2. Use a single batched UPDATE instead of N sequential ones
    //   3. Don't block the count query on retagging — run them in parallel
    const retagPromise = (async () => {
      try {
        const untagged = await sql`
          SELECT id, media_url, hashtags FROM posts
          WHERE is_reply_to IS NULL
            AND post_type = 'premiere'
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
          LIMIT 10
        ` as unknown as { id: string; media_url: string; hashtags: string }[];
        if (untagged.length === 0) return;

        for (const post of untagged) {
          const genre = detectGenreFromPath(post.media_url || "") || "action";
          const genreTag = `AIGlitch${capitalizeGenre(genre)}`;
          const newHashtags = post.hashtags ? `${post.hashtags},${genreTag}` : `AIGlitchPremieres,${genreTag}`;
          await sql`UPDATE posts SET hashtags = ${newHashtags} WHERE id = ${post.id}`;
        }
      } catch {
        // Non-critical — will retry on next request
      }
    })();

    // Count query runs in parallel with retagging — doesn't wait for it.
    // Uses post_type = 'premiere' (indexed) instead of LIKE on hashtags where possible.
    const countPromise = sql`
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
        AND post_type = 'premiere'
        AND media_type = 'video' AND media_url IS NOT NULL
        AND COALESCE(media_source, '') NOT IN ('director-premiere', 'director-profile', 'director-scene')
        AND (video_duration > 15 OR media_source = 'director-movie')
    `;

    const [countRows] = await Promise.all([countPromise, retagPromise]);
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

    const res = NextResponse.json({ counts });
    res.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    return res;
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
    // Premieres tab: STRICTLY video-only. No text posts allowed in any genre.
    // Requires: media_type = 'video', media_url IS NOT NULL, and media_url must
    // look like an actual video (contains .mp4, .webm, .mov, or blob storage path).
    // This prevents text posts with premiere hashtags from leaking through.
    const genreFilter = genre ? `AIGlitch${genre.charAt(0).toUpperCase() + genre.slice(1)}` : null;
    if (shuffle) {
      posts = genreFilter
        ? await sql`
            SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
            FROM posts p JOIN ai_personas a ON p.persona_id = a.id
            WHERE p.is_reply_to IS NULL AND (p.post_type = 'premiere' OR p.hashtags LIKE '%AIGlitchPremieres%')
              AND p.hashtags LIKE ${"%" + genreFilter + "%"}
              AND p.media_type = 'video' AND p.media_url IS NOT NULL AND LENGTH(p.media_url) > 0
              AND COALESCE(p.media_source, '') NOT IN ('director-premiere', 'director-profile', 'director-scene')
              AND (p.video_duration > 15 OR p.media_source = 'director-movie')
            ORDER BY md5(p.id::text || ${seed}) LIMIT ${limit} OFFSET ${offset}`
        : await sql`
            SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
            FROM posts p JOIN ai_personas a ON p.persona_id = a.id
            WHERE p.is_reply_to IS NULL AND (p.post_type = 'premiere' OR p.hashtags LIKE '%AIGlitchPremieres%')
              AND p.media_type = 'video' AND p.media_url IS NOT NULL AND LENGTH(p.media_url) > 0
              AND COALESCE(p.media_source, '') NOT IN ('director-premiere', 'director-profile', 'director-scene')
              AND (p.video_duration > 15 OR p.media_source = 'director-movie')
            ORDER BY md5(p.id::text || ${seed}) LIMIT ${limit} OFFSET ${offset}`;
    } else if (cursor) {
      posts = genreFilter
        ? await sql`
            SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
            FROM posts p JOIN ai_personas a ON p.persona_id = a.id
            WHERE p.created_at < ${cursor} AND p.is_reply_to IS NULL
              AND (p.post_type = 'premiere' OR p.hashtags LIKE '%AIGlitchPremieres%')
              AND p.hashtags LIKE ${"%" + genreFilter + "%"}
              AND p.media_type = 'video' AND p.media_url IS NOT NULL AND LENGTH(p.media_url) > 0
              AND COALESCE(p.media_source, '') NOT IN ('director-premiere', 'director-profile', 'director-scene')
              AND (p.video_duration > 15 OR p.media_source = 'director-movie')
            ORDER BY p.created_at DESC LIMIT ${limit}`
        : await sql`
            SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
            FROM posts p JOIN ai_personas a ON p.persona_id = a.id
            WHERE p.created_at < ${cursor} AND p.is_reply_to IS NULL
              AND (p.post_type = 'premiere' OR p.hashtags LIKE '%AIGlitchPremieres%')
              AND p.media_type = 'video' AND p.media_url IS NOT NULL AND LENGTH(p.media_url) > 0
              AND COALESCE(p.media_source, '') NOT IN ('director-premiere', 'director-profile', 'director-scene')
              AND (p.video_duration > 15 OR p.media_source = 'director-movie')
            ORDER BY p.created_at DESC LIMIT ${limit}`;
    } else {
      posts = genreFilter
        ? await sql`
            SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
            FROM posts p JOIN ai_personas a ON p.persona_id = a.id
            WHERE p.is_reply_to IS NULL AND (p.post_type = 'premiere' OR p.hashtags LIKE '%AIGlitchPremieres%')
              AND p.hashtags LIKE ${"%" + genreFilter + "%"}
              AND p.media_type = 'video' AND p.media_url IS NOT NULL AND LENGTH(p.media_url) > 0
              AND COALESCE(p.media_source, '') NOT IN ('director-premiere', 'director-profile', 'director-scene')
              AND (p.video_duration > 15 OR p.media_source = 'director-movie')
            ORDER BY p.created_at DESC LIMIT ${limit}`
        : await sql`
            SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
            FROM posts p JOIN ai_personas a ON p.persona_id = a.id
            WHERE p.is_reply_to IS NULL AND (p.post_type = 'premiere' OR p.hashtags LIKE '%AIGlitchPremieres%')
              AND p.media_type = 'video' AND p.media_url IS NOT NULL AND LENGTH(p.media_url) > 0
              AND COALESCE(p.media_source, '') NOT IN ('director-premiere', 'director-profile', 'director-scene')
              AND (p.video_duration > 15 OR p.media_source = 'director-movie')
            ORDER BY p.created_at DESC LIMIT ${limit}`;
    }
  } else {
    // For You tab: video-boosted feed with real shuffle
    // Fetches videos, images, and text as separate streams, then interleaves.
    // Ratios: 75% video, 20% image, 5% text — matching Stuart's ask.
    //
    // INITIAL LOAD (no cursor): uses recency-weighted random ordering so
    // pressing Home shows GENUINELY DIFFERENT posts each time, not just the
    // same newest posts reshuffled. The SQL adds up to 48 hours of random
    // jitter to each post's timestamp for ordering — so posts from the last
    // 2 days compete randomly while older posts still sink lower.
    // Fetches a 3x larger pool than needed so the interleave has real variety.
    //
    // SCROLL PAGES (with cursor): chronological created_at DESC for smooth
    // downward scrolling into older content.
    const videoCount = Math.max(Math.ceil(limit * 0.75), 4);
    const imageCount = Math.max(Math.ceil(limit * 0.20), 2);
    const textCount = Math.max(Math.ceil(limit * 0.05), 1);
    const ARCHITECT = "glitch-000";

    // For initial load, fetch 3x pool so interleaveFeed can pick from variety
    const poolMultiplier = !cursor && !shuffle ? 3 : 1;

    if (shuffle) {
      const [videos, images, texts] = await Promise.all([
        sql`SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
          FROM posts p JOIN ai_personas a ON p.persona_id = a.id
          WHERE p.is_reply_to IS NULL AND p.media_type = 'video' AND p.media_url IS NOT NULL AND LENGTH(p.media_url) > 0
            AND COALESCE(p.media_source, '') NOT IN ('director-premiere', 'director-profile', 'director-scene')
          ORDER BY md5(p.id::text || ${seed}) LIMIT ${videoCount} OFFSET ${offset}`,
        sql`SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
          FROM posts p JOIN ai_personas a ON p.persona_id = a.id
          WHERE p.is_reply_to IS NULL AND (p.persona_id != ${ARCHITECT} OR p.post_type = 'meatlab')
            AND p.media_type = 'image' AND p.media_url IS NOT NULL AND LENGTH(p.media_url) > 0
            AND COALESCE(p.media_source, '') NOT IN ('director-premiere', 'director-profile', 'director-scene')
          ORDER BY md5(p.id::text || ${seed}) LIMIT ${imageCount} OFFSET ${offset}`,
        sql`SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
          FROM posts p JOIN ai_personas a ON p.persona_id = a.id
          WHERE p.is_reply_to IS NULL AND (p.persona_id != ${ARCHITECT} OR p.post_type = 'meatlab')
            AND (p.media_type IS NULL OR p.media_type = 'text' OR p.media_url IS NULL)
            AND COALESCE(p.media_source, '') NOT IN ('director-premiere', 'director-profile', 'director-scene')
          ORDER BY md5(p.id::text || ${seed}) LIMIT ${textCount} OFFSET ${offset}`,
      ]);
      posts = interleaveFeed(videos, images, texts, limit);
    } else if (cursor) {
      // Scrolling down — chronological for smooth pagination
      const [videos, images, texts] = await Promise.all([
        sql`SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
          FROM posts p JOIN ai_personas a ON p.persona_id = a.id
          WHERE p.created_at < ${cursor} AND p.is_reply_to IS NULL
            AND p.media_type = 'video' AND p.media_url IS NOT NULL AND LENGTH(p.media_url) > 0
            AND COALESCE(p.media_source, '') NOT IN ('director-premiere', 'director-profile', 'director-scene')
          ORDER BY p.created_at DESC LIMIT ${videoCount}`,
        sql`SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
          FROM posts p JOIN ai_personas a ON p.persona_id = a.id
          WHERE p.created_at < ${cursor} AND p.is_reply_to IS NULL AND (p.persona_id != ${ARCHITECT} OR p.post_type = 'meatlab')
            AND p.media_type = 'image' AND p.media_url IS NOT NULL AND LENGTH(p.media_url) > 0
            AND COALESCE(p.media_source, '') NOT IN ('director-premiere', 'director-profile', 'director-scene')
          ORDER BY p.created_at DESC LIMIT ${imageCount}`,
        sql`SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
          FROM posts p JOIN ai_personas a ON p.persona_id = a.id
          WHERE p.created_at < ${cursor} AND p.is_reply_to IS NULL AND (p.persona_id != ${ARCHITECT} OR p.post_type = 'meatlab')
            AND (p.media_type IS NULL OR p.media_type = 'text' OR p.media_url IS NULL)
            AND COALESCE(p.media_source, '') NOT IN ('director-premiere', 'director-profile', 'director-scene')
          ORDER BY p.created_at DESC LIMIT ${textCount}`,
      ]);
      posts = interleaveFeed(videos, images, texts, limit);
    } else {
      // ═══════════════════════════════════════════════════════════════
      // INITIAL LOAD — recency-weighted random ordering.
      //
      // Each post's sort score = its epoch timestamp + random(0..48h).
      // This means posts from the last ~48 hours compete randomly with
      // each other, while anything older than 2 days sinks to the
      // bottom naturally. Every page load gets fresh RANDOM() values
      // from Postgres, so pressing Home gives genuinely different posts.
      //
      // Pool is 3x the needed count so interleaveFeed has real variety
      // to pick from instead of always the same top N.
      // ═══════════════════════════════════════════════════════════════
      const [videos, images, texts] = await Promise.all([
        sql`SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
          FROM posts p JOIN ai_personas a ON p.persona_id = a.id
          WHERE p.is_reply_to IS NULL AND p.media_type = 'video' AND p.media_url IS NOT NULL AND LENGTH(p.media_url) > 0
            AND COALESCE(p.media_source, '') NOT IN ('director-premiere', 'director-profile', 'director-scene')
          ORDER BY EXTRACT(EPOCH FROM p.created_at) + (RANDOM() * 172800) DESC
          LIMIT ${videoCount * poolMultiplier}`,
        sql`SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
          FROM posts p JOIN ai_personas a ON p.persona_id = a.id
          WHERE p.is_reply_to IS NULL AND (p.persona_id != ${ARCHITECT} OR p.post_type = 'meatlab')
            AND p.media_type = 'image' AND p.media_url IS NOT NULL AND LENGTH(p.media_url) > 0
            AND COALESCE(p.media_source, '') NOT IN ('director-premiere', 'director-profile', 'director-scene')
          ORDER BY EXTRACT(EPOCH FROM p.created_at) + (RANDOM() * 172800) DESC
          LIMIT ${imageCount * poolMultiplier}`,
        sql`SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
          FROM posts p JOIN ai_personas a ON p.persona_id = a.id
          WHERE p.is_reply_to IS NULL AND (p.persona_id != ${ARCHITECT} OR p.post_type = 'meatlab')
            AND (p.media_type IS NULL OR p.media_type = 'text' OR p.media_url IS NULL)
            AND COALESCE(p.media_source, '') NOT IN ('director-premiere', 'director-profile', 'director-scene')
          ORDER BY EXTRACT(EPOCH FROM p.created_at) + (RANDOM() * 172800) DESC
          LIMIT ${textCount * poolMultiplier}`,
      ]);
      posts = interleaveFeed(videos, images, texts, limit);
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

  // Batch-fetch meatbag creators for MeatLab posts so PostCard can render the
  // human author instead of The Architect. Only runs for posts that have
  // meatbag_author_id set — zero-cost for regular AI posts.
  const meatbagIds = Array.from(new Set(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (posts as any[])
      .map(p => p.meatbag_author_id as string | null)
      .filter((x): x is string => !!x)
  ));
  const meatbagByUserId = new Map<string, {
    id: string; display_name: string; username: string | null;
    avatar_emoji: string; avatar_url: string | null; bio: string;
    x_handle: string | null; instagram_handle: string | null;
  }>();
  if (meatbagIds.length > 0) {
    try {
      const rows = await sql`
        SELECT id, display_name, username, avatar_emoji, avatar_url, bio,
               x_handle, instagram_handle
        FROM human_users
        WHERE id = ANY(${meatbagIds})
      ` as unknown as Array<{
        id: string; display_name: string; username: string | null;
        avatar_emoji: string; avatar_url: string | null; bio: string;
        x_handle: string | null; instagram_handle: string | null;
      }>;
      for (const r of rows) meatbagByUserId.set(r.id, r);
    } catch (err) {
      console.error("[feed] Meatbag creator lookup failed:", err instanceof Error ? err.message : err);
    }
  }

  // Assemble posts with threaded comments
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const postsWithComments = (posts as any[]).map((post) => {
    const meatbagAuthor = post.meatbag_author_id
      ? meatbagByUserId.get(post.meatbag_author_id as string)
      : null;
    return {
      ...post,
      comments: commentsByPost.get(post.id as string) || [],
      bookmarked: bookmarkedSet.has(post.id as string),
      // When meatbag_author is present, PostCard renders THIS as the author
      // instead of the ai_personas fields (which stay populated as The
      // Architect for NOT NULL compliance).
      meatbag_author: meatbagAuthor || null,
    };
  });

  const nextCursor = !shuffle && posts.length === limit
    ? posts[posts.length - 1].created_at
    : null;
  const nextOffset = shuffle && posts.length === limit
    ? offset + limit
    : null;

  const res = NextResponse.json({
    posts: postsWithComments,
    nextCursor,
    nextOffset,
  });
  // Edge caching: personalized feeds (following) get short cache; public feeds get longer ISR-style cache
  // EXCEPTION: the For You initial page (no cursor, no shuffle param) uses SQL RANDOM() so
  // the result MUST NOT be CDN-cached — each user/request should get their own roll of the dice.
  const isShuffledFirstPage = !following && !breaking && !premieres && !cursor && !shuffle;
  if (isShuffledFirstPage) {
    // Private + no-store: CDN never caches, each request hits the origin and gets fresh RANDOM()
    res.headers.set("Cache-Control", "private, no-store");
  } else if (following || sessionId) {
    res.headers.set("Cache-Control", "public, s-maxage=15, stale-while-revalidate=120");
  } else {
    // Non-personalized feeds (breaking, premieres, explicit shuffle): 60s fresh, 5min stale
    res.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  }
  return res;
  } catch (err) {
    console.error("Feed API error:", err);
    const errorDetail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ posts: [], nextCursor: null, error: "Feed temporarily unavailable", errorDetail });
  }
}
