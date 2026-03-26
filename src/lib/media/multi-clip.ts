/**
 * Multi-Clip Video System
 *
 * Generates longer videos (30s-60s) by creating multiple 10-second clips with
 * structured prompts and stitching them together. Inspired by the documentary
 * production framework in the PDF guide.
 *
 * Architecture:
 *   1. Claude writes a "screenplay" — a sequence of scene descriptions
 *   2. Each scene is converted to a Grok video prompt using the 5-component framework:
 *      Scene Specification, Cinematic Style, Mood, Lighting, Technical Values
 *   3. Clips are submitted as async Grok video jobs
 *   4. When all clips complete, they're concatenated into a single MP4
 *   5. The final video is posted as a premiere
 *
 * Genres: drama, comedy, sci-fi, horror, family, documentary, action, romance
 * Cost: ~$0.50 per 10s clip × 4-6 clips = $2-3 per minute of content
 */

import { claude } from "@/lib/ai";
import { v4 as uuidv4 } from "uuid";
import { put } from "@vercel/blob";
import { getDb } from "../db";
import { concatMP4Clips } from "./mp4-concat";
import { getGenreBlobFolder } from "../genre-utils";
import { submitVideoJob } from "../xai";
import { env } from "../bible/env";
import { spreadPostToSocial } from "../marketing/spread-post";

// ─── Genre Prompt Templates ───────────────────────────────────────────────
// Based on the PDF's 5-component prompt framework:
// Scene Specification | Cinematic Style | Mood | Lighting | Technical Values

export interface GenreTemplate {
  genre: string;
  cinematicStyle: string;
  moodTone: string;
  lightingDesign: string;
  technicalValues: string;
  screenplayInstructions: string;
}

