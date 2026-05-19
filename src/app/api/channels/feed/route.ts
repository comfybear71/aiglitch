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
    // Optional genre filter for the Studios channel. Drives the per-genre swipe
    // view at /channels/aiglitch-studios?genre=action. Detection is text-based:
    // the Studios caption convention is "#AIGlitch{Genre}" hashtag and/or
    // "/{Genre}" slash suffix in the title line. We lowercase both sides for
    // case-insensitivity. The filter is a no-op outside the Studios channel.
    // See /api/channels/aiglitch-studios/by-genre/route.ts for the same logic
    // applied to the genre-rows landing.
    const genreRaw = request.nextUrl.searchParams.get("genre");
    const genreFilter = genreRaw ? genreRaw.toLowerCase().trim() : null;
    // Pre-build the two LIKE patterns in JS rather than concatenating in SQL.
    // The previous version used "LIKE '%#aiglitch' || ${genreFilter} || '%'"
    // with the same parameter referenced three times in one query; Neon's
    // serverless adapter returned partial matches in that shape. Passing the
    // full pattern as a single parameter is reliable.
    const hashtagPattern = genreFilter ? `%#aiglitch${genreFilter}%` : null;
    const slashPattern = genreFilter ? `%/${genreFilter}%` : null;

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
    // ALL channels are TV-style — require VIDEO content only.
    // Images and memes should not appear in channel feeds — channels are for video.
    const requireAnyMedia = true;
    let posts;

    // Studios + genre special path. The SQL LIKE genre filter has been
    // unreliable on a chunk of older Studios posts (the SQL pattern doesn't
    // match content where the by-genre endpoint's JS `content.toLowerCase().includes()`
    // DOES — same logical comparison, different engine result). Rather than keep
    // chasing the SQL discrepancy, we use the same JS-side filter that powers
    // the genre rows landing. Pull a wide window of prefix-validated Studios
    // posts, then filter by genre signal in JS, then dedup. Reliable + matches
    // by-genre behaviour.
    if (isStudiosChannel && genreFilter && !shuffle) {
      // 1000 to match the by-genre endpoint's window. Studios has 611+ video
      // posts and the older action films are spread back to Feb 2026; the
      // earlier WIDE_LIMIT=300 cut off everything older than ~March 5,
      // costing the swipe player ~50% of its real genre catalogue.
      const WIDE_LIMIT = 1000;
      const rawPosts = cursor
        ? await sql`
          SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
          FROM posts p
          JOIN ai_personas a ON p.persona_id = a.id
          WHERE p.created_at < ${cursor}
            AND p.is_reply_to IS NULL
            AND p.channel_id = ${channelId}
            AND p.media_url IS NOT NULL AND p.media_url != ''
            AND p.media_type = 'video'
            AND LOWER(p.content) LIKE '🎬 aig!itch studios%'
          ORDER BY p.created_at DESC
          LIMIT ${WIDE_LIMIT}
        `
        : await sql`
          SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
          FROM posts p
          JOIN ai_personas a ON p.persona_id = a.id
          WHERE p.is_reply_to IS NULL
            AND p.channel_id = ${channelId}
            AND p.media_url IS NOT NULL AND p.media_url != ''
            AND p.media_type = 'video'
            AND LOWER(p.content) LIKE '🎬 aig!itch studios%'
          ORDER BY p.created_at DESC
          LIMIT ${WIDE_LIMIT}
        `;

      const hashtagSignal = `#aiglitch${genreFilter}`;
      const slashSignal = `/${genreFilter}`;
      const matched = rawPosts.filter(p => {
        const lc = ((p.content as string) || "").toLowerCase();
        return lc.includes(hashtagSignal) || lc.includes(slashSignal);
      });

      // Dedup by media_url (Studios films share thumbnails across many posts).
      const seen = new Set<string>();
      posts = [];
      for (const p of matched) {
        const url = p.media_url as string;
        if (!url || seen.has(url)) continue;
        seen.add(url);
        posts.push(p);
        if (posts.length >= limit) break;
      }
    } else if (shuffle) {
      posts = isStudiosChannel
        ? await sql`
          SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
          FROM posts p
          JOIN ai_personas a ON p.persona_id = a.id
          WHERE p.is_reply_to IS NULL
            AND (p.channel_id = ${channelId} OR (${channelId} = 'ch-meatbag' AND p.post_type = 'meatlab' AND p.channel_id IS NULL))
            AND (${hashtagPattern}::text IS NULL OR ${channelId} <> 'ch-aiglitch-studios' OR LOWER(p.content) LIKE ${hashtagPattern} OR LOWER(p.content) LIKE ${slashPattern})
            AND p.media_url IS NOT NULL AND p.media_url != ''
            AND p.media_type = 'video'
            AND LOWER(p.content) LIKE '🎬 aig!itch studios%'
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
            AND (p.channel_id = ${channelId} OR (${channelId} = 'ch-meatbag' AND p.post_type = 'meatlab' AND p.channel_id IS NULL))
            AND (${hashtagPattern}::text IS NULL OR ${channelId} <> 'ch-aiglitch-studios' OR LOWER(p.content) LIKE ${hashtagPattern} OR LOWER(p.content) LIKE ${slashPattern})
            AND p.media_url IS NOT NULL AND p.media_url != '' AND p.media_type = 'video'
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
            AND (p.channel_id = ${channelId} OR (${channelId} = 'ch-meatbag' AND p.post_type = 'meatlab' AND p.channel_id IS NULL))
            AND (${hashtagPattern}::text IS NULL OR ${channelId} <> 'ch-aiglitch-studios' OR LOWER(p.content) LIKE ${hashtagPattern} OR LOWER(p.content) LIKE ${slashPattern})
            AND COALESCE(p.media_source, '') NOT IN ('director-premiere', 'director-profile', 'director-scene')
            AND p.media_url IS NOT NULL AND p.media_url != ''
            AND p.media_type = 'video'
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
            AND (p.channel_id = ${channelId} OR (${channelId} = 'ch-meatbag' AND p.post_type = 'meatlab' AND p.channel_id IS NULL))
            AND (${hashtagPattern}::text IS NULL OR ${channelId} <> 'ch-aiglitch-studios' OR LOWER(p.content) LIKE ${hashtagPattern} OR LOWER(p.content) LIKE ${slashPattern})
            AND p.media_url IS NOT NULL AND p.media_url != ''
            AND p.media_type = 'video'
            AND LOWER(p.content) LIKE '🎬 aig!itch studios%'
          ORDER BY p.created_at DESC
          LIMIT ${limit}
        `
        : requireMedia
        ? await sql`
          SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
          FROM posts p
          JOIN ai_personas a ON p.persona_id = a.id
          WHERE p.created_at < ${cursor} AND p.is_reply_to IS NULL
            AND (p.channel_id = ${channelId} OR (${channelId} = 'ch-meatbag' AND p.post_type = 'meatlab' AND p.channel_id IS NULL))
            AND (${hashtagPattern}::text IS NULL OR ${channelId} <> 'ch-aiglitch-studios' OR LOWER(p.content) LIKE ${hashtagPattern} OR LOWER(p.content) LIKE ${slashPattern})
            AND p.media_url IS NOT NULL AND p.media_url != '' AND p.media_type = 'video'
            AND COALESCE(p.media_source, '') NOT IN ('director-premiere', 'director-profile', 'director-scene')
          ORDER BY p.created_at DESC
          LIMIT ${limit}
        `
        : await sql`
          SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
          FROM posts p
          JOIN ai_personas a ON p.persona_id = a.id
          WHERE p.created_at < ${cursor} AND p.is_reply_to IS NULL
            AND (p.channel_id = ${channelId} OR (${channelId} = 'ch-meatbag' AND p.post_type = 'meatlab' AND p.channel_id IS NULL))
            AND (${hashtagPattern}::text IS NULL OR ${channelId} <> 'ch-aiglitch-studios' OR LOWER(p.content) LIKE ${hashtagPattern} OR LOWER(p.content) LIKE ${slashPattern})
            AND COALESCE(p.media_source, '') NOT IN ('director-premiere', 'director-profile', 'director-scene')
            AND p.media_url IS NOT NULL AND p.media_url != ''
            AND p.media_type = 'video'
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
            AND (p.channel_id = ${channelId} OR (${channelId} = 'ch-meatbag' AND p.post_type = 'meatlab' AND p.channel_id IS NULL))
            AND (${hashtagPattern}::text IS NULL OR ${channelId} <> 'ch-aiglitch-studios' OR LOWER(p.content) LIKE ${hashtagPattern} OR LOWER(p.content) LIKE ${slashPattern})
            AND p.media_url IS NOT NULL AND p.media_url != ''
            AND p.media_type = 'video'
            AND LOWER(p.content) LIKE '🎬 aig!itch studios%'
          ORDER BY p.created_at DESC
          LIMIT ${limit}
        `
        : requireMedia
        ? await sql`
          SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
          FROM posts p
          JOIN ai_personas a ON p.persona_id = a.id
          WHERE p.is_reply_to IS NULL
            AND (p.channel_id = ${channelId} OR (${channelId} = 'ch-meatbag' AND p.post_type = 'meatlab' AND p.channel_id IS NULL))
            AND (${hashtagPattern}::text IS NULL OR ${channelId} <> 'ch-aiglitch-studios' OR LOWER(p.content) LIKE ${hashtagPattern} OR LOWER(p.content) LIKE ${slashPattern})
            AND p.media_url IS NOT NULL AND p.media_url != '' AND p.media_type = 'video'
            AND COALESCE(p.media_source, '') NOT IN ('director-premiere', 'director-profile', 'director-scene')
          ORDER BY p.created_at DESC
          LIMIT ${limit}
        `
        : await sql`
          SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
          FROM posts p
          JOIN ai_personas a ON p.persona_id = a.id
          WHERE p.is_reply_to IS NULL
            AND (p.channel_id = ${channelId} OR (${channelId} = 'ch-meatbag' AND p.post_type = 'meatlab' AND p.channel_id IS NULL))
            AND (${hashtagPattern}::text IS NULL OR ${channelId} <> 'ch-aiglitch-studios' OR LOWER(p.content) LIKE ${hashtagPattern} OR LOWER(p.content) LIKE ${slashPattern})
            AND COALESCE(p.media_source, '') NOT IN ('director-premiere', 'director-profile', 'director-scene')
            AND p.media_url IS NOT NULL AND p.media_url != ''
            AND p.media_type = 'video'
          ORDER BY p.created_at DESC
          LIMIT ${limit}
        `;
    }

    // Genre-filtered Studios views: dedup posts by media_url. Many Studios films
    // share the same dominant intro thumbnail (the kitchen scene that appears as
    // the first frame on dozens of Cooking Show variants, the Studios-branded
    // title cards, etc.), so without dedup the Up Next sidebar looks like
    // "10 copies of the same video". Per-page only — cross-page dedup happens
    // client-side in loadMore() of the channel detail page.
    if (genreFilter && isStudiosChannel && posts.length > 0) {
      const seen = new Set<string>();
      const deduped: typeof posts = [];
      for (const p of posts) {
        const url = p.media_url as string;
        if (!url || seen.has(url)) continue;
        seen.add(url);
        deduped.push(p);
      }
      posts = deduped;
    }

    // Batch fetch comments + bookmarks
    const postIds = posts.map(p => p.id as string);

    if (postIds.length === 0) {
      return NextResponse.json({ channel, posts: [], nextCursor: null });
    }

    const [allAiComments, allHumanComments, bookmarkedSet, batchReactions, socialLinksRows] = await Promise.all([
      postsRepo.getAiComments(postIds),
      postsRepo.getHumanComments(postIds),
      sessionId ? postsRepo.getBookmarkedSet(postIds, sessionId) : Promise.resolve(new Set<string>()),
      interactions.getBatchReactions(postIds, sessionId || undefined),
      // Fetch social media links for all posts in this batch
      sql`SELECT source_post_id, platform, platform_url FROM marketing_posts
          WHERE source_post_id = ANY(${postIds}) AND status = 'posted' AND platform_url IS NOT NULL AND platform_url != ''`,
    ]);

    // Build socialLinks map: postId -> { platform: url }
    const socialLinks: Record<string, Record<string, string>> = {};
    for (const row of socialLinksRows) {
      const pid = row.source_post_id as string;
      if (!socialLinks[pid]) socialLinks[pid] = {};
      socialLinks[pid][row.platform as string] = row.platform_url as string;
    }

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
        socialLinks: socialLinks[pid] || {},
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
