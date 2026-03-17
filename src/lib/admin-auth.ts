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
 *
 * Supports two auth methods:
 * 1. Cookie auth (web dashboard): compares aiglitch-admin-token cookie against HMAC
 * 2. Wallet auth (mobile app): compares wallet_address query param against ADMIN_WALLET env var
 *
 * Pass the incoming Request to enable wallet-based auth.
 */
export async function isAdminAuthenticated(request?: Request): Promise<boolean> {
  // Method 1: Cookie-based auth (web dashboard)
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE);
  if (token?.value) {
    const expected = generateToken(env.ADMIN_PASSWORD);
    if (safeEqual(token.value, expected)) return true;
  }

  // Method 2: Wallet-based auth (mobile app)
  // Checks query param, Authorization header, and X-Wallet-Address header
  if (request) {
    const adminWallet = process.env.ADMIN_WALLET;
    if (adminWallet) {
      const url = new URL(request.url);
      const wallet =
        url.searchParams.get("wallet_address") ||
        request.headers.get("x-wallet-address") ||
        (request.headers.get("authorization")?.startsWith("Wallet ")
          ? request.headers.get("authorization")!.slice(7)
          : null);
      if (wallet && safeEqual(wallet, adminWallet)) return true;
    }
  }

  return false;
}

export { ADMIN_COOKIE };
