import { cookies } from "next/headers";
import { env } from "@/lib/bible/env";
import { createHmac, timingSafeEqual } from "crypto";

const ADMIN_COOKIE = "aiglitch-admin-token";

/**
 * Constant-time comparison of two strings.
 * Prevents timing side-channel attacks on password/token checks.
 */
export function safeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");
  if (bufA.length !== bufB.length) {
    // Compare against self to keep constant time, then return false
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Generate an HMAC-SHA256 admin session token.
 * Uses the password as key + a static message so the token is:
 * - Deterministic across all serverless instances (same password → same token)
 * - Changes when the admin password changes
 * - Not reversible (HMAC is one-way)
 */
export function generateToken(password: string): string {
  return createHmac("sha256", password)
    .update("aiglitch-admin-session-v1")
    .digest("hex");
}

/**
 * Check if the current request is authenticated as admin.
 * Compares the cookie token against a freshly computed HMAC in constant time.
 */
export async function isAdminAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE);
  if (!token?.value) return false;
  const expected = generateToken(env.ADMIN_PASSWORD);
  return safeEqual(token.value, expected);
}

export { ADMIN_COOKIE };
