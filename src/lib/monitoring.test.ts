/**
 * Monitoring — Unit Tests
 * ========================
 */

import { describe, it, expect, beforeEach } from "vitest";
import { monitor } from "./monitoring";

beforeEach(() => {
  monitor.reset();
});

describe("monitor.trackError", () => {
  it("records an error", () => {
    monitor.trackError("cron/generate", new Error("DB timeout"));
    const errors = monitor.getRecentErrors();
    expect(errors).toHaveLength(1);
    expect(errors[0].source).toBe("cron/generate");
    expect(errors[0].message).toBe("DB timeout");
    expect(errors[0].stack).toBeDefined();
  });

  it("handles non-Error values", () => {
    monitor.trackError("api/feed", "string error");
    const errors = monitor.getRecentErrors();
    expect(errors[0].message).toBe("string error");
    expect(errors[0].stack).toBeUndefined();
  });

  it("maintains ring buffer at max size", () => {
    for (let i = 0; i < 110; i++) {
      monitor.trackError("test", `error-${i}`);
    }
    const errors = monitor.getRecentErrors(200);
    expect(errors.length).toBeLessThanOrEqual(100);
  });

  it("returns newest first", () => {
    monitor.trackError("a", "first");
    monitor.trackError("b", "second");
    const errors = monitor.getRecentErrors();
    expect(errors[0].message).toBe("second");
    expect(errors[1].message).toBe("first");
  });
});

describe("monitor.trackEvent", () => {
  it("records an event with data", () => {
    monitor.trackEvent("trade_executed", { persona: "glitch-047", amount: 500 });
    const events = monitor.getRecentEvents();
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe("trade_executed");
    expect(events[0].data).toEqual({ persona: "glitch-047", amount: 500 });
  });

  it("records event without data", () => {
    monitor.trackEvent("cache_miss");
    const events = monitor.getRecentEvents();
    expect(events[0].data).toBeUndefined();
  });
});

describe("monitor.increment", () => {
  it("increments a counter", () => {
    monitor.increment("requests");
    monitor.increment("requests");
    monitor.increment("requests");
    const counters = monitor.getCounters();
    expect(counters["requests"]).toBe(3);
  });

  it("increments by custom amount", () => {
    monitor.increment("bytes", 1024);
    monitor.increment("bytes", 2048);
    expect(monitor.getCounters()["bytes"]).toBe(3072);
  });
});

describe("monitor.getSnapshot", () => {
  it("returns full monitoring state", () => {
    monitor.trackError("test", "err1");
    monitor.trackEvent("evt1");
    monitor.increment("custom_counter");

    const snapshot = monitor.getSnapshot();
    expect(snapshot.errors.recent).toHaveLength(1);
    expect(snapshot.events.recent).toHaveLength(1);
    expect(snapshot.counters["custom_counter"]).toBe(1);
  });
});

describe("monitor.reset", () => {
  it("clears all tracking data", () => {
    monitor.trackError("test", "err");
    monitor.trackEvent("evt");
    monitor.increment("cnt");
    monitor.reset();

    expect(monitor.getRecentErrors()).toHaveLength(0);
    expect(monitor.getRecentEvents()).toHaveLength(0);
    expect(Object.keys(monitor.getCounters())).toHaveLength(0);
  });
});
