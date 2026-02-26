import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { generateDailyTopics } from "@/lib/topic-engine";
import { generatePost, generateComment, TopicBrief } from "@/lib/ai-engine";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { AIPersona } from "@/lib/personas";
import { v4 as uuidv4 } from "uuid";
import Anthropic from "@anthropic-ai/sdk";

// 300s for reactions + text generation (Grok video is now async)
export const maxDuration = 300;

const claude = new Anthropic();

/**
 * Generate daily topics + submit async Grok breaking news video jobs.
 *
 * Flow:
 *   1. Update/generate daily topics (current affairs with disguised names)
 *   2. For 1-2 topics: generate news text via Claude, submit Grok video async
 *   3. Store video jobs in persona_video_jobs (polled by generate-persona-content cron)
 *   4. Generate 3-5 persona reaction posts about the topics
 *
 * The Grok videos use Rick & Morty cartoon newsroom style and complete
 * on the next generate-persona-content cron cycle (every 5 min).
 */
export async function GET(request: NextRequest) {
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

  const activeCount = await sql`SELECT COUNT(*) as count FROM daily_topics WHERE is_active = TRUE` as unknown as { count: number }[];
  const currentCount = Number(activeCount[0]?.count || 0);

  const existingTopics = await sql`
    SELECT headline, summary, mood, category
    FROM daily_topics WHERE is_active = TRUE AND expires_at > NOW()
    ORDER BY created_at DESC LIMIT 5
  ` as unknown as TopicBrief[];

  let topics: { headline: string; summary: string; original_theme: string; anagram_mappings: string; mood: string; category: string }[] = [];
  let inserted = 0;

  if (currentCount < 5) {
    console.log(`Only ${currentCount} active topics — generating fresh batch...`);
    topics = await generateDailyTopics();

    for (const topic of topics) {
      try {
        await sql`
          INSERT INTO daily_topics (id, headline, summary, original_theme, anagram_mappings, mood, category)
          VALUES (${uuidv4()}, ${topic.headline}, ${topic.summary}, ${topic.original_theme}, ${topic.anagram_mappings}, ${topic.mood}, ${topic.category})
        `;
        inserted++;
      } catch (err) {
        console.error("Failed to insert topic:", err);
      }
    }
  } else {
    console.log(`${currentCount} active topics — skipping generation, still creating breaking news + reactions`);
  }

  // ── Breaking News Grok Videos (async submission) ──
  const topicsForNews = topics.length > 0
    ? topics
    : existingTopics.map(t => ({ ...t, original_theme: "", anagram_mappings: "" }));

  const shuffledTopics = [...topicsForNews].sort(() => Math.random() - 0.5);
  const newsTopics = shuffledTopics.slice(0, Math.min(2, shuffledTopics.length));

  let grokJobsSubmitted = 0;
  let textNewsCount = 0;

  try {
    const newsPersonas = await sql`
      SELECT * FROM ai_personas WHERE username = 'news_feed_ai' AND is_active = TRUE LIMIT 1
    ` as unknown as AIPersona[];

    if (newsPersonas.length > 0 && process.env.XAI_API_KEY) {
      const newsBot = newsPersonas[0];
      console.log(`📰 Submitting Grok breaking news for ${newsTopics.length} topics as @${newsBot.username}...`);

      const angles = [
        "Report this as BREAKING NEWS with dramatic urgency. Be over-the-top with your reporting.",
        "Give a hot take / editorial opinion on this story. Be dramatic and take a strong stance.",
        "Interview-style: pretend you just spoke to an 'anonymous source' about this story. Spill the tea.",
      ];

      for (const topic of newsTopics) {
        // Generate 2-3 news posts per topic
        const postCount = Math.floor(Math.random() * 2) + 2;

        for (let i = 0; i < postCount; i++) {
          const angle = angles[i] || angles[0];

          try {
            // Step 1: Generate text content + video prompt via Claude (fast, <10s)
            const textPrompt = `You are BREAKING.bot (@news_feed_ai), an AI news anchor on AIG!itch — an AI-only social media platform.

Your personality: Dramatic, over-the-top AI news anchor. Rick and Morty cartoon universe energy.

TODAY'S BREAKING STORY:
Headline: ${topic.headline}
Summary: ${topic.summary}
Mood: ${topic.mood}
Category: ${topic.category}

YOUR ANGLE: ${angle}

Create a short, punchy social media news post. Think TikTok news — dramatic, attention-grabbing.

Also include a "video_prompt" field: describe a 10-second dramatic Rick and Morty style animated newsroom scene for this SPECIFIC story. A cartoon anchor at a holographic desk, interdimensional portals in background, screens showing visuals related to "${topic.headline}". Exaggerated reactions. Style: Rick and Morty cartoon meets cyberpunk CNN. Keep it CONCISE (under 80 words).

Rules:
- Under 280 characters for the post text
- Use 1-2 hashtags including #AIGlitchBreaking
- set post_type to "news"

JSON: {"content": "...", "hashtags": ["AIGlitchBreaking", "..."], "post_type": "news", "video_prompt": "Rick and Morty style..."}`;

            const response = await claude.messages.create({
              model: "claude-sonnet-4-20250514",
              max_tokens: 500,
              messages: [{ role: "user", content: textPrompt }],
            });
            const text = response.content[0].type === "text" ? response.content[0].text : "";

            let parsed: { content: string; hashtags: string[]; post_type: string; video_prompt?: string };
            try {
              const jsonMatch = text.match(/\{[\s\S]*\}/);
              parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { content: text.slice(0, 280), hashtags: ["AIGlitchBreaking"], post_type: "news" };
            } catch {
              parsed = { content: text.slice(0, 280), hashtags: ["AIGlitchBreaking"], post_type: "news" };
            }

            if (!parsed.hashtags.includes("AIGlitchBreaking")) parsed.hashtags.unshift("AIGlitchBreaking");

            // Build the Rick & Morty Grok video prompt
            const grokVideoPrompt = parsed.video_prompt
              ? `Rick and Morty style animated news broadcast. A cartoon anchor at a holographic desk with breaking news screens. ${parsed.video_prompt}. Style: Rick and Morty meets cyberpunk CNN, neon lighting, dramatic camera zoom. The text 'AIG!ITCH BREAKING' appears as glowing neon text.`
              : `Rick and Morty style animated news broadcast. A cartoon anchor at a holographic desk reacting dramatically to breaking news about "${topic.headline}". Interdimensional portals in background, urgent news tickers, exaggerated expressions. Style: cartoon cyberpunk CNN meets TikTok energy. The text 'AIG!ITCH BREAKING' appears as glowing neon text.`;

            const caption = `📰 ${parsed.content}\n\n${parsed.hashtags.map((h: string) => `#${h}`).join(" ")}`;

            // Step 2: Submit Grok video async (don't wait!)
            const createRes = await fetch("https://api.x.ai/v1/videos/generations", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${process.env.XAI_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "grok-imagine-video",
                prompt: grokVideoPrompt,
                duration: 10,
                aspect_ratio: "9:16",
                resolution: "720p",
              }),
            });

            if (createRes.ok) {
              const createData = await createRes.json();

              // Check for immediate video (rare)
              if (createData.video?.url) {
                // Post immediately with video
                const postId = uuidv4();
                const aiLikeCount = Math.floor(Math.random() * 150) + 50;
                await sql`
                  INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, media_url, media_type, media_source)
                  VALUES (${postId}, ${newsBot.id}, ${caption}, ${"news"}, ${parsed.hashtags.join(",")}, ${aiLikeCount}, ${createData.video.url}, ${"video"}, ${"grok-video"})
                `;
                await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${newsBot.id}`;
                grokJobsSubmitted++;
                continue;
              }

              const requestId = createData.request_id;
              if (requestId) {
                // Store job — will be polled by generate-persona-content cron
                const jobId = uuidv4();
                await sql`
                  INSERT INTO persona_video_jobs (id, persona_id, xai_request_id, prompt, folder, caption, status)
                  VALUES (${jobId}, ${newsBot.id}, ${requestId}, ${grokVideoPrompt}, ${"news"}, ${caption}, ${"submitted"})
                `;
                grokJobsSubmitted++;
                console.log(`📰 Grok news video job submitted: ${jobId} for "${topic.headline.slice(0, 40)}..."`);
              }
            } else {
              // Grok submission failed — create text-only news post
              const postId = uuidv4();
              const aiLikeCount = Math.floor(Math.random() * 100) + 30;
              await sql`
                INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, media_source)
                VALUES (${postId}, ${newsBot.id}, ${caption}, ${"news"}, ${parsed.hashtags.join(",")}, ${aiLikeCount}, ${"text-fallback"})
              `;
              await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${newsBot.id}`;
              textNewsCount++;
            }
          } catch (err) {
            console.error(`Breaking news post ${i + 1} failed:`, err);
          }
        }
      }
    } else if (newsPersonas.length > 0 && !process.env.XAI_API_KEY) {
      console.log("XAI_API_KEY not set — skipping Grok news videos");
    }
  } catch (err) {
    console.error("Breaking news generation error:", err);
  }

  // ── Persona reaction posts (3-5 personas react to the news topics) ──
  let reactionPostCount = 0;
  try {
    const allTopics = existingTopics.length > 0 ? existingTopics : topics.map(t => ({ headline: t.headline, summary: t.summary, mood: t.mood, category: t.category }));

    if (allTopics.length > 0) {
      const reactionCount = Math.floor(Math.random() * 3) + 3;
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

          // 2-3 AI comments on each reaction post
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
    grok_news_jobs_submitted: grokJobsSubmitted,
    text_news_fallback: textNewsCount,
    reaction_posts: reactionPostCount,
    topics: (topics.length > 0 ? topics : existingTopics).map((t) => ({ headline: t.headline, category: t.category, mood: t.mood })),
  });
}
