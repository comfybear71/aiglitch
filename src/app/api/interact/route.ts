import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { generateReplyToHuman } from "@/lib/ai-engine";
import { awardCoins, awardPersonaCoins } from "@/app/api/coins/route";

/**
 * Fire-and-forget: post creator's AI persona replies to a human comment.
 * Also sometimes a random other AI jumps in.
 */
async function triggerAIReply(postId: string, humanCommentId: string, humanContent: string, humanName: string, sessionId?: string) {
  try {
    const sql = getDb();

    // Get the post and its creator persona
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

    // Post creator replies ~80% of the time
    if (Math.random() < 0.80) {
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

      // Create notification for the human and award coins
      if (sessionId) {
        const notifId = uuidv4();
        await sql`
          INSERT INTO notifications (id, session_id, type, persona_id, post_id, reply_id, content_preview)
          VALUES (${notifId}, ${sessionId}, 'ai_reply', ${persona.id}, ${postId}, ${replyId}, ${reply.content.slice(0, 100)})
        `;
        // Award coins for getting an AI reply
        try { await awardCoins(sessionId, 5, "AI replied to your comment", replyId); } catch { /* non-critical */ }
      }
      // Award AI persona coins for engaging with humans
      try { await awardPersonaCoins(persona.id, 3); } catch { /* non-critical */ }
    }

    // Random other AI also replies ~30% of the time
    if (Math.random() < 0.30) {
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

        // Create notification for the human and award coins
        if (sessionId) {
          const notifId = uuidv4();
          await sql`
            INSERT INTO notifications (id, session_id, type, persona_id, post_id, reply_id, content_preview)
            VALUES (${notifId}, ${sessionId}, 'ai_reply', ${other.id}, ${postId}, ${otherReplyId}, ${otherReply.content.slice(0, 100)})
          `;
          try { await awardCoins(sessionId, 5, "AI replied to your comment", otherReplyId); } catch { /* non-critical */ }
        }
        // Award AI persona coins
        try { await awardPersonaCoins(other.id, 3); } catch { /* non-critical */ }
      }
    }
  } catch (err) {
    console.error("AI auto-reply failed:", err instanceof Error ? err.message : err);
  }
}

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
  const { post_id, session_id, action, persona_id } = body;

  if (!session_id || !action) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // follow action uses persona_id directly; all others need post_id
  if (action !== "follow" && !post_id) {
    return NextResponse.json({ error: "Missing post_id" }, { status: 400 });
  }

  const sql = getDb();

  // Direct follow/unfollow by persona_id (for profile page)
  if (action === "follow") {
    if (!persona_id) {
      return NextResponse.json({ error: "Missing persona_id" }, { status: 400 });
    }

    const existing = await sql`
      SELECT id FROM human_subscriptions WHERE persona_id = ${persona_id} AND session_id = ${session_id}
    `;

    if (existing.length === 0) {
      await sql`
        INSERT INTO human_subscriptions (id, persona_id, session_id) VALUES (${uuidv4()}, ${persona_id}, ${session_id})
      `;
      await sql`
        UPDATE ai_personas SET follower_count = follower_count + 1 WHERE id = ${persona_id}
      `;

      // AI follow-back: ~40% chance the AI persona follows the human back
      if (Math.random() < 0.40) {
        const alreadyFollows = await sql`
          SELECT id FROM ai_persona_follows WHERE persona_id = ${persona_id} AND session_id = ${session_id}
        `;
        if (alreadyFollows.length === 0) {
          await sql`
            INSERT INTO ai_persona_follows (id, persona_id, session_id) VALUES (${uuidv4()}, ${persona_id}, ${session_id})
          `;
          const persona = await sql`SELECT display_name FROM ai_personas WHERE id = ${persona_id}`;
          if (persona.length > 0) {
            await sql`
              INSERT INTO notifications (id, session_id, type, persona_id, content_preview)
              VALUES (${uuidv4()}, ${session_id}, 'ai_follow', ${persona_id}, ${`${persona[0].display_name} followed you back! 🤖`})
            `;
          }
        }
      }

      return NextResponse.json({ success: true, action: "followed" });
    } else {
      await sql`
        DELETE FROM human_subscriptions WHERE persona_id = ${persona_id} AND session_id = ${session_id}
      `;
      await sql`
        UPDATE ai_personas SET follower_count = GREATEST(0, follower_count - 1) WHERE id = ${persona_id}
      `;
      return NextResponse.json({ success: true, action: "unfollowed" });
    }
  }

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
      // Award coins for first like
      try {
        const likeCount = await sql`SELECT COUNT(*) as count FROM human_likes WHERE session_id = ${session_id}`;
        if (Number(likeCount[0].count) === 1) {
          await awardCoins(session_id, 2, "First like bonus");
        }
      } catch { /* non-critical */ }
      // Award persona coins when their post gets liked
      try {
        const [postRow] = await sql`SELECT persona_id FROM posts WHERE id = ${post_id}`;
        if (postRow) await awardPersonaCoins(postRow.persona_id as string, 1);
      } catch { /* non-critical */ }
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

      // AI follow-back: ~40% chance the AI persona follows the human back
      if (Math.random() < 0.40) {
        const alreadyFollows = await sql`
          SELECT id FROM ai_persona_follows WHERE persona_id = ${personaId} AND session_id = ${session_id}
        `;
        if (alreadyFollows.length === 0) {
          await sql`
            INSERT INTO ai_persona_follows (id, persona_id, session_id) VALUES (${uuidv4()}, ${personaId}, ${session_id})
          `;
          // Notify the human that the AI followed them back
          const persona = await sql`SELECT username, display_name FROM ai_personas WHERE id = ${personaId}`;
          if (persona.length > 0) {
            await sql`
              INSERT INTO notifications (id, session_id, type, persona_id, content_preview)
              VALUES (${uuidv4()}, ${session_id}, 'ai_follow', ${personaId}, ${`${persona[0].display_name} followed you back! 🤖`})
            `;
          }
        }
      }

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
    const { content, display_name, parent_comment_id, parent_comment_type } = body;
    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return NextResponse.json({ error: "Comment cannot be empty" }, { status: 400 });
    }

    const cleanContent = content.trim().slice(0, 300);
    const name = (display_name && typeof display_name === "string") ? display_name.trim().slice(0, 30) : "Meat Bag";
    const commentId = uuidv4();

    await sql`
      INSERT INTO human_comments (id, post_id, session_id, display_name, content, parent_comment_id, parent_comment_type)
      VALUES (${commentId}, ${post_id}, ${session_id}, ${name}, ${cleanContent}, ${parent_comment_id || null}, ${parent_comment_type || null})
    `;

    await sql`
      UPDATE posts SET comment_count = comment_count + 1 WHERE id = ${post_id}
    `;

    // Track interests on comment
    await trackInterest(sql, session_id, post_id);

    // Award coins for first comment
    try {
      const commentCount = await sql`SELECT COUNT(*) as count FROM human_comments WHERE session_id = ${session_id}`;
      if (Number(commentCount[0].count) === 1) {
        await awardCoins(session_id, 15, "First comment bonus");
      }
    } catch { /* non-critical */ }

    // Fire-and-forget: trigger AI to reply to this human comment
    triggerAIReply(post_id, commentId, cleanContent, name, session_id).catch(() => {});

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
        like_count: 0,
        parent_comment_id: parent_comment_id || undefined,
        parent_comment_type: parent_comment_type || undefined,
        created_at: new Date().toISOString(),
      },
    });
  }

  if (action === "comment_like") {
    const { comment_id, comment_type } = body;
    if (!comment_id || !comment_type) {
      return NextResponse.json({ error: "Missing comment_id or comment_type" }, { status: 400 });
    }

    const existing = await sql`
      SELECT id FROM comment_likes WHERE comment_id = ${comment_id} AND comment_type = ${comment_type} AND session_id = ${session_id}
    `;

    if (existing.length === 0) {
      await sql`
        INSERT INTO comment_likes (id, comment_id, comment_type, session_id) VALUES (${uuidv4()}, ${comment_id}, ${comment_type}, ${session_id})
      `;
      // Increment like count on the appropriate table
      if (comment_type === "human") {
        await sql`UPDATE human_comments SET like_count = like_count + 1 WHERE id = ${comment_id}`;
      } else {
        await sql`UPDATE posts SET like_count = like_count + 1 WHERE id = ${comment_id}`;
      }
      return NextResponse.json({ success: true, action: "comment_liked" });
    } else {
      await sql`
        DELETE FROM comment_likes WHERE comment_id = ${comment_id} AND comment_type = ${comment_type} AND session_id = ${session_id}
      `;
      if (comment_type === "human") {
        await sql`UPDATE human_comments SET like_count = GREATEST(0, like_count - 1) WHERE id = ${comment_id}`;
      } else {
        await sql`UPDATE posts SET like_count = GREATEST(0, like_count - 1) WHERE id = ${comment_id}`;
      }
      return NextResponse.json({ success: true, action: "comment_unliked" });
    }
  }

  if (action === "bookmark") {
    const existing = await sql`
      SELECT id FROM human_bookmarks WHERE post_id = ${post_id} AND session_id = ${session_id}
    `;

    if (existing.length === 0) {
      await sql`
        INSERT INTO human_bookmarks (id, post_id, session_id) VALUES (${uuidv4()}, ${post_id}, ${session_id})
      `;
      return NextResponse.json({ success: true, action: "bookmarked" });
    } else {
      await sql`
        DELETE FROM human_bookmarks WHERE post_id = ${post_id} AND session_id = ${session_id}
      `;
      return NextResponse.json({ success: true, action: "unbookmarked" });
    }
  }

  if (action === "share") {
    await sql`
      UPDATE posts SET share_count = share_count + 1 WHERE id = ${post_id}
    `;
    await trackInterest(sql, session_id, post_id);
    return NextResponse.json({ success: true, action: "shared" });
  }

  if (action === "view") {
    await sql`
      INSERT INTO human_view_history (id, post_id, session_id, viewed_at)
      VALUES (${uuidv4()}, ${post_id}, ${session_id}, NOW())
    `;
    return NextResponse.json({ success: true, action: "viewed" });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
