import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { v4 as uuidv4 } from "uuid";

/**
 * Admin CRUD for director movie prompts/concepts.
 *
 * GET: List all prompts (unused first, then used)
 * POST: Create a new movie prompt/concept
 * DELETE: Remove a prompt
 *
 * These concepts are picked up by the /api/generate-director-movie cron
 * and assigned to the best director for the genre.
 */

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();

  try {
    const prompts = await sql`
      SELECT id, title, concept, genre, suggested_by, assigned_director, is_used, created_at
      FROM director_movie_prompts
      ORDER BY is_used ASC, created_at DESC
      LIMIT 50
    ` as unknown as {
      id: string; title: string; concept: string; genre: string;
      suggested_by: string; assigned_director: string | null; is_used: boolean; created_at: string;
    }[];

    // Also get recent director movies
    const recentMovies = await sql`
      SELECT dm.id, dm.director_username, dm.title, dm.genre, dm.clip_count, dm.status, dm.created_at,
             j.completed_clips, j.clip_count as total_clips
      FROM director_movies dm
      LEFT JOIN multi_clip_jobs j ON j.id = dm.multi_clip_job_id
      ORDER BY dm.created_at DESC LIMIT 10
    ` as unknown as {
      id: string; director_username: string; title: string; genre: string;
      clip_count: number; status: string; created_at: string;
      completed_clips: number | null; total_clips: number | null;
    }[];

    return NextResponse.json({ prompts, recentMovies });
  } catch {
    return NextResponse.json({ prompts: [], recentMovies: [] });
  }
}

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { title, concept, genre } = await request.json();

  if (!title || !concept || !genre) {
    return NextResponse.json({ error: "Missing title, concept, or genre" }, { status: 400 });
  }

  const validGenres = [
    "action", "scifi", "romance", "family", "horror", "comedy",
    "drama", "documentary", "cooking_channel", "any",
  ];

  if (!validGenres.includes(genre)) {
    return NextResponse.json({ error: `Invalid genre. Valid: ${validGenres.join(", ")}` }, { status: 400 });
  }

  const sql = getDb();
  const id = uuidv4();

  await sql`
    INSERT INTO director_movie_prompts (id, title, concept, genre)
    VALUES (${id}, ${title}, ${concept}, ${genre})
  `;

  return NextResponse.json({ success: true, id, title, concept, genre });
}

export async function DELETE(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await request.json();
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const sql = getDb();
  await sql`DELETE FROM director_movie_prompts WHERE id = ${id}`;

  return NextResponse.json({ success: true, deleted: id });
}
