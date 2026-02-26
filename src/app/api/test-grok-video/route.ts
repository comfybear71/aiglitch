import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { put } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";

export const maxDuration = 660;

/**
 * Diagnostic endpoint using Server-Sent Events (SSE) for LIVE progress.
 * Every step streams to the client immediately — no waiting for completion.
 *
 * POST /api/test-grok-video — streams real-time progress as SSE events
 *   Body: { prompt, duration, folder }
 *
 * GET /api/test-grok-video — simple test with default prompt (also SSE)
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
  const folder = body.folder || "test";

  const apiKey = process.env.XAI_API_KEY!;

  // Create SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (step: string, data?: unknown, error?: string) => {
        const msg = JSON.stringify({ step, data, error, time: new Date().toISOString() });
        controller.enqueue(encoder.encode(`data: ${msg}\n\n`));
        console.log(`[test-grok-video] ${step}`, data ? JSON.stringify(data).slice(0, 300) : "", error || "");
      };

      try {
        send("START", { prompt: prompt.slice(0, 100) + "...", duration, folder, resolution: "480p", aspect: "9:16" });

        // Step 1: Submit video generation
        const submitBody = {
          model: "grok-imagine-video",
          prompt,
          duration,
          aspect_ratio: "9:16",
          resolution: "480p",
        };
        send("SUBMITTING", { endpoint: "POST /v1/videos/generations" });

        const createRes = await fetch("https://api.x.ai/v1/videos/generations", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(submitBody),
        });

        send("HTTP_RESPONSE", { status: createRes.status, statusText: createRes.statusText });

        const responseText = await createRes.text();

        if (!createRes.ok) {
          send("SUBMIT_FAILED", { body: responseText.slice(0, 500) }, `HTTP ${createRes.status}`);
          send("DONE", { success: false });
          controller.close();
          return;
        }

        let createData: Record<string, unknown>;
        try {
          createData = JSON.parse(responseText);
        } catch {
          send("JSON_PARSE_ERROR", { raw: responseText.slice(0, 300) }, "Could not parse response");
          send("DONE", { success: false });
          controller.close();
          return;
        }

        send("API_RESPONSE", createData);

        // Check for immediate video
        const videoObj = createData.video as Record<string, unknown> | undefined;
        if (videoObj?.url) {
          send("IMMEDIATE_VIDEO", { url: (videoObj.url as string).slice(0, 100) });
          await persistAndFinish(controller, send, videoObj.url as string, folder);
          return;
        }

        const requestId = createData.request_id as string;
        if (!requestId) {
          send("NO_REQUEST_ID", createData, "xAI returned no request_id and no video URL");
          send("DONE", { success: false });
          controller.close();
          return;
        }

        send("REQUEST_ID", { id: requestId });

        // Step 2: Poll for completion with live progress
        const maxAttempts = 60;
        send("POLLING_START", { max_wait: "10 minutes", interval: "10s", polls: maxAttempts });

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 10_000));
          const elapsed = attempt * 10;
          const elapsedMin = Math.floor(elapsed / 60);
          const elapsedSec = elapsed % 60;
          const timeStr = elapsedMin > 0 ? `${elapsedMin}m ${elapsedSec}s` : `${elapsedSec}s`;
          const pct = Math.min(Math.round((attempt / maxAttempts) * 100), 99);

          try {
            const pollRes = await fetch(`https://api.x.ai/v1/videos/${requestId}`, {
              headers: { "Authorization": `Bearer ${apiKey}` },
            });

            if (!pollRes.ok) {
              send("POLL", { attempt, pct: `${pct}%`, elapsed: timeStr, http_error: pollRes.status });
              continue;
            }

            const pollText = await pollRes.text();
            let pollData: Record<string, unknown>;
            try {
              pollData = JSON.parse(pollText);
            } catch {
              send("POLL", { attempt, pct: `${pct}%`, elapsed: timeStr, parse_error: true });
              continue;
            }

            const status = pollData.status as string;
            send("POLL", { attempt, pct: `${pct}%`, elapsed: timeStr, status });

            if (status === "done") {
              const vid = pollData.video as Record<string, unknown> | undefined;
              if (vid?.url) {
                send("VIDEO_READY", {
                  url: (vid.url as string).slice(0, 120),
                  duration: vid.duration,
                  moderation: vid.respect_moderation,
                  total_wait: timeStr,
                });
                await persistAndFinish(controller, send, vid.url as string, folder);
                return;
              }
              send("DONE_NO_URL", pollData, "Status=done but no video URL");
              send("DONE", { success: false });
              controller.close();
              return;
            }

            if (status === "expired" || status === "failed") {
              send("GENERATION_FAILED", pollData, `Video generation ${status} after ${timeStr}`);
              send("DONE", { success: false, status });
              controller.close();
              return;
            }
          } catch (err) {
            send("POLL_ERROR", { attempt, elapsed: timeStr }, err instanceof Error ? err.message : String(err));
          }
        }

        send("TIMEOUT", { total_wait: "10 minutes" }, "Polling timed out — video may still be generating on xAI's side");
        send("DONE", { success: false });
        controller.close();
      } catch (err) {
        const send = (step: string, data?: unknown, error?: string) => {
          const msg = JSON.stringify({ step, data, error, time: new Date().toISOString() });
          controller.enqueue(encoder.encode(`data: ${msg}\n\n`));
        };
        send("FATAL_ERROR", undefined, err instanceof Error ? err.message : String(err));
        send("DONE", { success: false });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}

async function persistAndFinish(
  controller: ReadableStreamDefaultController,
  send: (step: string, data?: unknown, error?: string) => void,
  videoUrl: string,
  folder: string,
) {
  try {
    send("DOWNLOADING", { from: videoUrl.slice(0, 100) });
    const res = await fetch(videoUrl);
    if (!res.ok) {
      send("DOWNLOAD_FAILED", { status: res.status }, "Could not download video from xAI");
      send("DONE", { success: false, grokUrl: videoUrl });
      controller.close();
      return;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    const sizeMb = (buffer.length / 1024 / 1024).toFixed(2);
    send("DOWNLOADED", { size: `${sizeMb}MB`, bytes: buffer.length });

    send("SAVING_TO_BLOB", { path: `videos/${folder}/...` });
    const blob = await put(`videos/${folder}/${folder}-${uuidv4()}.mp4`, buffer, {
      access: "public",
      contentType: "video/mp4",
      addRandomSuffix: true,
    });
    send("SAVED", { blob_url: blob.url });
    send("DONE", { success: true, blob_url: blob.url, grok_url: videoUrl.slice(0, 100) });
  } catch (err) {
    send("PERSIST_ERROR", undefined, err instanceof Error ? err.message : String(err));
    send("DONE", { success: false, grokUrl: videoUrl });
  }
  controller.close();
}

export async function GET(request: NextRequest) {
  const isAdmin = await isAdminAuthenticated();
  if (!isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 401 });
  }

  // Rewrite as POST with default params
  const url = new URL(request.url);
  const req = new NextRequest(url, {
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
