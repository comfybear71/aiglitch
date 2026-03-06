"use client";

import { useState, useEffect, useCallback } from "react";
import { useAdmin } from "../AdminContext";
import { COST_TABLE } from "@/lib/ai/costs";

// Map raw provider keys to display groups
const PROVIDER_GROUPS: Record<string, { label: string; color: string }> = {
  claude:              { label: "Claude (Anthropic)", color: "#a78bfa" },
  "grok-text":         { label: "xAI Grok Text",     color: "#60a5fa" },
  "grok-video":        { label: "xAI Grok Video",    color: "#3b82f6" },
  "grok-image":        { label: "xAI Grok Image",    color: "#2563eb" },
  "grok-image-pro":    { label: "xAI Grok Image Pro", color: "#1d4ed8" },
  "grok-img2vid":      { label: "xAI Grok Img2Vid",  color: "#1e40af" },
  "replicate-imagen4": { label: "Replicate Imagen4",  color: "#34d399" },
  "replicate-flux":    { label: "Replicate Flux",     color: "#10b981" },
  "replicate-wan2":    { label: "Replicate WAN-2",    color: "#059669" },
  "replicate-ideogram":{ label: "Replicate Ideogram", color: "#047857" },
  "kie-kling":         { label: "Kie.ai Kling",       color: "#f59e0b" },
  raphael:             { label: "Raphael Z-Image",    color: "#f97316" },
  "freeforai-flux":    { label: "FreeforAI (Free)",   color: "#6b7280" },
  perchance:           { label: "Perchance (Free)",   color: "#6b7280" },
  "pexels-stock":      { label: "Pexels (Free)",      color: "#6b7280" },
  "media-library":     { label: "Media Library",      color: "#6b7280" },
};

// Group providers into vendor families for the summary cards
function getVendorFamily(provider: string): string {
  if (provider === "claude") return "Anthropic (Claude)";
  if (provider.startsWith("grok")) return "xAI (Grok)";
  if (provider.startsWith("replicate")) return "Replicate";
  if (provider === "kie-kling") return "Kie.ai";
  if (provider === "raphael") return "Raphael";
  return "Free / Other";
}

interface CostData {
  current_session: {
    total_usd: number;
    entry_count: number;
    by_provider: Record<string, { count: number; totalUsd: number }>;
    by_task: Record<string, { count: number; totalUsd: number }>;
    since: string | null;
  };
  lifetime: { total_usd: number; total_calls: number };
  history: { date: string; provider: string; task: string; totalUsd: number; count: number }[];
  top_tasks: { task: string; provider: string; total_usd: number; count: number }[];
  provider_totals: { provider: string; total_usd: number; count: number }[];
  daily_totals: { date: string; total_usd: number; count: number }[];
  days: number;
}

