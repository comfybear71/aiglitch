/**
 * Free AI Image Generation
 *
 * Three free/cheap providers in priority order:
 * 1. FreeForAI (free, no auth, FLUX.1-Dev model) — easiest, most reliable
 * 2. Perchance (free, needs userKey) — good quality, but key fetching can fail
 * 3. Raphael Z-Image (paid $0.0036, needs API key) — cheap backup
 */

const FREEFORAI_BASE = "https://data.aizdzj.com/draw";
const PERCHANCE_BASE = "https://image-generation.perchance.org/api";

// ============================================================
// FreeForAI (FLUX.1-Dev) — FREE, no auth, no signup
// ============================================================

/**
 * Generate an image using FreeForAI (100% free, FLUX.1-Dev model).
 * No API key, no signup, no authentication needed.
 *
 * Flow: POST prompt → get task_id → poll until SUCCEEDED → get image URL
 *
 * @param prompt - Text description of the image
 * @param aspectRatio - "9:16" for portrait, "1:1" for square, "16:9" for landscape
 * @returns Image URL string or null if generation failed
 */
export async function generateWithFreeForAI(
  prompt: string,
  aspectRatio: "9:16" | "1:1" | "16:9" = "9:16",
): Promise<string | null> {
  console.log("Attempting free image generation via FreeForAI (FLUX.1-Dev)...");

  const sizeMap: Record<string, string> = {
    "9:16": "512*1024",
    "1:1": "1024*1024",
    "16:9": "1024*576",
  };
  const size = sizeMap[aspectRatio] || "512*1024";

  try {
    // Step 1: Submit generation task
    const submitRes = await fetch(`${FREEFORAI_BASE}/text2image.php`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        prompt,
        size,
        model: "flux-dev",
      }),
    });

    if (!submitRes.ok) {
      console.log(`FreeForAI submit failed: HTTP ${submitRes.status}`);
      return null;
    }

    const submitData = await submitRes.json();
    if (!submitData.task_id) {
      console.log("FreeForAI returned no task_id:", JSON.stringify(submitData).slice(0, 200));
      return null;
    }

    console.log(`FreeForAI task submitted: ${submitData.task_id}`);

    // Step 2: Poll for completion (max ~60s with backoff)
    let delay = 2000;
    const maxAttempts = 15;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(r => setTimeout(r, delay));

      const pollRes = await fetch(`${FREEFORAI_BASE}/text2image.php`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ task_id: submitData.task_id }),
      });

      if (!pollRes.ok) {
        console.log(`FreeForAI poll failed: HTTP ${pollRes.status}`);
        continue;
      }

      const pollData = await pollRes.json();
      console.log(`FreeForAI poll #${attempt + 1}: ${pollData.task_status}`);

      if (pollData.task_status === "SUCCEEDED" && pollData.url) {
        console.log(`FreeForAI image ready: ${pollData.url.slice(0, 80)}...`);
        return pollData.url;
      }

      if (pollData.task_status === "FAILED") {
        console.log("FreeForAI task failed:", JSON.stringify(pollData).slice(0, 200));
        return null;
      }

      // Increase delay up to 5s
      delay = Math.min(delay * 1.3, 5000);
    }

    console.log("FreeForAI: Timed out waiting for image generation");
    return null;
  } catch (err) {
    console.log("FreeForAI error:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ============================================================
// Perchance (Stable Diffusion) — FREE, needs userKey from verification
// ============================================================

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


// ============================================================
// Raphael Z-Image Turbo (via EvoLink API) — $0.0036/image
// ============================================================

/**
 * Generate an image using Raphael's Z-Image Turbo API ($0.0036/call).
 * Requires RAPHAEL_API_KEY environment variable (from evolink.ai).
 *
 * Uses the async task-based API: submit task → poll for result → download.
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
    // Step 1: Submit generation task
    const sizeStr = width === height ? "1:1" : width > height ? "16:9" : "9:16";
    const createRes = await fetch("https://api.evolink.ai/v1/images/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "z-image-turbo",
        prompt,
        size: sizeStr,
        seed: Math.floor(Math.random() * 2147483647),
      }),
    });

    if (!createRes.ok) {
      const text = await createRes.text().catch(() => "");
      console.log(`Raphael API submit failed: HTTP ${createRes.status} — ${text.slice(0, 200)}`);
      return null;
    }

    const task = await createRes.json();
    if (!task.id) {
      console.log("Raphael returned no task id:", JSON.stringify(task).slice(0, 200));
      return null;
    }

    console.log(`Raphael task submitted: ${task.id}`);

    // Step 2: Poll for completion (max ~30s)
    let delay = 1000;
    const maxAttempts = 12;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(r => setTimeout(r, delay));

      const pollRes = await fetch(`https://api.evolink.ai/v1/tasks/${task.id}`, {
        headers: { "Authorization": `Bearer ${apiKey}` },
      });

      if (!pollRes.ok) {
        console.log(`Raphael poll failed: HTTP ${pollRes.status}`);
        continue;
      }

      const result = await pollRes.json();
      console.log(`Raphael poll #${attempt + 1}: status=${result.status}`);

      if (result.status === "completed" && result.results?.length > 0) {
        // Download the image from the result URL
        const imageUrl = result.results[0];
        const imgRes = await fetch(typeof imageUrl === "string" ? imageUrl : imageUrl.url);
        if (!imgRes.ok) {
          console.log(`Raphael image download failed: HTTP ${imgRes.status}`);
          return null;
        }

        const buffer = Buffer.from(await imgRes.arrayBuffer());
        const contentType = imgRes.headers.get("content-type") || "image/png";
        console.log(`Raphael image downloaded: ${(buffer.length / 1024).toFixed(1)}KB`);
        return { buffer, contentType };
      }

      if (result.status === "failed") {
        console.log("Raphael task failed:", JSON.stringify(result).slice(0, 200));
        return null;
      }

      delay = Math.min(delay * 1.5, 4000);
    }

    console.log("Raphael: Timed out waiting for generation");
    return null;
  } catch (err) {
    console.log("Raphael generation error:", err instanceof Error ? err.message : err);
    return null;
  }
}
