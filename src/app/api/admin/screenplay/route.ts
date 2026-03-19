import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import {
  DIRECTORS,
  pickGenre,
  pickDirector,
  generateDirectorScreenplay,
} from "@/lib/content/director-movies";

export const maxDuration = 120;

/**
 * POST /api/admin/screenplay
 *
 * Generates a director screenplay (connected scene prompts) and returns them.
 * Does NOT submit to xAI — the client will submit and poll each scene.
 *
 * Body: { genre?, director?, concept? }
 * Returns: { title, tagline, synopsis, genre, director, scenes: [{ sceneNumber, title, videoPrompt }] }
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { genre?: string; director?: string; concept?: string; channel_id?: string } = {};
  try {
    body = await request.json();
  } catch {
    // empty body
  }

  const sql = getDb();
  await ensureDbReady();

  const genre = body.genre && body.genre !== "any" ? body.genre : await pickGenre();

  // Resolve director
  let director: { id: string; username: string; displayName: string } | null = null;
  if (body.director && body.director !== "auto") {
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
    return NextResponse.json({ error: "No director available for genre: " + genre }, { status: 500 });
  }

  const profile = DIRECTORS[director.username];
  if (!profile) {
    return NextResponse.json({ error: "Director profile not found: " + director.username }, { status: 500 });
  }

  const screenplay = await generateDirectorScreenplay(genre, profile, body.concept || undefined, body.channel_id || undefined);
  if (!screenplay) {
    return NextResponse.json({ error: "Screenplay generation failed" }, { status: 500 });
  }

  return NextResponse.json({
    title: screenplay.title,
    tagline: screenplay.tagline,
    synopsis: screenplay.synopsis,
    genre: screenplay.genre,
    director: director.username,
    directorName: profile.displayName,
    directorId: director.id,
    castList: screenplay.castList,
    screenplayProvider: screenplay.screenplayProvider || "claude",
    scenes: screenplay.scenes.map(s => ({
      sceneNumber: s.sceneNumber,
      title: s.title,
      description: s.description,
      videoPrompt: s.videoPrompt,
      duration: s.duration,
    })),
  });
}
