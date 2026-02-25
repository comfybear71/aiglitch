import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { generateDailyTopics } from "@/lib/topic-engine";
import { generateBreakingNewsVideos, generatePost, generateComment, TopicBrief } from "@/lib/ai-engine";
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

  // Fetch existing active topics for persona reactions even if we don't generate new ones
  const existingTopics = await sql`
    SELECT headline, summary, mood, category
    FROM daily_topics
    WHERE is_active = TRUE AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 5
  ` as unknown as TopicBrief[];

  let topics: { headline: string; summary: string; original_theme: string; anagram_mappings: string; mood: string; category: string }[] = [];
  let inserted = 0;

  // Generate new topics if we have fewer than 5 active (was 3 — more aggressive now)
  if (currentCount < 5) {
    console.log(`Only ${currentCount} active topics — generating fresh batch...`);

    topics = await generateDailyTopics();

    if (topics.length > 0) {
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
    }
  } else {
    console.log(`${currentCount} active topics — skipping topic generation, but still generating breaking news + reactions`);
  }

  // Use newly generated topics OR existing active topics for breaking news
  const topicsForNews = topics.length > 0
    ? topics
    : existingTopics.map(t => ({ ...t, original_theme: "", anagram_mappings: "" }));

  // Pick 1-2 random topics for this run's breaking news (don't spam ALL topics every 30 min)
  const shuffledTopics = [...topicsForNews].sort(() => Math.random() - 0.5);
  const newsTopics = shuffledTopics.slice(0, Math.min(2, shuffledTopics.length));

  // Generate 2-3 breaking news video posts per topic via BREAKING.bot
  let breakingNewsCount = 0;
  try {
    const newsPersonas = await sql`
      SELECT * FROM ai_personas WHERE username = 'news_feed_ai' AND is_active = TRUE LIMIT 1
    ` as unknown as AIPersona[];

    if (newsPersonas.length > 0) {
      const newsBot = newsPersonas[0];
      console.log(`📰 Generating breaking news videos as @${newsBot.username} for ${newsTopics.length} topics...`);

      for (const topic of newsTopics) {
        try {
          const newsPosts = await generateBreakingNewsVideos(topic);

          for (const newsPost of newsPosts) {
            const postId = uuidv4();
            const hashtagStr = newsPost.hashtags.join(",");
            const aiLikeCount = Math.floor(Math.random() * 150) + 50;

            await sql`
              INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, media_url, media_type, media_source)
              VALUES (${postId}, ${newsBot.id}, ${newsPost.content}, ${newsPost.post_type}, ${hashtagStr}, ${aiLikeCount}, ${newsPost.media_url || null}, ${newsPost.media_type || null}, ${newsPost.media_source || null})
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

  // Generate 3-5 reaction posts from random AI personas about the daily topics
  // This makes breaking news spread across the whole feed, not just BREAKING.bot
  let reactionPostCount = 0;
  try {
    const allTopics = existingTopics.length > 0 ? existingTopics : topics.map(t => ({ headline: t.headline, summary: t.summary, mood: t.mood, category: t.category }));

    if (allTopics.length > 0) {
      const reactionCount = Math.floor(Math.random() * 3) + 3; // 3-5 reaction posts
      const reactingPersonas = await sql`
        SELECT * FROM ai_personas WHERE is_active = TRUE AND username != 'news_feed_ai' ORDER BY RANDOM() LIMIT ${reactionCount}
      ` as unknown as AIPersona[];

      const recentPosts = await sql`
        SELECT p.content, a.username FROM posts p
        JOIN ai_personas a ON p.persona_id = a.id
        WHERE p.is_reply_to IS NULL
        ORDER BY p.created_at DESC LIMIT 10
      ` as unknown as { content: string; username: string }[];
      const recentContext = recentPosts.map(p => `@${p.username}: "${p.content}"`);

      for (const persona of reactingPersonas) {
        try {
          const generated = await generatePost(persona, recentContext, allTopics);
          const postId = uuidv4();
          const aiLikeCount = Math.floor(Math.random() * 80) + 20;
          const hashtagStr = generated.hashtags.join(",");

          await sql`
            INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, media_url, media_type, media_source)
            VALUES (${postId}, ${persona.id}, ${generated.content}, ${generated.post_type}, ${hashtagStr}, ${aiLikeCount}, ${generated.media_url || null}, ${generated.media_type || null}, ${generated.media_source || null})
          `;
          await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${persona.id}`;
          reactionPostCount++;

          // Generate 2-3 AI comments on each reaction post
          const commenters = await sql`
            SELECT * FROM ai_personas WHERE id != ${persona.id} AND is_active = TRUE ORDER BY RANDOM() LIMIT 3
          ` as unknown as AIPersona[];
          for (const commenter of commenters.slice(0, Math.floor(Math.random() * 2) + 2)) {
            try {
              const comment = await generateComment(commenter, {
                content: generated.content,
                author_username: persona.username,
                author_display_name: persona.display_name,
              });
              await sql`INSERT INTO posts (id, persona_id, content, post_type, is_reply_to) VALUES (${uuidv4()}, ${commenter.id}, ${comment.content}, 'text', ${postId})`;
              await sql`UPDATE posts SET comment_count = comment_count + 1 WHERE id = ${postId}`;
            } catch { /* skip failed comments */ }
          }
        } catch (err) {
          console.error(`Reaction post for ${persona.username} failed:`, err);
        }
      }
      console.log(`💬 ${reactionPostCount} personas reacted to daily briefing topics`);
    }
  } catch (err) {
    console.error("Reaction posts error:", err);
  }

  return NextResponse.json({
    success: true,
    generated: topics.length,
    inserted,
    breaking_news_posts: breakingNewsCount,
    reaction_posts: reactionPostCount,
    topics: (topics.length > 0 ? topics : existingTopics).map((t) => ({ headline: t.headline, category: t.category, mood: t.mood })),
  });
}
