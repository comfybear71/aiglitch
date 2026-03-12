/**
 * In-memory sliding-window rate limiter.
 * Falls back gracefully — no external dependencies required.
 *
 * Usage:
 *   const limiter = createRateLimiter({ maxAttempts: 5, windowMs: 15 * 60 * 1000 });
 *   const result = limiter.check(ip);
 *   if (!result.allowed) { return 429; }
 */

interface RateLimitEntry {
  timestamps: number[];
}

interface RateLimiterConfig {
  /** Maximum number of attempts allowed within the window. */
  maxAttempts: number;
  /** Sliding window duration in milliseconds. */
  windowMs: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

export function createRateLimiter(config: RateLimiterConfig) {
  const store = new Map<string, RateLimitEntry>();

  // Periodic cleanup every 5 minutes to prevent memory leaks
  const CLEANUP_INTERVAL = 5 * 60 * 1000;
  let lastCleanup = Date.now();

  function cleanup() {
    const now = Date.now();
    if (now - lastCleanup < CLEANUP_INTERVAL) return;
    lastCleanup = now;
    const cutoff = now - config.windowMs;
    for (const [key, entry] of store) {
      entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
      if (entry.timestamps.length === 0) {
        store.delete(key);
      }
    }
  }

  function check(key: string): RateLimitResult {
    cleanup();
    const now = Date.now();
    const cutoff = now - config.windowMs;

    let entry = store.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      store.set(key, entry);
    }

    // Remove expired timestamps
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

    if (entry.timestamps.length >= config.maxAttempts) {
      const oldestInWindow = entry.timestamps[0];
      return {
        allowed: false,
        remaining: 0,
        resetMs: oldestInWindow + config.windowMs - now,
      };
    }

    // Record this attempt
    entry.timestamps.push(now);

    return {
      allowed: true,
      remaining: config.maxAttempts - entry.timestamps.length,
      resetMs: config.windowMs,
    };
  }

  /** Reset a specific key (useful in tests). */
  function reset(key: string) {
    store.delete(key);
  }

  /** Clear all entries (useful in tests). */
  function clear() {
    store.clear();
  }

  return { check, reset, clear };
}

/**
 * Admin login rate limiter: 5 attempts per IP per 15 minutes.
 */
export const adminLoginLimiter = createRateLimiter({
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000,
});

/**
 * Cron endpoint rate limiter: 30 requests per endpoint per 5 minutes.
 * Protects against runaway cron triggers and brute-force auth attempts.
 */
export const cronEndpointLimiter = createRateLimiter({
  maxAttempts: 30,
  windowMs: 5 * 60 * 1000,
});

/**
 * Public API rate limiter: 120 requests per IP per minute.
 * Protects feed, personas, and other public endpoints from abuse.
 */
export const publicApiLimiter = createRateLimiter({
  maxAttempts: 120,
  windowMs: 60 * 1000,
});
