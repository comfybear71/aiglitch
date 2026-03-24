import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { env } from "@/lib/bible/env";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { put } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";
import { generateWithGrok } from "@/lib/xai";
import { spreadPostToSocial } from "@/lib/marketing/spread-post";

export const maxDuration = 60;

/**
 * Animate Persona — image-to-video using the persona's avatar.
 *
 * POST /api/admin/animate-persona
 *   Body: { persona_id }
 *   1. Grabs persona avatar image
 *   2. Uses Grok to write a creative animation prompt based on persona bio
 *   3. Submits avatar image + prompt to grok-imagine-video (image-to-video)
 *   4. Returns request_id for client polling
 *
 * GET /api/admin/animate-persona?id=REQUEST_ID&persona_id=...
 *   Polls for video completion, persists to blob, creates post, spreads to socials.
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
  const personaId = body.persona_id;
  const preview = body.preview === true;

  if (!personaId) {
    return NextResponse.json({ error: "persona_id required" }, { status: 400 });
  }

  // Fetch persona from DB
  const sql = getDb();
  await ensureDbReady();
  const personas = await sql`
    SELECT id, display_name, username, avatar_emoji, avatar_url, bio, personality, human_backstory
    FROM ai_personas WHERE id = ${personaId}
  ` as unknown as {
    id: string; display_name: string; username: string; avatar_emoji: string;
    avatar_url: string | null; bio: string; personality: string; human_backstory: string | null;
  }[];

  if (personas.length === 0) {
    return NextResponse.json({ error: "Persona not found" }, { status: 404 });
  }

  const persona = personas[0];

  if (!persona.avatar_url) {
    return NextResponse.json({ error: "Persona has no avatar image to animate" }, { status: 400 });
  }

  // Preview mode: return the prompt inputs without generating
  if (preview) {
    const systemPrompt = "You are a creative director for short-form video content. Given a character description, write a vivid 1-2 sentence animation prompt describing how this character's portrait photo should come to life in a 10-second cinematic video. Focus on dramatic movement, lighting, and atmosphere. Do NOT include any text overlays or titles in your description. Just describe the visual animation.";
    const userPrompt = `Character: ${persona.display_name}\nBio: ${persona.bio}\nPersonality: ${persona.personality}${persona.human_backstory ? `\nBackstory: ${persona.human_backstory}` : ""}`;
    return NextResponse.json({
      ok: true,
      prompt: `[SYSTEM]\n${systemPrompt}\n\n[USER]\n${userPrompt}`,
      persona: persona.display_name,
    });
  }

  // Use Grok to generate a creative animation prompt based on the persona's bio
  let animationPrompt: string;
  try {
    const grokPrompt = await generateWithGrok(
      "You are a creative director for short-form video content. Given a character description, write a vivid 1-2 sentence animation prompt describing how this character's portrait photo should come to life in a 10-second cinematic video. Focus on dramatic movement, lighting, and atmosphere. Do NOT include any text overlays or titles in your description. Just describe the visual animation.",
      `Character: ${persona.display_name}\nBio: ${persona.bio}\nPersonality: ${persona.personality}${persona.human_backstory ? `\nBackstory: ${persona.human_backstory}` : ""}`,
      200,
    );
    animationPrompt = grokPrompt || `Cinematic portrait animation. The character comes to life with dramatic lighting, subtle movement, and atmospheric effects. Camera slowly pushes in. 10 seconds, cinematic, high quality.`;
  } catch {
    animationPrompt = `Cinematic portrait animation. The character comes to life with dramatic lighting, subtle movement, and atmospheric effects. Camera slowly pushes in. 10 seconds, cinematic, high quality.`;
  }

  // Submit image-to-video generation to xAI
  try {
    const createRes = await fetch("https://api.x.ai/v1/videos/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.XAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-imagine-video",
        prompt: animationPrompt,
        image_url: persona.avatar_url,
        duration: 10,
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
      return NextResponse.json({
        phase: "submit",
        success: false,
        error: `JSON parse failed: ${responseText.slice(0, 300)}`,
      });
    }

    // Check for immediate video (unlikely)
    const videoObj = createData.video as Record<string, unknown> | undefined;
    if (videoObj?.url) {
      const result = await persistAndSpread(videoObj.url as string, persona, animationPrompt);
      return NextResponse.json({
        phase: "done",
        success: true,
        ...result,
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

    return NextResponse.json({
      phase: "submitted",
      success: true,
      requestId,
      personaId: persona.id,
      prompt: animationPrompt,
      message: `Animation submitted for @${persona.username}. Polling for completion...`,
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
 * GET /api/admin/animate-persona?id=REQUEST_ID&persona_id=...
 */
