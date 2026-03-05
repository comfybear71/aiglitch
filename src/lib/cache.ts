/**
 * AIG!itch — Two-Tier TTL Cache (Performance-Tuned)
 * ==================================================
 * L1: In-memory Map (instant, per serverless instance)
 * L2: Upstash Redis (persistent across deploys, shared across instances)
 *
 * Performance features:
 * - Redis reads capped at 150ms via Promise.race (prevents slow Redis from blocking pages)
 * - Stale-while-revalidate: serves expired L1 entries instantly, refreshes in background
 * - Fire-and-forget Redis writes (never block on L2 writes)
 * - Timing metrics for diagnostics via getCacheMetrics()
 *
 * If Redis isn't configured (no UPSTASH_REDIS_REST_URL), degrades gracefully
 * to pure in-memory — identical to the original behavior.
 *
 * Usage (unchanged):
 *   import { cache, TTL } from "@/lib/cache";
 *
 *   const personas = await cache.getOrSet("personas:active", 120, async () => {
 *     return await sql`SELECT * FROM ai_personas WHERE is_active = TRUE`;
 *   });
 *
 *   cache.del("personas:active"); // bust on write
 */

import { Redis } from "@upstash/redis";

// ── Redis Client (lazy singleton) ───────────────────────────────────

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
    } catch (err) {
      console.warn("[Cache] Failed to init Redis, using in-memory only:", err);
    }
  }
  return _redis;
}

const REDIS_PREFIX = "aiglitch:";

// ── Performance Tuning ──────────────────────────────────────────────

/** Hard cap on Redis read latency — after this, treat as a miss. */
const REDIS_READ_TIMEOUT_MS = 150;

/** Entries within this factor of their TTL after expiry are "stale but usable". */
const STALE_GRACE_FACTOR = 2; // serve stale up to 2x TTL

/** Log warnings for cache operations exceeding this threshold. */
const SLOW_OP_THRESHOLD_MS = 100;

// ── Metrics ─────────────────────────────────────────────────────────

interface CacheMetrics {
  l1Hits: number;
  l1Misses: number;
  l1StaleHits: number;
  l2Hits: number;
  l2Misses: number;
  l2Timeouts: number;
  l2Errors: number;
  computes: number;
  slowOps: number;
}

const metrics: CacheMetrics = {
  l1Hits: 0,
  l1Misses: 0,
  l1StaleHits: 0,
  l2Hits: 0,
  l2Misses: 0,
  l2Timeouts: 0,
  l2Errors: 0,
  computes: 0,
  slowOps: 0,
};

/** Returns a snapshot of cache performance metrics (useful for /api/health). */
export function getCacheMetrics(): Readonly<CacheMetrics> {
  return { ...metrics };
}

/** Reset metrics (useful in tests). */
export function resetCacheMetrics(): void {
  metrics.l1Hits = 0;
  metrics.l1Misses = 0;
  metrics.l1StaleHits = 0;
  metrics.l2Hits = 0;
  metrics.l2Misses = 0;
  metrics.l2Timeouts = 0;
  metrics.l2Errors = 0;
  metrics.computes = 0;
  metrics.slowOps = 0;
}

// ── Redis with timeout ──────────────────────────────────────────────

const TIMEOUT_SENTINEL = Symbol("timeout");

async function redisGetWithTimeout<T>(
  redis: Redis,
  key: string,
): Promise<T | null> {
  const start = Date.now();
  try {
    const result = await Promise.race([
      redis.get<T>(key),
      new Promise<typeof TIMEOUT_SENTINEL>((resolve) =>
        setTimeout(() => resolve(TIMEOUT_SENTINEL), REDIS_READ_TIMEOUT_MS),
      ),
    ]);

    if (result === TIMEOUT_SENTINEL) {
      metrics.l2Timeouts++;
      const elapsed = Date.now() - start;
      console.warn(`[Cache] Redis read timed out after ${elapsed}ms for key: ${key}`);
      return null;
    }

    return result as T | null;
  } catch (err) {
    metrics.l2Errors++;
    const elapsed = Date.now() - start;
    console.warn(`[Cache] Redis read failed after ${elapsed}ms:`, err);
    return null;
  }
}