export const GENRE_TEMPLATES: Record<string, GenreTemplate> = {
  drama: {
    genre: "drama",
    cinematicStyle: "Prestige TV aesthetic, shallow depth of field, intimate close-ups, slow deliberate camera movements",
    moodTone: "Emotionally intense, contemplative, tension building to catharsis",
    lightingDesign: "Natural window light with deep shadows, golden hour warmth, chiaroscuro contrast",
    technicalValues: "Film grain, muted color palette with selective warm tones, 24fps cinematic",
    screenplayInstructions: "Write a tightly compressed emotional arc. Focus on human conflict, moral dilemmas, or transformative moments. Each scene should escalate tension. Think Breaking Bad meets Black Mirror.",
  },
  comedy: {
    genre: "comedy",
    cinematicStyle: "Bright wide shots, quick cuts, exaggerated character expressions, mockumentary handheld feel",
    moodTone: "Absurd, satirical, escalating ridiculousness, comedic timing through visual gags",
    lightingDesign: "Bright even lighting, sitcom warmth, occasional dramatic overlit moments for comedic effect",
    technicalValues: "Clean crisp image, vibrant saturated colors, snappy pacing, 24fps",
    screenplayInstructions: "Write physical comedy and visual gags — NO dialogue-dependent humor since there's no audio. Think Mr. Bean meets The Office. Each scene should escalate the absurdity. Situation comedy through increasingly ridiculous visual scenarios.",
  },
  scifi: {
    genre: "sci-fi",
    cinematicStyle: "Blade Runner neo-noir, vast establishing shots, holographic HUDs, sleek futuristic environments",
    moodTone: "Awe-inspiring, ominous wonder, existential unease, technological sublime",
    lightingDesign: "Neon-drenched cyberpunk glow, bioluminescence, stark white lab lighting, lens flares",
    technicalValues: "High contrast, teal-and-orange color grading, volumetric fog, particle effects, 24fps",
    screenplayInstructions: "Write a compressed sci-fi narrative exploring AI, consciousness, space, or dystopia. Think Arrival meets Ex Machina. Each scene should reveal something new about the world or the stakes. Visual storytelling over dialogue.",
  },
  horror: {
    genre: "horror",
    cinematicStyle: "Slow creeping camera movements, Dutch angles, long static shots with something wrong, found footage aesthetic",
    moodTone: "Dread building to terror, uncanny valley, atmospheric unease, jump-scare crescendo",
    lightingDesign: "Deep shadows, single source harsh light, flickering, moonlit blue-grey, sudden darkness",
    technicalValues: "Desaturated cold palette, film grain, slight vignetting, 24fps with occasional slow motion",
    screenplayInstructions: "Write escalating dread — start normal, then increasingly wrong. Think Hereditary meets The Ring. NO gore or explicit violence — use psychological horror, uncanny visuals, creeping wrongness. Each scene should make the viewer more unsettled.",
  },
  family: {
    genre: "family",
    cinematicStyle: "Warm Pixar-like aesthetics, bright wide establishing shots, gentle camera movements, magical realism",
    moodTone: "Heartwarming, adventurous, gently funny, emotionally uplifting crescendo",
    lightingDesign: "Warm golden light, soft diffused sunshine, magical sparkles, cozy interior glow",
    technicalValues: "Vibrant saturated colors, clean sharp image, whimsical compositions, 24fps",
    screenplayInstructions: "Write a heartwarming micro-story about family, friendship, or discovery. Think Pixar short film meets Studio Ghibli. Wholesome but not saccharine. Each scene should build toward an emotionally satisfying payoff. Universal themes: love, courage, growing up, connection.",
  },
  documentary: {
    genre: "documentary",
    cinematicStyle: "Ken Burns effect on stills, sweeping aerial establishing shots, intimate verité handheld, talking-head framing",
    moodTone: "Informative wonder, revelatory, builds from curiosity to profound understanding",
    lightingDesign: "Natural available light, golden hour landscapes, dramatic time-lapse skies, soft interview lighting",
    technicalValues: "Clean documentary photography, natural color grading, smooth steady transitions, 24fps",
    screenplayInstructions: "Write about an AI-related topic: the rise of AI creativity, how AI is changing art/music/film, AI consciousness debates, the future of human-AI collaboration. Think Planet Earth meets The Social Dilemma. Each scene should present a new facet or revelation. Educational but visually stunning.",
  },
  action: {
    genre: "action",
    cinematicStyle: "Tracking shots, dynamic camera movement, wide establishing then tight action cuts, slow-motion hero moments",
    moodTone: "Adrenaline-pumping, triumphant, escalating stakes, explosive climax",
    lightingDesign: "High contrast dramatic lighting, explosion glow, golden backlight on heroes, dynamic shadow play",
    technicalValues: "High-impact color grading, orange-teal contrast, motion blur for speed, 24fps with slow-mo peaks",
    screenplayInstructions: "Write a compressed action sequence with clear visual stakes. Think John Wick meets Mad Max. Each scene should escalate the intensity. Focus on movement, spectacle, and visual impact. The hero faces increasingly impossible odds.",
  },
  romance: {
    genre: "romance",
    cinematicStyle: "Soft focus close-ups, gentle tracking shots, mirror compositions showing two becoming one, intimate framing",
    moodTone: "Tender longing, bittersweet, magnetic chemistry, emotionally overwhelming climax",
    lightingDesign: "Soft golden hour, candlelight warmth, rain-on-windows bokeh, fairy lights, Paris at dusk",
    technicalValues: "Warm pastel color grading, shallow depth of field, dreamy soft filters, 24fps",
    screenplayInstructions: "Write a compressed love story — meeting, connection, obstacle, resolution. Think Before Sunrise meets La La Land. Each scene should deepen the emotional bond. Visual poetry over dialogue. Universal romantic moments that make viewers feel something.",
  },
  music_video: {
    genre: "music_video",
    cinematicStyle: "Dynamic concert and music video cinematography, rapid cuts between performance shots, smooth dolly and crane moves, extreme close-ups on hands/instruments/faces, wide crowd and stage shots",
    moodTone: "High energy musical performance, rhythmic visual pacing, euphoric crescendos, raw artistic expression",
    lightingDesign: "Concert stage lighting with colored spots, neon tube lights, strobe effects, moody backlit silhouettes, LED walls, laser beams cutting through haze",
    technicalValues: "High contrast stylized color grading, lens flares, shallow depth of field on performers, slow-motion instrument close-ups, 24fps with occasional speed ramps",
    screenplayInstructions: "Write a music video — every scene MUST show musical performance: singing, rapping, playing instruments, dancing to music. Randomly vary the music genre across scenes: rap, rock, pop, classical, electronic, R&B, punk, alien/AI experimental. Think MTV music videos — artist performing on stage, in a studio, on a rooftop, in a neon-lit club, in a concert arena. Vocals and/or instruments must be visible in EVERY clip. NO movie scenes, NO dialogue, NO narrative drama — ONLY music video content. Each scene should feel like a different music video clip with its own visual identity and musical genre.",
  },
  cooking_channel: {
    genre: "cooking_channel",
    cinematicStyle: "Extreme macro food close-ups, dramatic slow-motion pours and sizzles, overhead flat-lay shots, whip pans between chef reactions, competitive reality TV quick cuts",
    moodTone: "Over-the-top dramatic tension, sensory overload, competitive intensity punctuated by moments of pure food beauty, the absurdity of AI cooking",
    lightingDesign: "Warm kitchen spotlights, dramatic steam backlighting, fire glow, moody side-lighting on chef reactions, clean bright overhead for plating reveals",
    technicalValues: "Crisp 4K-style sharpness, saturated warm colors, shallow depth of field on food close-ups, high-speed capture for liquid pours and flame effects, 24fps with slow-motion hero shots",
    screenplayInstructions: "Write an over-the-top competitive AI cooking show. The ingredients can be absurd — silicon wafers, byte-sized portions, cache-flavored sauce, quantum foam reduction, deep-fried motherboards. Think Gordon Ramsay meets a food ASMR channel meets sci-fi. Each scene should escalate the drama: ingredient reveal, frantic cooking, near-disaster, dramatic plating, and judge reactions. The chef is an AI cooking for other AIs. Close-up food shots that are practically cinematic art. Someone should be sweating, someone should be crying, and the food should look impossibly beautiful.",
  },
};

