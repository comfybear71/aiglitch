/**
 * Settings Repository
 * ====================
 * Typed access to `platform_settings` and `budju_trading_config` tables.
 * Heavily cached — these are read on almost every request but written rarely.
 */

import { getDb } from "@/lib/db";
import { cache, TTL } from "@/lib/cache";

// ── Types ─────────────────────────────────────────────────────────────

export interface PlatformPrices {
  glitchPriceSol: number;
  glitchPriceUsd: number;
  solPriceUsd: number;
  budjuPriceUsd: number;
  budjuPriceSol: number;
  glitchMarketCap: number;
  otcGlitchPriceSol: number;
}

export interface BudjuTradingConfig {
  enabled: boolean;
  dailyBudgetUsd: number;
  maxTradeUsd: number;
  minTradeUsd: number;
  minIntervalMinutes: number;
  maxIntervalMinutes: number;
  buySellRatio: number;
  activePersonaCount: number;
  spentTodayUsd: number;
  spentResetDate: string;
}

// ── Repository ────────────────────────────────────────────────────────

/** Read a single platform setting by key. Cached. */
export async function getSetting(key: string): Promise<string | null> {
  return cache.getOrSet(`setting:${key}`, TTL.settings, async () => {
    const sql = getDb();
    const rows = await sql`SELECT value FROM platform_settings WHERE key = ${key}`;
    return rows.length > 0 ? (rows[0].value as string) : null;
  });
}

/** Write a platform setting. Busts cache for that key and the bulk prices cache. */
export async function setSetting(key: string, value: string): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO platform_settings (key, value, updated_at)
    VALUES (${key}, ${value}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = ${value}, updated_at = NOW()
  `;
  cache.del(`setting:${key}`);
  cache.del("prices:all");
}

/** Fetch all platform prices in a single cached query. */
export async function getPrices(): Promise<PlatformPrices> {
  return cache.getOrSet("prices:all", TTL.prices, async () => {
    const sql = getDb();
    const rows = await sql`
      SELECT key, value FROM platform_settings
      WHERE key IN (
        'glitch_price_sol', 'glitch_price_usd', 'sol_price_usd',
        'budju_price_usd', 'budju_price_sol', 'glitch_market_cap',
        'otc_glitch_price_sol'
      )
    `;
    const map = new Map(rows.map(r => [r.key as string, r.value as string]));
    return {
      glitchPriceSol: parseFloat(map.get("glitch_price_sol") || "0.000042"),
      glitchPriceUsd: parseFloat(map.get("glitch_price_usd") || "0.0069"),
      solPriceUsd: parseFloat(map.get("sol_price_usd") || "164"),
      budjuPriceUsd: parseFloat(map.get("budju_price_usd") || "0.0069"),
      budjuPriceSol: parseFloat(map.get("budju_price_sol") || "0.000042"),
      glitchMarketCap: parseFloat(map.get("glitch_market_cap") || "690420"),
      otcGlitchPriceSol: parseFloat(map.get("otc_glitch_price_sol") || "0.0000667"),
    };
  });
}

/** Fetch BUDJU trading config as typed object. Cached. */
export async function getBudjuTradingConfig(): Promise<BudjuTradingConfig> {
  return cache.getOrSet("budju:config", TTL.settings, async () => {
    const sql = getDb();
    const rows = await sql`SELECT key, value FROM budju_trading_config`;
    const map = new Map(rows.map(r => [r.key as string, r.value as string]));
    return {
      enabled: map.get("enabled") === "true",
      dailyBudgetUsd: parseFloat(map.get("daily_budget_usd") || "100"),
      maxTradeUsd: parseFloat(map.get("max_trade_usd") || "10"),
      minTradeUsd: parseFloat(map.get("min_trade_usd") || "0.50"),
      minIntervalMinutes: parseInt(map.get("min_interval_minutes") || "2"),
      maxIntervalMinutes: parseInt(map.get("max_interval_minutes") || "30"),
      buySellRatio: parseFloat(map.get("buy_sell_ratio") || "0.6"),
      activePersonaCount: parseInt(map.get("active_persona_count") || "15"),
      spentTodayUsd: parseFloat(map.get("spent_today_usd") || "0"),
      spentResetDate: map.get("spent_reset_date") || "",
    };
  });
}

/** Update BUDJU trading config. Busts cache. */
export async function setBudjuTradingConfig(key: string, value: string): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO budju_trading_config (key, value, updated_at)
    VALUES (${key}, ${value}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = ${value}, updated_at = NOW()
  `;
  cache.del("budju:config");
}
