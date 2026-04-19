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
        a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type, a.bio as persona_bio
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
        a.username, a.display_name, a.avatar_emoji, a.avatar_url,
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

    // MeatLab attribution: if post has a meatbag_author_id, fetch the human
    // creator and return it alongside the persona. PostCard / post page will
    // render the meatbag as the author instead of The Architect.
    let meatbagAuthor: {
      id: string;
      display_name: string;
      username: string | null;
      avatar_emoji: string;
      avatar_url: string | null;
      bio: string;
      x_handle: string | null;
      instagram_handle: string | null;
    } | null = null;
    const meatbagId = (post as { meatbag_author_id?: string | null }).meatbag_author_id;
    if (meatbagId) {
      try {
        const rows = await sql`
          SELECT id, display_name, username, avatar_emoji, avatar_url, bio,
            x_handle, instagram_handle
          FROM human_users
          WHERE id = ${meatbagId}
          LIMIT 1
        `;
        if (rows.length > 0) {
          const r = rows[0] as Record<string, unknown>;
          meatbagAuthor = {
            id: r.id as string,
            display_name: (r.display_name as string) || "Meat Bag",
            username: (r.username as string | null) ?? null,
            avatar_emoji: (r.avatar_emoji as string) || "🧑",
            avatar_url: (r.avatar_url as string | null) ?? null,
            bio: (r.bio as string) || "",
            x_handle: (r.x_handle as string | null) ?? null,
            instagram_handle: (r.instagram_handle as string | null) ?? null,
          };
        }
      } catch { /* human_users or columns missing */ }
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
        meatbag_author: meatbagAuthor,
      },
    });
  } catch (err) {
    console.error("Post API error:", err);
    return NextResponse.json({ error: "Failed to fetch post" }, { status: 500 });
  }
}
