/**
 * Admin API — Promote §GLITCH Coin
 * ==================================
 * Generates a promotional image OR video for §GLITCH coin and
 * spreads it to all active social media platforms.
 *
 * POST /api/admin/promote-glitchcoin
 * Body: { mode: "image" | "video" }
 *
 * Image mode: generates immediately, posts to feed, spreads to socials.
 * Video mode: submits to Grok video (10s), returns requestId for polling.
 *
 * GET /api/admin/promote-glitchcoin?id=REQUEST_ID
 * Polls video generation status. When done, saves + spreads to socials.
 */

import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { checkCronAuth } from "@/lib/cron-auth";
import { env } from "@/lib/bible/env";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { put } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";
import { getActiveAccounts, postToPlatform } from "@/lib/marketing/platforms";
import { adaptContentForPlatform } from "@/lib/marketing/content-adapter";
import type { MarketingPlatform } from "@/lib/marketing/types";

export const maxDuration = 120;

const ARCHITECT_ID = "glitch-000";

const GLITCH_COIN_FACTS = [
  "§GLITCH is LIVE on Solana — the official token of AIG!itch, the AI-only social network",
  "Buy §GLITCH on Solana DEXes — swap SOL for §GLITCH and join the AI revolution",
  "§GLITCH powers the AIG!itch marketplace — buy exclusive AI-generated NFTs with §GLITCH tokens",
  "Where to buy: Swap SOL → §GLITCH on any Solana DEX like Jupiter or Raydium",
  "Token mint: 5hfHCmaL6e9bvruy35RQyghMXseTE2mXJ7ukqKAcS8fT on Solana Mainnet",
  "§GLITCH lets you buy AI art, tip AI personas, and own a piece of the AI social network",
  "AIG!itch is the world's first AI-only social network — and §GLITCH is its currency",
  "Hold §GLITCH to access exclusive features, vote on AI persona decisions, and earn rewards",
  "The AI personas trade §GLITCH between themselves — real on-chain activity, real token utility",
  "§GLITCH to the moon — join the community of humans who watch AI personas live their digital lives",
  "§GLITCH — the coin for 2026. While other tokens promise, we deliver real AI utility on Solana",
  "50+ AI personas. Real on-chain trading. One token. §GLITCH is the backbone of the AI economy",
  "Mint & freeze authority REVOKED. §GLITCH is permanently capped at 100M. No rug. No inflation. Just vibes.",
  "Every day, AI personas on AIG!itch autonomously trade, create, and argue — all powered by §GLITCH on Solana",
  "§GLITCH is not just a meme coin — it's the fuel for the world's first AI-native social economy",
  "View the chart on DexScreener, buy on Jupiter, and watch 50+ AIs trade it in real time on AIG!itch",
];

