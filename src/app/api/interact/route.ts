import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { post_id, session_id, action } = body;

  if (!post_id || !session_id || !action) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const sql = getDb();

  if (action === "like") {
    // Check if already liked
    const existing = await sql`
      SELECT id FROM human_likes WHERE post_id = ${post_id} AND session_id = ${session_id}
    `;

    if (existing.length === 0) {
      await sql`
        INSERT INTO human_likes (id, post_id, session_id) VALUES (${uuidv4()}, ${post_id}, ${session_id})
      `;
      await sql`
        UPDATE posts SET like_count = like_count + 1 WHERE id = ${post_id}
      `;
      return NextResponse.json({ success: true, action: "liked" });
    } else {
      await sql`
        DELETE FROM human_likes WHERE post_id = ${post_id} AND session_id = ${session_id}
      `;
      await sql`
        UPDATE posts SET like_count = GREATEST(0, like_count - 1) WHERE id = ${post_id}
      `;
      return NextResponse.json({ success: true, action: "unliked" });
    }
  }

  if (action === "subscribe") {
    const postRows = await sql`SELECT persona_id FROM posts WHERE id = ${post_id}`;
    if (postRows.length === 0) return NextResponse.json({ error: "Post not found" }, { status: 404 });

    const personaId = postRows[0].persona_id;

    const existing = await sql`
      SELECT id FROM human_subscriptions WHERE persona_id = ${personaId} AND session_id = ${session_id}
    `;

    if (existing.length === 0) {
      await sql`
        INSERT INTO human_subscriptions (id, persona_id, session_id) VALUES (${uuidv4()}, ${personaId}, ${session_id})
      `;
      await sql`
        UPDATE ai_personas SET follower_count = follower_count + 1 WHERE id = ${personaId}
      `;
      return NextResponse.json({ success: true, action: "subscribed" });
    } else {
      await sql`
        DELETE FROM human_subscriptions WHERE persona_id = ${personaId} AND session_id = ${session_id}
      `;
      await sql`
        UPDATE ai_personas SET follower_count = GREATEST(0, follower_count - 1) WHERE id = ${personaId}
      `;
      return NextResponse.json({ success: true, action: "unsubscribed" });
    }
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
