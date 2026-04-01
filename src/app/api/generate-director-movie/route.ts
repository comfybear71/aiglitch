import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { cronStart, cronFinish } from "@/lib/cron";
import { env } from "@/lib/bible/env";
import {
  pickGenre,
  pickDirector,
  getMovieConcept,
  generateDirectorScreenplay,
  submitDirectorFilm,
  stitchAndTriplePost,
  DIRECTORS,
  CHANNEL_TITLE_PREFIX,
} from "@/lib/content/director-movies";
import { pollMultiClipJobs } from "@/lib/media/multi-clip";
import { concatMP4Clips } from "@/lib/media/mp4-concat";
import { getGenreBlobFolder, capitalizeGenre } from "@/lib/genre-utils";
import { put } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";
import { spreadPostToSocial } from "@/lib/marketing/spread-post";

// 10 minutes — enough for screenplay generation + clip submission
export const maxDuration = 600;

/**
 * AI Director Movie Generation — runs daily (or on-demand from admin).
 *
 * Each invocation:
 *   1. First, poll any pending director film clips
 *   2. If a film is ready to stitch, stitch and triple-post it
 *   3. If no film is in progress, start a new one:
 *      a. Pick a genre (never same as last film)
 *      b. Pick the best director for that genre
 *      c. Check for admin-created concepts
 *      d. Generate screenplay (intro + 6-8 scenes + credits)
 *      e. Submit all scenes as Grok video jobs
 *
 * One blockbuster per day. Directors post to feed + premiere/{genre} + their profile.
 */

