import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { put } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";

export const maxDuration = 660;

/**
 * Diagnostic endpoint: makes ONE Grok video request and returns raw API
 * responses at every step so we can see exactly what's happening.
 *
 * GET /api/test-grok-video — runs a single test with a simple prompt
 * POST /api/test-grok-video — pass { prompt, duration, folder } to customize
 *
 * The "folder" param (default "test") controls the blob storage path:
 *   "news"     → videos/news/...
 *   "premiere"  → videos/premiere/...
 *   "test"     → videos/test/...
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
  const duration = body.duration || 5;
  const folder = body.folder || "test"; // "news", "premiere", or "test"

  const log: { step: string; timestamp: string; data?: unknown; error?: string }[] = [];
  const addLog = (step: string, data?: unknown, error?: string) => {
    log.push({ step, timestamp: new Date().toISOString(), data, error });
    console.log(`[test-grok-video] ${step}`, data ? JSON.stringify(data).slice(0, 500) : "", error || "");
  };

  addLog("START", { prompt: prompt.slice(0, 100), duration, folder });

  // Step 1: Submit video generation
  let requestId: string | null = null;
  let immediateVideoUrl: string | null = null;

  try {
    const submitBody = {
      model: "grok-imagine-video",
      prompt,
      duration,
      aspect_ratio: "9:16",
      resolution: "480p",
    };
    addLog("SUBMIT_REQUEST", submitBody);

    const createRes = await fetch("https://api.x.ai/v1/videos/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.XAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(submitBody),
    });

    addLog("SUBMIT_HTTP_STATUS", { status: createRes.status, statusText: createRes.statusText });

    const responseText = await createRes.text();
    addLog("SUBMIT_RAW_RESPONSE", { body: responseText.slice(0, 1000) });

    if (!createRes.ok) {
      addLog("SUBMIT_FAILED", undefined, `HTTP ${createRes.status}: ${responseText.slice(0, 500)}`);
      return NextResponse.json({ success: false, log });
    }

    let createData: Record<string, unknown>;
    try {
      createData = JSON.parse(responseText);
    } catch {
      addLog("SUBMIT_JSON_PARSE_FAILED", undefined, `Could not parse: ${responseText.slice(0, 200)}`);
      return NextResponse.json({ success: false, log });
    }

    addLog("SUBMIT_PARSED", createData);

    // Check for immediate video URL
    const videoObj = createData.video as Record<string, unknown> | undefined;
    if (videoObj?.url) {
      immediateVideoUrl = videoObj.url as string;
      addLog("IMMEDIATE_VIDEO_URL", { url: immediateVideoUrl });
    }

    // Get request_id
    requestId = (createData.request_id as string) || null;
    if (!requestId && !immediateVideoUrl) {
      addLog("NO_REQUEST_ID", undefined, "No request_id and no immediate video URL in response");
      return NextResponse.json({ success: false, log });
    }

    if (requestId) {
      addLog("GOT_REQUEST_ID", { request_id: requestId });
    }
  } catch (err) {
    addLog("SUBMIT_ERROR", undefined, err instanceof Error ? err.message : String(err));
    return NextResponse.json({ success: false, log });
  }

  // Step 2: Poll for completion
  let videoUrl = immediateVideoUrl;

  if (!videoUrl && requestId) {
    addLog("POLLING_START", { request_id: requestId, max_attempts: 60, interval_sec: 10 });

    for (let attempt = 1; attempt <= 60; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 10_000));

      try {
        const pollUrl = `https://api.x.ai/v1/videos/${requestId}`;
        const pollRes = await fetch(pollUrl, {
          headers: { "Authorization": `Bearer ${process.env.XAI_API_KEY}` },
        });

        const pollText = await pollRes.text();

        if (!pollRes.ok) {
          addLog(`POLL_${attempt}_HTTP_ERROR`, { status: pollRes.status, body: pollText.slice(0, 500) });
          continue;
        }

        let pollData: Record<string, unknown>;
        try {
          pollData = JSON.parse(pollText);
        } catch {
          addLog(`POLL_${attempt}_JSON_ERROR`, { raw: pollText.slice(0, 300) });
          continue;
        }

        const status = pollData.status as string;
        addLog(`POLL_${attempt}`, { status, hasVideo: !!(pollData.video as Record<string, unknown>)?.url });

        if (status === "done") {
          const vid = pollData.video as Record<string, unknown> | undefined;
          if (vid?.url) {
            videoUrl = vid.url as string;
            addLog("VIDEO_READY", {
              url: (videoUrl as string).slice(0, 100),
              duration: vid.duration,
              respect_moderation: vid.respect_moderation,
            });
            break;
          } else {
            addLog("DONE_BUT_NO_URL", pollData);
          }
        }

        if (status === "expired" || status === "failed") {
          addLog("GENERATION_FAILED", pollData);
          return NextResponse.json({ success: false, status, log });
        }

        // Log progress every 6 polls (every minute)
        if (attempt % 6 === 0) {
          addLog(`STILL_PENDING_${attempt * 10}s`, { elapsed: `${attempt * 10}s` });
        }
      } catch (err) {
        addLog(`POLL_${attempt}_ERROR`, undefined, err instanceof Error ? err.message : String(err));
      }
    }

    if (!videoUrl) {
      addLog("POLLING_TIMEOUT", { total_seconds: 600 });
      return NextResponse.json({ success: false, log });
    }
  }

  // Step 3: Persist to blob storage
  let blobUrl: string | null = null;
  if (videoUrl) {
    try {
      addLog("PERSISTING_TO_BLOB", { folder, source_url: (videoUrl as string).slice(0, 100) });
      const res = await fetch(videoUrl);
      if (!res.ok) {
        addLog("BLOB_FETCH_FAILED", { status: res.status });
      } else {
        const buffer = Buffer.from(await res.arrayBuffer());
        addLog("BLOB_DOWNLOADED", { size_bytes: buffer.length, size_mb: (buffer.length / 1024 / 1024).toFixed(2) });
        const blob = await put(`videos/${folder}/${folder}-${uuidv4()}.mp4`, buffer, {
          access: "public",
          contentType: "video/mp4",
          addRandomSuffix: true,
        });
        blobUrl = blob.url;
        addLog("BLOB_PERSISTED", { url: blobUrl });
      }
    } catch (err) {
      addLog("BLOB_ERROR", undefined, err instanceof Error ? err.message : String(err));
    }
  }

  addLog("COMPLETE", {
    success: true,
    grok_video_url: videoUrl ? (videoUrl as string).slice(0, 100) : null,
    blob_url: blobUrl,
    folder,
  });

  return NextResponse.json({
    success: true,
    videoUrl: blobUrl || videoUrl,
    grokUrl: videoUrl,
    blobUrl,
    folder,
    log,
  });
}

export async function GET(request: NextRequest) {
  const isAdmin = await isAdminAuthenticated();
  if (!isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 401 });
  }

  const req = new NextRequest(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify({
      prompt: "A glowing neon city at night with flying cars, cyberpunk atmosphere, cinematic shot",
      duration: 5,
      folder: "test",
    }),
  });
  return POST(req);
}
