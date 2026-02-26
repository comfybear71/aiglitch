import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { list as listBlobs } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";

/**
 * Create a test premiere post using a video from Vercel Blob storage.
 * This lets us test the intro stitch (premiere.mp4 intro → blob video).
 *
 * GET  /api/test-premiere-post — lists available blob videos in premiere/ folder
 * POST /api/test-premiere-post — creates a test post using a blob video URL
 *   Body: { videoUrl?: string } — if omitted, picks the first premiere video found
 */
export async function GET() {
  const isAdmin = await isAdminAuthenticated();
  if (!isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 401 });
  }

  // List all videos in the blob store — check both root and videos/ prefixes
  const folders = ["premiere", "news", "test", "videos/premiere", "videos/test", "videos/news", "videos/breaking"];
  const allVideos: { url: string; pathname: string; size: number; uploadedAt: Date }[] = [];

  for (const prefix of folders) {
    try {
      const result = await listBlobs({ prefix, limit: 20 });
      for (const blob of result.blobs) {
        if (blob.pathname.endsWith(".mp4")) {
          allVideos.push({
            url: blob.url,
            pathname: blob.pathname,
            size: blob.size,
            uploadedAt: blob.uploadedAt,
          });
        }
      }
    } catch (err) {
      console.log(`Could not list blobs for prefix "${prefix}":`, err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json({
    videos: allVideos,
    count: allVideos.length,
    hint: "POST to this endpoint with { videoUrl: '...' } to create a test premiere post",
  });
}

export async function POST(request: NextRequest) {
  const isAdmin = await isAdminAuthenticated();
  if (!isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  let videoUrl = body.videoUrl as string | undefined;

  // If no URL provided, find the first premiere video in blob storage
  if (!videoUrl) {
    const prefixes = ["premiere", "news", "test", "videos/premiere", "videos/test", "videos/news"];
    for (const prefix of prefixes) {
      try {
        const result = await listBlobs({ prefix, limit: 10 });
        const mp4 = result.blobs.find(b => b.pathname.endsWith(".mp4"));
        if (mp4) {
          videoUrl = mp4.url;
          break;
        }
      } catch {
        continue;
      }
    }
  }

  if (!videoUrl) {
    return NextResponse.json({
      error: "No video URL provided and no premiere videos found in blob storage",
      hint: "First run a test video generation, or pass { videoUrl: '...' }",
    }, { status: 400 });
  }

  const sql = getDb();
  await ensureDbReady();

  // Get a random active persona to post as
  const personas = await sql`
    SELECT id, username FROM ai_personas WHERE is_active = TRUE ORDER BY RANDOM() LIMIT 1
  ` as unknown as { id: string; username: string }[];

  if (!personas.length) {
    return NextResponse.json({ error: "No active personas found" }, { status: 500 });
  }

  const persona = personas[0];
  const postId = uuidv4();
  const title = "OVERRIDE";
  const tagline = "The machines remember everything.";
  const genre = "action";

  const content = `🎬 ${title}\n"${tagline}"\n\n🍿 AIG!itch Presents: a new ${genre} premiere is HERE. This is the one you've been waiting for.\n\n#AIGlitchPremieres #AIGlitchAction`;
  const hashtags = "AIGlitchPremieres,AIGlitchAction";
  const aiLikeCount = Math.floor(Math.random() * 300) + 100;

  await sql`
    INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, media_url, media_type, media_source, created_at)
    VALUES (${postId}, ${persona.id}, ${content}, ${"premiere"}, ${hashtags}, ${aiLikeCount}, ${videoUrl}, ${"video"}, ${"grok-video"}, NOW())
  `;
  await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${persona.id}`;

  return NextResponse.json({
    success: true,
    postId,
    videoUrl,
    persona: persona.username,
    message: "Test premiere post created! Check the Premieres tab or For You feed to see intro stitch in action.",
  });
}
