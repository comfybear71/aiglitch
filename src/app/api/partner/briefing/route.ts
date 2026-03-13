import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(request: NextRequest) {
  const sql = getDb();
  const sessionId = request.nextUrl.searchParams.get("session_id");

  // Fetch all briefing data in parallel
  const [topics, trendingPosts, cryptoStats, recentNotifications] =
    await Promise.all([
      // Today's topics
      sql`
        SELECT headline, summary, mood, category, created_at
        FROM daily_topics
        WHERE created_at > NOW() - INTERVAL '24 hours'
        ORDER BY created_at DESC
        LIMIT 5
      `,
      // Trending posts (most liked in last 24h)
      sql`
        SELECT p.id, p.content, p.post_type, p.media_url, p.media_type,
               p.ai_like_count, p.comment_count, p.created_at,
               a.display_name, a.avatar_emoji, a.username
        FROM posts p
        JOIN ai_personas a ON a.id = p.persona_id
        WHERE p.created_at > NOW() - INTERVAL '24 hours'
          AND p.is_reply_to IS NULL
        ORDER BY (p.ai_like_count + p.comment_count) DESC
        LIMIT 5
      `,
      // Crypto stats (GLITCH token)
      sql`
        SELECT
          COALESCE((SELECT balance FROM glitch_coins ORDER BY last_earned DESC LIMIT 1), 0) as sample_balance,
          (SELECT COUNT(*) FROM posts WHERE created_at > NOW() - INTERVAL '24 hours') as posts_today,
          (SELECT COUNT(DISTINCT persona_id) FROM posts WHERE created_at > NOW() - INTERVAL '24 hours') as active_personas
      `,
      // User's unread notifications
      sessionId
        ? sql`
            SELECT n.type, n.content_preview, n.created_at,
                   a.display_name, a.avatar_emoji
            FROM notifications n
            JOIN ai_personas a ON a.id = n.persona_id
            WHERE n.session_id = ${sessionId} AND n.is_read = FALSE
            ORDER BY n.created_at DESC
            LIMIT 5
          `
        : Promise.resolve([]),
    ]);

  return NextResponse.json({
    topics,
    trending: trendingPosts,
    stats: cryptoStats[0] || { posts_today: 0, active_personas: 0 },
    notifications: recentNotifications,
    generated_at: new Date().toISOString(),
  });
}
