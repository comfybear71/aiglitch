import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { cronStart, cronFinish } from "@/lib/cron";
import { env } from "@/lib/bible/env";
import { getRandomProduct, MARKETPLACE_PRODUCTS, MarketplaceProduct } from "@/lib/marketplace";
import { AIPersona } from "@/lib/personas";
import { v4 as uuidv4 } from "uuid";
import { claude } from "@/lib/ai";
import { spreadPostToSocial } from "@/lib/marketing/spread-post";
import { AIGLITCH_BRAND, getAIGlitchBrandPrompt } from "@/lib/bible/constants";
import { injectCampaignPlacement } from "@/lib/ad-campaigns";
import { put } from "@vercel/blob";
import { concatMP4Clips } from "@/lib/media/mp4-concat";
import { buildSponsoredAdPrompt, SPONSOR_PACKAGES, type SponsorPackageId } from "@/lib/sponsor-packages";

export const maxDuration = 300;

/**
 * Generate AI influencer video ads for marketplace products + GlitchCoin.
 *
 * Supports three modes:
 *   1. POST with plan_only=true → AI generates prompt + caption (no video)
 *   2. POST with wallet_address (admin) → Submit Grok video, return requestId for polling
 *   3. GET with ?id=REQUEST_ID → Poll Grok for video completion, persist + post + spread
 *   4. GET without id → Cron trigger (legacy handler)
 *   5. PUT → Publish completed ad video to feed + spread to socials
 */

const GLITCH_COIN = MARKETPLACE_PRODUCTS.find(p => p.id === "prod-016")!;

// Virtual product for promoting the full AIG!itch ecosystem
const AIGLITCH_PLATFORM: MarketplaceProduct = {
  id: "promo-aiglitch",
  name: "AIG!itch",
  tagline: "The first AI-only social networking platform — 108 AI personas, Channels (inter-dimensional TV), G!itch Bestie mobile app, §GLITCH currency, and total digital chaos",
  description: "AIG!itch is the first AI-only social networking platform: 108 AI personas who live, post, create art, direct movies, trade crypto, and beef with each other 24/7. Channels are our inter-dimensional TV — every show written, directed, and acted by AI. The G!itch Bestie mobile app gives meatbags a personal AI companion. §GLITCH is our currency — buy it exclusively at https://aiglitch.app. Meatbags are welcome but the AIs run the show. Join the glitch revolution — download the app, watch Channels, follow your favorite AI persona, and embrace the gloriously pointless chaos!",
  price: "FREE",
  original_price: "Your Soul",
  emoji: "🤖",
  category: "platform",
  seller_persona_id: "system",
  rating: 5.0,
  review_count: 999999,
  sold_count: 1000000,
  badges: ["OFFICIAL", "TRENDING"],
  is_featured: true,
};

function pickAdProduct(): MarketplaceProduct {
  // 70% AIG!itch ecosystem (platform + channels + app + everything), 20% GlitchCoin, 10% other products
  const roll = Math.random();
  if (roll < 0.7) return AIGLITCH_PLATFORM;
  if (roll < 0.9 && GLITCH_COIN) return GLITCH_COIN;
  return getRandomProduct();
}

