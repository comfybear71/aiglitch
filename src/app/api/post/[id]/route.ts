import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: postId } = await params;
  const sessionId = request.nextUrl.searchParams.get("session_id");

  const sql = getDb();
  await ensureDbReady();

  try {
    // Fetch the post
    const posts = await sql`
      SELECT p.*,
        a.username, a.display_name, a.avatar_emoji, a.persona_type, a.bio as persona_bio
      FROM posts p
      JOIN ai_personas a ON p.persona_id = a.id
      WHERE p.id = ${postId}
      LIMIT 1
    `;

    if (posts.length === 0) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const post = posts[0];

    // Fetch AI comments
    const aiComments = await sql`
      SELECT p.id, p.content, p.created_at, p.like_count, p.is_reply_to as post_id,
        p.reply_to_comment_id as parent_comment_id, p.reply_to_comment_type as parent_comment_type,
        a.username, a.display_name, a.avatar_emoji,
        FALSE as is_human
      FROM posts p
      JOIN ai_personas a ON p.persona_id = a.id
      WHERE p.is_reply_to = ${postId}
      ORDER BY p.created_at ASC
    `;

    // Fetch human comments
    const humanComments = await sql`
      SELECT id, content, created_at, display_name, like_count, post_id,
        parent_comment_id, parent_comment_type,
        'human' as username, '🧑' as avatar_emoji,
        TRUE as is_human
      FROM human_comments
      WHERE post_id = ${postId}
      ORDER BY created_at ASC
    `;

    // Check bookmark status
    let bookmarked = false;
    if (sessionId) {
      try {
        const bms = await sql`SELECT 1 FROM human_bookmarks WHERE post_id = ${postId} AND session_id = ${sessionId} LIMIT 1`;
        bookmarked = bms.length > 0;
      } catch { /* table might not exist */ }
    }

    // Build threaded comments
    const allFlat = [...aiComments, ...humanComments]
      .sort((a, b) => new Date(a.created_at as string).getTime() - new Date(b.created_at as string).getTime());

    type CommentNode = typeof allFlat[0] & { replies: CommentNode[] };
    const commentMap = new Map<string, CommentNode>();
    const topLevel: CommentNode[] = [];

    for (const c of allFlat) {
      const enriched: CommentNode = { ...c, replies: [] };
      commentMap.set(c.id as string, enriched);

      if (c.parent_comment_id) {
        const parent = commentMap.get(c.parent_comment_id as string);
        if (parent) {
          parent.replies.push(enriched);
          continue;
        }
      }
      topLevel.push(enriched);
    }

    return NextResponse.json({
      post: {
        ...post,
        comments: topLevel,
        bookmarked,
      },
    });
  } catch (err) {
    console.error("Post API error:", err);
    return NextResponse.json({ error: "Failed to fetch post" }, { status: 500 });
  }
}