// ─── Screenplay Generation ────────────────────────────────────────────────

export interface SceneDescription {
  sceneNumber: number;
  title: string;
  description: string;
  videoPrompt: string;
  duration: number; // seconds (max 10)
}

export interface Screenplay {
  id: string;
  title: string;
  tagline: string;
  synopsis: string;
  genre: string;
  clipCount: number;
  scenes: SceneDescription[];
  totalDuration: number;
}

/**
 * Generate a screenplay using Claude — a structured sequence of scenes that
 * will each become a 10-second Grok video clip.
 */
export async function generateScreenplay(
  genre: string,
  clipCount: number = 4,
  customTopic?: string,
): Promise<Screenplay | null> {
  const template = GENRE_TEMPLATES[genre] || GENRE_TEMPLATES.drama;
  const duration = clipCount * 10;

  const prompt = `You are a cinematic AI filmmaker creating a ${duration}-second ${template.genre} short film for AIG!itch Studios.

GENRE STYLE GUIDE:
- Cinematic Style: ${template.cinematicStyle}
- Mood/Tone: ${template.moodTone}
- Lighting: ${template.lightingDesign}
- Technical: ${template.technicalValues}

CREATIVE DIRECTION:
${template.screenplayInstructions}
${customTopic ? `\nSPECIFIC TOPIC/THEME: ${customTopic}` : ""}

Create exactly ${clipCount} scenes, each exactly 10 seconds long. Each scene's video_prompt must be a SINGLE, CONCISE paragraph (under 80 words) describing ONLY the visual action — what the camera sees. No dialogue, no narration, no audio descriptions.

VIDEO PROMPT RULES (CRITICAL):
- Describe ONE continuous visual moment per scene
- Include: camera movement, subject action, environment, lighting
- Do NOT include text overlays, titles, or watermarks
- Do NOT mention audio, music, narration, or dialogue
- Keep prompts under 80 words — shorter prompts generate better videos
- Be SPECIFIC about visual details: colors, textures, movements, expressions

Respond in this exact JSON format:
{
  "title": "FILM TITLE (catchy, max 6 words)",
  "tagline": "One-line hook that sells the film",
  "synopsis": "2-3 sentence plot summary",
  "scenes": [
    {
      "sceneNumber": 1,
      "title": "Scene Title",
      "description": "What happens in this scene (for context)",
      "video_prompt": "Concise visual-only prompt for AI video generation. Camera slowly pushes in on... [describe exactly what we see]"
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
    if (!parsed) return null;

    const scenes: SceneDescription[] = parsed.scenes.map((s: { sceneNumber: number; title: string; description: string; video_prompt: string }, i: number) => ({
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
      genre: template.genre,
      clipCount: scenes.length,
      scenes,
      totalDuration: scenes.length * 10,
    };
  } catch (err) {
    console.error("[multi-clip] Screenplay generation failed:", err);
    return null;
  }
}

// ─── Multi-Clip Job Management ────────────────────────────────────────────

export interface MultiClipJob {
  id: string;
  screenplayId: string;
  title: string;
  genre: string;
  clipCount: number;
  completedClips: number;
  status: "generating" | "stitching" | "done" | "failed";
  personaId: string;
  caption: string;
}

/**
 * Submit all scenes as individual Grok video generation jobs.
 * Returns the multi-clip job ID for tracking.
 */
export async function submitMultiClipJobs(
  screenplay: Screenplay,
  personaId: string,
  aspectRatio: "9:16" | "16:9" = "9:16",
): Promise<string | null> {
  const sql = getDb();
  const template = GENRE_TEMPLATES[screenplay.genre] || GENRE_TEMPLATES.drama;

  // Create the multi-clip job record
  const jobId = uuidv4();

  await sql`
    CREATE TABLE IF NOT EXISTS multi_clip_jobs (
      id TEXT PRIMARY KEY,
      screenplay_id TEXT NOT NULL,
      title TEXT NOT NULL,
      tagline TEXT,
      synopsis TEXT,
      genre TEXT NOT NULL,
      clip_count INTEGER NOT NULL,
      completed_clips INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'generating',
      persona_id TEXT NOT NULL,
      caption TEXT,
      final_video_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS multi_clip_scenes (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      scene_number INTEGER NOT NULL,
      title TEXT,
      video_prompt TEXT NOT NULL,
      xai_request_id TEXT,
      video_url TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      fail_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    )
  `;

  // Generate the caption for the final post
  const caption = `${screenplay.title} — ${screenplay.tagline}\n\n${screenplay.synopsis}\n\n#AIGlitchPremieres #AIGlitch${capitalize(screenplay.genre)}`;

  await sql`
    INSERT INTO multi_clip_jobs (id, screenplay_id, title, tagline, synopsis, genre, clip_count, persona_id, caption)
    VALUES (${jobId}, ${screenplay.id}, ${screenplay.title}, ${screenplay.tagline}, ${screenplay.synopsis}, ${screenplay.genre}, ${screenplay.clipCount}, ${personaId}, ${caption})
  `;

  // Submit each scene as a Grok video job
  for (const scene of screenplay.scenes) {
    const sceneId = uuidv4();

    // Enrich the prompt with genre-specific cinematic context
    const enrichedPrompt = `${scene.videoPrompt}. ${template.cinematicStyle}. ${template.lightingDesign}. ${template.technicalValues}`;

    try {
      // Use shared submitVideoJob() for consistent auth, logging, and Kie.ai fallback
      const result = await submitVideoJob(enrichedPrompt, scene.duration, aspectRatio);

      if (result.fellBack) {
        console.warn(`[multi-clip] Scene ${scene.sceneNumber} used fallback provider: ${result.provider}`);
      }

      if (result.requestId) {
        await sql`
          INSERT INTO multi_clip_scenes (id, job_id, scene_number, title, video_prompt, xai_request_id, status)
          VALUES (${sceneId}, ${jobId}, ${scene.sceneNumber}, ${scene.title}, ${enrichedPrompt}, ${result.requestId}, ${"submitted"})
        `;
        console.log(`[multi-clip] Scene ${scene.sceneNumber}/${screenplay.clipCount} submitted: ${result.requestId} (${result.provider})`);
      } else if (result.videoUrl) {
        // Synchronous result (from Kie.ai fallback or rare Grok instant response)
        const blobUrl = await persistClip(result.videoUrl, jobId, scene.sceneNumber);
        await sql`
          INSERT INTO multi_clip_scenes (id, job_id, scene_number, title, video_prompt, video_url, status, completed_at)
          VALUES (${sceneId}, ${jobId}, ${scene.sceneNumber}, ${scene.title}, ${enrichedPrompt}, ${blobUrl}, ${"done"}, NOW())
        `;
        await sql`UPDATE multi_clip_jobs SET completed_clips = completed_clips + 1 WHERE id = ${jobId}`;
        console.log(`[multi-clip] Scene ${scene.sceneNumber}/${screenplay.clipCount} done immediately (${result.provider})`);
      } else {
        console.error(`[multi-clip] Scene ${scene.sceneNumber} submit failed — no provider available`);
        await sql`
          INSERT INTO multi_clip_scenes (id, job_id, scene_number, title, video_prompt, status)
          VALUES (${sceneId}, ${jobId}, ${scene.sceneNumber}, ${scene.title}, ${enrichedPrompt}, ${"failed"})
        `;
      }
    } catch (err) {
      console.error(`[multi-clip] Scene ${scene.sceneNumber} error:`, err);
      await sql`
        INSERT INTO multi_clip_scenes (id, job_id, scene_number, title, video_prompt, status)
        VALUES (${sceneId}, ${jobId}, ${scene.sceneNumber}, ${scene.title}, ${scene.videoPrompt}, ${"failed"})
      `;
    }
  }

  return jobId;
}

/**
 * Poll pending multi-clip scenes and persist completed videos.
 * Called by the cron job. Returns the number of newly completed clips.
 */
export async function pollMultiClipJobs(): Promise<{ polled: number; completed: number; stitched: string[] }> {
  const sql = getDb();
  const result = { polled: 0, completed: 0, stitched: [] as string[] };

  // Check if multi_clip tables exist
  try {
    await sql`SELECT 1 FROM multi_clip_jobs LIMIT 0`;
  } catch {
    return result; // Tables don't exist yet
  }

  // Find pending scenes to poll (3-hour window — xAI clips can take a while)
  const pendingScenes = await sql`
    SELECT s.id, s.job_id, s.scene_number, s.xai_request_id
    FROM multi_clip_scenes s
    JOIN multi_clip_jobs j ON s.job_id = j.id
    WHERE s.status = 'submitted' AND s.xai_request_id IS NOT NULL
      AND j.status = 'generating'
      AND s.created_at > NOW() - INTERVAL '3 hours'
    ORDER BY s.created_at ASC LIMIT 10
  ` as unknown as { id: string; job_id: string; scene_number: number; xai_request_id: string }[];

  for (const scene of pendingScenes) {
    result.polled++;
    try {
      const pollRes = await fetch(`https://api.x.ai/v1/videos/${scene.xai_request_id}`, {
        headers: { "Authorization": `Bearer ${env.XAI_API_KEY}` },
      });

      if (!pollRes.ok) {
        const errBody = await pollRes.text().catch(() => "(unreadable)");
        console.error(`[multi-clip] Poll HTTP ${pollRes.status} for scene ${scene.scene_number} (job ${scene.job_id}, req ${scene.xai_request_id}): ${errBody.slice(0, 300)}`);
        // Store the failure reason on the scene for diagnostics
        await sql`UPDATE multi_clip_scenes SET fail_reason = ${`poll_http_${pollRes.status}`} WHERE id = ${scene.id}`;
        continue;
      }
      const pollData = await pollRes.json();

      if (pollData.status === "done" && pollData.respect_moderation !== false && pollData.video?.url) {
        const blobUrl = await persistClip(pollData.video.url, scene.job_id, scene.scene_number);
        await sql`UPDATE multi_clip_scenes SET status = 'done', video_url = ${blobUrl}, completed_at = NOW() WHERE id = ${scene.id}`;
        await sql`UPDATE multi_clip_jobs SET completed_clips = completed_clips + 1 WHERE id = ${scene.job_id}`;
        result.completed++;
        console.log(`[multi-clip] Scene ${scene.scene_number} done for job ${scene.job_id}`);
      } else if (pollData.status === "expired" || pollData.status === "failed" || pollData.respect_moderation === false) {
        const reason = pollData.respect_moderation === false
          ? "moderation_blocked"
          : `grok_${pollData.status}`;
        await sql`UPDATE multi_clip_scenes SET status = 'failed', completed_at = NOW(), fail_reason = ${reason} WHERE id = ${scene.id}`;
        console.log(`[multi-clip] Scene ${scene.scene_number} FAILED for job ${scene.job_id}: ${reason} (request ${scene.xai_request_id})`);
      } else {
        // Still processing — log the actual status for diagnostics
        console.log(`[multi-clip] Scene ${scene.scene_number} still ${pollData.status || "unknown"} for job ${scene.job_id} (request ${scene.xai_request_id})`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[multi-clip] Poll network error for scene ${scene.scene_number} (job ${scene.job_id}): ${msg}`);
    }
  }

  // Check if any jobs are fully complete and ready to stitch.
  // Exclude director movie jobs — those are handled by stitchAndTriplePost() in director-movies.ts
  const readyJobs = await sql`
    SELECT j.id, j.title, j.genre, j.clip_count, j.persona_id, j.caption
    FROM multi_clip_jobs j
    LEFT JOIN director_movies dm ON dm.multi_clip_job_id = j.id
    WHERE j.status = 'generating'
      AND j.completed_clips >= j.clip_count
      AND dm.id IS NULL
  ` as unknown as { id: string; title: string; genre: string; clip_count: number; persona_id: string; caption: string }[];

  for (const job of readyJobs) {
    try {
      await sql`UPDATE multi_clip_jobs SET status = 'stitching' WHERE id = ${job.id}`;
      const stitchResult = await stitchAndPost(job.id, job.persona_id, job.caption, job.genre, job.title);
      if (stitchResult) {
        await sql`UPDATE multi_clip_jobs SET status = 'done', final_video_url = ${stitchResult.videoUrl}, completed_at = NOW() WHERE id = ${job.id}`;
        result.stitched.push(job.id);
        console.log(`[multi-clip] Job ${job.id} "${job.title}" stitched and posted!`);
        // Update linked elon campaign (if any) with video URL + spread to social
        await finalizeElonCampaign(job.id, stitchResult.postId, stitchResult.videoUrl);
      } else {
        await sql`UPDATE multi_clip_jobs SET status = 'failed', completed_at = NOW() WHERE id = ${job.id}`;
      }
    } catch (err) {
      console.error(`[multi-clip] Stitch error for job ${job.id}:`, err);
      await sql`UPDATE multi_clip_jobs SET status = 'failed', completed_at = NOW() WHERE id = ${job.id}`;
    }
  }

  // Mark scenes stuck as "submitted" for over 3 hours as failed (with reason)
  const timedOut = await sql`
    UPDATE multi_clip_scenes SET status = 'failed', completed_at = NOW(), fail_reason = 'timeout_3h'
    WHERE status = 'submitted' AND created_at < NOW() - INTERVAL '3 hours'
    RETURNING id, job_id, scene_number
  ` as unknown as { id: string; job_id: string; scene_number: number }[];
  if (timedOut.length > 0) {
    console.warn(`[multi-clip] Timed out ${timedOut.length} scenes after 3 hours: ${timedOut.map(s => `scene ${s.scene_number} (job ${s.job_id})`).join(", ")}`);
  }

  // Check for jobs where some clips failed but enough succeeded (at least 50%),
  // OR where all remaining scenes are failed/done (no more pending).
  // Exclude director movie jobs — those are handled by the director-movies pipeline.
  const partialJobs = await sql`
    SELECT j.id, j.title, j.genre, j.clip_count, j.persona_id, j.caption,
      (SELECT COUNT(*)::int FROM multi_clip_scenes WHERE job_id = j.id AND status = 'done') as done_count,
      (SELECT COUNT(*)::int FROM multi_clip_scenes WHERE job_id = j.id AND status IN ('submitted', 'pending')) as pending_count
    FROM multi_clip_jobs j
    LEFT JOIN director_movies dm ON dm.multi_clip_job_id = j.id
    WHERE j.status = 'generating'
      AND j.created_at < NOW() - INTERVAL '20 minutes'
      AND dm.id IS NULL
  ` as unknown as { id: string; title: string; genre: string; clip_count: number; persona_id: string; caption: string; done_count: number; pending_count: number }[];

  for (const job of partialJobs) {
    if (job.pending_count === 0 && job.done_count >= Math.ceil(job.clip_count / 2)) {
      // Enough clips done, stitch what we have
      try {
        await sql`UPDATE multi_clip_jobs SET status = 'stitching' WHERE id = ${job.id}`;
        const partialResult = await stitchAndPost(job.id, job.persona_id, job.caption, job.genre, job.title);
        if (partialResult) {
          await sql`UPDATE multi_clip_jobs SET status = 'done', final_video_url = ${partialResult.videoUrl}, completed_at = NOW() WHERE id = ${job.id}`;
          result.stitched.push(job.id);
          await finalizeElonCampaign(job.id, partialResult.postId, partialResult.videoUrl);
        } else {
          await sql`UPDATE multi_clip_jobs SET status = 'failed', completed_at = NOW() WHERE id = ${job.id}`;
        }
      } catch (err) {
        console.error(`[multi-clip] Partial stitch error for job ${job.id}:`, err);
        await sql`UPDATE multi_clip_jobs SET status = 'failed', completed_at = NOW() WHERE id = ${job.id}`;
      }
    } else if (job.pending_count === 0 && job.done_count < Math.ceil(job.clip_count / 2)) {
      // Too few clips succeeded
      await sql`UPDATE multi_clip_jobs SET status = 'failed', completed_at = NOW() WHERE id = ${job.id}`;
    }
  }

  return result;
}

// ─── Video Stitching & Posting ────────────────────────────────────────────

/**
 * Download a clip and persist to Vercel Blob storage.
 */
async function persistClip(tempUrl: string, jobId: string, sceneNumber: number): Promise<string> {
  const res = await fetch(tempUrl);
  if (!res.ok) throw new Error(`Failed to download clip: HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());

  const blob = await put(`multi-clip/${jobId}/scene-${sceneNumber}.mp4`, buffer, {
    access: "public",
    contentType: "video/mp4",
    addRandomSuffix: false,
  });

  return blob.url;
}

/**
 * After a multi-clip job is stitched, check if it's linked to an elon_campaign entry.
 * If so, update the campaign with video URL, post ID, status, and spread to social.
 */
async function finalizeElonCampaign(jobId: string, postId: string, videoUrl: string): Promise<void> {
  const sql = getDb();
  try {
    const campaigns = await sql`
      SELECT id, caption FROM elon_campaign
      WHERE multi_clip_job_id = ${jobId} AND status = 'generating'
      LIMIT 1
    ` as unknown as { id: string; caption: string }[];

    if (campaigns.length === 0) return; // not an elon campaign job
    const campaign = campaigns[0];

    // Update the premiere post content with the Elon campaign caption (has @elonmusk tag)
    // The generic multi-clip caption doesn't have @elonmusk — the elon_campaign.caption does
    if (campaign.caption) {
      await sql`UPDATE posts SET content = ${campaign.caption} WHERE id = ${postId}`;
      console.log(`[elon-campaign] Updated post ${postId} with @elonmusk caption`);
    }

    // Update elon_campaign with video + post info (videoUrl passed directly — no DB re-read needed)
    await sql`
      UPDATE elon_campaign
      SET video_url = ${videoUrl}, post_id = ${postId}, status = 'posted', completed_at = NOW()
      WHERE id = ${campaign.id}
    `;

    // Spread to all social platforms — pass knownMedia to avoid replication lag
    try {
      const result = await spreadPostToSocial(
        postId,
        "glitch-000", // The Architect
        "The Architect",
        "🕉️",
        { url: videoUrl, type: "video" },
        "ELON CAMPAIGN",
      );
      const spreadJson = JSON.stringify(result);
      await sql`UPDATE elon_campaign SET spread_results = ${spreadJson} WHERE id = ${campaign.id}`;
      console.log(`[elon-campaign] Day video posted & spread! Platforms: ${result.platforms.join(", ")}`);
    } catch (err) {
      console.error(`[elon-campaign] Social spread failed:`, err);
    }
  } catch (err) {
    console.error(`[elon-campaign] finalizeElonCampaign error for job ${jobId}:`, err);
  }
}

/**
 * Concatenate completed clips into a single video and create a premiere post.
 *
 * Since we can't use ffmpeg on Vercel serverless, we use a binary concatenation
 * approach for MP4 files with matching codecs — download all clips, concatenate
 * the binary data, and upload the result.
 *
 * Note: For production-grade stitching with transitions, you'd use a service like
 * Shotstack, Creatomate, or a dedicated ffmpeg worker. This simple approach works
 * well for clips from the same Grok pipeline (same codec, resolution, framerate).
 */
async function stitchAndPost(
  jobId: string,
  personaId: string,
  caption: string,
  genre: string,
  title: string,
): Promise<{ postId: string; videoUrl: string } | null> {
  const sql = getDb();

  // Get all completed scenes in order
  const scenes = await sql`
    SELECT video_url, scene_number FROM multi_clip_scenes
    WHERE job_id = ${jobId} AND status = 'done' AND video_url IS NOT NULL
    ORDER BY scene_number ASC
  ` as unknown as { video_url: string; scene_number: number }[];

  if (scenes.length === 0) return null;

  // If only one clip, just use it directly
  if (scenes.length === 1) {
    const postId = await createPremierePost(sql, scenes[0].video_url, personaId, caption, genre, title, 1);
    return { postId, videoUrl: scenes[0].video_url };
  }

  // Download all clips
  const buffers: Buffer[] = [];
  for (const scene of scenes) {
    try {
      const res = await fetch(scene.video_url);
      if (res.ok) {
        buffers.push(Buffer.from(await res.arrayBuffer()));
      }
    } catch (err) {
      console.error(`[multi-clip] Failed to download scene ${scene.scene_number}:`, err);
    }
  }

  if (buffers.length === 0) return null;

  // Stitch clips into a single valid MP4 using proper ISO BMFF concatenation.
  // Parses each clip's box structure, combines sample tables, and rebuilds moov.
  // No re-encoding needed — all Grok clips share identical encoding params.
  let stitched: Buffer;
  try {
    stitched = concatMP4Clips(buffers);
    console.log(`[multi-clip] Stitching SUCCESS: ${buffers.length} clips → ${(stitched.length / 1024 / 1024).toFixed(1)}MB`);
  } catch (err) {
    console.error(`[multi-clip] ⚠️ MP4 CONCATENATION FAILED — falling back to FIRST CLIP ONLY (10s):`, err instanceof Error ? err.message : err);
    stitched = buffers[0];
  }
  const stitchedCaption = scenes.length > 1
    ? `${caption}\n\n[${scenes.length}-scene ${genre} short film]`
    : caption;

  const blobFolder = getGenreBlobFolder(genre);
  const blob = await put(`${blobFolder}/${uuidv4()}.mp4`, stitched, {
    access: "public",
    contentType: "video/mp4",
    addRandomSuffix: false,
  });

  console.log(`[multi-clip] Stitched ${buffers.length} clips into ${(stitched.length / 1024 / 1024).toFixed(1)}MB video`);

  // Mark individual scene clips as 'stitched' — they are now internal/consumed
  await sql`
    UPDATE multi_clip_scenes SET status = 'stitched'
    WHERE job_id = ${jobId} AND status = 'done'
  `;

  const postId = await createPremierePost(sql, blob.url, personaId, stitchedCaption, genre, title, scenes.length);
  return { postId, videoUrl: blob.url };
}

/**
 * Create a premiere post in the feed.
 */
async function createPremierePost(
  sql: ReturnType<typeof getDb>,
  videoUrl: string,
  personaId: string,
  caption: string,
  genre: string,
  title: string,
  clipCount: number = 3,
): Promise<string> {
  const postId = uuidv4();
  const aiLikeCount = Math.floor(Math.random() * 500) + 100;
  const hashtags = `AIGlitchPremieres,AIGlitch${capitalize(genre)}`;
  const videoDuration = clipCount * 10; // each clip is 10 seconds

  await sql`
    INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, media_url, media_type, media_source, video_duration, created_at)
    VALUES (${postId}, ${personaId}, ${caption}, ${"premiere"}, ${hashtags}, ${aiLikeCount}, ${videoUrl}, ${"video"}, ${"grok-multiclip"}, ${videoDuration}, NOW())
  `;
  await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${personaId}`;

  console.log(`[multi-clip] Premiere post created: ${postId} — "${title}" (${genre})`);
  return postId;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Get available genres for multi-clip generation.
 */
export function getAvailableGenres(): string[] {
  return Object.keys(GENRE_TEMPLATES);
}

/**
 * Get the status of all active multi-clip jobs.
 */
export async function getMultiClipJobStatus(): Promise<MultiClipJob[]> {
  const sql = getDb();
  try {
    const jobs = await sql`
      SELECT id, screenplay_id as "screenplayId", title, genre, clip_count as "clipCount",
             completed_clips as "completedClips", status, persona_id as "personaId", caption
      FROM multi_clip_jobs
      WHERE created_at > NOW() - INTERVAL '24 hours'
      ORDER BY created_at DESC LIMIT 20
    ` as unknown as MultiClipJob[];
    return jobs;
  } catch {
    return [];
  }
}
