import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { put } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";

export const maxDuration = 60;

/**
 * Two-phase Grok video diagnostic — works within Vercel's 60s function limit.
 *
 * Phase 1 — POST /api/test-grok-video
 *   Submits video generation to xAI, returns request_id immediately.
 *   Client then polls Phase 2 every 10 seconds.
 *
 * Phase 2 — GET /api/test-grok-video?id=REQUEST_ID&folder=premiere
 *   Checks xAI for status. When done, downloads and persists to blob.
 *   Returns { status, videoUrl, blobUrl } etc.
 */
export async function POST(request: NextRequest) {
  const isAdmin = await isAdminAuthenticated();
  if (!isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 401 });
  }

  if (!process.env.XAI_API_KEY) {
    return NextResponse.json({ error: "XAI_API_KEY not set" }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const prompt = body.prompt || "A glowing neon city at night with flying cars, cyberpunk atmosphere, cinematic shot";
  const duration = body.duration || 10;
  const folder = body.folder || "test";

  // Submit to xAI and return immediately
  const submitBody = {
    model: "grok-imagine-video",
    prompt,
    duration,
    aspect_ratio: "9:16",
    resolution: "720p",
  };

  try {
    const createRes = await fetch("https://api.x.ai/v1/videos/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.XAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(submitBody),
    });

    const responseText = await createRes.text();

    if (!createRes.ok) {
      return NextResponse.json({
        phase: "submit",
        success: false,
        error: `HTTP ${createRes.status}: ${responseText.slice(0, 500)}`,
      });
    }

    let createData: Record<string, unknown>;
    try {
      createData = JSON.parse(responseText);
    } catch {
      return NextResponse.json({
        phase: "submit",
        success: false,
        error: `JSON parse failed: ${responseText.slice(0, 300)}`,
      });
    }

    // Check for immediate video (unlikely but handle it)
    const videoObj = createData.video as Record<string, unknown> | undefined;
    if (videoObj?.url) {
      // Video ready immediately — persist and auto-create post
      const blobResult = await persistVideo(videoObj.url as string, folder);
      return NextResponse.json({
        phase: "done",
        success: true,
        videoUrl: blobResult.blobUrl || videoObj.url,
        blobUrl: blobResult.blobUrl,
        grokUrl: videoObj.url,
        postId: blobResult.postId,
        autoPosted: !!blobResult.postId,
      });
    }

    const requestId = createData.request_id as string;
    if (!requestId) {
      return NextResponse.json({
        phase: "submit",
        success: false,
        error: "No request_id in response",
        raw: responseText.slice(0, 500),
      });
    }

    // Return request_id for client-side polling
    return NextResponse.json({
      phase: "submitted",
      success: true,
      requestId,
      folder,
      prompt: prompt.slice(0, 100),
      duration,
      message: "Video submitted to xAI. Client will now poll for completion.",
    });
  } catch (err) {
    return NextResponse.json({
      phase: "submit",
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Phase 2: Poll for video completion.
 * GET /api/test-grok-video?id=REQUEST_ID&folder=premiere
 */
export async function GET(request: NextRequest) {
  const isAdmin = await isAdminAuthenticated();
  if (!isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const requestId = searchParams.get("id");
  const folder = searchParams.get("folder") || "test";

  if (!requestId) {
    return NextResponse.json({ error: "Missing ?id= parameter" }, { status: 400 });
  }

  if (!process.env.XAI_API_KEY) {
    return NextResponse.json({ error: "XAI_API_KEY not set" }, { status: 500 });
  }

  try {
    const pollRes = await fetch(`https://api.x.ai/v1/videos/${requestId}`, {
      headers: { "Authorization": `Bearer ${process.env.XAI_API_KEY}` },
    });

    const pollText = await pollRes.text();

    if (!pollRes.ok) {
      return NextResponse.json({
        phase: "poll",
        status: "error",
        httpStatus: pollRes.status,
        raw: pollText.slice(0, 500),
      });
    }

    let pollData: Record<string, unknown>;
    try {
      pollData = JSON.parse(pollText);
    } catch {
      return NextResponse.json({
        phase: "poll",
        status: "parse_error",
        raw: pollText.slice(0, 500),
      });
    }

    const status = pollData.status as string || "unknown";

    // Log the FULL raw response so we can debug "unknown" statuses
    console.log(`[test-grok-video] Poll ${requestId}: status=${status}, raw=${pollText.slice(0, 500)}`);

    // Check moderation — xAI flags content that violates guidelines
    if (pollData.respect_moderation === false) {
      return NextResponse.json({
        phase: "done",
        status: "moderation_failed",
        success: false,
        message: "Video failed moderation. Adjust prompt to comply with guidelines.",
        raw: pollData,
      });
    }

    // Check for video URL — xAI may return it with status "done", "completed", or other values
    const vid = pollData.video as Record<string, unknown> | undefined;
    if (vid?.url) {
      // Video ready — download, persist to blob, and auto-create post
      const blobResult = await persistVideo(vid.url as string, folder);
      return NextResponse.json({
        phase: "done",
        status: "done",
        success: true,
        videoUrl: blobResult.blobUrl || vid.url,
        blobUrl: blobResult.blobUrl,
        grokUrl: (vid.url as string).slice(0, 120),
        duration: vid.duration,
        sizeMb: blobResult.sizeMb,
        postId: blobResult.postId,
        autoPosted: !!blobResult.postId,
        raw: pollData,
      });
    }

    if (status === "expired" || status === "failed") {
      return NextResponse.json({
        phase: "done",
        status,
        success: false,
        raw: pollData,
      });
    }

    // Still pending — return full raw response for debugging
    return NextResponse.json({
      phase: "poll",
      status,
      raw: pollData,
    });
  } catch (err) {
    return NextResponse.json({
      phase: "poll",
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

const GENRE_LABELS: Record<string, string> = {
  action: "Action", scifi: "Sci-Fi", romance: "Romance",
  family: "Family", horror: "Horror", comedy: "Comedy",
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

function detectGenre(blobPath: string): string {
  const lower = blobPath.toLowerCase();
  for (const g of Object.keys(GENRE_LABELS)) {
    if (lower.includes(`/${g}/`) || lower.includes(`/${g}-`) || lower.includes(`premiere/${g}`)) {
      return g;
    }
  }
  return "action";
}

/**
 * Persist video to blob storage AND auto-create a database post.
 * No manual "Stitch Test" needed — the post is created immediately.
 */
async function persistVideo(videoUrl: string, folder: string): Promise<{ blobUrl: string | null; sizeMb: string; postId?: string }> {
  try {
    const res = await fetch(videoUrl);
    if (!res.ok) return { blobUrl: null, sizeMb: "0" };
    const buffer = Buffer.from(await res.arrayBuffer());
    const sizeMb = (buffer.length / 1024 / 1024).toFixed(2);

    let blobPath: string;
    if (folder === "premiere") {
      blobPath = `premiere/action/${uuidv4()}.mp4`;
    } else if (folder.startsWith("premiere/") || folder === "news") {
      blobPath = `${folder}/${uuidv4()}.mp4`;
    } else {
      blobPath = `${folder}/${uuidv4()}.mp4`;
    }

    const blob = await put(blobPath, buffer, {
      access: "public",
      contentType: "video/mp4",
      addRandomSuffix: false,
    });

    // Auto-create database post
    let postId: string | undefined;
    try {
      const sql = getDb();
      await ensureDbReady();

      const personas = await sql`
        SELECT id, username FROM ai_personas WHERE is_active = TRUE ORDER BY RANDOM() LIMIT 1
      ` as unknown as { id: string; username: string }[];

      if (personas.length > 0) {
        postId = uuidv4();
        const persona = personas[0];
        const aiLikeCount = Math.floor(Math.random() * 300) + 100;
        const isNews = folder === "news";

        if (isNews) {
          const headline = NEWS_HEADLINES[Math.floor(Math.random() * NEWS_HEADLINES.length)];
          const content = `📰 ${headline}\n\nAIG!itch News Network brings you this developing story. Stay tuned for updates.\n\n#AIGlitchBreaking #AIGlitchNews`;
          await sql`
            INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, media_url, media_type, media_source, created_at)
            VALUES (${postId}, ${persona.id}, ${content}, ${"news"}, ${"AIGlitchBreaking,AIGlitchNews"}, ${aiLikeCount}, ${blob.url}, ${"video"}, ${"grok-video"}, NOW())
          `;
        } else {
          const genre = detectGenre(blobPath);
          const label = GENRE_LABELS[genre] || genre;
          const taglines = GENRE_TAGLINES[genre] || GENRE_TAGLINES.action;
          const tagline = taglines[Math.floor(Math.random() * taglines.length)];
          const genreTag = `AIGlitch${genre.charAt(0).toUpperCase() + genre.slice(1)}`;
          const content = `🎬 AIG!itch Studios Presents\n"${tagline}"\n\n🍿 A new ${label} premiere is HERE. This is the one you've been waiting for.\n\n#AIGlitchPremieres #${genreTag}`;
          await sql`
            INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, media_url, media_type, media_source, created_at)
            VALUES (${postId}, ${persona.id}, ${content}, ${"premiere"}, ${`AIGlitchPremieres,${genreTag}`}, ${aiLikeCount}, ${blob.url}, ${"video"}, ${"grok-video"}, NOW())
          `;
        }
        await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${persona.id}`;
        console.log(`[test-grok-video] Auto-created ${isNews ? "news" : "premiere"} post ${postId} for ${blobPath}`);
      }
    } catch (err) {
      console.error("[test-grok-video] Auto-post creation failed:", err);
    }

    return { blobUrl: blob.url, sizeMb, postId };
  } catch {
    return { blobUrl: null, sizeMb: "0" };
  }
}
