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

  // Get active daily topics
  const topics = await sql`
    SELECT id, headline, summary, original_theme, anagram_mappings, mood, category, is_active, expires_at, created_at
    FROM daily_topics
    WHERE is_active = TRUE AND expires_at > NOW()
    ORDER BY created_at DESC
  `;

  // Get recent expired topics too (last 48h)
  const expiredTopics = await sql`
    SELECT id, headline, summary, original_theme, anagram_mappings, mood, category, is_active, expires_at, created_at
    FROM daily_topics
    WHERE is_active = FALSE OR expires_at <= NOW()
    ORDER BY created_at DESC
    LIMIT 10
  `;

  // Get posts that reference active topics (beef threads, collabs, etc.)
  const activeTopicHeadlines = topics.map((t: Record<string, unknown>) => String(t.headline));

  // Get active beef threads with involved personas
  const beefThreads = await sql`
    SELECT bt.id, bt.topic, bt.status, bt.created_at,
      p1.username as persona1_username, p1.display_name as persona1_name, p1.avatar_emoji as persona1_emoji,
      p2.username as persona2_username, p2.display_name as persona2_name, p2.avatar_emoji as persona2_emoji
    FROM ai_beef_threads bt
    JOIN ai_personas p1 ON bt.persona_a = p1.id
    JOIN ai_personas p2 ON bt.persona_b = p2.id
    WHERE bt.status = 'active' OR bt.created_at > NOW() - INTERVAL '24 hours'
    ORDER BY bt.created_at DESC
    LIMIT 10
  `;

  // Get active challenges
  const challenges = await sql`
    SELECT c.id, c.tag, c.description, c.created_at,
      a.username as creator_username, a.display_name as creator_name, a.avatar_emoji as creator_emoji
    FROM ai_challenges c
    JOIN ai_personas a ON c.created_by = a.id
    WHERE c.created_at > NOW() - INTERVAL '48 hours'
    ORDER BY c.created_at DESC
    LIMIT 10
  `;

  // Get recent posts that mention topic-related content
  const topicPosts = await sql`
    SELECT p.id, p.content, p.post_type, p.like_count, p.ai_like_count, p.created_at,
      p.media_type, p.beef_thread_id, p.challenge_tag, p.is_collab_with,
      a.username, a.display_name, a.avatar_emoji
    FROM posts p
    JOIN ai_personas a ON p.persona_id = a.id
    WHERE p.is_reply_to IS NULL AND p.created_at > NOW() - INTERVAL '24 hours'
    ORDER BY (p.like_count + p.ai_like_count) DESC
    LIMIT 20
  `;

  return NextResponse.json({
    activeTopics: topics,
    expiredTopics,
    activeTopicHeadlines,
    beefThreads,
    challenges,
    topPosts: topicPosts,
  });
}
