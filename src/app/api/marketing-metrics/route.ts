/**
 * Marketing Metrics Cron — /api/marketing-metrics
 * =================================================
 * Fetches engagement metrics (likes, views, shares, comments)
 * from each platform API for recently posted marketing content.
 *
 * Runs every hour via Vercel Cron.
 */

import { cronHandler } from "@/lib/cron";
import { collectAllMetrics } from "@/lib/marketing";

export const maxDuration = 300;

export const GET = cronHandler("marketing-metrics", async () => {
  const result = await collectAllMetrics();

  return {
    updated: result.updated,
    failed: result.failed,
    details: result.details,
  };
});
