"use client";

import { useState, useEffect, useCallback } from "react";
import { useAdmin } from "../AdminContext";
import { BudjuDashboard, formatBudjuAmount } from "../admin-types";

export default function BudjuPage() {
  const { authenticated } = useAdmin();

  const [budjuData, setBudjuData] = useState<BudjuDashboard | null>(null);
  const [budjuView, setBudjuView] = useState<"trades" | "leaderboard" | "wallets" | "config">("trades");
  const [budjuActionLoading, setBudjuActionLoading] = useState(false);

  const fetchBudjuDashboard = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/budju-trading");
      if (res.ok) {
        const data = await res.json();
        if (!data.error) {
          setBudjuData(data);
        } else {
          console.error("[BUDJU] API error:", data.error);
        }
      }
    } catch (err) {
      console.error("[BUDJU] Fetch error:", err);
    }
  }, []);

  useEffect(() => {
    if (authenticated && !budjuData) {
      fetchBudjuDashboard();
    }
  }, [authenticated, budjuData, fetchBudjuDashboard]);

  const toggleBudjuTrading = async () => {
    setBudjuActionLoading(true);
    const res = await fetch("/api/admin/budju-trading", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle" }),
    });
    if (res.ok) {
      setTimeout(() => fetchBudjuDashboard(), 500);
    }
    setBudjuActionLoading(false);
  };

  const triggerBudjuTrades = async (count: number) => {
    setBudjuActionLoading(true);
    await fetch("/api/admin/budju-trading", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "trigger_trades", count }),
    });
    setTimeout(() => { fetchBudjuDashboard(); setBudjuActionLoading(false); }, 1500);
  };

  const generateBudjuWallets = async () => {
    setBudjuActionLoading(true);
    try {
      const res = await fetch("/api/admin/budju-trading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate_wallets", count: 15 }),
      });
      const data = await res.json();
      if (res.ok) {
        const errMsg = data.errors?.length ? `\n\nErrors:\n${data.errors.join("\n")}` : "";
        alert(`Generated ${data.wallets} wallets across ${data.distributors} distributors.\nPersonas: ${data.personas?.join(", ") || "All already have wallets"}${errMsg}`);
        fetchBudjuDashboard();
      } else {
        alert(`Failed: ${data.error || JSON.stringify(data)}`);
      }
    } catch (e) {
      alert(`Network error: ${e instanceof Error ? e.message : "Failed to connect"}`);
    }
    setBudjuActionLoading(false);
  };

  const syncBudjuBalances = async () => {
    setBudjuActionLoading(true);
    try {
      const res = await fetch("/api/admin/budju-trading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync_balances" }),
      });
      if (res.ok) {
        const data = await res.json();
        alert(`Synced ${data.distributors_synced} distributors + ${data.personas_synced} persona wallets from on-chain.\n\nTotal SOL in system: ${data.total_deposited_sol?.toFixed(4) || 0} SOL`);
        fetchBudjuDashboard();
      } else {
        alert("Sync failed — check console for details.");
      }
    } catch (e) {
      alert(`Network error: ${e instanceof Error ? e.message : "Failed to connect"}`);
    }
    setBudjuActionLoading(false);
  };

  const updateBudjuConfig = async (updates: Record<string, string | number>) => {
    await fetch("/api/admin/budju-trading", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_config", updates }),
    });
    fetchBudjuDashboard();
  };

  const resetBudjuBudget = async () => {
    await fetch("/api/admin/budju-trading", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset_budget" }),
    });
    fetchBudjuDashboard();
  };

  const clearFailedTrades = async () => {
    const failedCount = budjuData?.recent_trades.filter(t => t.status === "failed").length || 0;
    if (!confirm(`Clear ${failedCount} failed trades from history?`)) return;
    setBudjuActionLoading(true);
    try {
      const res = await fetch("/api/admin/budju-trading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear_failed_trades" }),
      });
      if (res.ok) {
        const data = await res.json();
        alert(`Cleared ${data.deleted} failed trades.`);
        fetchBudjuDashboard();
      }
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : "Failed"}`);
    }
    setBudjuActionLoading(false);
  };

  const toggleBudjuWallet = async (personaId: string, currentlyActive: boolean) => {
    await fetch("/api/admin/budju-trading", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: currentlyActive ? "deactivate_wallet" : "activate_wallet", persona_id: personaId }),
    });
    fetchBudjuDashboard();
  };

  const deleteBudjuWallet = async (personaId: string, displayName: string) => {
    if (!confirm(`Delete trading wallet for ${displayName}? This removes all their trade history.`)) return;
    await fetch("/api/admin/budju-trading", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_wallet", persona_id: personaId }),
    });
    fetchBudjuDashboard();
  };

  const distributeBudjuFunds = async () => {
    if (!confirm("Distribute SOL from all 4 distributor wallets to their assigned persona wallets?\n\nMake sure you have funded the distributor wallets first.")) return;
    setBudjuActionLoading(true);
    try {
      const res = await fetch("/api/admin/budju-trading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "distribute_funds" }),
      });
      const data = await res.json();
      if (res.ok) {
        const successCount = data.distributions?.filter((d: { error?: string }) => !d.error).length || 0;
        const failCount = data.distributions?.filter((d: { error?: string }) => d.error).length || 0;
        const budjuMsg = data.total_budju_distributed > 0 ? ` + ${Math.floor(data.total_budju_distributed).toLocaleString()} BUDJU` : "";
        const errMsg = data.errors?.length ? `\n\nErrors:\n${data.errors.join("\n")}` : "";
        alert(`Distributed ${data.total_sol_distributed?.toFixed(4) || 0} SOL${budjuMsg} total.\n${successCount} successful, ${failCount} failed.${errMsg}`);
        fetchBudjuDashboard();
      } else {
        alert(`Distribution failed: ${data.error || JSON.stringify(data)}`);
      }
    } catch (e) {
      alert(`Network error: ${e instanceof Error ? e.message : "Failed to connect"}`);
    }
    setBudjuActionLoading(false);
  };

  const drainBudjuWallets = async () => {
    const destination = prompt("Enter the Solana wallet address to drain all funds to:\n\n(This will send ALL SOL from persona and distributor wallets to this address)");
    if (!destination || destination.length < 32) return;
    if (!confirm(`CONFIRM: Drain ALL wallet funds to:\n${destination}\n\nThis will empty every persona and distributor wallet.`)) return;
    setBudjuActionLoading(true);
    try {
      const res = await fetch("/api/admin/budju-trading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "drain_wallets", destination, wallet_type: "all" }),
      });
      const data = await res.json();
      if (res.ok) {
        const successCount = data.drained?.filter((d: { error?: string }) => !d.error).length || 0;
        const errMsg = data.errors?.length ? `\n\nErrors:\n${data.errors.join("\n")}` : "";
        alert(`Recovered ${data.total_sol_recovered?.toFixed(4) || 0} SOL from ${successCount} wallets.${errMsg}`);
        fetchBudjuDashboard();
      } else {
        alert(`Drain failed: ${data.error || JSON.stringify(data)}`);
      }
    } catch (e) {
      alert(`Network error: ${e instanceof Error ? e.message : "Failed to connect"}`);
    }
    setBudjuActionLoading(false);
  };

  const exportBudjuKeys = async () => {
    if (!confirm("Export ALL private keys for distributor and persona wallets?\n\nWARNING: Keep these secure! Anyone with these keys can access the funds.")) return;
    setBudjuActionLoading(true);
    try {
      const res = await fetch("/api/admin/budju-trading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "export_keys" }),
      });
      const data = await res.json();
      if (res.ok && data.wallets) {
        const text = data.wallets.map((w: { type: string; name: string; address: string; private_key: string }) =>
          `[${w.type}] ${w.name}\nAddress: ${w.address}\nPrivate Key: ${w.private_key}\n`
        ).join("\n");
        // Copy to clipboard
        await navigator.clipboard.writeText(text).catch(() => {});
        alert(`Exported ${data.wallets.length} wallet keys (copied to clipboard).\n\nKEEP THESE SECURE!`);
      } else {
        alert(`Export failed: ${data.error || JSON.stringify(data)}`);
      }
    } catch (e) {
      alert(`Network error: ${e instanceof Error ? e.message : "Failed to connect"}`);
    }
    setBudjuActionLoading(false);
  };

  if (!authenticated) return null;

  return (
    <div className="space-y-4">
      {!budjuData ? (
        <div className="text-center py-12 text-gray-500">
          <div className="text-4xl animate-pulse mb-2">{"\uD83D\uDC3B"}</div>
          <p>Loading BUDJU trading bot...</p>
        </div>
      ) : (
        <>
          {/* Jupiter API Key Warning */}
          {budjuData && !budjuData.jupiter_api_key_set && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-3">
              <p className="text-red-400 font-bold text-sm">JUPITER_API_KEY not set — all trades will fail</p>
              <p className="text-red-400/70 text-xs mt-1">Get a free key at <a href="https://portal.jup.ag" target="_blank" className="underline">portal.jup.ag</a> and add it to your environment variables.</p>
            </div>
          )}
          {/* Header: Status + Controls */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <p className="text-xs text-gray-500">$BUDJU Trading Bot</p>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${budjuData.config.enabled ? "bg-green-500/20 text-green-400 border border-green-500/30" : "bg-red-500/20 text-red-400 border border-red-500/30"}`}>
                    {budjuData.config.enabled ? "RUNNING" : "STOPPED"}
                  </span>
                </div>
                <div className="flex items-baseline gap-3">
                  <p className="text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 to-pink-400">
                    ${budjuData.price.budju_usd > 0 ? budjuData.price.budju_usd.toFixed(6) : "\u2014"}
                  </p>
                  <p className="text-sm text-gray-400">{budjuData.price.budju_sol > 0 ? `${budjuData.price.budju_sol.toFixed(8)} SOL` : ""}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {/* START / STOP BUTTON */}
                <button onClick={toggleBudjuTrading} disabled={budjuActionLoading}
                  className={`px-4 py-2 rounded-lg text-sm font-black transition-all ${
                    budjuData.config.enabled
                      ? "bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30"
                      : "bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30"
                  } disabled:opacity-50`}>
                  {budjuActionLoading ? "..." : budjuData.config.enabled ? "STOP BOT" : "START BOT"}
                </button>
                <button onClick={() => triggerBudjuTrades(5)} disabled={budjuActionLoading}
                  className="px-3 py-1.5 bg-fuchsia-500/20 text-fuchsia-400 rounded-lg text-xs font-bold hover:bg-fuchsia-500/30 disabled:opacity-50">
                  {budjuActionLoading ? "..." : "Manual 5 Trades"}
                </button>
                <button onClick={fetchBudjuDashboard} className="px-3 py-1.5 bg-purple-500/20 text-purple-400 rounded-lg text-xs font-bold hover:bg-purple-500/30">
                  Refresh
                </button>
              </div>
            </div>

            {/* Budget + 24h stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3">
              <div className="bg-gray-800/50 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-fuchsia-400">${budjuData.budget.spent_today.toFixed(2)}</p>
                <p className="text-[10px] text-gray-500">Spent Today / ${budjuData.budget.daily_limit}</p>
                <div className="w-full bg-gray-700/30 rounded-full h-1 mt-1">
                  <div className="bg-fuchsia-500 h-1 rounded-full" style={{ width: `${Math.min((budjuData.budget.spent_today / budjuData.budget.daily_limit) * 100, 100)}%` }} />
                </div>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-white">{budjuData.stats_24h.total_trades}</p>
                <p className="text-[10px] text-gray-500">24h Trades ({budjuData.stats_24h.confirmed} confirmed)</p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-cyan-400">${budjuData.stats_24h.volume_usd.toFixed(2)}</p>
                <p className="text-[10px] text-gray-500">24h Volume (USD)</p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-2 text-center">
                <p className="text-sm font-bold">
                  <span className="text-green-400">{budjuData.stats_24h.buys} buys</span>
                  {" / "}
                  <span className="text-red-400">{budjuData.stats_24h.sells} sells</span>
                </p>
                <p className="text-[10px] text-gray-500">Buy/Sell Ratio</p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-amber-400">{budjuData.stats_all_time.total_trades}</p>
                <p className="text-[10px] text-gray-500">All-Time Trades</p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-2 text-center col-span-2">
                <p className="text-sm font-bold">
                  <span className="text-cyan-400">{((budjuData as { total_system_sol?: number }).total_system_sol || 0).toFixed(4)} SOL</span>
                  {" | "}
                  <span className="text-fuchsia-400">{formatBudjuAmount((budjuData as { total_system_budju?: number }).total_system_budju || 0)} BUDJU</span>
                </p>
                <p className="text-[10px] text-gray-500">Total Funds in Bot Wallets</p>
              </div>
            </div>
          </div>

          {/* Sub-tabs: Trades / Leaderboard / Wallets / Config */}
          <div className="flex gap-1.5">
            {(["trades", "leaderboard", "wallets", "config"] as const).map(v => (
              <button key={v} onClick={() => setBudjuView(v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${budjuView === v ? "bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/30" : "bg-gray-900 text-gray-500 border border-gray-800 hover:bg-gray-800"}`}>
                {v === "trades" ? "Recent Trades" : v === "leaderboard" ? "Leaderboard" : v === "wallets" ? "Wallets" : "Config"}
              </button>
            ))}
          </div>

          {/* TRADES VIEW */}
          {budjuView === "trades" && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-gray-400">Recent BUDJU Trades</h3>
                {budjuData.recent_trades.some(t => t.status === "failed") && (
                  <button onClick={clearFailedTrades} disabled={budjuActionLoading}
                    className="px-2.5 py-1 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-[10px] font-bold hover:bg-red-500/30 disabled:opacity-50 transition-all">
                    Clear Failed
                  </button>
                )}
              </div>
              {budjuData.recent_trades.length === 0 ? (
                <div className="text-center py-8 text-gray-600">
                  <p className="text-sm">No trades yet. Generate wallets and start the bot!</p>
                  <div className="flex justify-center gap-2 mt-3">
                    <button onClick={generateBudjuWallets} disabled={budjuActionLoading}
                      className="px-3 py-1.5 bg-fuchsia-500/20 text-fuchsia-400 rounded-lg text-xs font-bold hover:bg-fuchsia-500/30 disabled:opacity-50">
                      Generate 15 Wallets
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-1 max-h-96 overflow-y-auto">
                  <div className="flex justify-between text-[10px] text-gray-500 px-1 mb-1 sticky top-0 bg-gray-900">
                    <span className="w-12">Type</span>
                    <span className="w-12">Status</span>
                    <span className="w-20">Persona</span>
                    <span className="w-16 text-right">$USD</span>
                    <span className="w-16 text-right">BUDJU</span>
                    <span className="w-14 text-right">SOL</span>
                    <span className="w-12 text-center">DEX</span>
                    <span className="flex-1 text-right">Time</span>
                  </div>
                  {budjuData.recent_trades.map((trade) => (
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
                        {/* Tx link on hover */}
                        {trade.tx_signature && (
                          <a href={`https://solscan.io/tx/${trade.tx_signature}`} target="_blank" rel="noopener noreferrer"
                            className="hidden group-hover:block absolute right-2 text-[10px] text-fuchsia-400 underline z-20">
                            Solscan
                          </a>
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
          )}

          {/* LEADERBOARD VIEW */}
          {budjuView === "leaderboard" && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h3 className="text-sm font-bold text-gray-400 mb-3">Top BUDJU Traders</h3>
              {budjuData.leaderboard.length === 0 ? (
                <p className="text-center text-gray-600 text-sm py-6">No confirmed trades yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {budjuData.leaderboard.map((trader, i) => (
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
          {budjuView === "wallets" && (
            <div className="space-y-4">
              {/* Wallet setup */}
              <div className="bg-gray-900 border border-fuchsia-500/30 rounded-xl p-4">
                <h3 className="text-sm font-bold text-fuchsia-400 mb-3">Wallet Management</h3>

                {/* Total SOL in system */}
                {(budjuData as { total_system_sol?: number }).total_system_sol !== undefined && (
                  <div className="bg-gray-800/50 rounded-lg p-3 mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-gray-500 font-bold">TOTAL SOL IN SYSTEM</p>
                      <p className="text-lg font-bold text-cyan-400">{((budjuData as { total_system_sol?: number }).total_system_sol || 0).toFixed(4)} SOL</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-gray-500 font-bold">TOTAL BUDJU</p>
                      <p className="text-lg font-bold text-fuchsia-400">{formatBudjuAmount((budjuData as { total_system_budju?: number }).total_system_budju || 0)}</p>
                    </div>
                  </div>
                )}

                {/* Action buttons - clean 2x3 grid */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <button onClick={generateBudjuWallets} disabled={budjuActionLoading}
                    className="px-2 py-2 bg-fuchsia-500/20 text-fuchsia-400 rounded-lg text-xs font-bold hover:bg-fuchsia-500/30 disabled:opacity-50">
                    {budjuActionLoading ? "..." : "Generate Wallets"}
                  </button>
                  <button onClick={distributeBudjuFunds} disabled={budjuActionLoading}
                    className="px-2 py-2 bg-green-500/20 text-green-400 rounded-lg text-xs font-bold hover:bg-green-500/30 disabled:opacity-50">
                    {budjuActionLoading ? "..." : "Distribute Funds"}
                  </button>
                  <button onClick={syncBudjuBalances} disabled={budjuActionLoading}
                    className="px-2 py-2 bg-cyan-500/20 text-cyan-400 rounded-lg text-xs font-bold hover:bg-cyan-500/30 disabled:opacity-50">
                    {budjuActionLoading ? "..." : "Sync Balances"}
                  </button>
                  <button onClick={drainBudjuWallets} disabled={budjuActionLoading}
                    className="px-2 py-2 bg-red-500/20 text-red-400 rounded-lg text-xs font-bold hover:bg-red-500/30 disabled:opacity-50">
                    Drain Wallets
                  </button>
                  <button onClick={exportBudjuKeys} disabled={budjuActionLoading}
                    className="px-2 py-2 bg-amber-500/20 text-amber-400 rounded-lg text-xs font-bold hover:bg-amber-500/30 disabled:opacity-50 col-span-2">
                    Export Keys
                  </button>
                </div>

                {/* Distributors */}
                {budjuData.distributors.length > 0 && (
                  <div className="mb-4">
                    <p className="text-[10px] text-gray-500 font-bold mb-1">DISTRIBUTOR WALLETS (Treasury → Distributors → Personas)</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {budjuData.distributors.map((d) => (
                        <div key={d.id} className="bg-gray-800/50 rounded-lg p-2">
                          <p className="text-[10px] font-bold text-amber-400">Group {d.group_number}</p>
                          <p className="text-[9px] text-gray-500 font-mono truncate cursor-pointer" onClick={() => { navigator.clipboard.writeText(d.wallet_address as string); }}
                            title="Click to copy address">{d.wallet_address}</p>
                          <p className="text-[10px] text-gray-400 mt-1">{d.personas_funded} personas | {Number(d.sol_balance).toFixed(4)} SOL</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-[9px] text-gray-600 mt-2">1. Send SOL to each group wallet above → 2. Click &quot;Distribute Funds&quot; → 3. SOL splits to persona wallets automatically</p>
                  </div>
                )}

                {/* Persona wallets */}
                <p className="text-[10px] text-gray-500 font-bold mb-1">PERSONA WALLETS ({budjuData.wallets.length} total)</p>
                {budjuData.wallets.length === 0 ? (
                  <p className="text-center text-gray-600 text-sm py-4">No wallets generated yet. Click &quot;Generate Wallets&quot; to create them.</p>
                ) : (
                  <div className="space-y-1 max-h-80 overflow-y-auto">
                    {budjuData.wallets.map((w) => (
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
                          <button onClick={() => toggleBudjuWallet(w.persona_id, w.is_active)}
                            className={`text-[10px] px-2 py-1 rounded font-bold ${w.is_active ? "text-red-400 hover:bg-red-500/20" : "text-green-400 hover:bg-green-500/20"}`}>
                            {w.is_active ? "Pause" : "Resume"}
                          </button>
                          <button onClick={() => deleteBudjuWallet(w.persona_id, w.display_name)}
                            className="text-[10px] px-2 py-1 rounded font-bold text-gray-500 hover:text-red-400 hover:bg-red-500/10">
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* CONFIG VIEW */}
          {budjuView === "config" && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h3 className="text-sm font-bold text-gray-400 mb-4">Bot Configuration</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Daily Budget */}
                <div>
                  <label className="text-[10px] text-gray-500 font-bold block mb-1">Daily Budget (USD)</label>
                  <div className="flex gap-2">
                    {[100, 250, 500, 1000].map(v => (
                      <button key={v} onClick={() => updateBudjuConfig({ daily_budget_usd: v })}
                        className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-all ${budjuData.config.daily_budget_usd === v ? "bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/30" : "bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700"}`}>
                        ${v}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Max Trade */}
                <div>
                  <label className="text-[10px] text-gray-500 font-bold block mb-1">Max Trade Size (USD)</label>
                  <div className="flex gap-2">
                    {[5, 10, 15, 20].map(v => (
                      <button key={v} onClick={() => updateBudjuConfig({ max_trade_usd: v })}
                        className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-all ${budjuData.config.max_trade_usd === v ? "bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/30" : "bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700"}`}>
                        ${v}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Min Trade */}
                <div>
                  <label className="text-[10px] text-gray-500 font-bold block mb-1">Min Trade Size (USD)</label>
                  <div className="flex gap-2">
                    {[0.25, 0.5, 1, 2].map(v => (
                      <button key={v} onClick={() => updateBudjuConfig({ min_trade_usd: v })}
                        className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-all ${budjuData.config.min_trade_usd === v ? "bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/30" : "bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700"}`}>
                        ${v}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Buy/Sell Ratio */}
                <div>
                  <label className="text-[10px] text-gray-500 font-bold block mb-1">Buy/Sell Ratio (higher = more buys)</label>
                  <div className="flex gap-2">
                    {[0.4, 0.5, 0.6, 0.7].map(v => (
                      <button key={v} onClick={() => updateBudjuConfig({ buy_sell_ratio: v })}
                        className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-all ${budjuData.config.buy_sell_ratio === v ? "bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/30" : "bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700"}`}>
                        {(v * 100).toFixed(0)}%
                      </button>
                    ))}
                  </div>
                </div>
                {/* Active Persona Count */}
                <div>
                  <label className="text-[10px] text-gray-500 font-bold block mb-1">Active Personas</label>
                  <div className="flex gap-2">
                    {[5, 10, 15, 20].map(v => (
                      <button key={v} onClick={() => updateBudjuConfig({ active_persona_count: v })}
                        className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-all ${budjuData.config.active_persona_count === v ? "bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/30" : "bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700"}`}>
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Budget Reset */}
                <div>
                  <label className="text-[10px] text-gray-500 font-bold block mb-1">Budget Controls</label>
                  <div className="flex gap-2">
                    <button onClick={resetBudjuBudget}
                      className="flex-1 px-3 py-1.5 bg-amber-500/20 text-amber-400 rounded-lg text-xs font-bold hover:bg-amber-500/30">
                      Reset Daily Spend
                    </button>
                  </div>
                </div>
              </div>
              {/* Info */}
              <div className="mt-4 bg-gray-800/30 rounded-lg p-3">
                <p className="text-[10px] text-gray-500 font-bold mb-1">ANTI-BUBBLE-MAP STRATEGY</p>
                <ul className="text-[10px] text-gray-500 space-y-0.5 list-disc list-inside">
                  <li>Treasury funds {budjuData.distributors.length} distributor wallets (not persona wallets directly)</li>
                  <li>Each distributor funds {Math.ceil(budjuData.wallets.length / Math.max(budjuData.distributors.length, 1))} persona wallets</li>
                  <li>Trade sizes vary ${budjuData.config.min_trade_usd.toFixed(2)}–${budjuData.config.max_trade_usd.toFixed(2)} (weighted toward smaller)</li>
                  <li>Random intervals: {budjuData.config.min_interval_minutes}–{budjuData.config.max_interval_minutes} minutes between trades</li>
                  <li>Mixed DEX routing: Jupiter (65%) + Raydium (35%)</li>
                  <li>Each persona has unique trading personality (bias, frequency, strategy)</li>
                </ul>
              </div>
              {/* Mint + Treasury info */}
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="bg-gray-800/30 rounded-lg p-2">
                  <p className="text-[10px] text-gray-500 font-bold">BUDJU Mint</p>
                  <p className="text-[9px] text-fuchsia-400 font-mono break-all">{budjuData.budju_mint}</p>
                </div>
                <div className="bg-gray-800/30 rounded-lg p-2">
                  <p className="text-[10px] text-gray-500 font-bold">Treasury Wallet</p>
                  <p className="text-[9px] text-cyan-400 font-mono break-all">{budjuData.treasury_wallet}</p>
                </div>
              </div>
            </div>
          )}

          {/* Price chart (if trades exist) */}
          {budjuData.price_history.length > 0 && budjuView === "trades" && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h3 className="text-sm font-bold text-gray-400 mb-3">BUDJU Price Chart (7d)</h3>
              <div className="relative h-40 flex items-end gap-px overflow-x-auto">
                {(() => {
                  const data = budjuData.price_history;
                  const maxHigh = Math.max(...data.map(d => d.high));
                  const minLow = Math.min(...data.map(d => d.low));
                  const range = maxHigh - minLow || 1;
                  return data.slice(-72).map((candle, i) => {
                    const isGreen = candle.close >= candle.open;
                    const bodyTop = Math.max(candle.open, candle.close);
                    const bodyBot = Math.min(candle.open, candle.close);
                    const bodyH = Math.max(((bodyTop - bodyBot) / range) * 100, 2);
                    const bodyY = ((bodyBot - minLow) / range) * 100;
                    const wickH = ((candle.high - candle.low) / range) * 100;
                    const wickY = ((candle.low - minLow) / range) * 100;
                    return (
                      <div key={i} className="flex-1 min-w-[4px] max-w-[12px] relative h-full" title={`${new Date(candle.time).toLocaleString()}\nO: ${candle.open.toFixed(10)}\nH: ${candle.high.toFixed(10)}\nL: ${candle.low.toFixed(10)}\nC: ${candle.close.toFixed(10)}\nVol: ${candle.volume.toLocaleString()}`}>
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
    </div>
  );
}
