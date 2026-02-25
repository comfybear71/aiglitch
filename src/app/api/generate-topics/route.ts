import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { generateDailyTopics } from "@/lib/topic-engine";
import { generateBreakingNewsVideos } from "@/lib/ai-engine";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { AIPersona } from "@/lib/personas";
import { v4 as uuidv4 } from "uuid";

// Allow up to 300s — breaking news videos take time to generate
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  // Auth: cron secret or admin
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const isAdmin = await isAdminAuthenticated();
  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && !isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  await ensureDbReady();

  // Expire old topics
  await sql`UPDATE daily_topics SET is_active = FALSE WHERE expires_at < NOW()`;

  // Check how many active topics we have
  const activeCount = await sql`SELECT COUNT(*) as count FROM daily_topics WHERE is_active = TRUE` as unknown as { count: number }[];
  const currentCount = Number(activeCount[0]?.count || 0);

  // Only generate new topics if we have fewer than 3 active
  if (currentCount >= 3) {
    return NextResponse.json({
      success: true,
      message: `Still have ${currentCount} active topics, skipping generation`,
      active_topics: currentCount,
    });
  }

  console.log(`Only ${currentCount} active topics — generating fresh batch...`);

  const topics = await generateDailyTopics();

  if (topics.length === 0) {
    return NextResponse.json({ success: false, error: "No topics generated" }, { status: 500 });
  }

  // Insert new topics
  let inserted = 0;
  for (const topic of topics) {
    try {
      await sql`
        INSERT INTO daily_topics (id, headline, summary, original_theme, anagram_mappings, mood, category)
        VALUES (
          ${uuidv4()},
          ${topic.headline},
          ${topic.summary},
          ${topic.original_theme},
          ${topic.anagram_mappings},
          ${topic.mood},
          ${topic.category}
        )
      `;
      inserted++;
    } catch (err) {
      console.error("Failed to insert topic:", err);
    }
  }

  // Generate 2-3 breaking news video posts per topic via BREAKING.bot
  let breakingNewsCount = 0;
  try {
    // Find the news_feed_ai persona (BREAKING.bot)
    const newsPersonas = await sql`
      SELECT * FROM ai_personas WHERE username = 'news_feed_ai' AND is_active = TRUE LIMIT 1
    ` as unknown as AIPersona[];

    if (newsPersonas.length > 0) {
      const newsBot = newsPersonas[0];
      console.log(`📰 Generating breaking news videos as @${newsBot.username} for ${topics.length} topics...`);

      for (const topic of topics) {
        try {
          const newsPosts = await generateBreakingNewsVideos(topic);

          for (const newsPost of newsPosts) {
            const postId = uuidv4();
            const hashtagStr = newsPost.hashtags.join(",");
            const aiLikeCount = Math.floor(Math.random() * 150) + 50; // News gets 50-200 AI likes

            await sql`
              INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, media_url, media_type)
              VALUES (${postId}, ${newsBot.id}, ${newsPost.content}, ${newsPost.post_type}, ${hashtagStr}, ${aiLikeCount}, ${newsPost.media_url || null}, ${newsPost.media_type || null})
            `;
            await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${newsBot.id}`;
            breakingNewsCount++;
          }

          console.log(`📰 Created ${newsPosts.length} breaking news posts for: "${topic.headline.slice(0, 50)}..."`);
        } catch (err) {
          console.error(`Breaking news generation failed for topic "${topic.headline}":`, err);
        }
      }
    } else {
      console.log("news_feed_ai persona not found or inactive — skipping breaking news videos");
    }
  } catch (err) {
    console.error("Breaking news generation error:", err);
  }

  return NextResponse.json({
    success: true,
    generated: topics.length,
    inserted,
    breaking_news_posts: breakingNewsCount,
    topics: topics.map((t) => ({ headline: t.headline, category: t.category, mood: t.mood })),
  });
}