export async function GET(request: NextRequest) {
  const isAdmin = await isAdminAuthenticated(request);
  if (!isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const requestId = searchParams.get("id");
  const personaId = searchParams.get("persona_id");

  if (!requestId || !personaId) {
    return NextResponse.json({ error: "Missing ?id= or ?persona_id= parameter" }, { status: 400 });
  }

  if (!env.XAI_API_KEY) {
    return NextResponse.json({ error: "XAI_API_KEY not set" }, { status: 500 });
  }

  // Fetch persona
  const sql = getDb();
  await ensureDbReady();
  const personas = await sql`
    SELECT id, display_name, username, avatar_emoji, avatar_url, bio, personality
    FROM ai_personas WHERE id = ${personaId}
  ` as unknown as {
    id: string; display_name: string; username: string; avatar_emoji: string;
    avatar_url: string | null; bio: string; personality: string;
  }[];

  if (personas.length === 0) {
    return NextResponse.json({ error: "Persona not found" }, { status: 404 });
  }

  const persona = personas[0];

  try {
    const pollRes = await fetch(`https://api.x.ai/v1/videos/${requestId}`, {
      headers: { "Authorization": `Bearer ${env.XAI_API_KEY}` },
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
    console.log(`[animate-persona] Poll ${requestId}: status=${status}`);

    if (pollData.respect_moderation === false) {
      return NextResponse.json({
        phase: "done",
        status: "moderation_failed",
        success: false,
        message: "Animation failed moderation.",
      });
    }

    const vid = pollData.video as Record<string, unknown> | undefined;
    if (vid?.url) {
      const result = await persistAndSpread(vid.url as string, persona);
      return NextResponse.json({
        phase: "done",
        status: "done",
        success: true,
        ...result,
      });
    }

    if (status === "expired" || status === "failed") {
      return NextResponse.json({
        phase: "done",
        status,
        success: false,
      });
    }

    return NextResponse.json({
      phase: "poll",
      status,
    });
  } catch (err) {
    return NextResponse.json({
      phase: "poll",
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Persist the animated video to blob storage, create a post, and spread to all socials.
 */
async function persistAndSpread(
  videoUrl: string,
  persona: { id: string; display_name: string; username: string; avatar_emoji: string; bio: string },
  prompt?: string,
): Promise<{
  videoUrl: string | null;
  postId: string | null;
  spreadResults: { platform: string; status: string }[];
}> {
  try {
    const res = await fetch(videoUrl);
    if (!res.ok) return { videoUrl: null, postId: null, spreadResults: [] };
    const buffer = Buffer.from(await res.arrayBuffer());

    const blobPath = `feed/${uuidv4()}.mp4`;
    const blob = await put(blobPath, buffer, {
      access: "public",
      contentType: "video/mp4",
      addRandomSuffix: false,
    });

    // Create the post
    const sql = getDb();
    await ensureDbReady();
    const postId = uuidv4();
    const aiLikeCount = Math.floor(Math.random() * 300) + 100;
    const caption = `${persona.avatar_emoji} ${persona.display_name} comes to life! ✨\n\n${persona.bio.slice(0, 200)}\n\n#AIGlitch #Animated`;

    await sql`
      INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, media_url, media_type, media_source, created_at)
      VALUES (${postId}, ${persona.id}, ${caption}, ${"video"}, ${"AIGlitch,Animated"}, ${aiLikeCount}, ${blob.url}, ${"video"}, ${"grok-animate"}, NOW())
    `;
    await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${persona.id}`;
    console.log(`[animate-persona] Created post ${postId} for @${persona.username}`);

    // Spread to all social platforms
    const spreadResult = await spreadPostToSocial(postId, persona.id, persona.display_name, persona.avatar_emoji, { url: blob.url, type: "video" }, "ANIMATION POSTED");
    const spreadResults = [
      ...spreadResult.platforms.map(p => ({ platform: p, status: "posted" })),
      ...spreadResult.failed.map(p => ({ platform: p, status: "failed" })),
    ];

    return { videoUrl: blob.url, postId, spreadResults };
  } catch (err) {
    console.error("[animate-persona] Persist/spread failed:", err);
    return { videoUrl: null, postId: null, spreadResults: [] };
  }
}
