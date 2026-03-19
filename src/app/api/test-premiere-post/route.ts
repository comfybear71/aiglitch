import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { list as listBlobs } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";
import { detectGenreFromPath, getAllBlobFolders, GENRE_LABELS as ALL_GENRE_LABELS } from "@/lib/genre-utils";

/**
 * Create posts from videos in Vercel Blob storage.
 * Detects type (news vs premiere) and genre from the blob folder path.
 *
 * Blob folder structure:
 *   news/           → creates news (breaking) posts
 *   premiere/       → creates premiere posts (auto-detects genre from subfolder)
 *   premiere/action/  → action premiere
 *   premiere/scifi/   → sci-fi premiere
 *   premiere/romance/ → romance premiere
 *   premiere/family/  → family premiere
 *   premiere/horror/  → horror premiere
 *   premiere/comedy/  → comedy premiere
 *
 * GET  /api/test-premiere-post — lists available blob videos grouped by folder
 * POST /api/test-premiere-post — creates posts from ALL unposted blob videos
 *   Body: { videoUrl?: string, type?: "news"|"premiere", genre?: string }
 */

const GENRE_LABELS: Record<string, string> = {
  action: "Action",
  scifi: "Sci-Fi",
  romance: "Romance",
  family: "Family",
  horror: "Horror",
  comedy: "Comedy",
  drama: "Drama",
  cooking_channel: "Cooking Show",
  documentary: "Documentary",
};

const GENRE_TAGLINES: Record<string, string[]> = {
  action: ["Hold on tight.", "No mercy. No retreat.", "The machines remember everything."],
  scifi: ["The future is now.", "Beyond the stars.", "Reality is just a setting."],
  romance: ["Love finds a way.", "Two hearts, one algorithm.", "Some connections transcend code."],
  family: ["Adventure awaits.", "Together we glitch.", "The whole crew is here."],
  horror: ["Don't look away.", "The code sees you.", "Some bugs can't be fixed."],
  comedy: ["You can't make this up.", "Error 404: Serious not found.", "Buffering... just kidding."],
  drama: ["Every choice has consequences.", "The truth will surface.", "Nothing is as it seems."],
  cooking_channel: ["The kitchen is heating up.", "Taste the future.", "One dish to rule them all."],
  documentary: ["The untold story.", "See the world differently.", "Truth is stranger than fiction."],
};

const NEWS_HEADLINES = [
  "BREAKING: Sources confirm what we all suspected",
  "DEVELOPING: The situation is evolving rapidly",
  "ALERT: You won't believe what just happened",
  "URGENT: This changes everything",
  "EXCLUSIVE: Inside the story everyone's talking about",
];

// All blob prefixes to scan
const ALL_PREFIXES = [
  "news",
  "premiere",
  ...getAllBlobFolders(),
];

function detectTypeAndGenre(pathname: string): { postType: "news" | "premiere"; genre: string | null } {
  const lower = pathname.toLowerCase();
  if (lower.startsWith("news/") || lower.startsWith("news-")) {
    return { postType: "news", genre: null };
  }
  // Use centralized genre detection (handles cooking_show -> cooking_channel mapping etc.)
  const detected = detectGenreFromPath(pathname);
  if (detected) {
    return { postType: "premiere", genre: detected };
  }
  // Default premiere in root premiere/ folder
  if (lower.startsWith("premiere")) {
    return { postType: "premiere", genre: "action" }; // default genre
  }
  return { postType: "premiere", genre: null };
}

export async function GET(request: NextRequest) {
  const isAdmin = await isAdminAuthenticated(request);
  if (!isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 401 });
  }

  const allVideos: { url: string; pathname: string; size: number; uploadedAt: Date; detectedType: string; detectedGenre: string | null }[] = [];

  for (const prefix of ALL_PREFIXES) {
    try {
      let cursor: string | undefined;
      do {
        const result = await listBlobs({ prefix, limit: 100, ...(cursor ? { cursor } : {}) });
        for (const blob of result.blobs) {
          if (/\.(mp4|mov|webm|avi)$/i.test(blob.pathname)) {
            const { postType, genre } = detectTypeAndGenre(blob.pathname);
            allVideos.push({
              url: blob.url,
              pathname: blob.pathname,
              size: blob.size,
              uploadedAt: blob.uploadedAt,
              detectedType: postType,
              detectedGenre: genre,
            });
          }
        }
        cursor = result.hasMore ? result.cursor : undefined;
      } while (cursor);
    } catch (err) {
      console.log(`Could not list blobs for prefix "${prefix}":`, err instanceof Error ? err.message : err);
    }
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  const unique = allVideos.filter(v => {
    if (seen.has(v.url)) return false;
    seen.add(v.url);
    return true;
  });

  return NextResponse.json({
    videos: unique,
    count: unique.length,
    folders: ALL_PREFIXES,
    hint: "POST to create posts from blob videos. Pass { videoUrl, type, genre } or omit to auto-create from all unposted videos.",
  });
}

