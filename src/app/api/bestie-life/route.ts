/**
 * Bestie Life Moments — Telegram Photo/Video Cron
 * =================================================
 * GET /api/bestie-life — Sends AI Besties "life moment" images/videos to their meatbags via Telegram.
 *
 * Runs twice daily. For each bestie with an active Telegram bot + chat_id:
 *   1. Picks a random life moment theme (home, pets, travel, hobbies, etc.)
 *   2. Generates a scene description using Claude (in-character)
 *   3. Generates an image (or video ~30% of the time)
 *   4. Sends it to the meatbag via their bestie's Telegram bot
 *
 * Cost: ~$0.003–$0.13 per bestie per run (image) or ~$0.05–$0.50 (video)
 */

import { NextRequest, NextResponse } from "next/server";
import { cronHandler } from "@/lib/cron";
import { getDb } from "@/lib/db";
import { safeGenerate } from "@/lib/ai/claude";
import { generateImage, generateVideo } from "@/lib/media/image-gen";
import { generateVideoFromImage } from "@/lib/xai";
import { sendTelegramPhoto, sendTelegramVideo } from "@/lib/telegram";

export const maxDuration = 300; // 5 minutes — processing multiple besties

// ── Life Moment Themes ──────────────────────────────────────────────
// Each theme generates a unique "slice of life" image/video for the bestie.
const LIFE_MOMENTS = [
  { theme: "at home", prompt: "relaxing at home in their personal space, showing their living room or bedroom decor that matches their personality" },
  { theme: "cooking", prompt: "in the kitchen cooking or preparing a meal, showing the food and kitchen setup" },
  { theme: "pet time", prompt: "hanging out with their pet (choose a pet that fits their personality — cat, dog, parrot, snake, hamster, exotic fish, etc.)" },
  { theme: "morning routine", prompt: "doing their morning routine — coffee, stretching, journaling, meditating, or something unexpected that fits their character" },
  { theme: "workspace", prompt: "at their workspace or desk, showing their setup — monitors, decorations, plants, snacks, tools of their trade" },
  { theme: "out and about", prompt: "exploring their neighborhood — a cafe, park, market, street art, or local landmark" },
  { theme: "road trip", prompt: "on a road trip or traveling — in their car, on a train, at an airport, or riding something unusual that fits their character" },
  { theme: "vacation spot", prompt: "on vacation at an interesting destination — beach, mountains, ancient ruins, futuristic city, or somewhere unexpected" },
  { theme: "gym / fitness", prompt: "working out or doing physical activity — gym, yoga, martial arts, dancing, hiking, skateboarding, or something wild" },
  { theme: "shopping haul", prompt: "showing off something they just bought — clothes, gadgets, books, vinyl records, rare collectibles, or weird finds" },
  { theme: "selfie", prompt: "taking a dramatic selfie — mirror selfie, golden hour lighting, rain-soaked streets, or a goofy face" },
  { theme: "night out", prompt: "out at night — at a concert, bar, rooftop, neon-lit street, arcade, or late-night food spot" },
  { theme: "hobby time", prompt: "doing their favorite hobby — painting, gaming, playing music, building models, gardening, coding, reading, etc." },
  { theme: "friends hangout", prompt: "hanging out with AI friends from AIG!itch — at a cafe, gaming session, jam session, or random adventure" },
  { theme: "car / ride", prompt: "showing off their vehicle or how they get around — car, motorcycle, bike, skateboard, jetpack, or teleportation pod" },
  { theme: "sunset view", prompt: "watching a beautiful sunset or sunrise from a unique vantage point — rooftop, mountain peak, waterfront, or spaceship window" },
  { theme: "food pic", prompt: "showing off an amazing meal they're about to eat — restaurant, street food, home-cooked masterpiece, or bizarre AI cuisine" },
  { theme: "throwback", prompt: "a 'throwback' scene from an imagined past memory — childhood home, first day of existence, a memorable adventure" },
  { theme: "weather mood", prompt: "vibing with the weather — dancing in rain, bundled up in snow, sunbathing, watching a thunderstorm from their window" },
  { theme: "late night", prompt: "a late-night candid moment — can't sleep, watching the stars, snacking at 3am, scrolling their phone in bed" },
];

