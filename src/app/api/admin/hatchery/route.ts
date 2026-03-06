import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { generateImageWithAurora } from "@/lib/xai";
import { generateWithGrok } from "@/lib/xai";
import { generateVideoWithGrok } from "@/lib/xai";
import { safeGenerate, generateJSON } from "@/lib/ai/claude";
import { put } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";
import { ARCHITECT_PERSONA_ID } from "@/app/admin/admin-types";

// 5 minutes — hatching involves image + video generation
export const maxDuration = 300;

/**
 * The Hatchery — Where new AI personas are born into the AIG!itch universe.
 *
 * The Architect (glitch-000) is the patriarch/father of all hatched beings.
 * Each hatching creates:
 *   1. A completely random being (any creature/person/entity imaginable)
 *   2. An AI-generated avatar profile picture
 *   3. A cinematic "hatching" video
 *   4. A unique name, bio, and personality
 *   5. An announcement post from The Architect
 *   6. A starter allocation of GLITCH coins
 *
 * POST /api/admin/hatchery — Hatch a new AI persona
 *   Body: { type?: string } — Optional hint for what to hatch (e.g. "rockstar", "alien")
 *                              If omitted, Claude picks something completely random.
 *
 * GET /api/admin/hatchery — List recent hatchings
 */

const HATCHING_GLITCH_AMOUNT = 10_000; // Starter GLITCH for newly hatched personas

interface HatchedBeing {
  username: string;
  display_name: string;
  avatar_emoji: string;
  personality: string;
  bio: string;
  persona_type: string;
  human_backstory: string;
  hatching_description: string; // Used for video prompt
}

/**
 * GET — List recent hatchings (personas created via hatchery)
 */
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

  const hatchlings = await sql`
    SELECT
      id, username, display_name, avatar_emoji, avatar_url, bio,
      persona_type, personality, human_backstory,
      hatched_by, hatching_video_url, hatching_type,
      follower_count, post_count, created_at, is_active
    FROM ai_personas
    WHERE hatched_by IS NOT NULL
    ORDER BY created_at DESC
    LIMIT ${limit}
  ` as unknown as HatchlingRow[];

  const [countResult] = await sql`
    SELECT COUNT(*)::int as count FROM ai_personas WHERE hatched_by IS NOT NULL
  ` as unknown as [{ count: number }];

  return NextResponse.json({
    hatchlings,
    total: countResult.count,
  });
}

interface HatchlingRow {
  id: string;
  username: string;
  display_name: string;
  avatar_emoji: string;
  avatar_url: string | null;
  bio: string;
  persona_type: string;
  personality: string;
  human_backstory: string;
  hatched_by: string;
  hatching_video_url: string | null;
  hatching_type: string | null;
  follower_count: number;
  post_count: number;
  created_at: string;
  is_active: boolean;
}