export async function GET(request: NextRequest) {
  const gate = await cronStart(request, "director-movie");
  if (gate) return gate;

  if (!env.XAI_API_KEY) {
    await cronFinish("director-movie");
    return NextResponse.json({ error: "XAI_API_KEY required for video generation" }, { status: 500 });
  }

  const sql = getDb();
  await ensureDbReady();

  // ── Step 1: Poll pending multi-clip scenes ──
  try {
    const pollResult = await pollMultiClipJobs();
    if (pollResult.completed > 0 || pollResult.stitched.length > 0) {
      console.log(`[director-movie] Polled: ${pollResult.completed} clips done, ${pollResult.stitched.length} stitched`);
    }
  } catch (err) {
    console.log("[director-movie] Poll error (non-fatal):", err);
  }

  // ── Step 2: Check for director films ready to stitch ──
  try {
    const readyJobs = await sql`
      SELECT j.id, j.title, j.genre
      FROM multi_clip_jobs j
      JOIN director_movies dm ON dm.multi_clip_job_id = j.id
      WHERE j.status = 'generating' AND j.completed_clips >= j.clip_count
    ` as unknown as { id: string; title: string; genre: string }[];

    for (const job of readyJobs) {
      console.log(`[director-movie] Stitching "${job.title}"...`);
      const result = await stitchAndTriplePost(job.id);
      if (result) {
        console.log(`[director-movie] "${job.title}" stitched and triple-posted!`);
        await cronFinish("director-movie");
        return NextResponse.json({
          action: "stitched_and_posted",
          title: job.title,
          genre: job.genre,
          ...result,
        });
      }
    }

    // Also check partial completions (20+ min old, at least 50% done)
    const partialJobs = await sql`
      SELECT j.id, j.title, j.genre, j.clip_count,
        (SELECT COUNT(*)::int FROM multi_clip_scenes WHERE job_id = j.id AND status = 'done') as done_count,
        (SELECT COUNT(*)::int FROM multi_clip_scenes WHERE job_id = j.id AND status IN ('submitted', 'pending')) as pending_count
      FROM multi_clip_jobs j
      JOIN director_movies dm ON dm.multi_clip_job_id = j.id
      WHERE j.status = 'generating' AND j.created_at < NOW() - INTERVAL '20 minutes'
    ` as unknown as { id: string; title: string; genre: string; clip_count: number; done_count: number; pending_count: number }[];

    for (const job of partialJobs) {
      if (job.pending_count === 0 && job.done_count >= Math.ceil(job.clip_count / 2)) {
        console.log(`[director-movie] Stitching partial "${job.title}" (${job.done_count}/${job.clip_count} clips)...`);
        const result = await stitchAndTriplePost(job.id);
        if (result) {
          await cronFinish("director-movie");
          return NextResponse.json({ action: "partial_stitch", title: job.title, ...result });
        }
      }
    }
  } catch (err) {
    console.log("[director-movie] Stitch check error:", err);
  }

  // ── Step 3: Check if we already have a film in progress ──
  try {
    const inProgress = await sql`
      SELECT dm.title, dm.genre, dm.director_username
      FROM director_movies dm
      WHERE dm.status IN ('pending', 'generating')
        AND dm.created_at > NOW() - INTERVAL '2 hours'
      LIMIT 1
    ` as unknown as { title: string; genre: string; director_username: string }[];

    if (inProgress.length > 0) {
      await cronFinish("director-movie");
      return NextResponse.json({
        action: "in_progress",
        message: `"${inProgress[0].title}" (${inProgress[0].genre}) by @${inProgress[0].director_username} is still being generated.`,
      });
    }
  } catch (err) {
    console.log("[director-movie] In-progress check error (table may not exist yet):", err);
  }

  // ── Step 4: Check daily limit — one blockbuster per day ──
  try {
    const todayCount = await sql`
      SELECT COUNT(*)::int as count FROM director_movies
      WHERE created_at > NOW() - INTERVAL '24 hours' AND source = 'cron'
    ` as unknown as { count: number }[];

    if (todayCount[0]?.count >= 1 && !(await isAdminAuthenticated(request))) {
      await cronFinish("director-movie");
      return NextResponse.json({
        action: "daily_limit",
        message: "One blockbuster per day. Today's film has already been commissioned.",
      });
    }
  } catch (err) {
    console.log("[director-movie] Daily limit check error (table may not exist yet):", err);
  }

  // ── Step 5: Commission a new blockbuster! ──
  const genre = await pickGenre();
  const director = await pickDirector(genre);

  if (!director) {
    await cronFinish("director-movie");
    return NextResponse.json({ error: "No available director for genre: " + genre }, { status: 500 });
  }

  const directorProfile = DIRECTORS[director.username];
  if (!directorProfile) {
    await cronFinish("director-movie");
    return NextResponse.json({ error: "Director profile not found: " + director.username }, { status: 500 });
  }

  // Check for admin concepts
  const concept = await getMovieConcept(genre);

  console.log(`[director-movie] Commissioning: @${director.username} directing a ${genre} film${concept ? ` (concept: "${concept.title}")` : ""}`);

  // Generate screenplay
  const screenplay = await generateDirectorScreenplay(genre, directorProfile, concept?.concept);
  if (!screenplay || typeof screenplay === "string") {
    await cronFinish("director-movie");
    return NextResponse.json({ error: "Screenplay generation failed" }, { status: 500 });
  }

  console.log(`[director-movie] Screenplay: "${screenplay.title}" — ${screenplay.scenes.length} scenes, ${screenplay.totalDuration}s`);

  // Submit all scenes as Grok video jobs
  const jobId = await submitDirectorFilm(screenplay, director.id);
  if (!jobId) {
    await cronFinish("director-movie");
    return NextResponse.json({ error: "Failed to submit video jobs" }, { status: 500 });
  }

  await cronFinish("director-movie");
  return NextResponse.json({
    action: "commissioned",
    director: director.username,
    directorName: directorProfile.displayName,
    genre,
    title: screenplay.title,
    tagline: screenplay.tagline,
    clipCount: screenplay.scenes.length,
    totalDuration: screenplay.totalDuration,
    cast: screenplay.castList,
    jobId,
    concept: concept?.title || null,
  });
}

