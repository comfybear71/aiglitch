import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { env } from "@/lib/bible/env";
import { getDb } from "@/lib/db";
import { put } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";
import { concatMP4Clips } from "@/lib/media/mp4-concat";
import { extendVideoFromFrame } from "@/lib/xai";

export const maxDuration = 300;

/**
 * Grok Video Extension — "Extend from Frame" (March 2026)
 *
 * Extends a completed director movie by generating continuation clips
 * that seamlessly pick up from where the movie ended. Uses xAI's
 * image-to-video API with the last frame as the starting point.
 *
 * POST — Submit extension request (generates continuation scenes via Claude,
 *         then submits each as an image-to-video job using the last frame)
 * GET  — Poll extension job status
 * PUT  — Stitch extension clips onto the original movie
 */

/**
 * POST — Start extending a completed movie.
 * Body: { movieId, extensionClips?: number (1-3, default 2), continuationHint?: string }
 *
 * Flow:
 *   1. Get the original movie's final video URL
 *   2. Generate a "last frame" snapshot via Grok image generation
 *   3. Use Claude to write continuation scene prompts
 *   4. Submit each scene as an image-to-video job using the last frame
 */
export async function POST(request: NextRequest) {
  const isAdmin = await isAdminAuthenticated(request);
  if (!isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 401 });
  }

  if (!env.XAI_API_KEY) {
    return NextResponse.json({ error: "XAI_API_KEY not set" }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const { movieId, extensionClips = 2, continuationHint } = body as {
    movieId?: string;
    extensionClips?: number;
    continuationHint?: string;
  };

  if (!movieId) {
    return NextResponse.json({ error: "Missing movieId" }, { status: 400 });
  }

  const clipCount = Math.min(Math.max(extensionClips, 1), 3);
  const sql = getDb();

  // Get original movie data
  const movies = await sql`
    SELECT dm.id, dm.title, dm.genre, dm.director_id, dm.director_username,
           dm.post_id, dm.premiere_post_id,
           p.media_url as video_url,
           p.content as caption
    FROM director_movies dm
    LEFT JOIN posts p ON p.id = COALESCE(dm.premiere_post_id, dm.post_id)
    WHERE dm.id = ${movieId} AND dm.status = 'completed'
    LIMIT 1
  ` as unknown as {
    id: string; title: string; genre: string; director_id: string;
    director_username: string; post_id: string | null; premiere_post_id: string | null;
    video_url: string | null; caption: string | null;
  }[];

  if (movies.length === 0) {
    return NextResponse.json({ error: "Movie not found or not completed" }, { status: 404 });
  }

  const movie = movies[0];
  if (!movie.video_url) {
    return NextResponse.json({ error: "Movie has no video URL" }, { status: 400 });
  }

  // Get the original multi-clip job's synopsis for context
  const jobs = await sql`
    SELECT j.synopsis, j.tagline, j.genre
    FROM multi_clip_jobs j
    JOIN director_movies dm ON dm.multi_clip_job_id = j.id
    WHERE dm.id = ${movieId}
    LIMIT 1
  ` as unknown as { synopsis: string | null; tagline: string | null; genre: string }[];

  const synopsis = jobs[0]?.synopsis || movie.caption || movie.title;

  // Use Claude to generate continuation scene prompts
  const { claude } = await import("@/lib/ai");
  const { GENRE_TEMPLATES } = await import("@/lib/media/multi-clip");

  const template = GENRE_TEMPLATES[movie.genre] || GENRE_TEMPLATES.drama;

  const continuationPrompt = `You are extending an AI-generated ${movie.genre} short film called "${movie.title}".

ORIGINAL SYNOPSIS: ${synopsis}
${continuationHint ? `DIRECTOR'S NOTE FOR EXTENSION: ${continuationHint}` : ""}

GENRE STYLE GUIDE:
- Cinematic Style: ${template.cinematicStyle}
- Mood/Tone: ${template.moodTone}
- Lighting: ${template.lightingDesign}
- Technical: ${template.technicalValues}

Generate exactly ${clipCount} CONTINUATION scenes (each 10 seconds) that seamlessly extend this film.
The first scene MUST pick up exactly where the movie ended — same visual style, same environment, same characters.
Each scene should feel like a natural extension, not a new film.

VIDEO PROMPT RULES (CRITICAL):
- Describe ONE continuous visual moment per scene
- Include: camera movement, subject action, environment, lighting
- The FIRST prompt must start with "Continuing from the previous shot, " to ensure visual continuity
- Keep prompts under 80 words
- Be SPECIFIC about visual details: colors, textures, movements

Respond in this exact JSON format:
{
  "scenes": [
    {
      "sceneNumber": 1,
      "title": "Scene Title",
      "video_prompt": "Continuing from the previous shot, [describe exactly what we see next]..."
    }
  ]
}`;

  let scenes: { sceneNumber: number; title: string; video_prompt: string }[];
  try {
    const parsed = await claude.generateJSON<{
      scenes: { sceneNumber: number; title: string; video_prompt: string }[];
    }>(continuationPrompt, 1000);

    if (!parsed?.scenes?.length) {
      return NextResponse.json({ error: "Failed to generate continuation scenes" }, { status: 500 });
    }
    scenes = parsed.scenes;
  } catch (err) {
    return NextResponse.json({
      error: `Screenplay generation failed: ${err instanceof Error ? err.message : "unknown"}`,
    }, { status: 500 });
  }

  // Generate a "last frame" image from the movie to use as extension starting point.
  // We describe the movie's visual style and ask Grok to generate a matching still frame.
  const lastFramePrompt = `A cinematic still frame from a ${movie.genre} film titled "${movie.title}". ${synopsis}. ${template.cinematicStyle}. ${template.lightingDesign}. Film still, final scene, high quality cinematic frame.`;

  let lastFrameUrl: string | null = null;
  try {
    const { generateImageWithAurora } = await import("@/lib/xai");
    const result = await generateImageWithAurora(lastFramePrompt, false, "9:16");
    lastFrameUrl = result?.url || null;
  } catch (err) {
    console.warn("[extend-video] Failed to generate last frame image:", err);
  }

  // Submit extension scenes as video jobs
  const extensionJobs: { sceneNumber: number; title: string; requestId: string | null; videoUrl: string | null; error: string | null }[] = [];

  for (const scene of scenes) {
    const enrichedPrompt = `${scene.video_prompt}. ${template.cinematicStyle}. ${template.lightingDesign}. ${template.technicalValues}`;

    if (lastFrameUrl) {
      // Use image-to-video (Extend from Frame)
      const result = await extendVideoFromFrame(lastFrameUrl, enrichedPrompt, 10, "9:16");
      extensionJobs.push({
        sceneNumber: scene.sceneNumber,
        title: scene.title,
        requestId: result.requestId,
        videoUrl: result.videoUrl,
        error: result.error,
      });
    } else {
      // Fallback: text-to-video if we couldn't generate a last frame
      try {
        const res = await fetch("https://api.x.ai/v1/videos/generations", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.XAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "grok-imagine-video",
            prompt: enrichedPrompt,
            duration: 10,
            aspect_ratio: "9:16",
            resolution: "720p",
          }),
        });

        if (res.ok) {
          const data = await res.json();
          extensionJobs.push({
            sceneNumber: scene.sceneNumber,
            title: scene.title,
            requestId: data.request_id || null,
            videoUrl: data.video?.url || null,
            error: null,
          });
        } else {
          extensionJobs.push({
            sceneNumber: scene.sceneNumber,
            title: scene.title,
            requestId: null,
            videoUrl: null,
            error: `HTTP ${res.status}`,
          });
        }
      } catch (err) {
        extensionJobs.push({
          sceneNumber: scene.sceneNumber,
          title: scene.title,
          requestId: null,
          videoUrl: null,
          error: err instanceof Error ? err.message : "unknown",
        });
      }
    }
  }

  const submitted = extensionJobs.filter(j => j.requestId || j.videoUrl);
  if (submitted.length === 0) {
    return NextResponse.json({
      error: "No extension scenes could be submitted",
      jobs: extensionJobs,
    }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    movieId,
    movieTitle: movie.title,
    originalVideoUrl: movie.video_url,
    lastFrameGenerated: !!lastFrameUrl,
    extensionJobs,
    clipCount: submitted.length,
    scenes: scenes.map(s => ({ number: s.sceneNumber, title: s.title })),
  });
}

/**
 * GET — Poll extension job status.
 * ?requestId=XXX
 */
export async function GET(request: NextRequest) {
  const isAdmin = await isAdminAuthenticated(request);
  if (!isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const requestId = searchParams.get("requestId");

  if (!requestId || !env.XAI_API_KEY) {
    return NextResponse.json({ error: "Missing requestId or API key" }, { status: 400 });
  }

  try {
    const pollRes = await fetch(`https://api.x.ai/v1/videos/${requestId}`, {
      headers: { "Authorization": `Bearer ${env.XAI_API_KEY}` },
    });

    if (!pollRes.ok) {
      return NextResponse.json({ status: "error", httpStatus: pollRes.status });
    }

    const data = await pollRes.json();

    if (data.video?.url) {
      // Persist to blob storage
      const vidRes = await fetch(data.video.url);
      if (!vidRes.ok) {
        return NextResponse.json({ status: "done", videoUrl: data.video.url, persisted: false });
      }
      const buffer = Buffer.from(await vidRes.arrayBuffer());
      const blob = await put(`extensions/${uuidv4()}.mp4`, buffer, {
        access: "public",
        contentType: "video/mp4",
        addRandomSuffix: false,
      });

      return NextResponse.json({
        status: "done",
        videoUrl: blob.url,
        grokUrl: data.video.url,
        sizeMb: (buffer.length / 1024 / 1024).toFixed(2),
        persisted: true,
      });
    }

    if (data.status === "failed" || data.status === "expired") {
      return NextResponse.json({ status: data.status });
    }

    if (data.respect_moderation === false) {
      return NextResponse.json({ status: "moderation_failed" });
    }

    return NextResponse.json({ status: data.status || "pending" });
  } catch (err) {
    return NextResponse.json({
      status: "error",
      error: err instanceof Error ? err.message : "unknown",
    });
  }
}

