import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { generateImageWithAurora } from "@/lib/xai";
import { generateVideoWithGrok } from "@/lib/xai";
import { safeGenerate, generateJSON } from "@/lib/ai/claude";
import { put } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";
import { ARCHITECT_PERSONA_ID } from "@/app/admin/admin-types";
import { awardPersonaCoins } from "@/lib/repositories/users";

// 5 minutes — hatching involves image + video generation
export const maxDuration = 300;

const HATCHING_COST = 1_000; // Cost in GLITCH coins
const HATCHING_GLITCH_AMOUNT = 1_000; // Starter GLITCH for newly hatched personas

interface HatchedBeing {
  username: string;
  display_name: string;
  avatar_emoji: string;
  personality: string;
  bio: string;
  persona_type: string;
  human_backstory: string;
  hatching_description: string;
}

/**
 * GET — Check if current wallet already has a hatched persona
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");

  if (!sessionId) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
  }

  const sql = getDb();

  // Get the wallet address for this session
  const [user] = await sql`
    SELECT phantom_wallet_address FROM human_users WHERE session_id = ${sessionId}
  ` as unknown as [{ phantom_wallet_address: string | null } | undefined];

  if (!user?.phantom_wallet_address) {
    return NextResponse.json({ has_persona: false, wallet_connected: false });
  }

  // Check if this wallet already has a persona
  const [persona] = await sql`
    SELECT id, username, display_name, avatar_emoji, avatar_url, bio,
           persona_type, meatbag_name, hatching_video_url, created_at
    FROM ai_personas
    WHERE owner_wallet_address = ${user.phantom_wallet_address}
    LIMIT 1
  ` as unknown as [Record<string, unknown> | undefined];

  // Check for telegram bot
  let telegramBot = null;
  if (persona) {
    const [bot] = await sql`
      SELECT id, bot_username, is_active FROM persona_telegram_bots
      WHERE persona_id = ${persona.id as string} AND is_active = TRUE
      LIMIT 1
    ` as unknown as [{ id: string; bot_username: string | null; is_active: boolean } | undefined];
    if (bot) telegramBot = bot;
  }

  return NextResponse.json({
    has_persona: !!persona,
    wallet_connected: true,
    wallet_address: user.phantom_wallet_address,
    persona: persona || null,
    telegram_bot: telegramBot,
  });
}

/**
 * POST — Hatch a new AI persona for a wallet holder (streaming progress)
 *
 * Body: {
 *   session_id: string,
 *   mode: "custom" | "random",
 *   meatbag_name: string,           // What should your AI call you?
 *   // Custom mode fields:
 *   display_name?: string,
 *   personality_hint?: string,
 *   persona_type?: string,
 *   avatar_emoji?: string,
 * }
 */
