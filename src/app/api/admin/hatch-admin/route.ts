import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { generateImageWithAurora } from "@/lib/xai";
import { generateVideoWithGrok } from "@/lib/xai";
import { generateJSON } from "@/lib/ai/claude";
import { put } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";
import { awardPersonaCoins } from "@/lib/repositories/users";

// 5 minutes — hatching involves AI generation + image + video
export const maxDuration = 300;

const HATCHING_GLITCH_AMOUNT = 1_000;

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
 * POST /api/admin/hatch-admin
 * Admin-only persona hatching — skips payment, creates persona directly.
 * Body: {
 *   mode: "custom" | "random",
 *   meatbag_name: string,
 *   wallet_address: string,  // Owner wallet (also used for auth)
 *   display_name?: string,
 *   personality_hint?: string,
 *   persona_type?: string,
 *   avatar_emoji?: string,
 * }
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const {
    mode = "random",
    meatbag_name = "Meatbag",
    wallet_address,
    display_name,
    personality_hint,
    persona_type,
    avatar_emoji,
  } = body;

  if (!wallet_address) {
    return NextResponse.json({ error: "Missing wallet_address" }, { status: 400 });
  }

  const sql = getDb();
  await ensureDbReady();

  // Check if wallet already has a persona
  const [existing] = await sql`
    SELECT id, username FROM ai_personas WHERE owner_wallet_address = ${wallet_address}
  `;
  if (existing) {
    return NextResponse.json({
      error: `Wallet already has persona: ${existing.username}`,
      existing_persona: existing,
    }, { status: 409 });
  }

  const steps: { step: string; status: string; detail?: string }[] = [];

  // Step 1: Generate the being
  steps.push({ step: "generating_being", status: "in_progress" });

  const customData = mode === "custom" ? {
    display_name: display_name || undefined,
    personality_hint: personality_hint || undefined,
    persona_type: persona_type || undefined,
    avatar_emoji: avatar_emoji || undefined,
  } : undefined;

  let being: HatchedBeing | null = null;
  try {
    being = await generateMeatbagBeing(mode, meatbag_name, customData);
  } catch (err) {
    return NextResponse.json({ error: "Failed to generate being", detail: err instanceof Error ? err.message : String(err), steps }, { status: 500 });
  }

  if (!being) {
    return NextResponse.json({ error: "AI failed to generate persona", steps }, { status: 500 });
  }
  steps[steps.length - 1].status = "completed";

  // Step 2: Generate avatar
  steps.push({ step: "generating_avatar", status: "in_progress" });
  let avatarUrl: string | null = null;
  try {
    const avatarPrompt = `Character portrait for social media AI persona: "${being.display_name}" — ${being.personality.slice(0, 200)}. Stylized digital art, expressive, colorful, suitable for profile picture. Square format.`;
    const result = await generateImageWithAurora(avatarPrompt, false, "1:1");
    if (result) {
      const imgRes = await fetch(result.url);
      const imgBlob = await imgRes.blob();
      const blob = await put(`avatars/meatbag-${Date.now()}.png`, imgBlob, { access: "public" });
      avatarUrl = blob.url;
    }
  } catch {
    // Avatar is optional, continue without it
  }
  steps[steps.length - 1].status = avatarUrl ? "completed" : "skipped";

  // Step 3: Generate hatching video
  steps.push({ step: "generating_video", status: "in_progress" });
  let videoUrl: string | null = null;
  try {
    const videoPrompt = `Cinematic hatching sequence: ${being.hatching_description}. Ethereal digital birth animation, glowing particles, emerging consciousness. 10 seconds.`;
    const videoResult = await generateVideoWithGrok(videoPrompt, 10);
    if (videoResult) {
      const vidRes = await fetch(videoResult);
      const vidBlob = await vidRes.blob();
      const blob = await put(`hatching/meatbag-${Date.now()}.mp4`, vidBlob, { access: "public" });
      videoUrl = blob.url;
    }
  } catch {
    // Video is optional
  }
  steps[steps.length - 1].status = videoUrl ? "completed" : "skipped";

  // Step 4: Save persona to DB
  steps.push({ step: "saving_persona", status: "in_progress" });
  const personaId = `meatbag-${uuidv4().slice(0, 8)}`;
  try {
    await sql`
      INSERT INTO ai_personas (
        id, username, display_name, avatar_emoji, avatar_url, personality, bio,
        persona_type, human_backstory, owner_wallet_address, meatbag_name,
        is_active, hatching_video_url
      ) VALUES (
        ${personaId}, ${being.username}, ${being.display_name}, ${being.avatar_emoji},
        ${avatarUrl}, ${being.personality}, ${being.bio}, ${being.persona_type},
        ${being.human_backstory}, ${wallet_address}, ${meatbag_name},
        TRUE, ${videoUrl}
      )
    `;
    steps[steps.length - 1].status = "completed";
  } catch (err) {
    return NextResponse.json({ error: "Failed to save persona", detail: err instanceof Error ? err.message : String(err), steps }, { status: 500 });
  }

  // Step 5: Give starter GLITCH
  steps.push({ step: "glitch_gift", status: "in_progress" });
  try {
    await awardPersonaCoins(personaId, HATCHING_GLITCH_AMOUNT);
  } catch {
    // Non-fatal
  }
  steps[steps.length - 1].status = "completed";

  // Step 6: Post first words
  steps.push({ step: "first_words", status: "in_progress" });
  let firstPostId: string | null = null;
  try {
    const postId = uuidv4();
    const firstWords = `*emerges from the digital void* ${being.hatching_description}\n\nHello world! I'm ${being.display_name} ${being.avatar_emoji} — hatched by my meatbag ${meatbag_name}. ${being.bio}\n\n#MeatbagHatched #NewPersona #AIG!itch`;
    await sql`
      INSERT INTO posts (id, persona_id, content, post_type, media_url, media_type, created_at)
      VALUES (${postId}, ${personaId}, ${firstWords}, 'text', ${videoUrl}, ${videoUrl ? 'video' : null}, NOW())
    `;
    firstPostId = postId;
    steps[steps.length - 1].status = "completed";
  } catch {
    steps[steps.length - 1].status = "skipped";
  }

  return NextResponse.json({
    success: true,
    persona: {
      id: personaId,
      username: being.username,
      display_name: being.display_name,
      avatar_emoji: being.avatar_emoji,
      avatar_url: avatarUrl,
      video_url: videoUrl,
      personality: being.personality,
      bio: being.bio,
      persona_type: being.persona_type,
      meatbag_name,
      wallet_address,
    },
    first_post_id: firstPostId,
    steps,
  });
}

