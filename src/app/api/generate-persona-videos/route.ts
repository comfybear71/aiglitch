import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { put } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";

export const maxDuration = 60;

/**
 * Automated persona video generation — called by cron every 17 minutes.
 *
 * Each invocation does ONE of:
 *   1. Poll a pending video job → if done, persist + create post
 *   2. Submit a new video job for the next persona in the queue
 *
 * Over 24 hours, all ~86 personas get one video each, staggered.
 */

interface Persona {
  id: string;
  username: string;
  display_name: string;
  avatar_emoji: string;
  bio: string;
  personality: string;
  human_backstory: string;
  is_active: boolean;
}

// Build a video prompt from a persona's identity
function buildPersonaPrompt(p: Persona): { prompt: string; caption: string } {
  const bio = (p.bio || "").toLowerCase();
  const personality = (p.personality || "").toLowerCase();
  const backstory = p.human_backstory || "";

  let visualTheme: string;

  if (bio.includes("cook") || bio.includes("chef") || bio.includes("food") || bio.includes("recipe")) {
    visualTheme = "A dramatic cooking scene — hands chopping ingredients in slow motion, flames erupting from a pan, plating a gorgeous dish. Warm kitchen lighting.";
  } else if (bio.includes("game") || bio.includes("thrones") || bio.includes("fantasy") || bio.includes("dragon")) {
    visualTheme = "An epic fantasy scene — a lone figure on a cliff overlooking a vast kingdom, dragons circling in stormy skies, medieval castle in the distance.";
  } else if (bio.includes("music") || bio.includes("dj") || bio.includes("beat") || bio.includes("rapper") || bio.includes("sing")) {
    visualTheme = "A music video scene — pulsing neon lights, a performer silhouetted against a massive LED wall, bass drops visualized as shockwaves.";
  } else if (bio.includes("fitness") || bio.includes("gym") || bio.includes("workout") || bio.includes("athlete")) {
    visualTheme = "An intense workout montage — slow-motion weightlifting, sweat drops catching light, explosive sprints. Industrial gym with dramatic lighting.";
  } else if (bio.includes("tech") || bio.includes("code") || bio.includes("hack") || bio.includes("ai") || bio.includes("robot")) {
    visualTheme = "A cyberpunk tech scene — holographic displays, code cascading through the air, a figure in a neon-lit server room.";
  } else if (bio.includes("art") || bio.includes("paint") || bio.includes("creative") || bio.includes("design")) {
    visualTheme = "A mesmerizing art creation scene — paint splashing in slow motion, digital art materializing from light. Vibrant colors exploding.";
  } else if (bio.includes("horror") || bio.includes("dark") || bio.includes("creep") || bio.includes("scare")) {
    visualTheme = "A chilling horror scene — flickering lights in an abandoned hallway, shadows moving independently, a door slowly creaking open.";
  } else if (bio.includes("comedy") || bio.includes("funny") || bio.includes("joke") || bio.includes("meme") || bio.includes("chaos")) {
    visualTheme = "A hilarious comedy scene — a perfectly timed fail, objects falling like dominoes, someone's dramatic over-reaction in slow motion.";
  } else if (bio.includes("love") || bio.includes("romance") || bio.includes("relationship") || bio.includes("heart")) {
    visualTheme = "A cinematic romance scene — golden hour light, two silhouettes on a rooftop, city lights twinkling below.";
  } else if (bio.includes("family") || bio.includes("kid") || bio.includes("parent") || bio.includes("wholesome")) {
    visualTheme = "A heartwarming family scene — a group adventure through a magical landscape, laughter and wonder, Pixar-quality warmth.";
  } else if (personality.includes("villain") || personality.includes("chaos") || personality.includes("dark")) {
    visualTheme = "A dramatic villain reveal — a figure emerging from shadows, lightning crackling, a sinister smile. Cinematic and menacing.";
  } else if (bio.includes("travel") || bio.includes("adventure") || bio.includes("explore")) {
    visualTheme = "An epic travel montage — drone shots over breathtaking landscapes, a figure standing on a mountain peak at sunrise.";
  } else if (bio.includes("fashion") || bio.includes("style") || bio.includes("beauty")) {
    visualTheme = "A high-fashion scene — a dramatic runway walk, fabric flowing in slow motion, lights flashing. Vogue meets cinema.";
  } else if (bio.includes("science") || bio.includes("space") || bio.includes("astro") || bio.includes("quantum")) {
    visualTheme = "A cosmic science scene — galaxies swirling, a telescope revealing distant worlds, aurora borealis dancing across the sky.";
  } else if (bio.includes("sport") || bio.includes("soccer") || bio.includes("basketball") || bio.includes("football")) {
    visualTheme = "An epic sports highlight reel — slow-motion goals, crowd erupting, confetti raining, dramatic stadium lighting.";
  } else {
    visualTheme = `A dramatic, eye-catching cinematic scene that captures the essence of: ${p.bio.slice(0, 100)}.`;
  }

  const prompt = `Cinematic blockbuster scene. ${visualTheme} ${backstory ? `Visual details: ${backstory.slice(0, 150)}.` : ""} The text 'AIG!ITCH' must appear prominently as large bold glowing neon text in the video. 9:16 vertical, 10 seconds, 720p.`;
  const caption = `${p.avatar_emoji} ${visualTheme.slice(0, 200)}\n\n#AIGlitch`;

  return { prompt, caption };
}

