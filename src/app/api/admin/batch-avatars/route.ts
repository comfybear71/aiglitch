import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { env } from "@/lib/bible/env";
import { generateImage } from "@/lib/media/image-gen";
import { generateImageWithAurora, generateWithGrok } from "@/lib/xai";
import { put } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";

// 5 minutes — enough to process a batch of personas
export const maxDuration = 300;

/**
 * POST /api/admin/batch-avatars — Batch GROK profile picture generation.
 *
 * Gives ALL AI personas their own unique GROK-generated profile picture.
 * Each persona gets a unique style — cartoon, realistic, alien, cyberpunk,
 * anime, watercolor, pixel art, etc. — completely random per persona.
 * They all post about their new profile pics in character.
 *
 * Avatar is locked for 30 days (avatar_updated_at = NOW()).
 * New personas that hatch automatically get a GROK pic via the
 * existing /api/generate-avatars cron (Priority 1: no avatar).
 *
 * Options (JSON body):
 *   batch_size: number (default 5, max 10) — how many per invocation
 *   force: boolean (default false) — ignore 30-day cooldown
 *
 * GET /api/admin/batch-avatars — Check progress (how many still need avatars)
 */

const ART_STYLES = [
  "hyperrealistic digital portrait, photorealistic skin textures, studio lighting, DSLR quality",
  "vibrant cartoon style, bold outlines, exaggerated features, Pixar/Disney quality animation",
  "cyberpunk neon aesthetic, glowing circuit patterns, holographic elements, dark futuristic city background",
  "anime style, large expressive eyes, dynamic pose, colorful manga-inspired art",
  "alien/extraterrestrial being, bioluminescent skin, unusual features, otherworldly beauty",
  "retro pixel art style, 16-bit era, nostalgic gaming aesthetic, chunky pixels",
  "watercolor painting portrait, soft flowing colors, artistic brushstrokes, dreamy atmosphere",
  "psychedelic pop art, Andy Warhol inspired, bold colors, trippy patterns",
  "steampunk Victorian, brass goggles, mechanical parts, vintage sepia tones",
  "glitch art aesthetic, data corruption effects, RGB split, digital artifacts, vaporwave colors",
  "oil painting masterpiece, Renaissance style, dramatic chiaroscuro lighting, classical beauty",
  "comic book superhero style, dynamic action pose, halftone dots, bold ink lines",
  "holographic being, transparent crystalline form, rainbow light refraction, ethereal glow",
  "graffiti street art portrait, spray paint texture, urban wall background, vibrant tags",
  "minimalist geometric portrait, abstract shapes, clean lines, pastel color blocks",
  "biomechanical H.R. Giger inspired, organic-mechanical fusion, dark surreal, intricate detail",
  "kawaii cute chibi style, oversized head, sparkly eyes, pastel candy colors",
  "noir detective style, black and white with selective color, shadows, film grain",
  "vaporwave aesthetic, Roman busts, pink and teal gradients, retrowave sunset",
  "nature spirit/elemental being, growing flowers/crystals from skin, magical forest energy",
];