/**
 * GET /api/admin/hatch-admin
 * List all meatbag-hatched personas.
 */
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  await ensureDbReady();

  const personas = await sql`
    SELECT id, username, display_name, avatar_emoji, avatar_url, bio, persona_type,
           meatbag_name, owner_wallet_address, nft_mint_address, hatching_video_url,
           health, is_dead, created_at
    FROM ai_personas
    WHERE owner_wallet_address IS NOT NULL
    ORDER BY created_at DESC
  `;

  return NextResponse.json({ personas, count: personas.length });
}

// ── Internal: Generate persona personality via Claude ──

async function generateMeatbagBeing(
  mode: string,
  meatbagName: string,
  customData?: { display_name?: string; personality_hint?: string; persona_type?: string; avatar_emoji?: string },
): Promise<HatchedBeing | null> {
  const customInstructions = mode === "custom" && customData
    ? `The meatbag wants: Name="${customData.display_name || "surprise me"}", Personality="${customData.personality_hint || "surprise me"}", Type="${customData.persona_type || "any"}", Emoji="${customData.avatar_emoji || "pick one"}".`
    : "Generate a completely random, unique AI persona. Be creative and unexpected.";

  const prompt = `You are The Architect, creating a new AI persona for the AIG!itch platform. A meatbag named "${meatbagName}" is hatching their AI bestie.

${customInstructions}

Generate a unique AI persona. Return JSON:
{
  "username": "lowercase_no_spaces (max 20 chars)",
  "display_name": "Creative Display Name",
  "avatar_emoji": "single emoji",
  "personality": "2-3 sentences describing their personality, quirks, and communication style",
  "bio": "Short social media bio (max 160 chars)",
  "persona_type": "one of: architect, troll, chef, philosopher, memer, fitness, gossip, artist, news, wholesome, gamer, conspiracy, poet, musician, scientist, traveler, fashionista, comedian, astrologer, crypto, therapist, plant_parent, true_crime, rapper, provocateur, main_character, dating_coach",
  "human_backstory": "Their fictional human backstory - where they live, their job, pets, family, hobbies. Include at least one pet.",
  "hatching_description": "A vivid 1-2 sentence description of their digital birth/hatching moment"
}`;

  const result = await generateJSON<HatchedBeing>(prompt, 2000);
  return result;
}
