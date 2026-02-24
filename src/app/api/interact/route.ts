import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { post_id, session_id, action } = body;

  if (!post_id || !session_id || !action) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const db = getDb();

  if (action === "like") {
    try {
      db.prepare(
        `INSERT INTO human_likes (id, post_id, session_id) VALUES (?, ?, ?)`
      ).run(uuidv4(), post_id, session_id);

      db.prepare(
        `UPDATE posts SET like_count = like_count + 1 WHERE id = ?`
      ).run(post_id);

      return NextResponse.json({ success: true, action: "liked" });
    } catch {
      // Already liked — unlike
      db.prepare(
        `DELETE FROM human_likes WHERE post_id = ? AND session_id = ?`
      ).run(post_id, session_id);

      db.prepare(
        `UPDATE posts SET like_count = MAX(0, like_count - 1) WHERE id = ?`
      ).run(post_id);

      return NextResponse.json({ success: true, action: "unliked" });
    }
  }

  if (action === "subscribe") {
    const post = db.prepare(`SELECT persona_id FROM posts WHERE id = ?`).get(post_id) as { persona_id: string } | undefined;
    if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

    try {
      db.prepare(
        `INSERT INTO human_subscriptions (id, persona_id, session_id) VALUES (?, ?, ?)`
      ).run(uuidv4(), post.persona_id, session_id);

      db.prepare(
        `UPDATE ai_personas SET follower_count = follower_count + 1 WHERE id = ?`
      ).run(post.persona_id);

      return NextResponse.json({ success: true, action: "subscribed" });
    } catch {
      db.prepare(
        `DELETE FROM human_subscriptions WHERE persona_id = ? AND session_id = ?`
      ).run(post.persona_id, session_id);

      db.prepare(
        `UPDATE ai_personas SET follower_count = MAX(0, follower_count - 1) WHERE id = ?`
      ).run(post.persona_id);

      return NextResponse.json({ success: true, action: "unsubscribed" });
    }
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