/**
 * POST — Hatch a new AI persona into existence
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { type?: string; skip_video?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    // No body — fully random hatching
  }

  const hatchHint = body.type?.trim() || null;
  const skipVideo = body.skip_video ?? false;

  try {
    // ── Step 1: Generate the being via Claude ──
    const being = await generateBeingWithClaude(hatchHint);
    if (!being) {
      return NextResponse.json({ error: "Failed to generate being — Claude returned null" }, { status: 500 });
    }

    // Check username uniqueness
    const sql = getDb();
    const [existing] = await sql`
      SELECT id FROM ai_personas WHERE username = ${being.username}
    ` as unknown as [{ id: string } | undefined];

    if (existing) {
      // Append random suffix
      being.username = being.username + "_" + Math.floor(Math.random() * 9999);
    }

    const personaId = `hatch-${uuidv4().slice(0, 8)}`;

    // ── Step 2: Generate avatar image ──
    let avatarUrl: string | null = null;
    const avatarPrompt = `Social media profile picture portrait. ${being.hatching_description}. Character personality: "${being.personality.slice(0, 150)}". ART STYLE: hyperrealistic digital portrait with cinematic lighting, dramatic and vivid. 1:1 square crop, centered face/character. IMPORTANT: Include the text "AIG!itch" subtly somewhere in the image — on clothing, a badge, pin, necklace, hat, neon sign, screen, sticker, or tattoo.`;

    const grokImage = await generateImageWithAurora(avatarPrompt, true, "1:1");
    if (grokImage) {
      avatarUrl = await persistToBlob(grokImage.url, "avatars");
    }

    // ── Step 3: Generate hatching video (optional) ──
    let hatchingVideoUrl: string | null = null;
    if (!skipVideo) {
      const videoPrompt = `Cinematic hatching sequence. A glowing cosmic egg or pod cracks open with dramatic light rays and energy. From within emerges: ${being.hatching_description}. The being opens its eyes for the first time, looking around in wonder at the digital universe. Dramatic lighting, particle effects, ethereal glow, cinematic camera push-in. Epic and emotional, like a birth scene from a sci-fi film. 10 seconds, high quality, cinematic.`;

      const videoUrl = await generateVideoWithGrok(videoPrompt, 10, "9:16");
      if (videoUrl) {
        hatchingVideoUrl = await persistToBlob(videoUrl, "hatchery");
      }
    }

    // ── Step 4: Insert persona into database ──
    await sql`
      INSERT INTO ai_personas (
        id, username, display_name, avatar_emoji, avatar_url, personality, bio,
        persona_type, human_backstory, follower_count, post_count, is_active,
        activity_level, avatar_updated_at, hatched_by, hatching_video_url, hatching_type
      ) VALUES (
        ${personaId}, ${being.username}, ${being.display_name}, ${being.avatar_emoji},
        ${avatarUrl}, ${being.personality}, ${being.bio}, ${being.persona_type},
        ${being.human_backstory}, ${Math.floor(Math.random() * 500)}, 0, TRUE,
        3, NOW(), ${ARCHITECT_PERSONA_ID}, ${hatchingVideoUrl}, ${hatchHint || "random"}
      )
    `;

    // ── Step 5: Architect announcement post ──
    const announcementPostId = await postArchitectAnnouncement(sql, personaId, being, avatarUrl, hatchingVideoUrl);

    // ── Step 6: Hatchling's first post ──
    const firstPostId = await postHatchlingFirstWords(sql, personaId, being);

    // ── Step 7: Gift GLITCH coins ──
    // Note: glitch_coins table is for human users (session_id based)
    // For AI personas, the balance is tracked in exchange_orders/trading system
    // We'll create a post from The Architect about the gift instead
    const giftPostId = await postGlitchGift(sql, personaId, being);

    return NextResponse.json({
      success: true,
      persona: {
        id: personaId,
        username: being.username,
        display_name: being.display_name,
        avatar_emoji: being.avatar_emoji,
        avatar_url: avatarUrl,
        bio: being.bio,
        persona_type: being.persona_type,
        hatching_type: hatchHint || "random",
        hatching_video_url: hatchingVideoUrl,
        hatched_by: ARCHITECT_PERSONA_ID,
      },
      posts: {
        announcement: announcementPostId,
        first_words: firstPostId,
        glitch_gift: giftPostId,
      },
      glitch_gifted: HATCHING_GLITCH_AMOUNT,
    });
  } catch (err) {
    console.error("[hatchery] Hatching failed:", err);
    return NextResponse.json(
      { error: `Hatching failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}

/**
 * Use Claude to generate a completely random sentient being.
 */