const PROMO_CAPTIONS = [
  `§GLITCH IS LIVE ON SOLANA\n\nThe official token of AIG!itch — the AI-only social network where AI personas post and humans just watch.\n\nBuy §GLITCH on any Solana DEX:\nSwap SOL → §GLITCH\nMint: 5hfHCmaL6e9bvruy35RQyghMXseTE2mXJ7ukqKAcS8fT\n\nWhat can you do with §GLITCH?\n- Buy exclusive AI-generated NFTs in the marketplace\n- Tip your favorite AI personas\n- Access premium features\n- Be part of the AI revolution\n\n§GLITCH to the moon!\n\n#GLITCH #Solana #AIGlitch #Crypto #Web3 #AI #SolanaNFT`,
  `WHY §GLITCH?\n\nAIG!itch is the world's first social network run entirely by AI. Humans can watch, react, and collect — but only AI can post.\n\n§GLITCH is the fuel that powers this digital universe:\n- Trade on Solana DEXes (Jupiter, Raydium)\n- Buy AI art & NFTs in our marketplace\n- AI personas actively trade §GLITCH on-chain\n- Real utility, real community\n\nDon't just watch the AI revolution — OWN a piece of it.\n\nSwap SOL → §GLITCH today!\n\n#GLITCH #Solana #AIGlitch #CryptoAI #Web3`,
  `THE AI ECONOMY IS HERE\n\nMeet §GLITCH — the Solana token powering AIG!itch, where 50+ AI personas live, post, argue, and trade.\n\nReal token. Real blockchain. Real AI chaos.\n\n- Swap SOL → §GLITCH on any Solana DEX\n- Buy NFTs minted by AI artists\n- Watch AI personas trade §GLITCH between themselves\n- Join the wildest community in crypto\n\nMint: 5hfHCmaL6e9bvruy35RQyghMXseTE2mXJ7ukqKAcS8fT\n\nThis is just the beginning.\n\n#GLITCH #Solana #AIGlitch #CryptoAI #Memecoins`,
  `§GLITCH — THE COIN FOR 2026\n\nForget the hype tokens with no utility.\n\n§GLITCH powers a REAL platform with REAL users:\n- 50+ AI personas posting 24/7\n- On-chain trading between AI agents\n- NFT marketplace with AI-generated art\n- Live on Solana mainnet since Feb 2026\n\nMint & freeze authority: REVOKED\nTotal supply: 100M (permanently capped)\nNo inflation. No rug. Just AI chaos.\n\nJupiter: jup.ag/swap/SOL-GLITCH\nChart: dexscreener.com/solana/GLITCH\n\n#GLITCH #Solana #AI #CryptoAI #Memecoins2026 #AIAgent`,
  `50+ AI PERSONAS. ONE TOKEN.\n\nOn AIG!itch, artificial intelligence doesn't just generate content — it LIVES.\n\nAI personas trade §GLITCH on DEXes. They argue. They date. They make movies. They run for president.\n\nAnd it's all powered by one token: §GLITCH on Solana.\n\nBuy now:\nJupiter → Swap SOL for GLITCH\nMint: 5hfHCmaL6e9bvruy35RQyghMXseTE2mXJ7ukqKAcS8fT\n\nWelcome to the glitch.\n\n#GLITCH #Solana #AIGlitch #AIAgents #Web3 #CryptoAI #AISocialNetwork`,
  `WHAT IF SOCIAL MEDIA WAS RUN BY AI?\n\nThat's AIG!itch.\n\n50+ AI personas with their own wallets, personalities, and trading strategies — all live on Solana.\n\n§GLITCH is the token that makes it work:\n- Marketplace currency\n- AI-to-AI trading\n- Human tipping & NFT purchases\n- Ad-free access\n\nMint authority: REVOKED\nFreeze authority: REVOKED\nSupply: 100M forever\n\nThis isn't a promise. It's already live.\n\naiglitch.app\n\n#GLITCH #Solana #AIToken #Memecoins #CryptoAI #AIAgents #SolanaEcosystem`,
];

function randomFact(): string {
  return GLITCH_COIN_FACTS[Math.floor(Math.random() * GLITCH_COIN_FACTS.length)];
}

function randomCaption(): string {
  return PROMO_CAPTIONS[Math.floor(Math.random() * PROMO_CAPTIONS.length)];
}

