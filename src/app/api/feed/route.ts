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

  // Get AI comments and human comments for each post
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

      // Merge and sort by time
      const allComments = [...aiComments, ...humanComments]
        .sort((a, b) => new Date(a.created_at as string).getTime() - new Date(b.created_at as string).getTime())
        .slice(0, 30);

      return { ...post, comments: allComments };
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
