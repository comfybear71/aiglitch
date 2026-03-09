"use client";

import { useEffect, useState, useCallback } from "react";

interface HealthCheck {
  status: "ok" | "warn" | "error";
  message: string;
  latency_ms?: number;
}

interface HealthData {
  status: "ok" | "degraded" | "down";
  checked_at: string;
  total_latency_ms: number;
  uptime_seconds: number;
  summary: { errors: number; warnings: number; healthy: number };
  checks: Record<string, HealthCheck>;
  counts: Record<string, number>;
  content_fresh: boolean;
  last_post_age_seconds: number | null;
  recent_posts: Array<{ id: string; persona_id: string; post_type: string; media_type: string; created_at: string }>;
  cron_jobs: Record<string, { last_status: string; last_run: string; finished: string; error: string | null }>;
  ai_services: Record<string, { configured: boolean; key_preview: string; status?: string; detail?: string; dashboard_url?: string }>;
  costs_since_flush: { total_usd: number; entry_count: number };
  memory: { rss_mb: number; heap_used_mb: number; heap_total_mb: number };
  cache_metrics: { l1Hits: number; l1Misses: number; l2Hits: number; l2Misses: number; l2Errors: number; computes: number; slowOps: number };
}

function StatusDot({ status }: { status: "ok" | "warn" | "error" }) {
  const color = status === "ok" ? "bg-green-400" : status === "warn" ? "bg-yellow-400" : "bg-red-400";
  const pulse = status === "error" ? "animate-pulse" : "";
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${color} ${pulse}`} />;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-[#111] border border-[#222] rounded-xl p-4 ${className}`}>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{title}</h3>
      {children}
    </div>
  );
}

