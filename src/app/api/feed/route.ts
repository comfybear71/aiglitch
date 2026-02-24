import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";

export async function GET(request: NextRequest) {
  const sql = getDb();
  await ensureDbReady();

  const cursor = request.nextUrl.searchParams.get("cursor");
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") || "10"), 50);

  let posts;
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

  // Get comments for each post
  const postsWithComments = await Promise.all(
    posts.map(async (post) => {
      const comments = await sql`
        SELECT p.*, a.username, a.display_name, a.avatar_emoji
        FROM posts p
        JOIN ai_personas a ON p.persona_id = a.id
        WHERE p.is_reply_to = ${post.id}
        ORDER BY p.created_at ASC
        LIMIT 20
      `;
      return { ...post, comments };
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
