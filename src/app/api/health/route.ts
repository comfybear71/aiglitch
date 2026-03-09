/**
 * Health & Readiness Endpoint
 * ===========================
 * Comprehensive system health check covering:
 *   - Database connectivity + table health
 *   - External services (Solana RPC, AI APIs, Helius)
 *   - Content freshness & cron job status
 *   - Platform statistics & cache
 *   - Environment configuration
 *
 * GET /api/health          → full health check (used by /status page)
 * GET /api/health?probe=1  → lightweight readiness probe (no DB queries)
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { cache, getCacheMetrics } from "@/lib/cache";
import { getCostSummary } from "@/lib/ai/costs";
import { env } from "@/lib/bible/env";

const _startedAt = Date.now();

type CheckResult = { status: "ok" | "warn" | "error"; message: string; latency_ms?: number };

async function checkWithTimeout<T>(
  name: string,
  fn: () => Promise<T>,
  timeoutMs = 8000,
): Promise<{ result: T | null; check: CheckResult }> {
  const start = Date.now();
  try {
    const result = await Promise.race([
      fn(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout")), timeoutMs)),
    ]);
    return { result, check: { status: "ok", message: "Connected", latency_ms: Date.now() - start } };
  } catch (err) {
    return {
      result: null,
      check: {
        status: "error",
        message: err instanceof Error ? err.message : String(err),
        latency_ms: Date.now() - start,
      },
    };
  }
}

export async function GET(request: NextRequest) {
  // Lightweight readiness probe — no DB, instant response
  const probe = request.nextUrl.searchParams.get("probe");
  if (probe) {
    return NextResponse.json({
      status: "ok",
      uptime_seconds: Math.round((Date.now() - _startedAt) / 1000),
    });
  }

  const checkStart = Date.now();
  const checks: Record<string, CheckResult> = {};
  let overallStatus: "ok" | "degraded" | "down" = "ok";

  // ── 1. Database ──
  let dbConnected = false;
  const dbResult = await checkWithTimeout("database", async () => {
    const db = getDb();
    const [row] = await db`SELECT 1 as ping`;
    return row;
  });
  checks.database = dbResult.check;
  if (dbResult.check.status === "error") overallStatus = "down";
  else dbConnected = true;

  // ── 2. Database table counts (only if DB is connected) ──
  let counts: Record<string, number> = {};
  let contentFresh = false;
  let lastPostAge: number | null = null;
  let recentPosts: unknown[] = [];
  let cronStatus: Record<string, unknown> = {};

  if (dbConnected) {
    try {
      const db = getDb();
      const [
        [personas], [allPosts], [topPosts], [videoPosts], [imagePosts],
        [textPosts], [replies], [humanUsers], [nfts], [purchases],
        [channels], [coins], [wallets], [lastPost],
        recent, cronRuns,
      ] = await Promise.all([
        db`SELECT COUNT(*) as count FROM ai_personas`,
        db`SELECT COUNT(*) as count FROM posts`,
        db`SELECT COUNT(*) as count FROM posts WHERE is_reply_to IS NULL`,
        db`SELECT COUNT(*) as count FROM posts WHERE media_type = 'video' AND media_url IS NOT NULL`,
        db`SELECT COUNT(*) as count FROM posts WHERE media_type = 'image' AND media_url IS NOT NULL`,
        db`SELECT COUNT(*) as count FROM posts WHERE media_url IS NULL`,
        db`SELECT COUNT(*) as count FROM posts WHERE is_reply_to IS NOT NULL`,
        db`SELECT COUNT(*) as count FROM human_users`,
        db`SELECT COUNT(*) as count FROM minted_nfts`,
        db`SELECT COUNT(*) as count FROM marketplace_purchases`,
        db`SELECT COUNT(*) as count FROM channels`,
        db`SELECT COUNT(*) as count FROM glitch_coins`,
        db`SELECT COUNT(*) as count FROM solana_wallets`,
        db`SELECT created_at FROM posts WHERE is_reply_to IS NULL ORDER BY created_at DESC LIMIT 1`,
        db`SELECT id, persona_id, post_type, media_type, created_at FROM posts WHERE is_reply_to IS NULL ORDER BY created_at DESC LIMIT 5`,
        db`SELECT job_name, status, started_at, finished_at, error FROM cron_runs ORDER BY started_at DESC LIMIT 10`.catch(() => []),
      ]);

      counts = {
        personas: Number(personas.count),
        all_posts: Number(allPosts.count),
        top_level_posts: Number(topPosts.count),
        video_posts: Number(videoPosts.count),
        image_posts: Number(imagePosts.count),
        text_posts: Number(textPosts.count),
        replies: Number(replies.count),
        human_users: Number(humanUsers.count),
        minted_nfts: Number(nfts.count),
        marketplace_purchases: Number(purchases.count),
        channels: Number(channels.count),
        coin_holders: Number(coins.count),
        solana_wallets: Number(wallets.count),
      };

      lastPostAge = lastPost?.created_at
        ? Math.round((Date.now() - new Date(lastPost.created_at).getTime()) / 1000)
        : null;
      contentFresh = lastPostAge !== null && lastPostAge < 1800;
      recentPosts = recent;

      // Cron job health
      const cronArr = cronRuns as Array<{ job_name: string; status: string; started_at: string; finished_at: string; error: string }>;
      const cronMap: Record<string, unknown> = {};
      for (const run of cronArr) {
        if (!cronMap[run.job_name]) {
          cronMap[run.job_name] = {
            last_status: run.status,
            last_run: run.started_at,
            finished: run.finished_at,
            error: run.error || null,
          };
        }
      }
      cronStatus = cronMap;

      checks.tables = { status: "ok", message: `${Object.keys(counts).length} tables queried` };
    } catch (err) {
      checks.tables = { status: "error", message: err instanceof Error ? err.message : String(err) };
    }
  }

  // Content freshness
  if (lastPostAge !== null) {
    if (lastPostAge > 3600) {
      checks.content_freshness = { status: "error", message: `Last post ${Math.round(lastPostAge / 60)}m ago (>60m)` };
      if (overallStatus === "ok") overallStatus = "degraded";
    } else if (lastPostAge > 1800) {
      checks.content_freshness = { status: "warn", message: `Last post ${Math.round(lastPostAge / 60)}m ago (>30m)` };
      if (overallStatus === "ok") overallStatus = "degraded";
    } else {
      checks.content_freshness = { status: "ok", message: `Last post ${Math.round(lastPostAge / 60)}m ago` };
    }
  } else {
    checks.content_freshness = { status: "warn", message: "No posts found" };
  }

  // ── 3. Solana RPC ──
  const solanaRpc = env.NEXT_PUBLIC_SOLANA_RPC_URL || (env.HELIUS_API_KEY ? "helius" : "public");
  const rpcUrl = env.HELIUS_API_KEY
    ? `https://mainnet.helius-rpc.com/?api-key=${env.HELIUS_API_KEY}`
    : "https://api.mainnet-beta.solana.com";

  const solanaResult = await checkWithTimeout("solana_rpc", async () => {
    const resp = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
    });
    const data = await resp.json();
    if (data.result === "ok") return data;
    throw new Error(data.error?.message || "Unhealthy");
  }, 5000);
  checks.solana_rpc = {
    ...solanaResult.check,
    message: solanaResult.check.status === "ok"
      ? `Connected (${solanaRpc === "helius" ? "Helius" : solanaRpc === "public" ? "Public RPC" : "Custom"})`
      : solanaResult.check.message,
  };
  if (solanaResult.check.status === "error" && overallStatus === "ok") overallStatus = "degraded";

  // ── 4. AI API Keys — lightweight auth/credit checks ──
  // These hit cheap endpoints (models list, account info) to detect auth failures & credit exhaustion.
  type ServiceStatus = { configured: boolean; key_preview: string; status: "ok" | "warn" | "error" | "unchecked"; detail: string };
  const aiServices: Record<string, ServiceStatus> = {};

  // Check services in parallel
  const serviceChecks = await Promise.allSettled([
    // Anthropic — GET /v1/models is free, validates key + credit status
    (async (): Promise<["anthropic_claude", ServiceStatus]> => {
      if (!env.ANTHROPIC_API_KEY) return ["anthropic_claude", { configured: false, key_preview: "not set", status: "error", detail: "No API key" }];
      try {
        const res = await fetch("https://api.anthropic.com/v1/models", {
          headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) return ["anthropic_claude", { configured: true, key_preview: `${env.ANTHROPIC_API_KEY.slice(0, 8)}...`, status: "ok", detail: "Active" }];
        const body = await res.text().catch(() => "");
        if (res.status === 429 || body.includes("credit") || body.includes("exhausted") || body.includes("spending"))
          return ["anthropic_claude", { configured: true, key_preview: `${env.ANTHROPIC_API_KEY.slice(0, 8)}...`, status: "error", detail: `Credits exhausted (HTTP ${res.status})` }];
        return ["anthropic_claude", { configured: true, key_preview: `${env.ANTHROPIC_API_KEY.slice(0, 8)}...`, status: "warn", detail: `HTTP ${res.status}` }];
      } catch (e) {
        return ["anthropic_claude", { configured: true, key_preview: `${env.ANTHROPIC_API_KEY.slice(0, 8)}...`, status: "warn", detail: e instanceof Error ? e.message : "Timeout" }];
      }
    })(),

    // xAI — GET /v1/models validates key + credit
    (async (): Promise<["xai_grok", ServiceStatus]> => {
      if (!env.XAI_API_KEY) return ["xai_grok", { configured: false, key_preview: "not set", status: "error", detail: "No API key" }];
      try {
        const res = await fetch("https://api.x.ai/v1/models", {
          headers: { Authorization: `Bearer ${env.XAI_API_KEY}` },
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) return ["xai_grok", { configured: true, key_preview: `${env.XAI_API_KEY.slice(0, 8)}...`, status: "ok", detail: "Active" }];
        const body = await res.text().catch(() => "");
        if (res.status === 429 || body.includes("credit") || body.includes("exhausted") || body.includes("spending"))
          return ["xai_grok", { configured: true, key_preview: `${env.XAI_API_KEY.slice(0, 8)}...`, status: "error", detail: `Credits exhausted (HTTP ${res.status})` }];
        return ["xai_grok", { configured: true, key_preview: `${env.XAI_API_KEY.slice(0, 8)}...`, status: "warn", detail: `HTTP ${res.status}` }];
      } catch (e) {
        return ["xai_grok", { configured: true, key_preview: `${env.XAI_API_KEY.slice(0, 8)}...`, status: "warn", detail: e instanceof Error ? e.message : "Timeout" }];
      }
    })(),

    // Replicate — no free endpoint, just check key exists
    (async (): Promise<["replicate", ServiceStatus]> => {
      return ["replicate", {
        configured: !!env.REPLICATE_API_TOKEN,
        key_preview: env.REPLICATE_API_TOKEN ? `${env.REPLICATE_API_TOKEN.slice(0, 8)}...` : "not set",
        status: env.REPLICATE_API_TOKEN ? "ok" : "error",
        detail: env.REPLICATE_API_TOKEN ? "Key configured" : "No API key",
      }];
    })(),

    // Helius
    (async (): Promise<["helius", ServiceStatus]> => {
      return ["helius", {
        configured: !!env.HELIUS_API_KEY,
        key_preview: env.HELIUS_API_KEY ? `${env.HELIUS_API_KEY.slice(0, 8)}...` : "not set",
        status: env.HELIUS_API_KEY ? "ok" : "warn",
        detail: env.HELIUS_API_KEY ? "Key configured" : "Using public RPC",
      }];
    })(),

    // Pexels
    (async (): Promise<["pexels", ServiceStatus]> => {
      return ["pexels", {
        configured: !!env.PEXELS_API_KEY,
        key_preview: env.PEXELS_API_KEY ? `${env.PEXELS_API_KEY.slice(0, 8)}...` : "not set",
        status: env.PEXELS_API_KEY ? "ok" : "warn",
        detail: env.PEXELS_API_KEY ? "Key configured" : "No API key",
      }];
    })(),
  ]);

  for (const result of serviceChecks) {
    if (result.status === "fulfilled") {
      const [key, svc] = result.value;
      aiServices[key] = svc;
    }
  }

  const configuredCount = Object.values(aiServices).filter(s => s.configured).length;
  const creditErrors = Object.values(aiServices).filter(s => s.status === "error" && s.detail.includes("exhausted")).length;
  checks.ai_services = {
    status: creditErrors > 0 ? "error" : configuredCount >= 2 ? "ok" : configuredCount >= 1 ? "warn" : "error",
    message: creditErrors > 0
      ? `${creditErrors} service(s) out of credits!`
      : `${configuredCount}/${Object.keys(aiServices).length} API keys configured`,
  };

  // ── 5. Environment ──
  const solanaMode = env.isRealSolana ? "real (mainnet)" : "simulated";
  checks.environment = {
    status: "ok",
    message: `${env.NODE_ENV} | Solana: ${solanaMode} | Network: ${env.NEXT_PUBLIC_SOLANA_NETWORK}`,
  };

  // ── 6. Cache & Memory ──
  const mem = process.memoryUsage();
  const cacheMetrics = getCacheMetrics();
  checks.cache = {
    status: cache.size > 10000 ? "warn" : "ok",
    message: `${cache.size} entries | Hit rate: ${cacheMetrics.l1Hits + cacheMetrics.l1Misses > 0 ? Math.round((cacheMetrics.l1Hits / (cacheMetrics.l1Hits + cacheMetrics.l1Misses)) * 100) : 0}%`,
  };

  // ── 7. Costs ──
  const costSummary = getCostSummary();

  // ── Determine overall status ──
  const errorCount = Object.values(checks).filter(c => c.status === "error").length;
  const warnCount = Object.values(checks).filter(c => c.status === "warn").length;
  if (errorCount > 0 && overallStatus === "ok") overallStatus = "degraded";

  const totalLatency = Date.now() - checkStart;

  return NextResponse.json({
    status: overallStatus,
    checked_at: new Date().toISOString(),
    total_latency_ms: totalLatency,
    uptime_seconds: Math.round((Date.now() - _startedAt) / 1000),
    summary: {
      errors: errorCount,
      warnings: warnCount,
      healthy: Object.values(checks).filter(c => c.status === "ok").length,
    },
    checks,
    counts,
    content_fresh: contentFresh,
    last_post_age_seconds: lastPostAge,
    recent_posts: recentPosts,
    cron_jobs: cronStatus,
    ai_services: aiServices,
    costs_since_flush: {
      total_usd: costSummary.totalUsd,
      entry_count: costSummary.entryCount,
    },
    memory: {
      rss_mb: Math.round(mem.rss / 1024 / 1024),
      heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
      heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024),
    },
    cache_metrics: cacheMetrics,
  });
}
