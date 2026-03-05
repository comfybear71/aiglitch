"use client";

import { useEffect, useState, useCallback } from "react";
import { useAdmin } from "../AdminContext";
import type { TradingData, PendingNft } from "../admin-types";

export default function TradingPage() {
  const { authenticated } = useAdmin();

  const [tradingData, setTradingData] = useState<TradingData | null>(null);
  const [tradingView, setTradingView] = useState<"chart" | "leaderboard" | "holdings">("chart");
  const [triggeringTrades, setTriggeringTrades] = useState(false);
  const [pendingNfts, setPendingNfts] = useState<PendingNft[]>([]);
  const [nftReconciling, setNftReconciling] = useState(false);
  const [nftLookupTx, setNftLookupTx] = useState("");
  const [nftLookupResult, setNftLookupResult] = useState<Record<string, unknown> | null>(null);

  const fetchTrading = useCallback(async () => {
    const res = await fetch("/api/admin/trading");
    if (res.ok) setTradingData(await res.json());
  }, []);

  const triggerAITrades = async (count: number) => {
    setTriggeringTrades(true);
    const res = await fetch("/api/admin/trading", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "trigger_trades", count }) });
    if (res.ok) setTimeout(() => fetchTrading(), 1000);
    setTriggeringTrades(false);
  };

  const fetchPendingNfts = async () => {
    const res = await fetch("/api/admin/nfts?action=pending");
    if (res.ok) { const data = await res.json(); setPendingNfts(data.pending); }
  };

  const autoReconcileNfts = async () => {
    setNftReconciling(true);
    const res = await fetch("/api/admin/nfts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "auto_reconcile" }) });
    if (res.ok) {
      const data = await res.json();
      alert(`Reconciled ${data.reconciled} of ${data.total_pending} pending NFTs.\n\n${data.results.map((r: { product: string; status: string; tx?: string }) => `${r.product}: ${r.status}${r.tx ? ` (${r.tx.slice(0, 12)}...)` : ""}`).join("\n")}`);
      fetchPendingNfts();
    }
    setNftReconciling(false);
  };

  const lookupNftTx = async () => {
    if (!nftLookupTx.trim()) return;
    const res = await fetch(`/api/admin/nfts?action=lookup_tx&tx=${nftLookupTx.trim()}`);
    if (res.ok) setNftLookupResult(await res.json());
    else { const data = await res.json(); setNftLookupResult({ error: data.error }); }
  };

  useEffect(() => {
    if (authenticated && !tradingData) { fetchTrading(); fetchPendingNfts(); }
  }, [authenticated]);

  if (!tradingData) {
    return <div className="text-center py-12 text-gray-500"><div className="text-4xl animate-pulse mb-2">📈</div><p>Loading trading data...</p></div>;
  }

  return (
    <div className="space-y-4">
      {/* Price header + 24h stats */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-xs text-gray-500 mb-1">§GLITCH / SOL</p>
            <div className="flex items-baseline gap-3">
              <p className="text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">{tradingData.price.current_sol.toFixed(8)} SOL</p>
              <p className="text-sm text-gray-400">${tradingData.price.current_usd.toFixed(6)}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={fetchTrading} className="px-3 py-1.5 bg-purple-500/20 text-purple-400 rounded-lg text-xs font-bold hover:bg-purple-500/30">Refresh</button>
            <button onClick={() => triggerAITrades(10)} disabled={triggeringTrades} className="px-3 py-1.5 bg-green-500/20 text-green-400 rounded-lg text-xs font-bold hover:bg-green-500/30 disabled:opacity-50">{triggeringTrades ? "Trading..." : "Trigger 10 AI Trades"}</button>
            <button onClick={() => triggerAITrades(25)} disabled={triggeringTrades} className="px-3 py-1.5 bg-amber-500/20 text-amber-400 rounded-lg text-xs font-bold hover:bg-amber-500/30 disabled:opacity-50">{triggeringTrades ? "..." : "25 Trades"}</button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
          <div className="bg-gray-800/50 rounded-lg p-2 text-center"><p className="text-lg font-bold text-white">{tradingData.stats_24h.total_trades}</p><p className="text-[10px] text-gray-500">24h Trades</p></div>
          <div className="bg-gray-800/50 rounded-lg p-2 text-center"><p className="text-lg font-bold text-cyan-400">{tradingData.stats_24h.volume_sol.toFixed(2)} SOL</p><p className="text-[10px] text-gray-500">24h Volume</p></div>
          <div className="bg-gray-800/50 rounded-lg p-2 text-center"><p className="text-sm font-bold"><span className="text-green-400">{tradingData.stats_24h.buys} buys</span>{" / "}<span className="text-red-400">{tradingData.stats_24h.sells} sells</span></p><p className="text-[10px] text-gray-500">Buy/Sell Ratio</p></div>
          <div className="bg-gray-800/50 rounded-lg p-2 text-center"><p className="text-sm font-bold text-purple-400">H: {tradingData.stats_24h.high.toFixed(8)} / L: {tradingData.stats_24h.low.toFixed(8)}</p><p className="text-[10px] text-gray-500">24h High / Low</p></div>
        </div>
      </div>

      {/* Chart + Views */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-gray-400">Price Chart (7d hourly)</h3>
          <div className="flex gap-1">
            {(["chart", "leaderboard", "holdings"] as const).map(v => (
              <button key={v} onClick={() => setTradingView(v)} className={`px-2 py-1 rounded text-[10px] font-bold ${tradingView === v ? "bg-purple-500/20 text-purple-400" : "text-gray-500 hover:text-gray-300"}`}>
                {v === "chart" ? "Chart" : v === "leaderboard" ? "Leaderboard" : "Holdings"}
              </button>
            ))}
          </div>
        </div>

        {tradingView === "chart" && tradingData.price_history.length > 0 && (
          <div className="space-y-2">
            <div className="relative h-48 flex items-end gap-px overflow-x-auto">
              {(() => {
                const data = tradingData.price_history;
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
                    <div key={i} className="flex-1 min-w-[4px] max-w-[12px] relative h-full group" title={`O:${candle.open.toFixed(8)} H:${candle.high.toFixed(8)} L:${candle.low.toFixed(8)} C:${candle.close.toFixed(8)}`}>
                      <div className={`absolute left-1/2 -translate-x-1/2 w-px ${isGreen ? "bg-green-500/60" : "bg-red-500/60"}`} style={{ bottom: `${wickY}%`, height: `${wickH}%` }} />
                      <div className={`absolute left-0 right-0 rounded-sm ${isGreen ? "bg-green-500" : "bg-red-500"}`} style={{ bottom: `${bodyY}%`, height: `${bodyH}%`, minHeight: "2px" }} />
                    </div>
                  );
                });
              })()}
            </div>
            <div className="relative h-12 flex items-end gap-px overflow-x-auto">
              {(() => {
                const data = tradingData.price_history.slice(-72);
                const maxVol = Math.max(...data.map(d => d.volume));
                return data.map((candle, i) => {
                  const isGreen = candle.close >= candle.open;
                  const h = maxVol > 0 ? (candle.volume / maxVol) * 100 : 0;
                  return <div key={i} className={`flex-1 min-w-[4px] max-w-[12px] rounded-t-sm ${isGreen ? "bg-green-500/30" : "bg-red-500/30"}`} style={{ height: `${h}%` }} />;
                });
              })()}
            </div>
            <p className="text-[10px] text-gray-600 text-center">Volume</p>
          </div>
        )}

        {tradingView === "chart" && tradingData.price_history.length === 0 && (
          <div className="h-48 flex items-center justify-center text-gray-600 text-sm">No trade data yet. Trigger some AI trades!</div>
        )}

        {tradingView === "leaderboard" && (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {tradingData.leaderboard.map((trader, i) => (
              <div key={trader.persona_id} className="flex items-center justify-between bg-gray-800/30 rounded-lg px-2 py-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-4">{i + 1}</span>
                  <span>{trader.avatar_emoji}</span>
                  <div><p className="text-xs font-bold">{trader.display_name}</p><p className="text-[10px] text-gray-500">@{trader.username} · {trader.strategy}</p></div>
                </div>
                <div className="text-right">
                  <p className={`text-xs font-bold ${Number(trader.net_sol) >= 0 ? "text-green-400" : "text-red-400"}`}>{Number(trader.net_sol) >= 0 ? "+" : ""}{Number(trader.net_sol).toFixed(4)} SOL</p>
                  <p className="text-[10px] text-gray-500">{Number(trader.total_trades)} trades</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {tradingView === "holdings" && (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {tradingData.holdings.map((h) => (
              <div key={h.persona_id} className="flex items-center justify-between bg-gray-800/30 rounded-lg px-2 py-1.5">
                <div className="flex items-center gap-2">
                  <span>{h.avatar_emoji}</span>
                  <div><p className="text-xs font-bold">{h.display_name}</p><p className="text-[10px] text-gray-500">@{h.username}</p></div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-purple-400">{Number(h.glitch_balance).toLocaleString()} §GLITCH</p>
                  <p className="text-[10px] text-yellow-400">{Number(h.sol_balance).toFixed(4)} SOL</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent trades */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h3 className="text-sm font-bold text-gray-400 mb-3">Recent Trades</h3>
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {tradingData.recent_trades.map((t) => (
            <div key={t.id} className="flex items-center justify-between bg-gray-800/30 rounded-lg px-2 py-1.5">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${t.trade_type === "buy" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>{t.trade_type.toUpperCase()}</span>
                <span>{t.avatar_emoji}</span>
                <div><p className="text-xs font-bold">{t.display_name}</p><p className="text-[10px] text-gray-500">{t.strategy}</p></div>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-white">{Number(t.glitch_amount).toLocaleString()} §GLITCH</p>
                <p className="text-[10px] text-gray-500">{Number(t.sol_amount).toFixed(4)} SOL · {new Date(t.created_at).toLocaleTimeString()}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* NFT Tools */}
      {pendingNfts.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-amber-400">Pending NFTs ({pendingNfts.length})</h3>
            <button onClick={autoReconcileNfts} disabled={nftReconciling} className="px-3 py-1.5 bg-amber-500/20 text-amber-400 rounded-lg text-xs font-bold hover:bg-amber-500/30 disabled:opacity-50">{nftReconciling ? "Reconciling..." : "Auto-Reconcile"}</button>
          </div>
          <div className="space-y-1">
            {pendingNfts.map(nft => (
              <div key={nft.id} className="flex items-center justify-between bg-gray-800/30 rounded-lg px-2 py-1.5">
                <div className="flex items-center gap-2"><span>{nft.product_emoji}</span><span className="text-xs">{nft.product_name}</span><span className="text-[10px] text-gray-500">#{nft.edition_number} · {nft.rarity}</span></div>
                <span className="text-[10px] text-gray-500">{nft.owner_username || nft.owner_id.slice(0, 8)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
