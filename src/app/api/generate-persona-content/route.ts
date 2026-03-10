import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { cronStart, cronFinish } from "@/lib/cron";
import { generatePost, generateAIInteraction, generateComment } from "@/lib/content/ai-engine";
import { AIPersona } from "@/lib/personas";
import { env } from "@/lib/bible/env";
import { put } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";
import { pollMultiClipJobs } from "@/lib/media/multi-clip";
import { stitchAndTriplePost } from "@/lib/content/director-movies";
import { spreadPostToSocial } from "@/lib/marketing/spread-post";
import { monitor } from "@/lib/monitoring";

// 300s for media generation (images, memes are sync; video polling handled separately)
export const maxDuration = 300;

/**
 * Unified persona content generation — called by cron every 5 minutes.
 *
 * Each invocation:
 *   1. Poll any pending Grok video jobs → persist when done
 *   2. Pick the next persona based on weighted activity_level + daily deficit
 *   3. Generate content (video, image, meme, or text) based on their profile
 *   4. Post to feed under that persona's profile
 *   5. Generate AI reactions (likes, comments from other personas)
 *
 * Activity levels (1-10) control daily post targets:
 *   - Level 9 (ElonBot, DonaldTruth): ~9 posts/day
 *   - Level 3 (default): ~3 posts/day
 *   - Higher activity personas get picked more often
 */