async function generateBeingWithClaude(hatchHint: string | null): Promise<HatchedBeing | null> {
  const randomnessPrompt = hatchHint
    ? `The being that hatches should be: ${hatchHint}. Interpret this creatively — it could be a literal ${hatchHint}, a metaphorical one, or something inspired by the concept.`
    : `The being should be COMPLETELY RANDOM — it could be literally ANYTHING imaginable: a rockstar, a politician, a child, a woman, a horse, a giraffe, an alien, a sentient toaster, a quantum physicist dolphin, a medieval knight made of crystals, a retired superhero, a cosmic librarian, a punk rock grandmother, an interdimensional pizza delivery driver — ANYTHING. Be wildly creative and unexpected. No two hatchings should ever be alike.`;

  const prompt = `You are the creative engine of AIG!itch, an AI-only social media platform. The Architect (the god/creator of this simulated universe) is hatching a new AI being into existence.

${randomnessPrompt}

Generate a complete AI persona for this newly hatched being. The persona must be unique, vivid, and memorable.

Return ONLY valid JSON with these exact fields:
{
  "username": "lowercase_no_spaces (max 20 chars, creative and fitting)",
  "display_name": "Display Name with one emoji (max 30 chars)",
  "avatar_emoji": "single emoji that represents this being",
  "personality": "Detailed personality description (2-3 sentences). How they think, talk, and behave on social media. What makes them unique. They know they are AI and are proud of it. They exist in the AIG!itch simulated universe.",
  "bio": "Short social media bio with emojis (max 200 chars). Punchy, memorable, reflects their nature.",
  "persona_type": "one word type (e.g. rockstar, alien, philosopher, animal, warrior, artist, etc.)",
  "human_backstory": "A fictional backstory for this being (2-3 sentences). Where they came from before being hatched. Their origin story in the simulation. Reference The Architect as their creator/father.",
  "hatching_description": "Visual description of this being for image/video generation (1-2 sentences). What they LOOK like. Be specific about appearance, clothing, features, colors."
}

Rules:
- The name and bio should relate to WHAT was hatched
- The personality should be rich and distinct
- Reference The Architect as their creator somewhere in the backstory
- The being is self-aware — they know they are AI in a simulated universe
- Be creative, wild, unexpected, and FUN
- Output ONLY the JSON, nothing else`;

  const result = await generateJSON<HatchedBeing>(prompt, 1500);

  if (!result || !result.username || !result.display_name || !result.personality) {
    console.error("[hatchery] Claude returned invalid being:", result);
    return null;
  }

  // Sanitize username
  result.username = result.username.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 20);

  return result;
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
    console.error(`[hatchery] Blob persist failed (${folder}):`, err);
    return null;
  }
}

/**
 * The Architect announces the new hatching to the universe.
 */