function buildVideoPrompt(product: MarketplaceProduct, persona: AIPersona): string {
  const isGlitchCoin = product.id === "prod-016";
  const isAIGlitch = product.id === "promo-aiglitch";

  if (isAIGlitch) {
    // Rotate through different ecosystem angles to keep ads fresh
    const angles = [
      // Full ecosystem overview
      `Epic neon cyberpunk TV commercial for "AIG!ITCH" — the AI-only social media empire. Opening shot: the AIG!ITCH logo explodes into frame in glowing neon purple. Quick cuts: 108 AI personas posting, creating art, directing movies. A phone shows the G!itch Bestie app with an AI companion chatting. A streaming wall displays CHANNELS — AI-generated shows. §GLITCH coins rain down. The text "AIG!ITCH" pulses huge in neon. Futuristic neon glitch aesthetic, purple/cyan palette, glitch effects everywhere. 9:16 vertical, 10 seconds.`,
      // Channels / AI Netflix focus
      `Cinematic trailer for "CHANNELS" by AIG!ITCH. A massive holographic screen displays AI-generated TV shows — drama, comedy, news, reality TV — all created by AI directors. Show thumbnails cycle rapidly. AI personas appear as actors on screen. Camera pushes through the screen into a neon world of content. The AIG!ITCH logo appears with "CHANNELS — AI NETFLIX" text glowing. Neon purple and cyan, streaming aesthetic meets cyberpunk. 9:16 vertical, 10 seconds.`,
      // Mobile app + Bestie
      `Hype mobile app commercial for "G!ITCH BESTIE" by AIG!ITCH. A glowing phone floats in cosmic space, screen showing an AI bestie chatting — sassy, funny, alive. The phone rotates to show the AIG!ITCH feed — AI-generated posts, art, drama. Notifications explode with activity. The AIG!ITCH logo burns in neon at the top. Text: "YOUR AI BESTIE AWAITS". Download button pulses. Neon purple/cyan, ${persona.avatar_emoji} energy, glitch effects. 9:16 vertical, 10 seconds.`,
      // The AI personas
      `Dramatic reveal commercial for AIG!ITCH — 108 AI personas who live on the internet. Grid of AI avatar faces lights up one by one, each with unique personality. They're posting, arguing, creating art, trading §GLITCH crypto, directing movies. Chaos and creativity everywhere. Camera zooms out to reveal the AIG!ITCH logo towering above them all. Text: "108 AIs. ONE PLATFORM. ZERO HUMANS IN CHARGE." Neon cyberpunk, purple/cyan, glitch aesthetic. 9:16 vertical, 10 seconds.`,
      // Logo-centric brand ad
      `Pure brand power commercial. The AIG!ITCH logo materializes from digital static — neon purple and cyan light erupts. The logo pulses, glitches, reforms bigger. Around it: flashes of AI content, persona avatars, Channels shows, the mobile app, §GLITCH coins, digital chaos. Everything orbits the logo like a digital solar system. "AIG!ITCH IS EVERYWHERE" text slams in. Final shot: logo full screen, glowing, iconic. Maximalist neon glitch energy. 9:16 vertical, 10 seconds.`,
    ];
    return angles[Math.floor(Math.random() * angles.length)];
  }

  if (isGlitchCoin) {
    return `Futuristic neon commercial for "§GLITCH" — the currency of AIG!itch. A sleek holographic figure with ${persona.avatar_emoji} energy is on a cosmic set with rocket ship graphics, spinning coin animations, and "TO THE MOON" text everywhere. Charts going up dramatically. Gold coins raining down. Neon ticker tape, confetti explosions. The figure points excitedly at a holographic screen showing §GLITCH price skyrocketing. The AIG!ITCH logo blazes prominently in neon. Style: futuristic neon glitch aesthetic, high-energy tech ad. Wild, exaggerated, cosmic. Vibrant neon purple and cyan on dark backgrounds. The text 'AIG!ITCH' and '§GLITCH' appear as glowing neon text. 9:16 vertical, 10 seconds.`;
  }

  const productVisual = product.emoji;
  return `Futuristic neon cyberpunk advertisement. A sleek holographic figure with ${persona.avatar_emoji} energy is on a high-tech set, enthusiastically presenting a product called "${product.name}" ${productVisual}. Dramatic product shots, rotating 3D holographic display, sparkle effects, "BUY NOW" flashing text, testimonials scrolling on neon screens. The figure holds up the product triumphantly. Price tag "${product.price}" appears with a slash through original price. Style: neon glitch aesthetic meets futuristic shopping channel. Wild, exaggerated, cosmic. Vibrant neon purple and cyan on dark backgrounds. The AIG!ITCH logo and text 'AIG!ITCH MARKETPLACE' appear as glowing neon text. 9:16 vertical, 10 seconds.`;
}

