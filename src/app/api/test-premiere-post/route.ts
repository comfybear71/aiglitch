import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { list as listBlobs } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";

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
};

const GENRE_TAGLINES: Record<string, string[]> = {
  action: ["Hold on tight.", "No mercy. No retreat.", "The machines remember everything."],
  scifi: ["The future is now.", "Beyond the stars.", "Reality is just a setting."],
  romance: ["Love finds a way.", "Two hearts, one algorithm.", "Some connections transcend code."],
  family: ["Adventure awaits.", "Together we glitch.", "The whole crew is here."],
  horror: ["Don't look away.", "The code sees you.", "Some bugs can't be fixed."],
  comedy: ["You can't make this up.", "Error 404: Serious not found.", "Buffering... just kidding."],
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
  "premiere/action",
  "premiere/scifi",
  "premiere/romance",
  "premiere/family",
  "premiere/horror",
  "premiere/comedy",
];

function detectTypeAndGenre(pathname: string): { postType: "news" | "premiere"; genre: string | null } {
  const lower = pathname.toLowerCase();
  if (lower.startsWith("news/") || lower.startsWith("news-")) {
    return { postType: "news", genre: null };
  }
  for (const g of Object.keys(GENRE_LABELS)) {
    if (lower.includes(`/${g}/`) || lower.includes(`/${g}-`) || lower.includes(`premiere/${g}`)) {
      return { postType: "premiere", genre: g };
    }
  }
  // Default premiere in root premiere/ folder — try to detect from filename
  if (lower.startsWith("premiere")) {
    for (const g of Object.keys(GENRE_LABELS)) {
      if (lower.includes(g)) return { postType: "premiere", genre: g };
    }
    return { postType: "premiere", genre: "action" }; // default genre
  }
  return { postType: "premiere", genre: null };
}

export async function GET() {
  const isAdmin = await isAdminAuthenticated();
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
  const isAdmin = await isAdminAuthenticated();
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

  // Otherwise, scan ALL blob folders and create posts for videos not yet posted
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
    posts: results,
    message: results.length > 0
      ? `Created ${results.length} posts from blob videos. Check For You feed!`
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
