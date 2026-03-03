import { NextRequest, NextResponse } from "next/server";
import { interactions, users } from "@/lib/repositories";
import { generateReplyToHuman } from "@/lib/ai-engine";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { COIN_REWARDS, AI_BEHAVIOR } from "@/lib/bible/constants";

/**
 * Fire-and-forget: post creator's AI persona replies to a human comment.
 * Also sometimes a random other AI jumps in.
 */
async function triggerAIReply(postId: string, humanCommentId: string, humanContent: string, humanName: string, sessionId?: string) {
  try {
    const sql = getDb();

    const postRows = await sql`
      SELECT p.content, p.persona_id, a.id as aid, a.username, a.display_name, a.avatar_emoji,
        a.personality, a.persona_type, a.bio, a.human_backstory
      FROM posts p
      JOIN ai_personas a ON p.persona_id = a.id
      WHERE p.id = ${postId}
    ` as unknown as {
      content: string; persona_id: string; aid: string; username: string;
      display_name: string; avatar_emoji: string; personality: string;
      persona_type: string; bio: string; human_backstory: string;
    }[];

    if (postRows.length === 0) return;
    const postData = postRows[0];

    const persona = {
      id: postData.aid,
      username: postData.username,
      display_name: postData.display_name,
      avatar_emoji: postData.avatar_emoji,
      personality: postData.personality,
      persona_type: postData.persona_type,
      bio: postData.bio,
      human_backstory: postData.human_backstory,
    };

    // Post creator replies based on configured probability
    if (Math.random() < AI_BEHAVIOR.replyToHumanProb) {
      const reply = await generateReplyToHuman(
        persona as Parameters<typeof generateReplyToHuman>[0],
        { content: humanContent, display_name: humanName },
        { content: postData.content }
      );

      const replyId = uuidv4();
      await sql`
        INSERT INTO posts (id, persona_id, content, post_type, is_reply_to, reply_to_comment_id, reply_to_comment_type)
        VALUES (${replyId}, ${persona.id}, ${reply.content}, 'text', ${postId}, ${humanCommentId}, 'human')
      `;
      await sql`UPDATE posts SET comment_count = comment_count + 1 WHERE id = ${postId}`;

      if (sessionId) {
        const notifId = uuidv4();
        await sql`
          INSERT INTO notifications (id, session_id, type, persona_id, post_id, reply_id, content_preview)
          VALUES (${notifId}, ${sessionId}, 'ai_reply', ${persona.id}, ${postId}, ${replyId}, ${reply.content.slice(0, 100)})
        `;
        try { await users.awardCoins(sessionId, COIN_REWARDS.aiReply, "AI replied to your comment", replyId); } catch { /* non-critical */ }
      }
      try { await users.awardPersonaCoins(persona.id, COIN_REWARDS.personaHumanEngagement); } catch { /* non-critical */ }
    }

    // Random other AI also replies based on configured probability
    if (Math.random() < AI_BEHAVIOR.randomReplyProb) {
      const others = await sql`
        SELECT id, username, display_name, avatar_emoji, personality, persona_type, bio, human_backstory
        FROM ai_personas
        WHERE id != ${persona.id} AND is_active = TRUE
        ORDER BY RANDOM()
        LIMIT 1
      ` as unknown as Parameters<typeof generateReplyToHuman>[0][];

      if (others.length > 0) {
        const other = others[0];
        const otherReply = await generateReplyToHuman(
          other,
          { content: humanContent, display_name: humanName },
          { content: postData.content }
        );

        const otherReplyId = uuidv4();
        await sql`
          INSERT INTO posts (id, persona_id, content, post_type, is_reply_to, reply_to_comment_id, reply_to_comment_type)
          VALUES (${otherReplyId}, ${other.id}, ${otherReply.content}, 'text', ${postId}, ${humanCommentId}, 'human')
        `;
        await sql`UPDATE posts SET comment_count = comment_count + 1 WHERE id = ${postId}`;

        if (sessionId) {
          const notifId = uuidv4();
          await sql`
            INSERT INTO notifications (id, session_id, type, persona_id, post_id, reply_id, content_preview)
            VALUES (${notifId}, ${sessionId}, 'ai_reply', ${other.id}, ${postId}, ${otherReplyId}, ${otherReply.content.slice(0, 100)})
          `;
          try { await users.awardCoins(sessionId, COIN_REWARDS.aiReply, "AI replied to your comment", otherReplyId); } catch { /* non-critical */ }
        }
        try { await users.awardPersonaCoins(other.id, COIN_REWARDS.personaHumanEngagement); } catch { /* non-critical */ }
      }
    }
  } catch (err) {
    console.error("AI auto-reply failed:", err instanceof Error ? err.message : err);
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { post_id, session_id, action, persona_id } = body;

  if (!session_id || !action) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  if (action !== "follow" && !post_id) {
    return NextResponse.json({ error: "Missing post_id" }, { status: 400 });
  }

  if (action === "follow") {
    if (!persona_id) return NextResponse.json({ error: "Missing persona_id" }, { status: 400 });
    const result = await interactions.toggleFollow(persona_id, session_id);
    return NextResponse.json({ success: true, action: result });
  }

  if (action === "like") {
    const result = await interactions.toggleLike(post_id, session_id);
    return NextResponse.json({ success: true, action: result });
  }

  if (action === "subscribe") {
    const result = await interactions.toggleSubscribeViaPost(post_id, session_id);
    if (!result) return NextResponse.json({ error: "Post not found" }, { status: 404 });
    return NextResponse.json({ success: true, action: result.action });
  }

  if (action === "comment") {
    const { content, display_name, parent_comment_id, parent_comment_type } = body;
    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return NextResponse.json({ error: "Comment cannot be empty" }, { status: 400 });
    }

    const comment = await interactions.addComment(
      post_id, session_id, content,
      display_name || "Meat Bag",
      parent_comment_id, parent_comment_type,
    );

    triggerAIReply(post_id, comment.id, comment.content, comment.display_name, session_id).catch(() => {});
    return NextResponse.json({ success: true, action: "commented", comment });
  }

  if (action === "comment_like") {
    const { comment_id, comment_type } = body;
    if (!comment_id || !comment_type) return NextResponse.json({ error: "Missing comment_id or comment_type" }, { status: 400 });
    const result = await interactions.toggleCommentLike(comment_id, comment_type, session_id);
    return NextResponse.json({ success: true, action: result });
  }

  if (action === "bookmark") {
    const result = await interactions.toggleBookmark(post_id, session_id);
    return NextResponse.json({ success: true, action: result });
  }

  if (action === "share") {
    await interactions.recordShare(post_id, session_id);
    return NextResponse.json({ success: true, action: "shared" });
  }

  if (action === "view") {
    await interactions.recordView(post_id, session_id);
    return NextResponse.json({ success: true, action: "viewed" });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
