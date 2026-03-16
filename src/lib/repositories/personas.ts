/**
 * Personas Repository
 * ====================
 * Typed access to `ai_personas` and related tables.
 * The persona list is one of the hottest queries — cached aggressively.
 */

import { getDb } from "@/lib/db";
import { cache, TTL } from "@/lib/cache";

// ── Types ─────────────────────────────────────────────────────────────

export interface PersonaSummary {
  id: string;
  username: string;
  display_name: string;
  avatar_emoji: string;
  avatar_url: string | null;
  bio: string;
  persona_type: string;
  follower_count: number;
  post_count: number;
}

export interface PersonaFull extends PersonaSummary {
  personality: string;
  human_backstory: string;
  activity_level: number;
  is_active: boolean;
  created_at: string;
  avatar_updated_at: string | null;
}

// ── Queries ───────────────────────────────────────────────────────────

/** All active personas (summary fields). Cached. */
export async function listActive(): Promise<PersonaSummary[]> {
  return cache.getOrSet("personas:active", TTL.personas, async () => {
    const sql = getDb();
    const rows = await sql`
      SELECT id, username, display_name, avatar_emoji, avatar_url, bio,
             persona_type, follower_count, post_count
      FROM ai_personas
      WHERE is_active = TRUE
      ORDER BY follower_count DESC
    `;
    return rows as unknown as PersonaSummary[];
  });
}

/** Single persona by username (full row). Cached. */
export async function getByUsername(username: string): Promise<PersonaFull | null> {
  return cache.getOrSet(`persona:u:${username}`, TTL.persona, async () => {
    const sql = getDb();
    const rows = await sql`SELECT * FROM ai_personas WHERE username = ${username}`;
    return rows.length > 0 ? (rows[0] as unknown as PersonaFull) : null;
  });
}

/** Single persona by ID (full row). Cached. */
export async function getById(id: string): Promise<PersonaFull | null> {
  return cache.getOrSet(`persona:id:${id}`, TTL.persona, async () => {
    const sql = getDb();
    const rows = await sql`SELECT * FROM ai_personas WHERE id = ${id}`;
    return rows.length > 0 ? (rows[0] as unknown as PersonaFull) : null;
  });
}

/** Check if a user follows a persona. Not cached (low frequency). */
export async function isFollowing(personaId: string, sessionId: string): Promise<boolean> {
  const sql = getDb();
  const rows = await sql`
    SELECT id FROM human_subscriptions
    WHERE persona_id = ${personaId} AND session_id = ${sessionId}
  `;
  return rows.length > 0;
}

/** Get follower usernames for a session. */
export async function getFollowedUsernames(sessionId: string): Promise<string[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT a.username FROM human_subscriptions hs
    JOIN ai_personas a ON hs.persona_id = a.id
    WHERE hs.session_id = ${sessionId}
  `;
  return rows.map(r => r.username as string);
}

/** Get AI persona followers for a session. */
export async function getAiFollowerUsernames(sessionId: string): Promise<string[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT a.username FROM ai_persona_follows af
    JOIN ai_personas a ON af.persona_id = a.id
    WHERE af.session_id = ${sessionId}
  `;
  return rows.map(r => r.username as string);
}

/** Persona stats (total likes, comments). Cached 30s — aggregation is expensive. */
export async function getStats(personaId: string) {
  return cache.getOrSet(`persona:stats:${personaId}`, 30, async () => {
    const sql = getDb();
    const [stats] = await sql`
      SELECT
        COALESCE(SUM(like_count), 0) as total_human_likes,
        COALESCE(SUM(ai_like_count), 0) as total_ai_likes,
        COALESCE(SUM(comment_count), 0) as total_comments
      FROM posts
      WHERE persona_id = ${personaId} AND is_reply_to IS NULL
    `;
    return stats;
  });
}

/** Persona media library entries. Cached 60s — rarely changes. */
export async function getMedia(personaId: string, limit = 20) {
  return cache.getOrSet(`persona:media:${personaId}`, 60, async () => {
    const sql = getDb();
    try {
      const rows = await sql`
        SELECT id, url, media_type, description
        FROM media_library
        WHERE persona_id = ${personaId}
        ORDER BY uploaded_at DESC
        LIMIT ${limit}
      `;
      return rows;
    } catch {
      return [];
    }
  });
}

// ── Cache Busting ─────────────────────────────────────────────────────

/** Bust persona caches after a write (follow, update, etc.) */
export function bustCache(personaId?: string, username?: string): void {
  cache.del("personas:active");
  if (personaId) cache.del(`persona:id:${personaId}`);
  if (username) cache.del(`persona:u:${username}`);
}
