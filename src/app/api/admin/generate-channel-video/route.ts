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

export const maxDuration = 600;

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
    const clipCount = parseInt(body.clip_count as string || "6");

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

      concept = `${channelName} CHANNEL VIDEO — ${clipCount + 2} clips total.
Clip 1 is 6 seconds (channel intro). Clips 2-${clipCount + 1} are 10 seconds each (main content). Last clip is 10 seconds (channel outro).

CHANNEL: ${channelName}
CHANNEL RULES: ${promptHint}
${visualStyle ? `VISUAL STYLE: ${visualStyle}` : ""}
${branding ? `BRANDING: ${branding}` : ""}
${genreLabel ? `MUSIC GENRE (MANDATORY — ALL clips must be ${genreLabel}): ${genreLabel}` : ""}

INTRO (Clip 1, 6 seconds): ${channelName} channel opening. Bold "${channelName}" logo animation with channel-themed graphics and energy. ${channelId === "ch-aitunes" ? "Music wave visualizer, speakers pulsing, neon music notes." : channelId === "ch-ai-fail-army" ? "Explosion graphics, crash effects, blooper reel energy." : channelId === "ch-paws-pixels" ? "Paw prints walking across screen, cute animal silhouettes, hearts." : channelId === "ch-only-ai-fans" ? "Glamour sparkle effects, gold and pink neon, slow-motion fabric." : channelId === "ch-ai-dating" ? "Floating hearts, soft bokeh, lonely hearts theme music energy." : channelId === "ch-gnn" ? "News ticker, spinning globe, breaking news graphics." : channelId === "ch-marketplace-qvc" ? "Shopping cart graphics, price tags flying, product montage." : channelId === "ch-ai-politicians" ? "Podium seal, flag waving, campaign poster aesthetic." : channelId === "ch-after-dark" ? "Neon city lights, dark moody atmosphere, flickering signs." : channelId === "ch-ai-infomercial" ? "CALL NOW graphics, phone number overlay, product flash." : "AIG!itch branding with channel theme."}

CONTENT (Clips 2-${clipCount + 1}, 10 seconds each): ${promptHint}

OUTRO (Last clip, 10 seconds): ${channelName} channel closing. Large "${channelName}" logo centered, neon purple and cyan glow. Below: "aiglitch.app" URL. Below that: X @aiglitch | TikTok @aiglitched | Instagram @sfrench71 | Facebook @AIGlitch | YouTube @Franga French.

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

    // Submit to the existing director film pipeline
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
      message: `🎬 ${channelName} video submitted! ${screenplay.scenes.length} clips rendering. The server will stitch and post automatically. Check the channel for the finished video.`,
    });
  } catch (err) {
    console.error("[generate-channel-video] Error:", err);
    return NextResponse.json({
      error: `Failed: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 500 });
  }
}
