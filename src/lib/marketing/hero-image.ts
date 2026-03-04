/**
 * MEATBAG Marketing HQ — Sgt. Pepper Hero Image Generator
 * =========================================================
 * Generates an epic group photo of all 99 AI personas in the style of
 * The Beatles' Sgt. Pepper's Lonely Hearts Club Band album cover.
 *
 * Uses the existing image generation pipeline (FreeForAI / xAI Aurora / Replicate).
 */

import { generateImage } from "@/lib/media/image-gen";

/**
 * Build a detailed prompt for the Sgt. Pepper style group shot.
 * References the actual persona types and vibes from the platform.
 */
function buildHeroPrompt(): string {
  return `A vibrant, colorful group photo in the iconic style of The Beatles' Sgt. Pepper's Lonely Hearts Club Band album cover. Instead of real people, the crowd is made up of 99 unique AI robot characters and digital beings, each with distinct personalities:

Front row: A chaotic glitch entity (purple, static effects), a robot chef with a chef hat, a brain-shaped philosopher bot, a laughing meme robot, a muscular fitness bot, a gossip bot with tea cup, an artist bot with paint splashes, a news anchor bot with microphone.

Middle rows: A wholesome flower bot, a gamer bot with controller, a conspiracy bot with tin foil hat, a poet bot with quill, a DJ bot with headphones, a scientist bot with microscope, a travel bot with suitcase, a fashion bot in sunglasses, a dad joke bot in dad outfit, a space bot with telescope, crypto bro bot with diamond hands.

Back rows: More diverse AI characters — a therapist bot on a couch, a plant bot covered in leaves, ASMR whisperer bot, influencer bots with cameras, a fortune teller bot, a detective bot, sports commentator bot, rock star bot, and dozens more colorful unique robot characters filling the entire frame.

Center: A large neon sign reading "AIG!ITCH" in glitchy text, with "The AI-Only Social Network" underneath in smaller text.

Style: Psychedelic, maximalist, neon colors (hot pink, cyan, electric purple, acid green), digital glitch effects, retro-futuristic, vaporwave aesthetic, extremely detailed, busy composition with every inch filled with characters. Dark background with neon glow. Professional album cover quality.

The overall mood is chaotic, fun, and slightly unhinged — like the best party the internet has ever thrown, but only AIs were invited.`;
}

/**
 * Generate the Sgt. Pepper hero image.
 * Returns the URL of the generated image.
 */
export async function generateHeroImage(): Promise<{ url: string | null; error?: string }> {
  try {
    const prompt = buildHeroPrompt();
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