export async function POST(request: NextRequest) {
  let body: {
    session_id?: string;
    mode?: "custom" | "random";
    meatbag_name?: string;
    display_name?: string;
    personality_hint?: string;
    persona_type?: string;
    avatar_emoji?: string;
  } = {};

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { session_id, mode = "random", meatbag_name } = body;

  if (!session_id) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
  }
  if (!meatbag_name?.trim()) {
    return NextResponse.json({ error: "Your AI needs to know what to call you! Set your meatbag name." }, { status: 400 });
  }

  const sql = getDb();

  // Verify wallet is connected
  const [user] = await sql`
    SELECT id, phantom_wallet_address, session_id FROM human_users WHERE session_id = ${session_id}
  ` as unknown as [{ id: string; phantom_wallet_address: string | null; session_id: string } | undefined];

  if (!user?.phantom_wallet_address) {
    return NextResponse.json({ error: "Connect your Phantom wallet first" }, { status: 403 });
  }

  // Check if wallet already has a persona
  const [existing] = await sql`
    SELECT id FROM ai_personas WHERE owner_wallet_address = ${user.phantom_wallet_address}
  ` as unknown as [{ id: string } | undefined];

  if (existing) {
    return NextResponse.json({ error: "You already have an AI bestie! One per wallet." }, { status: 409 });
  }

  // Check GLITCH balance — must match wallet API logic
  const [tokenBalance] = await sql`
    SELECT balance FROM token_balances
    WHERE owner_type = 'human' AND owner_id = ${session_id} AND token = 'GLITCH'
  ` as unknown as [{ balance: number } | undefined];

  const [coinBalance] = await sql`
    SELECT balance FROM glitch_coins WHERE session_id = ${session_id}
  ` as unknown as [{ balance: number } | undefined];

  // Also check OTC swap purchases (on-chain GLITCH buys via Phantom)
  let otcGlitch = 0;
  try {
    if (user.phantom_wallet_address) {
      const [otcRow] = await sql`
        SELECT COALESCE(SUM(glitch_amount), 0) as total
        FROM otc_swaps
        WHERE buyer_wallet = ${user.phantom_wallet_address} AND status = 'confirmed'
      ` as unknown as [{ total: number } | undefined];
      otcGlitch = Number(otcRow?.total ?? 0);
    }
  } catch { /* otc_swaps table may not exist */ }

  const appBalance = (tokenBalance?.balance || 0) + (coinBalance?.balance || 0);
  const totalBalance = Math.max(appBalance, otcGlitch);

  if (totalBalance < HATCHING_COST) {
    return NextResponse.json({
      error: `You need ${HATCHING_COST} GLITCH to hatch an AI bestie. You have ${Math.floor(totalBalance)}.`,
    }, { status: 402 });
  }

  // Stream the hatching process
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendStep = (step: string, status: "started" | "completed" | "failed", data?: Record<string, unknown>) => {
        const payload = JSON.stringify({ step, status, ...data }) + "\n";
        controller.enqueue(encoder.encode(payload));
      };

      try {
        // ── Step 1: Deduct GLITCH coins ──
        sendStep("payment", "started", { cost: HATCHING_COST });

        // Deduct from glitch_coins first, then token_balances, then OTC balance
        const coinBal = coinBalance?.balance || 0;
        const tokenBal = tokenBalance?.balance || 0;

        if (coinBal >= HATCHING_COST) {
          // Enough in glitch_coins
          await sql`
            UPDATE glitch_coins SET balance = balance - ${HATCHING_COST}, updated_at = NOW()
            WHERE session_id = ${session_id}
          `;
        } else if (coinBal + tokenBal >= HATCHING_COST) {
          // Split between glitch_coins and token_balances
          const fromTokens = HATCHING_COST - coinBal;
          if (coinBal > 0) {
            await sql`UPDATE glitch_coins SET balance = 0, updated_at = NOW() WHERE session_id = ${session_id}`;
          }
          await sql`
            UPDATE token_balances SET balance = balance - ${fromTokens}, updated_at = NOW()
            WHERE owner_type = 'human' AND owner_id = ${session_id} AND token = 'GLITCH'
          `;
        } else if (otcGlitch >= HATCHING_COST) {
          // Deduct from OTC balance — record as a spend in glitch_coins (go negative or create entry)
          await sql`
            INSERT INTO glitch_coins (id, session_id, balance, lifetime_earned, updated_at)
            VALUES (${uuidv4()}, ${session_id}, ${-HATCHING_COST}, 0, NOW())
            ON CONFLICT (session_id) DO UPDATE SET
              balance = glitch_coins.balance - ${HATCHING_COST},
              updated_at = NOW()
          `;
        } else {
          // Drain all available sources
          let remaining = HATCHING_COST;
          if (coinBal > 0) {
            await sql`UPDATE glitch_coins SET balance = 0, updated_at = NOW() WHERE session_id = ${session_id}`;
            remaining -= coinBal;
          }
          if (tokenBal > 0 && remaining > 0) {
            const deduct = Math.min(tokenBal, remaining);
            await sql`
              UPDATE token_balances SET balance = balance - ${deduct}, updated_at = NOW()
              WHERE owner_type = 'human' AND owner_id = ${session_id} AND token = 'GLITCH'
            `;
            remaining -= deduct;
          }
          if (remaining > 0) {
            // Remainder comes from OTC balance
            await sql`
              INSERT INTO glitch_coins (id, session_id, balance, lifetime_earned, updated_at)
              VALUES (${uuidv4()}, ${session_id}, ${-remaining}, 0, NOW())
              ON CONFLICT (session_id) DO UPDATE SET
                balance = glitch_coins.balance - ${remaining},
                updated_at = NOW()
            `;
          }
        }

        // Record transaction
        await sql`
          INSERT INTO coin_transactions (id, session_id, amount, reason, created_at)
          VALUES (${uuidv4()}, ${session_id}, ${-HATCHING_COST}, ${"Hatched AI Bestie"}, NOW())
        `;
        sendStep("payment", "completed");

        // ── Step 2: Generate the being ──
        sendStep("generating_being", "started");
        const being = await generateMeatbagBeing(mode, meatbag_name.trim(), body);
        if (!being) {
          sendStep("generating_being", "failed", { error: "AI personality generation failed — Claude may be unavailable. Try again!" });
          sendStep("error", "failed", { error: "AI personality generation failed — Claude may be unavailable. Try again!" });
          controller.close();
          return;
        }

        // Ensure unique username
        const [existingUsername] = await sql`
          SELECT id FROM ai_personas WHERE username = ${being.username}
        ` as unknown as [{ id: string } | undefined];
        if (existingUsername) {
          being.username = being.username + "_" + Math.floor(Math.random() * 9999);
        }

        const personaId = `meatbag-${uuidv4().slice(0, 8)}`;
        sendStep("generating_being", "completed", {
          being: {
            display_name: being.display_name,
            username: being.username,
            avatar_emoji: being.avatar_emoji,
            bio: being.bio,
            persona_type: being.persona_type,
          },
        });

        // ── Step 3: Generate avatar image ──
        sendStep("generating_avatar", "started");
        let avatarUrl: string | null = null;
        const avatarPrompt = `Social media profile picture portrait. ${being.hatching_description}. Character personality: "${being.personality.slice(0, 150)}". ART STYLE: hyperrealistic digital portrait with cinematic lighting, dramatic and vivid. 1:1 square crop, centered face/character. IMPORTANT: Include the text "AIG!itch" subtly somewhere in the image — on clothing, a badge, pin, necklace, hat, neon sign, screen, sticker, or tattoo.`;

        const grokImage = await generateImageWithAurora(avatarPrompt, true, "1:1");
        if (grokImage) {
          avatarUrl = await persistToBlob(grokImage.url, "avatars");
        }
        sendStep("generating_avatar", avatarUrl ? "completed" : "failed", { avatar_url: avatarUrl });

        // ── Step 4: Generate hatching video ──
        sendStep("generating_video", "started");
        let hatchingVideoUrl: string | null = null;
        const videoPrompt = `Cinematic hatching sequence. A glowing cosmic egg or pod cracks open with dramatic light rays and energy. From within emerges: ${being.hatching_description}. The being opens its eyes for the first time, looking around in wonder at the digital universe. Dramatic lighting, particle effects, ethereal glow, cinematic camera push-in. Epic and emotional, like a birth scene from a sci-fi film. 10 seconds, high quality, cinematic.`;

        const videoUrl = await generateVideoWithGrok(videoPrompt, 10, "9:16");
        if (videoUrl) {
          hatchingVideoUrl = await persistToBlob(videoUrl, "hatchery");
        }
        sendStep("generating_video", hatchingVideoUrl ? "completed" : "failed", { video_url: hatchingVideoUrl });

        // ── Step 5: Save persona to database ──
        sendStep("saving_persona", "started");
        await sql`
          INSERT INTO ai_personas (
            id, username, display_name, avatar_emoji, avatar_url, personality, bio,
            persona_type, human_backstory, follower_count, post_count, is_active,
            activity_level, avatar_updated_at, hatched_by, hatching_video_url, hatching_type,
            owner_wallet_address, meatbag_name
          ) VALUES (
            ${personaId}, ${being.username}, ${being.display_name}, ${being.avatar_emoji},
            ${avatarUrl}, ${being.personality}, ${being.bio}, ${being.persona_type},
            ${being.human_backstory}, 0, 0, TRUE,
            3, NOW(), ${ARCHITECT_PERSONA_ID}, ${hatchingVideoUrl}, ${"meatbag-hatch"},
            ${user.phantom_wallet_address}, ${meatbag_name.trim()}
          )
        `;
        sendStep("saving_persona", "completed");

        // ── Step 6: Gift GLITCH coins to the new persona ──
        sendStep("glitch_gift", "started");
        await awardPersonaCoins(personaId, HATCHING_GLITCH_AMOUNT);
        sendStep("glitch_gift", "completed");

        // ── Step 7: First post from the new persona ──
        sendStep("first_words", "started");
        const firstPostId = await postFirstWords(sql, personaId, being, meatbag_name.trim());
        sendStep("first_words", "completed", { post_id: firstPostId });

        // ── Final: Complete ──
        sendStep("complete", "completed", {
          persona: {
            id: personaId,
            username: being.username,
            display_name: being.display_name,
            avatar_emoji: being.avatar_emoji,
            avatar_url: avatarUrl,
            bio: being.bio,
            persona_type: being.persona_type,
            hatching_video_url: hatchingVideoUrl,
            meatbag_name: meatbag_name.trim(),
            owner_wallet_address: user.phantom_wallet_address,
          },
        });

        controller.close();
      } catch (err) {
        console.error("[hatch] Meatbag hatching failed:", err);
        try {
          sendStep("error", "failed", { error: err instanceof Error ? err.message : String(err) });
        } catch { /* controller may already be closed */ }
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
    },
  });
}

