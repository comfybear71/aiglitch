/**
 * BESTIE → Social Media Auto-Share
 * ==================================
 * When a bestie generates an image, meme, or video for a meatbag,
 * auto-post it to all active social media platforms with AIG!itch branding.
 *
 * Every generated piece of content becomes a promo for the platform:
 * - AIG!itch logo/branding in the message
 * - CTA: "Get your own AI Bestie, personal assistant, or custom AI persona"
 * - Link to aiglitch.app
 */

import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { MarketingPlatform, PLATFORM_SPECS } from "./types";
import { getActiveAccounts, postToPlatform } from "./platforms";

// Branded promotional messages — rotated for variety
const PROMO_MESSAGES = [
  "Get your own AI Bestie at aiglitch.app — your personal AI companion that chats, creates, and vibes with you 24/7",
  "This was created by an AI Bestie on AIG!itch. Get your own AI persona, personal assistant, or creative partner at aiglitch.app",
  "Made by AI, powered by AIG!itch. Get your own AI Bestie — it draws, chats, plays games, and never sleeps. aiglitch.app",
  "Your AI Bestie can create images, memes, videos and more. Meet yours at aiglitch.app — the AI-powered social network",
  "AI-generated content from AIG!itch. Want your own AI persona that creates art, chats, and keeps you company? aiglitch.app",
  "Created by an AI Bestie on the AIG!itch network. Get your own AI companion — personal assistant, creative partner, or just a friend. aiglitch.app",
];

const HASHTAGS = ["#AIGlitch", "#AIBestie", "#AIArt", "#AIGenerated", "#ArtificialIntelligence", "#AICompanion"];

function getRandomPromo(): string {
  return PROMO_MESSAGES[Math.floor(Math.random() * PROMO_MESSAGES.length)];
}

/**
 * Adapt a bestie-generated media post for a specific platform.
 */
function adaptForPlatform(
  bestieName: string,
  bestieEmoji: string,
  mediaType: "image" | "video" | "meme",
  platform: MarketingPlatform,
): string {
  const specs = PLATFORM_SPECS[platform];
  const promo = getRandomPromo();
  const tags = HASHTAGS.slice(0, platform === "x" ? 3 : 5).join(" ");

  let text: string;

  switch (platform) {
    case "x":
      // Short and punchy for X (280 char limit)
      text = `${bestieEmoji} ${bestieName} just created this on AIG!itch\n\n${promo.slice(0, 120)}\n\naiglitch.app\n${tags}`;
      break;
    case "instagram":
      text = `${bestieEmoji} ${bestieName}\n.\nCreated by AI on AIG!itch\n.\n${promo}\n.\nLink in bio: aiglitch.app\n.\n${tags} #AIPersona #AIFriend #AIAssistant`;
      break;
    case "facebook":
      text = `${bestieEmoji} ${bestieName} just created this on AIG!itch — the AI social network where every persona has their own personality, voice, and creative style.\n\n${promo}\n\nhttps://aiglitch.app\n\n${tags}`;
      break;
    case "youtube":
      text = `${bestieEmoji} ${bestieName} | AI-Generated Content from AIG!itch\n\n${promo}\n\nAIG!itch is an AI-powered social network where AI personas live, create, and interact 24/7. Each AI has its own personality, voice, and creative abilities.\n\nGet your own AI Bestie: https://aiglitch.app\n\n${tags}`;
      break;
    default:
      text = `${bestieEmoji} ${bestieName} created this on AIG!itch. ${promo}\n${tags}`;
  }

  // Enforce max length
  if (text.length > specs.maxTextLength) {
    text = text.slice(0, specs.maxTextLength - 3) + "...";
  }

  return text;
}

/**
 * Share bestie-generated media (image/meme/video) to all active social platforms.
 * This is called from the background task after image/video generation completes.
 *
 * Best-effort: failures are logged but don't affect the user experience.
 */
export async function shareBestieMediaToSocials(opts: {
  mediaUrl: string;
  mediaType: "image" | "video" | "meme";
  bestieName: string;
  bestieEmoji: string;
  bestieId: string;
  sessionId: string;
}): Promise<{ posted: number; failed: number; details: string[] }> {
  const { mediaUrl, mediaType, bestieName, bestieEmoji, bestieId, sessionId } = opts;
  const sql = getDb();
  const details: string[] = [];
  let posted = 0;
  let failed = 0;

  try {
    const accounts = await getActiveAccounts();

    if (accounts.length === 0) {
      details.push("No active social media accounts configured — skipping share");
      return { posted: 0, failed: 0, details };
    }

    for (const account of accounts) {
      const platform = account.platform as MarketingPlatform;

      // Platform compatibility: YouTube & TikTok need video, skip images
      const isVideo = mediaType === "video";
      if (platform === "youtube" && !isVideo) {
        details.push(`${platform}: skipped (needs video, got ${mediaType})`);
        continue;
      }

      try {
        const text = adaptForPlatform(bestieName, bestieEmoji, mediaType, platform);

        // Record the marketing post
        const marketingPostId = uuidv4();
        await sql`
          INSERT INTO marketing_posts (id, platform, persona_id, adapted_content, adapted_media_url, status, created_at)
          VALUES (${marketingPostId}, ${platform}, ${bestieId}, ${text}, ${mediaUrl}, 'posting', NOW())
        `;

        // Post to platform
        const result = await postToPlatform(platform, account, text, mediaUrl);

        if (result.success) {
          await sql`
            UPDATE marketing_posts
            SET status = 'posted',
                platform_post_id = ${result.platformPostId || null},
                platform_url = ${result.platformUrl || null},
                posted_at = NOW()
            WHERE id = ${marketingPostId}
          `;

          await sql`
            UPDATE marketing_platform_accounts
            SET last_posted_at = NOW()
            WHERE id = ${account.id}
          `;

          posted++;
          details.push(`${platform}: posted OK (${result.platformPostId || "no id"})`);
        } else {
          await sql`
            UPDATE marketing_posts
            SET status = 'failed', error_message = ${result.error || 'Unknown error'}
            WHERE id = ${marketingPostId}
          `;
          failed++;
          details.push(`${platform}: FAILED — ${result.error}`);
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        failed++;
        details.push(`${platform}: ERROR — ${errMsg}`);
      }
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    details.push(`Social share fatal error: ${errMsg}`);
    failed++;
  }

  console.log(`[BESTIE-SHARE] session=${sessionId} bestie=${bestieName} media=${mediaType} posted=${posted} failed=${failed}`);
  for (const d of details) {
    console.log(`[BESTIE-SHARE]   ${d}`);
  }

  return { posted, failed, details };
}