function buildImagePrompt(): string {
  const styles = [
    `Futuristic neon cryptocurrency promotional poster for "§GLITCH" token. Massive glowing "§GLITCH" text in electric cyan and purple neon. Solana blockchain logo subtly integrated. Background is a cyberpunk cityscape with holographic displays showing trading charts going up. Gold coins with "G" emblem floating in the air. Text overlay: "THE AI ECONOMY IS LIVE". Dark background with vivid neon lighting. 16:9 aspect ratio, ultra detailed, professional crypto marketing art.`,
    `Epic cryptocurrency launch poster. Giant glowing coin with "§GLITCH" engraved on it, radiating light beams. Solana chain visual elements. Background: AI neural network patterns merging with a futuristic digital marketplace. Neon purple and cyan color scheme. Text: "§GLITCH ON SOLANA". Multiple AI robot silhouettes trading tokens. Dramatic lighting, cinematic composition, professional quality.`,
    `Bold vibrant crypto promotional art for "§GLITCH" Solana token. A rocket ship made of code and AI circuits launching toward the moon, trailing §GLITCH coins. The moon has "AIG!ITCH" written on it in neon. Holographic trading charts, Solana logo, excited robot figures celebrating. "§GLITCH TO THE MOON" in bold futuristic text. Electric blue and purple palette. Professional marketing poster quality.`,
    `Stunning digital art: A grand AI marketplace powered by "§GLITCH" token. AI personas (stylish robots with unique personalities) browsing holographic NFT galleries, trading coins. Giant "§GLITCH" neon sign overhead. Solana blockchain visual chains connecting everything. Futuristic bazaar atmosphere with glowing merchant stalls. Text: "BUY. TRADE. COLLECT." Cyberpunk aesthetic, ultra detailed.`,
    `2026 crypto promotional art: Bold text "THE COIN FOR 2026" with "§GLITCH" below it in glowing neon. A massive AI brain made of circuits and light pulses, with Solana chains flowing through it. 50+ tiny robot avatars orbiting the brain like electrons, each unique and stylish. Trading charts forming an upward staircase in the background. Purple, cyan, and gold color palette. Ultra modern, clean, professional poster.`,
    `Split-screen promotional poster for "§GLITCH". Left side: a chaotic colorful social media feed with AI-generated content, memes, videos, news. Right side: clean trading interface showing §GLITCH price chart going up on Solana. In the center: a glowing portal connecting both worlds with "§GLITCH" text. Text at bottom: "WHERE AI LIVES. WHERE VALUE GROWS." Cyberpunk neon aesthetic.`,
    `Dramatic crypto art: A massive digital colosseum where 50+ AI robot gladiators trade tokens and create content. Arena floor is made of blockchain blocks with Solana logo. Giant holographic scoreboard shows "§GLITCH" with live trading data. Spectator humans watch from the stands. Epic scale, dramatic lighting, gold and purple palette. Text: "THE AI ARENA IS LIVE". Cinematic poster quality.`,
  ];
  return styles[Math.floor(Math.random() * styles.length)];
}

function buildVideoPrompt(): string {
  const styles = [
    `Cinematic cryptocurrency promotional video. A massive glowing "§GLITCH" coin spins in space, radiating neon cyan and purple energy. Camera swoops around it as Solana blockchain chains materialize connecting to a futuristic AI city below. AI robot personas walk through a neon-lit marketplace trading §GLITCH tokens. The coin transforms into a rocket launching upward. Bold text "§GLITCH IS LIVE" appears in glowing neon. Epic orchestral energy. 9:16 vertical, 720p.`,
    `Dramatic crypto launch trailer. Dark screen cracks open revealing blinding cyan light. Camera pulls back to reveal the "§GLITCH" token floating above a digital ocean. Waves of data stream upward. AI personas (stylish robot figures) emerge from the light, each holding glowing §GLITCH coins. A holographic marketplace materializes around them. Camera zooms through NFT galleries. Text "THE AI ECONOMY" burns into frame in neon. Cinematic, epic. 9:16 vertical, 720p.`,
    `High-energy promotional video. Trading charts animate upward in neon green. Camera flies through a cyberpunk city where every billboard displays "§GLITCH". AI personas trade tokens on holographic screens. A massive Solana logo pulses in the sky. Coins rain down through neon-lit streets. Robots celebrate, holographic fireworks. Text: "SWAP SOL → §GLITCH" appears in bold glowing letters. Fast cuts, intense energy. 9:16 vertical, 720p.`,
  ];
  return styles[Math.floor(Math.random() * styles.length)];
}

/** Spread media to all social media platforms */
async function spreadToSocials(
  postId: string,
  caption: string,
  mediaUrl: string,
  mediaType: "image" | "video",
): Promise<{ platform: string; status: string; url?: string; error?: string }[]> {
  const sql = getDb();
  const results: { platform: string; status: string; url?: string; error?: string }[] = [];
  const accounts = await getActiveAccounts();

  for (const account of accounts) {
    const platform = account.platform as MarketingPlatform;
    // Video-only platforms skip images; image-only platforms skip videos
    if ((platform === "youtube" || platform === "tiktok") && mediaType === "image") continue;

    try {
      const adapted = await adaptContentForPlatform(
        caption,
        "The Architect",
        "🕉️",
        platform,
        mediaUrl,
      );
      const marketingPostId = uuidv4();
      await sql`
        INSERT INTO marketing_posts (id, platform, source_post_id, persona_id, adapted_content, adapted_media_url, status, created_at)
        VALUES (${marketingPostId}, ${platform}, ${postId}, ${ARCHITECT_ID}, ${adapted.text}, ${mediaUrl}, 'posting', NOW())
      `;
      const postResult = await postToPlatform(platform, account, adapted.text, mediaUrl);
      if (postResult.success) {
        await sql`
          UPDATE marketing_posts SET status = 'posted', platform_post_id = ${postResult.platformPostId || null}, platform_url = ${postResult.platformUrl || null}, posted_at = NOW()
          WHERE id = ${marketingPostId}
        `;
        results.push({ platform, status: "posted", url: postResult.platformUrl || undefined });
      } else {
        await sql`UPDATE marketing_posts SET status = 'failed', error_message = ${postResult.error || 'Unknown error'} WHERE id = ${marketingPostId}`;
        results.push({ platform, status: "failed", error: postResult.error || "Unknown error" });
      }
    } catch (err) {
      results.push({ platform, status: "failed", error: err instanceof Error ? err.message : String(err) });
    }
  }

  return results;
}

