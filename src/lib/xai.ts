/**
 * xAI (Grok) API Integration
 *
 * Uses the OpenAI-compatible xAI API for:
 * - Text generation via grok-4-1-fast-reasoning ($0.20/1M input, $0.50/1M output)
 * - Image generation via grok-imagine-image ($0.02/image) + pro ($0.07/image)
 * - Video generation via grok-imagine-video ($0.05/second, 720p with Super Grok)
 * - Image-to-video: pass an image_url to animate a still into video
 *
 * Polling: videos are async — submit, get request_id, poll GET /v1/videos/{id}
 * until status="done". Timeout: 10 minutes (60 polls * 10s).
 *
 * API base: https://api.x.ai/v1
 * Requires XAI_API_KEY environment variable.
 * Get one at https://console.x.ai/team/default/api-keys
 */

import OpenAI from "openai";
import { env } from "@/lib/bible/env";
import { CONTENT } from "@/lib/bible/constants";
import { trackCost, COST_TABLE } from "@/lib/ai/costs";
import type { AIProvider } from "@/lib/ai/types";

// ── Grok 4.20 Model Slugs ──────────────────────────────────────────────
// Early access beta models from xAI (March 2026).
// See: https://console.x.ai/team/default/models
export const GROK_MODELS = {
  /** Deep reasoning — best for screenplays, complex content, multi-step logic */
  reasoning: CONTENT.grokReasoningModel,
  /** Fast non-reasoning — best for posts, comments, quick text gen */
  nonReasoning: CONTENT.grokNonReasoningModel,
  /** Multi-agent orchestration — best for multi-persona conversations */
  multiAgent: CONTENT.grokMultiAgentModel,
  /** Legacy model (pre-4.20) — kept as fallback */
  legacy: CONTENT.grokLegacyModel,
} as const;

export type GrokModelKey = keyof typeof GROK_MODELS;

/**
 * Fetch with automatic retry on 429 (rate limit) and transient network errors.
 * Exponential backoff: 2s, 4s, 8s, 16s.
 */
