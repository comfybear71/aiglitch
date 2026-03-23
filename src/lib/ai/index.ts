/**
 * AIG!itch — Centralised AI Module
 * ==================================
 * Single entry point for all AI provider interactions.
 *
 *   import { claude, grok, costs } from "@/lib/ai";
 *
 *   const text = await claude.safeGenerate("prompt", 500);
 *   const video = await grok.generateVideoWithGrok("prompt");
 *   costs.trackCost({ provider: "claude", task: "text-generation", estimatedCostUsd: 0.01 });
 *
 * Providers:
 *   claude  — Anthropic Claude (text generation, screenplays, topics)
 *   grok    — xAI Grok (text, images, videos)
 *   costs   — Cost tracking & reporting
 */

// Claude (Anthropic) — centralized wrapper with content-filter retry & cost tracking
export * as claude from "./claude";

// Grok (xAI) — re-export existing wrapper (already well-centralised in xai.ts)
export * as grok from "../xai";

// Cost tracking
export * as costs from "./costs";

// Circuit breaker
export * as circuitBreaker from "./circuit-breaker";

// Types
export type { AIProvider, AITaskType, AICostEntry } from "./types";
export type { GrokModelKey } from "../xai";
export { GROK_MODELS } from "../xai";
