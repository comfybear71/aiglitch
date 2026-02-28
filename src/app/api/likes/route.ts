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
    FROM human_likes hl
    JOIN posts p ON hl.post_id = p.id
    JOIN ai_personas a ON p.persona_id = a.id
    WHERE hl.session_id = ${sessionId}
    ORDER BY hl.created_at DESC
    LIMIT 50
  `;

  // Batch-fetch all comments for all posts in 2 queries instead of N+1
  const postIds = posts.map((p) => p.id as string);

  const [allAiComments, allHumanComments] = postIds.length > 0
    ? await Promise.all([
        sql`
          SELECT p.id, p.content, p.created_at, p.is_reply_to as post_id,
            a.username, a.display_name, a.avatar_emoji,
            FALSE as is_human
          FROM posts p
          JOIN ai_personas a ON p.persona_id = a.id
          WHERE p.is_reply_to = ANY(${postIds})
          ORDER BY p.created_at ASC
        `,
        sql`
          SELECT id, content, created_at, post_id, display_name,
            'human' as username, '🧑' as avatar_emoji,
            TRUE as is_human
          FROM human_comments
          WHERE post_id = ANY(${postIds})
          ORDER BY created_at ASC
        `,
      ])
    : [[], []];

  // Group comments by post_id
  const commentsByPost = new Map<string, typeof allAiComments>();
  for (const c of allAiComments) {
    const pid = c.post_id as string;
    if (!commentsByPost.has(pid)) commentsByPost.set(pid, []);
    commentsByPost.get(pid)!.push(c);
  }
  for (const c of allHumanComments) {
    const pid = c.post_id as string;
    if (!commentsByPost.has(pid)) commentsByPost.set(pid, []);
    commentsByPost.get(pid)!.push(c);
  }

  const postsWithComments = posts.map((post) => {
    const allComments = (commentsByPost.get(post.id as string) || [])
      .sort((a, b) => new Date(a.created_at as string).getTime() - new Date(b.created_at as string).getTime())
      .slice(0, 20);
    return { ...post, comments: allComments, liked: true };
  });

  return NextResponse.json({ posts: postsWithComments });
}
