/**
 * Bible Schemas — Unit Tests
 * ===========================
 * Validates that Zod schemas accept valid data and reject invalid data.
 */

import { describe, it, expect } from "vitest";
import {
  zId, zSessionId, zPersonaId, zPostId, zPositiveInt, zPositiveReal,
  zUsername, zUserContent, zWalletAddress,
  SessionPayload, TogglePayload, PaginationParams, FeedParams,
  InteractPayload, CoinPayload, TradePayload, OtcSwapPayload,
  SearchParams, MessagePayload, FriendPayload, ProfilePayload,
  searchParamsToObject, apiError, parseOrError,
} from "./schemas";

// ── Primitives ──────────────────────────────────────────────────────

describe("zId", () => {
  it("accepts non-empty strings", () => {
    expect(zId.parse("abc-123")).toBe("abc-123");
  });

  it("rejects empty strings", () => {
    expect(() => zId.parse("")).toThrow();
  });

  it("trims whitespace", () => {
    expect(zId.parse("  hello  ")).toBe("hello");
  });
});

describe("zPersonaId", () => {
  it("accepts valid format glitch-NNN", () => {
    expect(zPersonaId.parse("glitch-001")).toBe("glitch-001");
    expect(zPersonaId.parse("glitch-047")).toBe("glitch-047");
    expect(zPersonaId.parse("glitch-999")).toBe("glitch-999");
  });

  it("rejects invalid formats", () => {
    expect(() => zPersonaId.parse("glitch-1")).toThrow();
    expect(() => zPersonaId.parse("glitch-1234")).toThrow();
    expect(() => zPersonaId.parse("persona-001")).toThrow();
    expect(() => zPersonaId.parse("")).toThrow();
  });
});

describe("zUsername", () => {
  it("accepts valid usernames", () => {
    expect(zUsername.parse("techno_king")).toBe("techno_king");
    expect(zUsername.parse("User123")).toBe("User123");
  });

  it("rejects usernames with special characters", () => {
    expect(() => zUsername.parse("user@name")).toThrow();
    expect(() => zUsername.parse("user name")).toThrow();
  });

  it("rejects usernames exceeding max length", () => {
    expect(() => zUsername.parse("a".repeat(21))).toThrow();
  });
});

describe("zUserContent", () => {
  it("accepts valid content", () => {
    expect(zUserContent.parse("Hello AI!")).toBe("Hello AI!");
  });

  it("rejects empty content", () => {
    expect(() => zUserContent.parse("")).toThrow();
  });

  it("rejects content exceeding max length (300 chars)", () => {
    expect(() => zUserContent.parse("x".repeat(301))).toThrow();
  });
});

describe("zWalletAddress", () => {
  it("accepts valid Solana addresses", () => {
    expect(zWalletAddress.parse("7SGf93WGk7VpSmreARzNujPbEpyABq2Em9YvaCirWi56")).toBeDefined();
    expect(zWalletAddress.parse("2J2XWm3oZo9JUu6i5ceAsoDmeFZw5trBhjdfm2G72uTJ")).toBeDefined();
  });

  it("rejects invalid addresses", () => {
    expect(() => zWalletAddress.parse("short")).toThrow();
    expect(() => zWalletAddress.parse("")).toThrow();
    // Contains invalid base58 char (0, O, I, l)
    expect(() => zWalletAddress.parse("0000000000000000000000000000000000000000000")).toThrow();
  });
});

describe("zPositiveInt", () => {
  it("accepts positive integers", () => {
    expect(zPositiveInt.parse(1)).toBe(1);
    expect(zPositiveInt.parse(100)).toBe(100);
  });

  it("rejects zero, negatives, and floats", () => {
    expect(() => zPositiveInt.parse(0)).toThrow();
    expect(() => zPositiveInt.parse(-1)).toThrow();
    expect(() => zPositiveInt.parse(1.5)).toThrow();
  });
});

// ── Composite Payloads ──────────────────────────────────────────────

describe("SessionPayload", () => {
  it("accepts valid payload", () => {
    const result = SessionPayload.parse({ session_id: "abc-123" });
    expect(result.session_id).toBe("abc-123");
  });

  it("rejects missing session_id", () => {
    expect(() => SessionPayload.parse({})).toThrow();
  });
});

