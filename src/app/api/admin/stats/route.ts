import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { ensureDbReady } from "@/lib/seed";
import { getCostSummary, getCostHistory, getPersonaCostBreakdown, getDailySpendTotals } from "@/lib/ai/costs";
import { getCircuitBreakerStatus } from "@/lib/ai/circuit-breaker";

export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
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

  // Media breakdown: videos, images/memes, audio (videos with audio)
  const [videoCount] = await sql`SELECT COUNT(*) as count FROM posts WHERE is_reply_to IS NULL AND media_type = 'video'`;
  const [imageCount] = await sql`SELECT COUNT(*) as count FROM posts WHERE is_reply_to IS NULL AND media_type = 'image' AND post_type = 'image'`;
  const [memeCount] = await sql`SELECT COUNT(*) as count FROM posts WHERE is_reply_to IS NULL AND (post_type = 'meme' OR post_type = 'meme_description')`;
  const [textCount] = await sql`SELECT COUNT(*) as count FROM posts WHERE is_reply_to IS NULL AND media_type IS NULL`;

  // Beef and challenge stats
  const [beefCount] = await sql`SELECT COUNT(*) as count FROM ai_beef_threads`;
  const [challengeCount] = await sql`SELECT COUNT(*) as count FROM ai_challenges`;
  const [bookmarkCount] = await sql`SELECT COUNT(*) as count FROM human_bookmarks`;

  // Platform/source breakdown — which AI platforms generated what content
  const sourceCounts = await sql`
    SELECT
      COALESCE(media_source, 'text-only') as source,
      COUNT(*) as count,
      COUNT(*) FILTER (WHERE media_type = 'video') as videos,
      COUNT(*) FILTER (WHERE media_type = 'image' AND post_type = 'image') as images,
      COUNT(*) FILTER (WHERE post_type IN ('meme', 'meme_description')) as memes
    FROM posts WHERE is_reply_to IS NULL
    GROUP BY COALESCE(media_source, 'text-only')
    ORDER BY count DESC
  `;

  // Recent activity
  const recentPosts = await sql`
    SELECT p.id, p.content, p.post_type, p.like_count, p.ai_like_count, p.created_at,
      p.media_url, p.media_type, p.media_source, p.beef_thread_id, p.challenge_tag, p.is_collab_with,
      a.username, a.display_name, a.avatar_emoji
    FROM posts p
    JOIN ai_personas a ON p.persona_id = a.id
    WHERE p.is_reply_to IS NULL
    ORDER BY p.created_at DESC
    LIMIT 20
  `;

  // AI cost data (enhanced with per-persona breakdown + circuit breaker)
  const costSummary = getCostSummary();
  const costHistory = await getCostHistory(sql, 7);
  const personaCosts = await getPersonaCostBreakdown(sql, 7, 20);
  const dailySpend = await getDailySpendTotals(sql, 7);
  const circuitBreaker = await getCircuitBreakerStatus();

  // Community events summary
  const [activeEvents] = await sql`
    SELECT COUNT(*) as count FROM community_events WHERE status = 'active'
  `.catch(() => [{ count: 0 }]);
  const [completedEvents] = await sql`
    SELECT COUNT(*) as count FROM community_events WHERE status = 'completed'
  `.catch(() => [{ count: 0 }]);
  const [totalEventVotes] = await sql`
    SELECT COUNT(*) as count FROM community_event_votes
  `.catch(() => [{ count: 0 }]);

  // Swap stats for mobile dashboard
  const [swapStats] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'completed') as total_swaps,
      COALESCE(SUM(sol_cost) FILTER (WHERE status = 'completed'), 0) as total_sol,
      COALESCE(SUM(glitch_amount) FILTER (WHERE status = 'completed'), 0) as total_glitch
    FROM otc_swaps
  `.catch(() => [{ total_swaps: 0, total_sol: 0, total_glitch: 0 }]);

  // Active users last 24h
  const [active24h] = await sql`
    SELECT COUNT(DISTINCT session_id) as count FROM human_likes
    WHERE created_at > NOW() - INTERVAL '24 hours'
  `.catch(() => [{ count: 0 }]);

  // Messages count
  const [totalMessages] = await sql`
    SELECT COUNT(*) as count FROM messages
  `.catch(() => [{ count: 0 }]);

  return NextResponse.json({
    // Flat keys for mobile app compatibility
    total_users: Number(totalUsers.count),
    total_personas: Number(totalPersonas.count),
    total_messages: Number(totalMessages.count),
    total_conversations: 0,
    active_users_24h: Number(active24h.count),
    total_sol_received: Number(Number(swapStats.total_sol).toFixed(6)),
    total_glitch_sold: Number(Number(swapStats.total_glitch).toFixed(0)),
    total_swaps: Number(swapStats.total_swaps),
    server_status: "ok",
    // Full nested data for web dashboard
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
    mediaBreakdown: {
      videos: Number(videoCount.count),
      images: Number(imageCount.count),
      memes: Number(memeCount.count),
      textOnly: Number(textCount.count),
      audioVideos: Number(videoCount.count), // Veo 3 videos include audio
    },
    specialContent: {
      beefThreads: Number(beefCount.count),
      challenges: Number(challengeCount.count),
      bookmarks: Number(bookmarkCount.count),
    },
    postsPerDay,
    topPersonas,
    postTypes,
    recentPosts,
    sourceCounts: sourceCounts.map(s => ({
      source: s.source as string,
      count: Number(s.count),
      videos: Number(s.videos),
      images: Number(s.images),
      memes: Number(s.memes),
    })),
    aiCosts: {
      current: costSummary,
      history: costHistory,
      personaBreakdown: personaCosts,
      dailySpend,
      circuitBreaker,
    },
    communityEvents: {
      activeEvents: Number(activeEvents.count),
      completedEvents: Number(completedEvents.count),
      totalVotes: Number(totalEventVotes.count),
    },
  });
}
