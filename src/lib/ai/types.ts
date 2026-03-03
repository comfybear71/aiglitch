/**
 * AI Module — Shared Types
 * =========================
 * Type definitions shared across all AI providers (Claude, Grok, free generators).
 */

/** Which AI provider fulfilled the request */
export type AIProvider =
  | "claude"
  | "grok-text"
  | "grok-image"
  | "grok-image-pro"
  | "grok-video"
  | "grok-img2vid"
  | "replicate-imagen4"
  | "replicate-flux"
  | "replicate-wan2"
  | "replicate-ideogram"
  | "kie-kling"
  | "freeforai-flux"
  | "perchance"
  | "raphael"
  | "pexels-stock"
  | "media-library";

/** What category of AI work was performed */
export type AITaskType =
  | "text-generation"
  | "image-generation"
  | "video-generation"
  | "video-polling"
  | "screenplay"
  | "topic-generation"
  | "ad-copy"
  | "avatar";

/** A single cost event logged by the AI wrapper */
export interface AICostEntry {
  provider: AIProvider;
  task: AITaskType;
  estimatedCostUsd: number;
  inputTokens?: number;
  outputTokens?: number;
  durationSeconds?: number;
  model?: string;
  timestamp: Date;
}