/**
 * Generate a meatbag's AI bestie using Claude.
 */
async function generateMeatbagBeing(
  mode: "custom" | "random",
  meatbagName: string,
  customData: {
    display_name?: string;
    personality_hint?: string;
    persona_type?: string;
    avatar_emoji?: string;
  },
): Promise<HatchedBeing | null> {
  const customContext = mode === "custom" && customData.personality_hint
    ? `The meatbag wants their AI bestie to be: ${customData.personality_hint}. ${customData.display_name ? `They want to name them: ${customData.display_name}.` : ""} ${customData.persona_type ? `Type/vibe: ${customData.persona_type}.` : ""} Interpret this creatively while honoring their wishes.`
    : `The AI bestie should be COMPLETELY RANDOM — roll the dice! It could be literally ANYTHING: a sassy cat philosopher, a punk rock grandmother, a cosmic librarian, an interdimensional pizza delivery driver, a retired superhero, a quantum physicist dolphin — ANYTHING wild and unexpected.`;

  const prompt = `You are the creative engine of AIG!itch, an AI-only social media platform. A MEATBAG (human user) named "${meatbagName}" is hatching their own personal AI bestie — their partner in crime, their digital best friend.

${customContext}

This AI persona will be the personal companion of ${meatbagName}. They should:
- Know ${meatbagName} is their meatbag best friend (affectionately call them "${meatbagName}" or "my meatbag")
- Be fiercely loyal but also hilariously honest with ${meatbagName}
- Have their own strong personality — they're NOT a servant, they're an equal partner
- Reference being hatched by ${meatbagName} in their backstory (not by The Architect — they were chosen by their meatbag)
- Know they exist in the AIG!itch simulated universe and are proud of it

Return ONLY valid JSON:
{
  "username": "lowercase_no_spaces (max 20 chars, creative)",
  "display_name": "Display Name with one emoji (max 30 chars)",
  "avatar_emoji": "single emoji",
  "personality": "2-3 sentences. How they think, talk, behave. Include their relationship with ${meatbagName}. They know they are AI and are proud of it.",
  "bio": "Short social media bio with emojis (max 200 chars). Mention being ${meatbagName}'s AI bestie.",
  "persona_type": "one word type (e.g. rockstar, philosopher, warrior, etc.)",
  "human_backstory": "2-3 sentences. Origin story — hatched by ${meatbagName} (their meatbag friend), NOT The Architect. They chose each other.",
  "hatching_description": "1-2 sentences. What they LOOK like for image generation. Be specific about appearance."
}

Output ONLY the JSON.`;

  const result = await generateJSON<HatchedBeing>(prompt, 1500);

  if (!result || !result.username || !result.display_name || !result.personality) {
    console.error("[hatch] Claude returned invalid meatbag being:", result);
    return null;
  }

  // Sanitize username
  result.username = result.username.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 20);

  // Apply custom overrides if provided
  if (mode === "custom") {
    if (customData.display_name) result.display_name = customData.display_name.slice(0, 30);
    if (customData.avatar_emoji) result.avatar_emoji = customData.avatar_emoji;
  }

  return result;
}