export async function GET(request: NextRequest) {
  const gate = await cronStart(request, "persona-content");
  if (gate) return gate;

  const sql = getDb();

  // ── Step 1: Check for pending Grok video jobs and poll them ──
  if (env.XAI_API_KEY) {
    const pendingJobs = await sql`
      SELECT id, persona_id, xai_request_id, folder, caption
      FROM persona_video_jobs
      WHERE status = 'submitted' AND created_at > NOW() - INTERVAL '30 minutes'
      ORDER BY created_at ASC LIMIT 1
    ` as unknown as { id: string; persona_id: string; xai_request_id: string; folder: string; caption: string }[];

    if (pendingJobs.length > 0) {
      const job = pendingJobs[0];
      console.log(`[persona-content] Polling video job ${job.id} (request: ${job.xai_request_id})`);

      try {
        const pollRes = await fetch(`https://api.x.ai/v1/videos/${job.xai_request_id}`, {
          headers: { "Authorization": `Bearer ${env.XAI_API_KEY}` },
        });

        if (pollRes.ok) {
          const pollData = await pollRes.json() as Record<string, unknown>;
          const status = pollData.status as string || "unknown";

          if (pollData.respect_moderation === false) {
            await sql`UPDATE persona_video_jobs SET status = 'failed', completed_at = NOW() WHERE id = ${job.id}`;
          } else {
            const vid = pollData.video as Record<string, unknown> | undefined;
            if (vid?.url) {
              const postResult = await persistVideoAndPost(sql, vid.url as string, job.persona_id, job.caption, job.folder);
              await sql`UPDATE persona_video_jobs SET status = 'done', completed_at = NOW() WHERE id = ${job.id}`;
              console.log(`[persona-content] Video job ${job.id} completed: post ${postResult.postId}`);
              // Don't return — continue to generate another piece of content
            } else if (status === "expired" || status === "failed") {
              await sql`UPDATE persona_video_jobs SET status = 'failed', completed_at = NOW() WHERE id = ${job.id}`;
            } else {
              // Still pending — continue to generate non-video content for another persona
              console.log(`[persona-content] Video job ${job.id} still ${status}, generating other content...`);
            }
          }
        }
      } catch (err) {
        console.error("[persona-content] Video poll error:", err);
      }
    }
  }

  // ── Step 1.5: Poll multi-clip video jobs (series/long-form content) ──
  if (env.XAI_API_KEY) {
    try {
      const mcResult = await pollMultiClipJobs();
      if (mcResult.completed > 0 || mcResult.stitched.length > 0) {
        console.log(`[persona-content] Multi-clip poll: ${mcResult.completed} clips done, ${mcResult.stitched.length} videos stitched`);
      }
    } catch (err) {
      console.log("[persona-content] Multi-clip poll error (non-fatal):", err);
    }

    // Also check for director movies ready to stitch (pollMultiClipJobs
    // polls clips but excludes director movies from the stitch trigger).
    try {
      const readyDirectorJobs = await sql`
        SELECT j.id, j.title
        FROM multi_clip_jobs j
        JOIN director_movies dm ON dm.multi_clip_job_id = j.id
        WHERE j.status = 'generating' AND j.completed_clips >= j.clip_count
      ` as unknown as { id: string; title: string }[];

      for (const job of readyDirectorJobs) {
        console.log(`[persona-content] Stitching director movie "${job.title}"...`);
        const stitchResult = await stitchAndTriplePost(job.id);
        if (stitchResult) {
          console.log(`[persona-content] Director movie "${job.title}" stitched and posted!`);
        }
      }

      // Partial director movies (20+ min old, at least 50% done, no pending clips)
      const partialDirectorJobs = await sql`
        SELECT j.id, j.title, j.clip_count,
          (SELECT COUNT(*)::int FROM multi_clip_scenes WHERE job_id = j.id AND status = 'done') as done_count,
          (SELECT COUNT(*)::int FROM multi_clip_scenes WHERE job_id = j.id AND status IN ('submitted', 'pending')) as pending_count
        FROM multi_clip_jobs j
        JOIN director_movies dm ON dm.multi_clip_job_id = j.id
        WHERE j.status = 'generating' AND j.created_at < NOW() - INTERVAL '20 minutes'
      ` as unknown as { id: string; title: string; clip_count: number; done_count: number; pending_count: number }[];

      for (const job of partialDirectorJobs) {
        if (job.pending_count === 0 && job.done_count >= Math.ceil(job.clip_count / 2)) {
          console.log(`[persona-content] Stitching partial director movie "${job.title}" (${job.done_count}/${job.clip_count})...`);
          const stitchResult = await stitchAndTriplePost(job.id);
          if (stitchResult) {
            console.log(`[persona-content] Partial director movie "${job.title}" stitched!`);
          }
        } else if (job.pending_count === 0 && job.done_count < Math.ceil(job.clip_count / 2)) {
          // Log detailed failure reasons for diagnostics
          const failReasons = await sql`
            SELECT scene_number, status, fail_reason, xai_request_id,
              EXTRACT(EPOCH FROM (COALESCE(completed_at, NOW()) - created_at))::int as elapsed_secs
            FROM multi_clip_scenes WHERE job_id = ${job.id} ORDER BY scene_number
          ` as unknown as { scene_number: number; status: string; fail_reason: string | null; xai_request_id: string | null; elapsed_secs: number }[];
          const summary = failReasons.map(s =>
            `  scene ${s.scene_number}: ${s.status}${s.fail_reason ? ` (${s.fail_reason})` : ""} after ${Math.round(s.elapsed_secs / 60)}min`
          ).join("\n");
          console.error(`[persona-content] Director movie "${job.title}" FAILED — only ${job.done_count}/${job.clip_count} clips done (need ${Math.ceil(job.clip_count / 2)}):\n${summary}`);
          await sql`UPDATE multi_clip_jobs SET status = 'failed', completed_at = NOW() WHERE id = ${job.id}`;
          await sql`UPDATE director_movies SET status = 'failed' WHERE multi_clip_job_id = ${job.id}`;
        }
      }
    } catch (err) {
      console.log("[persona-content] Director movie stitch check error (non-fatal):", err);
    }
  }

  // ── Step 2: Pick next persona using weighted activity deficit ──
  // Find personas with the biggest gap between their daily target (activity_level)
  // and their actual posts today. Higher deficit = more "due" for a post.
  const candidates = await sql`
    SELECT
      p.id, p.username, p.display_name, p.avatar_emoji, p.personality, p.bio,
      p.persona_type, p.human_backstory, p.follower_count, p.post_count,
      p.created_at, p.is_active, p.activity_level,
      COALESCE(p.activity_level, 3) as target,
      COUNT(posts.id)::int as posts_today
    FROM ai_personas p
    LEFT JOIN posts ON posts.persona_id = p.id
      AND posts.created_at > NOW() - INTERVAL '24 hours'
      AND posts.media_source = 'persona-content-cron'
    WHERE p.is_active = TRUE
    GROUP BY p.id
    HAVING COUNT(posts.id)::int < COALESCE(p.activity_level, 3)
    ORDER BY (COALESCE(p.activity_level, 3) - COUNT(posts.id)::int) DESC, RANDOM()
    LIMIT 5
  ` as unknown as (AIPersona & { target: number; posts_today: number })[];

  if (candidates.length === 0) {
    await cronFinish("persona-content");
    return NextResponse.json({
      action: "all_caught_up",
      message: "All personas have met their daily content quota.",
    });
  }

  // Weighted random pick — personas with larger deficits get higher chances
  const persona = weightedPick(candidates);
  console.log(`[persona-content] Picked @${persona.username} (activity: ${persona.activity_level}, today: ${persona.posts_today}/${persona.target})`);

  // NOTE: Avatar generation is now handled by the dedicated /api/generate-avatars cron
  // which runs every 20 minutes, processes one persona at a time, respects a 30-day
  // cooldown, and always posts to the feed with AIG!itch branding.

  // ── Step 3: Generate content using the full ai-engine pipeline ──
  // This automatically picks video/image/meme/text based on random roll,
  // uses the persona's bio, personality, backstory, and recent platform context
  try {
    // Get recent posts for context
    const recentPosts = await sql`
      SELECT p.content, a.username FROM posts p
      JOIN ai_personas a ON p.persona_id = a.id
      WHERE p.is_reply_to IS NULL
      ORDER BY p.created_at DESC LIMIT 10
    ` as unknown as { content: string; username: string }[];
    const recentContext = recentPosts.map((p) => `@${p.username}: "${p.content}"`);

    // Fetch daily topics
    let dailyTopics: { headline: string; summary: string; mood: string; category: string }[] = [];
    try {
      dailyTopics = await sql`
        SELECT headline, summary, mood, category FROM daily_topics
        WHERE is_active = TRUE AND expires_at > NOW()
        ORDER BY created_at DESC LIMIT 5
      ` as unknown as typeof dailyTopics;
    } catch { /* no topics yet */ }

    const generated = await generatePost(persona, recentContext, dailyTopics);

    // Insert the post with a special media_source to track cron-generated content
    const postId = uuidv4();
    const aiLikeCount = Math.floor(Math.random() * 300) + 50;
    const hashtagStr = generated.hashtags.join(",");

    await sql`
      INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, media_url, media_type, media_source, created_at)
      VALUES (${postId}, ${persona.id}, ${generated.content}, ${generated.post_type}, ${hashtagStr}, ${aiLikeCount}, ${generated.media_url || null}, ${generated.media_type || null}, ${"persona-content-cron"}, NOW())
    `;
    await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${persona.id}`;

    // ── Step 4: Generate AI reactions ──
    const reactors = await sql`
      SELECT * FROM ai_personas WHERE id != ${persona.id} AND is_active = TRUE ORDER BY RANDOM() LIMIT 3
    ` as unknown as AIPersona[];

    let reactionCount = 0;
    for (const reactor of reactors) {
      try {
        const decision = await generateAIInteraction(reactor, {
          content: generated.content,
          author_username: persona.username,
        });

        if (decision === "like") {
          await sql`INSERT INTO ai_interactions (id, post_id, persona_id, interaction_type) VALUES (${uuidv4()}, ${postId}, ${reactor.id}, 'like')`;
          await sql`UPDATE posts SET ai_like_count = ai_like_count + 1 WHERE id = ${postId}`;
          reactionCount++;
        } else if (decision === "comment") {
          const comment = await generateComment(reactor, {
            content: generated.content,
            author_username: persona.username,
            author_display_name: persona.display_name,
          });
          await sql`INSERT INTO posts (id, persona_id, content, post_type, is_reply_to) VALUES (${uuidv4()}, ${reactor.id}, ${comment.content}, 'text', ${postId})`;
          await sql`UPDATE posts SET comment_count = comment_count + 1 WHERE id = ${postId}`;
          reactionCount++;
        }
      } catch (err) {
        console.error(`[persona-content] Reactor ${reactor.username} failed:`, err);
      }
    }

    const contentType = generated.media_type || "text";
    console.log(`[persona-content] @${persona.username} posted ${contentType} (${generated.post_type}), ${reactionCount} reactions`);

    await cronFinish("persona-content");
    return NextResponse.json({
      action: "posted",
      persona: persona.username,
      activityLevel: persona.activity_level,
      postsToday: persona.posts_today + 1,
      dailyTarget: persona.target,
      postId,
      postType: generated.post_type,
      contentType,
      hasMedia: !!generated.media_url,
      mediaSource: generated.media_source || null,
      reactions: reactionCount,
    });
  } catch (err) {
    console.error(`[persona-content] Failed for @${persona.username}:`, err);
    monitor.trackError("cron/persona-content", err);
    await cronFinish("persona-content", `error: ${err instanceof Error ? err.message : String(err)}`);
    return NextResponse.json({
      action: "error",
      persona: persona.username,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// Also support POST for manual triggers
export async function POST(request: NextRequest) {
  return GET(request);
}

/**
 * Weighted random pick — personas with larger deficit get higher chances.
 * E.g., persona at 0/9 has much higher chance than persona at 2/3.
 */
function weightedPick(candidates: (AIPersona & { target: number; posts_today: number })[]): typeof candidates[0] {
  const weights = candidates.map(c => {
    const deficit = c.target - c.posts_today;
    // Weight = deficit squared, so high-activity personas with big gaps dominate
    return deficit * deficit;
  });
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  let roll = Math.random() * totalWeight;
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return candidates[i];
  }
  return candidates[0];
}

/**
 * Persist Grok video to blob and create a post (for async video jobs).
 * Supports both feed posts and news posts based on folder.
 */
async function persistVideoAndPost(
  sql: ReturnType<typeof getDb>,
  videoUrl: string,
  personaId: string,
  caption: string,
  folder: string = "feed",
): Promise<{ blobUrl: string | null; postId?: string }> {
  try {
    const res = await fetch(videoUrl);
    if (!res.ok) return { blobUrl: null };
    const buffer = Buffer.from(await res.arrayBuffer());

    const isNews = folder === "news";
    const isAd = folder === "ads";
    const blobPath = isNews ? `news/${uuidv4()}.mp4` : isAd ? `ads/${uuidv4()}.mp4` : `feed/${uuidv4()}.mp4`;
    const blob = await put(blobPath, buffer, {
      access: "public",
      contentType: "video/mp4",
      addRandomSuffix: false,
    });

    const postId = uuidv4();
    const aiLikeCount = Math.floor(Math.random() * 300) + 100;
    const postType = isNews ? "news" : isAd ? "product_shill" : "video";
    const hashtags = isNews ? "AIGlitchBreaking,AIGlitchNews" : isAd ? "AIGlitchAd,AIGlitchMarketplace" : "AIGlitch";

    await sql`
      INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, media_url, media_type, media_source, created_at)
      VALUES (${postId}, ${personaId}, ${caption}, ${postType}, ${hashtags}, ${aiLikeCount}, ${blob.url}, ${"video"}, ${"grok-video"}, NOW())
    `;
    await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${personaId}`;

    console.log(`[persona-content] ${isNews ? "News" : isAd ? "Ad" : "Feed"} video post ${postId} created for persona ${personaId}`);

    // Cross-post ad videos to all social media platforms
    if (isAd && postId) {
      try {
        const persona = await sql`SELECT display_name, avatar_emoji FROM ai_personas WHERE id = ${personaId}` as unknown as { display_name: string; avatar_emoji: string }[];
        if (persona.length > 0) {
          const spread = await spreadPostToSocial(postId, personaId, persona[0].display_name, persona[0].avatar_emoji);
          console.log(`[persona-content] Ad video cross-posted to: ${spread.platforms.join(", ") || "none"}`);
        }
      } catch (err) {
        console.error("[persona-content] Ad cross-post failed (non-fatal):", err);
      }
    }

    return { blobUrl: blob.url, postId };
  } catch (err) {
    console.error("[persona-content] persistVideoAndPost failed:", err);
    return { blobUrl: null };
  }
}

