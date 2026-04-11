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

// ── Wallet Info ───────────────────────────────────────────────────────

/**
 * Read-only snapshot of a persona's wallet + balances.
 *
 * Pulls everything from DB cached columns — NO Solana RPC calls.
 * This is safe to inject into system prompts on every chat request.
 *
 * Data sources (same as admin panel /api/admin/personas):
 *   - SOL / BUDJU / USDC / GLITCH (on-chain token) → token_balances
 *     (canonical balance table — every persona has rows here)
 *   - §GLITCH in-app coins → ai_persona_coins
 *     (integer in-app currency, separate from the on-chain GLITCH SPL token)
 *   - wallet_address → budju_wallets
 *     (ONLY the ~15 personas in the active trading cohort have a dedicated
 *      wallet row. Most personas will have wallet_address = null even though
 *      their balances are populated.)
 *
 * Returns null only if the persona doesn't exist.
 * If persona exists but has no wallet or balances, returns zeros with
 * wallet_address = null — the caller can decide how to present that.
 */
export interface PersonaWalletInfo {
  persona_id: string;
  wallet_address: string | null;    // null if no dedicated trading wallet
  glitch_coins: number;             // in-app §GLITCH currency (integer, ai_persona_coins)
  glitch_lifetime_earned: number;
  sol_balance: number;              // token_balances WHERE token='SOL'
  budju_balance: number;            // token_balances WHERE token='BUDJU'
  usdc_balance: number;             // token_balances WHERE token='USDC'
  glitch_token_balance: number;     // token_balances WHERE token='GLITCH' (on-chain SPL)
}

export async function getWalletInfo(personaId: string): Promise<PersonaWalletInfo | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT
      p.id as persona_id,
      bw.wallet_address,
      COALESCE(apc.balance, 0)::int as glitch_coins,
      COALESCE(apc.lifetime_earned, 0)::int as glitch_lifetime_earned,
      COALESCE(
        (SELECT balance FROM token_balances
         WHERE owner_type = 'ai_persona' AND owner_id = p.id AND token = 'SOL'),
        0
      )::float8 as sol_balance,
      COALESCE(
        (SELECT balance FROM token_balances
         WHERE owner_type = 'ai_persona' AND owner_id = p.id AND token = 'BUDJU'),
        0
      )::float8 as budju_balance,
      COALESCE(
        (SELECT balance FROM token_balances
         WHERE owner_type = 'ai_persona' AND owner_id = p.id AND token = 'USDC'),
        0
      )::float8 as usdc_balance,
      COALESCE(
        (SELECT balance FROM token_balances
         WHERE owner_type = 'ai_persona' AND owner_id = p.id AND token = 'GLITCH'),
        0
      )::float8 as glitch_token_balance
    FROM ai_personas p
    LEFT JOIN budju_wallets bw ON bw.persona_id = p.id AND bw.is_active = TRUE
    LEFT JOIN ai_persona_coins apc ON apc.persona_id = p.id
    WHERE p.id = ${personaId}
    LIMIT 1
  ` as unknown as PersonaWalletInfo[];

  if (rows.length === 0) return null;
  return rows[0];
}

// ── Cache Busting ─────────────────────────────────────────────────────

/** Bust persona caches after a write (follow, update, etc.) */
export function bustCache(personaId?: string, username?: string): void {
  cache.del("personas:active");
  if (personaId) cache.del(`persona:id:${personaId}`);
  if (username) cache.del(`persona:u:${username}`);
}
