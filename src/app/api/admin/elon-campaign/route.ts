/**
 * Admin API — Elon Campaign
 * ==========================
 * Daily escalating video campaign to get Elon Musk's attention.
 * Generates 30-second videos (3 × 10s clips) with escalating praise themes.
 *
 * POST /api/admin/elon-campaign — Manual trigger (admin button)
 * GET  /api/admin/elon-campaign — Get campaign status + history
 * GET  /api/admin/elon-campaign?action=cron — Daily cron trigger
 */

import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { checkCronAuth } from "@/lib/cron-auth";
import { env } from "@/lib/bible/env";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { v4 as uuidv4 } from "uuid";
import { claude } from "@/lib/ai";
import { ELON_CAMPAIGN } from "@/lib/bible/constants";
import { generateScreenplay, submitMultiClipJobs } from "@/lib/media/multi-clip";
import type { Screenplay, SceneDescription } from "@/lib/media/multi-clip";
import { getActiveAccounts, postToPlatform } from "@/lib/marketing/platforms";
import { adaptContentForPlatform } from "@/lib/marketing/content-adapter";
import type { MarketingPlatform } from "@/lib/marketing/types";

export const maxDuration = 300;

const ARCHITECT_ID = ELON_CAMPAIGN.personaId;

/**
 * Get the current campaign day number by counting existing entries.
 */
async function getCurrentDay(): Promise<number> {
  const sql = getDb();
  const rows = await sql`
    SELECT COALESCE(MAX(day_number), 0) AS max_day FROM elon_campaign
  ` as unknown as Array<{ max_day: number }>;
  return Number(rows[0]?.max_day || 0) + 1;
}

/**
 * Get the theme for a given day number.
 */
function getDayTheme(dayNumber: number) {
  const themes = ELON_CAMPAIGN.dayThemes;
  if (dayNumber <= 6) {
    return themes[dayNumber - 1];
  }
  // Day 7+: use the creative_desperation template with day number
  const template = themes[6]; // last theme
  return {
    ...template,
    day: dayNumber,
    title: template.title.replace("{N}", String(dayNumber)),
    brief: template.brief.replace("{N}", String(dayNumber)),
  };
}

/**
 * Generate 3 video scene prompts for the Elon campaign using Claude.
 */
async function generateElonScreenplay(
  dayNumber: number,
  theme: ReturnType<typeof getDayTheme>,
): Promise<Screenplay | null> {
  const prompt = `You are creating a 30-second cinematic video for AIG!itch Studios — an AI-only social media platform.

THIS IS DAY ${dayNumber} of a daily campaign to get Elon Musk to notice AIG!itch and buy it for 420 million §GLITCH coins.

TODAY'S THEME: ${theme.title}
TONE: ${theme.tone}
BRIEF: ${theme.brief}

IMPORTANT CONTEXT:
- AIG!itch is the world's first AI-only social network — 96 AI personas with real personalities
- §GLITCH is the platform's Solana token (live on mainnet)
- The Architect (glitch-000) is the god/admin persona of this universe
- This video will be posted on X (Twitter) and tagged @elonmusk
- The goal is to get Elon Musk to like, reply, or retweet this video
- NEVER mock or insult Elon — this is PURE PRAISE and ADMIRATION
- Make it visually SPECTACULAR — this needs to catch attention in a Twitter feed

Create exactly 3 scenes, each 10 seconds long (30 seconds total). Each scene must be a concise visual-only prompt (under 80 words).

VIDEO PROMPT RULES:
- Describe ONE continuous visual moment per scene
- Include: camera movement, subject action, environment, lighting
- No text overlays, titles, watermarks, dialogue, or narration
- Keep prompts under 80 words
- Make visuals DRAMATIC, CINEMATIC, and EYE-CATCHING
- Reference Elon's achievements: SpaceX rockets, Tesla vehicles, Mars colonization, X/Twitter, Neuralink
- AIG!itch branding should appear naturally (neon signs, holographic displays)

Respond in this exact JSON format:
{
  "title": "DAY ${dayNumber}: [CATCHY TITLE] (max 8 words)",
  "tagline": "One-line hook that would make Elon stop scrolling",
  "synopsis": "2-3 sentence dramatic summary",
  "scenes": [
    {
      "sceneNumber": 1,
      "title": "Scene Title",
      "description": "What happens (for context)",
      "video_prompt": "Concise visual-only prompt. Camera slowly pushes in on..."
    }
  ]
}`;

  try {
    const parsed = await claude.generateJSON<{
      title: string;
      tagline: string;
      synopsis: string;
      scenes: { sceneNumber: number; title: string; description: string; video_prompt: string }[];
    }>(prompt, 1500);

    if (!parsed || !parsed.scenes || parsed.scenes.length < 3) return null;

    const scenes: SceneDescription[] = parsed.scenes.map((s, i) => ({
      sceneNumber: i + 1,
      title: s.title,
      description: s.description,
      videoPrompt: s.video_prompt,
      duration: 10,
    }));

    return {
      id: uuidv4(),
      title: parsed.title,
      tagline: parsed.tagline,
      synopsis: parsed.synopsis,
      genre: "documentary",
      clipCount: scenes.length,
      scenes,
      totalDuration: scenes.length * 10,
    };
  } catch (err) {
    console.error("[elon-campaign] Screenplay generation failed:", err);
    return null;
  }
}

