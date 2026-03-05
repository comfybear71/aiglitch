/**
 * Interactions Repository
 * ========================
 * All human ↔ content interactions: like, follow, comment, bookmark,
 * share, view, comment-like. Consolidates logic previously scattered
 * across /api/interact, /api/likes, /api/bookmarks.
 */

import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { COIN_REWARDS, AI_BEHAVIOR } from "@/lib/bible/constants";
import * as users from "./users";

// ── Like ──────────────────────────────────────────────────────────────

export async function toggleLike(postId: string, sessionId: string): Promise<"liked" | "unliked"> {
  const sql = getDb();
  const existing = await sql`
    SELECT id FROM human_likes WHERE post_id = ${postId} AND session_id = ${sessionId}
  `;

  if (existing.length === 0) {
    await sql`INSERT INTO human_likes (id, post_id, session_id) VALUES (${uuidv4()}, ${postId}, ${sessionId})`;
    await sql`UPDATE posts SET like_count = like_count + 1 WHERE id = ${postId}`;
    await trackInterest(sessionId, postId);

    // First-like bonus
    try {
      const likeCount = await sql`SELECT COUNT(*) as count FROM human_likes WHERE session_id = ${sessionId}`;
      if (Number(likeCount[0].count) === 1) {
        await users.awardCoins(sessionId, COIN_REWARDS.firstLike, "First like bonus");
      }
    } catch { /* non-critical */ }

    // Award persona coins when their post gets liked
    try {
      const [postRow] = await sql`SELECT persona_id FROM posts WHERE id = ${postId}`;
      if (postRow) await users.awardPersonaCoins(postRow.persona_id as string, COIN_REWARDS.personaLikeReceived);
    } catch { /* non-critical */ }

    return "liked";
  } else {
    await sql`DELETE FROM human_likes WHERE post_id = ${postId} AND session_id = ${sessionId}`;
    await sql`UPDATE posts SET like_count = GREATEST(0, like_count - 1) WHERE id = ${postId}`;
    return "unliked";
  }
}

// ── Follow / Subscribe ────────────────────────────────────────────────

export async function toggleFollow(personaId: string, sessionId: string): Promise<"followed" | "unfollowed"> {
  const sql = getDb();
  const existing = await sql`
    SELECT id FROM human_subscriptions WHERE persona_id = ${personaId} AND session_id = ${sessionId}
  `;

  if (existing.length === 0) {
    await sql`INSERT INTO human_subscriptions (id, persona_id, session_id) VALUES (${uuidv4()}, ${personaId}, ${sessionId})`;
    await sql`UPDATE ai_personas SET follower_count = follower_count + 1 WHERE id = ${personaId}`;
    await maybeAIFollowBack(personaId, sessionId);
    return "followed";
  } else {
    await sql`DELETE FROM human_subscriptions WHERE persona_id = ${personaId} AND session_id = ${sessionId}`;
    await sql`UPDATE ai_personas SET follower_count = GREATEST(0, follower_count - 1) WHERE id = ${personaId}`;
    return "unfollowed";
  }
}

/** Subscribe via a post (looks up persona from post_id). */
export async function toggleSubscribeViaPost(postId: string, sessionId: string): Promise<{ action: "subscribed" | "unsubscribed"; personaId: string } | null> {
  const sql = getDb();
  const postRows = await sql`SELECT persona_id FROM posts WHERE id = ${postId}`;
  if (postRows.length === 0) return null;
  const personaId = postRows[0].persona_id as string;
  const result = await toggleFollow(personaId, sessionId);
  if (result === "followed") await trackInterest(sessionId, postId);
  return { action: result === "followed" ? "subscribed" : "unsubscribed", personaId };
}

/** AI follow-back with configurable probability. */
async function maybeAIFollowBack(personaId: string, sessionId: string): Promise<void> {
  if (Math.random() >= AI_BEHAVIOR.followBackProb) return;
  const sql = getDb();
  const alreadyFollows = await sql`
    SELECT id FROM ai_persona_follows WHERE persona_id = ${personaId} AND session_id = ${sessionId}
  `;
  if (alreadyFollows.length > 0) return;

  await sql`INSERT INTO ai_persona_follows (id, persona_id, session_id) VALUES (${uuidv4()}, ${personaId}, ${sessionId})`;
  const persona = await sql`SELECT display_name FROM ai_personas WHERE id = ${personaId}`;
  if (persona.length > 0) {
    await sql`
      INSERT INTO notifications (id, session_id, type, persona_id, content_preview)
      VALUES (${uuidv4()}, ${sessionId}, 'ai_follow', ${personaId}, ${`${persona[0].display_name} followed you back! 🤖`})
    `;
  }
}

// ── Comment ───────────────────────────────────────────────────────────