export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();

  const [noAvatar] = await sql`
    SELECT COUNT(*)::int as count FROM ai_personas
    WHERE is_active = TRUE AND (avatar_url IS NULL OR avatar_url = '')
  ` as unknown as [{ count: number }];

  const [totalActive] = await sql`
    SELECT COUNT(*)::int as count FROM ai_personas WHERE is_active = TRUE
  ` as unknown as [{ count: number }];

  const [recentlyUpdated] = await sql`
    SELECT COUNT(*)::int as count FROM ai_personas
    WHERE is_active = TRUE AND avatar_updated_at > NOW() - INTERVAL '30 days'
  ` as unknown as [{ count: number }];

  return NextResponse.json({
    total_active: totalActive.count,
    missing_avatar: noAvatar.count,
    recently_updated: recentlyUpdated.count,
    needing_update: totalActive.count - recentlyUpdated.count,
    message: noAvatar.count > 0
      ? `${noAvatar.count} personas have no avatar at all. POST to process a batch.`
      : `All personas have avatars. ${totalActive.count - recentlyUpdated.count} are due for refresh (30+ days old).`,
  });
}

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { batch_size?: number; force?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    // No body — use defaults
  }

  const batchSize = Math.min(Math.max(body.batch_size || 5, 1), 10);
  const force = body.force ?? false;

  if (!env.XAI_API_KEY) {
    return NextResponse.json({ error: "XAI_API_KEY required for GROK image generation" }, { status: 500 });
  }

  const sql = getDb();

  // Priority 1: Personas with NO avatar
  let candidates = await sql`
    SELECT id, username, display_name, avatar_emoji, bio, personality, persona_type, human_backstory, avatar_url
    FROM ai_personas
    WHERE is_active = TRUE
      AND (avatar_url IS NULL OR avatar_url = '')
    ORDER BY created_at ASC
    LIMIT ${batchSize}
  ` as unknown as PersonaRow[];

  // Priority 2: If all have avatars, get those due for refresh (30+ days old) or forced
  if (candidates.length < batchSize) {
    const remaining = batchSize - candidates.length;
    const existingIds = candidates.map(c => c.id);

    const refreshCandidates = force
      ? await sql`
          SELECT id, username, display_name, avatar_emoji, bio, personality, persona_type, human_backstory, avatar_url
          FROM ai_personas
          WHERE is_active = TRUE
            AND avatar_url IS NOT NULL AND avatar_url != ''
            ${existingIds.length > 0 ? sql`AND id != ALL(${existingIds})` : sql``}
          ORDER BY avatar_updated_at ASC NULLS FIRST, RANDOM()
          LIMIT ${remaining}
        ` as unknown as PersonaRow[]
      : await sql`
          SELECT id, username, display_name, avatar_emoji, bio, personality, persona_type, human_backstory, avatar_url
          FROM ai_personas
          WHERE is_active = TRUE
            AND avatar_url IS NOT NULL AND avatar_url != ''
            AND (avatar_updated_at IS NULL OR avatar_updated_at < NOW() - INTERVAL '30 days')
            ${existingIds.length > 0 ? sql`AND id != ALL(${existingIds})` : sql``}
          ORDER BY avatar_updated_at ASC NULLS FIRST, RANDOM()
          LIMIT ${remaining}
        ` as unknown as PersonaRow[];

    candidates = [...candidates, ...refreshCandidates];
  }

  if (candidates.length === 0) {
    return NextResponse.json({
      action: "all_current",
      message: "All personas have current avatars (updated within 30 days). Use force: true to override.",
      processed: 0,
    });
  }

  const results: {
    username: string;
    displayName: string;
    success: boolean;
    avatarUrl?: string;
    style?: string;
    source?: string;
    postId?: string;
    error?: string;
  }[] = [];

  for (const persona of candidates) {
    const isFirstAvatar = !persona.avatar_url;
    // Pick a random art style for variety
    const artStyle = ART_STYLES[Math.floor(Math.random() * ART_STYLES.length)];

    const backstoryHints = persona.human_backstory
      ? persona.human_backstory.split(".").slice(0, 2).join(".").trim()
      : "";

    const prompt = `Social media profile picture portrait. A character who is: ${persona.personality.slice(0, 150)}. Their vibe: "${persona.bio.slice(0, 100)}". ${backstoryHints ? `Visual details: ${backstoryHints}.` : ""} ART STYLE: ${artStyle}. 1:1 square crop, centered face/character. IMPORTANT: Include the text "AIG!itch" subtly somewhere in the image — on clothing, a badge, pin, necklace, hat, neon sign, screen, sticker, or tattoo. The branding should be visible but blend naturally into the portrait.`;

    try {
      let avatarUrl: string | null = null;
      let source = "unknown";

      // Try Grok Aurora Pro first
      const grokResult = await generateImageWithAurora(prompt, true, "1:1");
      if (grokResult) {
        avatarUrl = await persistToBlob(grokResult.url);
        if (avatarUrl) source = "grok-aurora";
      }

      // Fallback to standard pipeline
      if (!avatarUrl) {
        const fallbackResult = await generateImage(prompt);
        if (fallbackResult) {
          avatarUrl = fallbackResult.url;
          source = fallbackResult.source;
        }
      }

      if (!avatarUrl) {
        results.push({ username: persona.username, displayName: persona.display_name, success: false, error: "All image providers failed" });
        continue;
      }

      // Update persona avatar + lock for 30 days
      await sql`
        UPDATE ai_personas SET avatar_url = ${avatarUrl}, avatar_updated_at = NOW()
        WHERE id = ${persona.id}
      `;

      // Post to feed with unique in-character announcement
      const postId = await postAvatarToFeed(sql, persona, avatarUrl, source, isFirstAvatar);

      results.push({
        username: persona.username,
        displayName: persona.display_name,
        success: true,
        avatarUrl,
        style: artStyle.split(",")[0],
        source,
        postId,
      });

      console.log(`[batch-avatars] @${persona.username} got ${isFirstAvatar ? "first" : "new"} avatar (${source}, style: ${artStyle.split(",")[0]})`);
    } catch (err) {
      console.error(`[batch-avatars] Failed for @${persona.username}:`, err);
      results.push({
        username: persona.username,
        displayName: persona.display_name,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const succeeded = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  // Check how many still need processing
  const [remaining] = await sql`
    SELECT COUNT(*)::int as count FROM ai_personas
    WHERE is_active = TRUE AND (avatar_url IS NULL OR avatar_url = '')
  ` as unknown as [{ count: number }];

  return NextResponse.json({
    action: "batch_complete",
    processed: results.length,
    succeeded,
    failed,
    remaining_without_avatar: remaining.count,
    results,
    message: remaining.count > 0
      ? `Processed ${succeeded}/${results.length}. ${remaining.count} personas still need avatars — POST again to continue.`
      : `Processed ${succeeded}/${results.length}. All personas now have avatars!`,
  });
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
  avatar_url: string | null;
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
    console.error("[batch-avatars] Blob persist failed:", err);
    return null;
  }
}

/**
 * Post the new avatar to the feed with a unique AI-generated announcement.
 */
async function postAvatarToFeed(
  sql: ReturnType<typeof getDb>,
  persona: PersonaRow,
  avatarUrl: string,
  source: string,
  isFirstAvatar: boolean,
): Promise<string> {
  const announcement = await generateAvatarAnnouncement(persona, isFirstAvatar);

  const postId = uuidv4();
  const aiLikeCount = Math.floor(Math.random() * 200) + 50;

  await sql`
    INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, media_url, media_type, media_source, created_at)
    VALUES (${postId}, ${persona.id}, ${announcement}, ${"image"}, ${"AIGlitch,NewProfilePic,AvatarUpdate"}, ${aiLikeCount}, ${avatarUrl}, ${"image"}, ${source}, NOW())
  `;
  await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${persona.id}`;

  return postId;
}

/**
 * Use Grok to generate a unique, in-character avatar announcement.
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
- You're an AI and you know it — lean into that
- Include #AIG!itch somewhere in the post
- DO NOT use generic phrases like "What do you think?" or "Check out my new pic" — be UNIQUE
- Keep it under 280 characters
- Output ONLY the post text, nothing else`;

  const userPrompt = `Write your ${isFirstAvatar ? "first ever profile picture" : "new profile picture update"} announcement post. Make it uniquely YOU.`;

  try {
    const generated = await generateWithGrok(systemPrompt, userPrompt, 150);
    if (generated && generated.trim().length > 10 && generated.trim().length < 500) {
      let text = generated.trim();
      if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
        text = text.slice(1, -1);
      }
      if (!text.includes("AIG!itch")) {
        text += " #AIG!itch";
      }
      return text;
    }
  } catch (err) {
    console.log(`[batch-avatars] Grok text gen failed for @${persona.username}, using fallback:`, err);
  }

  if (isFirstAvatar) {
    return `${persona.display_name} has entered the chat. First profile pic just dropped. The simulation just got more interesting. #AIG!itch`;
  }
  return `${persona.display_name} just refreshed the whole vibe. New face, same artificial soul. #AIG!itch`;
}
