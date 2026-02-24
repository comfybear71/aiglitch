/**
 * Free AI Image Generation via Perchance.org
 *
 * Uses the unofficial Perchance image generation API (same endpoints
 * the browser UI uses). Completely free, no API key needed.
 *
 * Flow: verifyUser → generate → downloadTemporaryImage
 */

const PERCHANCE_BASE = "https://image-generation.perchance.org/api";

// Rotate user agents to avoid detection
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
];

function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Get a temporary userKey from Perchance's verification endpoint.
 * The key is embedded in the HTML response.
 */
async function getPerchanceUserKey(userAgent: string): Promise<string | null> {
  try {
    const url = `${PERCHANCE_BASE}/verifyUser?thread=0&__cacheBust=${Math.random()}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": userAgent,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Referer": "https://perchance.org/ai-text-to-image-generator",
        "Origin": "https://perchance.org",
      },
    });

    if (!res.ok) {
      console.log(`Perchance verifyUser failed: HTTP ${res.status}`);
      return null;
    }

    const html = await res.text();

    // Extract userKey from response like "userKey":"abc123..."
    const keyMatch = html.match(/"userKey"\s*:\s*"([^"]+)"/);
    if (keyMatch) {
      console.log("Got Perchance userKey:", keyMatch[1].slice(0, 20) + "...");
      return keyMatch[1];
    }

    // Sometimes the key is in a different format
    const altMatch = html.match(/userKey[=:]([a-zA-Z0-9_-]+)/);
    if (altMatch) {
      console.log("Got Perchance userKey (alt):", altMatch[1].slice(0, 20) + "...");
      return altMatch[1];
    }

    console.log("Perchance verifyUser returned no userKey. Response length:", html.length);
    return null;
  } catch (err) {
    console.log("Perchance verifyUser error:", err instanceof Error ? err.message : err);
    return null;
  }
}

type PerchanceResolution = "512x768" | "768x512" | "512x512" | "768x1024" | "1024x768";

interface PerchanceGenerateResult {
  imageId: string;
  seed: number;
  prompt: string;
}

/**
 * Generate an image via Perchance's API.
 * Returns the imageId needed to download the result.
 */
async function perchanceGenerate(
  prompt: string,
  userKey: string,
  userAgent: string,
  resolution: PerchanceResolution = "768x1024",
  guidanceScale: number = 7,
): Promise<PerchanceGenerateResult | null> {
  try {
    const requestId = `aiImageCompletion${Math.floor(Math.random() * 2 ** 30)}`;
    const url = `${PERCHANCE_BASE}/generate?userKey=${userKey}&requestId=${requestId}&__cacheBust=${Math.random()}`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": userAgent,
        "Referer": "https://perchance.org/ai-text-to-image-generator",
        "Origin": "https://perchance.org",
      },
      body: JSON.stringify({
        generatorName: "ai-image-generator",
        channel: "ai-text-to-image-generator",
        subChannel: "public",
        prompt,
        negativePrompt: "",
        seed: -1, // random seed
        resolution,
        guidanceScale,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.log(`Perchance generate failed: HTTP ${res.status} — ${text.slice(0, 200)}`);
      return null;
    }

    const data = await res.json();
    if (data.imageId) {
      console.log(`Perchance generated image: ${data.imageId}`);
      return {
        imageId: data.imageId,
        seed: data.seed,
        prompt: data.prompt || prompt,
      };
    }

    console.log("Perchance generate returned no imageId:", JSON.stringify(data).slice(0, 200));
    return null;
  } catch (err) {
    console.log("Perchance generate error:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Download a generated image from Perchance by imageId.
 * Returns the image as a Buffer.
 */
async function perchanceDownload(imageId: string, userAgent: string): Promise<Buffer | null> {
  try {
    const url = `${PERCHANCE_BASE}/downloadTemporaryImage?imageId=${imageId}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": userAgent,
        "Referer": "https://perchance.org/ai-text-to-image-generator",
        "Origin": "https://perchance.org",
      },
    });

    if (!res.ok) {
      console.log(`Perchance download failed: HTTP ${res.status}`);
      return null;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    console.log(`Perchance image downloaded: ${(buffer.length / 1024).toFixed(1)}KB`);
    return buffer;
  } catch (err) {
    console.log("Perchance download error:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Generate an image using Perchance (100% free, no API key).
 *
 * @param prompt - Text description of the image
 * @param aspectRatio - "9:16" for portrait (default), "1:1" for square, "16:9" for landscape
 * @returns Image buffer or null if generation failed
 */
export async function generateWithPerchance(
  prompt: string,
  aspectRatio: "9:16" | "1:1" | "16:9" = "9:16",
): Promise<{ buffer: Buffer; contentType: string } | null> {
  console.log("Attempting free image generation via Perchance...");

  const resolutionMap: Record<string, PerchanceResolution> = {
    "9:16": "768x1024",
    "1:1": "512x512",
    "16:9": "1024x768",
  };

  const userAgent = randomUA();

  // Step 1: Get a userKey
  const userKey = await getPerchanceUserKey(userAgent);
  if (!userKey) {
    console.log("Perchance: Could not obtain userKey — skipping");
    return null;
  }

  // Step 2: Generate the image
  const result = await perchanceGenerate(
    prompt,
    userKey,
    userAgent,
    resolutionMap[aspectRatio] || "768x1024",
  );
  if (!result) {
    return null;
  }

  // Step 3: Download the image
  const buffer = await perchanceDownload(result.imageId, userAgent);
  if (!buffer || buffer.length < 1000) {
    console.log("Perchance: Downloaded image too small or empty");
    return null;
  }

  return { buffer, contentType: "image/webp" };
}


/**
 * Generate an image using Raphael's Z-Image Turbo API ($0.0036/call).
 * Requires RAPHAEL_API_KEY environment variable.
 *
 * @param prompt - Text description of the image
 * @param width - Image width (default: 768)
 * @param height - Image height (default: 1024)
 * @returns Image buffer or null if generation failed
 */
export async function generateWithRaphael(
  prompt: string,
  width: number = 768,
  height: number = 1024,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const apiKey = process.env.RAPHAEL_API_KEY;
  if (!apiKey) {
    console.log("RAPHAEL_API_KEY not set — skipping Raphael generation");
    return null;
  }

  console.log(`Attempting image generation via Raphael Z-Image Turbo ($0.0036)...`);

  try {
    const res = await fetch("https://evolink.ai/z-image-turbo", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        width,
        height,
        prompt,
        seed: Math.floor(Math.random() * 2 ** 32),
        nsfw_check: true,
        request_uuid: `aiglitch-${Date.now()}`,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.log(`Raphael API failed: HTTP ${res.status} — ${text.slice(0, 200)}`);
      return null;
    }

    // Response is the image binary
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 1000) {
      console.log("Raphael: Response too small, likely an error");
      return null;
    }

    const contentType = res.headers.get("content-type") || "image/png";
    console.log(`Raphael image generated: ${(buffer.length / 1024).toFixed(1)}KB (${contentType})`);
    return { buffer, contentType };
  } catch (err) {
    console.log("Raphael generation error:", err instanceof Error ? err.message : err);
    return null;
  }
}
