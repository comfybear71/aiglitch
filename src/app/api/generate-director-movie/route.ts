import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { shouldRunCron } from "@/lib/throttle";
import {
  pickGenre,
  pickDirector,
  getMovieConcept,
  generateDirectorScreenplay,
  submitDirectorFilm,
  stitchAndTriplePost,
  DIRECTORS,
} from "@/lib/director-movies";
import { pollMultiClipJobs } from "@/lib/multi-clip";

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
  const isAdmin = await isAdminAuthenticated();
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && !isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await shouldRunCron("director-movie"))) {
    return NextResponse.json({ action: "throttled", message: "Skipped by activity throttle" });
  }

  if (!process.env.XAI_API_KEY) {
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
      return NextResponse.json({
        action: "in_progress",
        message: `"${inProgress[0].title}" (${inProgress[0].genre}) by @${inProgress[0].director_username} is still being generated.`,
      });
    }
  } catch {
    // Table might not exist yet
  }

  // ── Step 4: Check daily limit — one blockbuster per day ──
  try {
    const todayCount = await sql`
      SELECT COUNT(*)::int as count FROM director_movies
      WHERE created_at > NOW() - INTERVAL '24 hours'
    ` as unknown as { count: number }[];

    if (todayCount[0]?.count >= 1 && !isAdmin) {
      return NextResponse.json({
        action: "daily_limit",
        message: "One blockbuster per day. Today's film has already been commissioned.",
      });
    }
  } catch {
    // Fine — no films yet
  }

  // ── Step 5: Commission a new blockbuster! ──
  const genre = await pickGenre();
  const director = await pickDirector(genre);

  if (!director) {
    return NextResponse.json({ error: "No available director for genre: " + genre }, { status: 500 });
  }

  const directorProfile = DIRECTORS[director.username];
  if (!directorProfile) {
    return NextResponse.json({ error: "Director profile not found: " + director.username }, { status: 500 });
  }

  // Check for admin concepts
  const concept = await getMovieConcept(genre);

  console.log(`[director-movie] Commissioning: @${director.username} directing a ${genre} film${concept ? ` (concept: "${concept.title}")` : ""}`);

  // Generate screenplay
  const screenplay = await generateDirectorScreenplay(genre, directorProfile, concept?.concept);
  if (!screenplay) {
    return NextResponse.json({ error: "Screenplay generation failed" }, { status: 500 });
  }

  console.log(`[director-movie] Screenplay: "${screenplay.title}" — ${screenplay.scenes.length} scenes, ${screenplay.totalDuration}s`);

  // Submit all scenes as Grok video jobs
  const jobId = await submitDirectorFilm(screenplay, director.id);
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
    concept: concept?.title || null,
  });
}

// POST for manual admin triggers — accepts optional genre, director, concept from form
export async function POST(request: NextRequest) {
  const isAdmin = await isAdminAuthenticated();
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { genre?: string; director?: string; title?: string; concept?: string } = {};
  try {
    body = await request.json();
  } catch {
    // No body — fall through to GET which picks randomly
  }

  // If no specific params, use the GET flow
  if (!body.genre && !body.director && !body.concept) {
    return GET(request);
  }

  if (!process.env.XAI_API_KEY) {
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
  const genre = body.genre && body.genre !== "any" ? body.genre : await pickGenre();
  let director: { id: string; username: string; displayName: string } | null = null;

  if (body.director && body.director !== "auto") {
    // Specific director requested — look them up
    const rows = await sql`
      SELECT id, username, display_name FROM ai_personas WHERE username = ${body.director} AND is_active = true LIMIT 1
    ` as unknown as { id: string; username: string; display_name: string }[];
    if (rows.length > 0) {
      director = { id: rows[0].id, username: rows[0].username, displayName: rows[0].display_name };
    }
  }

  if (!director) {
    director = await pickDirector(genre);
  }

  if (!director) {
    return NextResponse.json({ error: "No available director for genre: " + genre }, { status: 500 });
  }

  const directorProfile = DIRECTORS[director.username];
  if (!directorProfile) {
    return NextResponse.json({ error: "Director profile not found: " + director.username }, { status: 500 });
  }

  console.log(`[director-movie] Admin commissioning: @${director.username} directing a ${genre} film`);

  const screenplay = await generateDirectorScreenplay(genre, directorProfile, body.concept || undefined);
  if (!screenplay) {
    return NextResponse.json({ error: "Screenplay generation failed" }, { status: 500 });
  }

  console.log(`[director-movie] Screenplay: "${screenplay.title}" — ${screenplay.scenes.length} scenes, ${screenplay.totalDuration}s`);

  const jobId = await submitDirectorFilm(screenplay, director.id);
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
  });
}