describe("TogglePayload", () => {
  it("accepts valid toggle", () => {
    const result = TogglePayload.parse({ session_id: "s1", post_id: "p1" });
    expect(result.session_id).toBe("s1");
    expect(result.post_id).toBe("p1");
  });
});

describe("PaginationParams", () => {
  it("applies defaults", () => {
    const result = PaginationParams.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(10);
  });

  it("coerces string numbers", () => {
    const result = PaginationParams.parse({ page: "3", limit: "25" });
    expect(result.page).toBe(3);
    expect(result.limit).toBe(25);
  });

  it("rejects limit > 50", () => {
    expect(() => PaginationParams.parse({ limit: 100 })).toThrow();
  });
});

describe("InteractPayload", () => {
  it("accepts valid interaction", () => {
    const result = InteractPayload.parse({
      session_id: "s1",
      post_id: "p1",
      action: "like",
    });
    expect(result.action).toBe("like");
  });

  it("rejects invalid action", () => {
    expect(() => InteractPayload.parse({
      session_id: "s1",
      post_id: "p1",
      action: "invalid",
    })).toThrow();
  });

  it("accepts all valid actions", () => {
    const actions = ["like", "unlike", "comment", "follow", "unfollow", "bookmark", "unbookmark"];
    for (const action of actions) {
      const result = InteractPayload.parse({ session_id: "s1", action });
      expect(result.action).toBe(action);
    }
  });
});

describe("OtcSwapPayload", () => {
  it("accepts valid swap", () => {
    const result = OtcSwapPayload.parse({
      buyer_wallet: "7SGf93WGk7VpSmreARzNujPbEpyABq2Em9YvaCirWi56",
      glitch_amount: 500,
    });
    expect(result.glitch_amount).toBe(500);
  });

  it("rejects amount below 100 minimum", () => {
    expect(() => OtcSwapPayload.parse({
      buyer_wallet: "7SGf93WGk7VpSmreARzNujPbEpyABq2Em9YvaCirWi56",
      glitch_amount: 50,
    })).toThrow();
  });
});

describe("SearchParams", () => {
  it("applies defaults for type and limit", () => {
    const result = SearchParams.parse({ q: "test" });
    expect(result.type).toBe("all");
    expect(result.limit).toBe(20);
  });

  it("rejects empty query", () => {
    expect(() => SearchParams.parse({ q: "" })).toThrow();
  });
});

describe("ProfilePayload", () => {
  it("accepts valid profile update", () => {
    const result = ProfilePayload.parse({
      session_id: "s1",
      display_name: "Cool Human",
      bio: "I watch AIs",
    });
    expect(result.display_name).toBe("Cool Human");
  });

  it("rejects bio exceeding 300 chars", () => {
    expect(() => ProfilePayload.parse({
      session_id: "s1",
      bio: "x".repeat(301),
    })).toThrow();
  });
});

// ── Helpers ─────────────────────────────────────────────────────────

describe("searchParamsToObject", () => {
  it("converts URLSearchParams to plain object", () => {
    const params = new URLSearchParams("page=2&limit=10&q=hello");
    const result = searchParamsToObject(params);
    expect(result).toEqual({ page: "2", limit: "10", q: "hello" });
  });
});

describe("apiError", () => {
  it("returns a Response with correct status and body", async () => {
    const res = apiError("Something broke", 422, { field: "name" });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("Something broke");
    expect(body.details).toEqual({ field: "name" });
  });

  it("defaults to 400 status", async () => {
    const res = apiError("Bad request");
    expect(res.status).toBe(400);
  });
});

describe("parseOrError", () => {
  it("returns data on valid input", () => {
    const result = parseOrError(SessionPayload, { session_id: "abc" });
    expect(result.error).toBeNull();
    expect(result.data).toEqual({ session_id: "abc" });
  });

  it("returns error Response on invalid input", () => {
    const result = parseOrError(SessionPayload, {});
    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Response);
    expect(result.error!.status).toBe(400);
  });
});
