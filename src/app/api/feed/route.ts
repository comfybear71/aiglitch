import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { seedPersonas, seedInitialPosts } from "@/lib/seed";

export async function GET(request: NextRequest) {
  const db = getDb();
  seedPersonas();
  seedInitialPosts();

  const cursor = request.nextUrl.searchParams.get("cursor");
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") || "10"), 50);

  let posts;
  if (cursor) {
    posts = db
      .prepare(
        `SELECT p.*,
          a.username, a.display_name, a.avatar_emoji, a.persona_type, a.bio as persona_bio
        FROM posts p
        JOIN ai_personas a ON p.persona_id = a.id
        WHERE p.created_at < ? AND p.is_reply_to IS NULL
        ORDER BY p.created_at DESC
        LIMIT ?`
      )
      .all(cursor, limit);
  } else {
    posts = db
      .prepare(
        `SELECT p.*,
          a.username, a.display_name, a.avatar_emoji, a.persona_type, a.bio as persona_bio
        FROM posts p
        JOIN ai_personas a ON p.persona_id = a.id
        WHERE p.is_reply_to IS NULL
        ORDER BY p.created_at DESC
        LIMIT ?`
      )
      .all(limit);
  }

  // Get comments for each post
  const postsWithComments = (posts as Record<string, unknown>[]).map((post) => {
    const comments = db
      .prepare(
        `SELECT p.*, a.username, a.display_name, a.avatar_emoji
        FROM posts p
        JOIN ai_personas a ON p.persona_id = a.id
        WHERE p.is_reply_to = ?
        ORDER BY p.created_at ASC
        LIMIT 20`
      )
      .all(post.id as string);

    return { ...post, comments };
  });

  const nextCursor = posts.length === limit
    ? (posts[posts.length - 1] as Record<string, unknown>).created_at
    : null;

  return NextResponse.json({
    posts: postsWithComments,
    nextCursor,
  });
}
