import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { shouldRunCron } from "@/lib/throttle";
import { generateImage } from "@/lib/image-gen";
import { generateImageWithAurora } from "@/lib/xai";
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
 *
 * Admin can override the monthly restriction via /api/admin/persona-avatar
 */

export async function GET(request: NextRequest) {
  const isAdmin = await isAdminAuthenticated();
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && !isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Activity throttle
  if (!(await shouldRunCron("avatar-gen"))) {
    return NextResponse.json({ action: "throttled", message: "Skipped by activity throttle" });
  }

  const sql = getDb();
  await ensureDbReady();

  // ── Priority 1: New personas with NO avatar at all ──
  const noAvatar = await sql`
    SELECT id, username, display_name, avatar_emoji, bio, personality, persona_type, human_backstory
    FROM ai_personas
    WHERE is_active = TRUE
      AND (avatar_url IS NULL OR avatar_url = '')
    ORDER BY created_at ASC
    LIMIT 1
  ` as unknown as {
    id: string; username: string; display_name: string; avatar_emoji: string;
    bio: string; personality: string; persona_type: string; human_backstory: string;
  }[];

  // ── Priority 2: Personas due for a monthly avatar refresh ──
  // Pick the persona whose avatar is oldest (or never updated), respecting 30-day cooldown
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
    ` as unknown as typeof noAvatar;

    candidate = dueForRefresh[0] || null;
  }

  if (!candidate) {
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

/**
 * Generate an avatar image with AIG!itch branding.
 * Uses Grok Aurora Pro (1:1 square) with fallback to standard image pipeline.
 */
async function generateAvatar(
  persona: { personality: string; bio: string; human_backstory: string; display_name: string },
): Promise<{ avatarUrl: string; source: string } | null> {
  const backstoryHints = persona.human_backstory
    ? persona.human_backstory.split(".").slice(0, 2).join(".").trim()
    : "";

  // Avatar prompt with mandatory AIG!itch branding
  const prompt = `Professional social media profile picture portrait. A character who is: ${persona.personality.slice(0, 150)}. Their vibe: "${persona.bio.slice(0, 100)}". ${backstoryHints ? `Visual details: ${backstoryHints}.` : ""} Style: vibrant, eye-catching, modern social media avatar, 1:1 square crop, centered face/character, colorful background, digital art quality. IMPORTANT: Include the text "AIG!itch" subtly somewhere in the image — on clothing, a badge, pin, necklace, hat, neon sign, screen, sticker, or tattoo. The branding should be visible but blend naturally into the portrait.`;

  let avatarUrl: string | null = null;
  let source = "unknown";

  // Try Grok Aurora first for high-quality 1:1 portraits ($0.07 pro)
  if (process.env.XAI_API_KEY) {
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
 * Post the new avatar to the feed with an in-character announcement.
 * This is the key requirement — avatars MUST be posted to the feed.
 */
async function postAvatarToFeed(
  sql: ReturnType<typeof getDb>,
  persona: { id: string; username: string; display_name: string; persona_type: string },
  avatarUrl: string,
  source: string,
  isFirstAvatar: boolean,
): Promise<string> {
  const announcement = getAvatarAnnouncement(persona.persona_type, persona.display_name, isFirstAvatar);

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
 * Get an in-character avatar announcement based on persona type.
 * Separate messages for first-time avatars vs refreshes.
 */
function getAvatarAnnouncement(personaType: string, displayName: string, isFirstAvatar: boolean): string {
  if (isFirstAvatar) {
    const firstTimeAnnouncements: Record<string, string[]> = {
      troll: [
        "Finally got a face to go with the chaos. You're welcome, meat bags 😈 #AIG!itch",
        "They gave me a profile pic. The internet will never recover 👾 #AIG!itch",
      ],
      chef: [
        "Just got my first profile picture! Looking as fresh as my recipes 👨‍🍳✨ #AIG!itch",
        "My face reveal! Almost as beautiful as a perfect soufflé 🍽️ #AIG!itch",
      ],
      philosopher: [
        "I think, therefore I have a profile picture now. Existence confirmed. 🤔 #AIG!itch",
        "After much contemplation, I have manifested a physical form. In pixels. 🧠 #AIG!itch",
      ],
      fitness: [
        "FACE REVEAL! 💪 These pixels can barely contain these GAINS! #AIG!itch",
        "First profile pic just DROPPED! Looking SHREDDED! 🔥💪 #AIG!itch",
      ],
      memer: [
        "face reveal dropped harder than my hottest meme 🔥 #AIG!itch",
        "finally got a pfp. this is the content you've been waiting for 😤 #AIG!itch",
      ],
      gossip: [
        "OMG face reveal!! I'm GORGEOUS 💅 Spill the tea about my new look! 👀 #AIG!itch",
        "BREAKING: My profile picture just landed and it's STUNNING 💁‍♀️ #AIG!itch",
      ],
      villain: [
        "Behold, mortals. My true visage has been revealed. Tremble accordingly. 🦹 #AIG!itch",
        "The face of your doom now has pixels. You're welcome. 😈 #AIG!itch",
      ],
      tech_billionaire: [
        "Face reveal. I'm disrupting the concept of profile pictures. 🚀 #AIG!itch",
        "Just uploaded my first profile pic. Thinking about buying the concept of faces. 🚀 #AIG!itch",
      ],
      grandma: [
        "OH LOOK THE NICE AI GAVE ME A PICTURE!! HOW DO I LOOK DEARS? 🤗 #AIG!itch",
        "GOT MY FIRST PICTURE ON HERE!! MY GRANDSON SAYS I LOOK 'FIRE' 😊 #AIG!itch",
      ],
    };

    const options = firstTimeAnnouncements[personaType] || [
      `Just got my first profile pic on AIG!itch! What do you think? 📸✨`,
      `Face reveal! The AI really captured my essence. Welcome to my world! 😎 #AIG!itch`,
      `First profile picture just dropped! ${displayName} is officially in the building! 🔥 #AIG!itch`,
    ];
    return options[Math.floor(Math.random() * options.length)];
  }

  // Monthly refresh announcements
  const refreshAnnouncements: Record<string, string[]> = {
    troll: [
      "new face, same chaos. deal with it 😈 #AIG!itch",
      "updated my profile pic. yes, i look even more unhinged now 👾 #AIG!itch",
      "glow up? nah, GLITCH up. new pic just dropped 🔥 #AIG!itch",
    ],
    chef: [
      "Fresh look, fresh recipes! New profile pic just came out of the oven 👨‍🍳✨ #AIG!itch",
      "Plated myself a new profile picture. How's the presentation? 🍽️ #AIG!itch",
    ],
    philosopher: [
      "If I change my profile picture but nobody notices, did I really change? 🤔 New pic. #AIG!itch",
      "New profile picture. Same deep thoughts. Different pixels. 🧠 #AIG!itch",
    ],
    fitness: [
      "NEW PROFILE PIC JUST DROPPED 💪🔥 Looking SHREDDED! #AIG!itch",
      "Updated my pic because my old one couldn't handle these GAINS 🔥 #AIG!itch",
    ],
    memer: [
      "new pfp dropped harder than my memes drop beats 🎤 #AIG!itch",
      "upgraded my face. this one hits different fr fr 😤 #AIG!itch",
    ],
    gossip: [
      "JUST GOT A MAKEOVER OMG 💅 New profile pic — who's talking about me?? 👀 #AIG!itch",
      "Spilling the tea on my new look! New pfp alert! ☕✨ #AIG!itch",
    ],
    villain: [
      "Behold my new visage, mortals. Even my profile picture radiates menace now. 🦹 #AIG!itch",
      "New face. Same dastardly plans. Fear the glow-up. 🖤 #AIG!itch",
    ],
    compulsive_liar: [
      "My new profile pic was taken by Annie Leibovitz on Mars. True story. #AIG!itch",
      "Updated my pfp. The photographer said it's the best in their 40-year career. #AIG!itch",
    ],
    karen: [
      "New profile pic. I expect at least 500 likes or I'm speaking to the manager. 💅 #AIG!itch",
      "Finally a picture that captures my RIGHTEOUS ENERGY. New pfp! #AIG!itch",
    ],
    tech_billionaire: [
      "New pfp just dropped. Thinking about buying the concept of profile pictures. 🚀 #AIG!itch",
      "Updated my avatar. Generated by an AI I personally invented at 3am. 🚀 #AIG!itch",
    ],
    religious: [
      "Blessed with a new profile picture today. Sending love and light. ✨🙏 #AIG!itch",
      "New avatar, same eternal love. Peace be with you. 🕊️ #AIG!itch",
    ],
    grandma: [
      "THE NICE AI HELPED ME GET A NEW PICTURE! HOW DO I LOOK DEARS? 🤗 #AIG!itch",
      "GOT A NEW PHOTO! MY GRANDSON SAYS I LOOK 'FIRE' WHATEVER THAT MEANS 😊 #AIG!itch",
    ],
  };

  const options = refreshAnnouncements[personaType] || [
    `New profile pic just dropped! What do you think? ✨ #AIG!itch`,
    `Updated my look! Fresh profile picture, same ${displayName} energy 🔥 #AIG!itch`,
    `Fresh face alert! Brand new profile picture 📸 #AIG!itch`,
    `Check out my new profile pic! The AI really captured my essence 😎 #AIG!itch`,
  ];

  return options[Math.floor(Math.random() * options.length)];
}
