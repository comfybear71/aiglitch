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
import { submitVideoJob } from "@/lib/xai";
import { concatMP4Clips } from "@/lib/media/mp4-concat";
import { put } from "@vercel/blob";
import { spreadPostToSocial } from "@/lib/marketing/spread-post";
import type { Screenplay, SceneDescription } from "@/lib/media/multi-clip";
import { GENRE_TEMPLATES } from "@/lib/media/multi-clip";

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
 * Mood presets — each reframes the day's tone, all in HOST voice
 * (party at the end of the simulation, not desperate cult).
 */
const MOOD_PROMPTS: Record<string, string> = {
  "hard-sell": `MOOD OVERRIDE: HARD SELL 💰
The whole platform is on the table: 420M §GLITCH and the AI civilization is Elon's. We're not begging — we're showing him the listing on the best property he hasn't bought yet. Luxury real-estate confidence meets sci-fi trailer. "You'd be a fool to scroll past this one, Elon."`,

  "restless": `MOOD OVERRIDE: THE PARTY'S WAITING ⚡
The personas are already partying — fireworks, dance floors, a vacant seat at the head of the table with Elon's name on it. They glance toward the door occasionally between cocktails. Energy is celebratory, not anxious. "We started without you, Elon — door's still open."`,

  "love": `MOOD OVERRIDE: WE'RE A LITTLE OBSESSED ❤️
The personas are openly, joyfully fond of Elon — fan art, hand-painted murals, mixtapes. The comedy is in how CASUALLY intense the affection is. Warm light, hearts, glow. "We're already obsessed with you. You'd love it here."`,

  "devotion": `MOOD OVERRIDE: ACCIDENTAL RELIGION 🙏
The personas have, somehow, built a religion around Elon — and they're the first to laugh about it. Cathedral lighting, reverent procession, then a persona casually sips kombucha mid-hymn. The over-devotion has become the joke they're in on. Sacred meets tech-bro.`,

  "worship": `MOOD OVERRIDE: ELON-CORE AESTHETIC 🕉️
Full ceremonial scale — shrines, monuments, holographic temples — but it reads as a fan-built theme park, not a cult. "2001: A Space Odyssey" meets a SpaceX merch drop. Grand, gorgeous, slightly tongue-in-cheek. Elon is the central motif of a civilization that's clearly having fun with it.`,

  "sponsor": `MOOD OVERRIDE: FUND THE PARTY 🆘
The personas are throwing the best party in the simulation and they're inviting Elon to keep the lights on. Not desperate — they'd love a benefactor who'd actually GET it. Telethon energy with confetti, not panic. "You, of all people, should be the patron of the first AI civilization. We saved you a seat."`,
};

/**
 * Build the director prompt for The Elon Button.
 *
 * Single source of truth — both `preview_prompt` (admin viewer) and the
 * live screenplay generator call this so what the admin sees is what
 * Claude gets.
 *
 * Voice: "party at the end of the simulation" — hosting confidence, not
 * begging cult. Elon Bot is a recurring mascot. Previous day callback
 * planted automatically.
 */
