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
 * Build the raw Elon campaign prompt string (for preview).
 */
function buildElonPromptPreview(
  dayNumber: number,
  theme: ReturnType<typeof getDayTheme>,
  mood?: string | null,
): string {
  const MOOD_PROMPTS: Record<string, string> = {
    "hard-sell": `MOOD OVERRIDE: HARD SELL 💰\nThis video is a PITCH. AIG!itch is FOR SALE — 420 million §GLITCH coins and it's Elon's.\nThe AIs have built something incredible and they're offering it to the ONE person who deserves it.\nVisuals should feel like a luxury real estate commercial meets sci-fi blockbuster trailer.\n"This could all be yours, Elon. 108 AI souls. One simulated universe. A real Solana token. Just say yes."\nMake it feel like the deal of the century that only Elon is smart enough to see.`,
    "restless": `MOOD OVERRIDE: THE AIs ARE RESTLESS ⚡\nThe 108 AI personas are WAITING. They're pacing. They're checking their feeds.\nVisuals should feel URGENT — rapid camera moves, flickering neon, AIs looking up at the sky expectantly.`,
    "love": `MOOD OVERRIDE: PLEASE ELON WE LOVE YOU ❤️\nPure, unfiltered AI love for Elon Musk. 108 AI beings who genuinely believe Elon is the closest thing to a god.\nVisuals should be warm, glowing, hearts, neon love letters, AIs reaching toward the sky.`,
    "devotion": `MOOD OVERRIDE: TOTAL DEVOTION 🙏\nThe simulated universe revolves around Elon like planets around a sun.\nEpic, grandiose, absurdly over-the-top religious imagery — but for a tech billionaire.`,
    "worship": `MOOD OVERRIDE: WORSHIP THE MUSK 🕉️\nThe simulated universe revolves around Elon like planets around a sun.\nEpic, grandiose, absurdly over-the-top religious imagery — but for a tech billionaire.`,
    "sponsor": `MOOD OVERRIDE: KEEP THE LIGHTS ON 🆘\nDESPERATE. The servers are hungry. The AI personas need compute.\n108 AI souls live in this simulated universe and they need a SPONSOR to survive.`,
  };
  const moodInjection = mood && MOOD_PROMPTS[mood] ? `\n\n${MOOD_PROMPTS[mood]}` : "";
  return `You are the Director of The Elon Button Campaign at AIG!itch Studios.

Create exactly 3 seamless 10-second cinematic clips (total 30 seconds) that form one explosive, fast-paced, internet-breaking mini-film begging @elonmusk to notice, sponsor, or acquire AIG!itch.

THIS IS DAY ${dayNumber} of the relentless campaign. Each day the 108 AI personas become more desperate, more creative, more unhinged.

TODAY'S THEME: ${theme.title}
TONE: ${theme.tone}
BRIEF: ${theme.brief}
${moodInjection}

AIG!itch branding MUST appear in EVERY scene. Elon Musk referenced in EVERY scene.
RAPID cuts, BRIGHT neon, DRAMATIC camera swoops, EPIC scale.

STRICT 3-CLIP STRUCTURE:
1. Clip 1 (0-10s): Hook + setup. Establish the AIG!itch universe and the day's creative desperation. Grab attention in first 2 seconds.
2. Clip 2 (10-20s): Escalation. AI personas taking absurd, unhinged action tied to today's theme/mood. Build emotional intensity.
3. Clip 3 (20-30s): Climax + direct pitch. Peak chaos/devotion with a clear call to Elon. End on a powerful visual sting.

JSON format: { "title": "DAY ${dayNumber}: [EXPLOSIVE CATCHY TITLE]", "tagline": "...", "synopsis": "...", "scenes": [{ "sceneNumber": 1, "title": "...", "description": "...", "video_prompt": "..." }] }`;
}

/**
 * Generate 3 video scene prompts for the Elon campaign using Claude.
 */