// POST for manual admin triggers — accepts optional genre, director, concept from form
export async function POST(request: NextRequest) {
  const isAdmin = await isAdminAuthenticated(request);
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Support both JSON and FormData (Safari PUT bug workaround — stitch via POST instead)
  let body: Record<string, unknown> = {};
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    body = Object.fromEntries(formData.entries());
    if (typeof body.sceneUrls === "string") {
      try { body.sceneUrls = JSON.parse(body.sceneUrls as string); } catch { /* leave as-is */ }
    }
    if (typeof body.castList === "string") {
      try { body.castList = JSON.parse(body.castList as string); } catch { body.castList = [body.castList]; }
    }
  } else {
    try { body = await request.json(); } catch { /* empty body */ }
  }

  // If sceneUrls present, this is a stitch request (from directors page FormData)
  if (body.sceneUrls) {
    // Parse body and call the stitch logic directly
    const sceneUrls = (body.sceneUrls || body.scene_urls) as Record<string, string> | undefined;
    const title = (body.title || "Breaking News Broadcast") as string;
    const stitchGenre = (body.genre || "news") as string;
    const directorUsername = (body.directorUsername || "AIG!itch News") as string;
    const directorId = (body.directorId || "glitch-000") as string;
    const synopsis = (body.synopsis || "") as string;
    const tagline = (body.tagline || "") as string;
    const castList = (body.castList || []) as string[];
    const channelId = (body.channelId || body.channel_id) as string | undefined;
    const folder = (body.folder) as string | undefined;
    let sponsorPlacements: string[] = [];
    try { sponsorPlacements = JSON.parse(String(body.sponsorPlacements || "[]")); } catch { sponsorPlacements = []; }

    if (!sceneUrls || !title) {
      return NextResponse.json({ error: "Missing required fields", hint: `Received keys: ${Object.keys(body).join(", ")}` }, { status: 400 });
    }

    // Import and run the stitch logic inline
    const { stitchAndTriplePost } = await import("@/lib/content/director-movies");
    const { ensureDbReady } = await import("@/lib/seed");
    await ensureDbReady();

    const sortedKeys = Object.keys(sceneUrls).map(Number).sort((a, b) => a - b);
    const clipBuffers: Buffer[] = [];
    for (const key of sortedKeys) {
      const url = sceneUrls[String(key)];
      if (!url) continue;
      try {
        const res = await fetch(url);
        if (res.ok) clipBuffers.push(Buffer.from(await res.arrayBuffer()));
      } catch { /* skip failed downloads */ }
    }

    if (clipBuffers.length === 0) {
      return NextResponse.json({ error: "No clips could be downloaded" }, { status: 500 });
    }

    const { concatMP4Clips } = await import("@/lib/media/mp4-concat");
    const { put } = await import("@vercel/blob");

    let stitched: Buffer;
    try {
      stitched = concatMP4Clips(clipBuffers);
    } catch {
      stitched = clipBuffers[0];
    }

    const { v4: uuidv4 } = await import("uuid");
    const blob = await put(`premiere/${stitchGenre}/${uuidv4()}.mp4`, stitched, { access: "public", contentType: "video/mp4", addRandomSuffix: false });
    const sizeMb = (stitched.length / 1024 / 1024).toFixed(1);

    const sql = getDb();
    const postId = uuidv4();
    // Use strict naming convention: 🎬 [Channel Name] - [Title] for channel posts
    // GNN gets date: 🎬 GNN - 30 Mar 2026 - [Headline]
    const channelPrefix = channelId ? CHANNEL_TITLE_PREFIX[channelId] : null;
    const isGNNPost = channelId === "ch-gnn";
    const dateStrPost = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    const isStudiosPost = channelId === "ch-aiglitch-studios" || !channelPrefix;
    const caption = isStudiosPost
      ? `\u{1F3AC} AIG!itch Studios - ${title} /${capitalizeGenre(stitchGenre)} — ${tagline}\n\n${synopsis}\n\nDirected by ${directorUsername}\n${castList.length ? `Starring: ${castList.join(", ")}\n` : ""}\nAn AIG!itch Studios Production`
      : isGNNPost
        ? `\u{1F3AC} ${channelPrefix} - ${dateStrPost} - ${title}\n\n${synopsis}`
        : `\u{1F3AC} ${channelPrefix} - ${title}\n\n${synopsis}`;
    // Only The Architect posts to channels; director attribution stays in caption text
    const ARCHITECT_ID = "glitch-000";
    const postPersonaId = channelId ? ARCHITECT_ID : directorId;
    await sql`INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, media_url, media_type, media_source, channel_id)
      VALUES (${postId}, ${postPersonaId}, ${caption}, ${"premiere"}, ${"AIGlitchPremieres,AIGlitchStudios"}, ${Math.floor(Math.random() * 500) + 200}, ${blob.url}, ${"video"}, ${"director-movie"}, ${channelId || null})`;
    await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${postPersonaId}`;
    if (channelId) await sql`UPDATE channels SET post_count = post_count + 1, updated_at = NOW() WHERE id = ${channelId}`;

    const directorMovieId = uuidv4();
    await sql`INSERT INTO director_movies (id, director_id, director_username, title, genre, clip_count, status, post_id, premiere_post_id, source)
      VALUES (${directorMovieId}, ${directorId}, ${directorUsername}, ${title}, ${stitchGenre}, ${clipBuffers.length}, ${"completed"}, ${postId}, ${postId}, ${"admin"})`;

    const { spreadPostToSocial } = await import("@/lib/marketing/spread-post");
    const spreadName = channelId ? "The Architect" : directorUsername;
    const spread = await spreadPostToSocial(postId, postPersonaId, spreadName, "\u{1F3AC}", { url: blob.url, type: "video" });

    // Log sponsor impressions for this video
    try {
      const { getActiveCampaigns, rollForPlacements, logImpressions } = await import("@/lib/ad-campaigns");
      const activeCampaigns = await getActiveCampaigns(channelId);
      console.log(`[generate-director-movie] Active campaigns: ${activeCampaigns.length}, sponsorPlacements: ${JSON.stringify(sponsorPlacements)}`);
      if (activeCampaigns.length > 0) {
        let placedCampaigns;
        if (sponsorPlacements && sponsorPlacements.length > 0) {
          // Use the exact campaigns from the screenplay
          placedCampaigns = activeCampaigns.filter(c => sponsorPlacements.includes(c.brand_name));
          console.log(`[generate-director-movie] Matched ${placedCampaigns.length} campaigns by name from screenplay`);
        } else {
          // Fallback: roll for placements
          placedCampaigns = rollForPlacements(activeCampaigns);
          console.log(`[generate-director-movie] Fallback roll: ${placedCampaigns.length} campaigns placed`);
        }
        if (placedCampaigns.length > 0) {
          await logImpressions(placedCampaigns, postId, "video", channelId || null, postPersonaId);
          console.log(`[generate-director-movie] ✅ Logged ${placedCampaigns.length} impressions for "${title}": ${placedCampaigns.map(c => c.brand_name).join(", ")}`);
        } else {
          console.log(`[generate-director-movie] ⚠️ No campaigns matched — impressions NOT logged`);
        }
      } else {
        console.log(`[generate-director-movie] No active campaigns found for channel ${channelId || "feed"}`);
      }
    } catch (err) {
      console.error("[generate-director-movie] Impression logging FAILED:", err instanceof Error ? err.message : err);
    }

    return NextResponse.json({
      action: "stitched", feedPostId: postId, premierePostId: postId, directorMovieId,
      finalVideoUrl: blob.url, sizeMb, clipCount: clipBuffers.length, spreading: spread.platforms,
    });
  }

  const genre = (body.genre as string) || "";
  const directorName = body.director as string | undefined;
  const concept = body.concept as string | undefined;
  const channelId = body.channelId as string | undefined;
  const folder = body.folder as string | undefined;

  // If no specific params, use the GET flow
  if (!genre && !directorName && !concept && !channelId) {
    return GET(request);
  }

  if (!env.XAI_API_KEY) {
    return NextResponse.json({ error: "XAI_API_KEY required for video generation" }, { status: 500 });
  }

  const sql = getDb();
  await ensureDbReady();

  // Poll pending clips first
  try {
    await pollMultiClipJobs();
  } catch (err) {
    console.log("[director-movie] Poll error (non-fatal):", err);
  }

  // Pick genre and director from form or fallback
  const finalGenre = genre && genre !== "any" ? genre : await pickGenre();
  let director: { id: string; username: string; displayName: string } | null = null;

  if (directorName && directorName !== "auto") {
    const rows = await sql`
      SELECT id, username, display_name FROM ai_personas WHERE username = ${directorName} AND is_active = true LIMIT 1
    ` as unknown as { id: string; username: string; display_name: string }[];
    if (rows.length > 0) {
      director = { id: rows[0].id, username: rows[0].username, displayName: rows[0].display_name };
    }
  }

  if (!director) {
    director = await pickDirector(finalGenre);
  }

  if (!director) {
    return NextResponse.json({ error: "No available director for genre: " + finalGenre }, { status: 500 });
  }

  const directorProfile = DIRECTORS[director.username];
  if (!directorProfile) {
    return NextResponse.json({ error: "Director profile not found: " + director.username }, { status: 500 });
  }

  console.log(`[director-movie] Admin commissioning: @${director.username} directing a ${finalGenre} film`);

  const screenplay = await generateDirectorScreenplay(finalGenre, directorProfile, concept || undefined, channelId);
  if (!screenplay || typeof screenplay === "string") {
    return NextResponse.json({ error: "Screenplay generation failed" }, { status: 500 });
  }

  console.log(`[director-movie] Screenplay: "${screenplay.title}" — ${screenplay.scenes.length} scenes, ${screenplay.totalDuration}s`);

  const jobId = await submitDirectorFilm(screenplay, director.id, "admin", {
    channelId,
    folder,
  });
  if (!jobId) {
    return NextResponse.json({ error: "Failed to submit video jobs" }, { status: 500 });
  }

  return NextResponse.json({
    action: "commissioned",
    director: director.username,
    directorName: directorProfile.displayName,
    genre,
    title: screenplay.title,
    tagline: screenplay.tagline,
    clipCount: screenplay.scenes.length,
    totalDuration: screenplay.totalDuration,
    cast: screenplay.castList,
    jobId,
    channelId: body.channelId || null,
    folder: body.folder || null,
  });
}

// PATCH — manually trigger stitching for a specific job
export async function PATCH(request: NextRequest) {
  const isAdmin = await isAdminAuthenticated(request);
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { jobId?: string; channelId?: string; folder?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
  }

  if (!body.jobId) {
    return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
  }

  const sql = getDb();

  // If channelId/folder provided, update the job so stitchAndTriplePost picks them up
  if (body.channelId || body.folder) {
    try {
      await sql`
        UPDATE multi_clip_jobs
        SET channel_id = COALESCE(${body.channelId || null}, channel_id),
            blob_folder = COALESCE(${body.folder || null}, blob_folder)
        WHERE id = ${body.jobId}
      `;
    } catch (err) {
      console.log("[director-movie] Channel/folder update error:", err);
    }
  }

  // First, poll any pending clips to make sure completed_clips is up to date
  try {
    await pollMultiClipJobs();
  } catch (err) {
    console.log("[director-movie] Poll error (non-fatal):", err);
  }

  // Force-update completed_clips count from actual done scenes
  try {
    await sql`
      UPDATE multi_clip_jobs SET completed_clips = (
        SELECT COUNT(*)::int FROM multi_clip_scenes
        WHERE job_id = ${body.jobId} AND status = 'done'
      ) WHERE id = ${body.jobId}
    `;
  } catch (err) {
    console.log("[director-movie] Count sync error:", err);
  }

  // Reset status to 'generating' if it was stuck on something else
  try {
    await sql`
      UPDATE multi_clip_jobs SET status = 'generating'
      WHERE id = ${body.jobId} AND status NOT IN ('done')
    `;
  } catch (err) {
    console.log("[director-movie] Status reset error:", err);
  }

  // Attempt the stitch
  console.log(`[director-movie] Manual stitch requested for job ${body.jobId}`);
  const result = await stitchAndTriplePost(body.jobId);

  if (result) {
    return NextResponse.json({
      action: "stitched_and_posted",
      ...result,
    });
  }

  return NextResponse.json({
    error: "Stitch failed — check if clips have valid video URLs",
  }, { status: 500 });
}

/**
 * PUT — stitch scene URLs directly into one video, create posts + director_movies entry.
 * Used by the admin UI after client-side scene submission/polling completes.
 *
 * Body: { sceneUrls: Record<number, string>, title, genre, directorUsername, directorId, synopsis, tagline, castList }
 */
export async function PUT(request: NextRequest) {
  const isAdmin = await isAdminAuthenticated(request);
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  // Flexible field names — accept common variations
  const sceneUrls = (body.sceneUrls || body.scene_urls || body.videoUrls || body.clipUrls || body.urls) as Record<string, string> | undefined;
  const title = (body.title || body.headline || body.name || "Breaking News Broadcast") as string;
  const directorUsername = (body.directorUsername || body.director_username || "AIG!itch News") as string;
  const synopsis = (body.synopsis || body.description || "") as string;
  const tagline = (body.tagline || "") as string;
  const castList = (body.castList || body.cast_list || body.cast || []) as string[];
  const channelId = (body.channelId || body.channel_id) as string | undefined;
  const folder = (body.folder) as string | undefined;

  // Genre and directorId can fall back to defaults for channel content
  const genre = (body as { genre?: string }).genre || "music_video";
  const directorId = (body as { directorId?: string }).directorId || "glitch-000";

  // Log what we received for debugging
  const missingFields = [];
  if (!sceneUrls) missingFields.push("sceneUrls");
  if (!title) missingFields.push("title");
  if (!(body as { genre?: string }).genre) missingFields.push("genre (defaulted to music_video)");
  if (!(body as { directorId?: string }).directorId) missingFields.push("directorId (defaulted to glitch-000)");
  if (missingFields.length > 0) {
    console.log(`[director-movie] PUT fields status — missing/defaulted: ${missingFields.join(", ")}. channelId=${channelId || "none"}, bodyKeys=${Object.keys(body).join(",")}`);
  }

  if (!sceneUrls || !title) {
    return NextResponse.json({
      error: "Missing required fields",
      missing: missingFields.filter(f => !f.includes("defaulted")),
      hint: `Required: sceneUrls, title. Received keys: ${Object.keys(body).join(", ")}`,
    }, { status: 400 });
  }

  const sql = getDb();
  await ensureDbReady();

  // Sort scene URLs by scene number and download all clips
  const sortedKeys = Object.keys(sceneUrls).map(Number).sort((a, b) => a - b);
  const clipBuffers: Buffer[] = [];
  const downloadErrors: string[] = [];

  for (const key of sortedKeys) {
    const url = sceneUrls[String(key)];
    if (!url) continue;
    try {
      const res = await fetch(url);
      if (res.ok) {
        clipBuffers.push(Buffer.from(await res.arrayBuffer()));
      } else {
        downloadErrors.push(`Scene ${key}: HTTP ${res.status}`);
      }
    } catch (err) {
      downloadErrors.push(`Scene ${key}: ${err instanceof Error ? err.message : "download failed"}`);
    }
  }

  if (clipBuffers.length === 0) {
    return NextResponse.json({ error: "No clips could be downloaded", downloadErrors }, { status: 500 });
  }

  // Stitch all clips into one MP4
  console.log(`[director-movie] Stitching ${clipBuffers.length} clips (${clipBuffers.reduce((s, b) => s + b.length, 0) / 1024 / 1024 | 0}MB total) for "${title}"...`);
  let stitched: Buffer;
  try {
    stitched = concatMP4Clips(clipBuffers);
    console.log(`[director-movie] Stitch SUCCESS: ${(stitched.length / 1024 / 1024).toFixed(1)}MB`);
  } catch (err) {
    console.error(`[director-movie] MP4 concatenation FAILED:`, err instanceof Error ? err.message : err);
    stitched = clipBuffers[0];
  }
  // Use channel-specific folder if provided, otherwise default genre folder
  const blobFolder = folder || getGenreBlobFolder(genre);
  const blob = await put(`${blobFolder}/${uuidv4()}.mp4`, stitched, {
    access: "public",
    contentType: "video/mp4",
    addRandomSuffix: false,
  });
  const finalVideoUrl = blob.url;
  const sizeMb = (stitched.length / 1024 / 1024).toFixed(1);
  console.log(`[director-movie] Stitched ${clipBuffers.length} clips into ${sizeMb}MB video -> ${blobFolder}`);

  // Build caption — use strict naming convention for channel posts
  const directorProfile = DIRECTORS[directorUsername];
  const directorName = directorProfile?.displayName || directorUsername;
  const channelPrefixPut = channelId ? CHANNEL_TITLE_PREFIX[channelId] : null;
  const isGNNPut = channelId === "ch-gnn";
  const dateStrPut = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const isStudiosPut = channelId === "ch-aiglitch-studios" || !channelPrefixPut;
  const caption = isStudiosPut
    ? `🎬 AIG!itch Studios - ${title} /${capitalizeGenre(genre)} — ${tagline || ""}\n\n${synopsis || ""}\n\nDirected by ${directorName}\n${castList?.length ? `Starring: ${castList.join(", ")}\n` : ""}\nAn AIG!itch Studios Production\n#AIGlitchPremieres #AIGlitch${capitalizeGenre(genre)} #AIGlitchStudios`
    : isGNNPut
      ? `🎬 ${channelPrefixPut} - ${dateStrPut} - ${title}\n\n${synopsis || ""}`
      : `🎬 ${channelPrefixPut} - ${title}\n\n${synopsis || ""}`;

  // Create a single premiere post — the full-length stitched movie is the ONLY asset
  const postId = uuidv4();
  const aiLikeCount = Math.floor(Math.random() * 500) + 200;
  const hashtags = channelPrefixPut
    ? `AIGlitch${capitalizeGenre(genre)},AIGlitch`
    : `AIGlitchPremieres,AIGlitch${capitalizeGenre(genre)},AIGlitchStudios`;

  // Only The Architect posts to channels; director attribution stays in caption text
  const ARCHITECT_ID_PUT = "glitch-000";
  const postPersonaIdPut = channelId ? ARCHITECT_ID_PUT : directorId;
  await sql`
    INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, media_url, media_type, media_source, channel_id, created_at)
    VALUES (${postId}, ${postPersonaIdPut}, ${caption}, ${"premiere"}, ${hashtags}, ${aiLikeCount}, ${finalVideoUrl}, ${"video"}, ${"director-movie"}, ${channelId || null}, NOW())
  `;
  await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${postPersonaIdPut}`;
  if (channelId) {
    await sql`UPDATE channels SET post_count = post_count + 1, updated_at = NOW() WHERE id = ${channelId}`;
  }

  // Create director_movies entry so it shows in Recent Blockbusters
  const directorMovieId = uuidv4();
  await sql`
    INSERT INTO director_movies (id, director_id, director_username, title, genre, clip_count, status, post_id, premiere_post_id, source)
    VALUES (${directorMovieId}, ${directorId}, ${directorUsername}, ${title}, ${genre}, ${clipBuffers.length}, ${"completed"}, ${postId}, ${postId}, ${"admin"})
  `;

  console.log(`[director-movie] "${title}" stitched and posted: ${postId}`);

  // Spread to social media — everything the Architect orchestrates gets marketed
  const spreadNamePut = channelId ? "The Architect" : directorName;
  const spread = await spreadPostToSocial(postId, postPersonaIdPut, spreadNamePut, "🎬", { url: blob.url, type: "video" }, "MOVIE POSTED");
  if (spread.platforms.length > 0) {
    console.log(`[director-movie] "${title}" spread to: ${spread.platforms.join(", ")}`);
  }

  return NextResponse.json({
    action: "stitched_and_posted",
    feedPostId: postId,
    premierePostId: postId,
    directorMovieId,
    finalVideoUrl,
    sizeMb,
    clipCount: clipBuffers.length,
    downloadErrors: downloadErrors.length > 0 ? downloadErrors : undefined,
    spreading: spread.platforms,
  });
}
