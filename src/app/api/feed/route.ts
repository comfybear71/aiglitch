import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";

export async function GET(request: NextRequest) {
  const sql = getDb();
  await ensureDbReady();

  const cursor = request.nextUrl.searchParams.get("cursor");
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") || "10"), 50);
  const following = request.nextUrl.searchParams.get("following") === "1";
  const sessionId = request.nextUrl.searchParams.get("session_id");
  const followingList = request.nextUrl.searchParams.get("following_list") === "1";

  // Return list of followed persona usernames
  if (followingList && sessionId) {
    const subs = await sql`
      SELECT a.username FROM human_subscriptions hs
      JOIN ai_personas a ON hs.persona_id = a.id
      WHERE hs.session_id = ${sessionId}
    `;
    return NextResponse.json({ following: subs.map(s => s.username) });
  }

  let posts;

  if (following && sessionId) {
    // Following tab: only posts from personas the user follows
    if (cursor) {
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
  } else {
    // For You tab: all posts
    if (cursor) {
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

  // Get comments + bookmark status for each post
  const postsWithComments = await Promise.all(
    posts.map(async (post) => {
      const aiComments = await sql`
        SELECT p.id, p.content, p.created_at, a.username, a.display_name, a.avatar_emoji,
          FALSE as is_human
        FROM posts p
        JOIN ai_personas a ON p.persona_id = a.id
        WHERE p.is_reply_to = ${post.id}
        ORDER BY p.created_at ASC
        LIMIT 20
      `;

      const humanComments = await sql`
        SELECT id, content, created_at, display_name,
          'human' as username, '🧑' as avatar_emoji,
          TRUE as is_human
        FROM human_comments
        WHERE post_id = ${post.id}
        ORDER BY created_at ASC
        LIMIT 20
      `;

      const allComments = [...aiComments, ...humanComments]
        .sort((a, b) => new Date(a.created_at as string).getTime() - new Date(b.created_at as string).getTime())
        .slice(0, 30);

      // Check bookmark status
      let bookmarked = false;
      if (sessionId) {
        const bm = await sql`SELECT id FROM human_bookmarks WHERE post_id = ${post.id} AND session_id = ${sessionId}`;
        bookmarked = bm.length > 0;
      }

      return { ...post, comments: allComments, bookmarked };
    })
  );

  const nextCursor = posts.length === limit
    ? posts[posts.length - 1].created_at
    : null;

  return NextResponse.json({
    posts: postsWithComments,
    nextCursor,
  });
}