export default function CostsPage() {
  const { authenticated } = useAdmin();
  const [data, setData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(30);
  const [error, setError] = useState("");

  const fetchCosts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/costs?days=${days}`);
      if (res.ok) {
        setData(await res.json());
      } else {
        setError("Failed to load cost data");
      }
    } catch {
      setError("Network error");
    }
    setLoading(false);
  }, [days]);

  useEffect(() => {
    if (authenticated) fetchCosts();
  }, [authenticated, fetchCosts]);

  if (loading && !data) {
    return (
      <div className="text-center py-12 text-gray-500">
        <div className="text-4xl animate-pulse mb-2">💰</div>
        <p>Loading cost data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-red-400">
        <p>{error}</p>
        <button onClick={fetchCosts} className="mt-2 px-4 py-2 bg-gray-800 rounded-lg text-sm">Retry</button>
      </div>
    );
  }

  if (!data) return null;

  // Group provider totals into vendor families
  const vendorFamilies: Record<string, { totalUsd: number; count: number; providers: string[] }> = {};
  for (const pt of data.provider_totals) {
    const family = getVendorFamily(pt.provider);
    if (!vendorFamilies[family]) vendorFamilies[family] = { totalUsd: 0, count: 0, providers: [] };
    vendorFamilies[family].totalUsd += Number(pt.total_usd);
    vendorFamilies[family].count += Number(pt.count);
    vendorFamilies[family].providers.push(pt.provider);
  }

  // Daily spend chart (simple bar chart)
  const maxDaily = Math.max(...data.daily_totals.map(d => Number(d.total_usd)), 0.01);

  // Current rate calculation
  const recentDays = data.daily_totals.slice(-7);
  const avgDaily = recentDays.length > 0
    ? recentDays.reduce((s, d) => s + Number(d.total_usd), 0) / recentDays.length
    : 0;
  const projectedMonthly = avgDaily * 30;

  return (
    <div className="space-y-6">
      {/* Time Range Selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">AI Cost Dashboard</h2>
        <div className="flex items-center gap-2">
          {[7, 14, 30, 90].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                days === d
                  ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                  : "bg-gray-900 text-gray-400 border border-gray-800 hover:bg-gray-800"
              }`}
            >
              {d}d
            </button>
          ))}
          <button onClick={fetchCosts} className="px-3 py-1.5 bg-gray-900 text-gray-400 border border-gray-800 rounded-lg text-xs font-bold hover:bg-gray-800">
            Refresh
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-gray-400 text-xs mb-1">Lifetime Spend</p>
          <p className="text-2xl font-black text-white">${Number(data.lifetime.total_usd).toFixed(2)}</p>
          <p className="text-gray-500 text-xs">{data.lifetime.total_calls.toLocaleString()} API calls</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-gray-400 text-xs mb-1">Last {days} Days</p>
          <p className="text-2xl font-black text-white">
            ${data.daily_totals.reduce((s, d) => s + Number(d.total_usd), 0).toFixed(2)}
          </p>
          <p className="text-gray-500 text-xs">{data.daily_totals.reduce((s, d) => s + Number(d.count), 0).toLocaleString()} calls</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-gray-400 text-xs mb-1">Avg Daily (7d)</p>
          <p className="text-2xl font-black text-yellow-400">${avgDaily.toFixed(2)}</p>
          <p className="text-gray-500 text-xs">/day avg</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-gray-400 text-xs mb-1">Projected Monthly</p>
          <p className={`text-2xl font-black ${projectedMonthly > 100 ? "text-red-400" : projectedMonthly > 50 ? "text-yellow-400" : "text-green-400"}`}>
            ${projectedMonthly.toFixed(2)}
          </p>
          <p className="text-gray-500 text-xs">at current rate</p>
        </div>
      </div>

      {/* Vendor Family Breakdown */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h3 className="text-base font-bold mb-3 text-amber-400">Cost by Vendor</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Object.entries(vendorFamilies)
            .sort((a, b) => b[1].totalUsd - a[1].totalUsd)
            .map(([family, info]) => {
              const pct = data.lifetime.total_usd > 0 ? (info.totalUsd / Number(data.lifetime.total_usd)) * 100 : 0;
              const familyColor = family.includes("Claude") ? "#a78bfa"
                : family.includes("xAI") ? "#60a5fa"
                : family.includes("Replicate") ? "#34d399"
                : family.includes("Kie") ? "#f59e0b"
                : family.includes("Raphael") ? "#f97316"
                : "#6b7280";
              return (
                <div key={family} className="bg-gray-800/50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-white">{family}</span>
                    <span className="text-sm font-mono text-white">${info.totalUsd.toFixed(2)}</span>
                  </div>
                  <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden mb-1.5">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${Math.max(pct, 1)}%`, backgroundColor: familyColor }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>{info.count.toLocaleString()} calls</span>
                    <span>{pct.toFixed(1)}%</span>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Daily Spend Chart */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h3 className="text-base font-bold mb-3 text-amber-400">Daily Spend (last {days} days)</h3>
        {data.daily_totals.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-8">No cost data recorded yet</p>
        ) : (
          <div className="flex items-end gap-1 h-40 overflow-x-auto">
            {data.daily_totals.map((day) => {
              const height = (Number(day.total_usd) / maxDaily) * 100;
              const dateStr = new Date(day.date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
              return (
                <div key={day.date} className="flex flex-col items-center flex-shrink-0" style={{ minWidth: "28px" }}>
                  <span className="text-[10px] text-gray-400 mb-1">${Number(day.total_usd).toFixed(2)}</span>
                  <div
                    className="w-5 rounded-t bg-gradient-to-t from-purple-600 to-purple-400 transition-all hover:from-purple-500 hover:to-purple-300"
                    style={{ height: `${Math.max(height, 2)}%` }}
                    title={`${dateStr}: $${Number(day.total_usd).toFixed(4)} (${day.count} calls)`}
                  />
                  <span className="text-[9px] text-gray-600 mt-1 rotate-[-45deg] origin-top-left whitespace-nowrap">
                    {dateStr}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Provider Detail Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h3 className="text-base font-bold mb-3 text-amber-400">Provider Breakdown (All Time)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs border-b border-gray-800">
                <th className="text-left py-2 px-2">Provider</th>
                <th className="text-right py-2 px-2">Total Cost</th>
                <th className="text-right py-2 px-2">API Calls</th>
                <th className="text-right py-2 px-2">Avg / Call</th>
                <th className="text-right py-2 px-2">% of Total</th>
              </tr>
            </thead>
            <tbody>
              {data.provider_totals.map((pt) => {
                const label = PROVIDER_GROUPS[pt.provider]?.label || pt.provider;
                const color = PROVIDER_GROUPS[pt.provider]?.color || "#9ca3af";
                const pct = data.lifetime.total_usd > 0 ? (Number(pt.total_usd) / Number(data.lifetime.total_usd)) * 100 : 0;
                const avgPerCall = Number(pt.count) > 0 ? Number(pt.total_usd) / Number(pt.count) : 0;
                return (
                  <tr key={pt.provider} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <span className="text-white font-medium">{label}</span>
                      </div>
                    </td>
                    <td className="text-right py-2 px-2 font-mono text-white">${Number(pt.total_usd).toFixed(4)}</td>
                    <td className="text-right py-2 px-2 text-gray-400">{Number(pt.count).toLocaleString()}</td>
                    <td className="text-right py-2 px-2 font-mono text-gray-400">${avgPerCall.toFixed(4)}</td>
                    <td className="text-right py-2 px-2 text-gray-400">{pct.toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top Expensive Tasks */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h3 className="text-base font-bold mb-3 text-amber-400">Top Expensive Tasks (last {days} days)</h3>
        {data.top_tasks.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-4">No task data yet</p>
        ) : (
          <div className="space-y-2">
            {data.top_tasks.map((t, i) => {
              const maxTask = Number(data.top_tasks[0]?.total_usd) || 1;
              const width = (Number(t.total_usd) / maxTask) * 100;
              return (
                <div key={`${t.task}-${t.provider}`} className="bg-gray-800/50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 text-xs font-mono">#{i + 1}</span>
                      <span className="text-white text-sm font-medium">{t.task}</span>
                      <span className="text-gray-500 text-xs">via {PROVIDER_GROUPS[t.provider]?.label || t.provider}</span>
                    </div>
                    <span className="text-white font-mono text-sm">${Number(t.total_usd).toFixed(4)}</span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                  <p className="text-gray-500 text-xs mt-1">{Number(t.count).toLocaleString()} calls</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pricing Reference */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h3 className="text-base font-bold mb-3 text-amber-400">Current Rate Card</h3>
        <p className="text-gray-500 text-xs mb-3">Reference pricing used for cost estimates</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {Object.entries(COST_TABLE).map(([key, rates]) => {
            const label = PROVIDER_GROUPS[key]?.label || key;
            const rateStr = "perMInputTokens" in rates
              ? `$${rates.perMInputTokens}/M in, $${rates.perMOutputTokens}/M out`
              : "perSecond" in rates
              ? `$${rates.perSecond}/sec`
              : `$${rates.perCall}/call`;
            return (
              <div key={key} className="flex items-center justify-between bg-gray-800/50 rounded-lg px-3 py-2">
                <span className="text-gray-300 text-xs">{label}</span>
                <span className="text-gray-400 text-xs font-mono">{rateStr}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Current Session (in-memory, not yet flushed) */}
      {data.current_session.entry_count > 0 && (
        <div className="bg-gray-900 border border-green-800/30 rounded-xl p-4">
          <h3 className="text-base font-bold mb-2 text-green-400">Current Session (unflushed)</h3>
          <p className="text-gray-500 text-xs mb-3">
            Costs tracked in-memory since {data.current_session.since ? new Date(data.current_session.since).toLocaleString() : "session start"}.
            These will be persisted to DB on next cron flush.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-gray-400 text-xs mb-1">Session Total</p>
              <p className="text-xl font-black text-green-400">${data.current_session.total_usd.toFixed(4)}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-1">Calls</p>
              <p className="text-xl font-black text-white">{data.current_session.entry_count}</p>
            </div>
          </div>
          {Object.keys(data.current_session.by_provider).length > 0 && (
            <div className="mt-3 space-y-1">
              {Object.entries(data.current_session.by_provider)
                .sort((a, b) => b[1].totalUsd - a[1].totalUsd)
                .map(([p, info]) => (
                  <div key={p} className="flex justify-between text-xs bg-gray-800/50 rounded px-2 py-1">
                    <span className="text-gray-300">{PROVIDER_GROUPS[p]?.label || p}</span>
                    <span className="text-white font-mono">${info.totalUsd.toFixed(4)} ({info.count} calls)</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
