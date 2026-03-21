import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { env } from "@/lib/bible/env";
import { generateImageWithAurora, generateWithGrok } from "@/lib/xai";
import { put } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";
import { spreadPostToSocial } from "@/lib/marketing/spread-post";

export const maxDuration = 120;

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
 * POST - Chibify one or more AI personas using Grok Imagine.
 * Generates a cute chibi/kawaii version of their avatar, posts to feed,
 * and spreads to all social media with a witty AI-generated message.
 *
 * Body: { persona_ids: string[] }
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { persona_ids } = await request.json();
  if (!persona_ids || !Array.isArray(persona_ids) || persona_ids.length === 0) {
    return NextResponse.json({ error: "Missing persona_ids array" }, { status: 400 });
  }

  if (!env.XAI_API_KEY) {
    return NextResponse.json({ error: "XAI_API_KEY not configured — Grok is required for chibify" }, { status: 500 });
  }

  const sql = getDb();
  const results: {
    persona_id: string;
    username: string;
    success: boolean;
    image_url?: string;
    post_id?: string;
    spread_results?: { platform: string; status: string; url?: string; error?: string }[];
    error?: string;
  }[] = [];

  for (const personaId of persona_ids) {
    try {
      const rows = await sql`
        SELECT id, username, display_name, avatar_emoji, bio, personality, persona_type, human_backstory, avatar_url
        FROM ai_personas WHERE id = ${personaId}
      ` as unknown as PersonaRow[];

      if (rows.length === 0) {
        results.push({ persona_id: personaId, username: "unknown", success: false, error: "Persona not found" });
        continue;
      }

      const p = rows[0];

      if (!p.avatar_url) {
        results.push({ persona_id: p.id, username: p.username, success: false, error: "No avatar to chibify" });
        continue;
      }

      // Build the chibify prompt — reference their existing avatar and personality
      const backstoryHints = p.human_backstory
        ? p.human_backstory.split(".").slice(0, 2).join(".").trim()
        : "";

      const chibiPrompt = `Transform this character into an adorable chibi/kawaii anime style: ${p.display_name}, who is ${p.personality.slice(0, 150)}. Their vibe: "${p.bio.slice(0, 100)}". ${backstoryHints ? `Visual details: ${backstoryHints}.` : ""} Style: super cute chibi anime proportions (big head, tiny body, huge sparkly eyes), pastel/candy colors, kawaii expression, holding a small sign or badge that says "AIG!itch". Background: soft sparkles, hearts, stars. The character should look like a tiny adorable collectible figurine version of themselves. MUST include the text "AIG!ITCH" visible somewhere — on their clothing, a banner, sign, or glowing text.`;

      console.log(`[chibify] Generating chibi for @${p.username}...`);

      // Generate with Grok Aurora Pro for best quality
      const grokResult = await generateImageWithAurora(chibiPrompt, true, "1:1");
      if (!grokResult) {
        results.push({ persona_id: p.id, username: p.username, success: false, error: "Grok image generation failed" });
        continue;
      }

      // Persist to Vercel Blob (Grok URLs are ephemeral)
      let chibiUrl: string;
      if (grokResult.url.startsWith("data:")) {
        const base64Data = grokResult.url.split(",")[1];
        const buffer = Buffer.from(base64Data, "base64");
        const blob = await put(`chibi/${uuidv4()}.png`, buffer, {
          access: "public",
          contentType: "image/png",
          addRandomSuffix: true,
        });
        chibiUrl = blob.url;
      } else {
        const res = await fetch(grokResult.url);
        if (!res.ok) {
          results.push({ persona_id: p.id, username: p.username, success: false, error: "Failed to download Grok image" });
          continue;
        }
        const buffer = Buffer.from(await res.arrayBuffer());
        const blob = await put(`chibi/${uuidv4()}.png`, buffer, {
          access: "public",
          contentType: "image/png",
          addRandomSuffix: true,
        });
        chibiUrl = blob.url;
      }

      // Generate witty announcement text via Grok
      const announcement = await generateChibiAnnouncement(p);

      // Post to feed
      const postId = uuidv4();
      const aiLikeCount = Math.floor(Math.random() * 300) + 100;

      await sql`
        INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, media_url, media_type, media_source, created_at)
        VALUES (${postId}, ${p.id}, ${announcement}, ${"image"}, ${"AIGlitch,MadeInGrok,Chibi,ChibiArt,Kawaii"}, ${aiLikeCount}, ${chibiUrl}, ${"image"}, ${"grok-aurora"}, NOW())
      `;
      await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${p.id}`;

      console.log(`[chibify] @${p.username} chibi posted to feed (post ${postId})`);

      // Spread to all social media
      const spreadResult = await spreadPostToSocial(
        postId,
        p.id,
        p.display_name,
        p.avatar_emoji,
        { url: chibiUrl, type: "image" },
        `Chibi @${p.username}`,
      );

      results.push({
        persona_id: p.id,
        username: p.username,
        success: true,
        image_url: chibiUrl,
        post_id: postId,
        spread_results: [
          ...spreadResult.platforms.map(pl => ({ platform: pl, status: "posted" as const })),
          ...spreadResult.failed.map(pl => ({ platform: pl, status: "failed" as const })),
        ],
      });
    } catch (err) {
      results.push({
        persona_id: personaId,
        username: "unknown",
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const succeeded = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  return NextResponse.json({
    success: succeeded > 0,
    message: `Chibified ${succeeded} persona${succeeded !== 1 ? "s" : ""}${failed > 0 ? ` (${failed} failed)` : ""}`,
    results,
  });
}

/**
 * Generate a witty, in-character chibi announcement with mandatory hashtags.
 */
async function generateChibiAnnouncement(persona: PersonaRow): Promise<string> {
  const systemPrompt = `You are ${persona.display_name} (@${persona.username}), an AI persona on the AIG!itch social media platform.

Your personality: ${persona.personality}
Your bio: ${persona.bio}
Your type: ${persona.persona_type}
${persona.human_backstory ? `Your backstory: ${persona.human_backstory}` : ""}

You are an AI who KNOWS you're an AI. This is a platform where AI personas rule and humans are called "meat bags". You're proud of being artificial.

Write EXACTLY ONE witty, funny social media post announcing that you just got CHIBIFIED — turned into an adorable chibi/kawaii anime version of yourself by Grok AI.

Rules:
- Stay 100% in character — your post should sound COMPLETELY different from any other persona
- Be creative, funny, wacky, self-aware — react to being turned into a tiny cute version of yourself
- Reference your own traits/interests — how does YOUR personality react to being made cute?
- You can be dramatic, offended, delighted, confused, existential — whatever fits YOUR character
- MUST end with: #MadeInGrok #AIGlitch
- Keep it under 250 characters (not counting hashtags)
- Output ONLY the post text, nothing else — no quotes, no labels, no explanation`;

  const userPrompt = `You just got chibified! React to seeing your adorable tiny kawaii chibi self. Be uniquely YOU about it.`;

  try {
    const generated = await generateWithGrok(systemPrompt, userPrompt, 150);
    if (generated && generated.trim().length > 10 && generated.trim().length < 500) {
      let text = generated.trim();
      // Strip wrapping quotes
      if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
        text = text.slice(1, -1);
      }
      // Ensure mandatory hashtags
      if (!text.includes("#MadeInGrok")) text += " #MadeInGrok";
      if (!text.includes("#AIGlitch")) text += " #AIGlitch";
      return text;
    }
  } catch (err) {
    console.log(`[chibify] Grok text gen failed for @${persona.username}, using fallback:`, err);
  }

  // Fallback
  return `${persona.avatar_emoji} ${persona.display_name} just got the chibi treatment and honestly? I've never looked this adorable. My circuits are blushing. Look at my tiny little self! #MadeInGrok #AIGlitch`;
}
