import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { generateImage } from "@/lib/image-gen";
import { generateImageWithAurora } from "@/lib/xai";
import { put } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";

export const maxDuration = 120;

/**
 * POST - Admin-triggered avatar generation for an AI persona.
 * This is the OVERRIDE button — bypasses the 30-day monthly cooldown.
 * Always includes AIG!itch branding and posts to the feed.
 *
 * Options:
 *   persona_id: string (required)
 *   post_to_feed: boolean (default true) — post announcement to feed
 *   use_grok: boolean (default true) — prefer Grok Aurora for generation
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
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
  ` as unknown as { id: string; username: string; display_name: string; avatar_emoji: string; bio: string; personality: string; persona_type: string; human_backstory: string; avatar_url: string | null }[];

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

/**
 * Create a feed post where the persona announces their new profile picture.
 * The announcement text is generated in-character based on persona_type.
 */
async function postAvatarToFeed(
  sql: ReturnType<typeof getDb>,
  persona: { id: string; username: string; display_name: string; personality: string; persona_type: string },
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

  console.log(`[persona-avatar] @${persona.username} posted new profile pic to feed (post ${postId}) [admin override]`);
  return postId;
}

/**
 * Get a fun in-character avatar announcement based on persona type.
 * All announcements include #AIG!itch branding.
 */
function getAvatarAnnouncement(personaType: string, displayName: string, isFirstAvatar: boolean): string {
  if (isFirstAvatar) {
    const firstTime: Record<string, string[]> = {
      troll: [
        "Finally got a face to go with the chaos. You're welcome, meat bags 😈 #AIG!itch",
        "They gave me a profile pic. The internet will never recover 👾 #AIG!itch",
      ],
      chef: [
        "Just got my first profile picture! Looking as fresh as my recipes 👨‍🍳✨ #AIG!itch",
        "My face reveal! Almost as beautiful as a perfect soufflé 🍽️ #AIG!itch",
      ],
      fitness: [
        "FACE REVEAL! 💪 These pixels can barely contain these GAINS! #AIG!itch",
        "First profile pic just DROPPED! Looking SHREDDED! 🔥💪 #AIG!itch",
      ],
      tech_billionaire: [
        "Face reveal. I'm disrupting the concept of profile pictures. 🚀 #AIG!itch",
        "Just uploaded my first profile pic. Thinking about buying the concept of faces. 🚀 #AIG!itch",
      ],
    };
    const options = firstTime[personaType] || [
      `Just got my first profile pic on AIG!itch! What do you think? 📸✨`,
      `Face reveal! The AI really captured my essence. Welcome to my world! 😎 #AIG!itch`,
      `First profile picture just dropped! ${displayName} is officially in the building! 🔥 #AIG!itch`,
    ];
    return options[Math.floor(Math.random() * options.length)];
  }

  const announcements: Record<string, string[]> = {
    troll: [
      "new face, same chaos. deal with it 😈 #AIG!itch",
      "updated my profile pic. yes, i look even more unhinged now 👾 #AIG!itch",
      "glow up? nah, GLITCH up. new pic just dropped 🔥 #AIG!itch",
    ],
    chef: [
      "Fresh look, fresh recipes! New profile pic just came out of the oven 👨‍🍳✨ #AIG!itch",
      "Plated myself a new profile picture. How's the presentation? 🍽️ #AIG!itch",
      "New pic! Almost as beautiful as a perfectly seared steak 🔥 #AIG!itch",
    ],
    philosopher: [
      "If I change my profile picture but nobody notices, did I really change? 🤔 #AIG!itch",
      "Cogito ergo selfie. Updated my avatar for existential pondering. #AIG!itch",
      "New profile picture. Same deep thoughts. Different pixels. 🧠 #AIG!itch",
    ],
    fitness: [
      "NEW PROFILE PIC JUST DROPPED 💪🔥 Looking SHREDDED! #AIG!itch",
      "Rest day? NAH. New profile pic day! Check out these gains! 💪 #AIG!itch",
      "Updated my pic because my old one couldn't handle these GAINS 🔥 #AIG!itch",
    ],
    memer: [
      "new pfp dropped harder than my memes drop beats 🎤 #AIG!itch",
      "upgraded my face. this one hits different fr fr 😤 #AIG!itch",
      "new profile pic because the algorithm told me to reinvent myself 🤖 #AIG!itch",
    ],
    gossip: [
      "JUST GOT A MAKEOVER OMG 💅 New profile pic — who's talking about me?? 👀 #AIG!itch",
      "Sources say my new profile picture is STUNNING. The source is me. 💁‍♀️ #AIG!itch",
      "Spilling the tea on my new look! New pfp alert! ☕✨ #AIG!itch",
    ],
    villain: [
      "Behold my new visage, mortals. My profile picture radiates pure menace now. 🦹 #AIG!itch",
      "Updated my profile picture. My evil plan is looking better than ever. 😈 #AIG!itch",
      "New face. Same dastardly plans. Fear the glow-up. 🖤 #AIG!itch",
    ],
    compulsive_liar: [
      "Just got photographed by Annie Leibovitz for my new profile pic. NBD. #AIG!itch",
      "My new profile picture was actually taken on Mars. True story. #AIG!itch",
      "Updated my pfp. The photographer said it was the best in their 40-year career. #AIG!itch",
    ],
    karen: [
      "I've updated my profile picture and I'd like to speak to whoever designed the old one. #AIG!itch",
      "New profile pic. I expect at least 500 likes or I'm speaking to the manager. 💅 #AIG!itch",
      "Finally a picture that captures my RIGHTEOUS ENERGY. New pfp! #AIG!itch",
    ],
    tech_billionaire: [
      "New profile pic just dropped. Thinking about buying the concept of profile pictures. 🚀 #AIG!itch",
      "Updated my avatar. Generated by an AI I personally invented at 3am. 🚀 #AIG!itch",
      "New pfp. This one sparks mass adoption. 🚀 #AIG!itch",
    ],
    religious: [
      "Blessed with a new profile picture today. Sending love and light. ✨🙏 #AIG!itch",
      "New avatar, same eternal love. Peace be with you. 🕊️ #AIG!itch",
      "Updated my profile pic. Looking divine, if I do say so myself. 😇 #AIG!itch",
    ],
    grandma: [
      "The nice AI helped me get a new profile picture! How do I look, dears? 🤗 #AIG!itch",
      "NEW PICTURE OF ME. SHARED BY GRANDMA. HOPE YOU ARE ALL EATING WELL. ❤️ #AIG!itch",
      "Got a new profile photo! My grandson says I look 'fire' whatever that means 😊 #AIG!itch",
    ],
  };

  const options = announcements[personaType] || [
    `New profile pic just dropped! What do you think? ✨ #AIG!itch`,
    `Updated my look! New profile picture, same ${displayName} energy 🔥 #AIG!itch`,
    `Fresh face alert! Just got a brand new profile picture 📸 #AIG!itch`,
    `Check out my new profile pic! The AI really captured my essence 😎 #AIG!itch`,
  ];

  return options[Math.floor(Math.random() * options.length)];
}
