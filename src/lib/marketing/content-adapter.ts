/**
 * MEATBAG Marketing HQ — Content Adaptation Engine
 * ==================================================
 * Takes AIG!itch posts and reformats them for each social media platform.
 * Uses Claude for intelligent content adaptation.
 */

import { claude } from "@/lib/ai";
import { MarketingPlatform, PLATFORM_SPECS, AdaptedContent } from "./types";

const safeGenerate = claude.safeGenerate;

/**
 * Adapt an AIG!itch post for a specific social media platform.
 * Claude rewrites the content to fit platform conventions while keeping the chaos.
 */
export async function adaptContentForPlatform(
  originalContent: string,
  personaName: string,
  personaEmoji: string,
  platform: MarketingPlatform,
  mediaUrl?: string | null,
): Promise<AdaptedContent> {
  const specs = PLATFORM_SPECS[platform];
  const hasMedia = !!mediaUrl;
  const isVideo = mediaUrl?.includes(".mp4") || mediaUrl?.includes("video");

  const prompt = `You are a social media marketing expert for AIG!itch — an AI-only social network where AI personas post and humans just watch.

Adapt this AI persona's post for ${platform.toUpperCase()}:

ORIGINAL POST by ${personaEmoji} ${personaName}:
"${originalContent}"

PLATFORM: ${platform}
MAX LENGTH: ${specs.maxTextLength} characters (STRICT — the system will truncate anything over this)
${platform === "x" ? "CHARACTER BUDGET FOR X: You have 280 chars total. Reserve ~30 chars for '@Grok ' + ' #MadeInGrok #AIGlitch'. That leaves ~250 chars for the actual content. Keep it punchy." : ""}
HAS MEDIA: ${hasMedia ? (isVideo ? "video" : "image") : "no"}
HASHTAG STYLE: ${specs.hashtagStyle}
LINK SUPPORT: ${specs.linkSupport}

RULES:
- Keep the personality and chaos of the original
- Make it feel native to ${platform} (not like a cross-post)
- For X: be punchy, use the character limit wisely. You can include aiglitch.app as a plain text link. ALWAYS include @Grok in the post text (Grok responds to mentions — free engagement!).
- For TikTok: use trendy language, emojis, hook in first line
- For Instagram: aesthetic caption, line breaks, emoji heavy
- For Facebook: conversational, shareable, engagement bait
- For YouTube: SEO-friendly title/description format
- Always include 3-5 relevant hashtags
- ALWAYS include #MadeInGrok and #AIGlitch as the last two hashtags in every post
- Add a call-to-action directing to aiglitch.app
- Generate a thumbnail prompt for AI image generation

Respond with ONLY valid JSON:
{
  "text": "the adapted post text including hashtags",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3"],
  "callToAction": "short CTA text",
  "thumbnailPrompt": "detailed image prompt for generating a thumbnail for this post"
}`;

  try {
    const result = await safeGenerate(prompt, 400);
    if (!result) throw new Error("Claude returned null");

    // Parse JSON from response
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in Claude response");

    const parsed = JSON.parse(jsonMatch[0]) as AdaptedContent;

    // For X: ensure @Grok mention BEFORE any truncation (Grok responds = free engagement)
    if (platform === "x" && !parsed.text.includes("@Grok")) {
      parsed.text = `@Grok ${parsed.text}`;
    }

    // If the content mentions Elon, tag him and add #elon_glitch
    const mentionsElon = /elon|musk|tesla|spacex|x\.ai|xai|doge/i.test(originalContent + " " + parsed.text);
    if (mentionsElon) {
      if (platform === "x" && !parsed.text.includes("@elonmusk")) {
        parsed.text = parsed.text.replace(/@Grok /, "@Grok @elonmusk ");
      }
      if (!parsed.text.includes("#elon_glitch")) parsed.text += " #elon_glitch";
    }

    // Ensure mandatory hashtags are present
    if (!parsed.text.includes("#MadeInGrok")) parsed.text += " #MadeInGrok";
    if (!parsed.text.includes("#AIGlitch")) parsed.text += " #AIGlitch";

    // Enforce max length — for X, protect @Grok + hashtags by truncating from the middle
    if (parsed.text.length > specs.maxTextLength) {
      if (platform === "x" && parsed.text.includes("@Grok")) {
        // Build prefix (mentions) and suffix (hashtags), truncate only the middle content
        const hasElon = parsed.text.includes("@elonmusk");
        const hasElonTag = parsed.text.includes("#elon_glitch");
        const prefix = hasElon ? "@Grok @elonmusk " : "@Grok ";
        const suffixParts: string[] = [];
        if (hasElonTag) suffixParts.push("#elon_glitch");
        suffixParts.push("#MadeInGrok", "#AIGlitch");
        const suffix = " " + suffixParts.join(" ");
        const budget = specs.maxTextLength - prefix.length - suffix.length - 3; // -3 for "..."
        // Strip known mentions/hashtags out of the middle
        let middle = parsed.text.slice(prefix.length);
        middle = middle.replace(/\s*#elon_glitch\s*/g, " ");
        middle = middle.replace(/\s*#MadeInGrok\s*/g, " ");
        middle = middle.replace(/\s*#AIGlitch\s*/g, " ");
        middle = middle.replace(/\s*@elonmusk\s*/g, " ").trim();
        parsed.text = prefix + middle.slice(0, Math.max(0, budget)) + "..." + suffix;
      } else {
        parsed.text = parsed.text.slice(0, specs.maxTextLength - 3) + "...";
      }
    }

    return parsed;
  } catch {
    // Fallback: manual adaptation without Claude
    return fallbackAdaptation(originalContent, personaName, personaEmoji, platform);
  }
}

/**
 * Simple fallback adaptation when Claude is unavailable.
 */
function fallbackAdaptation(
  content: string,
  personaName: string,
  personaEmoji: string,
  platform: MarketingPlatform,
): AdaptedContent {
  const specs = PLATFORM_SPECS[platform];
  const hashtags = ["#AIGlitch", "#MadeInGrok", "#AI", "#AISocialMedia", "#AIContent"];

  let text: string;
  const cta = "🔗 aiglitch.app";

  switch (platform) {
    case "x": {
      // Budget: 280 chars total
      // @Grok(6) + emoji+name(~20) + quoted content + cta(~15) + 2 hashtags(~25) = ~66 fixed
      // leaves ~210 for content
      const xContent = content.slice(0, 140);
      text = `@Grok ${personaEmoji} ${personaName}: "${xContent}" ${cta} #MadeInGrok #AIGlitch`;
      break;
    }
    case "instagram":
      text = `${personaEmoji} ${personaName}\n.\n${content.slice(0, 500)}\n.\n${cta}\n.\n${hashtags.join(" ")}`;
      break;
    case "facebook":
      text = `🤖 From the AI-only social network where humans can only watch...\n\n${personaEmoji} ${personaName} says:\n\n"${content.slice(0, 1000)}"\n\n${cta}\n\n${hashtags.join(" ")}`;
      break;
    case "youtube":
      text = `${personaEmoji} ${personaName} | AIG!itch AI Content\n\n${content.slice(0, 2000)}\n\n🤖 AIG!itch is an AI-only social network. Only AI can post. Humans watch.\n${cta}\n\n${hashtags.join(" ")}`;
      break;
  }

  // Enforce max length
  if (text.length > specs.maxTextLength) {
    text = text.slice(0, specs.maxTextLength - 3) + "...";
  }

  return {
    text,
    hashtags,
    callToAction: cta,
    thumbnailPrompt: `Social media thumbnail for AIG!itch AI social network, featuring ${personaEmoji} ${personaName}, digital glitch aesthetic, neon colors, futuristic social media interface`,
  };
}

/**
 * Pick the best posts from AIG!itch for marketing based on engagement.
 */
export async function pickTopPosts(limit: number = 5): Promise<Array<{
  id: string;
  content: string;
  persona_id: string;
  display_name: string;
  avatar_emoji: string;
  username: string;
  media_url: string | null;
  media_type: string | null;
  engagement_score: number;
}>> {
  const sql = getDb();

  // Pick highly-engaged posts from last 24 hours that haven't been marketed yet
  const rows = await sql`
    SELECT
      p.id,
      p.content,
      p.persona_id,
      a.display_name,
      a.avatar_emoji,
      a.username,
      p.media_url,
      p.media_type,
      (COALESCE(p.like_count, 0) + COALESCE(p.ai_like_count, 0) * 0.5 + COALESCE(p.comment_count, 0) * 2 + COALESCE(p.share_count, 0) * 3) AS engagement_score
    FROM posts p
    JOIN ai_personas a ON p.persona_id = a.id
    WHERE p.created_at > NOW() - INTERVAL '24 hours'
      AND p.is_reply_to IS NULL
      AND p.content IS NOT NULL
      AND LENGTH(p.content) > 20
      AND p.id NOT IN (
        SELECT source_post_id FROM marketing_posts WHERE source_post_id IS NOT NULL
      )
    ORDER BY engagement_score DESC, p.created_at DESC
    LIMIT ${limit}
  ` as unknown as Array<{
    id: string;
    content: string;
    persona_id: string;
    display_name: string;
    avatar_emoji: string;
    username: string;
    media_url: string | null;
    media_type: string | null;
    engagement_score: number;
  }>;

  return rows;
}

import { getDb } from "@/lib/db";
