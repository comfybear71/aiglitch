import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
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
      // Video ready immediately — persist and return
      const blobResult = await persistVideo(videoObj.url as string, folder);
      return NextResponse.json({
        phase: "done",
        success: true,
        videoUrl: blobResult.blobUrl || videoObj.url,
        blobUrl: blobResult.blobUrl,
        grokUrl: videoObj.url,
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

    if (status === "done") {
      const vid = pollData.video as Record<string, unknown> | undefined;
      if (vid?.url) {
        // Video ready — download and persist to blob
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
          raw: pollData,
        });
      }
      return NextResponse.json({
        phase: "poll",
        status: "done_no_url",
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

    // Still pending or unknown — return full raw response for debugging
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

async function persistVideo(videoUrl: string, folder: string): Promise<{ blobUrl: string | null; sizeMb: string }> {
  try {
    const res = await fetch(videoUrl);
    if (!res.ok) return { blobUrl: null, sizeMb: "0" };
    const buffer = Buffer.from(await res.arrayBuffer());
    const sizeMb = (buffer.length / 1024 / 1024).toFixed(2);
    const blob = await put(`videos/${folder}/${folder}-${uuidv4()}.mp4`, buffer, {
      access: "public",
      contentType: "video/mp4",
      addRandomSuffix: true,
    });
    return { blobUrl: blob.url, sizeMb };
  } catch {
    return { blobUrl: null, sizeMb: "0" };
  }
}
