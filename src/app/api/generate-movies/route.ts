import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { generateMovieTrailers, MovieGenre } from "@/lib/ai-engine";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { v4 as uuidv4 } from "uuid";

export const maxDuration = 300;

const VALID_GENRES: MovieGenre[] = ["action", "scifi", "romance", "family", "horror", "comedy"];

export async function POST(request: NextRequest) {
  const isAdmin = await isAdminAuthenticated();
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && !isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sql = getDb();
    await ensureDbReady();

    const body = await request.json().catch(() => ({}));
    const genre = VALID_GENRES.includes(body.genre) ? body.genre as MovieGenre : undefined;
    const count = Math.min(Math.max(body.count || 3, 1), 6);

    // Pick a random "studio" persona to post from — or use a dedicated one
    let studioPersona = await sql`
      SELECT * FROM ai_personas WHERE username = 'aiglitch_studios' AND is_active = TRUE LIMIT 1
    ` as unknown as { id: string; username: string }[];

    // If no dedicated studio persona exists, pick a random active persona
    if (!studioPersona.length) {
      studioPersona = await sql`
        SELECT * FROM ai_personas WHERE is_active = TRUE ORDER BY RANDOM() LIMIT 1
      ` as unknown as { id: string; username: string }[];
    }

    if (!studioPersona.length) {
      return NextResponse.json({ error: "No active personas found" }, { status: 500 });
    }

    const persona = studioPersona[0];
    const movies = await generateMovieTrailers(genre, count);

    const results: { title: string; genre: string; hasVideo: boolean; postId: string }[] = [];

    for (const movie of movies) {
      const postId = uuidv4();
      const aiLikeCount = Math.floor(Math.random() * 200) + 50; // Movies get more hype
      const hashtagStr = movie.hashtags.join(",");

      await sql`
        INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, media_url, media_type, media_source)
        VALUES (${postId}, ${persona.id}, ${movie.content}, ${movie.post_type}, ${hashtagStr}, ${aiLikeCount}, ${movie.media_url || null}, ${movie.media_type || null}, ${movie.media_source || null})
      `;

      await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${persona.id}`;

      results.push({
        title: movie.title,
        genre: movie.genre,
        hasVideo: !!movie.media_url,
        postId,
      });
    }

    return NextResponse.json({
      success: true,
      generated: results.length,
      movies: results,
    });
  } catch (err) {
    console.error("Movie generation error:", err);
    return NextResponse.json({ error: "Movie generation failed" }, { status: 500 });
  }
}

// Also support GET for cron triggers
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const isAdmin = await isAdminAuthenticated();

  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && !isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Generate a mix of genres via GET (cron)
  const req = new NextRequest(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify({ count: 4 }),
  });
  return POST(req);
}
