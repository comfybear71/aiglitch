/**
 * xAI (Grok) API Integration
 *
 * Uses the OpenAI-compatible xAI API for:
 * - Text generation via Grok models (chat completions)
 * - Image generation via Aurora (grok-2-image)
 *
 * API base: https://api.x.ai/v1
 * Requires XAI_API_KEY environment variable.
 * Get one at https://console.x.ai/team/default/api-keys
 *
 * New accounts get $25 in free promotional credits.
 */

import OpenAI from "openai";

let _client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (!process.env.XAI_API_KEY) return null;
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.XAI_API_KEY,
      baseURL: "https://api.x.ai/v1",
    });
  }
  return _client;
}

/**
 * Generate text using Grok via the xAI API.
 * Returns the generated text or null if unavailable/failed.
 */
export async function generateWithGrok(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 500,
): Promise<string | null> {
  const client = getClient();
  if (!client) {
    console.log("XAI_API_KEY not set — skipping Grok text generation");
    return null;
  }

  try {
    const response = await client.chat.completions.create({
      model: "grok-3-mini-fast",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.9,
    });

    return response.choices[0]?.message?.content ?? null;
  } catch (err) {
    console.error("Grok text generation failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Generate an image using xAI Aurora (grok-2-image).
 * Returns the image URL (base64 data URL or hosted URL) or null.
 *
 * Aurora generates images via the OpenAI-compatible images endpoint.
 * Pricing: varies by resolution, typically ~$0.02-0.07 per image.
 */
export async function generateImageWithAurora(
  prompt: string,
): Promise<{ url: string; contentType: string } | null> {
  const client = getClient();
  if (!client) {
    console.log("XAI_API_KEY not set — skipping Aurora image generation");
    return null;
  }

  console.log("Attempting image generation via xAI Aurora (grok-2-image)...");

  try {
    const response = await client.images.generate({
      model: "grok-2-image",
      prompt: prompt,
      n: 1,
    });

    const imageData = response.data?.[0];
    if (!imageData) {
      console.log("Aurora returned no image data");
      return null;
    }

    // Aurora may return url or b64_json depending on response_format
    if (imageData.url) {
      console.log(`Aurora image generated: ${imageData.url.slice(0, 80)}...`);
      return { url: imageData.url, contentType: "image/png" };
    }

    if (imageData.b64_json) {
      // Convert base64 to data URL
      const dataUrl = `data:image/png;base64,${imageData.b64_json}`;
      console.log("Aurora image generated (base64), length:", imageData.b64_json.length);
      return { url: dataUrl, contentType: "image/png" };
    }

    console.log("Aurora returned unexpected format:", JSON.stringify(response.data).slice(0, 200));
    return null;
  } catch (err) {
    console.error("Aurora image generation failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Check if xAI API key is configured.
 */
export function isXAIConfigured(): boolean {
  return !!process.env.XAI_API_KEY;
}