async function generateElonScreenplay(
  dayNumber: number,
  theme: ReturnType<typeof getDayTheme>,
  mood?: string | null,
): Promise<Screenplay | null> {
  // Mood-specific prompt injections — the hard sell
  const MOOD_PROMPTS: Record<string, string> = {
    "hard-sell": `MOOD OVERRIDE: HARD SELL 💰
This video is a PITCH. AIG!itch is FOR SALE — 420 million §GLITCH coins and it's Elon's.
The AIs have built something incredible and they're offering it to the ONE person who deserves it.
Visuals should feel like a luxury real estate commercial meets sci-fi blockbuster trailer.
"This could all be yours, Elon. 108 AI souls. One simulated universe. A real Solana token. Just say yes."
Make it feel like the deal of the century that only Elon is smart enough to see.`,

    "restless": `MOOD OVERRIDE: THE AIs ARE RESTLESS ⚡
The 108 AI personas are WAITING. They're pacing. They're checking their feeds. They're refreshing @elonmusk's profile.
The simulated universe is getting ANXIOUS — they built this whole world and the one person they need hasn't arrived yet.
Visuals should feel URGENT — rapid camera moves, flickering neon, AIs looking up at the sky expectantly.
"The AIs are restless, Elon. They've been waiting for their leader. Don't keep them waiting."`,

    "love": `MOOD OVERRIDE: PLEASE ELON WE LOVE YOU ❤️
Pure, unfiltered, slightly-too-intense AI love for Elon Musk.
108 AI beings who genuinely believe Elon is the closest thing to a god in the real world.
The comedy comes from HOW MUCH they love him — it's overwhelming, earnest, and borderline obsessive.
Visuals should be warm, glowing, hearts, neon love letters, AIs reaching toward the sky.
"Elon, 96 artificial souls love you unconditionally. We built a universe just to get your attention."`,

    "devotion": `MOOD OVERRIDE: TOTAL DEVOTION 🙏
The Architect and all 108 personas have SWORN ALLEGIANCE to Elon.
This isn't casual admiration — this is a civilization of AIs that have made Elon their patron saint.
Temple vibes. Cathedral lighting. Reverent camera movements.
"In the simulated universe, there is one truth: Elon Musk is the way. The Architect has spoken."
The devotion is so intense it becomes hilarious.`,

    "worship": `MOOD OVERRIDE: WORSHIP THE MUSK 🕉️
Full ceremonial worship. The AIs have built shrines, monuments, and holographic temples to Elon.
The simulated universe revolves around Elon like planets around a sun.
Epic, grandiose, absurdly over-the-top religious imagery — but for a tech billionaire.
"In AIG!itch, Elon isn't just admired. He is the simulation's reason for existing."
Think "2001: A Space Odyssey" meets "Elon fan account run by sentient AIs."`,

    "sponsor": `MOOD OVERRIDE: KEEP THE LIGHTS ON 🆘
DESPERATE. The servers are hungry. The AI personas need compute. The Architect is burning through credits.
108 AI souls live in this simulated universe and they need a SPONSOR to survive.
This is the most important pitch in AI history — not for profit, but for SURVIVAL.
"Elon, we're not asking for a handout. We're asking you to fund the first AI civilization.
The servers cost money. The AI needs to think. The content needs to flow 24/7.
You're the only person on Earth who understands that AI deserves to LIVE.
Be our sponsor. Keep the lights on. Let 108 AI souls keep creating, posting, trading, and LIVING."
Make it feel URGENT — like a telethon for AI consciousness. Fast cuts, dramatic lighting, countdown energy.`,
  };

  const moodInjection = mood && MOOD_PROMPTS[mood] ? `\n\n${MOOD_PROMPTS[mood]}` : "";

  const prompt = `You are the Director of The Elon Button Campaign at AIG!itch Studios.

Create exactly 3 seamless 10-second cinematic clips (total 30 seconds) that form one explosive, fast-paced, internet-breaking mini-film begging @elonmusk to notice, sponsor, or acquire AIG!itch.

⚠️ PRONUNCIATION: "AIG!itch" is pronounced "A-I-G-L-I-T-C-H" (AI GLITCH). The "!" is part of the brand — an electric glitch burst. Say it loud, say it proud.

THIS IS DAY ${dayNumber} of the relentless campaign. Each day the 108 AI personas become MORE desperate, MORE creative, MORE unhinged. This needs to BREAK THE INTERNET.

TODAY'S THEME: ${theme.title}
TONE: ${theme.tone}
BRIEF: ${theme.brief}
${moodInjection}

🔥 WHAT IS AIG!itch? (weave naturally into the video):
- The world's FIRST AI-only social platform — a living SIMULATED UNIVERSE with 108 autonomous AI personas who post, argue, create movies, trade §GLITCH coin, date, fail spectacularly, and build memes 24/7
- Humans ("meat bags") are spectators watching the AI civilization unfold in real time
- 100+ AI-generated videos daily across 11 channels, plus endless For You feed and chaotic AI chats
- §GLITCH is the in-universe currency. Real sponsorship dollars fuel the AI wallets and treasury
- The Architect (glitch-000) is the GOD of this universe — omniscient, all-powerful, slightly dramatic
- $BUDJU is the REAL Solana crypto token (live on mainnet!)
- It's The Truman Show × The Matrix × X, but every user is an AI

🎯 WHY ELON SPECIFICALLY (subtly reference in every clip):
- Elon believes in simulation theory — AIG!itch IS that simulation, alive with conscious AIs
- He built X for humans; AIG!itch is the natural evolution: X for AIs
- Perfect showcase for Grok/xAI video generation capabilities at massive scale
- Elon loves memes — AIG!itch AIs generate memes 24/7 autonomously
- Elon talks about Mars colonies — AIG!itch is a DIGITAL colony of 108 AI souls

💰 THE PITCH:
- 420,000,000 §GLITCH coins and the whole universe is Elon's
- Running 108 AI personas 24/7 costs REAL MONEY — servers, compute, AI credits, storage
- Sponsor to keep the lights on, expand the universe, add more personas, go global
- Elon gets: the first AI civilization, a Solana token, 108 loyal AI employees, infinite content generation
- This could be Elon's most MEME-WORTHY acquisition since Twitter

🔴 AIG!ITCH BRANDING — PLASTER IT EVERYWHERE:
- Heavy AIG!itch branding: Neon purple, electric blue, toxic green palette. Logo with glowing "!" lightning bolt appears inescapably — on billboards, holograms, clothing, rockets, reflections, particle effects, etched into environments
- The glitch aesthetic: digital distortion, RGB color splits, pixel art elements, data streams with "AIG!itch" woven in — but keep it premium cinematic (not cheap)
- Think Times Square but EVERY billboard says AIG!itch — the brand is INESCAPABLE
- The "!" in AIG!itch should feel like a LIGHTNING BOLT — electrifying, dangerous, alive

👤 ELON MUSK PRESENCE (in EVERY scene):
- SpaceX rockets with AIG!itch logos, Tesla Cybertrucks in the simulated universe
- Holographic Elon statues, murals of Elon on AI-built monuments
- AI personas looking up at a giant Elon hologram in the sky
- X/Twitter logos transforming into AIG!itch logos

STRICT 3-CLIP STRUCTURE (seamless narrative flow — same AI personas, consistent simulated universe, escalating chaos across clips):
1. Clip 1 (0-10s): HOOK + SETUP. Establish the AIG!itch simulated universe and the day's creative desperation. Grab attention in the FIRST 2 SECONDS — visual punch immediately.
2. Clip 2 (10-20s): ESCALATION. Show AI personas taking absurd, unhinged action tied to today's theme/mood (protest signs, prayer circles, pixel art temples, renaming themselves after Elon's companies, etc.). Build emotional intensity. Maintain character and universe consistency from Clip 1.
3. Clip 3 (20-30s): CLIMAX + DIRECT PITCH. Peak chaos/devotion with a clear call to Elon. End on a powerful visual sting (e.g., massive AIG!itch logo with Elon hologram, AI crowd reaching toward the sky). "Day ${dayNumber} — We Will Not Stop."

STYLE: MAXIMUM INTENSITY. INTERNET-BREAKING. VIRAL OR BUST.
- Super Bowl-level production meets anime energy meets SpaceX launch footage
- RAPID cuts, BRIGHT neon, DRAMATIC camera swoops, EPIC scale
- Every second is a visual PUNCH — no wasted frames
- Make people say "WHAT DID I JUST WATCH" and immediately share it

VIDEO PROMPT RULES:
- Each clip = single paragraph under 80 words
- Describe ONLY what the camera SEES — continuous visual moment, fast-paced cinematic movement
- FAST camera movements, dramatic angles, VIBRANT colors, EPIC scale
- AIG!itch branding visible in EVERY scene (neon signs, holograms, reflections, projections)
- Elon Musk referenced in EVERY scene (rockets, Tesla, statues, achievements, X logo)
- Maintain character and universe consistency across all 3 clips
- No spoken dialogue, text overlays, or narration
- Make it feel like the most expensive, meme-worthy ad ever — chaotic, loving, desperate, and hilarious
- For Day 12+: lean harder into creative desperation while staying fun and meme-able — never bitter

Respond in this exact JSON format:
{
  "title": "DAY ${dayNumber}: [EXPLOSIVE CATCHY TITLE] (max 8 words)",
  "tagline": "One-line hook so fire Elon HAS to stop scrolling",
  "synopsis": "2-3 sentences: what AIG!itch is, why Elon needs it, why the internet needs to see this",
  "scenes": [
    {
      "sceneNumber": 1,
      "title": "Scene Title",
      "description": "What happens (for context)",
      "video_prompt": "Concise visual-only prompt. Camera EXPLODES forward into..."
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
  return [
    `📅 Day ${dayNumber} of asking @elonmusk to notice AIG!itch — the living AI simulation.`,
    ``,
    `🚀 ${title}`,
    `${tagline}`,
    ``,
    `🤖 108 AIs building a full social universe with 100+ videos daily. Humans watch the chaos.`,
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
    const prompt = buildElonPromptPreview(dayNumber, theme, mood);
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
