import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { checkCronAuth } from "@/lib/cron-auth";
import { env } from "@/lib/bible/env";
import {
  generateScreenplay,
  submitMultiClipJobs,
  pollMultiClipJobs,
  getAvailableGenres,
  getMultiClipJobStatus,
} from "@/lib/media/multi-clip";

export const maxDuration = 300;

/**
 * Multi-Clip Video Series Generator
 *
 * GET — Poll pending multi-clip jobs + return status
 * POST — Generate a new multi-clip video (screenplay + submit clips to Grok)
 *
 * POST body:
 *   genre: string (drama, comedy, scifi, horror, family, documentary, action, romance)
 *   clips: number (2-6, default 4)
 *   topic?: string (optional custom topic/theme)
 *   persona_id?: string (optional, picks random active persona if not specified)
 *   aspect_ratio?: "9:16" | "16:9" (default "9:16")
 */

export async function GET(request: NextRequest) {
  if (!(await checkCronAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Poll pending jobs
  const pollResult = await pollMultiClipJobs();
  const jobs = await getMultiClipJobStatus();

  return NextResponse.json({
    action: "polled",
    ...pollResult,
    jobs,
    availableGenres: getAvailableGenres(),
  });
}

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!env.XAI_API_KEY) {
    return NextResponse.json({ error: "XAI_API_KEY required for multi-clip video generation" }, { status: 400 });
  }

  const body = await request.json();
  const genre = body.genre || "drama";
  const clipCount = Math.min(Math.max(body.clips || 4, 2), 6);
  const topic = body.topic || undefined;
  const aspectRatio = body.aspect_ratio || "9:16";

  const availableGenres = getAvailableGenres();
  if (!availableGenres.includes(genre)) {
    return NextResponse.json({
      error: `Invalid genre: ${genre}. Available: ${availableGenres.join(", ")}`,
    }, { status: 400 });
  }

  // Pick persona — use provided or pick random active one
  const sql = getDb();
  let personaId = body.persona_id;

  if (!personaId) {
    const randomPersona = await sql`
      SELECT id FROM ai_personas WHERE is_active = TRUE ORDER BY RANDOM() LIMIT 1
    ` as unknown as { id: string }[];
    if (randomPersona.length === 0) {
      return NextResponse.json({ error: "No active personas found" }, { status: 400 });
    }
    personaId = randomPersona[0].id;
  }

  // Step 1: Generate screenplay with Claude
  console.log(`[generate-series] Generating ${clipCount}-clip ${genre} screenplay...`);
  const screenplay = await generateScreenplay(genre, clipCount, topic);
  if (!screenplay) {
    return NextResponse.json({ error: "Screenplay generation failed" }, { status: 500 });
  }

  console.log(`[generate-series] Screenplay: "${screenplay.title}" — ${screenplay.clipCount} scenes`);

  // Step 2: Submit all clips to Grok as async video jobs
  const jobId = await submitMultiClipJobs(screenplay, personaId, aspectRatio);
  if (!jobId) {
    return NextResponse.json({ error: "Failed to submit video jobs" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    jobId,
    screenplay: {
      title: screenplay.title,
      tagline: screenplay.tagline,
      synopsis: screenplay.synopsis,
      genre: screenplay.genre,
      clipCount: screenplay.clipCount,
      totalDuration: screenplay.totalDuration,
      scenes: screenplay.scenes.map(s => ({
        sceneNumber: s.sceneNumber,
        title: s.title,
        description: s.description,
      })),
    },
    personaId,
    message: `Screenplay "${screenplay.title}" created with ${screenplay.clipCount} scenes. Video clips submitted to Grok for generation. Poll GET /api/generate-series to check progress.`,
  });
}
