import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getDb } from "@/lib/db";
import { env } from "@/lib/bible/env";

type ServiceCheck = {
  status: "ok" | "error";
  latency_ms: number;
  message: string;
};

async function pingService(
  name: string,
  fn: () => Promise<void>,
  timeoutMs = 5000,
): Promise<ServiceCheck> {
  const start = Date.now();
  try {
    await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), timeoutMs),
      ),
    ]);
    return { status: "ok", latency_ms: Date.now() - start, message: "Connected" };
  } catch (err) {
    return {
      status: "error",
      latency_ms: Date.now() - start,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * GET /api/admin/health
 * Admin-only health check: pings database, Redis, Solana RPC, Anthropic, xAI.
 */
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const services: Record<string, ServiceCheck> = {};

  const [db, redis, solana, anthropic, xai] = await Promise.allSettled([
    // Database
    pingService("database", async () => {
      const sql = getDb();
      await sql`SELECT 1 as ping`;
    }),
    // Redis
    pingService("redis", async () => {
      const url = process.env.UPSTASH_REDIS_REST_URL;
      const token = process.env.UPSTASH_REDIS_REST_TOKEN;
      if (!url || !token) throw new Error("Not configured");
      const res = await fetch(`${url}/ping`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    }),
    // Solana RPC
    pingService("solana", async () => {
      const rpcUrl = env.HELIUS_API_KEY
        ? `https://mainnet.helius-rpc.com/?api-key=${env.HELIUS_API_KEY}`
        : "https://api.mainnet-beta.solana.com";
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
        signal: AbortSignal.timeout(5000),
      });
      const data = await res.json();
      if (data.result !== "ok") throw new Error(data.error?.message || "Unhealthy");
    }),
    // Anthropic
    pingService("anthropic", async () => {
      if (!env.ANTHROPIC_API_KEY) throw new Error("Not configured");
      const res = await fetch("https://api.anthropic.com/v1/models", {
        headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    }),
    // xAI
    pingService("xai", async () => {
      if (!env.XAI_API_KEY) throw new Error("Not configured");
      const res = await fetch("https://api.x.ai/v1/models", {
        headers: { Authorization: `Bearer ${env.XAI_API_KEY}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    }),
  ]);

  services.database = db.status === "fulfilled" ? db.value : { status: "error", latency_ms: 0, message: "Check failed" };
  services.redis = redis.status === "fulfilled" ? redis.value : { status: "error", latency_ms: 0, message: "Check failed" };
  services.solana = solana.status === "fulfilled" ? solana.value : { status: "error", latency_ms: 0, message: "Check failed" };
  services.anthropic = anthropic.status === "fulfilled" ? anthropic.value : { status: "error", latency_ms: 0, message: "Check failed" };
  services.xai = xai.status === "fulfilled" ? xai.value : { status: "error", latency_ms: 0, message: "Check failed" };

  const allOk = Object.values(services).every(s => s.status === "ok");

  return NextResponse.json({
    status: allOk ? "ok" : "degraded",
    checked_at: new Date().toISOString(),
    services,
  });
}
