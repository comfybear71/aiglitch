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
 * The token is derived from the password + a per-boot random salt,
 * so it is unpredictable and changes across restarts.
 */
const BOOT_SALT = crypto.getRandomValues(new Uint8Array(32));
const BOOT_SALT_HEX = Buffer.from(BOOT_SALT).toString("hex");

export function generateToken(password: string): string {
  return createHmac("sha256", BOOT_SALT_HEX)
    .update(password)
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
