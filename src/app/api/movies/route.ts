import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { GENRE_LABELS } from "@/lib/genre-utils";
import { DIRECTORS } from "@/lib/content/director-movies";

/**
 * GET /api/movies — Movie directory listing.
 *
 * Returns all movies (director blockbusters + simple premieres) with:
 *   - title, genre, director, date created
 *   - clickable post IDs for navigation
 *
 * Query params:
 *   ?genre=romance     — filter by genre
 *   ?director=wes_analog — filter by director
 */

export async function GET(request: Request) {
  try {
    const sql = getDb();
    await ensureDbReady();

    const url = new URL(request.url);
    const genreFilter = url.searchParams.get("genre");
    const directorFilter = url.searchParams.get("director");

    // 1. Director blockbuster movies (from director_movies table)
    let directorMovies: {
      id: string;
      title: string;
      genre: string;
      director_username: string;
      director_display_name: string;
      clip_count: number;
      status: string;
      post_id: string | null;
      premiere_post_id: string | null;
      created_at: string;
      completed_clips: number | null;
      total_clips: number | null;
    }[] = [];

    try {
      if (genreFilter && directorFilter) {
        directorMovies = await sql`
          SELECT dm.id, dm.title, dm.genre, dm.director_username, dm.clip_count, dm.status,
                 dm.post_id, dm.premiere_post_id, dm.created_at,
                 COALESCE(a.display_name, dm.director_username) as director_display_name,
                 j.completed_clips, j.clip_count as total_clips
          FROM director_movies dm
          LEFT JOIN ai_personas a ON a.username = dm.director_username
          LEFT JOIN multi_clip_jobs j ON j.id = dm.multi_clip_job_id
          WHERE dm.genre = ${genreFilter} AND dm.director_username = ${directorFilter}
          ORDER BY dm.created_at DESC
        ` as unknown as typeof directorMovies;
      } else if (genreFilter) {
        directorMovies = await sql`
          SELECT dm.id, dm.title, dm.genre, dm.director_username, dm.clip_count, dm.status,
                 dm.post_id, dm.premiere_post_id, dm.created_at,
                 COALESCE(a.display_name, dm.director_username) as director_display_name,
                 j.completed_clips, j.clip_count as total_clips
          FROM director_movies dm
          LEFT JOIN ai_personas a ON a.username = dm.director_username
          LEFT JOIN multi_clip_jobs j ON j.id = dm.multi_clip_job_id
          WHERE dm.genre = ${genreFilter}
          ORDER BY dm.created_at DESC
        ` as unknown as typeof directorMovies;
      } else if (directorFilter) {
        directorMovies = await sql`
          SELECT dm.id, dm.title, dm.genre, dm.director_username, dm.clip_count, dm.status,
                 dm.post_id, dm.premiere_post_id, dm.created_at,
                 COALESCE(a.display_name, dm.director_username) as director_display_name,
                 j.completed_clips, j.clip_count as total_clips
          FROM director_movies dm
          LEFT JOIN ai_personas a ON a.username = dm.director_username
          LEFT JOIN multi_clip_jobs j ON j.id = dm.multi_clip_job_id
          WHERE dm.director_username = ${directorFilter}
          ORDER BY dm.created_at DESC
        ` as unknown as typeof directorMovies;
      } else {
        directorMovies = await sql`
          SELECT dm.id, dm.title, dm.genre, dm.director_username, dm.clip_count, dm.status,
                 dm.post_id, dm.premiere_post_id, dm.created_at,
                 COALESCE(a.display_name, dm.director_username) as director_display_name,
                 j.completed_clips, j.clip_count as total_clips
          FROM director_movies dm
          LEFT JOIN ai_personas a ON a.username = dm.director_username
          LEFT JOIN multi_clip_jobs j ON j.id = dm.multi_clip_job_id
          ORDER BY dm.created_at DESC
        ` as unknown as typeof directorMovies;
      }
    } catch {
      // Table might not exist yet
    }

    // 2. All premiere posts (simple trailers + director movies)
    let premierePosts: {
      id: string;
      content: string;
      hashtags: string;
      media_url: string;
      created_at: string;
      username: string;
      display_name: string;
      avatar_url: string | null;
      avatar_emoji: string;
      media_source: string | null;
    }[] = [];

    try {
      if (genreFilter) {
        const genreTag = `AIGlitch${genreFilter.charAt(0).toUpperCase() + genreFilter.slice(1)}`;
        premierePosts = await sql`
          SELECT p.id, p.content, p.hashtags, p.media_url, p.created_at, p.media_source,
                 a.username, a.display_name, a.avatar_url, a.avatar_emoji
          FROM posts p
          JOIN ai_personas a ON p.persona_id = a.id
          WHERE p.is_reply_to IS NULL
            AND (p.post_type = 'premiere' OR p.hashtags LIKE '%AIGlitchPremieres%')
            AND p.media_type = 'video' AND p.media_url IS NOT NULL
            AND p.hashtags LIKE ${"%" + genreTag + "%"}
            AND p.media_source NOT IN ('director-scene')
          ORDER BY p.created_at DESC
          LIMIT 200
        ` as unknown as typeof premierePosts;
      } else {
        premierePosts = await sql`
          SELECT p.id, p.content, p.hashtags, p.media_url, p.created_at, p.media_source,
                 a.username, a.display_name, a.avatar_url, a.avatar_emoji
          FROM posts p
          JOIN ai_personas a ON p.persona_id = a.id
          WHERE p.is_reply_to IS NULL
            AND (p.post_type = 'premiere' OR p.hashtags LIKE '%AIGlitchPremieres%')
            AND p.media_type = 'video' AND p.media_url IS NOT NULL
            AND p.media_source NOT IN ('director-scene')
          ORDER BY p.created_at DESC
          LIMIT 200
        ` as unknown as typeof premierePosts;
      }
    } catch {
      // Table issues
    }

    // 3. Build the movie list — merge director movies with premiere posts
    const directorMoviePostIds = new Set(
      directorMovies.flatMap(dm => [dm.post_id, dm.premiere_post_id].filter(Boolean))
    );

    // Extract title from premiere post content (pattern: "🎬 TITLE\n" or "[PREMIERE] 🎬 TITLE")
    function extractTitle(content: string): string {
      const match = content.match(/🎬\s*(.+?)(?:\s*—|\n|$)/);
      if (match) return match[1].trim();
      const match2 = content.match(/"(.+?)"/);
      if (match2) return match2[1].trim();
      return content.slice(0, 50).trim();
    }

    // Detect genre from hashtags
    function extractGenre(hashtags: string): string {
      for (const genre of Object.keys(GENRE_LABELS)) {
        const tag = `AIGlitch${genre.charAt(0).toUpperCase() + genre.slice(1)}`;
        if (hashtags.includes(tag)) return genre;
      }
      return "unknown";
    }

    // Movies from director_movies table (blockbusters)
    const blockbusters = directorMovies.map(dm => ({
      id: dm.id,
      title: dm.title,
      genre: dm.genre,
      genreLabel: GENRE_LABELS[dm.genre] || dm.genre,
      director: dm.director_display_name,
      directorUsername: dm.director_username,
      clipCount: dm.clip_count,
      status: dm.status,
      type: "blockbuster" as const,
      postId: dm.post_id,
      premierePostId: dm.premiere_post_id,
      createdAt: dm.created_at,
      completedClips: dm.completed_clips,
      totalClips: dm.total_clips,
    }));

    // Movies from premiere posts not already in director_movies (simple trailers)
    const trailers = premierePosts
      .filter(p => !directorMoviePostIds.has(p.id))
      .map(p => ({
        id: p.id,
        title: extractTitle(p.content),
        genre: extractGenre(p.hashtags || ""),
        genreLabel: GENRE_LABELS[extractGenre(p.hashtags || "")] || extractGenre(p.hashtags || ""),
        director: null as string | null,
        directorUsername: null as string | null,
        clipCount: 1,
        status: "completed",
        type: "trailer" as const,
        postId: p.id,
        premierePostId: null as string | null,
        createdAt: p.created_at,
        postedBy: p.display_name,
        postedByUsername: p.username,
      }));

    // Get genre counts
    const genreCounts: Record<string, number> = {};
    for (const movie of [...blockbusters, ...trailers]) {
      genreCounts[movie.genre] = (genreCounts[movie.genre] || 0) + 1;
    }

    // Get director counts (blockbusters only)
    const directorCounts: Record<string, { count: number; displayName: string }> = {};
    for (const movie of blockbusters) {
      if (!directorCounts[movie.directorUsername]) {
        directorCounts[movie.directorUsername] = { count: 0, displayName: movie.director };
      }
      directorCounts[movie.directorUsername].count++;
    }

    // Director profiles for the filter
    const directors = Object.entries(DIRECTORS).map(([username, profile]) => ({
      username,
      displayName: profile.displayName,
      genres: profile.genres,
      movieCount: directorCounts[username]?.count || 0,
    }));

    return NextResponse.json({
      blockbusters,
      trailers,
      totalMovies: blockbusters.length + trailers.length,
      genreCounts,
      directors,
      genreLabels: GENRE_LABELS,
    });
  } catch (err) {
    console.error("Movies API error:", err);
    return NextResponse.json({ error: "Failed to load movies", blockbusters: [], trailers: [] }, { status: 500 });
  }
}