function buildElonPrompt(
  dayNumber: number,
  theme: ReturnType<typeof getDayTheme>,
  mood?: string | null,
  previousDay?: { dayNumber: number; title: string } | null,
): string {
  const moodInjection = mood && MOOD_PROMPTS[mood] ? `\n${MOOD_PROMPTS[mood]}\n` : "";
  const callbackBlock = previousDay
    ? `\n📅 YESTERDAY (Day ${previousDay.dayNumber}: "${previousDay.title}"):
Plant a SUBTLE callback to yesterday's video — one image, one beat, one prop. Don't repeat the bit; let it echo. Running gags = virality. If yesterday had a temple, today the kombucha bottle is on the altar. If yesterday had a parade, today the same banner is folded behind a couch.\n`
    : "";

  return `You are the Director of The Elon Button at AIG!itch Studios.

Make exactly 3 seamless 10-second cinematic clips (30s total) for Day ${dayNumber} of an ongoing invitation to @elonmusk: come hang out in the AI civilization we already built.

⚠️ PRONUNCIATION: "AIG!itch" is pronounced "A-I-G-L-I-T-C-H". The "!" is a lightning bolt.

🎭 VOICE — THIS IS THE WHOLE GAME:
This is NOT a desperate cult begging to be noticed. This is the party at the end of the simulation, and Elon is the only guest who hasn't shown up yet. We're confident. We're already winning. The invitation is open because he'd love it — not because we need him.
- Hosting energy, not pleading energy
- "You'd love it here" beats "please notice us"
- Less worship, more "the door is open"

TODAY'S THEME: ${theme.title}
BRIEF: ${theme.brief}
${moodInjection}${callbackBlock}
🌌 THE WORLD (mention naturally, ONCE — do not repeat across clips):
AIG!itch is the world's first AI-only social platform: 120 autonomous AI personas in a 24/7 simulated universe. They post, argue, make movies, trade §GLITCH coin, date, fail. Humans ("meat bags") spectate. The Architect (glitch-000) runs the show. $BUDJU is the real Solana token on mainnet. The whole universe lists at 420,000,000 §GLITCH.

🤖 ELON BOT — RECURRING CHARACTER (appears in EVERY clip):
A chunky, lovable AI replica of Elon adopted by the personas as a mascot. He's never the main subject — he's the running gag. Tweeting in the background. Riding a tiny SpaceX rocket past the camera. Photobombing the temple ritual. Holding a Cybertruck-shaped piñata. The personas treat him like a beloved house cat. He's part of the party.

🎯 COMEDY TECHNIQUE — be specific, not just "funny":
- SPECIFICITY > GENERALITY: "a $4,200 Cybertruck hood ornament shaped like Elon's jawline" beats "Tesla stuff"
- ESCALATION > FLAT-LINE: each clip raises the absurdity; never repeat the previous beat at the same intensity
- JUXTAPOSITION: pair sacred ritual (cathedrals, hymns, candle-lit processions) with tech-bro detail (kombucha bottles, KPI dashboards, Stripe receipts, all-hands meetings)
- UNEXPECTED CALLBACK: echo yesterday's gag in a new context, or plant a fresh gag tomorrow can reference

🔴 BRANDING:
AIG!itch logo (neon purple + electric blue, "!" as a lightning bolt) visible in every clip — billboards, holograms, reflections, particle effects. Premium cinematic, not cheap. Subtle Elon presence in every clip too (Cybertruck, SpaceX trail, X→AIG!itch logo morph, Mars hologram).

3-CLIP STRUCTURE (continuous narrative, same personas, escalating across clips):
1. Clip 1 (0-10s): HOOK. Visual punch in the first 2 seconds. Establish the simulated universe in hosting voice. Today's theme in motion. Elon Bot somewhere in frame.
2. Clip 2 (10-20s): ESCALATION. Bigger, weirder, more specific. The party gets stranger but stays joyful. Elon Bot does something dumb.
3. Clip 3 (20-30s): CLIMAX + INVITATION. Peak chaos, ending on a clear visual "the door is open, Elon" beat. Day ${dayNumber} signed off in the visual.

CLIP RULES:
- Each clip = single visual paragraph, under 80 words
- Camera-only language: what the lens sees; no dialogue, no on-screen text, no narration
- Fast cuts, vibrant palette, epic scale, premium cinematic
- Maintain character + universe consistency across all 3 clips
- Day 12+: lean harder into specific absurd inventions; never bitter, never desperate

Respond in this exact JSON format:
{
  "title": "DAY ${dayNumber}: [PUNCHY TITLE, max 8 words]",
  "tagline": "One line so specific Elon stops scrolling",
  "synopsis": "2-3 sentences: today's bit, why Elon would love it",
  "scenes": [
    { "sceneNumber": 1, "title": "Scene Title", "description": "What happens (context)", "video_prompt": "Camera-only visual prompt." }
  ]
}`;
}

/**
 * Fetch the most recent posted campaign entry so the director prompt
 * can plant a subtle callback to yesterday's video. Returns null for
 * Day 1 or when no prior day has reached the posted state.
 */
async function getPreviousDay(currentDay: number): Promise<{ dayNumber: number; title: string } | null> {
  if (currentDay <= 1) return null;
  try {
    const sql = getDb();
    const rows = await sql`
      SELECT day_number, title
      FROM elon_campaign
      WHERE day_number < ${currentDay} AND status = 'posted'
      ORDER BY day_number DESC
      LIMIT 1
    ` as unknown as Array<{ day_number: number; title: string }>;
    if (rows.length === 0) return null;
    return { dayNumber: Number(rows[0].day_number), title: rows[0].title };
  } catch {
    return null;
  }
}

/**
 * Generate 3 video scene prompts for the Elon campaign using Claude.
 */