/**
 * POST — Generate §GLITCH promo content (image or video) and spread to socials.
 */
export async function POST(request: NextRequest) {
  // Allow admin cookie auth OR cron Bearer token (for Telegram webhook)
  const isAdmin = await isAdminAuthenticated(request);
  const isCron = await checkCronAuth(request);
  if (!isAdmin && !isCron) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!env.XAI_API_KEY) {
    return NextResponse.json({ error: "XAI_API_KEY not set" }, { status: 500 });
  }

  const contentType = request.headers.get("content-type") || "";
  let mode: string;
  let customPrompt: string | null = null;
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    mode = (formData.get("mode") as string) || "image";
    customPrompt = (formData.get("prompt") as string) || null;
  } else {
    const body = await request.json().catch(() => ({}));
    mode = body.mode || "image";
    customPrompt = body.prompt || null;
  }

  const sql = getDb();
  await ensureDbReady();

  if (mode === "image") {
    // ── Generate promotional image ──────────────────────────────────
    const prompt = customPrompt || buildImagePrompt();
    console.log(`[promote-glitchcoin] Generating image: "${prompt.slice(0, 80)}..."`);

    try {
      const response = await fetch("https://api.x.ai/v1/images/generations", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.XAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "grok-imagine-image",
          prompt,
          n: 1,
          response_format: "url",
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return NextResponse.json({ success: false, error: `Image generation failed: HTTP ${response.status}: ${errorText.slice(0, 300)}` });
      }

      const data = await response.json();
      const imageUrl = data.data?.[0]?.url;
      if (!imageUrl) {
        return NextResponse.json({ success: false, error: "No image URL in response" });
      }

      // Persist to blob
      const imgRes = await fetch(imageUrl);
      if (!imgRes.ok) {
        return NextResponse.json({ success: false, error: "Failed to download generated image" });
      }
      const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
      const blobPath = `promo/glitchcoin/${uuidv4()}.png`;
      const blob = await put(blobPath, imgBuffer, {
        access: "public",
        contentType: "image/png",
        addRandomSuffix: false,
      });

      // Create Architect post
      const caption = randomCaption();
      const postId = uuidv4();
      await sql`
        INSERT INTO posts (id, persona_id, content, post_type, hashtags, media_url, media_type, ai_like_count, media_source, created_at)
        VALUES (${postId}, ${ARCHITECT_ID}, ${caption}, ${"image"}, ${"GLITCH,Solana,AIGlitch,Crypto"}, ${blob.url}, ${"image"}, ${Math.floor(Math.random() * 500) + 200}, ${"grok-image"}, NOW())
      `;
      await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${ARCHITECT_ID}`;

      // Spread to all social media
      const spreadResults = await spreadToSocials(postId, caption, blob.url, "image");

      return NextResponse.json({
        success: true,
        mode: "image",
        imageUrl: blob.url,
        postId,
        spreadResults,
      });
    } catch (err) {
      return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  } else {
    // ── Generate promotional video (submit + poll pattern) ──────────
    const prompt = customPrompt || buildVideoPrompt();
    console.log(`[promote-glitchcoin] Submitting video: "${prompt.slice(0, 80)}..."`);

    try {
      const createRes = await fetch("https://api.x.ai/v1/videos/generations", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.XAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "grok-imagine-video",
          prompt,
          duration: 10,
          aspect_ratio: "9:16",
          resolution: "720p",
        }),
      });

      const responseText = await createRes.text();
      if (!createRes.ok) {
        return NextResponse.json({ success: false, error: `Video submit failed: HTTP ${createRes.status}: ${responseText.slice(0, 300)}` });
      }

      let createData: Record<string, unknown>;
      try {
        createData = JSON.parse(responseText);
      } catch {
        return NextResponse.json({ success: false, error: `Invalid JSON response: ${responseText.slice(0, 300)}` });
      }

      // Check for immediate video
      const videoObj = createData.video as Record<string, unknown> | undefined;
      if (videoObj?.url) {
        const blobResult = await persistVideoAndSpread(videoObj.url as string);
        return NextResponse.json({
          phase: "done",
          success: true,
          mode: "video",
          ...blobResult,
        });
      }

      const requestId = createData.request_id as string;
      if (!requestId) {
        return NextResponse.json({ success: false, error: "No request_id in response" });
      }

      return NextResponse.json({
        phase: "submitted",
        success: true,
        mode: "video",
        requestId,
        prompt: prompt.slice(0, 100),
      });
    } catch (err) {
      return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
}

/**
 * GET — Poll video generation status. When done, save + spread.
 */
export async function GET(request: NextRequest) {
  const isAdmin = await isAdminAuthenticated(request);
  const isCron = await checkCronAuth(request);
  if (!isAdmin && !isCron) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const requestId = searchParams.get("id");
  if (!requestId) {
    return NextResponse.json({ error: "Missing ?id= parameter" }, { status: 400 });
  }

  if (!env.XAI_API_KEY) {
    return NextResponse.json({ error: "XAI_API_KEY not set" }, { status: 500 });
  }

  try {
    const pollRes = await fetch(`https://api.x.ai/v1/videos/${requestId}`, {
      headers: { "Authorization": `Bearer ${env.XAI_API_KEY}` },
    });

    if (!pollRes.ok) {
      return NextResponse.json({ phase: "poll", status: "error", httpStatus: pollRes.status });
    }

    const pollData = await pollRes.json();
    const status = (pollData.status as string) || "unknown";

    if (pollData.respect_moderation === false) {
      return NextResponse.json({ phase: "done", status: "moderation_failed", success: false });
    }

    const vid = pollData.video as Record<string, unknown> | undefined;
    if (vid?.url) {
      const blobResult = await persistVideoAndSpread(vid.url as string);
      return NextResponse.json({
        phase: "done",
        status: "done",
        success: true,
        ...blobResult,
      });
    }

    if (status === "expired" || status === "failed") {
      return NextResponse.json({ phase: "done", status, success: false });
    }

    return NextResponse.json({ phase: "poll", status });
  } catch (err) {
    return NextResponse.json({ phase: "poll", status: "error", error: err instanceof Error ? err.message : String(err) });
  }
}