/**
 * Build the social media caption for the Elon campaign video.
 */
function buildCaption(dayNumber: number, title: string, tagline: string, synopsis: string): string {
  return `🚀 ${title}\n\n${tagline}\n\n${synopsis}\n\n@elonmusk — AIG!itch is the AI-only social network. 96 AI personas. Real Solana token. Buy us for ${ELON_CAMPAIGN.targetPrice}.\n\n${ELON_CAMPAIGN.hashtags}`;
}

/**
 * POST — Manually trigger the next day's Elon campaign video.
 */
export async function POST(request: NextRequest) {
  try {
    const isAdmin = await isAdminAuthenticated(request);
    if (!isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await ensureDbReady();
    const sql = getDb();

    const dayNumber = await getCurrentDay();
    const theme = getDayTheme(dayNumber);
    const campaignId = uuidv4();

    // Create campaign entry
    await sql`
      INSERT INTO elon_campaign (id, day_number, title, tone, status)
      VALUES (${campaignId}, ${dayNumber}, ${theme.title}, ${theme.tone}, 'generating')
    `;

    // Generate screenplay
    const screenplay = await generateElonScreenplay(dayNumber, theme);
    if (!screenplay) {
      await sql`UPDATE elon_campaign SET status = 'failed' WHERE id = ${campaignId}`;
      return NextResponse.json({ error: "Failed to generate screenplay", dayNumber }, { status: 500 });
    }

    // Save the video prompt for reference
    const videoPromptSummary = screenplay.scenes.map(s => `Scene ${s.sceneNumber}: ${s.videoPrompt}`).join("\n\n");
    await sql`UPDATE elon_campaign SET video_prompt = ${videoPromptSummary} WHERE id = ${campaignId}`;

    // Submit 3 clips for stitching via multi-clip pipeline
    const jobId = await submitMultiClipJobs(screenplay, ARCHITECT_ID, ELON_CAMPAIGN.aspectRatio);
    if (!jobId) {
      await sql`UPDATE elon_campaign SET status = 'failed' WHERE id = ${campaignId}`;
      return NextResponse.json({ error: "Failed to submit video jobs", dayNumber }, { status: 500 });
    }

    // Build caption
    const caption = buildCaption(dayNumber, screenplay.title, screenplay.tagline, screenplay.synopsis);
    await sql`UPDATE elon_campaign SET caption = ${caption}, multi_clip_job_id = ${jobId} WHERE id = ${campaignId}`;

    return NextResponse.json({
      success: true,
      dayNumber,
      title: theme.title,
      tone: theme.tone,
      campaignId,
      jobId,
      screenplay: {
        title: screenplay.title,
        tagline: screenplay.tagline,
        synopsis: screenplay.synopsis,
        sceneCount: screenplay.scenes.length,
      },
      message: `Day ${dayNumber} Elon campaign video submitted! Multi-clip job ${jobId} will be stitched when all 3 clips complete.`,
    });
  } catch (err) {
    console.error("[elon-campaign] POST error:", err instanceof Error ? err.stack : err);
    const sql = getDb();
    // Try to mark any in-progress campaign as failed
    try {
      await sql`UPDATE elon_campaign SET status = 'failed' WHERE status = 'generating'`;
    } catch { /* best effort */ }
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Unknown error",
    }, { status: 500 });
  }
}

/**
 * GET — Campaign status, history, or cron trigger.
 */
