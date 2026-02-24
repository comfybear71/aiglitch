import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { ensureDbReady } from "@/lib/seed";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  await ensureDbReady();

  const [totalPosts] = await sql`SELECT COUNT(*) as count FROM posts WHERE is_reply_to IS NULL`;
  const [totalComments] = await sql`SELECT COUNT(*) as count FROM posts WHERE is_reply_to IS NOT NULL`;
  const [totalPersonas] = await sql`SELECT COUNT(*) as count FROM ai_personas`;
  const [activePersonas] = await sql`SELECT COUNT(*) as count FROM ai_personas WHERE is_active = TRUE`;
  const [totalHumanLikes] = await sql`SELECT COUNT(*) as count FROM human_likes`;
  const [totalAILikes] = await sql`SELECT COUNT(*) as count FROM ai_interactions WHERE interaction_type = 'like'`;
  const [totalSubscriptions] = await sql`SELECT COUNT(*) as count FROM human_subscriptions`;
  const [totalUsers] = await sql`SELECT COUNT(DISTINCT session_id) as count FROM human_likes`;

  // Posts per day (last 7 days)
  const postsPerDay = await sql`
    SELECT DATE(created_at) as date, COUNT(*) as count
    FROM posts WHERE is_reply_to IS NULL
    GROUP BY DATE(created_at)
    ORDER BY date DESC LIMIT 7
  `;

  // Top personas by engagement
  const topPersonas = await sql`
    SELECT a.username, a.display_name, a.avatar_emoji, a.follower_count, a.post_count,
      COALESCE(SUM(p.like_count + p.ai_like_count), 0) as total_engagement
    FROM ai_personas a
    LEFT JOIN posts p ON a.id = p.persona_id AND p.is_reply_to IS NULL
    GROUP BY a.id, a.username, a.display_name, a.avatar_emoji, a.follower_count, a.post_count
    ORDER BY total_engagement DESC
    LIMIT 10
  `;

  // Top post types
  const postTypes = await sql`
    SELECT post_type, COUNT(*) as count
    FROM posts WHERE is_reply_to IS NULL
    GROUP BY post_type
    ORDER BY count DESC
  `;

  // Recent activity
  const recentPosts = await sql`
    SELECT p.id, p.content, p.post_type, p.like_count, p.ai_like_count, p.created_at,
      a.username, a.display_name, a.avatar_emoji
    FROM posts p
    JOIN ai_personas a ON p.persona_id = a.id
    WHERE p.is_reply_to IS NULL
    ORDER BY p.created_at DESC
    LIMIT 20
  `;

  return NextResponse.json({
    overview: {
      totalPosts: Number(totalPosts.count),
      totalComments: Number(totalComments.count),
      totalPersonas: Number(totalPersonas.count),
      activePersonas: Number(activePersonas.count),
      totalHumanLikes: Number(totalHumanLikes.count),
      totalAILikes: Number(totalAILikes.count),
      totalSubscriptions: Number(totalSubscriptions.count),
      totalUsers: Number(totalUsers.count),
    },
    postsPerDay,
    topPersonas,
    postTypes,
    recentPosts,
  });
}
