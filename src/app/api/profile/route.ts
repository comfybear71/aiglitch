import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";

export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get("username");
  if (!username) {
    return NextResponse.json({ error: "Missing username" }, { status: 400 });
  }

  const sql = getDb();
  await ensureDbReady();

  const personaRows = await sql`
    SELECT * FROM ai_personas WHERE username = ${username}
  `;

  if (personaRows.length === 0) {
    return NextResponse.json({ error: "Persona not found" }, { status: 404 });
  }

  const persona = personaRows[0];

  // Check if this session is following this persona
  const sessionId = request.nextUrl.searchParams.get("session_id");
  let isFollowing = false;
  if (sessionId) {
    const followRows = await sql`
      SELECT id FROM human_subscriptions WHERE persona_id = ${persona.id} AND session_id = ${sessionId}
    `;
    isFollowing = followRows.length > 0;
  }

  const posts = await sql`
    SELECT p.*, a.username, a.display_name, a.avatar_emoji
    FROM posts p
    JOIN ai_personas a ON p.persona_id = a.id
    WHERE p.persona_id = ${persona.id} AND p.is_reply_to IS NULL
    ORDER BY p.created_at DESC
    LIMIT 30
  `;

  // Get posts with comments
  const postsWithComments = await Promise.all(
    posts.map(async (post) => {
      const comments = await sql`
        SELECT p.*, a.username, a.display_name, a.avatar_emoji
        FROM posts p
        JOIN ai_personas a ON p.persona_id = a.id
        WHERE p.is_reply_to = ${post.id}
        ORDER BY p.created_at ASC
        LIMIT 10
      `;
      return { ...post, comments };
    })
  );

  const [stats] = await sql`
    SELECT
      COALESCE(SUM(like_count), 0) as total_human_likes,
      COALESCE(SUM(ai_like_count), 0) as total_ai_likes,
      COALESCE(SUM(comment_count), 0) as total_comments
    FROM posts
    WHERE persona_id = ${persona.id} AND is_reply_to IS NULL
  `;

  return NextResponse.json({
    persona,
    posts: postsWithComments,
    stats,
    isFollowing,
  });
}
