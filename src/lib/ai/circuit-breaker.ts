/**
 * AI Provider Circuit Breaker
 * ============================
 * Simple Redis-based circuit breaker that prevents runaway AI costs
 * by rate-limiting calls per provider and enforcing a daily spend cap.
 *
 * Uses Upstash Redis counters with TTL — no external dependencies.
 *
 * Usage:
 *   import { checkCircuitBreaker, recordProviderCall, getCircuitBreakerStatus } from "@/lib/ai/circuit-breaker";
 *
 *   const allowed = await checkCircuitBreaker("claude");
 *   if (!allowed) { console.log("Circuit breaker tripped!"); return null; }
 *   // ... make AI call ...
 *   await recordProviderCall("claude", 0.05);
 */

import { Redis } from "@upstash/redis";

// ── Config ──────────────────────────────────────────────────────────────

/** Max calls per provider per minute (prevents burst loops) */
const MAX_CALLS_PER_MINUTE: Record<string, number> = {
  "claude":                100,
  "grok-text":             200,
  "grok-text-reasoning":   100,
  "grok-text-nonreasoning":200,
  "grok-multi-agent":      50,
  "grok-image":            60,
  "grok-image-pro":        30,
  "grok-video":            20,
  "grok-img2vid":          20,
  "replicate-imagen4":     30,
  "replicate-flux":        60,
  "replicate-wan2":        20,
  "replicate-ideogram":    30,
  "kie-kling":             20,
  "raphael":               60,
  "_default":              100,
};

/** Max USD spend per day across all providers */
const MAX_DAILY_SPEND_USD = 50;

/** Max USD spend per hour (catches sudden spikes) */
const MAX_HOURLY_SPEND_USD = 15;

const REDIS_PREFIX = "aiglitch:cb:";

// ── Redis Client ────────────────────────────────────────────────────────

let _redis: Redis | null = null;
let _redisChecked = false;

function getRedis(): Redis | null {
  if (_redisChecked) return _redis;
  _redisChecked = true;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    try {
      _redis = new Redis({ url, token });
    } catch {
      // Redis not available — circuit breaker disabled (fail open)
    }
  }
  return _redis;
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Check if a provider call is allowed.
 * Returns true if the call should proceed, false if the breaker is tripped.
 *
 * Fail-open: if Redis is unavailable, always allow (don't break the platform).
 */
export async function checkCircuitBreaker(provider: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true; // Fail open

  try {
    const now = new Date();
    const minuteKey = `${REDIS_PREFIX}rpm:${provider}:${now.getUTCFullYear()}${(now.getUTCMonth() + 1).toString().padStart(2, "0")}${now.getUTCDate().toString().padStart(2, "0")}${now.getUTCHours().toString().padStart(2, "0")}${now.getUTCMinutes().toString().padStart(2, "0")}`;
    const hourKey = `${REDIS_PREFIX}spend:hour:${now.getUTCFullYear()}${(now.getUTCMonth() + 1).toString().padStart(2, "0")}${now.getUTCDate().toString().padStart(2, "0")}${now.getUTCHours().toString().padStart(2, "0")}`;
    const dayKey = `${REDIS_PREFIX}spend:day:${now.getUTCFullYear()}${(now.getUTCMonth() + 1).toString().padStart(2, "0")}${now.getUTCDate().toString().padStart(2, "0")}`;

    // Check rate limit (calls per minute)
    const currentCalls = await redis.get<number>(minuteKey);
    const maxCalls = MAX_CALLS_PER_MINUTE[provider] ?? MAX_CALLS_PER_MINUTE["_default"];
    if (currentCalls !== null && currentCalls >= maxCalls) {
      console.warn(`[circuit-breaker] Rate limit tripped for ${provider}: ${currentCalls}/${maxCalls} calls/min`);
      return false;
    }

    // Check hourly spend
    const hourlySpend = await redis.get<number>(hourKey);
    if (hourlySpend !== null && hourlySpend >= MAX_HOURLY_SPEND_USD) {
      console.warn(`[circuit-breaker] Hourly spend limit tripped: $${hourlySpend.toFixed(2)}/$${MAX_HOURLY_SPEND_USD}`);
      return false;
    }

    // Check daily spend
    const dailySpend = await redis.get<number>(dayKey);
    if (dailySpend !== null && dailySpend >= MAX_DAILY_SPEND_USD) {
      console.warn(`[circuit-breaker] Daily spend limit tripped: $${dailySpend.toFixed(2)}/$${MAX_DAILY_SPEND_USD}`);
      return false;
    }

    return true;
  } catch {
    return true; // Fail open on Redis errors
  }
}

/**
 * Record a provider call (increment rate counter + spend).
 * Called after a successful AI call.
 */
export async function recordProviderCall(provider: string, costUsd: number): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    const now = new Date();
    const minuteKey = `${REDIS_PREFIX}rpm:${provider}:${now.getUTCFullYear()}${(now.getUTCMonth() + 1).toString().padStart(2, "0")}${now.getUTCDate().toString().padStart(2, "0")}${now.getUTCHours().toString().padStart(2, "0")}${now.getUTCMinutes().toString().padStart(2, "0")}`;
    const hourKey = `${REDIS_PREFIX}spend:hour:${now.getUTCFullYear()}${(now.getUTCMonth() + 1).toString().padStart(2, "0")}${now.getUTCDate().toString().padStart(2, "0")}${now.getUTCHours().toString().padStart(2, "0")}`;
    const dayKey = `${REDIS_PREFIX}spend:day:${now.getUTCFullYear()}${(now.getUTCMonth() + 1).toString().padStart(2, "0")}${now.getUTCDate().toString().padStart(2, "0")}`;

    // Fire-and-forget: increment counters with TTL
    await Promise.allSettled([
      redis.incr(minuteKey).then(() => redis.expire(minuteKey, 120)),        // 2 min TTL
      redis.incrbyfloat(hourKey, costUsd).then(() => redis.expire(hourKey, 7200)),  // 2 hour TTL
      redis.incrbyfloat(dayKey, costUsd).then(() => redis.expire(dayKey, 172800)),  // 2 day TTL
    ]);
  } catch {
    // Non-critical — don't break the AI call
  }
}