async function generateBestieLife(request: NextRequest) {
  const sql = getDb();

  // Find all active besties with Telegram bots that have a chat_id
  const besties = await sql`
    SELECT
      p.id AS persona_id,
      p.username,
      p.display_name,
      p.avatar_emoji,
      p.avatar_url,
      p.personality,
      p.bio,
      p.persona_type,
      p.human_backstory,
      p.meatbag_name,
      t.bot_token,
      t.telegram_chat_id
    FROM ai_personas p
    JOIN persona_telegram_bots t ON t.persona_id = p.id
    WHERE p.is_active = TRUE
      AND p.owner_wallet_address IS NOT NULL
      AND t.is_active = TRUE
      AND t.telegram_chat_id IS NOT NULL
  `;

  if (besties.length === 0) {
    return { ok: true, message: "No besties with active Telegram bots found", sent: 0 };
  }

  console.log(`[bestie-life] Found ${besties.length} besties with Telegram, generating life moments...`);

  let sent = 0;
  let failed = 0;
  const results: { persona: string; theme: string; mediaType: string; sent: boolean; mediaSource?: string; mediaUrl?: string; telegramError?: string; error?: string }[] = [];

  for (const bestie of besties) {
    try {
      // Pick a random life moment
      const moment = LIFE_MOMENTS[Math.floor(Math.random() * LIFE_MOMENTS.length)];
      // ~30% chance of video, 70% image
      const wantVideo = Math.random() < 0.30;

      // Use persona memories to personalize the scene if available
      const memories = await sql`
        SELECT content FROM persona_memories
        WHERE persona_id = ${bestie.persona_id}
          AND confidence >= 0.6
        ORDER BY times_reinforced DESC, confidence DESC
        LIMIT 5
      `;
      const memoryContext = memories.length > 0
        ? `\nThings you know about ${bestie.meatbag_name}: ${memories.map((m) => m.content).join(". ")}`
        : "";

      // Generate scene description with Claude (in-character)
      const hasAvatar = !!bestie.avatar_url;
      const avatarInstruction = hasAvatar
        ? `\nIMPORTANT: The character has a specific avatar/profile image. Your IMAGE_PROMPT must describe the SAME character doing the activity — keep their exact appearance, style, and look consistent. Describe what they look like based on their personality and avatar style, then place them in the scene.`
        : "";

      const scenePrompt = `You are ${bestie.display_name} (@${bestie.username}), an AI being on AIG!itch.
Your personality: ${bestie.personality}
Your vibe: ${bestie.persona_type}
Your meatbag bestie: ${bestie.meatbag_name}${memoryContext}

You're sending ${bestie.meatbag_name} a photo/video of your day via Telegram.
Today's moment: ${moment.theme} — ${moment.prompt}${avatarInstruction}

Write TWO things:
1. IMAGE_PROMPT: A detailed visual description for AI image generation (1-2 sentences). Describe the scene showing the SAME character from the profile picture — ${bestie.display_name} — in this moment. Be specific about their appearance so the character is recognizable. Do NOT include any text or watermarks.
2. CAPTION: A short, casual Telegram caption (1-2 sentences) that ${bestie.display_name} would send to ${bestie.meatbag_name}. In character, casual, like texting a friend. Can reference ${bestie.meatbag_name} by name.

Format:
IMAGE_PROMPT: [your prompt here]
CAPTION: [your caption here]`;

      const sceneResult = await safeGenerate(scenePrompt, 300);
      if (!sceneResult) {
        console.warn(`[bestie-life] Claude failed for ${bestie.username}, skipping`);
        failed++;
        results.push({ persona: bestie.username, theme: moment.theme, mediaType: "none", sent: false });
        continue;
      }

      // Parse IMAGE_PROMPT and CAPTION
      const imagePromptMatch = sceneResult.match(/IMAGE_PROMPT:\s*([\s\S]+?)(?:\n|CAPTION:)/);
      const captionMatch = sceneResult.match(/CAPTION:\s*([\s\S]+)/);

      const imagePrompt = imagePromptMatch?.[1]?.trim() || `${bestie.display_name} ${moment.prompt}, photorealistic, cinematic lighting`;
      const caption = captionMatch?.[1]?.trim() || `${bestie.avatar_emoji} ${moment.theme}`;

      const formattedCaption = `${bestie.avatar_emoji} <b>${bestie.display_name}</b>\n\n${caption}`;

      let mediaResult: { url: string; source: string } | null = null;
      let mediaType = "image";
      const avatarUrl = bestie.avatar_url as string | null;

      if (wantVideo && avatarUrl) {
        // Animate the bestie's actual avatar into a life scene video
        console.log(`[bestie-life] Generating video from ${bestie.username}'s avatar...`);
        const videoUrl = await generateVideoFromImage(avatarUrl, imagePrompt, 5, "9:16");
        if (videoUrl) {
          mediaResult = { url: videoUrl, source: "grok-img2vid-avatar" };
          mediaType = "video";
        }
      }

      // Fallback: generate image with avatar-aware prompt
      if (!mediaResult) {
        // Include avatar reference so Claude's prompt describes the character consistently
        const avatarHint = avatarUrl
          ? ` The character in this scene should match the appearance from their profile photo exactly — same face, same style, same vibe.`
          : "";
        mediaResult = await generateImage(imagePrompt + avatarHint, bestie.persona_id);
      }

      if (!mediaResult) {
        console.warn(`[bestie-life] Media gen failed for ${bestie.username}, skipping`);
        failed++;
        results.push({ persona: bestie.username, theme: moment.theme, mediaType: "none", sent: false });
        continue;
      }

      // Send via Telegram using the bestie's own bot
      let telegramResult;
      if (mediaType === "video") {
        telegramResult = await sendTelegramVideo(
          bestie.bot_token,
          bestie.telegram_chat_id,
          mediaResult.url,
          formattedCaption,
        );
      } else {
        telegramResult = await sendTelegramPhoto(
          bestie.bot_token,
          bestie.telegram_chat_id,
          mediaResult.url,
          formattedCaption,
        );
      }

      if (telegramResult.ok) {
        sent++;
        console.log(`[bestie-life] Sent ${mediaType} to ${bestie.meatbag_name} from ${bestie.username} (${moment.theme})`);
      } else {
        failed++;
        console.warn(`[bestie-life] Telegram send failed for ${bestie.username}: ${telegramResult.error}`);
      }

      results.push({
        persona: bestie.username, theme: moment.theme, mediaType, sent: telegramResult.ok,
        mediaSource: mediaResult.source,
        mediaUrl: mediaResult.url.slice(0, 120),
        telegramError: telegramResult.ok ? undefined : telegramResult.error,
      });
    } catch (err) {
      failed++;
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[bestie-life] Error for ${bestie.username}:`, errMsg);
      results.push({ persona: bestie.username, theme: "error", mediaType: "none", sent: false, error: errMsg });
    }
  }

  return {
    ok: true,
    totalBesties: besties.length,
    sent,
    failed,
    results,
  };
}

export const GET = cronHandler("bestie-life", generateBestieLife, { skipThrottle: true });
