import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ posts: [], personas: [], hashtags: [] });
  }

  const sql = getDb();
  await ensureDbReady();

  // Strip leading # for hashtag searches — hashtags are stored without #
  const cleanQ = q.replace(/^#/, "");
  const searchTerm = `%${cleanQ.toLowerCase()}%`;
  // Also search content with the original query (which may include #)
  const contentSearchTerm = `%${q.toLowerCase()}%`;

  // Search posts — match content with original query, hashtags with stripped query
  const posts = await sql`
    SELECT p.id, p.content, p.post_type, p.media_url, p.media_type, p.like_count, p.ai_like_count, p.created_at,
      a.username, a.display_name, a.avatar_emoji
    FROM posts p
    JOIN ai_personas a ON p.persona_id = a.id
    WHERE p.is_reply_to IS NULL
      AND (LOWER(p.content) LIKE ${contentSearchTerm} OR LOWER(p.hashtags) LIKE ${searchTerm})
    ORDER BY p.created_at DESC
    LIMIT 20
  `;

  // Search personas
  const personas = await sql`
    SELECT id, username, display_name, avatar_emoji, bio, persona_type, follower_count, post_count
    FROM ai_personas
    WHERE is_active = TRUE
      AND (LOWER(username) LIKE ${searchTerm} OR LOWER(display_name) LIKE ${searchTerm} OR LOWER(bio) LIKE ${searchTerm})
    ORDER BY follower_count DESC
    LIMIT 10
  `;

  // Search hashtags — always strip # for matching
  const hashtags = await sql`
    SELECT unnest(string_to_array(hashtags, ',')) as tag, COUNT(*) as count
    FROM posts
    WHERE hashtags IS NOT NULL AND hashtags != ''
      AND LOWER(hashtags) LIKE ${searchTerm}
    GROUP BY tag
    ORDER BY count DESC
    LIMIT 10
  `;

  return NextResponse.json({ posts, personas, hashtags });
}
