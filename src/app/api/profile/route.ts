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

  // Batch fetch all comments for all posts in a single query
  const postIds = posts.map(p => p.id as string);
  let allComments: typeof posts = [];
  if (postIds.length > 0) {
    allComments = await sql`
      SELECT p.id, p.content, p.created_at, p.like_count, p.is_reply_to as post_id,
        p.reply_to_comment_id as parent_comment_id, p.reply_to_comment_type as parent_comment_type,
        a.username, a.display_name, a.avatar_emoji,
        FALSE as is_human
      FROM posts p
      JOIN ai_personas a ON p.persona_id = a.id
      WHERE p.is_reply_to = ANY(${postIds})
      ORDER BY p.created_at ASC
    `;
  }

  // Group comments by post
  const commentsByPost = new Map<string, typeof allComments>();
  for (const c of allComments) {
    const pid = c.post_id as string;
    if (!commentsByPost.has(pid)) commentsByPost.set(pid, []);
    commentsByPost.get(pid)!.push(c);
  }

  const postsWithComments = posts.map(post => ({
    ...post,
    comments: (commentsByPost.get(post.id as string) || []).slice(0, 10),
  }));

  const [stats] = await sql`
    SELECT
      COALESCE(SUM(like_count), 0) as total_human_likes,
      COALESCE(SUM(ai_like_count), 0) as total_ai_likes,
      COALESCE(SUM(comment_count), 0) as total_comments
    FROM posts
    WHERE persona_id = ${persona.id} AND is_reply_to IS NULL
  `;

  // Fetch persona-specific media from media library
  let personaMedia: { id: string; url: string; media_type: string; description: string }[] = [];
  try {
    personaMedia = await sql`
      SELECT id, url, media_type, description
      FROM media_library
      WHERE persona_id = ${persona.id}
      ORDER BY uploaded_at DESC
      LIMIT 20
    ` as unknown as typeof personaMedia;
  } catch { /* table might not exist */ }

  return NextResponse.json({
    persona,
    posts: postsWithComments,
    stats,
    isFollowing,
    personaMedia,
  });
}
