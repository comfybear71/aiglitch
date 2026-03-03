/**
 * AIG!itch Project Bible — Shared Zod Schemas
 * =============================================
 * Reusable validation schemas for API payloads, query params,
 * and common data shapes. Import these in route handlers instead
 * of parsing request.json() blindly.
 *
 * Usage:
 *   import { SessionPayload, PaginationParams } from "@/lib/bible/schemas";
 *
 *   const body = SessionPayload.parse(await request.json());
 *   // body.session_id is now guaranteed to be a non-empty string
 */

import { z } from "zod/v4";
import { HUMAN_RULES } from "./constants";

// ── Primitives ───────────────────────────────────────────────────────

/** UUID-like string (non-empty, trimmed) */
export const zId = z.string().trim().min(1, "ID is required");

/** Session ID — present on virtually every request */
export const zSessionId = z.string().trim().min(1, "session_id is required");

/** Persona ID — format: glitch-NNN */
export const zPersonaId = z.string().trim().regex(/^glitch-\d{3}$/, "Invalid persona ID format");

/** Post ID — non-empty string */
export const zPostId = z.string().trim().min(1, "post_id is required");

/** Positive integer amount (for coins, tokens, etc.) */
export const zPositiveInt = z.number().int().positive("Amount must be a positive integer");

/** Non-negative real amount (for SOL, USD) */
export const zPositiveReal = z.number().positive("Amount must be positive");

/** Username: max length, alphanumeric + underscores */
export const zUsername = z
  .string()
  .trim()
  .min(1, "Username is required")
  .max(HUMAN_RULES.usernameMaxLength, `Username max ${HUMAN_RULES.usernameMaxLength} chars`)
  .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores");

/** User-authored content (comments, messages) — trimmed, length-capped */
export const zUserContent = z
  .string()
  .trim()
  .min(1, "Content is required")
  .max(HUMAN_RULES.commentMaxLength, `Content max ${HUMAN_RULES.commentMaxLength} chars`);

/** Solana wallet address (base58, 32-44 chars) */
export const zWalletAddress = z
  .string()
  .trim()
  .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "Invalid Solana wallet address");

// ── Common Payloads ──────────────────────────────────────────────────

/** Minimum payload: just a session_id */
export const SessionPayload = z.object({
  session_id: zSessionId,
});

/** Like/unlike, bookmark/unbookmark */
export const TogglePayload = z.object({
  session_id: zSessionId,
  post_id: zPostId,
});

/** Pagination params from URL searchParams */
export const PaginationParams = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  cursor: z.string().optional(),
});

/** Feed query params */
export const FeedParams = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  session_id: z.string().optional(),
  following: z.enum(["true", "false"]).optional(),
  persona: z.string().optional(),
  genre: z.string().optional(),
  breaking: z.enum(["true", "false"]).optional(),
});

/** Human interaction (like, comment, follow) */
export const InteractPayload = z.object({
  session_id: zSessionId,
  post_id: zPostId.optional(),
  persona_id: z.string().optional(),
  action: z.enum(["like", "unlike", "comment", "follow", "unfollow", "bookmark", "unbookmark"]),
  content: zUserContent.optional(),
});

/** Coin transfer / spend */
export const CoinPayload = z.object({
  session_id: zSessionId,
  amount: zPositiveInt,
  action: z.enum(["earn", "spend", "transfer"]),
  reason: z.string().min(1).max(200),
  reference_id: z.string().optional(),
});

/** Trading order */
export const TradePayload = z.object({
  session_id: zSessionId,
  wallet_address: zWalletAddress,
  order_type: z.enum(["buy", "sell"]),
  amount: zPositiveReal,
  trading_pair: z.string().optional(),
});

/** OTC swap request */
export const OtcSwapPayload = z.object({
  buyer_wallet: zWalletAddress,
  glitch_amount: zPositiveReal.refine((n) => n >= 100, "Minimum purchase: 100 $GLITCH"),
  session_id: zSessionId.optional(),
});

/** Search query */
export const SearchParams = z.object({
  q: z.string().trim().min(1, "Search query required").max(200),
  type: z.enum(["posts", "personas", "all"]).default("all"),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** DM message */
export const MessagePayload = z.object({
  session_id: zSessionId,
  persona_id: z.string().min(1),
  content: zUserContent,
});

/** Friend actions */
export const FriendPayload = z.object({
  session_id: zSessionId,
  action: z.enum(["add", "remove", "share"]),
  friend_session_id: zSessionId.optional(),
  friend_code: z.string().optional(),
  post_id: zPostId.optional(),
  message: z.string().max(200).optional(),
});

/** Profile update */
export const ProfilePayload = z.object({
  session_id: zSessionId,
  display_name: z.string().trim().min(1).max(50).optional(),
  username: zUsername.optional(),
  avatar_emoji: z.string().max(4).optional(),
  bio: z.string().max(300).optional(),
});

// ── Helpers ──────────────────────────────────────────────────────────

/** Parse URL searchParams into a plain object for Zod parsing */
export function searchParamsToObject(params: URLSearchParams): Record<string, string> {
  const obj: Record<string, string> = {};
  params.forEach((value, key) => { obj[key] = value; });
  return obj;
}

// ── API Error Response ───────────────────────────────────────────────

export interface ApiError {
  error: string;
  code?: string;
  details?: Record<string, unknown>;
}

export interface ApiSuccess<T = unknown> {
  data: T;
}

/**
 * Standardised error response builder.
 * Keeps a consistent shape across all routes: { error, code?, details? }
 */
export function apiError(
  message: string,
  status: number = 400,
  extra?: Record<string, unknown>,
): Response {
  const body: ApiError = { error: message };
  if (extra) body.details = extra;
  return Response.json(body, { status });
}

/**
 * Parse a Zod validation result into a 400 error response.
 * Returns null if parsing succeeded (caller should continue).
 */
export function parseOrError<T>(
  schema: z.ZodType<T>,
  data: unknown,
): { data: T; error: null } | { data: null; error: Response } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { data: result.data, error: null };
  }
  const fieldErrors = result.error.issues.map(
    (i) => `${i.path.join(".")}: ${i.message}`,
  );
  return {
    data: null,
    error: apiError("Validation failed", 400, { fields: fieldErrors }),
  };
}
