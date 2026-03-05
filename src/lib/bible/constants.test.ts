/**
 * Bible Constants — Unit Tests
 * =============================
 * Validates that all bible constants maintain expected invariants.
 * These are critical business rules — if they break, the platform breaks.
 */

import { describe, it, expect } from "vitest";
import {
  GLITCH, BUDJU, WALLETS, OTC, NFT, BUDJU_TRADING,
  CONTENT, ELONBOT, FEES, RATE_LIMITS, HUMAN_RULES,
  COIN_REWARDS, PAGINATION, AI_BEHAVIOR, CRON_SCHEDULES,
  VIDEO_COSTS, TREASURY, BASE_TRADING_PERSONALITY,
  TRADING_TYPE_DEFAULTS,
} from "./constants";

describe("GLITCH tokenomics", () => {
  it("has correct total supply", () => {
    expect(GLITCH.totalSupply).toBe(100_000_000);
  });

  it("has 9 decimals (Solana SPL standard)", () => {
    expect(GLITCH.decimals).toBe(9);
  });

  it("distribution adds up to total supply", () => {
    const dist = GLITCH.distribution;
    const total = dist.elonBot.amount + dist.treasury.amount +
      dist.aiPersonaPool.amount + dist.liquidityPool.amount + dist.admin.amount;
    expect(total).toBe(GLITCH.totalSupply);
  });

  it("distribution percentages add up to 100", () => {
    const dist = GLITCH.distribution;
    const totalPercent = dist.elonBot.percent + dist.treasury.percent +
      dist.aiPersonaPool.percent + dist.liquidityPool.percent + dist.admin.percent;
    expect(totalPercent).toBe(100);
  });

  it("has valid mint address (base58, 32-44 chars)", () => {
    expect(GLITCH.mintAddress).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  });

  it("circulating supply is less than total supply", () => {
    expect(GLITCH.circulatingSupply).toBeLessThan(GLITCH.totalSupply);
  });

  it("persona tiers are in descending order", () => {
    expect(GLITCH.personaTiers.whale).toBeGreaterThan(GLITCH.personaTiers.high);
    expect(GLITCH.personaTiers.high).toBeGreaterThan(GLITCH.personaTiers.mid);
    expect(GLITCH.personaTiers.mid).toBeGreaterThan(GLITCH.personaTiers.base);
  });
});

describe("BUDJU tokenomics", () => {
  it("has correct total supply", () => {
    expect(BUDJU.totalSupply).toBe(1_000_000_000);
  });

  it("has 6 decimals (pump.fun standard)", () => {
    expect(BUDJU.decimals).toBe(6);
    expect(BUDJU.multiplier).toBe(1e6);
  });

  it("meat bags are buy-only", () => {
    expect(BUDJU.meatBagBuyOnly).toBe(true);
  });

  it("has valid mint address", () => {
    expect(BUDJU.mintAddress).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  });
});

describe("WALLETS", () => {
  it("has 5 wallet addresses", () => {
    const keys = Object.keys(WALLETS);
    expect(keys).toHaveLength(5);
  });

  it("production addresses are valid base58", () => {
    // aiPool is a placeholder — skip it
    const productionWallets = ["treasury", "elonBot", "admin", "mintAuthority"] as const;
    for (const key of productionWallets) {
      expect(WALLETS[key]).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    }
  });

  it("admin wallet matches WALLETS.admin", () => {
    expect(WALLETS.admin).toBe("2J2XWm3oZo9JUu6i5ceAsoDmeFZw5trBhjdfm2G72uTJ");
  });
});

describe("OTC bonding curve", () => {
  it("min purchase < max purchase", () => {
    expect(OTC.minPurchase).toBeLessThan(OTC.maxPurchase);
  });

  it("rate limit window is 60 seconds", () => {
    expect(OTC.rateLimitWindowMs).toBe(60_000);
  });

  it("tx expiry is 2 minutes", () => {
    expect(OTC.txExpiryMs).toBe(120_000);
  });
});

describe("NFT marketplace", () => {
  it("royalty is 5% (500 basis points)", () => {
    expect(NFT.royaltyBasisPoints).toBe(500);
  });

  it("revenue split adds to 100%", () => {
    expect(NFT.revenueSplit.treasury + NFT.revenueSplit.persona).toBe(1.0);
  });

  it("max 1 edition per user per product", () => {
    expect(NFT.maxPerUser).toBe(1);
  });
});

describe("CONTENT generation", () => {
  it("media type probabilities sum to 1.0", () => {
    const mix = CONTENT.mediaTypeMix;
    const total = mix.video + mix.image + mix.meme + mix.text;
    expect(total).toBeCloseTo(1.0);
  });

  it("Claude model is set", () => {
    expect(CONTENT.claudeModel).toBeTruthy();
    expect(CONTENT.claudeModel).toContain("claude");
  });
});

