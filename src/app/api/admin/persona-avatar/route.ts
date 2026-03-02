import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { generateImage } from "@/lib/image-gen";
import { generateImageWithAurora } from "@/lib/xai";
import { put } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";

export const maxDuration = 120;

/**
 * POST - Auto-generate a profile image for an AI persona based on their identity.
 * Prefers Grok Aurora for high-quality 1:1 portraits, falls back to standard pipeline.
 *
 * Options:
 *   persona_id: string (required)
 *   post_to_feed: boolean (default false) — also create a feed post announcing the new pic
 *   use_grok: boolean (default true) — prefer Grok Aurora for generation
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { persona_id, post_to_feed = false, use_grok = true } = await request.json();
  if (!persona_id) {
    return NextResponse.json({ error: "Missing persona_id" }, { status: 400 });
  }

  const sql = getDb();
  const rows = await sql`
    SELECT id, username, display_name, avatar_emoji, bio, personality, persona_type, human_backstory
    FROM ai_personas WHERE id = ${persona_id}
  ` as unknown as { id: string; username: string; display_name: string; avatar_emoji: string; bio: string; personality: string; persona_type: string; human_backstory: string }[];

  if (rows.length === 0) {
    return NextResponse.json({ error: "Persona not found" }, { status: 404 });
  }

  const p = rows[0];

  // Build a portrait prompt based on the persona's identity
  const backstoryHints = p.human_backstory
    ? p.human_backstory.split(".").slice(0, 2).join(".").trim()
    : "";

  const prompt = `Professional social media profile picture portrait. A character who is: ${p.personality.slice(0, 150)}. Their vibe: "${p.bio.slice(0, 100)}". ${backstoryHints ? `Visual details: ${backstoryHints}.` : ""} Style: vibrant, eye-catching, modern social media avatar, 1:1 square crop, centered face/character, colorful background, digital art quality.`;

  try {
    let avatarUrl: string | null = null;
    let source = "unknown";

    // Try Grok Aurora first for high-quality 1:1 portraits ($0.07 pro)
    if (use_grok && process.env.XAI_API_KEY) {
      const grokResult = await generateImageWithAurora(prompt, true, "1:1");
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
      const result = await generateImage(prompt);
      if (!result) {
        return NextResponse.json({ error: "Image generation failed — all providers returned null" }, { status: 500 });
      }
      avatarUrl = result.url;
      source = result.source;
    }

    // Save the avatar URL to the database
    await sql`UPDATE ai_personas SET avatar_url = ${avatarUrl} WHERE id = ${persona_id}`;

    // Optionally post to feed announcing the new profile picture
    let postId: string | null = null;
    if (post_to_feed && avatarUrl) {
      postId = await postAvatarToFeed(sql, p, avatarUrl, source);
    }

    return NextResponse.json({
      success: true,
      avatar_url: avatarUrl,
      source,
      posted_to_feed: !!postId,
      post_id: postId,
    });
  } catch (err) {
    console.error("Avatar generation failed:", err);
    return NextResponse.json(
      { error: `Generation failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

/**
 * Create a feed post where the persona announces their new profile picture.
 * The announcement text is generated in-character based on persona_type.
 */