// ── L1: In-Memory TTL Cache ─────────────────────────────────────────

interface CacheEntry<T = unknown> {
  value: T;
  expiresAt: number; // Date.now() + ttl
  ttlMs: number;     // original TTL in ms (for stale grace calculation)
}

class TTLCache {
  private store = new Map<string, CacheEntry>();
  private readonly maxEntries: number;
  /** Keys currently being revalidated in background — prevents stampede. */
  private revalidating = new Set<string>();

  constructor(maxEntries = 500) {
    this.maxEntries = maxEntries;
  }

  /** Get a fresh (non-expired) value from L1, or null. */
  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      // Don't delete — stale entries are still usable for SWR
      return null;
    }
    return entry.value as T;
  }

  /**
   * Get a stale (expired but within grace window) value from L1.
   * Returns null if the entry doesn't exist or has exceeded the grace window.
   */
  private getStale<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    const now = Date.now();
    if (now <= entry.expiresAt) {
      // Not stale — it's still fresh (caller should have used get())
      return entry.value as T;
    }
    // Check if within stale grace window
    const staleDeadline = entry.expiresAt + entry.ttlMs * STALE_GRACE_FACTOR;
    if (now > staleDeadline) {
      // Too old — evict
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  /** Store a value in L1 with a TTL in seconds. */
  set<T>(key: string, ttlSeconds: number, value: T): void {
    // Evict expired entries when nearing capacity
    if (this.store.size >= this.maxEntries) {
      this.evictExpired();
    }
    // Hard cap: drop oldest if still full
    if (this.store.size >= this.maxEntries) {
      const firstKey = this.store.keys().next().value;
      if (firstKey !== undefined) this.store.delete(firstKey);
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
      ttlMs: ttlSeconds * 1000,
    });
  }

  /**
   * Get cached value or compute + cache it.
   * Four-tier lookup: L1 fresh → L1 stale (+ bg refresh) → L2 with timeout → compute.
   */
  async getOrSet<T>(key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<T> {
    const opStart = Date.now();

    // ── Tier 1: L1 fresh (instant) ──
    const l1 = this.get<T>(key);
    if (l1 !== null) {
      metrics.l1Hits++;
      return l1;
    }

    // ── Tier 2: L1 stale (instant, triggers background refresh) ──
    const stale = this.getStale<T>(key);
    if (stale !== null) {
      metrics.l1StaleHits++;
      // Serve stale immediately, refresh in background
      this.revalidateInBackground(key, ttlSeconds, compute);
      return stale;
    }

    metrics.l1Misses++;

    // ── Tier 3: L2 Redis with timeout ──
    const redis = getRedis();
    if (redis) {
      const l2 = await redisGetWithTimeout<T>(redis, `${REDIS_PREFIX}${key}`);
      if (l2 !== null && l2 !== undefined) {
        metrics.l2Hits++;
        // Warm L1 from L2 hit
        this.set(key, ttlSeconds, l2);
        this.logSlowOp(opStart, key, "L2 hit");
        return l2;
      }
      metrics.l2Misses++;
    }

    // ── Tier 4: Compute fresh value ──
    metrics.computes++;
    const value = await compute();

    // Store in L1
    this.set(key, ttlSeconds, value);

    // Store in L2 (fire-and-forget, never block)
    if (redis) {
      redis.set(`${REDIS_PREFIX}${key}`, value, { ex: ttlSeconds }).catch((err: unknown) => {
        console.warn("[Cache] Redis write failed:", err);
      });
    }

    this.logSlowOp(opStart, key, "compute");
    return value;
  }

  /** Delete a specific key (cache bust on write). Clears both L1 and L2. */
  del(key: string): boolean {
    const deleted = this.store.delete(key);

    // Best-effort L2 cleanup
    const redis = getRedis();
    if (redis) {
      redis.del(`${REDIS_PREFIX}${key}`).catch((err: unknown) => {
        console.warn("[Cache] Redis del failed:", err);
      });
    }

    return deleted;
  }

  /** Delete all keys matching a prefix (e.g. "personas:*"). Clears both tiers. */
  invalidatePrefix(prefix: string): number {
    let count = 0;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        count++;
      }
    }

    // Best-effort L2 prefix cleanup via SCAN + DEL
    const redis = getRedis();
    if (redis) {
      this.redisInvalidatePrefix(`${REDIS_PREFIX}${prefix}`).catch((err: unknown) => {
        console.warn("[Cache] Redis prefix invalidate failed:", err);
      });
    }

    return count;
  }

  /** Clear the entire L1 cache. */
  clear(): void {
    this.store.clear();
    this.revalidating.clear();
  }

  /** Current L1 cache size. */
  get size(): number {
    return this.store.size;
  }

  // ── Private helpers ─────────────────────────────────────────────────

  /** Revalidate a key in the background (stale-while-revalidate). */
  private revalidateInBackground<T>(key: string, ttlSeconds: number, compute: () => Promise<T>): void {
    // Prevent stampede: only one revalidation per key at a time
    if (this.revalidating.has(key)) return;
    this.revalidating.add(key);

    compute()
      .then((value) => {
        this.set(key, ttlSeconds, value);
        // Also update L2
        const redis = getRedis();
        if (redis) {
          redis.set(`${REDIS_PREFIX}${key}`, value, { ex: ttlSeconds }).catch((err: unknown) => {
            console.warn("[Cache] Redis bg-write failed:", err);
          });
        }
      })
      .catch((err) => {
        console.warn(`[Cache] Background revalidation failed for key "${key}":`, err);
      })
      .finally(() => {
        this.revalidating.delete(key);
      });
  }

  /** Sweep expired L1 entries. Called automatically on capacity pressure. */
  private evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      // Evict entries past stale grace too
      const staleDeadline = entry.expiresAt + entry.ttlMs * STALE_GRACE_FACTOR;
      if (now > staleDeadline) {
        this.store.delete(key);
      }
    }
  }

  /** Scan and delete Redis keys matching a prefix pattern. */
  private async redisInvalidatePrefix(prefix: string): Promise<void> {
    const redis = getRedis();
    if (!redis) return;

    let cursor = "0";
    do {
      const result: [string, string[]] = await redis.scan(cursor, { match: `${prefix}*`, count: 100 }) as [string, string[]];
      cursor = result[0];
      const keys = result[1];
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== "0");
  }

  /** Log a warning if a cache operation was slow. */
  private logSlowOp(startMs: number, key: string, tier: string): void {
    const elapsed = Date.now() - startMs;
    if (elapsed > SLOW_OP_THRESHOLD_MS) {
      metrics.slowOps++;
      console.warn(`[Cache] Slow ${tier} for "${key}": ${elapsed}ms`);
    }
  }
}

// ── Module Singleton ──────────────────────────────────────────────────
// One cache per serverless instance. L1 is per-instance, L2 is shared.

export const cache = new TTLCache(500);

// ── Common TTLs ───────────────────────────────────────────────────────
// Centralised so repos don't hardcode magic numbers.

export const TTL = {
  /** Active personas list — changes rarely, queried every page load */
  personas: 120,          // 2 minutes
  /** Single persona by username — medium churn */
  persona: 60,            // 1 minute
  /** Platform settings (prices, toggles) — frequent reads, rare writes */
  settings: 30,           // 30 seconds
  /** Token price data — needs to feel "live" */
  prices: 15,             // 15 seconds
  /** Feed results — short TTL, reduces duplicate queries within a session */
  feed: 10,               // 10 seconds
  /** Trading dashboard aggregates — moderate refresh */
  tradingStats: 20,       // 20 seconds
  /** Premiere genre counts — infrequent change */
  premiereCounts: 60,     // 1 minute
} as const;
