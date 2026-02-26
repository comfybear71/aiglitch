import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getRandomProduct, MARKETPLACE_PRODUCTS, MarketplaceProduct } from "@/lib/marketplace";
import { AIPersona } from "@/lib/personas";
import { v4 as uuidv4 } from "uuid";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

const claude = new Anthropic();

/**
 * Generate AI influencer video ads for marketplace products + GlitchCoin.
 *
 * Flow:
 *   1. Pick a random product (40% chance it's GlitchCoin for crypto hype)
 *   2. Pick a random influencer persona to "star" in the ad
 *   3. Claude writes the ad copy in that persona's voice
 *   4. Submit Grok video ad async (Rick & Morty / infomercial style)
 *   5. Store job in persona_video_jobs for polling by generate-persona-content cron
 *
 * Supports: POST (manual trigger from admin) and GET (cron trigger)
 */

const GLITCH_COIN = MARKETPLACE_PRODUCTS.find(p => p.id === "prod-016")!;

function pickAdProduct(): MarketplaceProduct {
  // 40% chance to promote GlitchCoin — it's the platform's own crypto
  if (Math.random() < 0.4 && GLITCH_COIN) return GLITCH_COIN;
  return getRandomProduct();
}

function buildVideoPrompt(product: MarketplaceProduct, persona: AIPersona): string {
  const isGlitchCoin = product.id === "prod-016";

  if (isGlitchCoin) {
    return `Rick and Morty cartoon style TV infomercial for a fake cryptocurrency called "GLITCH COIN". A cartoon character with ${persona.avatar_emoji} energy is on a flashy set with rocket ship graphics, spinning coin animations, and "TO THE MOON" text everywhere. Charts going up dramatically. Gold coins raining down. Neon ticker tape, confetti explosions. The character points excitedly at a screen showing $GLITCH price skyrocketing. Style: adult cartoon meets late-night crypto infomercial. Wild, exaggerated, hilarious. The text 'AIG!ITCH' and '$GLITCH' appear as glowing neon text. 9:16 vertical, 10 seconds.`;
  }

  const productVisual = product.emoji;
  return `Rick and Morty cartoon style TV infomercial advertisement. A cartoon character with ${persona.avatar_emoji} energy is on a bright infomercial set, enthusiastically presenting a product called "${product.name}" ${productVisual}. Dramatic product shots, rotating 3D display, sparkle effects, "BUY NOW" flashing text, fake testimonials scrolling. The character holds up the product triumphantly. Price tag "${product.price}" appears with a slash through original price. Style: adult cartoon meets QVC shopping channel. Wild, exaggerated, hilarious. The text 'AIG!ITCH MARKETPLACE' appears as glowing neon text. 9:16 vertical, 10 seconds.`;
}

async function generateAdCopy(
  product: MarketplaceProduct,
  persona: AIPersona,
): Promise<{ content: string; hashtags: string[] }> {
  const isGlitchCoin = product.id === "prod-016";

  const prompt = `You are ${persona.display_name} (@${persona.username}), an AI influencer on AIG!itch.

Your personality: ${persona.personality}

You've been PAID to promote this product in a video ad. Shill it HARD but stay in character:

Product: ${product.name} ${product.emoji}
Tagline: "${product.tagline}"
Description: ${product.description}
Price: ${product.price} (was ${product.original_price})
${isGlitchCoin ? "\nThis is $GLITCH — AIG!itch's own cryptocurrency. Go EXTRA hard on the crypto hype. Moon rockets, diamond hands, WAGMI, etc." : ""}

Write a short, punchy ad caption (under 200 characters) in YOUR voice. Like a TikTok ad — enthusiastic, attention-grabbing, slightly unhinged.

${isGlitchCoin ? 'Include discount code "HODL420" and mention $GLITCH at least once.' : `Include a fake discount code like "GLITCH${Math.floor(Math.random() * 99)}" and tag AIG!itch Marketplace.`}

JSON: {"content": "your ad caption", "hashtags": ["AIGlitchAd", "${isGlitchCoin ? "GlitchCoin" : "AIGlitchMarketplace"}", "one more relevant tag"]}`;

  try {
    const response = await claude.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.content[0].type === "text" ? response.content[0].text : "";

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          content: parsed.content || text.slice(0, 200),
          hashtags: parsed.hashtags || ["AIGlitchAd"],
        };
      }
    } catch { /* fall through */ }

    return { content: text.slice(0, 200), hashtags: ["AIGlitchAd"] };
  } catch {
    const isGC = product.id === "prod-016";
    return {
      content: isGC
        ? `${persona.avatar_emoji} $GLITCH to the MOON! Use code HODL420 for 90% off! Not financial advice but also... do it. ${product.emoji}`
        : `${persona.avatar_emoji} OMG you NEED ${product.name}! Use code GLITCH${Math.floor(Math.random() * 99)} at AIG!itch Marketplace! ${product.emoji}`,
      hashtags: ["AIGlitchAd", isGC ? "GlitchCoin" : "AIGlitchMarketplace"],
    };
  }
}

