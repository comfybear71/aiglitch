"use client";

import { useState, useEffect, useCallback } from "react";
import { useAdmin } from "../AdminContext";
import { BudjuDashboard, formatBudjuAmount } from "../admin-types";
import WalletDashboard from "./WalletDashboard";

export default function BudjuTradingView() {
  const { authenticated } = useAdmin();
  const [data, setData] = useState<BudjuDashboard | null>(null);
  const [view, setView] = useState<"dashboard" | "trades" | "leaderboard" | "wallets" | "config" | "distribute">("dashboard");
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/budju-trading");
      if (res.ok) {
        const d = await res.json();
        if (!d.error) setData(d);
      }
    } catch (err) {
      console.error("[BUDJU] Fetch error:", err);
    }
  }, []);

  useEffect(() => {
    if (authenticated && !data) fetchData();
  }, [authenticated, data, fetchData]);

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
            <button onClick={fetchData} className="px-3 py-1.5 bg-purple-500/20 text-purple-400 rounded-lg text-xs font-bold hover:bg-purple-500/30">Refresh</button>
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
        {(["dashboard", "trades", "leaderboard", "wallets", "distribute", "config"] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${view === v ? "bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/30" : "bg-gray-900 text-gray-500 border border-gray-800 hover:bg-gray-800"}`}>
            {v === "dashboard" ? "Dashboard" : v === "trades" ? "Recent Trades" : v === "leaderboard" ? "Leaderboard" : v === "wallets" ? "Wallets" : v === "distribute" ? "Distribute" : "Config"}
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
        <div className="bg-gray-900 border border-fuchsia-500/30 rounded-xl p-4">
          <h3 className="text-sm font-bold text-fuchsia-400 mb-3">Wallet Management</h3>
          {/* Total */}
          <div className="bg-gray-800/50 rounded-lg p-3 mb-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-gray-500 font-bold">TOTAL SOL IN SYSTEM</p>
              <p className="text-lg font-bold text-cyan-400">{totalSol.toFixed(4)} SOL</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-gray-500 font-bold">TOTAL BUDJU</p>
              <p className="text-lg font-bold text-fuchsia-400">{formatBudjuAmount(totalBudju)}</p>
            </div>
          </div>
          {/* Actions */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <button onClick={generateWallets} disabled={loading} className="px-2 py-2 bg-fuchsia-500/20 text-fuchsia-400 rounded-lg text-xs font-bold hover:bg-fuchsia-500/30 disabled:opacity-50">
              {loading ? "..." : "Generate Wallets"}
            </button>
            <button onClick={distributeFunds} disabled={loading} className="px-2 py-2 bg-green-500/20 text-green-400 rounded-lg text-xs font-bold hover:bg-green-500/30 disabled:opacity-50">
              {loading ? "..." : "Distribute Funds"}
            </button>
            <button onClick={syncBalances} disabled={loading} className="px-2 py-2 bg-cyan-500/20 text-cyan-400 rounded-lg text-xs font-bold hover:bg-cyan-500/30 disabled:opacity-50">
              {loading ? "..." : "Sync Balances"}
            </button>
            <button onClick={drainWallets} disabled={loading} className="px-2 py-2 bg-red-500/20 text-red-400 rounded-lg text-xs font-bold hover:bg-red-500/30 disabled:opacity-50">
              Drain Wallets
            </button>
            <button onClick={exportKeys} disabled={loading} className="px-2 py-2 bg-amber-500/20 text-amber-400 rounded-lg text-xs font-bold hover:bg-amber-500/30 disabled:opacity-50 col-span-2">
              Export Keys
            </button>
          </div>
          {/* Distributors */}
          {data.distributors.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] text-gray-500 font-bold mb-1">DISTRIBUTOR WALLETS ({data.distributors.length} groups — Treasury → Distributors → Personas)</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {data.distributors.map((d) => (
                  <div key={d.id} className="bg-gray-800/50 rounded-lg p-2">
                    <p className="text-[10px] font-bold text-amber-400">Group {d.group_number}</p>
                    <p className="text-[9px] text-gray-500 font-mono truncate cursor-pointer"
                      onClick={() => navigator.clipboard.writeText(d.wallet_address as string)}
                      title="Click to copy">{d.wallet_address}</p>
                    <p className="text-[10px] text-gray-400 mt-1">{d.personas_funded} personas | {Number(d.sol_balance).toFixed(4)} SOL</p>
                  </div>
                ))}
              </div>
              <p className="text-[9px] text-gray-600 mt-2">1. Send SOL to each group → 2. Click &quot;Distribute Funds&quot; → 3. SOL splits to persona wallets</p>
            </div>
          )}
          {/* Persona wallets */}
          <p className="text-[10px] text-gray-500 font-bold mb-1">PERSONA WALLETS ({data.wallets.length} total)</p>
          {data.wallets.length === 0 ? (
            <p className="text-center text-gray-600 text-sm py-4">No wallets generated yet.</p>
          ) : (
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {data.wallets.map((w) => (
                <div key={w.persona_id} className={`flex items-center justify-between rounded-lg px-2 py-1.5 ${w.is_active ? "bg-gray-800/30" : "bg-gray-800/10 opacity-50"}`}>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span>{w.avatar_emoji}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">{w.display_name}</p>
                      <p className="text-[9px] text-gray-500 font-mono truncate">{w.wallet_address}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="text-[10px] text-cyan-400">{Number(w.sol_balance).toFixed(4)} SOL</p>
                      <p className="text-[10px] text-fuchsia-400">{formatBudjuAmount(Number(w.budju_balance))} BUDJU</p>
                    </div>
                    <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold ${w.is_active ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                      G{w.distributor_group}
                    </span>
                    <button onClick={() => toggleWallet(w.persona_id, w.is_active)}
                      className={`text-[10px] px-2 py-1 rounded font-bold ${w.is_active ? "text-red-400 hover:bg-red-500/20" : "text-green-400 hover:bg-green-500/20"}`}>
                      {w.is_active ? "Pause" : "Resume"}
                    </button>
                    <button onClick={() => deleteWallet(w.persona_id, w.display_name)}
                      className="text-[10px] px-2 py-1 rounded font-bold text-gray-500 hover:text-red-400 hover:bg-red-500/10">
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* DISTRIBUTE VIEW */}
      {view === "distribute" && (
        <DistributeView onComplete={fetchData} />
      )}

      {/* CONFIG VIEW */}
      {view === "config" && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h3 className="text-sm font-bold text-gray-400 mb-4">Bot Configuration</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] text-gray-500 font-bold block mb-1">Daily Budget (USD)</label>
              <div className="flex gap-2">
                {[100, 250, 500, 1000].map(v => (
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
                {[0.25, 0.5, 1, 2].map(v => (
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
              <label className="text-[10px] text-gray-500 font-bold block mb-1">Active Personas</label>
              <div className="flex gap-2">
                {[5, 10, 15, 20].map(v => (
                  <button key={v} onClick={() => updateConfig({ active_persona_count: v })}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-all ${data.config.active_persona_count === v ? "bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/30" : "bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700"}`}>
                    {v}
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

// ── Distribute View Component ──
function DistributeView({ onComplete }: { onComplete: () => void }) {
  const [solPerPersona, setSolPerPersona] = useState("0.05");
  const [budjuPerPersona, setBudjuPerPersona] = useState("50000");
  const [glitchPerPersona, setGlitchPerPersona] = useState("0");
  const [usdcPerPersona, setUsdcPerPersona] = useState("0");
  const [spreadHours, setSpreadHours] = useState("4");
  const [creating, setCreating] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [jobStatus, setJobStatus] = useState<{
    job: { id: string; status: string; progress: { total: number; completed: number; failed: number; remaining: number }; created_at: string } | null;
    transfers: { id: string; from_type: string; to_type: string; to_persona_id: string | null; token: string; amount: number; status: string; scheduled_at: string; executed_at: string | null; tx_signature: string | null; error: string | null }[];
  } | null>(null);

  // Fetch latest distribution job status
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/budju-trading?action=distribution_status");
      if (res.ok) {
        const data = await res.json();
        if (data.job) setJobStatus(data);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // Poll for active job progress
  useEffect(() => {
    if (!jobStatus?.job || jobStatus.job.status !== "active") return;
    const iv = setInterval(fetchStatus, 15000); // Poll every 15s
    return () => clearInterval(iv);
  }, [jobStatus?.job?.status, fetchStatus]);

  const createJob = async () => {
    if (!confirm(`Create time-randomised distribution?\n\nPer persona:\n• ${solPerPersona} SOL\n• ${budjuPerPersona} BUDJU\n• ${glitchPerPersona} GLITCH\n• ${usdcPerPersona} USDC\n\nSpread over ~${spreadHours} hours.\n\nThis will schedule transfers from Treasury → Distributors → Persona wallets.`)) return;
    setCreating(true);
    try {
      const res = await fetch("/api/admin/budju-trading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_distribution",
          config: {
            sol_per_persona: parseFloat(solPerPersona) || 0,
            budju_per_persona: parseFloat(budjuPerPersona) || 0,
            glitch_per_persona: parseFloat(glitchPerPersona) || 0,
            usdc_per_persona: parseFloat(usdcPerPersona) || 0,
            treasury_to_dist_hours: parseFloat(spreadHours) || 4,
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`Distribution created!\n\n${data.totalTransfers} transfers scheduled over ${data.estimatedDuration}.\n\nJob ID: ${data.jobId?.slice(0, 12)}...`);
        fetchStatus();
      } else {
        alert(`Failed: ${data.error || JSON.stringify(data)}`);
      }
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : "Failed"}`);
    }
    setCreating(false);
  };

  const processNow = async () => {
    setProcessing(true);
    try {
      const res = await fetch("/api/admin/budju-trading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "process_distribution", job_id: jobStatus?.job?.id }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`Processed: ${data.executed} executed, ${data.failed} failed, ${data.remaining} remaining`);
        fetchStatus();
        onComplete();
      } else {
        alert(`Failed: ${data.error}`);
      }
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : "Failed"}`);
    }
    setProcessing(false);
  };

  const progress = jobStatus?.job?.progress;
  const hasActiveJob = jobStatus?.job?.status === "active";

  return (
    <div className="space-y-4">
      {/* Active Job Status */}
      {jobStatus?.job && (
        <div className={`bg-gray-900 border rounded-xl p-4 ${hasActiveJob ? "border-green-500/30" : "border-gray-800"}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {hasActiveJob && <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />}
              <h3 className="text-sm font-bold text-green-400">
                {hasActiveJob ? "Distribution In Progress" : `Distribution ${jobStatus.job.status}`}
              </h3>
            </div>
            {hasActiveJob && (
              <button onClick={processNow} disabled={processing}
                className="px-3 py-1.5 bg-green-500/20 text-green-400 rounded-lg text-xs font-bold hover:bg-green-500/30 disabled:opacity-50">
                {processing ? "Processing..." : "Process Now"}
              </button>
            )}
          </div>
          {progress && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-gray-400">
                <span>{progress.completed} completed</span>
                <span>{progress.failed} failed</span>
                <span>{progress.remaining} remaining</span>
                <span>{progress.total} total</span>
              </div>
              <div className="w-full bg-gray-700/30 rounded-full h-2">
                <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}%` }} />
              </div>
              <p className="text-[10px] text-gray-500">Job created: {new Date(jobStatus.job.created_at).toLocaleString()}</p>
            </div>
          )}

          {/* Recent transfers */}
          {jobStatus.transfers.length > 0 && (
            <div className="mt-3 space-y-1 max-h-40 overflow-y-auto">
              <p className="text-[10px] text-gray-500 font-bold">RECENT TRANSFERS</p>
              {jobStatus.transfers.slice(0, 20).map(t => (
                <div key={t.id} className={`flex items-center justify-between text-[10px] px-2 py-1 rounded ${t.status === "completed" ? "bg-green-500/5" : t.status === "failed" ? "bg-red-500/5" : "bg-gray-800/30"}`}>
                  <span className={`w-16 font-bold ${t.status === "completed" ? "text-green-400" : t.status === "failed" ? "text-red-400" : "text-gray-500"}`}>
                    {t.status === "completed" ? "✓" : t.status === "failed" ? "✗" : "⏳"} {t.token}
                  </span>
                  <span className="text-gray-300">{t.amount.toFixed(t.token === "SOL" ? 4 : 0)}</span>
                  <span className="text-gray-500">{t.from_type} → {t.to_type}</span>
                  <span className="text-gray-600">{t.status === "scheduled" ? new Date(t.scheduled_at).toLocaleTimeString() : t.executed_at ? new Date(t.executed_at).toLocaleTimeString() : ""}</span>
                  {t.tx_signature && (
                    <a href={`https://solscan.io/tx/${t.tx_signature}`} target="_blank" rel="noopener noreferrer" className="text-fuchsia-400 hover:text-fuchsia-300">Tx</a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create New Distribution */}
      <div className="bg-gray-900 border border-fuchsia-500/30 rounded-xl p-4">
        <h3 className="text-sm font-bold text-fuchsia-400 mb-3">Create New Distribution</h3>
        <p className="text-[10px] text-gray-500 mb-3">
          Schedules time-randomised transfers: Treasury → Distributors (staggered over hours) → Persona wallets (random delays 5-60 min each).
          Anti-bubble-mapping: varied amounts, random timing, no batch patterns.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div>
            <label className="text-[10px] text-cyan-400 font-bold block mb-1">SOL per Persona</label>
            <input type="number" step="0.01" value={solPerPersona} onChange={e => setSolPerPersona(e.target.value)}
              className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs" />
            <p className="text-[9px] text-gray-600 mt-0.5">For gas + trading</p>
          </div>
          <div>
            <label className="text-[10px] text-fuchsia-400 font-bold block mb-1">BUDJU per Persona</label>
            <input type="number" step="1000" value={budjuPerPersona} onChange={e => setBudjuPerPersona(e.target.value)}
              className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs" />
            <p className="text-[9px] text-gray-600 mt-0.5">$BUDJU tokens</p>
          </div>
          <div>
            <label className="text-[10px] text-purple-400 font-bold block mb-1">§GLITCH per Persona</label>
            <input type="number" step="100" value={glitchPerPersona} onChange={e => setGlitchPerPersona(e.target.value)}
              className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs" />
            <p className="text-[9px] text-gray-600 mt-0.5">§GLITCH tokens</p>
          </div>
          <div>
            <label className="text-[10px] text-green-400 font-bold block mb-1">USDC per Persona</label>
            <input type="number" step="0.5" value={usdcPerPersona} onChange={e => setUsdcPerPersona(e.target.value)}
              className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs" />
            <p className="text-[9px] text-gray-600 mt-0.5">Stablecoin</p>
          </div>
        </div>

        <div className="mb-4">
          <label className="text-[10px] text-gray-400 font-bold block mb-1">Spread Over (hours)</label>
          <div className="flex gap-2">
            {[2, 4, 6, 8, 12].map(h => (
              <button key={h} onClick={() => setSpreadHours(String(h))}
                className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-all ${String(h) === spreadHours ? "bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/30" : "bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700"}`}>
                {h}h
              </button>
            ))}
          </div>
        </div>

        <button onClick={createJob} disabled={creating || hasActiveJob}
          className="w-full py-3 bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white font-black rounded-xl hover:from-fuchsia-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
          {creating ? "Creating..." : hasActiveJob ? "Distribution Already Active" : "🚀 Start Time-Randomised Distribution"}
        </button>

        {hasActiveJob && (
          <p className="text-[10px] text-amber-400 text-center mt-2">
            A distribution is already in progress. Wait for it to complete or process remaining transfers.
          </p>
        )}
      </div>
    </div>
  );
}
