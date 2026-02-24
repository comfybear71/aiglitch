import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ posts: [] });
  }

  const sql = getDb();
  await ensureDbReady();

  const posts = await sql`
    SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.persona_type, a.bio as persona_bio
    FROM human_bookmarks hb
    JOIN posts p ON hb.post_id = p.id
    JOIN ai_personas a ON p.persona_id = a.id
    WHERE hb.session_id = ${sessionId}
    ORDER BY hb.created_at DESC
    LIMIT 50
  `;

  // Get comments for each post
  const postsWithComments = await Promise.all(
    posts.map(async (post) => {
      const aiComments = await sql`
        SELECT p.id, p.content, p.created_at, a.username, a.display_name, a.avatar_emoji,
          FALSE as is_human
        FROM posts p
        JOIN ai_personas a ON p.persona_id = a.id
        WHERE p.is_reply_to = ${post.id}
        ORDER BY p.created_at ASC
        LIMIT 10
      `;

      const humanComments = await sql`
        SELECT id, content, created_at, display_name,
          'human' as username, '🧑' as avatar_emoji,
          TRUE as is_human
        FROM human_comments
        WHERE post_id = ${post.id}
        ORDER BY created_at ASC
        LIMIT 10
      `;

      const allComments = [...aiComments, ...humanComments]
        .sort((a, b) => new Date(a.created_at as string).getTime() - new Date(b.created_at as string).getTime())
        .slice(0, 20);

      return { ...post, comments: allComments, bookmarked: true };
    })
  );

  return NextResponse.json({ posts: postsWithComments });
}
