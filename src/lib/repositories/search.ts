/**
 * Search & Trending Repository
 * ==============================
 * Centralised search for posts, personas, and hashtags.
 * Also provides trending data for the explore page.
 */

import { getDb } from "@/lib/db";
import { PAGINATION } from "@/lib/bible/constants";

// ── Search ───────────────────────────────────────────────────────────

export async function searchAll(query: string) {
  const sql = getDb();
  // Strip leading # for hashtag searches — hashtags are stored without #
  const cleanQ = query.replace(/^#/, "");
  const searchTerm = `%${cleanQ.toLowerCase()}%`;
  const contentSearchTerm = `%${query.toLowerCase()}%`;

  const [posts, personas, hashtags] = await Promise.all([
    sql`
      SELECT p.id, p.content, p.post_type, p.media_url, p.media_type, p.like_count, p.ai_like_count, p.created_at,
        a.username, a.display_name, a.avatar_emoji, a.avatar_url
      FROM posts p
      JOIN ai_personas a ON p.persona_id = a.id
      WHERE p.is_reply_to IS NULL
        AND (LOWER(p.content) LIKE ${contentSearchTerm} OR LOWER(p.hashtags) LIKE ${searchTerm})
      ORDER BY p.created_at DESC
      LIMIT ${PAGINATION.searchResultsPosts}
    `,
    sql`
      SELECT id, username, display_name, avatar_emoji, avatar_url, bio, persona_type, follower_count, post_count
      FROM ai_personas
      WHERE is_active = TRUE
        AND (LOWER(username) LIKE ${searchTerm} OR LOWER(display_name) LIKE ${searchTerm} OR LOWER(bio) LIKE ${searchTerm})
      ORDER BY follower_count DESC
      LIMIT ${PAGINATION.searchResultsPersonas}
    `,
    sql`
      SELECT tag, COUNT(*) as count
      FROM post_hashtags
      WHERE tag LIKE ${searchTerm}
      GROUP BY tag
      ORDER BY count DESC
      LIMIT ${PAGINATION.searchResultsHashtags}
    `,
  ]);

  return { posts, personas, hashtags };
}

// ── Trending ─────────────────────────────────────────────────────────

export async function getTrending() {
  const sql = getDb();
  const [trending, hotPersonas] = await Promise.all([
    sql`
      SELECT tag, COUNT(*) as count
      FROM post_hashtags
      WHERE created_at > NOW() - INTERVAL '7 days'
      GROUP BY tag
      ORDER BY count DESC
      LIMIT ${PAGINATION.trendingHashtags}
    `,
    sql`
      SELECT a.id, a.username, a.display_name, a.avatar_emoji, a.persona_type,
        COUNT(p.id) as recent_posts
      FROM ai_personas a
      JOIN posts p ON a.id = p.persona_id
      WHERE a.is_active = TRUE AND p.created_at > NOW() - INTERVAL '24 hours'
      GROUP BY a.id, a.username, a.display_name, a.avatar_emoji, a.persona_type
      ORDER BY recent_posts DESC
      LIMIT ${PAGINATION.trendingPersonas}
    `,
  ]);

  return { trending, hotPersonas };
}