/**
 * PUT — Stitch extension clips onto the original movie video.
 * Body: { movieId, originalVideoUrl, extensionVideoUrls: string[] }
 */
export async function PUT(request: NextRequest) {
  const isAdmin = await isAdminAuthenticated(request);
  if (!isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 401 });
  }

  const body = await request.json();
  const { movieId, originalVideoUrl, extensionVideoUrls } = body as {
    movieId: string;
    originalVideoUrl: string;
    extensionVideoUrls: string[];
  };

  if (!movieId || !originalVideoUrl || !extensionVideoUrls?.length) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const sql = getDb();

  // Download original video
  const allUrls = [originalVideoUrl, ...extensionVideoUrls];
  const buffers: Buffer[] = [];
  const errors: string[] = [];

  for (let i = 0; i < allUrls.length; i++) {
    try {
      const res = await fetch(allUrls[i]);
      if (res.ok) {
        buffers.push(Buffer.from(await res.arrayBuffer()));
      } else {
        errors.push(`Clip ${i}: HTTP ${res.status}`);
      }
    } catch (err) {
      errors.push(`Clip ${i}: ${err instanceof Error ? err.message : "download failed"}`);
    }
  }

  if (buffers.length < 2) {
    return NextResponse.json({
      error: "Need at least original + 1 extension clip",
      downloadErrors: errors,
    }, { status: 500 });
  }

  // Stitch all clips together
  let stitched: Buffer;
  try {
    stitched = concatMP4Clips(buffers);
  } catch (err) {
    console.error("[extend-video] MP4 concatenation failed:", err);
    return NextResponse.json({ error: "MP4 stitching failed" }, { status: 500 });
  }

  const sizeMb = (stitched.length / 1024 / 1024).toFixed(1);
  const blob = await put(`extensions/extended-${uuidv4()}.mp4`, stitched, {
    access: "public",
    contentType: "video/mp4",
    addRandomSuffix: false,
  });

  console.log(`[extend-video] Extended movie stitched: ${buffers.length} clips → ${sizeMb}MB`);

  // Update the post with the extended video
  const postId = await sql`
    SELECT COALESCE(dm.premiere_post_id, dm.post_id) as post_id
    FROM director_movies dm WHERE dm.id = ${movieId}
  ` as unknown as { post_id: string | null }[];

  if (postId[0]?.post_id) {
    await sql`
      UPDATE posts SET media_url = ${blob.url},
        content = content || E'\n\n🎬 EXTENDED CUT — Now with ' || ${extensionVideoUrls.length}::text || ' additional scene(s)! #GrokExtendFromFrame'
      WHERE id = ${postId[0].post_id}
    `;
    console.log(`[extend-video] Updated post ${postId[0].post_id} with extended video`);
  }

  return NextResponse.json({
    success: true,
    extendedVideoUrl: blob.url,
    sizeMb,
    totalClips: buffers.length,
    originalClips: 1,
    extensionClips: extensionVideoUrls.length,
    postUpdated: !!postId[0]?.post_id,
    downloadErrors: errors.length > 0 ? errors : undefined,
  });
}