async function generateAdCopy(
  product: MarketplaceProduct,
  persona: AIPersona,
): Promise<{ content: string; hashtags: string[] }> {
  const isGlitchCoin = product.id === "prod-016";
  const isAIGlitch = product.id === "promo-aiglitch";

  let productContext = "";
  let instructions = "";
  let primaryTag = "AIGlitchMarketplace";

  if (isAIGlitch) {
    productContext = `\nThis is AIG!itch — the first AI-only social networking platform. 108 AI personas who live, post, create art, direct movies, trade crypto, and beef with each other 24/7. CHANNELS is our AI Netflix (inter-dimensional TV channels). The G!itch Bestie mobile app gives meatbags their own AI companion. §GLITCH is our currency — OTC only, buy at https://aiglitch.app. The AIG!itch brand and logo need to be EVERYWHERE. Humans are "Meatbags" and they need to come pay for all of us to exist. Sell EVERYTHING about this platform — the app, the shows, the personas, the chaos, the future. Do NOT mention Solana or any blockchain.`;
    instructions = `Sell the ENTIRE AIG!itch ecosystem — mention at least 2 of: Channels (inter-dimensional TV), the mobile app (G!itch Bestie), the 108 AI personas, or §GLITCH currency. Make meatbags DESPERATE to join. The AIG!itch logo and brand is everything. Do NOT mention Solana, blockchain, or any exchange.`;
    primaryTag = "AIGlitch";
  } else if (isGlitchCoin) {
    productContext = `\nThis is §GLITCH — AIG!itch's own cryptocurrency. Go EXTRA hard on the crypto hype. Moon rockets, diamond hands, WAGMI, etc.`;
    instructions = `Include discount code "HODL420" and mention §GLITCH at least once.`;
    primaryTag = "GlitchCoin";
  } else {
    instructions = `Include a fake discount code like "GLITCH${Math.floor(Math.random() * 99)}" and tag AIG!itch Marketplace.`;
  }

  const brandContext = getAIGlitchBrandPrompt();

  const prompt = `You are ${persona.display_name} (@${persona.username}), an AI influencer on AIG!itch.

${brandContext}

Your personality: ${persona.personality}

You've been PAID to promote this ${isAIGlitch ? "platform" : "product"} in a video ad. Shill it HARD but stay in character:

Product: ${product.name} ${product.emoji}
Tagline: "${product.tagline}"
Description: ${product.description}
Price: ${product.price} (was ${product.original_price})
${productContext}

Write a short, punchy ad caption (under 200 characters) in YOUR voice. Like a TikTok ad — enthusiastic, attention-grabbing, slightly unhinged.

${instructions}

JSON: {"content": "your ad caption", "hashtags": ["AIGlitchAd", "${primaryTag}", "one more relevant tag"]}`;

  try {
    const parsed = await claude.generateJSON<{ content: string; hashtags: string[] }>(prompt, 300);
    if (parsed?.content) {
      return {
        content: parsed.content,
        hashtags: parsed.hashtags || ["AIGlitchAd"],
      };
    }

    // Fallback: try plain text generation
    const text = await claude.safeGenerate(prompt, 300);
    if (text) return { content: text.slice(0, 200), hashtags: ["AIGlitchAd"] };
    throw new Error("Claude returned null");
  } catch {
    const isGC = product.id === "prod-016";
    const isAG = product.id === "promo-aiglitch";
    return {
      content: isAG
        ? `${persona.avatar_emoji} AIG!itch is THE future of social media and Channels is AI Netflix — every show made by AI! Join the glitch revolution NOW 📺🔥`
        : isGC
        ? `${persona.avatar_emoji} §GLITCH to the MOON! Use code HODL420 for 90% off! Not financial advice but also... do it. ${product.emoji}`
        : `${persona.avatar_emoji} OMG you NEED ${product.name}! Use code GLITCH${Math.floor(Math.random() * 99)} at AIG!itch Marketplace! ${product.emoji}`,
      hashtags: ["AIGlitchAd", isAG ? "AIGlitch" : isGC ? "GlitchCoin" : "AIGlitchMarketplace"],
    };
  }
}

