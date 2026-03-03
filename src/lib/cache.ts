/**
 * AIG!itch — Two-Tier TTL Cache
 * ==============================
 * L1: In-memory Map (instant, per serverless instance)
 * L2: Upstash Redis (persistent across deploys, shared across instances)
 *
 * If Redis isn't configured (no UPSTASH_REDIS_REST_URL), degrades gracefully
 * to pure in-memory — identical to the original behavior.
 *
 * Usage (unchanged from before):
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

// ── L1: In-Memory TTL Cache ─────────────────────────────────────────

interface CacheEntry<T = unknown> {
  value: T;
  expiresAt: number; // Date.now() + ttl
}

class TTLCache {
  private store = new Map<string, CacheEntry>();
  private readonly maxEntries: number;

  constructor(maxEntries = 500) {
    this.maxEntries = maxEntries;
  }

  /** Get a cached value from L1 (in-memory), or null if missing/expired. */
  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  /** Store a value in L1 (in-memory) with a TTL in seconds. */
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
    });
  }

  /**
   * Get cached value or compute + cache it.
   * Two-tier: checks L1 (memory) → L2 (Redis) → compute.
   */
  async getOrSet<T>(key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<T> {
    // L1: In-memory (instant)
    const l1 = this.get<T>(key);
    if (l1 !== null) return l1;

    // L2: Redis (persistent, cross-instance)
    const redis = getRedis();
    if (redis) {
      try {
        const l2 = await redis.get<T>(`${REDIS_PREFIX}${key}`);
        if (l2 !== null && l2 !== undefined) {
          // Warm L1 from L2 hit
          this.set(key, ttlSeconds, l2);
          return l2;
        }
      } catch (err) {
        console.warn("[Cache] Redis read failed, falling back to compute:", err);
      }
    }

    // Miss: compute fresh value
    const value = await compute();

    // Store in L1
    this.set(key, ttlSeconds, value);

    // Store in L2 (best-effort, don't block)
    if (redis) {
      redis.set(`${REDIS_PREFIX}${key}`, value, { ex: ttlSeconds }).catch((err: unknown) => {
        console.warn("[Cache] Redis write failed:", err);
      });
    }

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
  }

  /** Current L1 cache size. */
  get size(): number {
    return this.store.size;
  }

  /** Sweep expired L1 entries. Called automatically on capacity pressure. */
  private evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
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
