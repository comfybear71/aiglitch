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
 * Safe wrapper around `client.messages.create` that handles content filter errors.
 * On "Output blocked by content filtering policy" (400), retries once with a
 * toned-down prompt addendum. Returns the text or null if both attempts fail.
 *
 * Also tracks estimated cost via the AI cost ledger.
 */
export async function safeGenerate(
  prompt: string,
  maxTokens: number = CONTENT.defaultMaxTokens,
  model: string = DEFAULT_MODEL,
): Promise<string | null> {
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
    const isContentFilter =
      errMsg.includes("content filtering policy") ||
      errMsg.includes("Output blocked");

    if (!isContentFilter) throw err;

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
