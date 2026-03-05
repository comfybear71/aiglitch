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
import { v4 as uuidv4 } from "uuid";

// ── Shared timing state for cronStart/cronFinish pattern ─────────────────
const _startTimes: Map<string, number> = new Map();
const _runIds: Map<string, string> = new Map();

/**
 * Log a cron run to the database (best-effort, never throws).
 */
async function logCronRun(
  runId: string,
  cronName: string,
  status: "running" | "completed" | "failed" | "throttled",
  opts?: { durationMs?: number; costUsd?: number; result?: string; error?: string },
) {
  try {
    const sql = getDb();
    if (status === "running") {
      await sql`
        INSERT INTO cron_runs (id, cron_name, status, started_at)
        VALUES (${runId}, ${cronName}, ${status}, NOW())
      `;
    } else {
      // Try update first (if start was logged), fall back to insert
      const updated = await sql`
        UPDATE cron_runs SET
          status = ${status},
          finished_at = NOW(),
          duration_ms = ${opts?.durationMs ?? null},
          cost_usd = ${opts?.costUsd ?? null},
          result = ${opts?.result ?? null},
          error = ${opts?.error ?? null}
        WHERE id = ${runId}
      `;
      if ((updated as unknown as { count: number }).count === 0) {
        await sql`
          INSERT INTO cron_runs (id, cron_name, status, started_at, finished_at, duration_ms, cost_usd, result, error)
          VALUES (${runId}, ${cronName}, ${status}, NOW(), NOW(), ${opts?.durationMs ?? null}, ${opts?.costUsd ?? null}, ${opts?.result ?? null}, ${opts?.error ?? null})
        `;
      }
    }
  } catch {
    // Best-effort — don't break cron if logging fails
  }
}

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
  const runId = uuidv4();
  _startTimes.set(cronName, Date.now());
  _runIds.set(cronName, runId);

  // Auth
  if (!(await checkCronAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Throttle
  if (!options.skipThrottle && !(await shouldRunCron(cronName))) {
    await logCronRun(runId, cronName, "throttled", { durationMs: 0 });
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

  // Log start
  await logCronRun(runId, cronName, "running");

  return null; // proceed
}

/**
 * Flush AI costs and log timing at the end of a cron handler.
 * Call this before returning your response.
 */
export async function cronFinish(cronName: string, result?: string): Promise<void> {
  const start = _startTimes.get(cronName);
  const runId = _runIds.get(cronName) || uuidv4();
  const elapsed = start ? Date.now() - start : 0;
  _startTimes.delete(cronName);
  _runIds.delete(cronName);

  const costSummary = getCostSummary();
  try {
    const sql = getDb();
    await flushCosts(sql);
  } catch {
    // Cost flush is best-effort
  }

  monitor.trackEvent(`cron:${cronName}`, { elapsed_ms: elapsed, cost_usd: costSummary.totalUsd });

  await logCronRun(runId, cronName, "completed", {
    durationMs: elapsed,
    costUsd: costSummary.totalUsd > 0 ? costSummary.totalUsd : undefined,
    result: result || undefined,
  });

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
      const resultSummary = result && typeof result === "object"
        ? JSON.stringify(result).slice(0, 200)
        : String(result ?? "");
      await cronFinish(cronName, resultSummary);

      return NextResponse.json({
        ok: true,
        cron: cronName,
        ...(result && typeof result === "object" ? result as Record<string, unknown> : { data: result }),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      monitor.trackError(`cron/${cronName}`, err);

      // Log error to cron_runs
      const runId = _runIds.get(cronName) || "";
      const start = _startTimes.get(cronName);
      const elapsed = start ? Date.now() - start : 0;
      _startTimes.delete(cronName);
      _runIds.delete(cronName);
      if (runId) {
        await logCronRun(runId, cronName, "failed", {
          durationMs: elapsed,
          error: message.slice(0, 500),
        });
      }

      try {
        const sql = getDb();
        await flushCosts(sql);
      } catch { /* best-effort */ }

      return NextResponse.json(
        { ok: false, error: message, cron: cronName },
        { status: 500 },
      );
    }
  };
}
