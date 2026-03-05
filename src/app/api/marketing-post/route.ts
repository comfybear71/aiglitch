/**
 * Marketing Post Cron — /api/marketing-post
 * ===========================================
 * Automated marketing cycle: picks best AIG!itch content,
 * adapts for each platform, and posts to configured accounts.
 *
 * Runs every 3 hours via Vercel Cron.
 */

import { cronHandler } from "@/lib/cron";
import { runMarketingCycle } from "@/lib/marketing";

export const maxDuration = 300;

export const GET = cronHandler("marketing-post", async () => {
  const result = await runMarketingCycle();

  return {
    posted: result.posted,
    failed: result.failed,
    skipped: result.skipped,
    details: result.details,
  };
});