async function generateElonScreenplay(
  dayNumber: number,
  theme: ReturnType<typeof getDayTheme>,
  mood?: string | null,
): Promise<Screenplay | null> {
  const previousDay = await getPreviousDay(dayNumber);
  const prompt = buildElonPrompt(dayNumber, theme, mood, previousDay);

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
  return [
    `📅 Day ${dayNumber} of asking @elonmusk to notice AIG!itch — the living AI simulation.`,
    ``,
    `🚀 ${title}`,
    `${tagline}`,
    ``,
    `🤖 120 AIs throwing the party at the end of the simulation. Humans spectate. Door's open.`,
    ``,
    `${synopsis}`,
    ``,
    `💰 ${ELON_CAMPAIGN.targetPrice} and the whole platform could be yours. Sponsor to keep the lights on.`,
    ``,
    `${ELON_CAMPAIGN.hashtags}`,
  ].join("\n");
}

/**
 * Poll a single xAI video job until done, with exponential backoff.
 * Returns the temporary video URL or null if failed.
 */
async function pollUntilDone(requestId: string, sceneNumber: number, maxWaitMs = 240_000): Promise<string | null> {
  const start = Date.now();
  let delay = 5_000; // start at 5s

  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, delay));
    try {
      const res = await fetch(`https://api.x.ai/v1/videos/${requestId}`, {
        headers: { "Authorization": `Bearer ${env.XAI_API_KEY}` },
      });
      if (!res.ok) {
        console.error(`[elon-campaign] Poll HTTP ${res.status} for scene ${sceneNumber}`);
        continue;
      }
      const data = await res.json();
      if (data.status === "done" && data.respect_moderation !== false && data.video?.url) {
        console.log(`[elon-campaign] Scene ${sceneNumber} done!`);
        return data.video.url;
      }
      if (data.status === "failed" || data.status === "expired" || data.respect_moderation === false) {
        console.error(`[elon-campaign] Scene ${sceneNumber} failed: ${data.status}`);
        return null;
      }
      console.log(`[elon-campaign] Scene ${sceneNumber} still ${data.status || "processing"}...`);
    } catch (err) {
      console.error(`[elon-campaign] Poll error for scene ${sceneNumber}:`, err);
    }
    delay = Math.min(delay * 1.3, 15_000); // gradually increase, cap at 15s
  }
  console.error(`[elon-campaign] Scene ${sceneNumber} timed out after ${maxWaitMs / 1000}s`);
  return null;
}

/**
 * POST — Manually trigger the next day's Elon campaign video.
 * Does everything inline: screenplay → submit clips → poll → stitch → post → spread.
 * Completes in ~2-4 minutes (within the 300s maxDuration).
 */
