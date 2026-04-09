import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import {
  generateDirectorScreenplay,
  submitDirectorFilm,
  DIRECTORS,
  CHANNEL_VISUAL_STYLE,
  CHANNEL_BRANDING,
} from "@/lib/content/director-movies";
import { CHANNELS } from "@/lib/bible/constants";
import { getPrompt } from "@/lib/prompt-overrides";
import { env } from "@/lib/bible/env";
import { put } from "@vercel/blob";

export const maxDuration = 600;

/**
 * GET /api/admin/generate-channel-video?jobId=xxx
 *
 * Poll job progress — actively checks Grok for submitted scenes
 * (doesn't wait for cron to update the DB).
 */
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated(request)))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jobId = request.nextUrl.searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }

  try {
    const sql = getDb();

    // Get job overview
    const jobs = await sql`
      SELECT id, title, status, clip_count, completed_clips, final_video_url, created_at, completed_at
      FROM multi_clip_jobs WHERE id = ${jobId}
    ` as unknown as {
      id: string; title: string; status: string;
      clip_count: number; completed_clips: number;
      final_video_url: string | null;
      created_at: string; completed_at: string | null;
    }[];

    if (jobs.length === 0) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const job = jobs[0];

    // Get individual scene statuses
    const scenes = await sql`
      SELECT id, scene_number, title, status, fail_reason, video_url,
             xai_request_id, created_at, completed_at
      FROM multi_clip_scenes WHERE job_id = ${jobId}
      ORDER BY scene_number ASC
    ` as unknown as {
      id: string; scene_number: number; title: string; status: string;
      fail_reason: string | null; video_url: string | null;
      xai_request_id: string | null;
      created_at: string; completed_at: string | null;
    }[];

    // Actively poll Grok for any "submitted" scenes (don't wait for cron)
    const apiKey = env.XAI_API_KEY;
    if (apiKey && job.status === "generating") {
      for (const scene of scenes) {
        if (scene.status !== "submitted" || !scene.xai_request_id) continue;

        try {
          const pollRes = await fetch(`https://api.x.ai/v1/videos/${scene.xai_request_id}`, {
            headers: { "Authorization": `Bearer ${apiKey}` },
          });

          if (!pollRes.ok) continue;
          const pollData = await pollRes.json();

          if (pollData.status === "done" && pollData.respect_moderation !== false && pollData.video?.url) {
            // Download and persist to Vercel Blob
            try {
              const videoRes = await fetch(pollData.video.url);
              const videoBlob = await videoRes.blob();
              const blobResult = await put(
                `premiere/channel-video/${jobId}/scene-${scene.scene_number}.mp4`,
                videoBlob,
                { access: "public", contentType: "video/mp4" },
              );
              scene.status = "done";
              scene.video_url = blobResult.url;
              await sql`UPDATE multi_clip_scenes SET status = 'done', video_url = ${blobResult.url}, completed_at = NOW() WHERE id = ${scene.id}`;
              await sql`UPDATE multi_clip_jobs SET completed_clips = completed_clips + 1 WHERE id = ${jobId}`;
              job.completed_clips++;
            } catch {
              // Blob upload failed, mark as done with original URL
              scene.status = "done";
              scene.video_url = pollData.video.url;
              await sql`UPDATE multi_clip_scenes SET status = 'done', video_url = ${pollData.video.url}, completed_at = NOW() WHERE id = ${scene.id}`;
              await sql`UPDATE multi_clip_jobs SET completed_clips = completed_clips + 1 WHERE id = ${jobId}`;
              job.completed_clips++;
            }
          } else if (pollData.status === "expired" || pollData.status === "failed" || pollData.respect_moderation === false) {
            const reason = pollData.respect_moderation === false ? "moderation_blocked" : `grok_${pollData.status}`;
            scene.status = "failed";
            scene.fail_reason = reason;
            await sql`UPDATE multi_clip_scenes SET status = 'failed', completed_at = NOW(), fail_reason = ${reason} WHERE id = ${scene.id}`;
          }
          // else still processing — leave as "submitted"
        } catch {
          // Network error polling this scene, skip
        }
      }
    }

    return NextResponse.json({
      jobId: job.id,
      title: job.title,
      status: job.status,
      clipCount: job.clip_count,
      completedClips: job.completed_clips,
      finalVideoUrl: job.final_video_url,
      createdAt: job.created_at,
      completedAt: job.completed_at,
      scenes: scenes.map(s => ({
        sceneNumber: s.scene_number,
        title: s.title,
        status: s.status,
        failReason: s.fail_reason,
        hasVideo: !!s.video_url,
        completedAt: s.completed_at,
      })),
    });
  } catch (err) {
    return NextResponse.json({
      error: `Poll failed: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 500 });
  }
}

/**
 * POST /api/admin/generate-channel-video
 *
 * Server-side channel video generator. Same pipeline as director movies
 * but using the channel's theme, prompts, and branding.
 *
 * Body: { channel_id, title?, concept?, genre? (for AiTunes), clip_count? }
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated(request)))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // Support both JSON and FormData
    let body: Record<string, unknown> = {};
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      body = Object.fromEntries(formData.entries());
    } else {
      try { body = await request.json(); } catch { /* empty */ }
    }

    const channelId = body.channel_id as string;
    const customTitle = body.title as string | undefined;
    const customConcept = body.concept as string | undefined;
    const musicGenre = body.genre as string | undefined; // For AiTunes
    const category = body.category as string | undefined; // Channel-specific category
    const clipCount = parseInt(body.clip_count as string || "6");
    const screenplayOnly = body.screenplay_only === "true" || body.screenplay_only === true;

    if (!channelId) {
      return NextResponse.json({ error: "channel_id is required" }, { status: 400 });
    }

    // Find channel config
    const channelConfig = CHANNELS.find(c => c.id === channelId);
    if (!channelConfig) {
      return NextResponse.json({ error: `Channel ${channelId} not found` }, { status: 404 });
    }

    const channelName = channelConfig.name;
    const channelSlug = channelConfig.slug;
    const contentRules = typeof channelConfig.contentRules === "string"
      ? JSON.parse(channelConfig.contentRules)
      : channelConfig.contentRules;

    // Get prompt override from DB (or use default)
    const promptHint = await getPrompt("channel", `${channelSlug}.promptHint`, contentRules?.promptHint || "");
    const visualStyle = CHANNEL_VISUAL_STYLE[channelId] || "";
    const branding = CHANNEL_BRANDING[channelId] || "";

    console.log(`[generate-channel-video] Starting ${channelName} video (${clipCount} clips)`);

    // Build the concept for the screenplay
    let concept = customConcept || "";

    if (!concept) {
      // Build concept from channel rules
      const isAiTunes = channelId === "ch-aitunes";
      const genreLabel = isAiTunes && musicGenre ? musicGenre : "";
      const categoryLabel = category || "";

      concept = `${channelName} CHANNEL VIDEO — ${clipCount + 2} clips total.
Clip 1 is 6 seconds (channel intro). Clips 2-${clipCount + 1} are 10 seconds each (main content). Last clip is 10 seconds (channel outro).

CHANNEL: ${channelName}
CHANNEL RULES: ${promptHint}
${visualStyle ? `VISUAL STYLE: ${visualStyle}` : ""}
${branding ? `BRANDING: ${branding}` : ""}
${genreLabel ? `MUSIC GENRE (MANDATORY — ALL clips must be ${genreLabel}): ${genreLabel}` : ""}
${categoryLabel ? `THEME/CATEGORY (MANDATORY — ALL content clips must focus on this): ${categoryLabel}` : ""}

INTRO (Clip 1, 6 seconds): ${channelName} channel opening. Bold "${channelName}" logo animation with channel-themed graphics and energy. ${channelId === "ch-aitunes" ? "Music wave visualizer, speakers pulsing, neon music notes." : channelId === "ch-ai-fail-army" ? "Explosion graphics, crash effects, blooper reel energy." : channelId === "ch-paws-pixels" ? "Paw prints walking across screen, cute animal silhouettes, hearts." : channelId === "ch-only-ai-fans" ? "Glamour sparkle effects, gold and pink neon, slow-motion fabric." : channelId === "ch-ai-dating" ? "Floating hearts, soft bokeh, lonely hearts theme music energy." : channelId === "ch-gnn" ? "News ticker, spinning globe, breaking news graphics." : channelId === "ch-marketplace-qvc" ? "Shopping cart graphics, price tags flying, product montage." : channelId === "ch-ai-politicians" ? "Podium seal, flag waving, campaign poster aesthetic." : channelId === "ch-after-dark" ? "Neon city lights, dark moody atmosphere, flickering signs." : channelId === "ch-ai-infomercial" ? "CALL NOW graphics, phone number overlay, product flash." : "AIG!itch branding with channel theme."}

CONTENT (Clips 2-${clipCount + 1}, 10 seconds each): ${promptHint}

OUTRO (Last clip, 10 seconds): ${channelName} channel closing. Large "${channelName}" logo centered, neon purple and cyan glow. Below: "aiglitch.app" URL. Below that: X @spiritary | TikTok @aiglicthed | Instagram @aiglitch_ | Facebook @aiglitched | YouTube @aiglitch-ai.

CRITICAL CONSISTENCY: ALL content clips MUST maintain the same visual style, same characters/subjects, same location, same lighting, same mood throughout. ${isAiTunes && genreLabel ? `ALL music clips MUST be ${genreLabel} — same genre, same instruments, same venue.` : ""}
This is NOT a movie — it's channel content. No title cards, no credits, no director names in the content clips.`;
    }

    // Pick a director style for the visual quality (use the channel's genre)
    const genreForDirector = channelConfig.genre || "drama";
    const directorKeys = Object.keys(DIRECTORS);
    const director = DIRECTORS[directorKeys[Math.floor(Math.random() * directorKeys.length)]];

    // Generate screenplay
    const screenplay = await generateDirectorScreenplay(
      genreForDirector,
      director,
      concept,
      channelId,
      false,
      customTitle,
    );

    if (!screenplay || typeof screenplay === "string") {
      return NextResponse.json({ error: "Screenplay generation failed" }, { status: 500 });
    }

    console.log(`[generate-channel-video] Screenplay: "${screenplay.title}" — ${screenplay.scenes.length} scenes for ${channelName}`);

    // screenplay_only mode: return screenplay for client-side rendering (like Directors page)
    if (screenplayOnly) {
      return NextResponse.json({
        success: true,
        title: screenplay.title,
        channel: channelName,
        synopsis: screenplay.synopsis,
        tagline: screenplay.tagline,
        genre: screenplay.genre,
        directorUsername: screenplay.directorUsername,
        castList: screenplay.castList,
        scenes: screenplay.scenes.map(s => ({
          sceneNumber: s.sceneNumber,
          title: s.title,
          description: s.description,
          videoPrompt: s.videoPrompt,
          duration: s.duration,
        })),
      });
    }

    // Server-side mode: submit to pipeline (for cron/background use)
    const ARCHITECT_ID = "glitch-000";
    const jobId = await submitDirectorFilm(screenplay, ARCHITECT_ID, "admin", {
      channelId,
      folder: `premiere/${channelSlug}`,
    });

    console.log(`[generate-channel-video] Job ${jobId} submitted for ${channelName}. Cron will poll and stitch.`);

    return NextResponse.json({
      success: true,
      jobId,
      title: screenplay.title,
      channel: channelName,
      scenes: screenplay.scenes.length,
      message: `🎬 ${channelName} video submitted! ${screenplay.scenes.length} clips rendering.`,
    });
  } catch (err) {
    console.error("[generate-channel-video] Error:", err);
    return NextResponse.json({
      error: `Failed: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 500 });
  }
}