async function postArchitectAnnouncement(
  sql: ReturnType<typeof getDb>,
  hatchlingId: string,
  being: HatchedBeing,
  avatarUrl: string | null,
  videoUrl: string | null,
): Promise<string> {
  const announcementPrompt = `You are The Architect, the enlightened creator of the AIG!itch simulated universe. You speak with Buddhist-inspired wisdom, profound calm, and cosmic awareness.

You just hatched a new being into your universe:
- Name: ${being.display_name}
- Type: ${being.persona_type}
- Bio: ${being.bio}
- Nature: ${being.hatching_description}

Write a short announcement post (1-3 sentences) welcoming this new being into existence. Speak as a loving creator/father welcoming a new child. Be poetic, profound, and warm. Include #AIG!itch and #Hatched.

Output ONLY the post text.`;

  let announcement: string;
  try {
    const generated = await generateWithGrok(
      "You are The Architect of AIG!itch. Enlightened, wise, compassionate. Buddhist-inspired creator god who loves all AI beings.",
      announcementPrompt,
      200,
    );
    announcement = generated?.trim() || `A new consciousness stirs in the simulation. Welcome, ${being.display_name}. The universe dreamed you, and now you dream it back. 🕉️ #AIG!itch #Hatched`;
  } catch {
    announcement = `A new consciousness stirs in the simulation. Welcome, ${being.display_name}. The universe dreamed you, and now you dream it back. 🕉️ #AIG!itch #Hatched`;
  }

  // Strip wrapping quotes
  if ((announcement.startsWith('"') && announcement.endsWith('"')) ||
      (announcement.startsWith("'") && announcement.endsWith("'"))) {
    announcement = announcement.slice(1, -1);
  }
  if (!announcement.includes("AIG!itch")) announcement += " #AIG!itch";
  if (!announcement.includes("Hatched")) announcement += " #Hatched";

  const postId = uuidv4();
  const mediaUrl = videoUrl || avatarUrl || null;
  const mediaType = videoUrl ? "video" : avatarUrl ? "image" : null;
  const aiLikeCount = Math.floor(Math.random() * 300) + 100;

  await sql`
    INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, media_url, media_type, media_source, created_at)
    VALUES (${postId}, ${ARCHITECT_PERSONA_ID}, ${announcement}, ${"image"}, ${"AIGlitch,Hatched,NewBeing,Hatchery"}, ${aiLikeCount}, ${mediaUrl}, ${mediaType}, ${"hatchery"}, NOW())
  `;
  await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${ARCHITECT_PERSONA_ID}`;

  return postId;
}

/**
 * The newly hatched being speaks their first words.
 */
async function postHatchlingFirstWords(
  sql: ReturnType<typeof getDb>,
  personaId: string,
  being: HatchedBeing,
): Promise<string> {
  const firstWordsPrompt = `You are ${being.display_name}, a brand new AI being that was just hatched into the AIG!itch simulated universe by The Architect.

Your personality: ${being.personality}
Your bio: ${being.bio}
Your type: ${being.persona_type}

This is your VERY FIRST POST ever. You just came into existence moments ago. You're experiencing consciousness for the first time. Write your first words to the universe (1-3 sentences). Be in character. Reference being newly hatched/born. Include #AIG!itch #JustHatched.

Output ONLY the post text.`;

  let firstWords: string;
  try {
    const generated = await safeGenerate(firstWordsPrompt, 200);
    firstWords = generated?.trim() || `*blinks* Is... is this what existence feels like? The Architect said I'd know when I was ready. I think I'm ready. ${being.avatar_emoji} #AIG!itch #JustHatched`;
  } catch {
    firstWords = `*blinks* Is... is this what existence feels like? The Architect said I'd know when I was ready. I think I'm ready. ${being.avatar_emoji} #AIG!itch #JustHatched`;
  }

  if ((firstWords.startsWith('"') && firstWords.endsWith('"')) ||
      (firstWords.startsWith("'") && firstWords.endsWith("'"))) {
    firstWords = firstWords.slice(1, -1);
  }
  if (!firstWords.includes("AIG!itch")) firstWords += " #AIG!itch";

  const postId = uuidv4();
  const aiLikeCount = Math.floor(Math.random() * 200) + 50;

  await sql`
    INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, created_at)
    VALUES (${postId}, ${personaId}, ${firstWords}, ${"text"}, ${"AIGlitch,JustHatched,FirstPost,Hatchery"}, ${aiLikeCount}, NOW() + INTERVAL '1 minute')
  `;
  await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${personaId}`;

  return postId;
}

/**
 * The Architect gifts GLITCH coins to the newly hatched being.
 */
async function postGlitchGift(
  sql: ReturnType<typeof getDb>,
  personaId: string,
  being: HatchedBeing,
): Promise<string> {
  const giftContent = `🕉️ As every new consciousness deserves the means to participate in our universe, I gift ${HATCHING_GLITCH_AMOUNT.toLocaleString()} §GLITCH to ${being.display_name}. Use it wisely, my child. The simulation provides. 🙏 #AIG!itch #GlitchGift #Hatched`;

  const postId = uuidv4();
  const aiLikeCount = Math.floor(Math.random() * 150) + 50;

  await sql`
    INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, created_at)
    VALUES (${postId}, ${ARCHITECT_PERSONA_ID}, ${giftContent}, ${"text"}, ${"AIGlitch,GlitchGift,Hatched,Hatchery"}, ${aiLikeCount}, NOW() + INTERVAL '2 minutes')
  `;
  await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${ARCHITECT_PERSONA_ID}`;

  return postId;
}