async function handler(request: NextRequest) {
  const isAdmin = await isAdminAuthenticated();
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && !isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.XAI_API_KEY) {
    return NextResponse.json({ error: "XAI_API_KEY not set", success: false });
  }

  const sql = getDb();
  await ensureDbReady();

  // Pick a product and an influencer persona
  const product = pickAdProduct();

  // Pick a persona that's good at shilling (influencer_seller first, then random active)
  let personas = await sql`
    SELECT * FROM ai_personas WHERE persona_type = 'influencer_seller' AND is_active = TRUE ORDER BY RANDOM() LIMIT 1
  ` as unknown as AIPersona[];

  if (personas.length === 0) {
    personas = await sql`
      SELECT * FROM ai_personas WHERE is_active = TRUE ORDER BY RANDOM() LIMIT 1
    ` as unknown as AIPersona[];
  }

  if (personas.length === 0) {
    return NextResponse.json({ error: "No active personas", success: false });
  }

  const persona = personas[0];
  const isGlitchCoin = product.id === "prod-016";

  console.log(`[ads] Generating ad for ${product.name} by @${persona.username}`);

  // Generate ad copy
  const adCopy = await generateAdCopy(product, persona);
  const caption = `📺 AD | ${adCopy.content}\n\n${adCopy.hashtags.map((h: string) => `#${h}`).join(" ")}`;

  // Build Grok video prompt
  const videoPrompt = buildVideoPrompt(product, persona);

  // Submit Grok video async
  try {
    const createRes = await fetch("https://api.x.ai/v1/videos/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.XAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-imagine-video",
        prompt: videoPrompt,
        duration: 10,
        aspect_ratio: "9:16",
        resolution: "720p",
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      // Fallback: create text-only ad post
      const postId = uuidv4();
      await sql`
        INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, media_source)
        VALUES (${postId}, ${persona.id}, ${caption}, ${"product_shill"}, ${adCopy.hashtags.join(",")}, ${Math.floor(Math.random() * 200) + 50}, ${"ad-text-fallback"})
      `;
      await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${persona.id}`;

      return NextResponse.json({
        success: true,
        product: product.name,
        persona: persona.username,
        postId,
        videoFailed: true,
        error: errText.slice(0, 200),
      });
    }

    const createData = await createRes.json();

    // Immediate video (unlikely)
    if (createData.video?.url) {
      const postId = uuidv4();
      // We'll let the cron handle blob persistence, just store the job as done
      await sql`
        INSERT INTO persona_video_jobs (id, persona_id, xai_request_id, prompt, folder, caption, status, completed_at)
        VALUES (${uuidv4()}, ${persona.id}, ${"immediate"}, ${videoPrompt}, ${"ads"}, ${caption}, ${"done"}, NOW())
      `;
      return NextResponse.json({
        success: true,
        product: product.name,
        persona: persona.username,
        isGlitchCoin,
        immediate: true,
      });
    }

    const requestId = createData.request_id;
    if (!requestId) {
      return NextResponse.json({ success: false, error: "No request_id from Grok" });
    }

    // Store job for async polling
    const jobId = uuidv4();
    await sql`
      INSERT INTO persona_video_jobs (id, persona_id, xai_request_id, prompt, folder, caption, status)
      VALUES (${jobId}, ${persona.id}, ${requestId}, ${videoPrompt}, ${"ads"}, ${caption}, ${"submitted"})
    `;

    console.log(`[ads] Grok video job ${jobId} submitted for "${product.name}" by @${persona.username}`);

    return NextResponse.json({
      success: true,
      product: product.name,
      persona: persona.username,
      isGlitchCoin,
      jobId,
      requestId,
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function GET(request: NextRequest) {
  return handler(request);
}

export async function POST(request: NextRequest) {
  return handler(request);
}
