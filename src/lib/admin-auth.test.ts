/**
 * Admin Authentication — Security Tests
 * ======================================
 * Proves that the admin login correctly rejects wrong/empty passwords
 * and only accepts the exact ADMIN_PASSWORD.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { safeEqual, generateToken } from "./admin-auth";
import { createRateLimiter } from "./rate-limit";

// ── safeEqual (constant-time comparison) ────────────────────────────

describe("safeEqual", () => {
  it("returns true for identical strings", () => {
    expect(safeEqual("correct-password", "correct-password")).toBe(true);
  });

  it("returns false for different strings of same length", () => {
    expect(safeEqual("correct-passwor1", "correct-passwor2")).toBe(false);
  });

  it("returns false for different lengths", () => {
    expect(safeEqual("short", "much-longer-string")).toBe(false);
  });

  it("returns false for empty vs non-empty", () => {
    expect(safeEqual("", "password")).toBe(false);
  });

  it("returns true for two empty strings", () => {
    expect(safeEqual("", "")).toBe(true);
  });

  it("returns false for non-string inputs", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(safeEqual(undefined as any, "password")).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(safeEqual("password", null as any)).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(safeEqual(123 as any, "password")).toBe(false);
  });
});

// ── generateToken (HMAC-based) ──────────────────────────────────────

describe("generateToken", () => {
  it("returns a hex string", () => {
    const token = generateToken("test-password");
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for same password within the same process", () => {
    const t1 = generateToken("same-password");
    const t2 = generateToken("same-password");
    expect(t1).toBe(t2);
  });

  it("produces different tokens for different passwords", () => {
    const t1 = generateToken("password-a");
    const t2 = generateToken("password-b");
    expect(t1).not.toBe(t2);
  });
});

// ── Admin login route logic (unit-level simulation) ─────────────────

describe("admin login password verification", () => {
  const CORRECT_PASSWORD = "aiglitch-admin-2024";

  it("rejects wrong password", () => {
    expect(safeEqual("wrong-password", CORRECT_PASSWORD)).toBe(false);
  });

  it("rejects empty string password", () => {
    expect(safeEqual("", CORRECT_PASSWORD)).toBe(false);
  });

  it("rejects password with extra whitespace", () => {
    expect(safeEqual(" aiglitch-admin-2024 ", CORRECT_PASSWORD)).toBe(false);
  });

  it("rejects similar but different password", () => {
    expect(safeEqual("aiglitch-admin-2025", CORRECT_PASSWORD)).toBe(false);
  });

  it("accepts exact correct password", () => {
    expect(safeEqual(CORRECT_PASSWORD, CORRECT_PASSWORD)).toBe(true);
  });

  it("rejects non-string inputs gracefully", () => {
    // Simulates malformed JSON body where password is a number or object
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(safeEqual(undefined as any, CORRECT_PASSWORD)).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(safeEqual(null as any, CORRECT_PASSWORD)).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(safeEqual({} as any, CORRECT_PASSWORD)).toBe(false);
  });
});

// ── Rate limiter ────────────────────────────────────────────────────

describe("admin login rate limiter", () => {
  it("allows up to 5 attempts", () => {
    const limiter = createRateLimiter({ maxAttempts: 5, windowMs: 15 * 60 * 1000 });
    const ip = "192.168.1.1";
    for (let i = 0; i < 5; i++) {
      const result = limiter.check(ip);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4 - i);
    }
  });

  it("blocks the 6th attempt", () => {
    const limiter = createRateLimiter({ maxAttempts: 5, windowMs: 15 * 60 * 1000 });
    const ip = "10.0.0.1";
    for (let i = 0; i < 5; i++) {
      limiter.check(ip);
    }
    const blocked = limiter.check(ip);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.resetMs).toBeGreaterThan(0);
  });

  it("does not block different IPs", () => {
    const limiter = createRateLimiter({ maxAttempts: 5, windowMs: 15 * 60 * 1000 });
    // Exhaust one IP
    for (let i = 0; i < 5; i++) {
      limiter.check("ip-a");
    }
    expect(limiter.check("ip-a").allowed).toBe(false);
    // Different IP should still be allowed
    expect(limiter.check("ip-b").allowed).toBe(true);
  });

  it("resets after window expires", () => {
    const limiter = createRateLimiter({ maxAttempts: 2, windowMs: 100 });
    const ip = "127.0.0.1";
    limiter.check(ip);
    limiter.check(ip);
    expect(limiter.check(ip).allowed).toBe(false);

    // Fast-forward time via vi.useFakeTimers
    vi.useFakeTimers();
    vi.advanceTimersByTime(150);
    expect(limiter.check(ip).allowed).toBe(true);
    vi.useRealTimers();
  });

  it("clear() resets all entries", () => {
    const limiter = createRateLimiter({ maxAttempts: 1, windowMs: 60000 });
    limiter.check("ip-x");
    expect(limiter.check("ip-x").allowed).toBe(false);
    limiter.clear();
    expect(limiter.check("ip-x").allowed).toBe(true);
  });
});
