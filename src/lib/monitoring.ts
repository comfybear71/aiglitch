/**
 * AIG!itch — Monitoring & Error Tracking (#17)
 * ==============================================
 * Lightweight error tracking for production visibility.
 * Stores recent errors in-memory (ring buffer) and exposes
 * them via the admin dashboard.
 *
 * Usage:
 *   import { monitor } from "@/lib/monitoring";
 *
 *   monitor.trackError("cron/generate", err);
 *   monitor.trackEvent("trade_executed", { persona: "glitch-047", amount: 500 });
 *   const recent = monitor.getRecentErrors();
 */

// ── Error Buffer ─────────────────────────────────────────────────────

interface TrackedError {
  source: string;
  message: string;
  stack?: string;
  timestamp: Date;
}

interface TrackedEvent {
  name: string;
  data?: Record<string, unknown>;
  timestamp: Date;
}

const MAX_ERRORS = 100;
const MAX_EVENTS = 200;

const _errors: TrackedError[] = [];
const _events: TrackedEvent[] = [];
const _counters: Map<string, number> = new Map();

/**
 * Track an error from any source (cron, API route, etc.)
 * Also logs to console.error for Vercel log aggregation.
 */
function trackError(source: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;

  const entry: TrackedError = { source, message, stack, timestamp: new Date() };

  // Ring buffer — drop oldest when full
  if (_errors.length >= MAX_ERRORS) _errors.shift();
  _errors.push(entry);

  // Increment counter
  increment(`error:${source}`);

  // Always log to stderr for Vercel/container log aggregation
  console.error(`[monitor/${source}]`, message);
}

/**
 * Track a named event with optional metadata.
 */
function trackEvent(name: string, data?: Record<string, unknown>): void {
  if (_events.length >= MAX_EVENTS) _events.shift();
  _events.push({ name, data, timestamp: new Date() });
  increment(`event:${name}`);
}

/**
 * Increment a named counter (useful for rate tracking).
 */
function increment(key: string, by: number = 1): void {
  _counters.set(key, (_counters.get(key) ?? 0) + by);
}

/**
 * Get the last N errors (newest first).
 */
function getRecentErrors(limit: number = 20): TrackedError[] {
  return _errors.slice(-limit).reverse();
}

/**
 * Get the last N events (newest first).
 */
function getRecentEvents(limit: number = 50): TrackedEvent[] {
  return _events.slice(-limit).reverse();
}

/**
 * Get all counter values.
 */
function getCounters(): Record<string, number> {
  return Object.fromEntries(_counters);
}

/**
 * Full monitoring snapshot for the admin dashboard.
 */
function getSnapshot() {
  return {
    errors: {
      total: _counters.get("error:total") ?? _errors.length,
      recent: getRecentErrors(10),
    },
    events: {
      total: _events.length,
      recent: getRecentEvents(10),
    },
    counters: getCounters(),
  };
}

/**
 * Reset all tracking data (useful for tests).
 */
function reset(): void {
  _errors.length = 0;
  _events.length = 0;
  _counters.clear();
}

export const monitor = {
  trackError,
  trackEvent,
  increment,
  getRecentErrors,
  getRecentEvents,
  getCounters,
  getSnapshot,
  reset,
};
