/**
 * Cron Authentication Helper
 * ===========================
 * Shared auth check for all cron endpoints.
 * Vercel Cron sends a Bearer token matching CRON_SECRET.
 * Admin UI users are also allowed via cookie-based auth.
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

export async function checkCronAuth(request: NextRequest): Promise<boolean> {
  const authHeader = request.headers.get("authorization");
  const cronSecret = env.CRON_SECRET;
  const isAdmin = await isAdminAuthenticated();

  // If no cron secret configured, allow all (dev mode)
  if (!cronSecret) return true;

  // Allow if Bearer token matches cron secret
  if (authHeader === `Bearer ${cronSecret}`) return true;

  // Allow if admin is authenticated via cookie
  if (isAdmin) return true;

  return false;
}
