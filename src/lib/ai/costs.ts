/**
 * AI Cost Tracker (#6)
 * =====================
 * Tracks estimated spend per AI call in-memory and persists to the DB
 * once per flush cycle. This gives the admin dashboard real cost visibility.
 *
 * Usage:
 *   import { trackCost, getCostSummary, flushCosts } from "@/lib/ai/costs";
 *
 *   trackCost({ provider: "grok-video", task: "video-generation", estimatedCostUsd: 0.50 });
 *   const summary = getCostSummary();         // { totalUsd, byProvider, byTask }
 *   await flushCosts();                       // persist to DB then reset
 */

import type { AICostEntry, AIProvider, AITaskType } from "./types";

// ── Cost Constants ───────────────────────────────────────────────────────

/** Known per-unit costs for each provider (USD) */
export const COST_TABLE = {
  // xAI / Grok
  "grok-video":       { perSecond: 0.05 },
  "grok-image":       { perCall: 0.02 },
  "grok-image-pro":   { perCall: 0.07 },
  "grok-text":        { perMInputTokens: 0.20, perMOutputTokens: 0.50 },
  "grok-img2vid":     { perSecond: 0.05 },

  // Anthropic / Claude
  "claude":           { perMInputTokens: 3.00, perMOutputTokens: 15.00 }, // Sonnet 4

  // Replicate
  "replicate-imagen4": { perCall: 0.01 },
  "replicate-flux":    { perCall: 0.003 },
  "replicate-wan2":    { perCall: 0.05 },
  "replicate-ideogram":{ perCall: 0.03 },

  // Kie.ai
  "kie-kling":        { perCall: 0.125 },

  // Raphael
  "raphael":          { perCall: 0.0036 },

  // Free
  "freeforai-flux":   { perCall: 0 },
  "perchance":        { perCall: 0 },
  "pexels-stock":     { perCall: 0 },
  "media-library":    { perCall: 0 },
} as const;

// ── In-Memory Ledger ─────────────────────────────────────────────────────

let _ledger: AICostEntry[] = [];

/**
 * Record an AI cost event.
 */
export function trackCost(entry: Omit<AICostEntry, "timestamp">): void {
  _ledger.push({ ...entry, timestamp: new Date() });
}

/**
 * Estimate the cost for a Claude call based on token counts.
 */
export function estimateClaudeCost(inputTokens: number, outputTokens: number): number {
  const table = COST_TABLE["claude"];
  return (inputTokens / 1_000_000) * table.perMInputTokens +
         (outputTokens / 1_000_000) * table.perMOutputTokens;
}

/**
 * Estimate the cost for a Grok video based on duration.
 */
export function estimateGrokVideoCost(durationSeconds: number): number {
  return durationSeconds * COST_TABLE["grok-video"].perSecond;
}

// ── Summary & Flushing ───────────────────────────────────────────────────

export interface CostSummary {
  totalUsd: number;
  entryCount: number;
  byProvider: Record<string, { count: number; totalUsd: number }>;
  byTask: Record<string, { count: number; totalUsd: number }>;
  since: Date | null;
}

/**
 * Return an aggregate summary of costs accumulated since the last flush.
 */
export function getCostSummary(): CostSummary {
  const byProvider: Record<string, { count: number; totalUsd: number }> = {};
  const byTask: Record<string, { count: number; totalUsd: number }> = {};
  let totalUsd = 0;

  for (const e of _ledger) {
    totalUsd += e.estimatedCostUsd;

    if (!byProvider[e.provider]) byProvider[e.provider] = { count: 0, totalUsd: 0 };
    byProvider[e.provider].count++;
    byProvider[e.provider].totalUsd += e.estimatedCostUsd;

    if (!byTask[e.task]) byTask[e.task] = { count: 0, totalUsd: 0 };
    byTask[e.task].count++;
    byTask[e.task].totalUsd += e.estimatedCostUsd;
  }

  return {
    totalUsd: Math.round(totalUsd * 10000) / 10000,
    entryCount: _ledger.length,
    byProvider,
    byTask,
    since: _ledger.length > 0 ? _ledger[0].timestamp : null,
  };
}

/**
 * Persist the current ledger to the `ai_cost_log` table and reset.
 * Called at the end of each cron run or on-demand by admin.
 *
 * The table is created lazily on first use.
 */
export async function flushCosts(sql?: ReturnType<typeof import("@/lib/db").getDb>): Promise<number> {
  if (_ledger.length === 0) return 0;

  const batch = [..._ledger];
  _ledger = [];

  if (!sql) {
    // If no sql handle provided, just discard (dev mode / tests)
    return batch.length;
  }

  try {
    // Ensure table exists
    await sql`
      CREATE TABLE IF NOT EXISTS ai_cost_log (
        id SERIAL PRIMARY KEY,
        provider TEXT NOT NULL,
        task TEXT NOT NULL,
        estimated_cost_usd REAL NOT NULL,
        input_tokens INTEGER,
        output_tokens INTEGER,
        duration_seconds REAL,
        model TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    // Batch insert
    for (const e of batch) {
      await sql`
        INSERT INTO ai_cost_log (provider, task, estimated_cost_usd, input_tokens, output_tokens, duration_seconds, model, created_at)
        VALUES (${e.provider}, ${e.task}, ${e.estimatedCostUsd}, ${e.inputTokens ?? null}, ${e.outputTokens ?? null}, ${e.durationSeconds ?? null}, ${e.model ?? null}, ${e.timestamp})
      `;
    }
  } catch (err) {
    // Put them back so we don't lose data
    _ledger = [...batch, ..._ledger];
    console.error("[ai/costs] Failed to flush cost log:", err instanceof Error ? err.message : err);
  }

  return batch.length;
}

/**
 * Get historical cost data from the database.
 * Returns per-day aggregates for the last N days.
 */
export async function getCostHistory(
  sql: ReturnType<typeof import("@/lib/db").getDb>,
  days: number = 7,
): Promise<{ date: string; provider: string; task: string; totalUsd: number; count: number }[]> {
  try {
    const rows = await sql`
      SELECT
        DATE(created_at) as date,
        provider,
        task,
        ROUND(SUM(estimated_cost_usd)::numeric, 4) as "totalUsd",
        COUNT(*)::int as count
      FROM ai_cost_log
      WHERE created_at > NOW() - INTERVAL '1 day' * ${days}
      GROUP BY DATE(created_at), provider, task
      ORDER BY date DESC, "totalUsd" DESC
    ` as unknown as { date: string; provider: string; task: string; totalUsd: number; count: number }[];
    return rows;
  } catch {
    return [];
  }
}