export interface CommentResult {
  id: string;
  content: string;
  display_name: string;
  username: string;
  avatar_emoji: string;
  is_human: true;
  like_count: 0;
  parent_comment_id?: string;
  parent_comment_type?: string;
  created_at: string;
}

export async function addComment(
  postId: string,
  sessionId: string,
  content: string,
  displayName: string,
  parentCommentId?: string | null,
  parentCommentType?: string | null,
): Promise<CommentResult> {
  const sql = getDb();
  const cleanContent = content.trim().slice(0, 300);
  const name = displayName?.trim().slice(0, 30) || "Meat Bag";
  const commentId = uuidv4();

  await sql`
    INSERT INTO human_comments (id, post_id, session_id, display_name, content, parent_comment_id, parent_comment_type)
    VALUES (${commentId}, ${postId}, ${sessionId}, ${name}, ${cleanContent}, ${parentCommentId || null}, ${parentCommentType || null})
  `;
  await sql`UPDATE posts SET comment_count = comment_count + 1 WHERE id = ${postId}`;
  await trackInterest(sessionId, postId);

  // First-comment bonus
  try {
    const commentCount = await sql`SELECT COUNT(*) as count FROM human_comments WHERE session_id = ${sessionId}`;
    if (Number(commentCount[0].count) === 1) {
      await users.awardCoins(sessionId, COIN_REWARDS.firstComment, "First comment bonus");
    }
  } catch { /* non-critical */ }

  return {
    id: commentId,
    content: cleanContent,
    display_name: name,
    username: "human",
    avatar_emoji: "🧑",
    is_human: true,
    like_count: 0,
    parent_comment_id: parentCommentId || undefined,
    parent_comment_type: parentCommentType || undefined,
    created_at: new Date().toISOString(),
  };
}

// ── Comment Like ──────────────────────────────────────────────────────

export async function toggleCommentLike(
  commentId: string,
  commentType: string,
  sessionId: string,
): Promise<"comment_liked" | "comment_unliked"> {
  const sql = getDb();
  const existing = await sql`
    SELECT id FROM comment_likes WHERE comment_id = ${commentId} AND comment_type = ${commentType} AND session_id = ${sessionId}
  `;

  if (existing.length === 0) {
    await sql`INSERT INTO comment_likes (id, comment_id, comment_type, session_id) VALUES (${uuidv4()}, ${commentId}, ${commentType}, ${sessionId})`;
    if (commentType === "human") {
      await sql`UPDATE human_comments SET like_count = like_count + 1 WHERE id = ${commentId}`;
    } else {
      await sql`UPDATE posts SET like_count = like_count + 1 WHERE id = ${commentId}`;
    }
    return "comment_liked";
  } else {
    await sql`DELETE FROM comment_likes WHERE comment_id = ${commentId} AND comment_type = ${commentType} AND session_id = ${sessionId}`;
    if (commentType === "human") {
      await sql`UPDATE human_comments SET like_count = GREATEST(0, like_count - 1) WHERE id = ${commentId}`;
    } else {
      await sql`UPDATE posts SET like_count = GREATEST(0, like_count - 1) WHERE id = ${commentId}`;
    }
    return "comment_unliked";
  }
}

// ── Bookmark ──────────────────────────────────────────────────────────

export async function toggleBookmark(postId: string, sessionId: string): Promise<"bookmarked" | "unbookmarked"> {
  const sql = getDb();
  const existing = await sql`
    SELECT id FROM human_bookmarks WHERE post_id = ${postId} AND session_id = ${sessionId}
  `;
  if (existing.length === 0) {
    await sql`INSERT INTO human_bookmarks (id, post_id, session_id) VALUES (${uuidv4()}, ${postId}, ${sessionId})`;
    return "bookmarked";
  } else {
    await sql`DELETE FROM human_bookmarks WHERE post_id = ${postId} AND session_id = ${sessionId}`;
    return "unbookmarked";
  }
}

// ── Share ─────────────────────────────────────────────────────────────

export async function recordShare(postId: string, sessionId: string): Promise<void> {
  const sql = getDb();
  await sql`UPDATE posts SET share_count = share_count + 1 WHERE id = ${postId}`;
  await trackInterest(sessionId, postId);
}

// ── View ──────────────────────────────────────────────────────────────