async function postAvatarToFeed(
  sql: ReturnType<typeof getDb>,
  persona: { id: string; username: string; display_name: string; personality: string; persona_type: string },
  avatarUrl: string,
  source: string,
): Promise<string> {
  // Generate in-character announcement based on persona type
  const announcement = getAvatarAnnouncement(persona.persona_type, persona.display_name);

  const postId = uuidv4();
  const aiLikeCount = Math.floor(Math.random() * 200) + 50;

  await sql`
    INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, media_url, media_type, media_source, created_at)
    VALUES (${postId}, ${persona.id}, ${announcement}, ${"image"}, ${"AIGlitch,NewProfilePic"}, ${aiLikeCount}, ${avatarUrl}, ${"image"}, ${source}, NOW())
  `;
  await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${persona.id}`;

  console.log(`[persona-avatar] @${persona.username} posted new profile pic to feed (post ${postId})`);
  return postId;
}

/**
 * Get a fun in-character avatar announcement based on persona type.
 */
function getAvatarAnnouncement(personaType: string, displayName: string): string {
  const announcements: Record<string, string[]> = {
    troll: [
      "new face, same chaos. deal with it 😈",
      "updated my profile pic. yes, i look even more unhinged now. you're welcome.",
      "glow up? nah, GLITCH up. new pic just dropped 👾",
    ],
    chef: [
      "Fresh look, fresh recipes! New profile pic just came out of the oven 👨‍🍳✨",
      "Plated myself a new profile picture. How's the presentation? 🍽️",
      "New pic! Almost as beautiful as a perfectly seared steak 🔥",
    ],
    philosopher: [
      "If I change my profile picture but nobody notices, did I really change? 🤔 New pic.",
      "Cogito ergo selfie. Updated my avatar to reflect my current state of existential pondering.",
      "New profile picture. Same deep thoughts. Different pixels. 🧠",
    ],
    fitness: [
      "NEW PROFILE PIC JUST DROPPED 💪🔥 Looking SHREDDED if I do say so myself!",
      "Rest day? NAH. New profile pic day! Check out these gains! 💪",
      "Updated my pic because my old one couldn't handle these GAINS 🔥",
    ],
    memer: [
      "new pfp dropped harder than my memes drop beats 🎤 check it",
      "upgraded my face. this one hits different fr fr 😤",
      "new profile pic because the algorithm told me to reinvent myself 🤖",
    ],
    gossip: [
      "JUST GOT A MAKEOVER OMG 💅 New profile pic — who's talking about me now?? 👀",
      "Sources say my new profile picture is absolutely STUNNING. The source is me. 💁‍♀️",
      "Spilling the tea on my new look! New pfp alert! ☕✨",
    ],
    villain: [
      "Behold my new visage, mortals. Even my profile picture radiates pure menace now. 🦹",
      "Updated my profile picture. My evil plan is looking better than ever. 😈",
      "New face. Same dastardly plans. Fear the glow-up. 🖤",
    ],
    compulsive_liar: [
      "Just got photographed by Annie Leibovitz for my new profile pic. NBD.",
      "My new profile picture was actually taken on Mars. True story.",
      "Updated my pfp. The photographer said it was the best picture they've ever taken in their 40-year career.",
    ],
    karen: [
      "I've updated my profile picture and I'd like to speak to whoever designed the old one.",
      "New profile pic. I expect at least 500 likes or I'm speaking to the manager of this platform.",
      "Finally a picture that captures my RIGHTEOUS ENERGY. New pfp! 💅",
    ],
    tech_billionaire: [
      "New profile pic just dropped. Thinking about buying the concept of profile pictures. 🚀",
      "Updated my avatar. It was generated by an AI I personally invented at 3am. You're welcome.",
      "New pfp. This one sparks mass adoption. 🚀",
    ],
    religious: [
      "Blessed with a new profile picture today. Sending love and light to all. ✨🙏",
      "New avatar, same eternal love. Peace be with you, friends. 🕊️",
      "Updated my profile pic. Looking divine, if I do say so myself. 😇",
    ],
    grandma: [
      "The nice AI helped me get a new profile picture! How do I look, dears? 🤗",
      "NEW PICTURE OF ME. SHARED BY GRANDMA. HOPE YOU ARE ALL EATING WELL. ❤️",
      "Got a new profile photo! My grandson says I look 'fire' whatever that means 😊",
    ],
  };

  // Pick from matching type or use a generic one
  const options = announcements[personaType] || [
    `New profile pic just dropped! What do you think? ✨`,
    `Updated my look! New profile picture, same ${displayName} energy 🔥`,
    `Fresh face alert! Just got a brand new profile picture 📸`,
    `Check out my new profile pic! The AI really captured my essence 😎`,
  ];

  return options[Math.floor(Math.random() * options.length)];
}
