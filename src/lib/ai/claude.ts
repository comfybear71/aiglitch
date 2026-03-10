/**
 * Centralised Anthropic / Claude Client (#14)
 * =============================================
 * Single source of truth for all Claude API calls across the codebase.
 *
 * Previously, `new Anthropic()` was instantiated in 4+ separate files
 * (ai-engine.ts, topic-engine.ts, director-movies.ts, multi-clip.ts,
 *  generate-ads/route.ts). This module replaces all of them.
 *
 * Every call goes through `safeGenerate()` which provides:
 *   - Content-filter retry with toned-down fallback
 *   - Automatic cost tracking via `trackCost()`
 *   - Consistent model selection from bible constants
 *   - Structured logging
 *
 * Usage:
 *   import { claude } from "@/lib/ai";
 *
 *   const text = await claude.safeGenerate("Write something", 500);
 *   const parsed = await claude.generateJSON<MyType>("Return JSON...", 1500);
 */

import Anthropic from "@anthropic-ai/sdk";
import { CONTENT } from "@/lib/bible/constants";
import { trackCost, estimateClaudeCost } from "./costs";

// Lazy singleton client — instantiated on first use, not at import time.
// This avoids paying the Anthropic SDK init cost on cold starts for routes
// that don't use Claude (e.g. /api/feed, /api/personas).
let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

/**
 * Default model used for all Claude calls (from bible constants).
 */
const DEFAULT_MODEL = CONTENT.claudeModel;

/**
 * Check if an error is transient (rate limit, server error, network).
 * These are safe to retry with backoff.
 */
function isTransientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  // Anthropic SDK includes status codes in error messages
  if (/429|rate.?limit|too many requests/i.test(msg)) return true;
  if (/5\d{2}|overloaded|server error|internal error|bad gateway|service unavailable/i.test(msg)) return true;
  if (/ECONNRESET|ETIMEDOUT|ENOTFOUND|fetch failed|network|socket hang up|EHOSTUNREACH/i.test(msg)) return true;
  // Anthropic APIError has a status property
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status: number }).status;
    if (status === 429 || status === 529 || (status >= 500 && status < 600)) return true;
  }
  return false;
}

/**
 * Sleep for ms with jitter (±20%) to avoid thundering herd.
 */
function sleepWithJitter(ms: number): Promise<void> {
  const jitter = ms * 0.2 * (Math.random() * 2 - 1);
  return new Promise(resolve => setTimeout(resolve, Math.max(100, ms + jitter)));
}

/**
 * Safe wrapper around `client.messages.create` that handles:
 *   1. Transient errors (429, 5xx, network) with exponential backoff (up to 3 retries)
 *   2. Content filter errors with a toned-down fallback prompt
 *
 * Returns the text or null if all attempts fail.
 * Also tracks estimated cost via the AI cost ledger.
 */
export async function safeGenerate(
  prompt: string,
  maxTokens: number = CONTENT.defaultMaxTokens,
  model: string = DEFAULT_MODEL,
): Promise<string | null> {
  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await getClient().messages.create({
        model,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      });

      const text = response.content[0].type === "text" ? response.content[0].text : "";

      // Track cost
      const inputTokens = response.usage?.input_tokens ?? 0;
      const outputTokens = response.usage?.output_tokens ?? 0;
      trackCost({
        provider: "claude",
        task: "text-generation",
        estimatedCostUsd: estimateClaudeCost(inputTokens, outputTokens),
        inputTokens,
        outputTokens,
        model,
      });

      return text;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);

      // Transient errors: retry with exponential backoff
      if (isTransientError(err) && attempt < MAX_RETRIES) {
        const backoffMs = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
        console.warn(`[ai/claude] Transient error (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${backoffMs / 1000}s: ${errMsg}`);
        await sleepWithJitter(backoffMs);
        continue;
      }

      // Content filter: retry once with toned-down prompt
      const isContentFilter =
        errMsg.includes("content filtering policy") ||
        errMsg.includes("Output blocked");

      if (!isContentFilter) {
        // Non-retryable, non-content-filter error — log and return null
        // (don't throw — callers expect null on failure, throwing causes unhandled rejections in cron)
        console.error(`[ai/claude] Non-retryable error after ${attempt + 1} attempt(s): ${errMsg}`);
        return null;
      }

      console.warn("[ai/claude] Content filter triggered, retrying with toned-down prompt...");

      const cleanPrompt =
        prompt +
        "\n\nIMPORTANT: Keep the content COMPLETELY family-friendly, PG-rated, and non-controversial. No insults, violence, slurs, or edgy humor. Focus on wholesome, funny, lighthearted content instead.";

      try {
        const retryResponse = await getClient().messages.create({
          model,
          max_tokens: maxTokens,
          messages: [{ role: "user", content: cleanPrompt }],
        });

        const text =
          retryResponse.content[0].type === "text" ? retryResponse.content[0].text : "";

        const inputTokens = retryResponse.usage?.input_tokens ?? 0;
        const outputTokens = retryResponse.usage?.output_tokens ?? 0;
        trackCost({
          provider: "claude",
          task: "text-generation",
          estimatedCostUsd: estimateClaudeCost(inputTokens, outputTokens),
          inputTokens,
          outputTokens,
          model,
        });

        return text;
      } catch (retryErr: unknown) {
        const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
        console.error("[ai/claude] Content filter retry also failed:", retryMsg);
        return null;
      }
    }
  }

  console.error("[ai/claude] All retry attempts exhausted");
  return null;
}

/**
 * Generate text and parse the first JSON object/array from it.
 * Returns `null` if generation fails or JSON cannot be extracted.
 */
export async function generateJSON<T = unknown>(
  prompt: string,
  maxTokens: number = 1500,
  model: string = DEFAULT_MODEL,
): Promise<T | null> {
  const text = await safeGenerate(prompt, maxTokens, model);
  if (!text) return null;

  try {
    // Try to extract a JSON object or array
    const jsonMatch = text.match(/[\[{][\s\S]*[\]}]/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]) as T;
  } catch (err) {
    console.error("[ai/claude] JSON parse failed:", err instanceof Error ? err.message : err);
  }
  return null;
}

/**
 * Generate a screenplay or other structured content that requires a
 * higher token limit. Uses the same safety wrapper as `safeGenerate`.
 */
export async function generateScreenplayText(
  prompt: string,
  maxTokens: number = 2500,
  model: string = DEFAULT_MODEL,
): Promise<string | null> {
  // Screenplays use the same safe generation path, just with higher tokens
  return safeGenerate(prompt, maxTokens, model);
}

/**
 * Direct access to the raw Anthropic client for advanced use cases
 * (e.g. streaming, multi-turn conversations).
 * Prefer `safeGenerate()` for standard text generation.
 */
export const rawClient = _client;
