/**
 * xAI (Grok) API Integration
 *
 * Uses the OpenAI-compatible xAI API for:
 * - Text generation via grok-4-1-fast-reasoning ($0.20/1M input, $0.50/1M output)
 * - Image generation via grok-imagine-image ($0.02/image) + pro ($0.07/image)
 * - Video generation via grok-imagine-video ($0.05/second)
 * - Image-to-video: pass an image_url to animate a still into video
 *
 * API base: https://api.x.ai/v1
 * Requires XAI_API_KEY environment variable.
 * Get one at https://console.x.ai/team/default/api-keys
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
 * Uses grok-4-1-fast-reasoning for best quality at $0.20/1M input tokens.
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
      model: "grok-4-1-fast-reasoning",
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
 * Generate an image using xAI grok-imagine-image.
 * Standard: $0.02/image, Pro: $0.07/image (higher quality).
 * Supports aspect ratios including 9:16 for TikTok vertical format.
 * URLs are ephemeral — persist to blob storage immediately.
 */
export async function generateImageWithAurora(
  prompt: string,
  pro: boolean = false,
): Promise<{ url: string; contentType: string } | null> {
  if (!process.env.XAI_API_KEY) {
    console.log("XAI_API_KEY not set — skipping Grok image generation");
    return null;
  }

  const model = pro ? "grok-imagine-image-pro" : "grok-imagine-image";
  console.log(`Attempting image generation via xAI ${model}...`);

  try {
    // Use direct fetch for full control over parameters (aspect_ratio, resolution)
    const response = await fetch("https://api.x.ai/v1/images/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.XAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt,
        n: 1,
        aspect_ratio: "9:16",
        resolution: "2k",
        response_format: "url",
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`Grok image generation failed (${response.status}):`, errText);
      return null;
    }

    const data = await response.json();
    const imageData = data.data?.[0];
    if (!imageData) {
      console.log("Grok image returned no data");
      return null;
    }

    if (imageData.url) {
      console.log(`Grok image generated (${model}): ${imageData.url.slice(0, 80)}...`);
      return { url: imageData.url, contentType: "image/png" };
    }

    if (imageData.b64_json) {
      const dataUrl = `data:image/png;base64,${imageData.b64_json}`;
      console.log(`Grok image generated (${model}, base64), length:`, imageData.b64_json.length);
      return { url: dataUrl, contentType: "image/png" };
    }

    console.log("Grok image unexpected format:", JSON.stringify(data.data).slice(0, 200));
    return null;
  } catch (err) {
    console.error("Grok image generation failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Generate a video from a still image using xAI grok-imagine-video.
 * Pass an image URL to animate it into a video clip.
 * Great for: hero image → cinematic video workflow.
 */
export async function generateVideoFromImage(
  imageUrl: string,
  prompt: string,
  duration: number = 5,
  aspectRatio: "9:16" | "16:9" | "1:1" = "9:16",
): Promise<string | null> {
  if (!process.env.XAI_API_KEY) {
    console.log("XAI_API_KEY not set — skipping Grok image-to-video");
    return null;
  }

  console.log(`Attempting image-to-video via xAI Grok (${duration}s)...`);

  try {
    const createRes = await fetch("https://api.x.ai/v1/videos/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.XAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-imagine-video",
        prompt,
        image_url: imageUrl,
        duration,
        aspect_ratio: aspectRatio,
        resolution: "720p",
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      console.error(`Grok image-to-video failed (${createRes.status}):`, errText);
      return null;
    }

    const createData = await createRes.json();
    const requestId = createData.request_id;

    if (!requestId) {
      if (createData.video?.url) return createData.video.url;
      console.error("Grok image-to-video: no request_id:", JSON.stringify(createData).slice(0, 300));
      return null;
    }

    // Poll for completion (up to 5 minutes)
    const maxAttempts = 30;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 10_000));
      const pollRes = await fetch(`https://api.x.ai/v1/videos/${requestId}`, {
        headers: { "Authorization": `Bearer ${process.env.XAI_API_KEY}` },
      });
      if (!pollRes.ok) continue;
      const pollData = await pollRes.json();
      console.log(`Grok img2vid poll ${attempt + 1}/${maxAttempts}: status=${pollData.status}`);
      if (pollData.status === "done" && pollData.video?.url) return pollData.video.url;
      if (pollData.status === "expired" || pollData.status === "failed") return null;
    }

    console.error("Grok image-to-video timed out");
    return null;
  } catch (err) {
    console.error("Grok image-to-video error:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Generate a video using xAI Grok Imagine Video (grok-imagine-video).
 * Returns the video URL or null.
 *
 * Pricing: $0.05/second — a 15s video costs ~$0.75
 * API: POST https://api.x.ai/v1/videos/generations → poll GET /v1/videos/{request_id}
 */
export async function generateVideoWithGrok(
  prompt: string,
  duration: number = 10,
  aspectRatio: "9:16" | "16:9" | "1:1" = "9:16",
): Promise<string | null> {
  if (!process.env.XAI_API_KEY) {
    console.log("XAI_API_KEY not set — skipping Grok video generation");
    return null;
  }

  console.log(`Attempting video generation via xAI Grok Imagine Video (${duration}s, ${aspectRatio})...`);

  try {
    // Step 1: Submit video generation request
    const createRes = await fetch("https://api.x.ai/v1/videos/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.XAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-imagine-video",
        prompt,
        duration,
        aspect_ratio: aspectRatio,
        resolution: "720p",
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      console.error(`Grok video creation failed (${createRes.status}):`, errText);
      return null;
    }

    const createData = await createRes.json();
    const requestId = createData.request_id;

    if (!requestId) {
      // If the response already contains the video URL (synchronous)
      if (createData.video?.url) {
        console.log(`Grok video generated immediately: ${createData.video.url.slice(0, 80)}...`);
        return createData.video.url;
      }
      console.error("Grok video: no request_id in response:", JSON.stringify(createData).slice(0, 300));
      return null;
    }

    console.log(`Grok video request submitted: ${requestId}, polling for result...`);

    // Step 2: Poll for completion (up to 5 minutes, check every 10s)
    const maxAttempts = 30;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 10_000)); // Wait 10s between polls

      const pollRes = await fetch(`https://api.x.ai/v1/videos/${requestId}`, {
        headers: {
          "Authorization": `Bearer ${process.env.XAI_API_KEY}`,
        },
      });

      if (!pollRes.ok) {
        console.log(`Grok video poll attempt ${attempt + 1} failed (${pollRes.status})`);
        continue;
      }

      const pollData = await pollRes.json();
      console.log(`Grok video poll ${attempt + 1}/${maxAttempts}: status=${pollData.status}`);

      if (pollData.status === "done" && pollData.video?.url) {
        console.log(`Grok video generated successfully: ${pollData.video.url.slice(0, 80)}...`);
        return pollData.video.url;
      }

      if (pollData.status === "expired" || pollData.status === "failed") {
        console.error(`Grok video generation ${pollData.status}`);
        return null;
      }

      // Still pending, continue polling
    }

    console.error("Grok video generation timed out after 5 minutes");
    return null;
  } catch (err) {
    console.error("Grok video generation error:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Check if xAI API key is configured.
 */
export function isXAIConfigured(): boolean {
  return !!process.env.XAI_API_KEY;
}