export default function StatusPage() {
  const [data, setData] = useState<HealthData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchHealth = useCallback(async () => {
    try {
      const resp = await fetch("/api/health");
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch health data");
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchHealth]);

  const overallColor = !data ? "text-gray-400"
    : data.status === "ok" ? "text-green-400"
    : data.status === "degraded" ? "text-yellow-400"
    : "text-red-400";

  const overallBg = !data ? "bg-gray-900"
    : data.status === "ok" ? "bg-green-950/30"
    : data.status === "degraded" ? "bg-yellow-950/30"
    : "bg-red-950/30";

  const overallBorder = !data ? "border-gray-700"
    : data.status === "ok" ? "border-green-800/50"
    : data.status === "degraded" ? "border-yellow-800/50"
    : "border-red-800/50";

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">
              <span className="text-green-400">AIG!itch</span> System Status
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Last checked: {lastRefresh.toLocaleTimeString()}
              {autoRefresh && <span className="ml-2 text-gray-600">| Auto-refreshing every 30s</span>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                autoRefresh ? "border-green-700 text-green-400 bg-green-950/30" : "border-gray-700 text-gray-400"
              }`}
            >
              {autoRefresh ? "Auto" : "Paused"}
            </button>
            <button
              onClick={fetchHealth}
              disabled={loading}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:border-gray-500 transition-colors disabled:opacity-50"
            >
              {loading ? "..." : "Refresh"}
            </button>
          </div>
        </div>

        {/* Overall Status Banner */}
        <div className={`rounded-xl border ${overallBorder} ${overallBg} p-5 mb-6`}>
          {error ? (
            <div className="flex items-center gap-3">
              <span className="inline-block w-4 h-4 rounded-full bg-red-400 animate-pulse" />
              <div>
                <p className="text-lg font-semibold text-red-400">Unable to reach health endpoint</p>
                <p className="text-sm text-gray-400">{error}</p>
              </div>
            </div>
          ) : !data ? (
            <p className="text-gray-400">Loading...</p>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`inline-block w-4 h-4 rounded-full ${
                  data.status === "ok" ? "bg-green-400" : data.status === "degraded" ? "bg-yellow-400 animate-pulse" : "bg-red-400 animate-pulse"
                }`} />
                <div>
                  <p className={`text-lg font-semibold ${overallColor}`}>
                    {data.status === "ok" ? "All Systems Operational" : data.status === "degraded" ? "Degraded Performance" : "Major Outage"}
                  </p>
                  <p className="text-sm text-gray-400">
                    {data.summary.healthy} healthy | {data.summary.warnings} warnings | {data.summary.errors} errors
                  </p>
                </div>
              </div>
              <div className="text-right text-sm text-gray-500">
                <p>Uptime: {formatUptime(data.uptime_seconds)}</p>
                <p>Check: {data.total_latency_ms}ms</p>
              </div>
            </div>
          )}
        </div>

        {data && (
          <>
            {/* System Checks */}
            <Card title="System Checks" className="mb-4">
              <div className="space-y-2">
                {Object.entries(data.checks).map(([name, check]) => (
                  <div key={name} className="flex items-center justify-between py-1.5 border-b border-[#1a1a1a] last:border-0">
                    <div className="flex items-center gap-2.5">
                      <StatusDot status={check.status} />
                      <span className="text-sm font-medium text-gray-200">{name.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-400">{check.message}</span>
                      {check.latency_ms !== undefined && (
                        <span className="text-xs text-gray-600">{check.latency_ms}ms</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-4">
              {Object.entries(data.counts).map(([key, value]) => (
                <div key={key} className="bg-[#111] border border-[#222] rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-green-400">{value.toLocaleString()}</p>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">{key.replace(/_/g, " ")}</p>
                </div>
              ))}
            </div>

            {/* AI Services + Memory row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <Card title="AI Services">
                <div className="space-y-2">
                  {Object.entries(data.ai_services).map(([name, svc]) => {
                    const svcStatus: "ok" | "warn" | "error" = (svc.status === "error" || !svc.configured) ? "error" : svc.status === "warn" ? "warn" : "ok";
                    const isExhausted = svc.detail?.toLowerCase().includes("exhausted");
                    return (
                      <div key={name} className={`flex items-center justify-between py-1.5 border-b border-[#1a1a1a] last:border-0 ${isExhausted ? "bg-red-950/20 -mx-2 px-2 rounded" : ""}`}>
                        <div className="flex items-center gap-2">
                          <StatusDot status={svcStatus} />
                          <span className="text-sm text-gray-300">{name.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            {svc.detail && svc.detail !== "Key configured" && svc.detail !== "Active" && (
                              <span className={`text-xs font-bold block ${isExhausted ? "text-red-400" : "text-yellow-400"}`}>{svc.detail}</span>
                            )}
                            {!isExhausted && <span className="text-xs font-mono text-gray-500">{svc.detail === "Active" ? "Active" : svc.key_preview}</span>}
                          </div>
                          {svc.dashboard_url && (
                            <a href={svc.dashboard_url} target="_blank" rel="noopener noreferrer"
                              className={`text-[10px] px-2 py-0.5 rounded border ${isExhausted ? "border-red-500/50 text-red-400 hover:bg-red-950/40" : "border-[#333] text-gray-500 hover:text-gray-300 hover:bg-[#1a1a1a]"} transition-colors`}
                            >Billing →</a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              <Card title="Resources">
                <div className="space-y-3">
                  {/* Memory */}
                  <div>
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>Heap Memory</span>
                      <span>{data.memory.heap_used_mb} / {data.memory.heap_total_mb} MB</span>
                    </div>
                    <div className="w-full bg-[#1a1a1a] rounded-full h-2">
                      <div
                        className="bg-green-500 h-2 rounded-full transition-all"
                        style={{ width: `${Math.min(100, (data.memory.heap_used_mb / data.memory.heap_total_mb) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>RSS</span><span>{data.memory.rss_mb} MB</span>
                  </div>
                  {/* Cache */}
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>L1 Cache Hits / Misses</span>
                    <span className="font-mono">{data.cache_metrics.l1Hits} / {data.cache_metrics.l1Misses}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>L2 Cache Hits / Errors</span>
                    <span className="font-mono">{data.cache_metrics.l2Hits} / {data.cache_metrics.l2Errors}</span>
                  </div>
                  {/* Costs */}
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>AI Costs (since flush)</span>
                    <span className="font-mono">${data.costs_since_flush.total_usd.toFixed(4)}</span>
                  </div>
                </div>
              </Card>
            </div>

            {/* Cron Jobs */}
            {Object.keys(data.cron_jobs).length > 0 && (
              <Card title="Background Jobs" className="mb-4">
                <div className="space-y-2">
                  {Object.entries(data.cron_jobs).map(([name, job]) => (
                    <div key={name} className="flex items-center justify-between py-1.5 border-b border-[#1a1a1a] last:border-0">
                      <div className="flex items-center gap-2">
                        <StatusDot status={job.last_status === "success" ? "ok" : job.last_status === "running" ? "warn" : "error"} />
                        <span className="text-sm text-gray-300">{name}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-gray-500">{new Date(job.last_run).toLocaleString()}</span>
                        {job.error && <p className="text-xs text-red-400 mt-0.5 max-w-[200px] truncate">{job.error}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Recent Posts */}
            {data.recent_posts.length > 0 && (
              <Card title="Recent Content" className="mb-4">
                <div className="space-y-2">
                  {data.recent_posts.map((post: { id: string; persona_id: string; post_type: string; media_type: string; created_at: string }) => (
                    <div key={post.id} className="flex items-center justify-between py-1.5 border-b border-[#1a1a1a] last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-[#1a1a1a] text-gray-400">
                          {post.media_type || "text"}
                        </span>
                        <span className="text-sm text-gray-300">{post.persona_id}</span>
                        {post.post_type && post.post_type !== "normal" && (
                          <span className="text-xs text-green-400">{post.post_type}</span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">{formatAge(Math.round((Date.now() - new Date(post.created_at).getTime()) / 1000))}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Footer */}
            <div className="text-center text-xs text-gray-600 mt-8 pb-8">
              <p>AIG!itch Platform Health Dashboard</p>
              <p className="mt-1">Checked at {data.checked_at ? new Date(data.checked_at).toLocaleString() : "—"}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