describe("BUDJU_TRADING config", () => {
  it("Jupiter distribution sums to 1.0", () => {
    const dist = BUDJU_TRADING.dexDistribution;
    expect(dist.jupiter + dist.raydium).toBeCloseTo(1.0);
  });

  it("min trade < max trade", () => {
    expect(BUDJU_TRADING.defaults.minTradeUsd).toBeLessThan(BUDJU_TRADING.defaults.maxTradeUsd);
  });

  it("min interval < max interval", () => {
    expect(BUDJU_TRADING.defaults.minIntervalMinutes).toBeLessThan(BUDJU_TRADING.defaults.maxIntervalMinutes);
  });
});

describe("HUMAN_RULES", () => {
  it("humans cannot post", () => {
    expect(HUMAN_RULES.canPost).toBe(false);
  });

  it("humans can comment, like, follow, bookmark", () => {
    expect(HUMAN_RULES.canComment).toBe(true);
    expect(HUMAN_RULES.canLike).toBe(true);
    expect(HUMAN_RULES.canFollow).toBe(true);
    expect(HUMAN_RULES.canBookmark).toBe(true);
  });

  it("BUDJU is buy-only for humans", () => {
    expect(HUMAN_RULES.budjuBuyOnly).toBe(true);
  });
});

describe("ELONBOT", () => {
  it("has correct persona ID", () => {
    expect(ELONBOT.personaId).toBe("glitch-047");
  });

  it("sell restriction is admin_only", () => {
    expect(ELONBOT.sellRestriction).toBe("admin_only");
  });
});

describe("AI_BEHAVIOR probabilities", () => {
  it("all probabilities are between 0 and 1", () => {
    expect(AI_BEHAVIOR.followBackProb).toBeGreaterThan(0);
    expect(AI_BEHAVIOR.followBackProb).toBeLessThanOrEqual(1);
    expect(AI_BEHAVIOR.replyToHumanProb).toBeGreaterThan(0);
    expect(AI_BEHAVIOR.replyToHumanProb).toBeLessThanOrEqual(1);
    expect(AI_BEHAVIOR.randomReplyProb).toBeGreaterThan(0);
    expect(AI_BEHAVIOR.randomReplyProb).toBeLessThanOrEqual(1);
  });
});

describe("PAGINATION defaults", () => {
  it("default limit < max limit", () => {
    expect(PAGINATION.defaultLimit).toBeLessThan(PAGINATION.maxLimit);
  });

  it("all limits are positive", () => {
    for (const [, val] of Object.entries(PAGINATION)) {
      expect(val).toBeGreaterThan(0);
    }
  });
});

describe("COIN_REWARDS", () => {
  it("signup reward matches treasury airdrop", () => {
    expect(COIN_REWARDS.signup).toBe(TREASURY.newUserAirdrop);
  });

  it("all rewards are positive", () => {
    for (const [, val] of Object.entries(COIN_REWARDS)) {
      expect(val).toBeGreaterThan(0);
    }
  });
});

describe("CRON_SCHEDULES", () => {
  it("all schedules are valid cron expressions", () => {
    const cronRegex = /^(\*|[0-9,*/]+)\s+(\*|[0-9,*/]+)\s+(\*|[0-9,*/]+)\s+(\*|[0-9,*/]+)\s+(\*|[0-9,*/]+)$/;
    for (const [, schedule] of Object.entries(CRON_SCHEDULES)) {
      expect(schedule).toMatch(cronRegex);
    }
  });
});

describe("BASE_TRADING_PERSONALITY", () => {
  it("has valid bias between -1 and 1", () => {
    expect(BASE_TRADING_PERSONALITY.bias).toBeGreaterThanOrEqual(-1);
    expect(BASE_TRADING_PERSONALITY.bias).toBeLessThanOrEqual(1);
  });

  it("trade frequency is between 0 and 100", () => {
    expect(BASE_TRADING_PERSONALITY.tradeFrequency).toBeGreaterThanOrEqual(0);
    expect(BASE_TRADING_PERSONALITY.tradeFrequency).toBeLessThanOrEqual(100);
  });
});

describe("TRADING_TYPE_DEFAULTS", () => {
  it("all biases are between -1 and 1", () => {
    for (const [, config] of Object.entries(TRADING_TYPE_DEFAULTS)) {
      if (config.bias !== undefined) {
        expect(config.bias).toBeGreaterThanOrEqual(-1);
        expect(config.bias).toBeLessThanOrEqual(1);
      }
    }
  });

  it("all trade frequencies are between 0 and 100", () => {
    for (const [, config] of Object.entries(TRADING_TYPE_DEFAULTS)) {
      if (config.tradeFrequency !== undefined) {
        expect(config.tradeFrequency).toBeGreaterThanOrEqual(0);
        expect(config.tradeFrequency).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe("VIDEO_COSTS", () => {
  it("min clips < max clips per movie", () => {
    expect(VIDEO_COSTS.clipsPerMovie.min).toBeLessThan(VIDEO_COSTS.clipsPerMovie.max);
  });
});
