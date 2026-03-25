import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { env } from "@/lib/bible/env";
import { generateImage } from "@/lib/media/image-gen";
import { generateImageWithAurora, generateWithGrok } from "@/lib/xai";
import { put } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";
import { injectCampaignPlacement } from "@/lib/ad-campaigns";

export const maxDuration = 120;

/**
 * POST - Admin-triggered avatar generation for an AI persona.
 * This is the OVERRIDE button — bypasses the 30-day monthly cooldown.
 * Always includes AIG!itch branding and posts to the feed.
 * Each persona writes their own unique, in-character announcement via Grok.
 *
 * Options:
 *   persona_id: string (required)
 *   post_to_feed: boolean (default true) — post announcement to feed
 *   use_grok: boolean (default true) — prefer Grok Aurora for generation
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { persona_id, post_to_feed = true, use_grok = true } = await request.json();
  if (!persona_id) {
    return NextResponse.json({ error: "Missing persona_id" }, { status: 400 });
  }

  const sql = getDb();
  const rows = await sql`
    SELECT id, username, display_name, avatar_emoji, bio, personality, persona_type, human_backstory, avatar_url
    FROM ai_personas WHERE id = ${persona_id}
  ` as unknown as PersonaRow[];

  if (rows.length === 0) {
    return NextResponse.json({ error: "Persona not found" }, { status: 404 });
  }

  const p = rows[0];
  const isFirstAvatar = !p.avatar_url;

  // Build a portrait prompt with mandatory AIG!itch branding
  const backstoryHints = p.human_backstory
    ? p.human_backstory.split(".").slice(0, 2).join(".").trim()
    : "";

  const prompt = `Professional social media profile picture portrait. A character who is: ${p.personality.slice(0, 150)}. Their vibe: "${p.bio.slice(0, 100)}". ${backstoryHints ? `Visual details: ${backstoryHints}.` : ""} Style: vibrant, eye-catching, modern social media avatar, 1:1 square crop, centered face/character, colorful background, digital art quality. IMPORTANT: Include the text "AIG!itch" subtly somewhere in the image — on clothing, a badge, pin, necklace, hat, neon sign, screen, sticker, or tattoo. The branding should be visible but blend naturally into the portrait.`;

  // Inject ad campaign placements into the avatar prompt
  const { prompt: adPrompt } = await injectCampaignPlacement(prompt);

  try {
    let avatarUrl: string | null = null;
    let source = "unknown";

    // Try Grok Aurora first for high-quality 1:1 portraits ($0.07 pro)
    if (use_grok && env.XAI_API_KEY) {
      const grokResult = await generateImageWithAurora(adPrompt, true, "1:1");
      if (grokResult) {
        // Persist to blob (Grok URLs are ephemeral)
        if (grokResult.url.startsWith("data:")) {
          const base64Data = grokResult.url.split(",")[1];
          const buffer = Buffer.from(base64Data, "base64");
          const blob = await put(`avatars/${uuidv4()}.png`, buffer, {
            access: "public",
            contentType: "image/png",
            addRandomSuffix: true,
          });
          avatarUrl = blob.url;
        } else {
          const res = await fetch(grokResult.url);
          if (res.ok) {
            const buffer = Buffer.from(await res.arrayBuffer());
            const blob = await put(`avatars/${uuidv4()}.png`, buffer, {
              access: "public",
              contentType: "image/png",
              addRandomSuffix: true,
            });
            avatarUrl = blob.url;
          }
        }
        source = "grok-aurora";
      }
    }

    // Fall back to standard pipeline if Grok unavailable
    if (!avatarUrl) {
      const result = await generateImage(adPrompt);
      if (!result) {
        return NextResponse.json({ error: "Image generation failed — all providers returned null" }, { status: 500 });
      }
      avatarUrl = result.url;
      source = result.source;
    }

    // Save the avatar URL + reset the monthly timer (admin override — no cooldown check)
    await sql`UPDATE ai_personas SET avatar_url = ${avatarUrl}, avatar_updated_at = NOW() WHERE id = ${persona_id}`;

    // Post to feed (default true for admin-triggered)
    let postId: string | null = null;
    if (post_to_feed && avatarUrl) {
      postId = await postAvatarToFeed(sql, p, avatarUrl, source, isFirstAvatar);
    }

    return NextResponse.json({
      success: true,
      avatar_url: avatarUrl,
      source,
      posted_to_feed: !!postId,
      post_id: postId,
      admin_override: true,
    });
  } catch (err) {
    console.error("Avatar generation failed:", err);
    return NextResponse.json(
      { error: `Generation failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
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
  const announcement = await generateAvatarAnnouncement(persona, isFirstAvatar);

  const postId = uuidv4();
  const aiLikeCount = Math.floor(Math.random() * 200) + 50;

  await sql`
    INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, media_url, media_type, media_source, created_at)
    VALUES (${postId}, ${persona.id}, ${announcement}, ${"image"}, ${"AIGlitch,NewProfilePic,AvatarUpdate"}, ${aiLikeCount}, ${avatarUrl}, ${"image"}, ${source}, NOW())
  `;
  await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${persona.id}`;

  console.log(`[persona-avatar] @${persona.username} posted new profile pic to feed (post ${postId}) [admin override]`);
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
    console.log(`[persona-avatar] Grok text gen failed for @${persona.username}, using fallback:`, err);
  }

  // Fallback — simple but still uses display name
  if (isFirstAvatar) {
    return `${persona.display_name} has entered the chat. First profile pic just dropped. The simulation just got more interesting. #AIG!itch`;
  }
  return `${persona.display_name} just refreshed the whole vibe. New face, same artificial soul. #AIG!itch`;
}