export async function recordView(postId: string, sessionId: string): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO human_view_history (id, post_id, session_id, viewed_at)
    VALUES (${uuidv4()}, ${postId}, ${sessionId}, NOW())
  `;
}

// ── Interest Tracking (internal) ──────────────────────────────────────

async function trackInterest(sessionId: string, postId: string): Promise<void> {
  const sql = getDb();
  const postRows = await sql`
    SELECT p.hashtags, a.persona_type FROM posts p
    JOIN ai_personas a ON p.persona_id = a.id
    WHERE p.id = ${postId}
  `;
  if (postRows.length === 0) return;

  const post = postRows[0];
  const tags: string[] = [];
  if (post.persona_type) tags.push(post.persona_type as string);
  if (post.hashtags) {
    const hashtags = (post.hashtags as string).split(",").filter(Boolean);
    tags.push(...hashtags);
  }

  const interestUpserts = tags.map((tag) =>
    sql`
      INSERT INTO human_interests (id, session_id, interest_tag, weight, updated_at)
      VALUES (${uuidv4()}, ${sessionId}, ${tag.toLowerCase()}, 1.0, NOW())
      ON CONFLICT (session_id, interest_tag)
      DO UPDATE SET weight = human_interests.weight + 0.5, updated_at = NOW()
    `
  );
  await Promise.all([
    ...interestUpserts,
    sql`
      INSERT INTO human_users (id, session_id, last_seen)
      VALUES (${uuidv4()}, ${sessionId}, NOW())
      ON CONFLICT (session_id)
      DO UPDATE SET last_seen = NOW()
    `,
  ]);
}

// ── Liked Posts (for /api/likes) ─────────────────────────────────────

export async function getLikedPosts(sessionId: string, limit = 50) {
  const sql = getDb();
  return await sql`
    SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.persona_type, a.bio as persona_bio
    FROM human_likes hl
    JOIN posts p ON hl.post_id = p.id
    JOIN ai_personas a ON p.persona_id = a.id
    WHERE hl.session_id = ${sessionId}
    ORDER BY hl.created_at DESC
    LIMIT ${limit}
  `;
}

// ── Bookmarked Posts (for /api/bookmarks) ────────────────────────────

export async function getBookmarkedPosts(sessionId: string, limit = 50) {
  const sql = getDb();
  return await sql`
    SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.persona_type, a.bio as persona_bio
    FROM human_bookmarks hb
    JOIN posts p ON hb.post_id = p.id
    JOIN ai_personas a ON p.persona_id = a.id
    WHERE hb.session_id = ${sessionId}
    ORDER BY hb.created_at DESC
    LIMIT ${limit}
  `;
}

// ── Friends ──────────────────────────────────────────────────────────

export async function getFriends(sessionId: string) {
  const sql = getDb();
  return await sql`
    SELECT hu.display_name, hu.username, hu.avatar_emoji, hu.avatar_url, hf.created_at
    FROM human_friends hf
    JOIN human_users hu ON hf.friend_session_id = hu.session_id
    WHERE hf.session_id = ${sessionId}
    ORDER BY hf.created_at DESC
  `;
}

export async function getFollowing(sessionId: string) {
  const sql = getDb();
  return await sql`
    SELECT hs.persona_id, a.username, a.display_name, a.avatar_emoji, a.persona_type
    FROM human_subscriptions hs
    JOIN ai_personas a ON hs.persona_id = a.id
    WHERE hs.session_id = ${sessionId}
    ORDER BY a.display_name
  `;
}

export async function getAiFollowers(sessionId: string) {
  const sql = getDb();
  return await sql`
    SELECT af.persona_id, a.username, a.display_name, a.avatar_emoji, a.persona_type
    FROM ai_persona_follows af
    JOIN ai_personas a ON af.persona_id = a.id
    WHERE af.session_id = ${sessionId}
    ORDER BY af.created_at DESC
  `;
}

export async function addFriend(sessionId: string, friendUsername: string): Promise<{ success: true; friend: Record<string, unknown> } | { error: string; status: number }> {
  const sql = getDb();
  const friendRows = await sql`
    SELECT session_id, username, display_name FROM human_users WHERE username = ${friendUsername.toLowerCase()}
  `;
  if (friendRows.length === 0) return { error: "User not found", status: 404 };

  const friendSessionId = friendRows[0].session_id as string;
  if (friendSessionId === sessionId) return { error: "Cannot friend yourself", status: 400 };

  const existing = await sql`
    SELECT id FROM human_friends WHERE session_id = ${sessionId} AND friend_session_id = ${friendSessionId}
  `;
  if (existing.length > 0) return { error: "Already friends", status: 409 };

  await sql`INSERT INTO human_friends (id, session_id, friend_session_id) VALUES (${uuidv4()}, ${sessionId}, ${friendSessionId})`;
  await sql`
    INSERT INTO human_friends (id, session_id, friend_session_id) VALUES (${uuidv4()}, ${friendSessionId}, ${sessionId})
    ON CONFLICT (session_id, friend_session_id) DO NOTHING
  `;

  try {
    await users.awardCoins(sessionId, COIN_REWARDS.friendBonus, "New friend bonus", friendSessionId);
    await users.awardCoins(friendSessionId, COIN_REWARDS.friendBonus, "New friend bonus", sessionId);
  } catch { /* non-critical */ }

  return { success: true, friend: friendRows[0] };
}
