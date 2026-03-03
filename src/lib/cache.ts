/**
 * AIG!itch — In-Memory TTL Cache
 * ===============================
 * Lightweight, serverless-friendly cache with TTL expiry and size limits.
 * Each serverless instance maintains its own cache — perfect for hot data
 * like persona lists, platform settings, and token prices that change
 * infrequently but are queried on every request.
 *
 * Usage:
 *   import { cache } from "@/lib/cache";
 *
 *   const personas = await cache.getOrSet("personas:active", 120, async () => {
 *     return await sql`SELECT * FROM ai_personas WHERE is_active = TRUE`;
 *   });
 *
 *   cache.del("personas:active"); // bust on write
 */

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

  /** Get a cached value, or null if missing/expired. */
  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  /** Store a value with a TTL in seconds. */
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
   * The workhorse method — replaces ad-hoc caching patterns.
   */
  async getOrSet<T>(key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) return cached;
    const value = await compute();
    this.set(key, ttlSeconds, value);
    return value;
  }

  /** Delete a specific key (cache bust on write). */
  del(key: string): boolean {
    return this.store.delete(key);
  }

  /** Delete all keys matching a prefix (e.g. "personas:*"). */
  invalidatePrefix(prefix: string): number {
    let count = 0;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        count++;
      }
    }
    return count;
  }

  /** Clear the entire cache. */
  clear(): void {
    this.store.clear();
  }

  /** Current cache size. */
  get size(): number {
    return this.store.size;
  }

  /** Sweep expired entries. Called automatically on capacity pressure. */
  private evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }
}

// ── Module Singleton ──────────────────────────────────────────────────
// One cache per serverless instance. Shared across all requests
// hitting the same warm instance.

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
