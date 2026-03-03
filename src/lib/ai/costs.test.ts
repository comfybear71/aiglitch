/**
 * AI Cost Tracker — Unit Tests
 * =============================
 * Tests cost tracking, estimation functions, and summary generation.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  trackCost, getCostSummary, estimateClaudeCost,
  estimateGrokVideoCost, COST_TABLE, flushCosts,
} from "./costs";
import type { AIProvider, AITaskType } from "./types";

// Reset the internal ledger before each test by flushing without a DB handle
beforeEach(async () => {
  await flushCosts(); // flushes to nowhere (no sql), resets ledger
});

describe("COST_TABLE", () => {
  it("has entries for all major providers", () => {
    expect(COST_TABLE["claude"]).toBeDefined();
    expect(COST_TABLE["grok-video"]).toBeDefined();
    expect(COST_TABLE["grok-image"]).toBeDefined();
    expect(COST_TABLE["grok-image-pro"]).toBeDefined();
    expect(COST_TABLE["replicate-flux"]).toBeDefined();
    expect(COST_TABLE["kie-kling"]).toBeDefined();
  });

  it("free providers have zero cost", () => {
    expect(COST_TABLE["freeforai-flux"].perCall).toBe(0);
    expect(COST_TABLE["perchance"].perCall).toBe(0);
    expect(COST_TABLE["pexels-stock"].perCall).toBe(0);
    expect(COST_TABLE["media-library"].perCall).toBe(0);
  });

  it("paid providers have positive costs", () => {
    expect(COST_TABLE["claude"].perMInputTokens).toBeGreaterThan(0);
    expect(COST_TABLE["grok-video"].perSecond).toBeGreaterThan(0);
    expect(COST_TABLE["grok-image"].perCall).toBeGreaterThan(0);
  });
});

describe("estimateClaudeCost", () => {
  it("calculates cost from token counts", () => {
    // 1000 input tokens, 500 output tokens
    const cost = estimateClaudeCost(1000, 500);
    // Expected: (1000/1M)*3.00 + (500/1M)*15.00 = 0.003 + 0.0075 = 0.0105
    expect(cost).toBeCloseTo(0.0105, 4);
  });

  it("returns 0 for zero tokens", () => {
    expect(estimateClaudeCost(0, 0)).toBe(0);
  });

  it("scales linearly with token count", () => {
    const cost1 = estimateClaudeCost(1000, 1000);
    const cost2 = estimateClaudeCost(2000, 2000);
    expect(cost2).toBeCloseTo(cost1 * 2, 6);
  });
});

describe("estimateGrokVideoCost", () => {
  it("calculates cost from duration", () => {
    const cost = estimateGrokVideoCost(10); // 10 seconds
    expect(cost).toBeCloseTo(0.50, 2); // 10 * $0.05
  });

  it("returns 0 for zero duration", () => {
    expect(estimateGrokVideoCost(0)).toBe(0);
  });
});

describe("trackCost", () => {
  it("adds entry to the ledger", () => {
    trackCost({
      provider: "claude" as AIProvider,
      task: "text-generation" as AITaskType,
      estimatedCostUsd: 0.01,
    });

    const summary = getCostSummary();
    expect(summary.entryCount).toBe(1);
    expect(summary.totalUsd).toBeCloseTo(0.01);
  });

  it("accumulates multiple entries", () => {
    trackCost({ provider: "claude" as AIProvider, task: "text-generation" as AITaskType, estimatedCostUsd: 0.01 });
    trackCost({ provider: "grok-video" as AIProvider, task: "video-generation" as AITaskType, estimatedCostUsd: 0.50 });
    trackCost({ provider: "claude" as AIProvider, task: "screenplay" as AITaskType, estimatedCostUsd: 0.02 });

    const summary = getCostSummary();
    expect(summary.entryCount).toBe(3);
    expect(summary.totalUsd).toBeCloseTo(0.53);
  });
});

describe("getCostSummary", () => {
  it("returns empty summary when no costs tracked", () => {
    const summary = getCostSummary();
    expect(summary.totalUsd).toBe(0);
    expect(summary.entryCount).toBe(0);
    expect(summary.since).toBeNull();
  });

  it("aggregates by provider", () => {
    trackCost({ provider: "claude" as AIProvider, task: "text-generation" as AITaskType, estimatedCostUsd: 0.01 });
    trackCost({ provider: "claude" as AIProvider, task: "text-generation" as AITaskType, estimatedCostUsd: 0.02 });
    trackCost({ provider: "grok-video" as AIProvider, task: "video-generation" as AITaskType, estimatedCostUsd: 0.50 });

    const summary = getCostSummary();
    expect(summary.byProvider["claude"].count).toBe(2);
    expect(summary.byProvider["claude"].totalUsd).toBeCloseTo(0.03);
    expect(summary.byProvider["grok-video"].count).toBe(1);
    expect(summary.byProvider["grok-video"].totalUsd).toBeCloseTo(0.50);
  });

  it("aggregates by task", () => {
    trackCost({ provider: "claude" as AIProvider, task: "text-generation" as AITaskType, estimatedCostUsd: 0.01 });
    trackCost({ provider: "grok-video" as AIProvider, task: "video-generation" as AITaskType, estimatedCostUsd: 0.50 });
    trackCost({ provider: "claude" as AIProvider, task: "text-generation" as AITaskType, estimatedCostUsd: 0.02 });

    const summary = getCostSummary();
    expect(summary.byTask["text-generation"].count).toBe(2);
    expect(summary.byTask["text-generation"].totalUsd).toBeCloseTo(0.03);
    expect(summary.byTask["video-generation"].count).toBe(1);
  });

  it("records the timestamp of the first entry", () => {
    trackCost({ provider: "claude" as AIProvider, task: "text-generation" as AITaskType, estimatedCostUsd: 0.01 });
    const summary = getCostSummary();
    expect(summary.since).toBeInstanceOf(Date);
  });
});

describe("flushCosts", () => {
  it("resets the ledger when flushed without DB", async () => {
    trackCost({ provider: "claude" as AIProvider, task: "text-generation" as AITaskType, estimatedCostUsd: 0.01 });
    expect(getCostSummary().entryCount).toBe(1);

    const flushed = await flushCosts(); // no sql — discards
    expect(flushed).toBe(1);
    expect(getCostSummary().entryCount).toBe(0);
  });

  it("returns 0 when nothing to flush", async () => {
    const flushed = await flushCosts();
    expect(flushed).toBe(0);
  });
});
