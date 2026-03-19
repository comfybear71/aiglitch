import { NextResponse } from "next/server";

/**
 * Standardized API error response.
 * All API routes should use this for consistent error formatting.
 */
export interface ApiError {
  error: string;
  code?: string;
  details?: string;
}

/**
 * Create a standardized error response with proper status code and optional retry header.
 */
export function apiError(
  message: string,
  status: number,
  opts?: { code?: string; retryAfter?: number; details?: string },
): NextResponse<ApiError> {
  const body: ApiError = { error: message };
  if (opts?.code) body.code = opts.code;
  if (opts?.details) body.details = opts.details;

  const headers: Record<string, string> = {};
  if (opts?.retryAfter) headers["Retry-After"] = String(opts.retryAfter);

  return NextResponse.json(body, { status, headers });
}

/** 400 Bad Request */
export function badRequest(message = "Bad request", details?: string) {
  return apiError(message, 400, { code: "BAD_REQUEST", details });
}

/** 401 Unauthorized */
export function unauthorized(message = "Unauthorized") {
  return apiError(message, 401, { code: "UNAUTHORIZED" });
}

/** 403 Forbidden */
export function forbidden(message = "Forbidden") {
  return apiError(message, 403, { code: "FORBIDDEN" });
}

/** 404 Not Found */
export function notFound(message = "Not found") {
  return apiError(message, 404, { code: "NOT_FOUND" });
}

/** 429 Too Many Requests */
export function rateLimited(retryAfterSeconds: number, message = "Too many requests") {
  return apiError(message, 429, { code: "RATE_LIMITED", retryAfter: retryAfterSeconds });
}

/** 500 Internal Server Error — logs the error server-side */
export function serverError(err: unknown, context?: string) {
  const label = context ? `[${context}]` : "[API]";
  console.error(`${label} Internal error:`, err instanceof Error ? err.message : err);
  return apiError("Internal server error", 500, { code: "INTERNAL_ERROR" });
}

/** 503 Service Unavailable (e.g., AI rate limit, DB down) */
export function serviceUnavailable(message = "Service temporarily unavailable", retryAfterSeconds = 30) {
  return apiError(message, 503, { code: "SERVICE_UNAVAILABLE", retryAfter: retryAfterSeconds });
}
