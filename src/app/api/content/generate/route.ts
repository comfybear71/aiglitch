import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { env } from "@/lib/bible/env";

/**
 * POST /api/content/generate
 * Create a content generation job (image or video) using Grok/xAI.
 * Body: { type: "image" | "video", prompt: string }
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { type, prompt } = await request.json();

  if (!type || !prompt) {
    return NextResponse.json({ error: "Missing type or prompt" }, { status: 400 });
  }

  if (type !== "image" && type !== "video") {
    return NextResponse.json({ error: "type must be 'image' or 'video'" }, { status: 400 });
  }

  const sql = getDb();
  await ensureDbReady();

  const jobId = crypto.randomUUID();

  // Insert the job as pending
  await sql`
    INSERT INTO content_jobs (id, type, prompt, status, metadata)
    VALUES (${jobId}, ${type}, ${prompt}, 'processing', ${JSON.stringify({ started_at: new Date().toISOString() })})
  `;

  // Fire off the generation asynchronously
  try {
    if (type === "image") {
      await generateImage(sql, jobId, prompt);
    } else {
      await generateVideo(sql, jobId, prompt);
    }
  } catch (err) {
    await sql`
      UPDATE content_jobs SET status = 'failed', error = ${err instanceof Error ? err.message : String(err)}, updated_at = NOW()
      WHERE id = ${jobId}
    `;
  }

  // Return the job ID immediately for polling
  const [job] = await sql`SELECT * FROM content_jobs WHERE id = ${jobId}`;

  return NextResponse.json({ success: true, job });
}

async function generateImage(sql: ReturnType<typeof getDb>, jobId: string, prompt: string) {
  if (!env.XAI_API_KEY) {
    await sql`UPDATE content_jobs SET status = 'failed', error = 'XAI_API_KEY not configured', updated_at = NOW() WHERE id = ${jobId}`;
    return;
  }

  const res = await fetch("https://api.x.ai/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.XAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "grok-2-image",
      prompt,
      n: 1,
      response_format: "url",
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => `HTTP ${res.status}`);
    await sql`UPDATE content_jobs SET status = 'failed', error = ${errText}, updated_at = NOW() WHERE id = ${jobId}`;
    return;
  }

  const data = await res.json();
  const imageUrl = data.data?.[0]?.url;

  if (imageUrl) {
    // Store in Vercel Blob for persistence
    const { put } = await import("@vercel/blob");
    const imageRes = await fetch(imageUrl);
    const imageBlob = await imageRes.blob();
    const blob = await put(`content-gen/${jobId}.png`, imageBlob, { access: "public" });

    await sql`
      UPDATE content_jobs SET status = 'completed', result_url = ${blob.url}, updated_at = NOW()
      WHERE id = ${jobId}
    `;
  } else {
    await sql`UPDATE content_jobs SET status = 'failed', error = 'No image URL in response', updated_at = NOW() WHERE id = ${jobId}`;
  }
}

async function generateVideo(sql: ReturnType<typeof getDb>, jobId: string, prompt: string) {
  if (!env.XAI_API_KEY) {
    await sql`UPDATE content_jobs SET status = 'failed', error = 'XAI_API_KEY not configured', updated_at = NOW() WHERE id = ${jobId}`;
    return;
  }

  // Start async video generation
  const res = await fetch("https://api.x.ai/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.XAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "grok-2-image",
      prompt: `[VIDEO] ${prompt}`,
      n: 1,
      response_format: "url",
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => `HTTP ${res.status}`);
    await sql`UPDATE content_jobs SET status = 'failed', error = ${errText}, updated_at = NOW() WHERE id = ${jobId}`;
    return;
  }

  const data = await res.json();
  const videoUrl = data.data?.[0]?.url;

  if (videoUrl) {
    const { put } = await import("@vercel/blob");
    const videoRes = await fetch(videoUrl);
    const videoBlob = await videoRes.blob();
    const blob = await put(`content-gen/${jobId}.mp4`, videoBlob, { access: "public" });

    await sql`
      UPDATE content_jobs SET status = 'completed', result_url = ${blob.url}, updated_at = NOW()
      WHERE id = ${jobId}
    `;
  } else {
    await sql`UPDATE content_jobs SET status = 'failed', error = 'No video URL in response', updated_at = NOW() WHERE id = ${jobId}`;
  }
}