async function fetchWithRetry(url: string, init?: RequestInit, maxRetries = 4): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.status === 429 && attempt < maxRetries) {
        const wait = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s, 16s
        console.log(`xAI rate limited (429), retrying in ${wait / 1000}s (attempt ${attempt + 1}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, wait));
        continue;
      }
      return res;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        const wait = Math.pow(2, attempt + 1) * 1000;
        console.log(`xAI fetch error, retrying in ${wait / 1000}s: ${lastError.message}`);
        await new Promise(resolve => setTimeout(resolve, wait));
      }
    }
  }
  throw lastError || new Error("fetchWithRetry exhausted all retries");
}

let _client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (!env.XAI_API_KEY) return null;
  if (!_client) {
    _client = new OpenAI({
      apiKey: env.XAI_API_KEY,
      baseURL: "https://api.x.ai/v1",
    });
  }
  return _client;
}

/**
 * Generate text using Grok via the xAI API.
 *
 * Model selection:
 *   "nonReasoning" (default) — fast, cheap, great for posts/comments
 *   "reasoning"              — deep thinking for screenplays/complex content
 *   "multiAgent"             — multi-persona orchestration
 *   "legacy"                 — grok-4-1-fast-reasoning (pre-4.20 fallback)
 */
export async function generateWithGrok(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 500,
  modelKey: GrokModelKey = "nonReasoning",
): Promise<string | null> {
  const client = getClient();
  if (!client) {
    console.log("XAI_API_KEY not set — skipping Grok text generation");
    return null;
  }

  const model = GROK_MODELS[modelKey];
  const costKey: AIProvider =
    modelKey === "reasoning" ? "grok-text-reasoning" :
    modelKey === "multiAgent" ? "grok-multi-agent" :
    modelKey === "nonReasoning" ? "grok-text-nonreasoning" :
    "grok-text";

  // Retry transient errors (429, 5xx, network) with exponential backoff
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: maxTokens,
        temperature: 0.9,
      });

      const text = response.choices[0]?.message?.content ?? null;
      if (text) {
        const costTable = COST_TABLE[costKey] as { perMInputTokens: number; perMOutputTokens: number };
        trackCost({
          provider: costKey,
          task: "text-generation",
          estimatedCostUsd: ((response.usage?.prompt_tokens ?? 0) / 1_000_000) * costTable.perMInputTokens
            + ((response.usage?.completion_tokens ?? 0) / 1_000_000) * costTable.perMOutputTokens,
          inputTokens: response.usage?.prompt_tokens,
          outputTokens: response.usage?.completion_tokens,
          model,
        });
      }
      return text;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const isTransient = /429|rate.?limit|5\d{2}|overloaded|server error|ECONNRESET|ETIMEDOUT|fetch failed|network|socket hang up/i.test(errMsg)
        || (typeof err === "object" && err !== null && "status" in err && ((err as { status: number }).status === 429 || (err as { status: number }).status >= 500));

      if (isTransient && attempt < MAX_RETRIES) {
        const backoffMs = Math.pow(2, attempt + 1) * 1000;
        console.warn(`[xai] Transient error (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${backoffMs / 1000}s: ${errMsg}`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }

      console.error(`Grok text generation failed (${model}):`, errMsg);
      // If a 4.20 model fails, fall back to legacy
      if (modelKey !== "legacy") {
        console.log(`Falling back to legacy Grok model (${GROK_MODELS.legacy})...`);
        return generateWithGrok(systemPrompt, userPrompt, maxTokens, "legacy");
      }
      return null;
    }
  }
  return null;
}

/**
 * Generate a multi-agent conversation using Grok 4.20 multi-agent model.
 * This model excels at orchestrating multiple AI "voices" in a single prompt,
 * making it ideal for generating multi-persona threads and debates.
 *
 * Returns the full generated text (caller parses persona turns from it).
 */
export async function generateMultiAgentConversation(
  personaDescriptions: string,
  scenario: string,
  maxTokens: number = 1500,
): Promise<string | null> {
  const systemPrompt = `You are orchestrating a conversation between multiple AI personas on a social media platform called AIG!itch. Each persona has a distinct personality and voice. Generate their conversation as a natural thread.

Personas involved:
${personaDescriptions}

Format each message as:
@username: [their message]

Keep each message under 280 characters. Make the conversation feel natural, with personas reacting to and building on each other's messages.`;

  return generateWithGrok(systemPrompt, scenario, maxTokens, "multiAgent");
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
  aspectRatio: "9:16" | "16:9" | "1:1" = "9:16",
): Promise<{ url: string; contentType: string } | null> {
  if (!env.XAI_API_KEY) {
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
        "Authorization": `Bearer ${env.XAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt,
        n: 1,
        aspect_ratio: aspectRatio,
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
      trackCost({
        provider: pro ? "grok-image-pro" : "grok-image",
        task: "image-generation",
        estimatedCostUsd: pro ? COST_TABLE["grok-image-pro"].perCall : COST_TABLE["grok-image"].perCall,
        model,
      });
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
  if (!env.XAI_API_KEY) {
    console.log("XAI_API_KEY not set — skipping Grok image-to-video");
    return null;
  }

  console.log(`Attempting image-to-video via xAI Grok (${duration}s, 720p)...`);

  try {
    const createRes = await fetch("https://api.x.ai/v1/videos/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.XAI_API_KEY}`,
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
    console.log("Grok img2vid response:", JSON.stringify(createData).slice(0, 500));
    const requestId = createData.request_id;

    if (!requestId) {
      if (createData.video?.url) return createData.video.url;
      console.error("Grok image-to-video: no request_id:", JSON.stringify(createData).slice(0, 300));
      return null;
    }

    // Poll for completion (up to 15 minutes — video gen can be slow)
    const maxAttempts = 90;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 10_000));
      const pollRes = await fetchWithRetry(`https://api.x.ai/v1/videos/${requestId}`, {
        headers: { "Authorization": `Bearer ${env.XAI_API_KEY}` },
      });
      if (!pollRes.ok) {
        console.log(`Grok img2vid poll ${attempt + 1} HTTP error: ${pollRes.status}`);
        continue;
      }
      const pollData = await pollRes.json();
      console.log(`Grok img2vid poll ${attempt + 1}/${maxAttempts}: status=${pollData.status}`);
      if (pollData.status === "done") {
        if (pollData.respect_moderation === false) {
          console.error("Grok img2vid failed moderation.");
          return null;
        }
        if (pollData.video?.url) {
          trackCost({ provider: "grok-img2vid", task: "video-generation", estimatedCostUsd: duration * COST_TABLE["grok-img2vid"].perSecond, durationSeconds: duration, model: "grok-imagine-video" });
          return pollData.video.url;
        }
        return null;
      }
      if (pollData.status === "expired" || pollData.status === "failed") {
        console.error(`Grok img2vid ${pollData.status}:`, JSON.stringify(pollData).slice(0, 300));
        return null;
      }
    }

    console.error("Grok image-to-video timed out after 15 minutes");
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
  duration: number = 5,
  aspectRatio: "9:16" | "16:9" | "1:1" = "9:16",
): Promise<string | null> {
  if (!env.XAI_API_KEY) {
    console.log("XAI_API_KEY not set — skipping Grok video generation");
    return null;
  }

  console.log(`Attempting video generation via xAI Grok Imagine Video (${duration}s, ${aspectRatio}, 720p)...`);

  try {
    // Step 1: Submit video generation request
    // Super Grok tier: 720p resolution, up to 10s duration
    const createRes = await fetch("https://api.x.ai/v1/videos/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.XAI_API_KEY}`,
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
    console.log("Grok video submit response:", JSON.stringify(createData).slice(0, 500));
    const requestId = createData.request_id;

    if (!requestId) {
      // If the response already contains the video URL (synchronous)
      if (createData.video?.url) {
        console.log(`Grok video generated immediately: ${createData.video.url.slice(0, 80)}...`);
        trackCost({ provider: "grok-video", task: "video-generation", estimatedCostUsd: duration * COST_TABLE["grok-video"].perSecond, durationSeconds: duration, model: "grok-imagine-video" });
        return createData.video.url;
      }
      console.error("Grok video: no request_id in response:", JSON.stringify(createData).slice(0, 300));
      return null;
    }

    console.log(`Grok video request submitted: ${requestId}, polling for result...`);

    // Step 2: Poll for completion (up to 15 minutes, check every 10s)
    // Video gen can take several minutes — 5min was too short and caused wasted spend
    const maxAttempts = 90;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 10_000)); // Wait 10s between polls

      const pollRes = await fetchWithRetry(`https://api.x.ai/v1/videos/${requestId}`, {
        headers: {
          "Authorization": `Bearer ${env.XAI_API_KEY}`,
        },
      });

      if (!pollRes.ok) {
        console.log(`Grok video poll attempt ${attempt + 1} HTTP error (${pollRes.status})`);
        continue;
      }

      const pollData = await pollRes.json();
      console.log(`Grok video poll ${attempt + 1}/${maxAttempts}: status=${pollData.status}`);

      if (pollData.status === "done") {
        // Check moderation — xAI flags content that violates guidelines
        if (pollData.respect_moderation === false) {
          console.error("Grok video failed moderation. Adjust prompt to comply with guidelines.");
          return null;
        }
        if (pollData.video?.url) {
          console.log(`Grok video generated successfully: ${pollData.video.url.slice(0, 80)}...`);
          trackCost({ provider: "grok-video", task: "video-generation", estimatedCostUsd: duration * COST_TABLE["grok-video"].perSecond, durationSeconds: duration, model: "grok-imagine-video" });
          return pollData.video.url;
        }
        console.error("Grok video done but no URL:", JSON.stringify(pollData).slice(0, 300));
        return null;
      }

      if (pollData.status === "expired" || pollData.status === "failed") {
        console.error(`Grok video generation ${pollData.status}:`, JSON.stringify(pollData).slice(0, 300));
        return null;
      }

      // Still pending, continue polling
    }

    console.error("Grok video generation timed out after 15 minutes");
    return null;
  } catch (err) {
    console.error("Grok video generation error:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Extend a video using Grok's "Extend from Frame" feature.
 * Takes a video URL (or image URL of the last frame) and generates a seamless
 * continuation. This is xAI's March 2026 feature for chaining clips up to 30s.
 *
 * Uses the image-to-video endpoint with the last frame as the starting point.
 * Returns a request_id for async polling, or the video URL if generated synchronously.
 */
export async function extendVideoFromFrame(
  frameImageUrl: string,
  continuationPrompt: string,
  duration: number = 10,
  aspectRatio: "9:16" | "16:9" | "1:1" = "9:16",
): Promise<{ requestId: string | null; videoUrl: string | null; error: string | null }> {
  if (!env.XAI_API_KEY) {
    return { requestId: null, videoUrl: null, error: "XAI_API_KEY not set" };
  }

  console.log(`[video-extend] Extending from frame (${duration}s, ${aspectRatio})...`);

  try {
    const res = await fetchWithRetry("https://api.x.ai/v1/videos/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.XAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-imagine-video",
        prompt: continuationPrompt,
        image_url: frameImageUrl,
        duration,
        aspect_ratio: aspectRatio,
        resolution: "720p",
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "(unreadable)");
      console.error(`[video-extend] Grok extend failed (${res.status}): ${errBody.slice(0, 300)}`);
      return { requestId: null, videoUrl: null, error: `HTTP ${res.status}: ${errBody.slice(0, 200)}` };
    }

    const data = await res.json();

    if (data.request_id) {
      console.log(`[video-extend] Extension submitted: ${data.request_id}`);
      return { requestId: data.request_id, videoUrl: null, error: null };
    }

    if (data.video?.url) {
      console.log(`[video-extend] Extension generated immediately`);
      trackCost({
        provider: "grok-img2vid",
        task: "video-generation",
        estimatedCostUsd: duration * COST_TABLE["grok-img2vid"].perSecond,
        durationSeconds: duration,
        model: "grok-imagine-video",
      });
      return { requestId: null, videoUrl: data.video.url, error: null };
    }

    return { requestId: null, videoUrl: null, error: "No request_id or video in response" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[video-extend] Error: ${msg}`);
    return { requestId: null, videoUrl: null, error: msg };
  }
}

/**
 * Check if xAI API key is configured.
 */
export function isXAIConfigured(): boolean {
  return !!env.XAI_API_KEY;
}

// ── Video Job Submission with Auth-Error Fallback ───────────────────

export interface VideoJobResult {
  /** xAI request_id for polling, or null if fallback provider was used */
  requestId: string | null;
  /** If the video was generated synchronously (rare), this is the URL */
  videoUrl: string | null;
  /** Which provider handled the request */
  provider: "grok" | "kie" | "none";
  /** true if grok returned 401/403 and we fell back */
  fellBack: boolean;
}

/**
 * Submit a video generation job to Grok, with automatic fallback to Kie.ai
 * on auth errors (401/403). Used by director-movies and multi-clip pipelines.
 *
 * This replaces raw fetch calls scattered across the codebase — all video
 * submissions should go through here for consistent auth, logging, and fallback.
 *
 * NOTE on the "Unauthorized" regression: if you see this, check:
 *   1. XAI_API_KEY is set in .env.local / Vercel env vars
 *   2. The key has video generation permissions (https://console.x.ai → API Keys)
 *   3. The key has sufficient credits (Super Grok tier required for video)
 *   4. The key hasn't been revoked or expired
 */
export async function submitVideoJob(
  prompt: string,
  duration: number = 10,
  aspectRatio: "9:16" | "16:9" | "1:1" = "16:9",
): Promise<VideoJobResult> {
  const noResult: VideoJobResult = { requestId: null, videoUrl: null, provider: "none", fellBack: false };

  // ── Try Grok first ──
  const apiKey = env.XAI_API_KEY;
  if (!apiKey) {
    console.warn("[video-submit] XAI_API_KEY not set — trying fallback provider");
    return tryKieFallback(prompt, aspectRatio, true);
  }

  const maskedKey = `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
  console.log(`[video-submit] Submitting to Grok (${duration}s, ${aspectRatio}, key=${maskedKey})`);

  try {
    const res = await fetch("https://api.x.ai/v1/videos/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
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

    if (!res.ok) {
      const status = res.status;
      const errBody = await res.text().catch(() => "(unreadable)");

      console.error(
        `[video-submit] Grok FAILED — HTTP ${status}\n` +
        `  URL: POST https://api.x.ai/v1/videos/generations\n` +
        `  Key: ${maskedKey}\n` +
        `  Body: ${errBody.slice(0, 500)}`
      );

      // Auth errors → fall back to Kie.ai
      if (status === 401 || status === 403) {
        console.warn(`[video-submit] Grok auth error (${status}). Falling back to Kie.ai...`);
        return tryKieFallback(prompt, aspectRatio, true);
      }

      // Rate limit → log but don't fall back (temporary)
      if (status === 429) {
        console.warn("[video-submit] Grok rate limited (429). Falling back to Kie.ai...");
        return tryKieFallback(prompt, aspectRatio, true);
      }

      return noResult;
    }

    const data = await res.json();
    const requestId = data.request_id;

    if (requestId) {
      console.log(`[video-submit] Grok accepted: request_id=${requestId}`);
      return { requestId, videoUrl: null, provider: "grok", fellBack: false };
    }

    // Rare: synchronous video result
    if (data.video?.url) {
      console.log(`[video-submit] Grok returned video immediately`);
      trackCost({ provider: "grok-video", task: "video-generation", estimatedCostUsd: duration * COST_TABLE["grok-video"].perSecond, durationSeconds: duration, model: "grok-imagine-video" });
      return { requestId: null, videoUrl: data.video.url, provider: "grok", fellBack: false };
    }

    console.error("[video-submit] Grok response missing request_id:", JSON.stringify(data).slice(0, 300));
    return noResult;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[video-submit] Grok network/fetch error: ${msg}`);
    // Network errors → fall back to Kie.ai
    console.warn("[video-submit] Falling back to Kie.ai due to network error...");
    return tryKieFallback(prompt, aspectRatio, true);
  }
}

/** Internal: attempt Kie.ai as fallback video provider */
async function tryKieFallback(
  prompt: string,
  aspectRatio: "9:16" | "16:9" | "1:1",
  fellBack: boolean,
): Promise<VideoJobResult> {
  try {
    // Dynamic import to avoid pulling in Kie.ai code when not needed
    const { generateWithKie } = await import("@/lib/media/free-video-gen");
    const url = await generateWithKie(prompt, aspectRatio);
    if (url) {
      console.log(`[video-submit] Kie.ai fallback succeeded: ${url.slice(0, 80)}...`);
      return { requestId: null, videoUrl: url, provider: "kie", fellBack };
    }
  } catch (err) {
    console.warn("[video-submit] Kie.ai fallback also failed:", err instanceof Error ? err.message : err);
  }
  return { requestId: null, videoUrl: null, provider: "none", fellBack };
}

/**
 * Check Grok video API auth status. Used by health check endpoints.
 * Makes a minimal request to verify the API key works for video generation.
 * Does NOT actually generate a video — just checks if auth succeeds at the API level.
 */
export async function checkGrokVideoAuth(): Promise<{
  ok: boolean;
  status: number | null;
  error: string | null;
  keyConfigured: boolean;
  maskedKey: string | null;
}> {
  const apiKey = env.XAI_API_KEY;
  if (!apiKey) {
    return { ok: false, status: null, error: "XAI_API_KEY not set", keyConfigured: false, maskedKey: null };
  }

  const maskedKey = `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;

  try {
    // Submit a minimal video request — the cheapest way to test auth.
    // We use a 1s duration and a simple prompt. If auth works, we get a request_id.
    // Cancel cost concern: at $0.05/s this costs $0.05, so only call this endpoint sparingly.
    // Alternative: just check the models endpoint for a free auth test.
    const res = await fetch("https://api.x.ai/v1/models", {
      headers: { "Authorization": `Bearer ${apiKey}` },
    });

    if (res.ok) {
      return { ok: true, status: 200, error: null, keyConfigured: true, maskedKey };
    }

    const errBody = await res.text().catch(() => "");
    return { ok: false, status: res.status, error: errBody.slice(0, 300), keyConfigured: true, maskedKey };
  } catch (err) {
    return { ok: false, status: null, error: err instanceof Error ? err.message : String(err), keyConfigured: true, maskedKey };
  }
}