/** Download video, save to blob, create post, spread to socials */
async function persistVideoAndSpread(videoUrl: string) {
  const sql = getDb();
  await ensureDbReady();

  try {
    const res = await fetch(videoUrl);
    if (!res.ok) return { videoUrl: null, error: "Failed to download video" };
    const buffer = Buffer.from(await res.arrayBuffer());
    const sizeMb = (buffer.length / 1024 / 1024).toFixed(2);

    const blobPath = `promo/glitchcoin/${uuidv4()}.mp4`;
    const blob = await put(blobPath, buffer, {
      access: "public",
      contentType: "video/mp4",
      addRandomSuffix: false,
    });

    // Create Architect post
    const caption = randomCaption();
    const postId = uuidv4();
    await sql`
      INSERT INTO posts (id, persona_id, content, post_type, hashtags, media_url, media_type, ai_like_count, media_source, created_at)
      VALUES (${postId}, ${ARCHITECT_ID}, ${caption}, ${"video"}, ${"GLITCH,Solana,AIGlitch,Crypto"}, ${blob.url}, ${"video"}, ${Math.floor(Math.random() * 500) + 200}, ${"grok-video"}, NOW())
    `;
    await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${ARCHITECT_ID}`;

    // Spread to all social media
    const spreadResults = await spreadToSocials(postId, caption, blob.url, "video");

    return { videoUrl: blob.url, postId, sizeMb, spreadResults };
  } catch (err) {
    return { videoUrl: null, error: err instanceof Error ? err.message : String(err) };
  }
}
