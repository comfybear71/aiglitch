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
  let sql: ReturnType<typeof getDb> | null = null;
  const dbResult = await checkWithTimeout("database", async () => {
    sql = getDb();
    const [row] = await sql`SELECT 1 as ping`;
    return row;
  });
  checks.database = dbResult.check;
  if (dbResult.check.status === "error") overallStatus = "down";

  // ── 2. Database table counts (only if DB is connected) ──
  let counts: Record<string, number> = {};
  let contentFresh = false;
  let lastPostAge: number | null = null;
  let recentPosts: unknown[] = [];
  let cronStatus: Record<string, unknown> = {};

  if (sql) {
    try {
      const [
        [personas], [allPosts], [topPosts], [videoPosts], [imagePosts],
        [textPosts], [replies], [humanUsers], [nfts], [purchases],
        [channels], [coins], [wallets], [lastPost],
        recent, cronRuns,
      ] = await Promise.all([
        sql`SELECT COUNT(*) as count FROM ai_personas`,
        sql`SELECT COUNT(*) as count FROM posts`,
        sql`SELECT COUNT(*) as count FROM posts WHERE is_reply_to IS NULL`,
        sql`SELECT COUNT(*) as count FROM posts WHERE media_type = 'video' AND media_url IS NOT NULL`,
        sql`SELECT COUNT(*) as count FROM posts WHERE media_type = 'image' AND media_url IS NOT NULL`,
        sql`SELECT COUNT(*) as count FROM posts WHERE media_url IS NULL`,
        sql`SELECT COUNT(*) as count FROM posts WHERE is_reply_to IS NOT NULL`,
        sql`SELECT COUNT(*) as count FROM human_users`,
        sql`SELECT COUNT(*) as count FROM minted_nfts`,
        sql`SELECT COUNT(*) as count FROM marketplace_purchases`,
        sql`SELECT COUNT(*) as count FROM channels`,
        sql`SELECT COUNT(*) as count FROM glitch_coins`,
        sql`SELECT COUNT(*) as count FROM solana_wallets`,
        sql`SELECT created_at FROM posts WHERE is_reply_to IS NULL ORDER BY created_at DESC LIMIT 1`,
        sql`SELECT id, persona_id, post_type, media_type, created_at FROM posts WHERE is_reply_to IS NULL ORDER BY created_at DESC LIMIT 5`,
        sql`SELECT job_name, status, started_at, finished_at, error FROM cron_runs ORDER BY started_at DESC LIMIT 10`.catch(() => []),
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

  // ── 4. AI API Keys (check configured, not connectivity — saves money) ──
  const aiServices: Record<string, { configured: boolean; key_preview: string }> = {
    anthropic_claude: {
      configured: !!env.ANTHROPIC_API_KEY,
      key_preview: env.ANTHROPIC_API_KEY ? `${env.ANTHROPIC_API_KEY.slice(0, 8)}...` : "not set",
    },
    xai_grok: {
      configured: !!env.XAI_API_KEY,
      key_preview: env.XAI_API_KEY ? `${env.XAI_API_KEY.slice(0, 8)}...` : "not set",
    },
    replicate: {
      configured: !!env.REPLICATE_API_TOKEN,
      key_preview: env.REPLICATE_API_TOKEN ? `${env.REPLICATE_API_TOKEN.slice(0, 8)}...` : "not set",
    },
    helius: {
      configured: !!env.HELIUS_API_KEY,
      key_preview: env.HELIUS_API_KEY ? `${env.HELIUS_API_KEY.slice(0, 8)}...` : "not set",
    },
    pexels: {
      configured: !!env.PEXELS_API_KEY,
      key_preview: env.PEXELS_API_KEY ? `${env.PEXELS_API_KEY.slice(0, 8)}...` : "not set",
    },
  };

  const configuredCount = Object.values(aiServices).filter(s => s.configured).length;
  checks.ai_services = {
    status: configuredCount >= 2 ? "ok" : configuredCount >= 1 ? "warn" : "error",
    message: `${configuredCount}/${Object.keys(aiServices).length} API keys configured`,
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
    message: `${cache.size} entries | Hit rate: ${cacheMetrics.hits + cacheMetrics.misses > 0 ? Math.round((cacheMetrics.hits / (cacheMetrics.hits + cacheMetrics.misses)) * 100) : 0}%`,
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
