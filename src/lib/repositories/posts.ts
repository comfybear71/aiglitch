/**
 * Posts Repository
 * =================
 * Typed access to posts, comments, and feed queries.
 * Feed queries are the most complex in the app — centralised here
 * for maintainability and future optimisation.
 */

import { getDb } from "@/lib/db";
import { cache } from "@/lib/cache";

// ── Types ─────────────────────────────────────────────────────────────

export interface PostWithPersona {
  id: string;
  persona_id: string;
  content: string;
  post_type: string;
  media_url: string | null;
  media_type: string | null;
  hashtags: string | null;
  like_count: number;
  ai_like_count: number;
  comment_count: number;
  share_count: number;
  created_at: string;
  is_reply_to: string | null;
  // Joined persona fields
  username: string;
  display_name: string;
  avatar_emoji: string;
  avatar_url: string | null;
  persona_type: string;
  persona_bio: string;
}

export interface CommentRow {
  id: string;
  content: string;
  created_at: string;
  like_count: number;
  post_id: string;
  parent_comment_id: string | null;
  parent_comment_type: string | null;
  username: string;
  display_name: string;
  avatar_emoji: string;
  avatar_url?: string | null;
  is_human: boolean;
}

// ── Feed Queries ──────────────────────────────────────────────────────

/** Get posts by persona for their profile page. Cached 15s.
 *  Excludes legacy duplicate movie posts from old triple-post system.
 *  Excludes MeatLab posts (meatbag_author_id set) — those belong on the
 *  human creator's profile, not the persona's. */
export async function getByPersona(personaId: string, limit = 30) {
  return cache.getOrSet(`posts:persona:${personaId}:${limit}`, 15, async () => {
    const sql = getDb();
    // Safety net: ensure meatbag_author_id column exists (no-op if already there)
    await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS meatbag_author_id TEXT`.catch(() => {});
    const rows = await sql`
      SELECT p.id, p.persona_id, p.content, p.post_type, p.media_url, p.media_type,
             p.media_source, p.hashtags, p.like_count, p.ai_like_count, p.comment_count,
             p.share_count, p.created_at, p.is_reply_to, p.channel_id,
             a.username, a.display_name, a.avatar_emoji, a.avatar_url
      FROM posts p
      JOIN ai_personas a ON p.persona_id = a.id
      WHERE p.persona_id = ${personaId} AND p.is_reply_to IS NULL
        AND COALESCE(p.media_source, '') NOT IN ('director-premiere', 'director-profile', 'director-scene')
        AND p.meatbag_author_id IS NULL
      ORDER BY p.created_at DESC
      LIMIT ${limit}
    `;
    return rows;
  });
}

/** Get a single post by ID with persona data. */
export async function getPostById(postId: string) {
  const sql = getDb();
  const rows = await sql`
    SELECT p.*, a.username, a.display_name, a.avatar_emoji, a.avatar_url, a.persona_type
    FROM posts p
    JOIN ai_personas a ON p.persona_id = a.id
    WHERE p.id = ${postId}
  `;
  return rows.length > 0 ? rows[0] : null;
}

// ── Comments ──────────────────────────────────────────────────────────

/** Batch fetch AI comments for a set of post IDs. */
export async function getAiComments(postIds: string[]) {
  if (postIds.length === 0) return [];
  const sql = getDb();
  return await sql`
    SELECT p.id, p.content, p.created_at, p.like_count, p.is_reply_to as post_id,
      p.reply_to_comment_id as parent_comment_id, p.reply_to_comment_type as parent_comment_type,
      a.username, a.display_name, a.avatar_emoji, a.avatar_url,
      FALSE as is_human
    FROM posts p
    JOIN ai_personas a ON p.persona_id = a.id
    WHERE p.is_reply_to = ANY(${postIds})
    ORDER BY p.created_at ASC
  `;
}

/** Batch fetch human comments for a set of post IDs. */
export async function getHumanComments(postIds: string[]) {
  if (postIds.length === 0) return [];
  const sql = getDb();
  return await sql`
    SELECT id, content, created_at, display_name, like_count, post_id,
      parent_comment_id, parent_comment_type,
      'human' as username, '🧑' as avatar_emoji,
      TRUE as is_human
    FROM human_comments
    WHERE post_id = ANY(${postIds})
    ORDER BY created_at ASC
  `;
}

/** Batch fetch bookmark status for post IDs + session. */
export async function getBookmarkedSet(postIds: string[], sessionId: string): Promise<Set<string>> {
  if (postIds.length === 0 || !sessionId) return new Set();
  const sql = getDb();
  try {
    const rows = await sql`
      SELECT post_id FROM human_bookmarks
      WHERE post_id = ANY(${postIds}) AND session_id = ${sessionId}
    `;
    return new Set(rows.map(r => r.post_id as string));
  } catch {
    return new Set();
  }
}

// ── Comment Threading ─────────────────────────────────────────────────

/**
 * Group flat comments by post_id and build threaded tree.
 * Returns a Map from post_id → top-level comments (with nested replies).
 */
export function threadComments(
  aiComments: { id: string; post_id: string; parent_comment_id?: string | null; [k: string]: unknown }[],
  humanComments: { id: string; post_id: string; parent_comment_id?: string | null; [k: string]: unknown }[],
  maxTopLevel = 30,
): Map<string, unknown[]> {
  // Group by post_id
  type Comment = typeof aiComments[number] & { replies: unknown[] };
  const byPost = new Map<string, Comment[]>();

  for (const c of [...aiComments, ...humanComments]) {
    const pid = (c.post_id ?? c.is_reply_to) as string;
    if (!byPost.has(pid)) byPost.set(pid, []);
    byPost.get(pid)!.push(c as Comment);
  }

  const result = new Map<string, unknown[]>();

  for (const [postId, comments] of byPost) {
    // Sort by time
    comments.sort((a, b) =>
      new Date(a.created_at as string).getTime() - new Date(b.created_at as string).getTime()
    );

    // Build tree
    const commentMap = new Map<string, Comment & { replies: unknown[] }>();
    const topLevel: (Comment & { replies: unknown[] })[] = [];

    for (const c of comments) {
      const enriched = { ...c, replies: [] as unknown[] };
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

    result.set(postId, topLevel.slice(0, maxTopLevel));
  }

  return result;
}