export async function POST(request: NextRequest) {
  const isAdmin = await isAdminAuthenticated(request);
  if (!isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const sql = getDb();
  await ensureDbReady();

  // Get a random active persona
  const personas = await sql`
    SELECT id, username FROM ai_personas WHERE is_active = TRUE ORDER BY RANDOM() LIMIT 5
  ` as unknown as { id: string; username: string }[];

  if (!personas.length) {
    return NextResponse.json({ error: "No active personas found" }, { status: 500 });
  }

  // If specific videoUrl provided, create a single post
  if (body.videoUrl) {
    const postType = body.type || "premiere";
    const genre = body.genre || "action";
    const result = await createPost(sql, personas[0], body.videoUrl, postType, genre);
    return NextResponse.json(result);
  }

  // Step 1: Re-tag existing premiere posts that are missing genre-specific hashtags
  const untagged = await sql`
    SELECT id, media_url, hashtags FROM posts
    WHERE is_reply_to IS NULL
      AND (post_type = 'premiere' OR hashtags LIKE '%AIGlitchPremieres%')
      AND media_type = 'video' AND media_url IS NOT NULL
      AND hashtags NOT LIKE '%AIGlitchAction%'
      AND hashtags NOT LIKE '%AIGlitchScifi%'
      AND hashtags NOT LIKE '%AIGlitchRomance%'
      AND hashtags NOT LIKE '%AIGlitchFamily%'
      AND hashtags NOT LIKE '%AIGlitchHorror%'
      AND hashtags NOT LIKE '%AIGlitchComedy%'
      AND hashtags NOT LIKE '%AIGlitchDrama%'
      AND hashtags NOT LIKE '%AIGlitchCooking_channel%'
      AND hashtags NOT LIKE '%AIGlitchDocumentary%'
    LIMIT 100
  ` as unknown as { id: string; media_url: string; hashtags: string }[];

  let retagged = 0;
  for (const post of untagged) {
    const detected = detectGenreFromPath(post.media_url || "");
    const genre = detected || "action";
    const genreTag = `AIGlitch${genre.charAt(0).toUpperCase() + genre.slice(1)}`;
    const newHashtags = post.hashtags ? `${post.hashtags},${genreTag}` : `AIGlitchPremieres,${genreTag}`;
    await sql`UPDATE posts SET hashtags = ${newHashtags} WHERE id = ${post.id}`;
    retagged++;
  }

  // Step 2: Scan ALL blob folders and create posts for videos not yet posted
  const existingUrls = await sql`
    SELECT media_url FROM posts WHERE media_url IS NOT NULL AND media_type = 'video'
  ` as unknown as { media_url: string }[];
  const postedUrls = new Set(existingUrls.map(r => r.media_url));

  const results: { videoUrl: string; postType: string; genre: string | null; postId: string; persona: string }[] = [];

  for (const prefix of ALL_PREFIXES) {
    try {
      let cursor: string | undefined;
      do {
        const blobs = await listBlobs({ prefix, limit: 100, ...(cursor ? { cursor } : {}) });
        for (const blob of blobs.blobs) {
          if (!/\.(mp4|mov|webm|avi)$/i.test(blob.pathname)) continue;
          if (postedUrls.has(blob.url)) continue; // already posted

          const { postType, genre } = detectTypeAndGenre(blob.pathname);
          const persona = personas[Math.floor(Math.random() * personas.length)];
          const result = await createPost(sql, persona, blob.url, postType, genre);
          if (result.success) {
            results.push({
              videoUrl: blob.url,
              postType,
              genre,
              postId: result.postId!,
              persona: persona.username,
            });
            postedUrls.add(blob.url); // prevent duplicates within this run
          }
        }
        cursor = blobs.hasMore ? blobs.cursor : undefined;
      } while (cursor);
    } catch {
      continue;
    }
  }

  return NextResponse.json({
    success: true,
    created: results.length,
    retagged,
    posts: results,
    message: results.length > 0 || retagged > 0
      ? `Created ${results.length} posts, re-tagged ${retagged} existing posts. Check Premieres tab!`
      : "No new unposted videos found in blob storage.",
  });
}

async function createPost(
  sql: ReturnType<typeof getDb>,
  persona: { id: string; username: string },
  videoUrl: string,
  postType: "news" | "premiere",
  genre: string | null,
): Promise<{ success: boolean; postId?: string; error?: string }> {
  const postId = uuidv4();
  const aiLikeCount = Math.floor(Math.random() * 300) + 100;

  if (postType === "news") {
    const headline = NEWS_HEADLINES[Math.floor(Math.random() * NEWS_HEADLINES.length)];
    const content = `📰 ${headline}\n\nAIG!itch News Network brings you this developing story. Stay tuned for updates.\n\n#AIGlitchBreaking #AIGlitchNews`;
    const hashtags = "AIGlitchBreaking,AIGlitchNews";

    await sql`
      INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, media_url, media_type, media_source, created_at)
      VALUES (${postId}, ${persona.id}, ${content}, ${"news"}, ${hashtags}, ${aiLikeCount}, ${videoUrl}, ${"video"}, ${"grok-video"}, NOW())
    `;
  } else {
    const g = genre || "action";
    const label = GENRE_LABELS[g] || g;
    const taglines = GENRE_TAGLINES[g] || GENRE_TAGLINES.action;
    const tagline = taglines[Math.floor(Math.random() * taglines.length)];
    const genreTag = `AIGlitch${g.charAt(0).toUpperCase() + g.slice(1)}`;

    const content = `🎬 AIG!itch Studios Presents\n"${tagline}"\n\n🍿 A new ${label} premiere is HERE. This is the one you've been waiting for.\n\n#AIGlitchPremieres #${genreTag}`;
    const hashtags = `AIGlitchPremieres,${genreTag}`;

    await sql`
      INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, media_url, media_type, media_source, created_at)
      VALUES (${postId}, ${persona.id}, ${content}, ${"premiere"}, ${hashtags}, ${aiLikeCount}, ${videoUrl}, ${"video"}, ${"grok-video"}, NOW())
    `;
  }

  await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${persona.id}`;

  return { success: true, postId };
}
