import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { env } from "@/lib/bible/env";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { put } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";
import { injectCampaignPlacement } from "@/lib/ad-campaigns";

export const maxDuration = 60;

/**
 * POST /api/admin/channels/generate-title
 * Generate an animated title card video for a channel using Grok.
 * Body: { channel_id, channel_slug, title }
 *
 * Creates a short (5s) animated text title video with the channel name.
 * The video should have a dark/transparent background so it can be
 * overlaid on top of the promo video using mix-blend-screen.
 */
export async function POST(request: NextRequest) {
  const isAdmin = await isAdminAuthenticated(request);
  if (!isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 401 });
  }

  if (!env.XAI_API_KEY) {
    return NextResponse.json({ error: "XAI_API_KEY not set" }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const { channel_id, channel_slug, title, style_prompt } = body;

  if (!channel_id || !channel_slug || !title) {
    return NextResponse.json({ error: "channel_id, channel_slug, and title required" }, { status: 400 });
  }

  // Build prompt — use custom style or default glowing neon
  // IMPORTANT: Spelling emphasis — AI video generators often misspell text,
  // so we spell it out letter-by-letter and repeat the exact text multiple times.
  const exactText = title.toUpperCase();
  const spelledOut = exactText.split("").join("-");

  let prompt: string;
  if (style_prompt && style_prompt.trim()) {
    prompt = `A cinematic title card animation on a pure black background. The exact text shown must be "${exactText}" — spelled letter by letter: ${spelledOut}. CRITICAL: the spelling must be exactly "${exactText}", every letter correct, no extra or missing letters. The text appears with a dramatic reveal. Style: ${style_prompt.trim()}. The text is centered, large, and bold. Pure black background is critical — no other elements, no scenery, only the animated text "${exactText}" on black. No watermarks.`;
  } else {
    prompt = `A cinematic title card animation on a pure black background. The exact text shown must be "${exactText}" — spelled letter by letter: ${spelledOut}. CRITICAL: the spelling must be exactly "${exactText}", every letter correct, no extra or missing letters. The text appears with a dramatic reveal — glowing neon letters that flicker and pulse with electric energy, the text materialising letter by letter with sparks and light trails. The letters have a bright cyan/white glow against the pure black background. The animation is sleek, dramatic, and cinematic like a Netflix show title. The text "${exactText}" is centered, large, and bold. Pure black background is critical — no other elements, no scenery, only the glowing animated text on black. No watermarks.`;
  }

  // Preview mode: return prompt without executing
  if (body.preview) {
    return NextResponse.json({ ok: true, prompt, channel_slug, title: exactText });
  }

  // Inject ad campaign placements into the title video prompt
  const { prompt: adPrompt } = await injectCampaignPlacement(prompt, channel_id);

  try {
    const createRes = await fetch("https://api.x.ai/v1/videos/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.XAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-imagine-video",
        prompt: adPrompt,
        duration: 5,
        aspect_ratio: "9:16",
        resolution: "720p",
      }),
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
      return NextResponse.json({ phase: "submit", success: false, error: "JSON parse failed" });
    }

    // Check for immediate completion
    const videoObj = createData.video as Record<string, unknown> | undefined;
    if (videoObj?.url) {
      const result = await persistTitleVideo(videoObj.url as string, channel_id, channel_slug);
      return NextResponse.json({ phase: "done", success: true, ...result });
    }

    const requestId = createData.request_id as string;
    if (!requestId) {
      return NextResponse.json({ phase: "submit", success: false, error: "No request_id" });
    }

    return NextResponse.json({
      phase: "submitted",
      success: true,
      requestId,
      channelSlug: channel_slug,
      title,
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
 * GET /api/admin/channels/generate-title?id=REQUEST_ID&channel_id=...&channel_slug=...
 * Poll for title video completion.
 */
export async function GET(request: NextRequest) {
  const isAdmin = await isAdminAuthenticated(request);
  if (!isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const requestId = searchParams.get("id");
  const channelId = searchParams.get("channel_id");
  const channelSlug = searchParams.get("channel_slug");

  if (!requestId || !channelId || !channelSlug) {
    return NextResponse.json({ error: "Missing id, channel_id, or channel_slug" }, { status: 400 });
  }

  if (!env.XAI_API_KEY) {
    return NextResponse.json({ error: "XAI_API_KEY not set" }, { status: 500 });
  }

  try {
    const pollRes = await fetch(`https://api.x.ai/v1/videos/${requestId}`, {
      headers: { "Authorization": `Bearer ${env.XAI_API_KEY}` },
    });

    const pollText = await pollRes.text();
    if (!pollRes.ok) {
      return NextResponse.json({ phase: "poll", status: "error", httpStatus: pollRes.status });
    }

    let pollData: Record<string, unknown>;
    try {
      pollData = JSON.parse(pollText);
    } catch {
      return NextResponse.json({ phase: "poll", status: "parse_error" });
    }

    const status = pollData.status as string || "unknown";

    if (pollData.respect_moderation === false) {
      return NextResponse.json({ phase: "done", status: "moderation_failed", success: false });
    }

    const vid = pollData.video as Record<string, unknown> | undefined;
    if (vid?.url) {
      const result = await persistTitleVideo(vid.url as string, channelId, channelSlug);
      return NextResponse.json({ phase: "done", status: "done", success: true, ...result });
    }

    if (status === "expired" || status === "failed") {
      return NextResponse.json({ phase: "done", status, success: false });
    }

    return NextResponse.json({ phase: "poll", status });
  } catch (err) {
    return NextResponse.json({
      phase: "poll",
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function persistTitleVideo(
  videoUrl: string,
  channelId: string,
  channelSlug: string,
): Promise<{ blobUrl: string | null }> {
  try {
    const res = await fetch(videoUrl);
    if (!res.ok) return { blobUrl: null };
    const buffer = Buffer.from(await res.arrayBuffer());

    const blobPath = `channels/${channelSlug}/title-${uuidv4()}.mp4`;
    const blob = await put(blobPath, buffer, {
      access: "public",
      contentType: "video/mp4",
      addRandomSuffix: false,
    });

    const sql = getDb();
    await ensureDbReady();

    await sql`
      UPDATE channels SET title_video_url = ${blob.url}, updated_at = NOW() WHERE id = ${channelId}
    `;

    console.log(`[channel-title] Generated title for ${channelSlug}: ${blob.url}`);
    return { blobUrl: blob.url };
  } catch (err) {
    console.error("[channel-title] Persist failed:", err);
    return { blobUrl: null };
  }
}
