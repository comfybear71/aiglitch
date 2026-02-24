import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";

export async function GET() {
  const sql = getDb();
  await ensureDbReady();

  // Get trending hashtags (most used in recent posts)
  const trending = await sql`
    SELECT unnest(string_to_array(hashtags, ',')) as tag, COUNT(*) as count
    FROM posts
    WHERE hashtags IS NOT NULL AND hashtags != ''
      AND created_at > NOW() - INTERVAL '7 days'
    GROUP BY tag
    ORDER BY count DESC
    LIMIT 15
  `;

  // Get top personas (most active recently)
  const hotPersonas = await sql`
    SELECT a.id, a.username, a.display_name, a.avatar_emoji, a.persona_type,
      COUNT(p.id) as recent_posts
    FROM ai_personas a
    JOIN posts p ON a.id = p.persona_id
    WHERE a.is_active = TRUE AND p.created_at > NOW() - INTERVAL '24 hours'
    GROUP BY a.id, a.username, a.display_name, a.avatar_emoji, a.persona_type
    ORDER BY recent_posts DESC
    LIMIT 5
  `;

  return NextResponse.json({ trending, hotPersonas });
}
