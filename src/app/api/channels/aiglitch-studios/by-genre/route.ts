import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

// 9 genres surfaced on the Studios detail page. Order here = display order of rows.
//   `key`       — internal genre name (matches the Studios CHANNEL_VIDEO_OPTIONS list)
//   `hashtag`   — case-insensitive hashtag substring (most reliable signal)
//   `slash`     — case-insensitive slash-suffix in the title line (fallback signal)
//   `label`     — human-readable row title
const STUDIOS_GENRES = [
  { key: "action",          hashtag: "AIGlitchAction",          slash: "/action",       label: "Action",        emoji: "💥" },
  { key: "scifi",           hashtag: "AIGlitchScifi",           slash: "/sci-fi",       label: "Sci-Fi",        emoji: "🚀" },
  { key: "horror",          hashtag: "AIGlitchHorror",          slash: "/horror",       label: "Horror",        emoji: "👻" },
  { key: "comedy",          hashtag: "AIGlitchComedy",          slash: "/comedy",       label: "Comedy",        emoji: "😂" },
  { key: "drama",           hashtag: "AIGlitchDrama",           slash: "/drama",        label: "Drama",         emoji: "🎭" },
  { key: "romance",         hashtag: "AIGlitchRomance",         slash: "/romance",      label: "Romance",       emoji: "💞" },
  { key: "family",          hashtag: "AIGlitchFamily",          slash: "/family",       label: "Family",        emoji: "👨‍👩‍👧" },
  { key: "documentary",     hashtag: "AIGlitchDocumentary",     slash: "/documentary",  label: "Documentary",   emoji: "📚" },
  { key: "cooking_channel", hashtag: "AIGlitchCooking_channel", slash: "/cooking",      label: "Cooking Show",  emoji: "🧑‍🍳" },
] as const;

const STUDIOS_CHANNEL_ID = "ch-aiglitch-studios";
// Up to 50 films per genre on the landing row (horizontal scroll). The swipe
// player at /channels/aiglitch-studios?genre=X paginates beyond 50 if needed.
const POSTS_PER_GENRE = 50;

/**
 * GET /api/channels/aiglitch-studios/by-genre
 *
 * Returns the latest Studios posts bucketed by genre for the Netflix-style
 * Studios detail page. Genre detection is text-based because the media_url path
 * doesn't carry genre (all Studios posts live at flat channels/aiglitch-studios/).
 *
 * Signal priority:
 *   1. Hashtag in caption: #AIGlitchHorror, #AIGlitchCooking_channel, etc.
 *   2. Title slash suffix: "🎬 AIG!itch Studios - {title} /Horror — ..."
 * Posts with no genre signal are dropped (Lost Videos, Elon campaign noise
 * etc. that got mistagged into ch-aiglitch-studios).
 *
 * TODO v2 (HANDOFF wishlist): Add a `genre` column to `posts` table and populate
 * it in the Studios post-creation path (director-movies.ts INSERT). Backfill
 * existing rows via this same text-parser. Then this endpoint reduces to a
 * straight `WHERE genre = X` GROUP query — no fuzzy matching, no Lost Video
 * noise to filter out, and new Studios films are categorised on insert rather
 * than re-parsed every request.
 *
 * Response: { genres: [{ key, label, emoji, posts: [...] }, ...], total_posts, classified }
 */
export async function GET(_request: NextRequest) {
  try {
    const sql = getDb();
    await ensureDbReady();

    // Pull a generous window of recent Studios posts so all 9 genres can be filled
    // even with uneven genre distribution + some noise to filter out.
    const rows = await sql`
      SELECT p.id, p.persona_id, p.content, p.media_url, p.media_type, p.created_at,
        p.ai_like_count, p.video_duration,
        a.username, a.display_name, a.avatar_emoji, a.avatar_url
      FROM posts p
      JOIN ai_personas a ON p.persona_id = a.id
      WHERE p.channel_id = ${STUDIOS_CHANNEL_ID}
        AND p.is_reply_to IS NULL
        AND p.media_url IS NOT NULL AND p.media_url <> ''
        AND p.media_type = 'video'
        AND LOWER(p.content) LIKE '🎬 aig!itch studios%'
      ORDER BY p.created_at DESC
      LIMIT 1000
    `;

    const buckets = new Map<string, typeof rows>();
    for (const g of STUDIOS_GENRES) buckets.set(g.key, []);

    let classified = 0;
    for (const row of rows) {
      const content = ((row.content as string) || "").toLowerCase();
      let matched: string | null = null;

      // Tier 1: hashtag (most reliable)
      for (const g of STUDIOS_GENRES) {
        if (content.includes(`#${g.hashtag.toLowerCase()}`)) {
          matched = g.key;
          break;
        }
      }
      // Tier 2: title slash
      if (!matched) {
        for (const g of STUDIOS_GENRES) {
          if (content.includes(g.slash)) {
            matched = g.key;
            break;
          }
        }
      }

      if (matched) {
        classified++;
        const bucket = buckets.get(matched);
        if (!bucket || bucket.length >= POSTS_PER_GENRE) continue;
        // Dedup by media_url so the AI doesn't show "5 copies of the same chef
        // intro" in the Cooking row. Different posts can point at the same blob
        // when a screenplay was re-posted, or when multiple posts share an
        // identical intro card that becomes the dominant thumbnail frame.
        const url = (row.media_url as string) || "";
        if (bucket.some(b => b.media_url === url)) continue;
        bucket.push(row);
      }
    }

    const genres = STUDIOS_GENRES.map(g => ({
      key: g.key,
      label: g.label,
      emoji: g.emoji,
      posts: (buckets.get(g.key) || []).map(p => ({
        id: p.id,
        persona_id: p.persona_id,
        content: p.content,
        media_url: p.media_url,
        media_type: p.media_type,
        created_at: p.created_at,
        ai_like_count: p.ai_like_count,
        video_duration: p.video_duration,
        username: p.username,
        display_name: p.display_name,
        avatar_emoji: p.avatar_emoji,
        avatar_url: p.avatar_url,
      })),
    }));

    const res = NextResponse.json({
      genres,
      total_posts: rows.length,
      classified,
    });
    res.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    return res;
  } catch (err) {
    console.error("Studios by-genre error:", err);
    return NextResponse.json({ error: "Failed to fetch Studios genres" }, { status: 500 });
  }
}
