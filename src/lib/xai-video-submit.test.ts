/**
 * Video Job Submission — Unit Tests
 * ===================================
 * Tests the submitVideoJob() function's auth handling and fallback logic.
 * Verifies that when Grok returns 401/403, it falls back to Kie.ai.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock env before importing xai module ──
vi.mock("@/lib/bible/env", () => ({
  env: {
    XAI_API_KEY: "xai-test-key-1234567890",
  },
}));

// ── Mock cost tracking (no-op in tests) ──
vi.mock("@/lib/ai/costs", () => ({
  trackCost: vi.fn(),
  COST_TABLE: {
    "grok-video": { perSecond: 0.05 },
    "grok-text": { perMInputTokens: 0.20, perMOutputTokens: 0.50 },
    "grok-image": { perCall: 0.02 },
    "grok-image-pro": { perCall: 0.07 },
    "grok-img2vid": { perSecond: 0.05 },
  },
}));

// ── Mock Kie.ai fallback ──
const mockGenerateWithKie = vi.fn();
vi.mock("@/lib/media/free-video-gen", () => ({
  generateWithKie: (...args: unknown[]) => mockGenerateWithKie(...args),
}));

// ── Mock OpenAI (used by getClient for text gen — not needed for video submit) ──
vi.mock("openai", () => ({
  default: vi.fn(),
}));

// ── Mock global fetch ──
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { submitVideoJob, checkGrokVideoAuth } from "./xai";

beforeEach(() => {
  vi.clearAllMocks();
  mockGenerateWithKie.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── submitVideoJob ──────────────────────────────────────────────────

describe("submitVideoJob", () => {
  it("returns grok request_id on successful submission", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ request_id: "grok-req-123" }),
    });

    const result = await submitVideoJob("A cinematic shot of a sunset", 10, "16:9");

    expect(result.provider).toBe("grok");
    expect(result.requestId).toBe("grok-req-123");
    expect(result.fellBack).toBe(false);
    expect(result.videoUrl).toBeNull();
  });

  it("returns video URL on synchronous Grok response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ video: { url: "https://grok.video/result.mp4" } }),
    });

    const result = await submitVideoJob("A cinematic shot", 5);

    expect(result.provider).toBe("grok");
    expect(result.videoUrl).toBe("https://grok.video/result.mp4");
    expect(result.requestId).toBeNull();
    expect(result.fellBack).toBe(false);
  });

  it("falls back to Kie.ai on 401 Unauthorized", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });
    mockGenerateWithKie.mockResolvedValueOnce("https://kie.ai/fallback-video.mp4");

    const result = await submitVideoJob("A dramatic scene", 10, "16:9");

    expect(result.provider).toBe("kie");
    expect(result.fellBack).toBe(true);
    expect(result.videoUrl).toBe("https://kie.ai/fallback-video.mp4");
    expect(result.requestId).toBeNull();
    expect(mockGenerateWithKie).toHaveBeenCalledOnce();
  });

  it("falls back to Kie.ai on 403 Forbidden", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => "Forbidden — insufficient permissions",
    });
    mockGenerateWithKie.mockResolvedValueOnce("https://kie.ai/video-403.mp4");

    const result = await submitVideoJob("An action scene", 10);

    expect(result.provider).toBe("kie");
    expect(result.fellBack).toBe(true);
    expect(result.videoUrl).toBe("https://kie.ai/video-403.mp4");
  });

  it("falls back to Kie.ai on 429 rate limit", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => "Rate limit exceeded",
    });
    mockGenerateWithKie.mockResolvedValueOnce("https://kie.ai/video-429.mp4");

    const result = await submitVideoJob("A peaceful scene", 5);

    expect(result.provider).toBe("kie");
    expect(result.fellBack).toBe(true);
  });

  it("returns 'none' when both Grok and Kie.ai fail", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });
    mockGenerateWithKie.mockResolvedValueOnce(null); // Kie.ai also fails

    const result = await submitVideoJob("A scene", 10);

    expect(result.provider).toBe("none");
    expect(result.fellBack).toBe(true); // did attempt fallback
    expect(result.requestId).toBeNull();
    expect(result.videoUrl).toBeNull();
  });

  it("returns 'none' for non-auth errors without fallback", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });

    const result = await submitVideoJob("A scene", 10);

    expect(result.provider).toBe("none");
    expect(result.fellBack).toBe(false);
    expect(mockGenerateWithKie).not.toHaveBeenCalled();
  });

  it("falls back on network errors", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    mockGenerateWithKie.mockResolvedValueOnce("https://kie.ai/network-fallback.mp4");

    const result = await submitVideoJob("A scene", 10);

    expect(result.provider).toBe("kie");
    expect(result.fellBack).toBe(true);
    expect(result.videoUrl).toBe("https://kie.ai/network-fallback.mp4");
  });

  it("logs masked API key on error (not full key)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });
    mockGenerateWithKie.mockResolvedValueOnce(null);

    await submitVideoJob("A scene", 10);

    // Check that error log contains masked key, not full key
    const errorCalls = consoleSpy.mock.calls.map(c => c.join(" "));
    const hasKeyLog = errorCalls.some(msg => msg.includes("xai-...7890"));
    const hasFullKey = errorCalls.some(msg => msg.includes("xai-test-key-1234567890"));
    expect(hasKeyLog).toBe(true);
    expect(hasFullKey).toBe(false);

    consoleSpy.mockRestore();
  });
});

// ── checkGrokVideoAuth ──────────────────────────────────────────────

describe("checkGrokVideoAuth", () => {
  it("returns ok when API key is valid", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    const result = await checkGrokVideoAuth();

    expect(result.ok).toBe(true);
    expect(result.keyConfigured).toBe(true);
    expect(result.maskedKey).toBe("xai-...7890");
  });

  it("returns error details on 401", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "Invalid API key",
    });

    const result = await checkGrokVideoAuth();

    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(result.error).toBe("Invalid API key");
    expect(result.keyConfigured).toBe(true);
  });

  it("handles network errors", async () => {
    mockFetch.mockRejectedValueOnce(new Error("DNS resolution failed"));

    const result = await checkGrokVideoAuth();

    expect(result.ok).toBe(false);
    expect(result.status).toBeNull();
    expect(result.error).toBe("DNS resolution failed");
  });
});