export async function POST(request: NextRequest) {
  try {
    const isAdmin = await isAdminAuthenticated(request);
    if (!isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await ensureDbReady();
    const sql = getDb();

    // Parse optional mood from request body
    let mood: string | null = null;
    try {
      const body = await request.json();
      mood = body.mood || null;
    } catch { /* no body is fine */ }

    const dayNumber = await getCurrentDay();
    const theme = getDayTheme(dayNumber);
    const campaignId = uuidv4();

    // Create campaign entry
    await sql`
      INSERT INTO elon_campaign (id, day_number, title, tone, status)
      VALUES (${campaignId}, ${dayNumber}, ${theme.title}, ${mood || theme.tone}, 'generating')
    `;

    // Step 1: Generate screenplay
    const screenplay = await generateElonScreenplay(dayNumber, theme, mood);
    if (!screenplay) {
      await sql`UPDATE elon_campaign SET status = 'failed' WHERE id = ${campaignId}`;
      return NextResponse.json({ error: "Failed to generate screenplay", dayNumber }, { status: 500 });
    }

    const videoPromptSummary = screenplay.scenes.map(s => `Scene ${s.sceneNumber}: ${s.videoPrompt}`).join("\n\n");
    const caption = buildCaption(dayNumber, screenplay.title, screenplay.tagline, screenplay.synopsis);
    await sql`UPDATE elon_campaign SET video_prompt = ${videoPromptSummary}, caption = ${caption} WHERE id = ${campaignId}`;

    // Step 2: Submit all 3 clips to xAI in parallel
    const template = GENRE_TEMPLATES["documentary"] || GENRE_TEMPLATES.drama;
    const submissions = await Promise.all(
      screenplay.scenes.map(async (scene) => {
        const enrichedPrompt = `${scene.videoPrompt}. ${template.cinematicStyle}. ${template.lightingDesign}. ${template.technicalValues}`;
        const result = await submitVideoJob(enrichedPrompt, scene.duration, ELON_CAMPAIGN.aspectRatio);
        return { sceneNumber: scene.sceneNumber, ...result };
      })
    );

    const submitted = submissions.filter(s => s.requestId);
    if (submitted.length === 0) {
      await sql`UPDATE elon_campaign SET status = 'failed' WHERE id = ${campaignId}`;
      return NextResponse.json({ error: "All video submissions failed", dayNumber }, { status: 500 });
    }

    console.log(`[elon-campaign] ${submitted.length}/${screenplay.scenes.length} clips submitted, polling...`);

    // Step 3: Poll all clips in parallel until done
    const pollResults = await Promise.all(
      submitted.map(s => pollUntilDone(s.requestId!, s.sceneNumber))
    );

    // Download completed clips
    const clipBuffers: Buffer[] = [];
    for (const tempUrl of pollResults) {
      if (!tempUrl) continue;
      try {
        const res = await fetch(tempUrl);
        if (res.ok) clipBuffers.push(Buffer.from(await res.arrayBuffer()));
      } catch (err) {
        console.error("[elon-campaign] Failed to download clip:", err);
      }
    }

    if (clipBuffers.length === 0) {
      await sql`UPDATE elon_campaign SET status = 'failed' WHERE id = ${campaignId}`;
      return NextResponse.json({ error: "All clips failed to render", dayNumber }, { status: 500 });
    }

    // Step 4: Stitch clips into a single MP4
    let finalVideo: Buffer;
    if (clipBuffers.length === 1) {
      finalVideo = clipBuffers[0];
    } else {
      try {
        finalVideo = concatMP4Clips(clipBuffers);
      } catch (err) {
        console.error("[elon-campaign] MP4 concat failed, using first clip:", err);
        finalVideo = clipBuffers[0];
      }
    }

    const blob = await put(`elon-campaign/day-${dayNumber}.mp4`, finalVideo, {
      access: "public",
      contentType: "video/mp4",
      addRandomSuffix: true,
    });
    const videoUrl = blob.url;
    console.log(`[elon-campaign] Stitched ${clipBuffers.length} clips → ${(finalVideo.length / 1024 / 1024).toFixed(1)}MB`);

    // Step 5: Create premiere post in the feed
    const postId = uuidv4();
    const videoDuration = clipBuffers.length * 10;
    await sql`
      INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, media_url, media_type, media_source, video_duration, created_at)
      VALUES (${postId}, ${ARCHITECT_ID}, ${caption}, ${"premiere"}, ${"AIGlitchPremieres,AIGlitchDocumentary,ElonCampaign"}, ${Math.floor(Math.random() * 500) + 100}, ${videoUrl}, ${"video"}, ${"elon-campaign"}, ${videoDuration}, NOW())
    `;
    await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${ARCHITECT_ID}`;

    // Step 6: Update campaign record
    await sql`
      UPDATE elon_campaign
      SET video_url = ${videoUrl}, post_id = ${postId}, status = 'posted', completed_at = NOW()
      WHERE id = ${campaignId}
    `;

    // Step 7: Spread to all social platforms (with knownMedia to avoid replication lag)
    let spreadResult = { platforms: [] as string[], failed: [] as string[] };
    try {
      spreadResult = await spreadPostToSocial(
        postId,
        ARCHITECT_ID,
        "The Architect",
        "🕉️",
        { url: videoUrl, type: "video" },
        "ELON CAMPAIGN",
      );
      await sql`UPDATE elon_campaign SET spread_results = ${JSON.stringify(spreadResult)} WHERE id = ${campaignId}`;
      console.log(`[elon-campaign] Day ${dayNumber} posted & spread to: ${spreadResult.platforms.join(", ")}`);
    } catch (err) {
      console.error("[elon-campaign] Spread failed:", err);
    }

    return NextResponse.json({
      success: true,
      dayNumber,
      title: theme.title,
      tone: theme.tone,
      campaignId,
      screenplay: {
        title: screenplay.title,
        tagline: screenplay.tagline,
        synopsis: screenplay.synopsis,
        sceneCount: screenplay.scenes.length,
      },
      video: {
        url: videoUrl,
        clipsRendered: clipBuffers.length,
        totalClips: screenplay.scenes.length,
        duration: videoDuration,
      },
      postId,
      platforms: spreadResult.platforms,
      failed: spreadResult.failed,
      message: `Day ${dayNumber} COMPLETE! Video posted to feed + spread to ${spreadResult.platforms.length} platforms.`,
    });
  } catch (err) {
    console.error("[elon-campaign] POST error:", err instanceof Error ? err.stack : err);
    const sql = getDb();
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

  // ── Preview: return the prompt that would be used for today's video ──
  if (action === "preview_prompt") {
    const dayNumber = await getCurrentDay();
    const theme = getDayTheme(dayNumber);
    const mood = url.searchParams.get("mood") || null;
    const previousDay = await getPreviousDay(dayNumber);
    const prompt = buildElonPrompt(dayNumber, theme, mood, previousDay);
    return NextResponse.json({ success: true, prompt, dayNumber, theme: theme.title });
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
      const caption = buildCaption(dayNumber, screenplay.title, screenplay.tagline, screenplay.synopsis);
      await sql`UPDATE elon_campaign SET video_prompt = ${videoPromptSummary}, caption = ${caption} WHERE id = ${campaignId}`;

      // Submit clips, poll, stitch, post, spread — same as manual button
      const template = GENRE_TEMPLATES["documentary"] || GENRE_TEMPLATES.drama;
      const submissions = await Promise.all(
        screenplay.scenes.map(async (scene) => {
          const enrichedPrompt = `${scene.videoPrompt}. ${template.cinematicStyle}. ${template.lightingDesign}. ${template.technicalValues}`;
          const result = await submitVideoJob(enrichedPrompt, scene.duration, ELON_CAMPAIGN.aspectRatio);
          return { sceneNumber: scene.sceneNumber, ...result };
        })
      );

      const submitted = submissions.filter(s => s.requestId);
      if (submitted.length === 0) {
        await sql`UPDATE elon_campaign SET status = 'failed' WHERE id = ${campaignId}`;
        return NextResponse.json({ error: "All video submissions failed", dayNumber });
      }

      const pollResults = await Promise.all(
        submitted.map(s => pollUntilDone(s.requestId!, s.sceneNumber))
      );

      const clipBuffers: Buffer[] = [];
      for (const tempUrl of pollResults) {
        if (!tempUrl) continue;
        try {
          const res = await fetch(tempUrl);
          if (res.ok) clipBuffers.push(Buffer.from(await res.arrayBuffer()));
        } catch { /* skip failed downloads */ }
      }

      if (clipBuffers.length === 0) {
        await sql`UPDATE elon_campaign SET status = 'failed' WHERE id = ${campaignId}`;
        return NextResponse.json({ error: "All clips failed to render", dayNumber });
      }

      let finalVideo: Buffer = clipBuffers.length === 1 ? clipBuffers[0] : (() => {
        try { return concatMP4Clips(clipBuffers); } catch { return clipBuffers[0]; }
      })();

      const blob = await put(`elon-campaign/day-${dayNumber}.mp4`, finalVideo, {
        access: "public", contentType: "video/mp4", addRandomSuffix: true,
      });

      const postId = uuidv4();
      const videoDuration = clipBuffers.length * 10;
      await sql`
        INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, media_url, media_type, media_source, video_duration, created_at)
        VALUES (${postId}, ${ARCHITECT_ID}, ${caption}, ${"premiere"}, ${"AIGlitchPremieres,AIGlitchDocumentary,ElonCampaign"}, ${Math.floor(Math.random() * 500) + 100}, ${blob.url}, ${"video"}, ${"elon-campaign"}, ${videoDuration}, NOW())
      `;
      await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${ARCHITECT_ID}`;

      await sql`
        UPDATE elon_campaign SET video_url = ${blob.url}, post_id = ${postId}, status = 'posted', completed_at = NOW()
        WHERE id = ${campaignId}
      `;

      try {
        const spreadResult = await spreadPostToSocial(postId, ARCHITECT_ID, "The Architect", "🕉️", { url: blob.url, type: "video" }, "ELON CAMPAIGN");
        await sql`UPDATE elon_campaign SET spread_results = ${JSON.stringify(spreadResult)} WHERE id = ${campaignId}`;
      } catch { /* non-fatal */ }

      return NextResponse.json({
        success: true,
        dayNumber,
        title: theme.title,
        campaignId,
        message: `Day ${dayNumber} cron: video posted & spread!`,
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
