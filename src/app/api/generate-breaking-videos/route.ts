import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { generateBreakingNewsVideos, TopicBrief } from "@/lib/ai-engine";
import { AIPersona } from "@/lib/personas";
import { v4 as uuidv4 } from "uuid";

export const maxDuration = 660; // 11 min — must exceed 10 min polling timeout

/**
 * Generate breaking news videos from the latest admin briefing topics.
 * Reads active daily_topics and generates 2-3 video posts per topic using Grok.
 * POST body: { count?: number } — total number of video posts to generate (default 10)
 */
export async function POST(request: NextRequest) {
  const isAdmin = await isAdminAuthenticated();
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && !isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  await ensureDbReady();

  const body = await request.json().catch(() => ({}));
  const targetCount = Math.min(Math.max(body.count || 10, 1), 15);

  // Get the news bot persona
  const newsBots = await sql`
    SELECT * FROM ai_personas WHERE username = 'news_feed_ai' AND is_active = TRUE LIMIT 1
  ` as unknown as AIPersona[];

  if (!newsBots.length) {
    return NextResponse.json({ error: "news_feed_ai persona not found or inactive" }, { status: 500 });
  }
  const newsBot = newsBots[0];

  // Fetch active briefing topics
  const topics = await sql`
    SELECT headline, summary, mood, category
    FROM daily_topics
    WHERE is_active = TRUE AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 10
  ` as unknown as TopicBrief[];

  if (!topics.length) {
    return NextResponse.json({
      error: "No active briefing topics found. Generate topics first from the admin panel.",
      hint: "Hit the 'Generate Topics' button or call /api/generate-topics",
    }, { status: 400 });
  }

  console.log(`📰 Generating ${targetCount} breaking news videos from ${topics.length} briefing topics...`);

  const results: { headline: string; status: string; hasVideo: boolean; postId?: string; mediaSource?: string }[] = [];
  let generated = 0;

  // Cycle through topics, generating 2-3 posts per topic until we hit our target
  for (let topicIdx = 0; generated < targetCount && topicIdx < topics.length * 2; topicIdx++) {
    const topic = topics[topicIdx % topics.length];

    try {
      console.log(`📰 Topic: "${topic.headline.slice(0, 60)}..." (${topic.category}, ${topic.mood})`);
      const postsNeeded = Math.min(targetCount - generated, 3);

      // generateBreakingNewsVideos generates 2-3 posts per topic
      const newsPosts = await generateBreakingNewsVideos(topic);

      for (const newsPost of newsPosts.slice(0, postsNeeded)) {
        const postId = uuidv4();
        const hashtagStr = newsPost.hashtags.join(",");
        const aiLikeCount = Math.floor(Math.random() * 200) + 80;

        await sql`
          INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, media_url, media_type, media_source)
          VALUES (${postId}, ${newsBot.id}, ${newsPost.content}, ${newsPost.post_type}, ${hashtagStr}, ${aiLikeCount}, ${newsPost.media_url || null}, ${newsPost.media_type || null}, ${newsPost.media_source || null})
        `;
        await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${newsBot.id}`;

        const hasVideo = newsPost.media_type === "video" && !!newsPost.media_url;
        results.push({
          headline: topic.headline.slice(0, 80),
          status: hasVideo ? "video" : newsPost.media_type === "image" ? "image" : "text-only",
          hasVideo,
          postId,
          mediaSource: newsPost.media_source,
        });
        generated++;

        console.log(`✅ Breaking news ${generated}/${targetCount}: "${topic.headline.slice(0, 40)}..." (${hasVideo ? "VIDEO" : newsPost.media_type || "text"}, ${newsPost.media_source || "none"})`);
      }
    } catch (err) {
      console.error(`Breaking news generation failed for "${topic.headline}":`, err);
      results.push({
        headline: topic.headline.slice(0, 80),
        status: "failed",
        hasVideo: false,
      });
    }
  }

  const videoCount = results.filter(r => r.hasVideo).length;
  return NextResponse.json({
    success: true,
    generated,
    videoCount,
    totalResults: results.length,
    briefingTopicsUsed: topics.length,
    results,
  });
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const isAdmin = await isAdminAuthenticated();

  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && !isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const req = new NextRequest(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify({ count: 10 }),
  });
  return POST(req);
}
