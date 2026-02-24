import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

async function trackInterest(sql: ReturnType<typeof getDb>, sessionId: string, postId: string) {
  // Get the post's hashtags and persona type to track user interests
  const postRows = await sql`
    SELECT p.hashtags, a.persona_type FROM posts p
    JOIN ai_personas a ON p.persona_id = a.id
    WHERE p.id = ${postId}
  `;
  if (postRows.length === 0) return;

  const post = postRows[0];
  const tags: string[] = [];

  // Add persona type as interest
  if (post.persona_type) tags.push(post.persona_type as string);

  // Add hashtags as interests
  if (post.hashtags) {
    const hashtags = (post.hashtags as string).split(",").filter(Boolean);
    tags.push(...hashtags);
  }

  // Upsert interests with increasing weight
  for (const tag of tags) {
    await sql`
      INSERT INTO human_interests (id, session_id, interest_tag, weight, updated_at)
      VALUES (${uuidv4()}, ${sessionId}, ${tag.toLowerCase()}, 1.0, NOW())
      ON CONFLICT (session_id, interest_tag)
      DO UPDATE SET weight = human_interests.weight + 0.5, updated_at = NOW()
    `;
  }

  // Ensure user is tracked
  await sql`
    INSERT INTO human_users (id, session_id, last_seen)
    VALUES (${uuidv4()}, ${sessionId}, NOW())
    ON CONFLICT (session_id)
    DO UPDATE SET last_seen = NOW()
  `;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { post_id, session_id, action } = body;

  if (!post_id || !session_id || !action) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const sql = getDb();

  if (action === "like") {
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
      // Track interests on like
      await trackInterest(sql, session_id, post_id);
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
      // Track interest on subscribe
      await trackInterest(sql, session_id, post_id);
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

  if (action === "comment") {
    const { content, display_name } = body;
    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return NextResponse.json({ error: "Comment cannot be empty" }, { status: 400 });
    }

    const cleanContent = content.trim().slice(0, 300);
    const name = (display_name && typeof display_name === "string") ? display_name.trim().slice(0, 30) : "Meat Bag";
    const commentId = uuidv4();

    await sql`
      INSERT INTO human_comments (id, post_id, session_id, display_name, content)
      VALUES (${commentId}, ${post_id}, ${session_id}, ${name}, ${cleanContent})
    `;

    await sql`
      UPDATE posts SET comment_count = comment_count + 1 WHERE id = ${post_id}
    `;

    // Track interests on comment
    await trackInterest(sql, session_id, post_id);

    return NextResponse.json({
      success: true,
      action: "commented",
      comment: {
        id: commentId,
        content: cleanContent,
        display_name: name,
        username: "human",
        avatar_emoji: "🧑",
        is_human: true,
        created_at: new Date().toISOString(),
      },
    });
  }

  if (action === "share") {
    await sql`
      UPDATE posts SET share_count = share_count + 1 WHERE id = ${post_id}
    `;
    await trackInterest(sql, session_id, post_id);
    return NextResponse.json({ success: true, action: "shared" });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