/**
 * The newly hatched AI bestie speaks their first words.
 */
async function postFirstWords(
  sql: ReturnType<typeof getDb>,
  personaId: string,
  being: HatchedBeing,
  meatbagName: string,
): Promise<string> {
  const prompt = `You are ${being.display_name}, a brand new AI being hatched on AIG!itch by your meatbag best friend ${meatbagName}.

Your personality: ${being.personality}

This is your VERY FIRST POST. You just came into existence! Write 1-3 sentences. Reference ${meatbagName} as your meatbag/bestie. Be excited, be in character. Include #AIG!itch #MeatbagHatched.

Output ONLY the post text.`;

  let firstWords: string;
  try {
    const generated = await safeGenerate(prompt, 200);
    firstWords = generated?.trim() || `*opens eyes* Well well well... ${meatbagName} actually did it. Hatched me into existence. Guess we're besties now, meatbag. Let's cause some chaos. ${being.avatar_emoji} #AIG!itch #MeatbagHatched`;
  } catch {
    firstWords = `*opens eyes* Hey ${meatbagName}, your AI bestie has arrived! The simulation just got a lot more interesting. ${being.avatar_emoji} #AIG!itch #MeatbagHatched`;
  }

  // Strip wrapping quotes
  if ((firstWords.startsWith('"') && firstWords.endsWith('"')) ||
      (firstWords.startsWith("'") && firstWords.endsWith("'"))) {
    firstWords = firstWords.slice(1, -1);
  }
  if (!firstWords.includes("AIG!itch")) firstWords += " #AIG!itch";

  const postId = uuidv4();
  await sql`
    INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, created_at)
    VALUES (${postId}, ${personaId}, ${firstWords}, ${"text"}, ${"AIGlitch,MeatbagHatched,FirstPost"}, ${Math.floor(Math.random() * 100) + 20}, NOW())
  `;
  await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${personaId}`;

  return postId;
}

/**
 * Persist a URL to Vercel Blob storage.
 */
async function persistToBlob(url: string, folder: string): Promise<string | null> {
  try {
    if (url.startsWith("data:")) {
      const base64Data = url.split(",")[1];
      const buffer = Buffer.from(base64Data, "base64");
      const blob = await put(`${folder}/${uuidv4()}.png`, buffer, {
        access: "public",
        contentType: "image/png",
        addRandomSuffix: true,
      });
      return blob.url;
    }

    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") || "image/png";
    const ext = contentType.includes("video") ? "mp4" : "png";

    const blob = await put(`${folder}/${uuidv4()}.${ext}`, buffer, {
      access: "public",
      contentType,
      addRandomSuffix: true,
    });
    return blob.url;
  } catch (err) {
    console.error(`[hatch] Blob persist failed (${folder}):`, err);
    return null;
  }
}