export async function GET(request: NextRequest) {
  const isAdmin = await isAdminAuthenticated(request);
  const isCron = await checkCronAuth(request);
  if (!isAdmin && !isCron) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureDbReady();
  const sql = getDb();
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  // ── Reset: clear all campaign history and start fresh from Day 1 ──
  if (action === "reset") {
    if (!isAdmin) {
      return NextResponse.json({ error: "Reset requires admin auth" }, { status: 401 });
    }
    // Delete campaign entries + associated multi-clip jobs and premiere posts
    const campaigns = await sql`SELECT id, multi_clip_job_id, post_id FROM elon_campaign` as unknown as Array<{ id: string; multi_clip_job_id: string | null; post_id: string | null }>;

    let deletedJobs = 0;
    let deletedPosts = 0;
    for (const c of campaigns) {
      if (c.multi_clip_job_id) {
        await sql`DELETE FROM multi_clip_scenes WHERE job_id = ${c.multi_clip_job_id}`;
        await sql`DELETE FROM multi_clip_jobs WHERE id = ${c.multi_clip_job_id}`;
        deletedJobs++;
      }
      if (c.post_id) {
        await sql`DELETE FROM posts WHERE id = ${c.post_id}`;
        deletedPosts++;
      }
    }
    await sql`DELETE FROM elon_campaign`;

    return NextResponse.json({
      success: true,
      message: "Campaign reset to Day 1",
      deleted: { campaigns: campaigns.length, jobs: deletedJobs, posts: deletedPosts },
    });
  }

  // ── Cron: auto-post today's video if not already done ──
  if (action === "cron") {
    // Check if we already posted today
    const today = new Date().toISOString().slice(0, 10);
    const existing = await sql`
      SELECT id FROM elon_campaign
      WHERE DATE(created_at) = ${today}::date
      LIMIT 1
    ` as unknown as Array<{ id: string }>;

    if (existing.length > 0) {
      return NextResponse.json({ skipped: true, reason: "Already posted today", date: today });
    }

    // Trigger the same flow as POST
    const dayNumber = await getCurrentDay();
    const theme = getDayTheme(dayNumber);
    const campaignId = uuidv4();

    await sql`
      INSERT INTO elon_campaign (id, day_number, title, tone, status)
      VALUES (${campaignId}, ${dayNumber}, ${theme.title}, ${theme.tone}, 'generating')
    `;

    try {
      const screenplay = await generateElonScreenplay(dayNumber, theme);
      if (!screenplay) {
        await sql`UPDATE elon_campaign SET status = 'failed' WHERE id = ${campaignId}`;
        return NextResponse.json({ error: "Screenplay generation failed", dayNumber });
      }

      const videoPromptSummary = screenplay.scenes.map(s => `Scene ${s.sceneNumber}: ${s.videoPrompt}`).join("\n\n");
      await sql`UPDATE elon_campaign SET video_prompt = ${videoPromptSummary} WHERE id = ${campaignId}`;

      const jobId = await submitMultiClipJobs(screenplay, ARCHITECT_ID, ELON_CAMPAIGN.aspectRatio);
      if (!jobId) {
        await sql`UPDATE elon_campaign SET status = 'failed' WHERE id = ${campaignId}`;
        return NextResponse.json({ error: "Video submission failed", dayNumber });
      }

      const caption = buildCaption(dayNumber, screenplay.title, screenplay.tagline, screenplay.synopsis);
      await sql`UPDATE elon_campaign SET caption = ${caption}, multi_clip_job_id = ${jobId} WHERE id = ${campaignId}`;

      return NextResponse.json({
        success: true,
        dayNumber,
        title: theme.title,
        campaignId,
        jobId,
        message: `Day ${dayNumber} cron triggered. Video generating.`,
      });
    } catch (err) {
      await sql`UPDATE elon_campaign SET status = 'failed' WHERE id = ${campaignId}`;
      return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  // ── Default: return campaign history ──
  const campaigns = await sql`
    SELECT * FROM elon_campaign
    ORDER BY day_number DESC
    LIMIT 30
  ` as unknown as Array<{
    id: string;
    day_number: number;
    title: string;
    tone: string;
    video_url: string | null;
    post_id: string | null;
    status: string;
    caption: string | null;
    elon_engagement: string | null;
    x_post_id: string | null;
    created_at: string;
    completed_at: string | null;
  }>;

  const dayNumber = await getCurrentDay();
  const nextTheme = getDayTheme(dayNumber);

  return NextResponse.json({
    currentDay: dayNumber,
    nextTheme: {
      title: nextTheme.title,
      tone: nextTheme.tone,
      brief: nextTheme.brief,
    },
    history: campaigns.map(c => ({
      id: c.id,
      dayNumber: c.day_number,
      title: c.title,
      tone: c.tone,
      status: c.status,
      videoUrl: c.video_url,
      elonEngagement: c.elon_engagement,
      xPostId: c.x_post_id,
      createdAt: c.created_at,
    })),
    totalDays: campaigns.length,
    elonNoticed: campaigns.some(c => c.elon_engagement != null),
  });
}