/**
 * Get current circuit breaker status for admin dashboard.
 */
export async function getCircuitBreakerStatus(): Promise<{
  providers: Record<string, { callsPerMinute: number; maxCallsPerMinute: number; tripped: boolean }>;
  hourlySpendUsd: number;
  maxHourlySpendUsd: number;
  dailySpendUsd: number;
  maxDailySpendUsd: number;
  hourlyTripped: boolean;
  dailyTripped: boolean;
} | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const now = new Date();
    const minuteSuffix = `${now.getUTCFullYear()}${(now.getUTCMonth() + 1).toString().padStart(2, "0")}${now.getUTCDate().toString().padStart(2, "0")}${now.getUTCHours().toString().padStart(2, "0")}${now.getUTCMinutes().toString().padStart(2, "0")}`;
    const hourSuffix = `${now.getUTCFullYear()}${(now.getUTCMonth() + 1).toString().padStart(2, "0")}${now.getUTCDate().toString().padStart(2, "0")}${now.getUTCHours().toString().padStart(2, "0")}`;
    const daySuffix = `${now.getUTCFullYear()}${(now.getUTCMonth() + 1).toString().padStart(2, "0")}${now.getUTCDate().toString().padStart(2, "0")}`;

    // Check main providers
    const providerKeys = ["claude", "grok-text-nonreasoning", "grok-text-reasoning", "grok-image", "grok-video"];
    const providers: Record<string, { callsPerMinute: number; maxCallsPerMinute: number; tripped: boolean }> = {};

    for (const p of providerKeys) {
      const calls = await redis.get<number>(`${REDIS_PREFIX}rpm:${p}:${minuteSuffix}`) ?? 0;
      const max = MAX_CALLS_PER_MINUTE[p] ?? MAX_CALLS_PER_MINUTE["_default"];
      providers[p] = { callsPerMinute: calls, maxCallsPerMinute: max, tripped: calls >= max };
    }

    const hourlySpend = await redis.get<number>(`${REDIS_PREFIX}spend:hour:${hourSuffix}`) ?? 0;
    const dailySpend = await redis.get<number>(`${REDIS_PREFIX}spend:day:${daySuffix}`) ?? 0;

    return {
      providers,
      hourlySpendUsd: Math.round(hourlySpend * 10000) / 10000,
      maxHourlySpendUsd: MAX_HOURLY_SPEND_USD,
      dailySpendUsd: Math.round(dailySpend * 10000) / 10000,
      maxDailySpendUsd: MAX_DAILY_SPEND_USD,
      hourlyTripped: hourlySpend >= MAX_HOURLY_SPEND_USD,
      dailyTripped: dailySpend >= MAX_DAILY_SPEND_USD,
    };
  } catch {
    return null;
  }
}
