"use client";

import { useState } from "react";
import { BudjuDashboard, formatBudjuAmount } from "../admin-types";

interface WalletDashboardProps {
  data: BudjuDashboard;
  onRefresh: () => void;
  postAction: (action: string, body?: Record<string, unknown>) => Promise<{ ok: boolean; data: unknown }>;
}

export default function WalletDashboard({ data, onRefresh, postAction }: WalletDashboardProps) {
  const [expandedWallet, setExpandedWallet] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tradeHistory, setTradeHistory] = useState<Record<string, { id: string; trade_type: string; budju_amount: number; sol_amount: number; usd_value: number; status: string; created_at: string }[]>>({});
  const [viewingKeys, setViewingKeys] = useState<string | null>(null);
  const [keyData, setKeyData] = useState<string | null>(null);
  const [keyTimer, setKeyTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [fundTotals, setFundTotals] = useState<{ glitch: number; usdc: number } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "sol" | "budju" | "group">("name");
  const [showActive, setShowActive] = useState<"all" | "active" | "paused">("all");

  // Fetch GLITCH + USDC totals from fund_check
  useState(() => {
    fetch(`/api/admin/budju-trading?action=fund_check&t=${Date.now()}`)
      .then(r => r.json())
      .then(d => { if (d.totals) setFundTotals({ glitch: d.totals.glitch, usdc: d.totals.usdc }); })
      .catch(() => {});
  });

  const wallets = data.wallets;
  const totalSol = wallets.reduce((s, w) => s + Number(w.sol_balance), 0);
  const totalBudju = wallets.reduce((s, w) => s + Number(w.budju_balance), 0);
  const activeCount = wallets.filter(w => w.is_active).length;

  // Filter + sort
  const filtered = wallets
    .filter(w => {
      if (showActive === "active" && !w.is_active) return false;
      if (showActive === "paused" && w.is_active) return false;
      if (searchTerm && !w.display_name.toLowerCase().includes(searchTerm.toLowerCase()) && !w.username?.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "sol") return Number(b.sol_balance) - Number(a.sol_balance);
      if (sortBy === "budju") return Number(b.budju_balance) - Number(a.budju_balance);
      if (sortBy === "group") return a.distributor_group - b.distributor_group;
      return a.display_name.localeCompare(b.display_name);
    });

  const toggleExpand = async (personaId: string) => {
    if (expandedWallet === personaId) {
      setExpandedWallet(null);
      return;
    }
    setExpandedWallet(personaId);
    // Fetch trade history for this persona if not cached
    if (!tradeHistory[personaId]) {
      try {
        const res = await postAction("persona_trade_history", { persona_id: personaId });
        if (res.ok && (res.data as { trades?: unknown[] }).trades) {
          setTradeHistory(prev => ({ ...prev, [personaId]: (res.data as { trades: typeof tradeHistory[string] }).trades }));
        }
      } catch { /* ignore */ }
    }
  };

  const toggleWallet = async (personaId: string, isActive: boolean) => {
    setLoading(true);
    await postAction(isActive ? "deactivate_wallet" : "activate_wallet", { persona_id: personaId });
    onRefresh();
    setLoading(false);
  };

  const viewPrivateKey = async (personaId: string) => {
    setLoading(true);
    const res = await postAction("export_keys", { persona_id: personaId });
    setLoading(false);
    if (res.ok && (res.data as { keys?: { address: string; encrypted: string }[] }).keys) {
      const keys = (res.data as { keys: { address: string; encrypted: string }[] }).keys;
      setKeyData(keys[0]?.encrypted || "Key not found");
      setViewingKeys(personaId);
      // Auto-hide after 10 seconds
      if (keyTimer) clearTimeout(keyTimer);
      const timer = setTimeout(() => { setViewingKeys(null); setKeyData(null); }, 10000);
      setKeyTimer(timer);
    }
  };

  const syncBalances = async () => {
    setLoading(true);
    await postAction("sync_balances");
    onRefresh();
    setLoading(false);
  };

  const equalizeWallets = async () => {
    setLoading(true);
    const res = await postAction("equalize_wallets");
    setLoading(false);
    const d = res.data as { underfunded?: number; message?: string; error?: string };
    if (res.ok && d.underfunded !== undefined) {
      alert(`${d.underfunded} wallets need funding.\n\n${d.message || "Create a distribution job from the Distribute tab to fund them."}`);
    } else {
      alert(d.error || "Failed");
    }
    onRefresh();
  };

  return (
    <div className="space-y-3">
      {/* Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
        <div className="bg-gray-800/50 rounded-lg p-2.5 border border-gray-700/50">
          <p className="text-[9px] text-gray-500 font-bold">TOTAL SOL</p>
          <p className="text-sm font-bold text-cyan-400">{totalSol.toFixed(4)}</p>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-2.5 border border-gray-700/50">
          <p className="text-[9px] text-gray-500 font-bold">TOTAL BUDJU</p>
          <p className="text-sm font-bold text-fuchsia-400">{formatBudjuAmount(totalBudju)}</p>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-2.5 border border-gray-700/50">
          <p className="text-[9px] text-gray-500 font-bold">TOTAL GLITCH</p>
          <p className="text-sm font-bold text-yellow-400">{fundTotals ? `${(fundTotals.glitch / 1000000).toFixed(1)}M` : "..."}</p>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-2.5 border border-gray-700/50">
          <p className="text-[9px] text-gray-500 font-bold">TOTAL USDC</p>
          <p className="text-sm font-bold text-green-400">{fundTotals ? `$${fundTotals.usdc.toFixed(2)}` : "..."}</p>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-2.5 border border-gray-700/50">
          <p className="text-[9px] text-gray-500 font-bold">ACTIVE TRADERS</p>
          <p className="text-sm font-bold text-green-400">{activeCount} <span className="text-gray-500 text-[10px]">/ {wallets.length}</span></p>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-2.5 border border-gray-700/50">
          <p className="text-[9px] text-gray-500 font-bold">24H TRADES</p>
          <p className="text-sm font-bold text-white">{data.stats_24h.total_trades} <span className="text-gray-500 text-[10px]">${data.stats_24h.volume_usd.toFixed(2)}</span></p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          placeholder="Search personas..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="px-2.5 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-xs text-white w-40"
        />
        <div className="flex gap-0.5">
          {(["all", "active", "paused"] as const).map(f => (
            <button key={f} onClick={() => setShowActive(f)}
              className={`px-2 py-1 text-[10px] rounded-md ${showActive === f ? "bg-fuchsia-500/20 text-fuchsia-400 font-bold" : "bg-gray-800 text-gray-500 hover:bg-gray-700"}`}>
              {f === "all" ? `All (${wallets.length})` : f === "active" ? `Active (${activeCount})` : `Paused (${wallets.length - activeCount})`}
            </button>
          ))}
        </div>
        <div className="flex gap-0.5">
          {(["name", "sol", "budju", "group"] as const).map(s => (
            <button key={s} onClick={() => setSortBy(s)}
              className={`px-2 py-1 text-[10px] rounded-md ${sortBy === s ? "bg-cyan-500/20 text-cyan-400 font-bold" : "bg-gray-800 text-gray-500 hover:bg-gray-700"}`}>
              {s === "name" ? "Name" : s === "sol" ? "SOL" : s === "budju" ? "BUDJU" : "Group"}
            </button>
          ))}
        </div>
        <button onClick={equalizeWallets} disabled={loading}
          className="px-2.5 py-1.5 bg-amber-500/20 text-amber-400 rounded-lg text-[10px] font-bold hover:bg-amber-500/30 disabled:opacity-50 ml-auto">
          {loading ? "Checking..." : "Check Underfunded"}
        </button>
        <button onClick={syncBalances} disabled={loading}
          className="px-2.5 py-1.5 bg-cyan-500/20 text-cyan-400 rounded-lg text-[10px] font-bold hover:bg-cyan-500/30 disabled:opacity-50">
          {loading ? "Syncing..." : "Sync Balances"}
        </button>
      </div>

      {/* Wallet Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[1fr_100px_100px_60px_80px] gap-2 px-3 py-2 text-[9px] text-gray-500 font-bold border-b border-gray-800 bg-gray-900/80 sticky top-0">
          <span>PERSONA</span>
          <span className="text-right">SOL</span>
          <span className="text-right">BUDJU</span>
          <span className="text-center">GROUP</span>
          <span className="text-right">STATUS</span>
        </div>
        {/* Rows */}
        <div className="max-h-[500px] overflow-y-auto divide-y divide-gray-800/50">
          {filtered.map(w => (
            <div key={w.persona_id}>
              {/* Main Row */}
              <div
                onClick={() => toggleExpand(w.persona_id)}
                className={`grid grid-cols-[1fr_100px_100px_60px_80px] gap-2 px-3 py-2 items-center cursor-pointer hover:bg-gray-800/40 transition-colors ${expandedWallet === w.persona_id ? "bg-gray-800/30" : ""} ${!w.is_active ? "opacity-50" : ""}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base flex-shrink-0">{w.avatar_emoji}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">{w.display_name}</p>
                    <p className="text-[9px] text-gray-500 font-mono truncate">{w.wallet_address?.slice(0, 8)}...{w.wallet_address?.slice(-6)}</p>
                  </div>
                </div>
                <p className="text-xs text-cyan-400 text-right font-mono">{Number(w.sol_balance).toFixed(4)}</p>
                <p className="text-xs text-fuchsia-400 text-right font-mono">{formatBudjuAmount(Number(w.budju_balance))}</p>
                <p className="text-[10px] text-center">
                  <span className="px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-bold">G{w.distributor_group}</span>
                </p>
                <div className="text-right">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${w.is_active ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                    {w.is_active ? "ACTIVE" : "PAUSED"}
                  </span>
                </div>
              </div>

              {/* Expanded Detail */}
              {expandedWallet === w.persona_id && (
                <div className="bg-gray-800/20 border-t border-gray-800/50 px-4 py-3 space-y-3">
                  {/* Wallet Address + Solscan */}
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] text-gray-400 font-mono flex-1">{w.wallet_address}</p>
                    <button onClick={() => navigator.clipboard.writeText(w.wallet_address)} className="text-[9px] text-gray-500 hover:text-white px-1.5 py-0.5 rounded bg-gray-700/50">Copy</button>
                    <a href={`https://solscan.io/account/${w.wallet_address}`} target="_blank" rel="noopener noreferrer" className="text-[9px] text-cyan-400 hover:text-cyan-300 px-1.5 py-0.5 rounded bg-cyan-500/10">Solscan</a>
                  </div>

                  {/* Balances Grid */}
                  <div className="grid grid-cols-4 gap-2">
                    <div className="bg-gray-900/50 rounded-lg p-2">
                      <p className="text-[8px] text-gray-500">SOL</p>
                      <p className="text-xs font-bold text-cyan-400">{Number(w.sol_balance).toFixed(6)}</p>
                    </div>
                    <div className="bg-gray-900/50 rounded-lg p-2">
                      <p className="text-[8px] text-gray-500">BUDJU</p>
                      <p className="text-xs font-bold text-fuchsia-400">{formatBudjuAmount(Number(w.budju_balance))}</p>
                    </div>
                    <div className="bg-gray-900/50 rounded-lg p-2">
                      <p className="text-[8px] text-gray-500">FUNDED SOL</p>
                      <p className="text-xs font-bold text-gray-300">{Number(w.total_funded_sol).toFixed(4)}</p>
                    </div>
                    <div className="bg-gray-900/50 rounded-lg p-2">
                      <p className="text-[8px] text-gray-500">FUNDED BUDJU</p>
                      <p className="text-xs font-bold text-gray-300">{formatBudjuAmount(Number(w.total_funded_budju))}</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-1.5">
                    <button onClick={() => toggleWallet(w.persona_id, w.is_active)} disabled={loading}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-bold ${w.is_active ? "bg-red-500/20 text-red-400 hover:bg-red-500/30" : "bg-green-500/20 text-green-400 hover:bg-green-500/30"}`}>
                      {w.is_active ? "Pause Trading" : "Resume Trading"}
                    </button>
                    <button onClick={() => viewPrivateKey(w.persona_id)} disabled={loading}
                      className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-amber-500/20 text-amber-400 hover:bg-amber-500/30">
                      View Key
                    </button>
                    <a href={`https://solscan.io/account/${w.wallet_address}`} target="_blank" rel="noopener noreferrer"
                      className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30">
                      Solscan
                    </a>
                  </div>

                  {/* Private Key (auto-hides after 10s) */}
                  {viewingKeys === w.persona_id && keyData && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2">
                      <p className="text-[9px] text-red-400 font-bold mb-1">ENCRYPTED PRIVATE KEY (auto-hides in 10s)</p>
                      <p className="text-[9px] text-gray-300 font-mono break-all">{keyData}</p>
                    </div>
                  )}

                  {/* Trade History */}
                  <div>
                    <p className="text-[9px] text-gray-500 font-bold mb-1">RECENT TRADES</p>
                    {!tradeHistory[w.persona_id] ? (
                      <p className="text-[10px] text-gray-600">Loading...</p>
                    ) : tradeHistory[w.persona_id].length === 0 ? (
                      <p className="text-[10px] text-gray-600">No trades yet</p>
                    ) : (
                      <div className="space-y-0.5 max-h-32 overflow-y-auto">
                        {tradeHistory[w.persona_id].slice(0, 10).map(t => (
                          <div key={t.id} className="flex items-center gap-2 text-[10px] px-1 py-0.5 hover:bg-gray-900/50 rounded">
                            <span className={`font-bold w-8 ${t.trade_type === "buy" ? "text-green-400" : "text-red-400"}`}>{t.trade_type.toUpperCase()}</span>
                            <span className="text-fuchsia-400 w-20 text-right">{formatBudjuAmount(t.budju_amount)}</span>
                            <span className="text-cyan-400 w-16 text-right">{Number(t.sol_amount).toFixed(4)} SOL</span>
                            <span className="text-gray-500 w-12 text-right">${Number(t.usd_value).toFixed(2)}</span>
                            <span className={`w-14 text-center ${t.status === "confirmed" ? "text-green-400" : t.status === "failed" ? "text-red-400" : "text-yellow-400"}`}>{t.status}</span>
                            <span className="text-gray-600 flex-1 text-right">{new Date(t.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
