/**
 * TTL Cache — Unit Tests
 * =======================
 * Tests the in-memory cache used for hot data across all repositories.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { cache, TTL } from "./cache";

beforeEach(() => {
  cache.clear();
});

describe("TTLCache.get / .set", () => {
  it("returns null for missing keys", () => {
    expect(cache.get("nonexistent")).toBeNull();
  });

  it("stores and retrieves a value", () => {
    cache.set("key1", 60, "hello");
    expect(cache.get("key1")).toBe("hello");
  });

  it("stores complex objects", () => {
    const obj = { personas: [{ id: "glitch-001" }], count: 42 };
    cache.set("complex", 60, obj);
    expect(cache.get("complex")).toEqual(obj);
  });

  it("returns null for expired entries", () => {
    vi.useFakeTimers();
    cache.set("expiring", 5, "value");
    expect(cache.get("expiring")).toBe("value");

    vi.advanceTimersByTime(6_000); // advance past 5s TTL
    expect(cache.get("expiring")).toBeNull();
    vi.useRealTimers();
  });

  it("does not expire entries before TTL", () => {
    vi.useFakeTimers();
    cache.set("safe", 10, "stillhere");
    vi.advanceTimersByTime(9_000); // 9s < 10s TTL
    expect(cache.get("safe")).toBe("stillhere");
    vi.useRealTimers();
  });
});

describe("TTLCache.getOrSet", () => {
  it("calls compute on cache miss", async () => {
    const compute = vi.fn().mockResolvedValue("computed");
    const value = await cache.getOrSet("miss", 60, compute);
    expect(value).toBe("computed");
    expect(compute).toHaveBeenCalledOnce();
  });

  it("returns cached value on cache hit (no recompute)", async () => {
    cache.set("hit", 60, "cached");
    const compute = vi.fn().mockResolvedValue("recomputed");
    const value = await cache.getOrSet("hit", 60, compute);
    expect(value).toBe("cached");
    expect(compute).not.toHaveBeenCalled();
  });

  it("serves stale value and revalidates in background after TTL expires", async () => {
    vi.useFakeTimers();
    cache.set("recompute", 5, "old");
    vi.advanceTimersByTime(6_000); // 6s > 5s TTL, but within stale grace (2x = 10s)

    const compute = vi.fn().mockResolvedValue("new");
    const value = await cache.getOrSet("recompute", 5, compute);
    // Stale-while-revalidate: returns stale instantly, refreshes in background
    expect(value).toBe("old");
    // Background revalidation was triggered
    await vi.advanceTimersByTimeAsync(0); // flush microtasks
    expect(compute).toHaveBeenCalledOnce();
    // Now the cache has the fresh value
    expect(cache.get("recompute")).toBe("new");
    vi.useRealTimers();
  });

  it("recomputes fully when stale grace window is exceeded", async () => {
    vi.useFakeTimers();
    cache.set("old-key", 5, "old");
    vi.advanceTimersByTime(16_000); // 16s > stale grace (5s TTL + 10s grace = 15s)

    const compute = vi.fn().mockResolvedValue("new");
    const value = await cache.getOrSet("old-key", 5, compute);
    expect(value).toBe("new");
    expect(compute).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});

describe("TTLCache.del", () => {
  it("deletes a key", () => {
    cache.set("to-delete", 60, "value");
    expect(cache.del("to-delete")).toBe(true);
    expect(cache.get("to-delete")).toBeNull();
  });

  it("returns false for missing key", () => {
    expect(cache.del("nonexistent")).toBe(false);
  });
});

describe("TTLCache.invalidatePrefix", () => {
  it("deletes all keys with matching prefix", () => {
    cache.set("personas:active", 60, [1, 2]);
    cache.set("personas:byId:001", 60, { id: 1 });
    cache.set("posts:feed", 60, [3, 4]);

    const count = cache.invalidatePrefix("personas:");
    expect(count).toBe(2);
    expect(cache.get("personas:active")).toBeNull();
    expect(cache.get("personas:byId:001")).toBeNull();
    expect(cache.get("posts:feed")).toEqual([3, 4]); // untouched
  });
});

describe("TTLCache.clear", () => {
  it("empties the cache completely", () => {
    cache.set("a", 60, 1);
    cache.set("b", 60, 2);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get("a")).toBeNull();
  });
});

describe("TTLCache.size", () => {
  it("tracks entry count", () => {
    expect(cache.size).toBe(0);
    cache.set("a", 60, 1);
    cache.set("b", 60, 2);
    expect(cache.size).toBe(2);
    cache.del("a");
    expect(cache.size).toBe(1);
  });
});

describe("TTLCache eviction", () => {
  it("evicts oldest entry when at capacity", () => {
    // Create a small cache by filling the shared one to capacity
    // The shared cache has 500 slots — we'll test the eviction behavior
    // by filling it and checking that old entries are evicted
    cache.clear();
    for (let i = 0; i < 500; i++) {
      cache.set(`fill-${i}`, 60, i);
    }
    expect(cache.size).toBe(500);

    // Adding one more should evict the oldest
    cache.set("overflow", 60, "new");
    expect(cache.size).toBeLessThanOrEqual(500);
    expect(cache.get("overflow")).toBe("new");
  });
});

describe("TTL constants", () => {
  it("has reasonable TTL values", () => {
    expect(TTL.personas).toBeGreaterThan(0);
    expect(TTL.settings).toBeGreaterThan(0);
    expect(TTL.prices).toBeGreaterThan(0);
    expect(TTL.feed).toBeGreaterThan(0);
    // Personas should cache longer than prices
    expect(TTL.personas).toBeGreaterThan(TTL.prices);
  });
});
