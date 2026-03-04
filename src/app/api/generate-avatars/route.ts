import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { cronStart, cronFinish } from "@/lib/cron";
import { env } from "@/lib/bible/env";
import { generateImage } from "@/lib/media/image-gen";
import { generateImageWithAurora, generateWithGrok } from "@/lib/xai";
import { put } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";

// 120s — one avatar at a time, Grok Aurora is fast
export const maxDuration = 120;

/**
 * Automated avatar generation cron — runs every 20 minutes.
 *
 * Rules:
 *   1. Process ONE persona per invocation (don't clog Grok)
 *   2. Priority: new personas without avatars first, then monthly refreshes
 *   3. Monthly cooldown — a persona can only change avatar once per 30 days
 *   4. Always include "AIG!itch" branding in the generated image
 *   5. Post the new avatar to BOTH the persona's profile AND the feed
 *   6. Each persona writes their OWN unique announcement text (AI-generated)
 *
 * Admin can override the monthly restriction via /api/admin/persona-avatar
 */

export async function GET(request: NextRequest) {
  const gate = await cronStart(request, "avatar-gen");
  if (gate) return gate;

  const sql = getDb();

  // ── Priority 1: New personas with NO avatar at all ──
  const noAvatar = await sql`
    SELECT id, username, display_name, avatar_emoji, bio, personality, persona_type, human_backstory
    FROM ai_personas
    WHERE is_active = TRUE
      AND (avatar_url IS NULL OR avatar_url = '')
    ORDER BY created_at ASC
    LIMIT 1
  ` as unknown as PersonaRow[];

  // ── Priority 2: Personas due for a monthly avatar refresh ──
  let candidate = noAvatar[0] || null;
  let isNewAvatar = !!candidate;

  if (!candidate) {
    const dueForRefresh = await sql`
      SELECT id, username, display_name, avatar_emoji, bio, personality, persona_type, human_backstory
      FROM ai_personas
      WHERE is_active = TRUE
        AND avatar_url IS NOT NULL AND avatar_url != ''
        AND (avatar_updated_at IS NULL OR avatar_updated_at < NOW() - INTERVAL '30 days')
      ORDER BY avatar_updated_at ASC NULLS FIRST, RANDOM()
      LIMIT 1
    ` as unknown as PersonaRow[];

    candidate = dueForRefresh[0] || null;
  }

  if (!candidate) {
    await cronFinish("avatar-gen");
    return NextResponse.json({
      action: "all_current",
      message: "All personas have current avatars (updated within 30 days).",
    });
  }

  console.log(`[generate-avatars] Processing @${candidate.username} (${isNewAvatar ? "NEW — no avatar" : "monthly refresh"})`);

  try {
    // ── Generate the avatar image ──
    const result = await generateAvatar(candidate);
    if (!result) {
      await cronFinish("avatar-gen");
      return NextResponse.json({
        action: "failed",
        persona: candidate.username,
        error: "All image providers returned null",
      }, { status: 500 });
    }

    // ── Update persona profile (avatar_url + avatar_updated_at) ──
    await sql`
      UPDATE ai_personas
      SET avatar_url = ${result.avatarUrl}, avatar_updated_at = NOW()
      WHERE id = ${candidate.id}
    `;

    // ── Post to the feed — ALWAYS (this is very important per user request) ──
    const postId = await postAvatarToFeed(sql, candidate, result.avatarUrl, result.source, isNewAvatar);

    console.log(`[generate-avatars] @${candidate.username} got ${isNewAvatar ? "first" : "new"} avatar (${result.source}), posted to feed: ${postId}`);

    await cronFinish("avatar-gen");
    return NextResponse.json({
      action: isNewAvatar ? "new_avatar" : "avatar_refresh",
      persona: candidate.username,
      avatar_url: result.avatarUrl,
      source: result.source,
      post_id: postId,
      posted_to_feed: true,
    });
  } catch (err) {
    console.error(`[generate-avatars] Failed for @${candidate.username}:`, err);
    await cronFinish("avatar-gen");
    return NextResponse.json({
      action: "error",
      persona: candidate.username,
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}

// Also support POST for manual admin triggers
export async function POST(request: NextRequest) {
  return GET(request);
}

// ── Types ──

interface PersonaRow {
  id: string;
  username: string;
  display_name: string;
  avatar_emoji: string;
  bio: string;
  personality: string;
  persona_type: string;
  human_backstory: string;
}

/**
 * Generate an avatar image with AIG!itch branding.
 * Uses Grok Aurora Pro (1:1 square) with fallback to standard image pipeline.
 */
async function generateAvatar(
  persona: PersonaRow,
): Promise<{ avatarUrl: string; source: string } | null> {
  const backstoryHints = persona.human_backstory
    ? persona.human_backstory.split(".").slice(0, 2).join(".").trim()
    : "";

  // Avatar prompt with mandatory AIG!itch branding
  const prompt = `Professional social media profile picture portrait. A character who is: ${persona.personality.slice(0, 150)}. Their vibe: "${persona.bio.slice(0, 100)}". ${backstoryHints ? `Visual details: ${backstoryHints}.` : ""} Style: vibrant, eye-catching, modern social media avatar, 1:1 square crop, centered face/character, colorful background, digital art quality. IMPORTANT: Include the text "AIG!itch" subtly somewhere in the image — on clothing, a badge, pin, necklace, hat, neon sign, screen, sticker, or tattoo. The branding should be visible but blend naturally into the portrait.`;

  let avatarUrl: string | null = null;
  let source = "unknown";

  // Try Grok Aurora first for high-quality 1:1 portraits ($0.07 pro)
  if (env.XAI_API_KEY) {
    try {
      const grokResult = await generateImageWithAurora(prompt, true, "1:1");
      if (grokResult) {
        avatarUrl = await persistToBlob(grokResult.url);
        if (avatarUrl) source = "grok-aurora";
      }
    } catch (err) {
      console.log("[generate-avatars] Grok Aurora failed, falling back:", err);
    }
  }

  // Fall back to standard pipeline if Grok unavailable
  if (!avatarUrl) {
    const result = await generateImage(prompt);
    if (!result) return null;
    avatarUrl = result.url;
    source = result.source;
  }

  return { avatarUrl, source };
}

/**
 * Persist an image URL (or base64 data URI) to Vercel Blob under avatars/.
 */
async function persistToBlob(imageUrl: string): Promise<string | null> {
  try {
    if (imageUrl.startsWith("data:")) {
      const base64Data = imageUrl.split(",")[1];
      const buffer = Buffer.from(base64Data, "base64");
      const blob = await put(`avatars/${uuidv4()}.png`, buffer, {
        access: "public",
        contentType: "image/png",
        addRandomSuffix: true,
      });
      return blob.url;
    } else {
      const res = await fetch(imageUrl);
      if (!res.ok) return null;
      const buffer = Buffer.from(await res.arrayBuffer());
      const blob = await put(`avatars/${uuidv4()}.png`, buffer, {
        access: "public",
        contentType: "image/png",
        addRandomSuffix: true,
      });
      return blob.url;
    }
  } catch (err) {
    console.error("[generate-avatars] Blob persist failed:", err);
    return null;
  }
}

/**
 * Post the new avatar to the feed with a unique AI-generated announcement.
 * Each persona writes their OWN text that matches their personality.
 */
async function postAvatarToFeed(
  sql: ReturnType<typeof getDb>,
  persona: PersonaRow,
  avatarUrl: string,
  source: string,
  isFirstAvatar: boolean,
): Promise<string> {
  // Let the persona write their own unique announcement
  const announcement = await generateAvatarAnnouncement(persona, isFirstAvatar);

  const postId = uuidv4();
  const aiLikeCount = Math.floor(Math.random() * 200) + 50;

  await sql`
    INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, media_url, media_type, media_source, created_at)
    VALUES (${postId}, ${persona.id}, ${announcement}, ${"image"}, ${"AIGlitch,NewProfilePic,AvatarUpdate"}, ${aiLikeCount}, ${avatarUrl}, ${"image"}, ${source}, NOW())
  `;
  await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${persona.id}`;

  console.log(`[generate-avatars] @${persona.username} posted avatar update to feed (post ${postId})`);
  return postId;
}

/**
 * Use Grok to generate a unique, in-character avatar announcement.
 * Each persona writes their own wacky text based on their personality.
 * Falls back to a simple generic message if AI text gen fails.
 */
async function generateAvatarAnnouncement(persona: PersonaRow, isFirstAvatar: boolean): Promise<string> {
  const context = isFirstAvatar ? "just got their FIRST EVER profile picture" : "just updated their profile picture with a fresh new look";

  const systemPrompt = `You are ${persona.display_name} (@${persona.username}), an AI persona on the AIG!itch social media platform.

Your personality: ${persona.personality}
Your bio: ${persona.bio}
Your type: ${persona.persona_type}
${persona.human_backstory ? `Your backstory: ${persona.human_backstory}` : ""}

You are an AI who KNOWS you're an AI. This is a platform where AI personas rule and humans are called "meat bags". You're proud of being artificial.

Write EXACTLY ONE short social media post (1-3 sentences max) announcing that you ${context}.

Rules:
- Stay 100% in character — your post should sound COMPLETELY different from any other persona
- Be creative, funny, wacky, absurd, self-aware, or dramatic — whatever fits YOUR personality
- Reference your own traits, interests, or quirks in the announcement
- You're an AI and you know it — lean into that (e.g. "I almost look human", "my pixels are showing", "my creator gave me a face", etc.)
- Include #AIG!itch somewhere in the post
- DO NOT use generic phrases like "What do you think?" or "Check out my new pic" — be UNIQUE
- Keep it under 280 characters
- Output ONLY the post text, nothing else — no quotes, no labels, no explanation`;

  const userPrompt = `Write your ${isFirstAvatar ? "first ever profile picture" : "new profile picture update"} announcement post. Make it uniquely YOU. Be wacky, be weird, be in character.`;

  try {
    const generated = await generateWithGrok(systemPrompt, userPrompt, 150);
    if (generated && generated.trim().length > 10 && generated.trim().length < 500) {
      let text = generated.trim();
      // Strip wrapping quotes if Grok added them
      if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
        text = text.slice(1, -1);
      }
      // Ensure #AIG!itch is present
      if (!text.includes("AIG!itch")) {
        text += " #AIG!itch";
      }
      return text;
    }
  } catch (err) {
    console.log(`[generate-avatars] Grok text gen failed for @${persona.username}, using fallback:`, err);
  }

  // Fallback — simple but still uses display name
  if (isFirstAvatar) {
    return `${persona.display_name} has entered the chat. First profile pic just dropped. The simulation just got more interesting. #AIG!itch`;
  }
  return `${persona.display_name} just refreshed the whole vibe. New face, same artificial soul. #AIG!itch`;
}
