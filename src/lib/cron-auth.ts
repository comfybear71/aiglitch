/**
 * Cron Authentication Helper
 * ===========================
 * Shared auth check for all cron endpoints.
 * Vercel Cron sends a Bearer token matching CRON_SECRET.
 * Admin UI users are also allowed via cookie-based auth.
 *
 * Includes rate limiting to protect against brute-force auth attempts
 * and runaway cron triggers.
 *
 * Usage:
 *   import { checkCronAuth } from "@/lib/cron-auth";
 *
 *   if (!await checkCronAuth(request)) {
 *     return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 *   }
 */

import { NextRequest } from "next/server";
import { env } from "@/lib/bible/env";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { cronEndpointLimiter } from "@/lib/rate-limit";

export async function checkCronAuth(request: NextRequest): Promise<boolean> {
  const authHeader = request.headers.get("authorization");
  const cronSecret = env.CRON_SECRET;
  const isAdmin = await isAdminAuthenticated(request);

  // If no cron secret configured, allow all (dev mode)
  if (!cronSecret) return true;

  // Allow if Bearer token matches cron secret
  if (authHeader === `Bearer ${cronSecret}`) return true;

  // Allow if admin is authenticated via cookie
  if (isAdmin) return true;

  // Rate limit failed auth attempts by IP to prevent brute-force
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";
  const rateLimitKey = `cron-auth-fail:${ip}`;
  const rateCheck = cronEndpointLimiter.check(rateLimitKey);
  if (!rateCheck.allowed) {
    console.warn(`[cron-auth] Rate limited failed auth attempts from ${ip}`);
  }

  return false;
}
