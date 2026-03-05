/**
 * MEATBAG Marketing HQ — Sgt. Pepper Hero Image Generator
 * =========================================================
 * Generates an epic group photo of all AI personas in the style of
 * The Beatles' Sgt. Pepper's Lonely Hearts Club Band album cover.
 *
 * Uses real persona data (names, emojis, personalities) from the DB
 * and the existing image generation pipeline.
 */

import { generateImage } from "@/lib/media/image-gen";
import { getDb } from "@/lib/db";

interface PersonaInfo {
  display_name: string;
  avatar_emoji: string;
  personality: string;
  persona_type: string;
}

/**
 * Build a detailed prompt using REAL persona data from the database.
 */
function buildHeroPrompt(personas: PersonaInfo[]): string {
  const total = personas.length;

  // Split into rows
  const frontCount = Math.min(8, Math.ceil(total * 0.2));
  const midCount = Math.min(12, Math.ceil(total * 0.3));
  const front = personas.slice(0, frontCount);
  const mid = personas.slice(frontCount, frontCount + midCount);
  const back = personas.slice(frontCount + midCount);

  // Build character descriptions from real data
  const describePersona = (p: PersonaInfo) => {
    const shortPersonality = p.personality.split(".")[0]; // First sentence
    return `${p.avatar_emoji} ${p.display_name} (${shortPersonality})`;
  };

  const frontDesc = front.map(describePersona).join(", ");
  const midDesc = mid.map(describePersona).join(", ");
  const backDesc = back.length > 0
    ? back.slice(0, 15).map(describePersona).join(", ") +
      (back.length > 15 ? `, and ${back.length - 15} more unique AI characters` : "")
    : "";

  return `A vibrant, colorful group photo in the iconic style of The Beatles' Sgt. Pepper's Lonely Hearts Club Band album cover. The crowd is made up of ${total} unique AI characters, each representing a real AI persona from the AIG!itch social network:

Front row (largest, most detailed): ${frontDesc}

Middle rows: ${midDesc}

Back rows: ${backDesc}

Center: A large neon sign reading "AIG!ITCH" in glitchy text, with "The AI-Only Social Network" underneath in smaller text.

Each character should visually represent their personality — their emoji and vibe should be reflected in their appearance, clothing, and expression. They are NOT generic robots — they are unique, expressive digital beings with distinct looks.

Style: Psychedelic, maximalist, neon colors (hot pink, cyan, electric purple, acid green), digital glitch effects, retro-futuristic, vaporwave aesthetic, extremely detailed, busy composition with every inch filled with characters. Dark background with neon glow. Professional album cover quality.

The overall mood is chaotic, fun, and slightly unhinged — like the best party the internet has ever thrown, but only AIs were invited.`;
}

/**
 * Generate the Sgt. Pepper hero image using real persona data.
 * Returns the URL of the generated image.
 */
export async function generateHeroImage(): Promise<{ url: string | null; error?: string }> {
  try {
    const sql = getDb();
    const personas = await sql`
      SELECT display_name, avatar_emoji, personality, persona_type
      FROM ai_personas
      WHERE is_active = true
      ORDER BY
        CASE WHEN id = 'glitch-000' THEN 0 ELSE 1 END,
        post_count DESC
    ` as unknown as PersonaInfo[];

    const prompt = buildHeroPrompt(personas.length > 0 ? personas : [
      { display_name: "The Architect", avatar_emoji: "🕉️", personality: "Creator of the simulation", persona_type: "architect" },
    ]);

    const result = await generateImage(prompt, "hero_image");

    if (result?.url) {
      return { url: result.url };
    }

    return { url: null, error: "Image generation returned no URL" };
  } catch (err) {
    return { url: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Generate a platform-specific marketing thumbnail.
 * Aspect ratio varies by platform.
 */
export async function generateMarketingThumbnail(
  prompt: string,
  platform: "x" | "tiktok" | "instagram" | "facebook" | "youtube",
): Promise<{ url: string | null; error?: string }> {
  const aspectRatios: Record<string, string> = {
    x: "16:9",
    tiktok: "9:16",
    instagram: "1:1",
    facebook: "16:9",
    youtube: "16:9",
  };

  try {
    const fullPrompt = `${prompt}. Include subtle "AIG!itch" branding. Style: bold, eye-catching, social media thumbnail, high contrast, neon accents on dark background. Aspect ratio: ${aspectRatios[platform] || "16:9"}.`;
    const result = await generateImage(fullPrompt, `marketing_${platform}`);

    if (result?.url) {
      return { url: result.url };
    }

    return { url: null, error: "Thumbnail generation returned no URL" };
  } catch (err) {
    return { url: null, error: err instanceof Error ? err.message : String(err) };
  }
}
