/**
 * Unified Cron Utilities (#7)
 * ============================
 * Consolidates the repeated boilerplate (auth, throttle, error handling,
 * timing, cost flushing) that was duplicated across 8+ cron endpoints.
 *
 * Two usage patterns:
 *
 * A) Full wrapper — for simple cron routes:
 *
 *   import { cronHandler } from "@/lib/cron";
 *
 *   async function doWork(request: NextRequest) { return { postsGenerated: 5 }; }
 *
 *   export const GET = cronHandler("generate", doWork);
 *
 * B) Start/finish helpers — for routes that return custom responses:
 *
 *   import { cronStart, cronFinish } from "@/lib/cron";
 *
 *   export async function GET(request: NextRequest) {
 *     const gate = await cronStart(request, "ads");
 *     if (gate) return gate;           // 401 or throttled
 *     // ... custom logic ...
 *     await cronFinish("ads");
 *     return NextResponse.json({ ... });
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { checkCronAuth } from "@/lib/cron-auth";
import { shouldRunCron } from "@/lib/throttle";
import { ensureDbReady } from "@/lib/seed";
import { getDb } from "@/lib/db";
import { flushCosts, getCostSummary } from "@/lib/ai/costs";
import { monitor } from "@/lib/monitoring";

// ── Shared timing state for cronStart/cronFinish pattern ─────────────────
const _startTimes: Map<string, number> = new Map();

// ── Pattern B: Start / Finish helpers ────────────────────────────────────

export interface CronStartOptions {
  /** Skip the activity throttle check */
  skipThrottle?: boolean;
  /** Skip database seeding */
  skipSeed?: boolean;
}

/**
 * Run standard cron gate checks: auth → throttle → seed.
 * Returns a NextResponse if the request should be rejected (401 or throttled),
 * or `null` if the handler should proceed.
 */
export async function cronStart(
  request: NextRequest,
  cronName: string,
  options: CronStartOptions = {},
): Promise<NextResponse | null> {
  _startTimes.set(cronName, Date.now());

  // Auth
  if (!(await checkCronAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Throttle
  if (!options.skipThrottle && !(await shouldRunCron(cronName))) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "throttled",
      cron: cronName,
    });
  }

  // Seed
  if (!options.skipSeed) {
    try {
      await ensureDbReady();
    } catch (err) {
      console.error(`[cron/${cronName}] DB seed failed:`, err);
    }
  }

  return null; // proceed
}

/**
 * Flush AI costs and log timing at the end of a cron handler.
 * Call this before returning your response.
 */
export async function cronFinish(cronName: string): Promise<void> {
  const start = _startTimes.get(cronName);
  const elapsed = start ? Date.now() - start : 0;
  _startTimes.delete(cronName);

  const costSummary = getCostSummary();
  try {
    const sql = getDb();
    await flushCosts(sql);
  } catch {
    // Cost flush is best-effort
  }

  monitor.trackEvent(`cron:${cronName}`, { elapsed_ms: elapsed, cost_usd: costSummary.totalUsd });

  console.log(
    `[cron/${cronName}] Completed in ${elapsed}ms` +
    (costSummary.totalUsd > 0 ? ` ($${costSummary.totalUsd.toFixed(4)} estimated)` : ""),
  );
}

// ── Pattern A: Full wrapper ──────────────────────────────────────────────

export interface CronHandlerOptions extends CronStartOptions {}

export type CronHandlerFn<T = unknown> = (
  request: NextRequest,
) => Promise<T>;

/**
 * Wrap a cron handler function with standard auth, throttle, timing, and error handling.
 * Returns a Next.js route handler (request) => NextResponse.
 */
export function cronHandler<T>(
  cronName: string,
  handler: CronHandlerFn<T>,
  options: CronHandlerOptions = {},
) {
  return async function wrappedHandler(request: NextRequest): Promise<NextResponse> {
    const gate = await cronStart(request, cronName, options);
    if (gate) return gate;

    try {
      const result = await handler(request);
      await cronFinish(cronName);

      return NextResponse.json({
        ok: true,
        cron: cronName,
        ...(result && typeof result === "object" ? result as Record<string, unknown> : { data: result }),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      monitor.trackError(`cron/${cronName}`, err);
      await cronFinish(cronName);

      return NextResponse.json(
        { ok: false, error: message, cron: cronName },
        { status: 500 },
      );
    }
  };
}