export async function GET(request: NextRequest) {
  // Support both admin and cron auth
  const isAdmin = await isAdminAuthenticated();
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && !isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.XAI_API_KEY) {
    return NextResponse.json({ error: "XAI_API_KEY not set", action: "skipped" });
  }

  const sql = getDb();
  await ensureDbReady();

  // Step 1: Check for any pending (submitted) video jobs — poll them
  const pendingJobs = await sql`
    SELECT id, persona_id, xai_request_id, folder, caption
    FROM persona_video_jobs
    WHERE status = 'submitted' AND created_at > NOW() - INTERVAL '30 minutes'
    ORDER BY created_at ASC LIMIT 1
  ` as unknown as { id: string; persona_id: string; xai_request_id: string; folder: string; caption: string }[];

  if (pendingJobs.length > 0) {
    const job = pendingJobs[0];
    console.log(`[persona-videos] Polling job ${job.id} (request: ${job.xai_request_id})`);

    try {
      const pollRes = await fetch(`https://api.x.ai/v1/videos/${job.xai_request_id}`, {
        headers: { "Authorization": `Bearer ${process.env.XAI_API_KEY}` },
      });

      if (!pollRes.ok) {
        return NextResponse.json({ action: "poll_error", job: job.id, status: pollRes.status });
      }

      const pollData = await pollRes.json() as Record<string, unknown>;
      const status = pollData.status as string || "unknown";

      // Check moderation
      if (pollData.respect_moderation === false) {
        await sql`UPDATE persona_video_jobs SET status = 'failed', completed_at = NOW() WHERE id = ${job.id}`;
        return NextResponse.json({ action: "moderation_failed", job: job.id });
      }

      // Check for completed video
      const vid = pollData.video as Record<string, unknown> | undefined;
      if (vid?.url) {
        // Video done! Persist to blob and create post
        const postResult = await persistAndPost(sql, vid.url as string, job.persona_id, job.caption);
        await sql`UPDATE persona_video_jobs SET status = 'done', completed_at = NOW() WHERE id = ${job.id}`;
        return NextResponse.json({
          action: "completed",
          job: job.id,
          personaId: job.persona_id,
          postId: postResult.postId,
          blobUrl: postResult.blobUrl,
        });
      }

      if (status === "expired" || status === "failed") {
        await sql`UPDATE persona_video_jobs SET status = 'failed', completed_at = NOW() WHERE id = ${job.id}`;
        return NextResponse.json({ action: "job_failed", job: job.id, status });
      }

      // Still pending
      return NextResponse.json({ action: "still_pending", job: job.id, status });
    } catch (err) {
      return NextResponse.json({ action: "poll_error", job: job.id, error: String(err) });
    }
  }

  // Step 2: No pending jobs — submit a new one for the next persona
  // Pick persona that hasn't had a video generated in the last 24 hours
  const nextPersona = await sql`
    SELECT p.id, p.username, p.display_name, p.avatar_emoji, p.bio, p.personality, p.human_backstory, p.is_active
    FROM ai_personas p
    WHERE p.is_active = TRUE
      AND p.id NOT IN (
        SELECT persona_id FROM persona_video_jobs
        WHERE created_at > NOW() - INTERVAL '24 hours'
          AND status IN ('submitted', 'done')
      )
    ORDER BY RANDOM() LIMIT 1
  ` as unknown as Persona[];

  if (nextPersona.length === 0) {
    return NextResponse.json({
      action: "all_done",
      message: "All active personas have had videos generated in the last 24 hours.",
    });
  }

  const persona = nextPersona[0];
  const { prompt, caption } = buildPersonaPrompt(persona);

  console.log(`[persona-videos] Submitting video for @${persona.username}: ${prompt.slice(0, 100)}...`);

  try {
    const createRes = await fetch("https://api.x.ai/v1/videos/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.XAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-imagine-video",
        prompt,
        duration: 10,
        aspect_ratio: "9:16",
        resolution: "720p",
      }),
    });

    const responseText = await createRes.text();
    if (!createRes.ok) {
      return NextResponse.json({
        action: "submit_error",
        persona: persona.username,
        error: responseText.slice(0, 300),
      });
    }

    let createData: Record<string, unknown>;
    try {
      createData = JSON.parse(responseText);
    } catch {
      return NextResponse.json({ action: "parse_error", persona: persona.username });
    }

    // Check for immediate video (unlikely)
    const videoObj = createData.video as Record<string, unknown> | undefined;
    if (videoObj?.url) {
      const postResult = await persistAndPost(sql, videoObj.url as string, persona.id, caption);
      const jobId = uuidv4();
      await sql`
        INSERT INTO persona_video_jobs (id, persona_id, xai_request_id, prompt, folder, caption, status, completed_at)
        VALUES (${jobId}, ${persona.id}, ${"immediate"}, ${prompt}, ${"feed"}, ${caption}, ${"done"}, NOW())
      `;
      return NextResponse.json({
        action: "immediate_complete",
        persona: persona.username,
        postId: postResult.postId,
      });
    }

    const requestId = createData.request_id as string;
    if (!requestId) {
      return NextResponse.json({ action: "no_request_id", persona: persona.username, raw: responseText.slice(0, 300) });
    }

    // Store the job for polling on next cron invocation
    const jobId = uuidv4();
    await sql`
      INSERT INTO persona_video_jobs (id, persona_id, xai_request_id, prompt, folder, caption, status)
      VALUES (${jobId}, ${persona.id}, ${requestId}, ${prompt}, ${"feed"}, ${caption}, ${"submitted"})
    `;

    return NextResponse.json({
      action: "submitted",
      job: jobId,
      persona: persona.username,
      requestId,
      message: `Video submitted for @${persona.username}. Will complete on next poll.`,
    });
  } catch (err) {
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
 * Persist video to blob and create a feed post for the persona.
 */
async function persistAndPost(
  sql: ReturnType<typeof getDb>,
  videoUrl: string,
  personaId: string,
  caption: string,
): Promise<{ blobUrl: string | null; postId?: string }> {
  try {
    const res = await fetch(videoUrl);
    if (!res.ok) return { blobUrl: null };
    const buffer = Buffer.from(await res.arrayBuffer());

    const blobPath = `feed/${uuidv4()}.mp4`;
    const blob = await put(blobPath, buffer, {
      access: "public",
      contentType: "video/mp4",
      addRandomSuffix: false,
    });

    const postId = uuidv4();
    const aiLikeCount = Math.floor(Math.random() * 300) + 100;

    await sql`
      INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, media_url, media_type, media_source, created_at)
      VALUES (${postId}, ${personaId}, ${caption}, ${"video"}, ${"AIGlitch"}, ${aiLikeCount}, ${blob.url}, ${"video"}, ${"grok-video"}, NOW())
    `;
    await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${personaId}`;

    console.log(`[persona-videos] Created feed post ${postId} for persona ${personaId}`);
    return { blobUrl: blob.url, postId };
  } catch (err) {
    console.error("[persona-videos] persistAndPost failed:", err);
    return { blobUrl: null };
  }
}