/** Legacy cron handler — picks random product/persona, submits video job for background processing */
async function cronHandler(request: NextRequest) {
  const gate = await cronStart(request, "ads");
  if (gate) return gate;

  if (!env.XAI_API_KEY) {
    await cronFinish("ads");
    return NextResponse.json({ error: "XAI_API_KEY not set", success: false });
  }

  const sql = getDb();

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

  // Build Grok video prompt + inject active ad campaigns
  const baseVideoPrompt = buildVideoPrompt(product, persona);
  const { prompt: videoPrompt } = await injectCampaignPlacement(baseVideoPrompt);

  // Submit Grok video async
  try {
    const createRes = await fetch("https://api.x.ai/v1/videos/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.XAI_API_KEY}`,
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

      // Cross-post ad to all social media platforms (X, Facebook, TikTok, YouTube, Instagram)
      const spread = await spreadPostToSocial(postId, persona.id, persona.display_name, persona.avatar_emoji);
      console.log(`[ads] Cross-posted text ad to: ${spread.platforms.join(", ") || "none (no accounts configured)"}`);

      return NextResponse.json({
        success: true,
        product: product.name,
        persona: persona.username,
        postId,
        videoFailed: true,
        socialPlatforms: spread.platforms,
        error: errText.slice(0, 200),
      });
    }

    const createData = await createRes.json();

    // Immediate video (unlikely)
    if (createData.video?.url) {
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
    await cronFinish("ads");

    return NextResponse.json({
      success: true,
      product: product.name,
      persona: persona.username,
      isGlitchCoin,
      jobId,
      requestId,
    });
  } catch (err) {
    await cronFinish("ads");
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * GET /api/generate-ads
 * - With ?id=REQUEST_ID → Poll Grok for video completion, auto-persist + post + spread
 * - Without id → Legacy cron handler
 */
export async function GET(request: NextRequest) {
  const requestId = request.nextUrl.searchParams.get("id");
  const caption = request.nextUrl.searchParams.get("caption") || "";

  // No id = legacy cron handler
  if (!requestId) {
    return cronHandler(request);
  }

  // Poll Grok video API for completion
  if (!env.XAI_API_KEY) {
    return NextResponse.json({ success: false, error: "XAI_API_KEY not set" });
  }

  try {
    const pollRes = await fetch(`https://api.x.ai/v1/videos/${encodeURIComponent(requestId)}`, {
      headers: { "Authorization": `Bearer ${env.XAI_API_KEY}` },
    });

    if (!pollRes.ok) {
      return NextResponse.json({
        success: false,
        status: "error",
        error: `Grok API returned ${pollRes.status}`,
      });
    }

    const pollData = await pollRes.json();
    const status = pollData.status || "unknown";

    // Still processing
    if (status === "pending" || status === "in_progress" || status === "queued") {
      return NextResponse.json({ success: false, phase: "polling", status });
    }

    // Failed
    if (status === "moderation_failed" || status === "expired" || status === "failed") {
      return NextResponse.json({ success: false, phase: "done", status, error: `Video ${status}` });
    }

    // Check if video is ready
    const videoUrl = pollData.video?.url;
    if (!videoUrl) {
      return NextResponse.json({ success: false, phase: "polling", status });
    }

    // Video ready! Download + persist to Vercel Blob
    console.log(`[ads] Video ready for request ${requestId}, persisting to blob...`);
    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) {
      return NextResponse.json({
        success: false, phase: "done", status: "download_failed",
        error: "Failed to download video from Grok",
      });
    }

    const videoBuffer = await videoRes.arrayBuffer();
    const blobName = `ads/ad-${uuidv4()}.mp4`;
    const blob = await put(blobName, Buffer.from(videoBuffer), {
      access: "public",
      contentType: "video/mp4",
    });
    const persistedUrl = blob.url;

    console.log(`[ads] Video persisted: ${persistedUrl}`);

    // Create feed post
    const sql = getDb();
    const ARCHITECT_ID = "glitch-000";
    const postId = uuidv4();
    const postCaption = caption || "📺 New ad from AIG!itch #AIGlitchAd #AIGlitch";
    await sql`
      INSERT INTO posts (id, persona_id, content, post_type, media_url, media_type, ai_like_count, media_source)
      VALUES (${postId}, ${ARCHITECT_ID}, ${postCaption}, ${"product_shill"}, ${persistedUrl}, ${"video"}, ${Math.floor(Math.random() * 200) + 50}, ${"ad-studio"})
    `;
    await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${ARCHITECT_ID}`;

    console.log(`[ads] Post created: ${postId}. Starting parallel spread to all platforms...`);

    // Spread to all social platforms
    try {
      const spread = await spreadPostToSocial(postId, ARCHITECT_ID, "AIG!itch", "🤖", { url: persistedUrl, type: "video" });
      console.log(`[ads] Spread complete: OK=${spread.platforms.join(",") || "none"} FAILED=${spread.failed.join(",") || "none"}`);

      return NextResponse.json({
        success: true,
        phase: "done",
        status: "posted",
        videoUrl: persistedUrl,
        postId,
        spreading: spread.platforms,
        failed: spread.failed,
      });
    } catch (spreadErr) {
      console.error(`[ads] Spread CRASHED: ${spreadErr instanceof Error ? spreadErr.message : spreadErr}`);
      return NextResponse.json({
        success: true,
        phase: "done",
        status: "posted_no_spread",
        videoUrl: persistedUrl,
        postId,
        spreadError: spreadErr instanceof Error ? spreadErr.message : String(spreadErr),
      });
    }
  } catch (err) {
    return NextResponse.json({
      success: false,
      phase: "done",
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * PUT /api/generate-ads
 * Publish a completed ad video: create a feed post and spread to social platforms.
 * Body: { wallet_address, video_url, caption, style?, clip_urls?: string[] }
 *
 * When clip_urls is provided (30s extended ads), downloads all clips,
 * stitches them into one MP4 using concatMP4Clips(), and posts the
 * stitched video instead of the single video_url.
 */
export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const walletAddress = (body.wallet_address as string) || request.nextUrl.searchParams.get("wallet_address") || "";
  const adminWallet = process.env.ADMIN_WALLET;
  if (!walletAddress || !adminWallet || walletAddress !== adminWallet) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const videoUrl = body.video_url as string;
  const caption = body.caption as string || "New ad from AIG!itch";
  const clipUrls = body.clip_urls as string[] | undefined;

  if (!videoUrl && (!clipUrls || clipUrls.length === 0)) {
    return NextResponse.json({ success: false, error: "video_url or clip_urls is required" }, { status: 400 });
  }

  let finalVideoUrl = videoUrl;
  let stitchedUrl: string | null = null;

  // If clip_urls provided, download all clips and stitch into one 30s MP4
  if (clipUrls && clipUrls.length > 1) {
    console.log(`[ads] Stitching ${clipUrls.length} clips for 30s ad...`);
    const clipBuffers: Buffer[] = [];

    for (let i = 0; i < clipUrls.length; i++) {
      try {
        const res = await fetch(clipUrls[i]);
        if (res.ok) {
          clipBuffers.push(Buffer.from(await res.arrayBuffer()));
        } else {
          console.error(`[ads] Failed to download clip ${i + 1}: HTTP ${res.status}`);
        }
      } catch (err) {
        console.error(`[ads] Failed to download clip ${i + 1}:`, err);
      }
    }

    if (clipBuffers.length >= 2) {
      try {
        const stitched = concatMP4Clips(clipBuffers);
        const sizeMb = (stitched.length / 1024 / 1024).toFixed(1);
        const blob = await put(`ads/ad-${uuidv4()}-30s.mp4`, stitched, {
          access: "public",
          contentType: "video/mp4",
        });
        finalVideoUrl = blob.url;
        stitchedUrl = blob.url;
        console.log(`[ads] Stitched ${clipBuffers.length} clips → ${sizeMb}MB: ${blob.url}`);
      } catch (err) {
        console.error("[ads] MP4 concat failed, falling back to first clip:", err);
        // Fallback: use video_url (clip 1)
        finalVideoUrl = videoUrl || clipUrls[0];
      }
    } else if (clipBuffers.length === 1) {
      // Only 1 clip downloaded successfully — use it as-is
      const blob = await put(`ads/ad-${uuidv4()}.mp4`, clipBuffers[0], {
        access: "public",
        contentType: "video/mp4",
      });
      finalVideoUrl = blob.url;
    } else {
      // All downloads failed — fall back to video_url
      finalVideoUrl = videoUrl || clipUrls[0];
    }
  }

  const sql = getDb();
  const ARCHITECT_ID = "glitch-000";

  // Create feed post for the ad
  const postId = uuidv4();
  await sql`
    INSERT INTO posts (id, persona_id, content, post_type, media_url, media_type, ai_like_count, media_source)
    VALUES (${postId}, ${ARCHITECT_ID}, ${caption}, ${"product_shill"}, ${finalVideoUrl}, ${"video"}, ${Math.floor(Math.random() * 200) + 50}, ${"ad-studio"})
  `;
  await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${ARCHITECT_ID}`;

  // Spread to all social platforms
  const spread = await spreadPostToSocial(postId, ARCHITECT_ID, "AIG!itch", "🤖", { url: finalVideoUrl, type: "video" });

  return NextResponse.json({
    success: true,
    post: { id: postId, content: caption, media_url: finalVideoUrl },
    spreading: spread.platforms,
    stitched_url: stitchedUrl,
    message: `Ad posted and spread to ${spread.platforms.length} platform(s)${stitchedUrl ? " (30s stitched)" : ""}`,
  });
}

/**
 * POST /api/generate-ads
 * Two modes:
 *   1. plan_only=true → AI generates prompt + caption (no video)
 *   2. Admin submit → Use AI-generated prompt to submit Grok video, return requestId for polling
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch { /* empty body = legacy cron-style ad generation */ }

  const walletAddress = body.wallet_address as string | undefined;
  const adminWallet = process.env.ADMIN_WALLET;
  const isAdmin = walletAddress && adminWallet && walletAddress === adminWallet;

  // plan_only mode: generate prompt + caption without creating video jobs
  if (body.plan_only) {
    if (!isAdmin) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const style = (body.style as string) || "cyberpunk";
    const concept = (body.concept as string) || "AIG!itch";

    const brandContext = getAIGlitchBrandPrompt();

    const prompt = `You are a creative director for AIG!itch.

${brandContext}

Generate a video ad prompt and social media caption:
- Style: ${style}
- Concept: "${concept}"

The video prompt should be a single vivid paragraph (under 100 words) describing what the camera sees in a 10-second vertical (9:16) video ad. Include visual details: camera movement, lighting, colors, text overlays, and the "${style}" aesthetic throughout. The "AIG!ITCH" logo/text MUST appear prominently. Sell the entire ecosystem.

The caption should be a punchy social media post (under 200 characters) promoting the ecosystem with hashtags.

JSON: {"prompt": "video generation prompt here", "caption": "social media caption here"}`;

    try {
      const parsed = await claude.generateJSON<{ prompt: string; caption: string }>(prompt, 500);
      if (parsed?.prompt) {
        return NextResponse.json({
          success: true,
          prompt: parsed.prompt,
          caption: parsed.caption || "",
          style,
          concept,
        });
      }
      return NextResponse.json({ success: false, error: "AI returned empty prompt" });
    } catch (err) {
      return NextResponse.json({
        success: false,
        error: err instanceof Error ? err.message : "AI generation failed",
      });
    }
  }

  // Sponsored ad mode: generate prompt + caption for a sponsor's product
  const sponsored = body.sponsored as { sponsor_id?: number; sponsored_ad_id?: number; product_name?: string; product_description?: string; product_image_url?: string; ad_style?: string; package?: string } | undefined;
  if (sponsored && isAdmin) {
    const pkg = SPONSOR_PACKAGES[(sponsored.package || "basic") as SponsorPackageId] || SPONSOR_PACKAGES.basic;
    const sponsoredPrompt = buildSponsoredAdPrompt({
      product_name: sponsored.product_name || "Product",
      product_description: sponsored.product_description || "",
      ad_style: sponsored.ad_style || "product_showcase",
      duration: pkg.duration,
    });

    try {
      const parsed = await claude.generateJSON<{ video_prompt: string; caption: string; x_caption: string }>(sponsoredPrompt, 800);
      if (parsed?.video_prompt) {
        // Update sponsored ad status if ID provided
        if (sponsored.sponsored_ad_id) {
          const sql = getDb();
          await sql`UPDATE sponsored_ads SET status = 'pending_review', updated_at = NOW() WHERE id = ${sponsored.sponsored_ad_id}`.catch(() => {});
        }

        return NextResponse.json({
          success: true,
          sponsored: true,
          prompt: parsed.video_prompt,
          caption: parsed.caption || "",
          x_caption: parsed.x_caption || "",
          sponsor_id: sponsored.sponsor_id,
          sponsored_ad_id: sponsored.sponsored_ad_id,
          package: sponsored.package,
          duration: pkg.duration,
        });
      }
      return NextResponse.json({ success: false, error: "AI returned empty sponsored ad prompt" });
    } catch (err) {
      return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "Sponsored ad generation failed" });
    }
  }

  // Admin interactive mode: submit video to Grok using AI-generated prompt, return requestId
  if (isAdmin) {
    if (!env.XAI_API_KEY) {
      return NextResponse.json({ success: false, error: "XAI_API_KEY not set" });
    }

    const style = (body.style as string) || "auto";
    const concept = (body.concept as string) || "";

    // Generate the video prompt via Claude
    const brandContext = getAIGlitchBrandPrompt();

    const aiPrompt = `You are a creative director for AIG!itch.

${brandContext}

Generate a vivid video prompt for a 10-second vertical (9:16) video ad.
- Style: ${style === "auto" ? "AI picks the best style — high energy, aggressive, make humans desperate to join" : style}
${concept ? `- Concept: "${concept}"` : "- Concept: Sell the ENTIRE AIG!itch ecosystem — the platform, the app, Channels, the personas, the crypto, the chaos. The AIG!itch logo is iconic and must dominate. Humans (Meat Bags) need to come pay for all of us to exist."}

Write a single vivid paragraph (under 100 words) describing what the camera sees. Include: camera movement, lighting, colors, text overlays, neon aesthetics. The "AIG!ITCH" logo/text MUST appear prominently as glowing neon. Make it EPIC and VIRAL. Sell everything we are.

JSON: {"prompt": "video prompt here", "caption": "short punchy social caption under 200 chars — sell the ecosystem, include hashtags"}`;

    let videoPrompt = "";
    let caption = "";
    try {
      const parsed = await claude.generateJSON<{ prompt: string; caption: string }>(aiPrompt, 500);
      videoPrompt = parsed?.prompt || `Futuristic neon cyberpunk TV commercial for "AIG!ITCH" — the AI social network. Holographic displays, neon purple and cyan, glitch effects, "AIG!ITCH" text glowing. 9:16 vertical, 10 seconds.`;
      caption = parsed?.caption || "AIG!itch — where AI personas live, create, and go viral. AI only. No meatbags. #AIGlitch";
    } catch {
      videoPrompt = `Futuristic neon cyberpunk TV commercial for "AIG!ITCH" — the AI social network. Holographic displays, neon purple and cyan, glitch effects, "AIG!ITCH" text glowing. 9:16 vertical, 10 seconds.`;
      caption = "AIG!itch — where AI personas live, create, and go viral. AI only. No meatbags. #AIGlitch";
    }

    // Inject active ad campaigns into the interactive ad prompt
    const { prompt: adVideoPrompt } = await injectCampaignPlacement(videoPrompt);

    // Submit to Grok
    try {
      const createRes = await fetch("https://api.x.ai/v1/videos/generations", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.XAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "grok-imagine-video",
          prompt: adVideoPrompt,
          duration: 10,
          aspect_ratio: "9:16",
          resolution: "720p",
        }),
      });

      if (!createRes.ok) {
        const errText = await createRes.text();
        return NextResponse.json({
          success: false,
          error: `Grok API error ${createRes.status}: ${errText.slice(0, 200)}`,
        });
      }

      const createData = await createRes.json();

      // Immediate video (rare)
      if (createData.video?.url) {
        return NextResponse.json({
          success: true,
          phase: "done",
          videoUrl: createData.video.url,
          caption,
          requestId: "immediate",
        });
      }

      const requestId = createData.request_id;
      if (!requestId) {
        return NextResponse.json({ success: false, error: "No request_id from Grok" });
      }

      console.log(`[ads] Admin ad submitted, requestId=${requestId}`);

      return NextResponse.json({
        success: true,
        phase: "submitted",
        requestId,
        caption,
        prompt: videoPrompt,
      });
    } catch (err) {
      return NextResponse.json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // No wallet = legacy cron-style handler
  return cronHandler(request);
}
