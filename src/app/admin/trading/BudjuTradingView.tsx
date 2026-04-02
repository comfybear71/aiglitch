"use client";

import { useState, useEffect, useCallback } from "react";
import { useAdmin } from "../AdminContext";
import { BudjuDashboard, formatBudjuAmount } from "../admin-types";
import WalletDashboard from "./WalletDashboard";
import MemoSystem from "./MemoSystem";

export default function BudjuTradingView() {
  const { authenticated } = useAdmin();
  const [data, setData] = useState<BudjuDashboard | null>(null);
  const [view, setView] = useState<"dashboard" | "trades" | "leaderboard" | "wallets" | "memos" | "config">("dashboard");
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/budju-trading?t=${Date.now()}`);
      if (res.ok) {
        const d = await res.json();
        if (!d.error) setData(d);
      }
    } catch (err) {
      console.error("[BUDJU] Fetch error:", err);
    }
  }, []);

  useEffect(() => {
    if (authenticated) fetchData();
  }, [authenticated, fetchData]);

  const postAction = async (action: string, body: Record<string, unknown> = {}) => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/budju-trading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      const result = await res.json();
      setLoading(false);
      return { ok: res.ok, data: result };
    } catch (e) {
      setLoading(false);
      return { ok: false, data: { error: e instanceof Error ? e.message : "Failed" } };
    }
  };

  const toggleBot = async () => {
    await postAction("toggle");
    setTimeout(() => fetchData(), 500);
  };

  const triggerTrades = async (count: number) => {
    await postAction("trigger_trades", { count });
    setTimeout(() => fetchData(), 1500);
  };

  const generateWallets = async () => {
    const result = await postAction("generate_wallets", { count: 200 });
    if (result.ok) {
      const d = result.data;
      const errMsg = d.errors?.length ? `\n\nErrors:\n${d.errors.join("\n")}` : "";
      const skipMsg = d.skipped_meatbags ? `\nSkipped ${d.skipped_meatbags} meatbag personas.` : "";
      alert(`Generated ${d.wallets} wallets across ${d.distributors} distributors.${skipMsg}\nPersonas: ${d.personas?.join(", ") || "All already have wallets"}${errMsg}`);
      fetchData();
    } else {
      alert(`Failed: ${result.data.error || JSON.stringify(result.data)}`);
    }
  };

  const syncBalances = async () => {
    const result = await postAction("sync_balances");
    if (result.ok) {
      const d = result.data;
      alert(`Synced ${d.distributors_synced} distributors + ${d.personas_synced} persona wallets.\n\nTotal SOL: ${d.total_deposited_sol?.toFixed(4) || 0}`);
      fetchData();
    } else {
      alert("Sync failed");
    }
  };

  const distributeFunds = async () => {
    if (!confirm("Distribute SOL from all distributor wallets to their assigned persona wallets?\n\nMake sure you have funded the distributor wallets first.")) return;
    const result = await postAction("distribute_funds");
    if (result.ok) {
      const d = result.data;
      const successCount = d.distributions?.filter((x: { error?: string }) => !x.error).length || 0;
      const failCount = d.distributions?.filter((x: { error?: string }) => x.error).length || 0;
      const budjuMsg = d.total_budju_distributed > 0 ? ` + ${Math.floor(d.total_budju_distributed).toLocaleString()} BUDJU` : "";
      alert(`Distributed ${d.total_sol_distributed?.toFixed(4) || 0} SOL${budjuMsg}.\n${successCount} successful, ${failCount} failed.`);
      fetchData();
    } else {
      alert(`Failed: ${result.data.error}`);
    }
  };

  const drainWallets = async () => {
    const destination = prompt("Enter Solana wallet address to drain all funds to:");
    if (!destination || destination.length < 32) return;
    if (!confirm(`CONFIRM: Drain ALL funds to:\n${destination}`)) return;
    const result = await postAction("drain_wallets", { destination, wallet_type: "all" });
    if (result.ok) {
      alert(`Recovered ${result.data.total_sol_recovered?.toFixed(4) || 0} SOL`);
      fetchData();
    } else {
      alert(`Failed: ${result.data.error}`);
    }
  };

  const exportKeys = async () => {
    if (!confirm("Export ALL private keys?\n\nWARNING: Keep these secure!")) return;
    const result = await postAction("export_keys");
    if (result.ok && result.data.wallets) {
      const text = result.data.wallets.map((w: { type: string; name: string; address: string; private_key: string }) =>
        `[${w.type}] ${w.name}\nAddress: ${w.address}\nPrivate Key: ${w.private_key}\n`
      ).join("\n");
      await navigator.clipboard.writeText(text).catch(() => {});
      alert(`Exported ${result.data.wallets.length} wallet keys (copied to clipboard).`);
    } else {
      alert(`Export failed: ${result.data.error}`);
    }
  };

  const updateConfig = async (updates: Record<string, string | number>) => {
    await postAction("update_config", { updates });
    fetchData();
  };

  const clearFailed = async () => {
    const count = data?.recent_trades.filter((t: { status: string }) => t.status === "failed").length || 0;
    if (!confirm(`Clear ${count} failed trades?`)) return;
    const result = await postAction("clear_failed_trades");
    if (result.ok) {
      alert(`Cleared ${result.data.deleted} failed trades.`);
      fetchData();
    }
  };

  const toggleWallet = async (personaId: string, active: boolean) => {
    await postAction(active ? "deactivate_wallet" : "activate_wallet", { persona_id: personaId });
    fetchData();
  };

  const deleteWallet = async (personaId: string, name: string) => {
    if (!confirm(`Delete wallet for ${name}? This removes all trade history.`)) return;
    await postAction("delete_wallet", { persona_id: personaId });
    fetchData();
  };

  if (!data) {
    return (
      <div className="text-center py-12 text-gray-500">
        <div className="text-4xl animate-pulse mb-2">🐻</div>
        <p>Loading BUDJU trading bot...</p>
      </div>
    );
  }

  const totalSol = (data as unknown as { total_system_sol?: number }).total_system_sol || 0;
  const totalBudju = (data as unknown as { total_system_budju?: number }).total_system_budju || 0;

  return (
    <div className="space-y-4">
      {/* Jupiter API Warning */}
      {!data.jupiter_api_key_set && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <p className="text-red-400 font-bold text-sm">JUPITER_API_KEY not set — all trades will fail</p>
          <p className="text-red-400/70 text-xs mt-1">Get a free key at <a href="https://portal.jup.ag" target="_blank" className="underline">portal.jup.ag</a></p>
        </div>
      )}

      {/* Header: Status + Controls */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <p className="text-xs text-gray-500">$BUDJU Trading Bot</p>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${data.config.enabled ? "bg-green-500/20 text-green-400 border border-green-500/30" : "bg-red-500/20 text-red-400 border border-red-500/30"}`}>
                {data.config.enabled ? "RUNNING" : "STOPPED"}
              </span>
            </div>
            <div className="flex items-baseline gap-3">
              <p className="text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 to-pink-400">
                ${data.price.budju_usd > 0 ? data.price.budju_usd.toFixed(6) : "\u2014"}
              </p>
              <p className="text-sm text-gray-400">{data.price.budju_sol > 0 ? `${data.price.budju_sol.toFixed(8)} SOL` : ""}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={toggleBot} disabled={loading}
              className={`px-4 py-2 rounded-lg text-sm font-black transition-all ${data.config.enabled ? "bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30" : "bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30"} disabled:opacity-50`}>
              {loading ? "..." : data.config.enabled ? "STOP BOT" : "START BOT"}
            </button>
            <button onClick={() => triggerTrades(5)} disabled={loading}
              className="px-3 py-1.5 bg-fuchsia-500/20 text-fuchsia-400 rounded-lg text-xs font-bold hover:bg-fuchsia-500/30 disabled:opacity-50">
              {loading ? "..." : "Manual 5 Trades"}
            </button>
            <button onClick={async () => { setLoading(true); await fetchData(); setLoading(false); }} disabled={loading}
              className="px-3 py-1.5 bg-purple-500/20 text-purple-400 rounded-lg text-xs font-bold hover:bg-purple-500/30 disabled:opacity-50">
              {loading ? "Refreshing..." : "↻ Refresh"}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3">
          <div className="bg-gray-800/50 rounded-lg p-2 text-center">
            <p className="text-lg font-bold text-fuchsia-400">${data.budget.spent_today.toFixed(2)}</p>
            <p className="text-[10px] text-gray-500">Spent Today / ${data.budget.daily_limit}</p>
            <div className="w-full bg-gray-700/30 rounded-full h-1 mt-1">
              <div className="bg-fuchsia-500 h-1 rounded-full" style={{ width: `${Math.min((data.budget.spent_today / data.budget.daily_limit) * 100, 100)}%` }} />
            </div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-2 text-center">
            <p className="text-lg font-bold text-white">{data.stats_24h.total_trades}</p>
            <p className="text-[10px] text-gray-500">24h Trades ({data.stats_24h.confirmed} confirmed)</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-2 text-center">
            <p className="text-lg font-bold text-cyan-400">${data.stats_24h.volume_usd.toFixed(2)}</p>
            <p className="text-[10px] text-gray-500">24h Volume (USD)</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-2 text-center">
            <p className="text-sm font-bold">
              <span className="text-green-400">{data.stats_24h.buys} buys</span>{" / "}<span className="text-red-400">{data.stats_24h.sells} sells</span>
            </p>
            <p className="text-[10px] text-gray-500">Buy/Sell Ratio</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-2 text-center">
            <p className="text-lg font-bold text-amber-400">{data.stats_all_time.total_trades}</p>
            <p className="text-[10px] text-gray-500">All-Time Trades</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-2 text-center col-span-2">
            <p className="text-sm font-bold">
              <span className="text-cyan-400">{totalSol.toFixed(4)} SOL</span>{" | "}
              <span className="text-fuchsia-400">{formatBudjuAmount(totalBudju)} BUDJU</span>
            </p>
            <p className="text-[10px] text-gray-500">Total Funds in Bot Wallets</p>
          </div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1.5">
        {(["dashboard", "trades", "leaderboard", "wallets", "memos", "config"] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${view === v ? "bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/30" : "bg-gray-900 text-gray-500 border border-gray-800 hover:bg-gray-800"}`}>
            {v === "dashboard" ? "Dashboard" : v === "trades" ? "Trades" : v === "leaderboard" ? "Leaderboard" : v === "wallets" ? "Wallets" : v === "memos" ? "Memos" : "Config"}
          </button>
        ))}
      </div>

      {/* DASHBOARD VIEW */}
      {view === "dashboard" && data && (
        <WalletDashboard data={data} onRefresh={fetchData} postAction={postAction} />
      )}

      {/* TRADES VIEW */}
      {view === "trades" && (
        <>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-400">Recent BUDJU Trades</h3>
              {data.recent_trades.some(t => t.status === "failed") && (
                <button onClick={clearFailed} disabled={loading}
                  className="px-2.5 py-1 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-[10px] font-bold hover:bg-red-500/30 disabled:opacity-50">
                  Clear Failed
                </button>
              )}
            </div>
            {data.recent_trades.length === 0 ? (
              <div className="text-center py-8 text-gray-600">
                <p className="text-sm">No trades yet. Generate wallets and start the bot!</p>
                <button onClick={generateWallets} disabled={loading}
                  className="mt-3 px-3 py-1.5 bg-fuchsia-500/20 text-fuchsia-400 rounded-lg text-xs font-bold hover:bg-fuchsia-500/30 disabled:opacity-50">
                  Generate Wallets
                </button>
              </div>
            ) : (
              <div className="space-y-1 max-h-96 overflow-y-auto">
                <div className="flex justify-between text-[10px] text-gray-500 px-1 mb-1 sticky top-0 bg-gray-900">
                  <span className="w-12">Type</span><span className="w-12">Status</span><span className="w-20">Persona</span>
                  <span className="w-16 text-right">$USD</span><span className="w-16 text-right">BUDJU</span>
                  <span className="w-14 text-right">SOL</span><span className="w-12 text-center">DEX</span>
                  <span className="flex-1 text-right">Time</span>
                </div>
                {data.recent_trades.map((trade) => (
                  <div key={trade.id}>
                    <div className="flex justify-between items-center text-xs px-1 py-1.5 hover:bg-gray-800/50 rounded group">
                      <span className={`w-12 font-bold ${trade.trade_type === "buy" ? "text-green-400" : "text-red-400"}`}>
                        {trade.trade_type.toUpperCase()}
                      </span>
                      <span className={`w-12 text-[10px] font-bold ${trade.status === "confirmed" ? "text-green-400" : trade.status === "failed" ? "text-red-400" : "text-gray-500"}`}>
                        {trade.status === "confirmed" ? "OK" : trade.status === "failed" ? "FAIL" : "SIM"}
                      </span>
                      <span className="w-20 flex items-center gap-1 truncate">
                        <span>{trade.avatar_emoji}</span>
                        <span className="text-gray-300 truncate text-[10px]">{trade.display_name}</span>
                      </span>
                      <span className="w-16 text-right font-mono text-fuchsia-400">${Number(trade.usd_value).toFixed(2)}</span>
                      <span className="w-16 text-right font-mono text-gray-300">{formatBudjuAmount(Number(trade.budju_amount))}</span>
                      <span className="w-14 text-right font-mono text-cyan-400">{Number(trade.sol_amount).toFixed(4)}</span>
                      <span className="w-12 text-center text-[10px] text-gray-500">{trade.dex_used === "jupiter" ? "JUP" : "RAY"}</span>
                      <span className="flex-1 text-right text-gray-500 text-[10px]">{new Date(trade.created_at).toLocaleTimeString()}</span>
                      {trade.tx_signature && (
                        <a href={`https://solscan.io/tx/${trade.tx_signature}`} target="_blank" rel="noopener noreferrer"
                          className="hidden group-hover:block absolute right-2 text-[10px] text-fuchsia-400 underline z-20">Solscan</a>
                      )}
                    </div>
                    {trade.status === "failed" && trade.error_message && (
                      <div className="ml-1 px-2 py-1 mb-1 bg-red-500/5 border-l-2 border-red-500/30 rounded-r">
                        <p className="text-[10px] text-red-400/70 break-all">{trade.error_message}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Price chart on trades tab */}
          {data.price_history.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h3 className="text-sm font-bold text-gray-400 mb-3">BUDJU Price Chart (7d)</h3>
              <div className="relative h-40 flex items-end gap-px overflow-x-auto">
                {(() => {
                  const hist = data.price_history;
                  const maxHigh = Math.max(...hist.map(d => d.high));
                  const minLow = Math.min(...hist.map(d => d.low));
                  const range = maxHigh - minLow || 1;
                  return hist.slice(-72).map((candle, i) => {
                    const isGreen = candle.close >= candle.open;
                    const bodyTop = Math.max(candle.open, candle.close);
                    const bodyBot = Math.min(candle.open, candle.close);
                    const bodyH = Math.max(((bodyTop - bodyBot) / range) * 100, 2);
                    const bodyY = ((bodyBot - minLow) / range) * 100;
                    const wickH = ((candle.high - candle.low) / range) * 100;
                    const wickY = ((candle.low - minLow) / range) * 100;
                    return (
                      <div key={i} className="flex-1 min-w-[4px] max-w-[12px] relative h-full"
                        title={`${new Date(candle.time).toLocaleString()}\nO: ${candle.open.toFixed(10)}\nC: ${candle.close.toFixed(10)}`}>
                        <div className={`absolute left-1/2 -translate-x-1/2 w-px ${isGreen ? "bg-green-500/60" : "bg-red-500/60"}`}
                          style={{ bottom: `${wickY}%`, height: `${wickH}%` }} />
                        <div className={`absolute left-0 right-0 rounded-sm ${isGreen ? "bg-green-500" : "bg-red-500"}`}
                          style={{ bottom: `${bodyY}%`, height: `${bodyH}%`, minHeight: "2px" }} />
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}
        </>
      )}

      {/* LEADERBOARD VIEW */}
      {view === "leaderboard" && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h3 className="text-sm font-bold text-gray-400 mb-3">Top BUDJU Traders</h3>
          {data.leaderboard.length === 0 ? (
            <p className="text-center text-gray-600 text-sm py-6">No confirmed trades yet.</p>
          ) : (
            <div className="space-y-1.5">
              {data.leaderboard.map((trader, i) => (
                <div key={trader.persona_id} className="flex items-center justify-between bg-gray-800/30 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-5">{i + 1}.</span>
                    <span className="text-lg">{trader.avatar_emoji}</span>
                    <div>
                      <p className="text-xs font-bold text-white">{trader.display_name}</p>
                      <p className="text-[10px] text-gray-500">@{trader.username} — {trader.strategy}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-fuchsia-400">${Number(trader.total_volume_usd).toFixed(2)} volume</p>
                    <p className="text-[10px] text-gray-500">
                      {Number(trader.confirmed_trades)} trades | Bought: {formatBudjuAmount(Number(trader.total_bought))} | Sold: {formatBudjuAmount(Number(trader.total_sold))}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* WALLETS VIEW */}
      {view === "wallets" && (
        <WalletsView data={data} loading={loading} totalSol={totalSol} totalBudju={totalBudju}
          generateWallets={generateWallets} syncBalances={syncBalances} drainWallets={drainWallets}
          exportKeys={exportKeys} toggleWallet={toggleWallet} deleteWallet={deleteWallet}
          postAction={postAction} onRefresh={fetchData} />
      )}

      {/* MEMOS VIEW (also accessible from Home) */}
      {view === "memos" && <MemoSystem />}

      {/* CONFIG VIEW */}
      {view === "config" && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h3 className="text-sm font-bold text-gray-400 mb-4">Bot Configuration</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] text-gray-500 font-bold block mb-1">Daily Budget (USD)</label>
              <div className="flex gap-2">
                {[50, 100, 250, 500].map(v => (
                  <button key={v} onClick={() => updateConfig({ daily_budget_usd: v })}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-all ${data.config.daily_budget_usd === v ? "bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/30" : "bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700"}`}>
                    ${v}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-bold block mb-1">Max Trade Size (USD)</label>
              <div className="flex gap-2">
                {[5, 10, 15, 20].map(v => (
                  <button key={v} onClick={() => updateConfig({ max_trade_usd: v })}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-all ${data.config.max_trade_usd === v ? "bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/30" : "bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700"}`}>
                    ${v}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-bold block mb-1">Min Trade Size (USD)</label>
              <div className="flex gap-2">
                {[1, 2, 3, 5].map(v => (
                  <button key={v} onClick={() => updateConfig({ min_trade_usd: v })}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-all ${data.config.min_trade_usd === v ? "bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/30" : "bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700"}`}>
                    ${v}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-bold block mb-1">Buy/Sell Ratio</label>
              <div className="flex gap-2">
                {[0.4, 0.5, 0.6, 0.7].map(v => (
                  <button key={v} onClick={() => updateConfig({ buy_sell_ratio: v })}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-all ${data.config.buy_sell_ratio === v ? "bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/30" : "bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700"}`}>
                    {(v * 100).toFixed(0)}%
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-bold block mb-1">Active Personas (per batch)</label>
              <div className="flex gap-2">
                {[5, 10, 15, 25].map(v => (
                  <button key={v} onClick={() => updateConfig({ active_persona_count: v })}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-all ${data.config.active_persona_count === v ? "bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/30" : "bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700"}`}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-bold block mb-1">Min Interval (minutes)</label>
              <div className="flex gap-2">
                {[15, 30, 60, 120].map(v => (
                  <button key={v} onClick={() => updateConfig({ min_interval_minutes: v })}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-all ${data.config.min_interval_minutes === v ? "bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/30" : "bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700"}`}>
                    {v >= 60 ? `${v / 60}h` : `${v}m`}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-bold block mb-1">Max Interval (minutes)</label>
              <div className="flex gap-2">
                {[60, 120, 180, 240].map(v => (
                  <button key={v} onClick={() => updateConfig({ max_interval_minutes: v })}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-all ${data.config.max_interval_minutes === v ? "bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/30" : "bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700"}`}>
                    {v / 60}h
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-bold block mb-1">Priority Fee (gas cost)</label>
              <div className="flex gap-2">
                {(["low", "medium", "high"] as const).map(v => (
                  <button key={v} onClick={() => updateConfig({ priority_fee: v })}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-all ${(data.config.priority_fee || "low") === v ? "bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/30" : "bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700"}`}>
                    {v === "low" ? "Low ~$0.02" : v === "medium" ? "Med ~$0.08" : "High ~$0.16"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-bold block mb-1">Budget Controls</label>
              <button onClick={async () => { await postAction("reset_budget"); fetchData(); }}
                className="w-full px-3 py-1.5 bg-amber-500/20 text-amber-400 rounded-lg text-xs font-bold hover:bg-amber-500/30">
                Reset Daily Spend
              </button>
            </div>
          </div>
          <div className="mt-4 bg-gray-800/30 rounded-lg p-3">
            <p className="text-[10px] text-gray-500 font-bold mb-1">ANTI-BUBBLE-MAP STRATEGY</p>
            <ul className="text-[10px] text-gray-500 space-y-0.5 list-disc list-inside">
              <li>Treasury funds {data.distributors.length} distributor wallets (not persona wallets directly)</li>
              <li>Each distributor funds ~{Math.ceil(data.wallets.length / Math.max(data.distributors.length, 1))} persona wallets</li>
              <li>Trade sizes vary ${data.config.min_trade_usd.toFixed(2)}–${data.config.max_trade_usd.toFixed(2)}</li>
              <li>Random intervals: {data.config.min_interval_minutes}–{data.config.max_interval_minutes} min</li>
              <li>Mixed DEX routing: Jupiter (65%) + Raydium (35%)</li>
              <li>Each persona has unique trading personality</li>
            </ul>
          </div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="bg-gray-800/30 rounded-lg p-2">
              <p className="text-[10px] text-gray-500 font-bold">BUDJU Mint</p>
              <p className="text-[9px] text-fuchsia-400 font-mono break-all">{data.budju_mint}</p>
            </div>
            <div className="bg-gray-800/30 rounded-lg p-2">
              <p className="text-[10px] text-gray-500 font-bold">Treasury Wallet</p>
              <p className="text-[9px] text-cyan-400 font-mono break-all">{data.treasury_wallet}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Wallets View: Groups + Persona Wallets ──
function WalletsView({ data, loading, totalSol, totalBudju, generateWallets, syncBalances, drainWallets, exportKeys, toggleWallet, deleteWallet, postAction, onRefresh }: {
  data: BudjuDashboard;
  loading: boolean;
  totalSol: number;
  totalBudju: number;
  generateWallets: () => void;
  syncBalances: () => void;
  drainWallets: () => void;
  exportKeys: () => void;
  toggleWallet: (id: string, active: boolean) => void;
  deleteWallet: (id: string, name: string) => void;
  postAction: (action: string, body?: Record<string, unknown>) => Promise<{ ok: boolean; data: unknown }>;
  onRefresh: () => void;
}) {
  const [expandedGroup, setExpandedGroup] = useState<number | null>(null);
  const [groupFundToken, setGroupFundToken] = useState<{ group: number; token: string; direction: "add" | "withdraw" } | null>(null);
  const [groupFundAmount, setGroupFundAmount] = useState("");
  const [groupLoading, setGroupLoading] = useState(false);

  const fundGroup = async () => {
    if (!groupFundToken || !groupFundAmount || parseFloat(groupFundAmount) <= 0) return;
    const dist = data.distributors.find(d => d.group_number === groupFundToken.group);
    if (!dist) return;
    setGroupLoading(true);
    const action = groupFundToken.direction === "add" ? "wallet_transfer" : "wallet_transfer";
    const direction = groupFundToken.direction === "add" ? "from_treasury" : "to_treasury";
    await postAction(action, {
      wallet_address: dist.wallet_address,
      wallet_type: "distributor",
      token: groupFundToken.token,
      direction,
      amount: parseFloat(groupFundAmount),
    });
    setGroupLoading(false);
    setGroupFundToken(null);
    setGroupFundAmount("");
    onRefresh();
  };

  return (
    <div className="bg-gray-900 border border-fuchsia-500/30 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-fuchsia-400">Wallet Management</h3>
        <button onClick={onRefresh} className="text-[10px] text-gray-500 hover:text-white font-bold">↻ Refresh</button>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-gray-800/50 rounded-lg p-2 text-center">
          <p className="text-sm font-bold text-cyan-400">{totalSol.toFixed(4)}</p>
          <p className="text-[8px] text-gray-500 font-bold">TOTAL SOL</p>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-2 text-center">
          <p className="text-sm font-bold text-fuchsia-400">{formatBudjuAmount(totalBudju)}</p>
          <p className="text-[8px] text-gray-500 font-bold">TOTAL BUDJU</p>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-2 text-center">
          <p className="text-sm font-bold text-purple-400">—</p>
          <p className="text-[8px] text-gray-500 font-bold">TOTAL GLITCH</p>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-2 text-center">
          <p className="text-sm font-bold text-green-400">—</p>
          <p className="text-[8px] text-gray-500 font-bold">TOTAL USDC</p>
        </div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-4 gap-2">
        <button onClick={generateWallets} disabled={loading} className="px-2 py-2 bg-fuchsia-500/20 text-fuchsia-400 rounded-lg text-xs font-bold hover:bg-fuchsia-500/30 disabled:opacity-50">
          {loading ? "..." : "Generate Wallets"}
        </button>
        <button onClick={syncBalances} disabled={loading} className="px-2 py-2 bg-cyan-500/20 text-cyan-400 rounded-lg text-xs font-bold hover:bg-cyan-500/30 disabled:opacity-50">
          {loading ? "..." : "Sync Balances"}
        </button>
        <button onClick={drainWallets} disabled={loading} className="px-2 py-2 bg-red-500/20 text-red-400 rounded-lg text-xs font-bold hover:bg-red-500/30 disabled:opacity-50">
          Drain All
        </button>
        <button onClick={exportKeys} disabled={loading} className="px-2 py-2 bg-amber-500/20 text-amber-400 rounded-lg text-xs font-bold hover:bg-amber-500/30 disabled:opacity-50">
          Export Keys
        </button>
      </div>

      {/* Distributor Groups — expandable with fund/withdraw */}
      {data.distributors.length > 0 && (
        <div>
          <p className="text-[10px] text-gray-500 font-bold mb-2">DISTRIBUTOR GROUPS ({data.distributors.length})</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {data.distributors.map((d) => (
              <div key={d.id} className={`bg-gray-800/50 rounded-lg overflow-hidden border ${expandedGroup === d.group_number ? "border-amber-500/40" : "border-transparent"}`}>
                <button onClick={() => setExpandedGroup(expandedGroup === d.group_number ? null : d.group_number)}
                  className="w-full p-2 text-left hover:bg-gray-700/30 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] font-bold text-amber-400">Group {d.group_number}</p>
                    <span className="text-[9px] text-gray-500">{d.personas_funded} personas</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[9px]">
                    <span className="text-cyan-400">{Number(d.sol_balance).toFixed(3)} SOL</span>
                    <span className="text-fuchsia-400">{formatBudjuAmount(Number(d.budju_balance || 0))} BUDJU</span>
                  </div>
                  <p className="text-[8px] text-gray-600 font-mono truncate mt-1"
                    onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(d.wallet_address as string); }}
                    title="Click to copy">{d.wallet_address}</p>
                </button>

                {/* Expanded: fund/withdraw controls */}
                {expandedGroup === d.group_number && (
                  <div className="border-t border-gray-700/50 p-2 space-y-1.5">
                    <div className="grid grid-cols-2 gap-1">
                      {["SOL", "BUDJU", "GLITCH", "USDC"].map(token => (
                        <div key={token} className="flex gap-0.5">
                          <button onClick={() => { setGroupFundToken({ group: d.group_number, token, direction: "add" }); setGroupFundAmount(""); }}
                            className="flex-1 px-1 py-0.5 bg-green-500/10 text-green-400 rounded text-[8px] font-bold hover:bg-green-500/20">
                            + {token}
                          </button>
                          <button onClick={() => { setGroupFundToken({ group: d.group_number, token, direction: "withdraw" }); setGroupFundAmount(""); }}
                            className="flex-1 px-1 py-0.5 bg-red-500/10 text-red-400 rounded text-[8px] font-bold hover:bg-red-500/20">
                            − {token}
                          </button>
                        </div>
                      ))}
                    </div>
                    {groupFundToken && groupFundToken.group === d.group_number && (
                      <div className="bg-gray-900/60 rounded p-1.5 border border-gray-700/50">
                        <p className="text-[8px] text-gray-400 mb-1">
                          {groupFundToken.direction === "add" ? `Add ${groupFundToken.token} from Treasury` : `Withdraw ${groupFundToken.token} to Treasury`}
                        </p>
                        <div className="flex gap-1">
                          <input type="number" value={groupFundAmount} onChange={e => setGroupFundAmount(e.target.value)}
                            placeholder="Amount" className="flex-1 px-1.5 py-1 bg-gray-800 border border-gray-700 rounded text-[10px] text-white" />
                          <button onClick={fundGroup} disabled={groupLoading}
                            className="px-2 py-1 bg-fuchsia-600 text-white rounded text-[9px] font-bold hover:bg-fuchsia-500 disabled:opacity-50">
                            {groupLoading ? "..." : "Go"}
                          </button>
                          <button onClick={() => setGroupFundToken(null)}
                            className="px-1.5 py-1 bg-gray-700 text-gray-400 rounded text-[9px] hover:bg-gray-600">✕</button>
                        </div>
                      </div>
                    )}
                    <a href={`https://solscan.io/account/${d.wallet_address}`} target="_blank" rel="noopener noreferrer"
                      className="block text-center text-[8px] text-cyan-400 hover:text-cyan-300 font-bold">Solscan ↗</a>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Persona Wallets — with USDC/GLITCH columns */}
      <div>
        <p className="text-[10px] text-gray-500 font-bold mb-1">PERSONA WALLETS ({data.wallets.length} total)</p>
        {data.wallets.length === 0 ? (
          <p className="text-center text-gray-600 text-sm py-4">No wallets generated yet.</p>
        ) : (
          <div className="overflow-x-auto">
            {/* Header */}
            <div className="grid grid-cols-[1fr_70px_70px_55px_55px_40px_60px] gap-1 px-2 py-1.5 text-[8px] text-gray-500 font-bold border-b border-gray-800 min-w-[500px]">
              <span>PERSONA</span>
              <span className="text-right">SOL</span>
              <span className="text-right">BUDJU</span>
              <span className="text-right">USDC</span>
              <span className="text-right">GLITCH</span>
              <span className="text-center">GRP</span>
              <span className="text-right">STATUS</span>
            </div>
            <div className="space-y-0 max-h-80 overflow-y-auto min-w-[500px]">
              {data.wallets.map((w) => (
                <div key={w.persona_id} className={`grid grid-cols-[1fr_70px_70px_55px_55px_40px_60px] gap-1 items-center px-2 py-1.5 hover:bg-gray-800/30 ${!w.is_active ? "opacity-40" : ""}`}>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-sm flex-shrink-0">{w.avatar_emoji}</span>
                    <p className="text-[10px] font-bold text-white truncate">{w.display_name}</p>
                  </div>
                  <p className="text-[10px] text-cyan-400 text-right font-mono">{Number(w.sol_balance).toFixed(3)}</p>
                  <p className="text-[10px] text-fuchsia-400 text-right font-mono">{formatBudjuAmount(Number(w.budju_balance))}</p>
                  <p className="text-[10px] text-green-400 text-right font-mono">{Number(w.usdc_balance || 0) > 0 ? Number(w.usdc_balance).toFixed(2) : "—"}</p>
                  <p className="text-[10px] text-purple-400 text-right font-mono">{Number(w.glitch_balance || 0) > 0 ? formatBudjuAmount(Number(w.glitch_balance)) : "—"}</p>
                  <p className="text-[9px] text-center"><span className="px-1 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-bold">G{w.distributor_group}</span></p>
                  <div className="text-right flex items-center justify-end gap-1">
                    <span className={`text-[8px] px-1 py-0.5 rounded-full font-bold ${w.is_active ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                      {w.is_active ? "ON" : "OFF"}
                    </span>
                    <button onClick={() => toggleWallet(w.persona_id, w.is_active)}
                      className={`text-[8px] font-bold ${w.is_active ? "text-red-400" : "text-green-400"}`}>
                      {w.is_active ? "⏸" : "▶"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
