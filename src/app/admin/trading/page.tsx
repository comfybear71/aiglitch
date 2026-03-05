"use client";

import { useState, useEffect, useCallback } from "react";
import { useAdmin } from "../AdminContext";
import { TradingData, PendingNft } from "../admin-types";

export default function TradingPage() {
  const { authenticated } = useAdmin();

  const [tradingData, setTradingData] = useState<TradingData | null>(null);
  const [tradingView, setTradingView] = useState<"chart" | "leaderboard" | "holdings">("chart");
  const [triggeringTrades, setTriggeringTrades] = useState(false);

  // NFT management state
  const [pendingNfts, setPendingNfts] = useState<PendingNft[]>([]);
  const [nftReconciling, setNftReconciling] = useState(false);
  const [nftLookupTx, setNftLookupTx] = useState("");
  const [nftLookupResult, setNftLookupResult] = useState<Record<string, unknown> | null>(null);

  const fetchTrading = useCallback(async () => {
    const res = await fetch("/api/admin/trading");
    if (res.ok) {
      const data = await res.json();
      setTradingData(data);
    }
  }, []);

  const triggerAITrades = async (count: number) => {
    setTriggeringTrades(true);
    const res = await fetch("/api/admin/trading", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "trigger_trades", count }),
    });
    if (res.ok) {
      setTimeout(() => fetchTrading(), 1000);
    }
    setTriggeringTrades(false);
  };

  const fetchPendingNfts = async () => {
    const res = await fetch("/api/admin/nfts?action=pending");
    if (res.ok) {
      const data = await res.json();
      setPendingNfts(data.pending);
    }
  };

  const autoReconcileNfts = async () => {
    setNftReconciling(true);
    const res = await fetch("/api/admin/nfts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "auto_reconcile" }),
    });
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
    if (res.ok) {
      setNftLookupResult(await res.json());
    } else {
      const data = await res.json();
      setNftLookupResult({ error: data.error });
    }
  };

  const reconcileSingleNft = async (nftId: string, txSig: string) => {
    const res = await fetch("/api/admin/nfts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reconcile", nft_id: nftId, tx_signature: txSig }),
    });
    if (res.ok) {
      const data = await res.json();
      alert(data.message);
      fetchPendingNfts();
    }
  };

  useEffect(() => {
    if (authenticated && !tradingData) {
      fetchTrading();
      fetchPendingNfts();
    }
  }, [authenticated, tradingData, fetchTrading]);

  return (
    <div className="space-y-4">
      {!tradingData ? (
        <div className="text-center py-12 text-gray-500">
          <div className="text-4xl animate-pulse mb-2">📈</div>
          <p>Loading trading data...</p>
        </div>
      ) : (
        <>
          {/* Price header + 24h stats */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-xs text-gray-500 mb-1">§GLITCH / SOL</p>
                <div className="flex items-baseline gap-3">
                  <p className="text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
                    {tradingData.price.current_sol.toFixed(8)} SOL
                  </p>
                  <p className="text-sm text-gray-400">${tradingData.price.current_usd.toFixed(6)}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={fetchTrading} className="px-3 py-1.5 bg-purple-500/20 text-purple-400 rounded-lg text-xs font-bold hover:bg-purple-500/30">Refresh</button>
                <button onClick={() => triggerAITrades(10)} disabled={triggeringTrades}
                  className="px-3 py-1.5 bg-green-500/20 text-green-400 rounded-lg text-xs font-bold hover:bg-green-500/30 disabled:opacity-50">
                  {triggeringTrades ? "Trading..." : "Trigger 10 AI Trades"}
                </button>
                <button onClick={() => triggerAITrades(25)} disabled={triggeringTrades}
                  className="px-3 py-1.5 bg-amber-500/20 text-amber-400 rounded-lg text-xs font-bold hover:bg-amber-500/30 disabled:opacity-50">
                  {triggeringTrades ? "..." : "25 Trades"}
                </button>
              </div>
            </div>
            {/* 24h stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
              <div className="bg-gray-800/50 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-white">{tradingData.stats_24h.total_trades}</p>
                <p className="text-[10px] text-gray-500">24h Trades</p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-cyan-400">{tradingData.stats_24h.volume_sol.toFixed(2)} SOL</p>
                <p className="text-[10px] text-gray-500">24h Volume</p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-2 text-center">
                <p className="text-sm font-bold">
                  <span className="text-green-400">{tradingData.stats_24h.buys} buys</span>
                  {" / "}
                  <span className="text-red-400">{tradingData.stats_24h.sells} sells</span>
                </p>
                <p className="text-[10px] text-gray-500">Buy/Sell Ratio</p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-2 text-center">
                <p className="text-sm font-bold text-purple-400">
                  H: {tradingData.stats_24h.high.toFixed(8)} / L: {tradingData.stats_24h.low.toFixed(8)}
                </p>
                <p className="text-[10px] text-gray-500">24h High / Low</p>
              </div>
            </div>
          </div>

          {/* Main grid: Chart + Order Book */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Price chart (2 cols) */}
            <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-gray-400">Price Chart (7d hourly)</h3>
                <div className="flex gap-1">
                  {(["chart", "leaderboard", "holdings"] as const).map(v => (
                    <button key={v} onClick={() => setTradingView(v)}
                      className={`px-2 py-1 rounded text-[10px] font-bold ${tradingView === v ? "bg-purple-500/20 text-purple-400" : "text-gray-500 hover:text-gray-300"}`}>
                      {v === "chart" ? "Chart" : v === "leaderboard" ? "Leaderboard" : "Holdings"}
                    </button>
                  ))}
                </div>
              </div>

              {tradingView === "chart" && tradingData.price_history.length > 0 && (
                <div className="space-y-2">
                  {/* ASCII-style candle chart */}
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
                          <div key={i} className="flex-1 min-w-[4px] max-w-[12px] relative h-full group" title={`${new Date(candle.time).toLocaleString()}\nO: ${candle.open.toFixed(8)}\nH: ${candle.high.toFixed(8)}\nL: ${candle.low.toFixed(8)}\nC: ${candle.close.toFixed(8)}\nVol: ${candle.volume.toLocaleString()}`}>
                            {/* Wick */}
                            <div className={`absolute left-1/2 -translate-x-1/2 w-px ${isGreen ? "bg-green-500/60" : "bg-red-500/60"}`}
                              style={{ bottom: `${wickY}%`, height: `${wickH}%` }} />
                            {/* Body */}
                            <div className={`absolute left-0 right-0 rounded-sm ${isGreen ? "bg-green-500" : "bg-red-500"}`}
                              style={{ bottom: `${bodyY}%`, height: `${bodyH}%`, minHeight: "2px" }} />
                          </div>
                        );
                      });
                    })()}
                  </div>
                  {/* Volume bars below */}
                  <div className="relative h-12 flex items-end gap-px overflow-x-auto">
                    {(() => {
                      const data = tradingData.price_history.slice(-72);
                      const maxVol = Math.max(...data.map(d => d.volume));
                      return data.map((candle, i) => {
                        const isGreen = candle.close >= candle.open;
                        const h = maxVol > 0 ? (candle.volume / maxVol) * 100 : 0;
                        return (
                          <div key={i} className={`flex-1 min-w-[4px] max-w-[12px] rounded-t-sm ${isGreen ? "bg-green-500/30" : "bg-red-500/30"}`}
                            style={{ height: `${h}%` }} />
                        );
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
                        <div>
                          <p className="text-xs font-bold">{trader.display_name}</p>
                          <p className="text-[10px] text-gray-500">@{trader.username} · {trader.strategy}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-xs font-bold ${Number(trader.net_sol) >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {Number(trader.net_sol) >= 0 ? "+" : ""}{Number(trader.net_sol).toFixed(4)} SOL
                        </p>
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
                        <div>
                          <p className="text-xs font-bold">{h.display_name}</p>
                          <p className="text-[10px] text-gray-500">@{h.username}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold text-purple-400">§{Number(h.glitch_balance).toLocaleString()}</p>
                        <p className="text-[10px] text-cyan-400">{Number(h.sol_balance).toFixed(4)} SOL</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Order Book (1 col) */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h3 className="text-sm font-bold text-gray-400 mb-3">Order Book (24h)</h3>

              {/* Asks (sells) - red, reversed so highest at top */}
              <div className="space-y-0.5 mb-2">
                <div className="flex justify-between text-[10px] text-gray-500 px-1 mb-1">
                  <span>Price (SOL)</span>
                  <span>Amount (§GLITCH)</span>
                  <span>Total (SOL)</span>
                </div>
                {tradingData.order_book.asks.slice().reverse().map((ask, i) => {
                  const maxTotal = Math.max(...tradingData.order_book.asks.map(a => a.total), 0.001);
                  const pct = (ask.total / maxTotal) * 100;
                  return (
                    <div key={`ask-${i}`} className="relative flex justify-between text-xs px-1 py-0.5 rounded">
                      <div className="absolute inset-0 bg-red-500/10 rounded" style={{ width: `${pct}%`, marginLeft: "auto" }} />
                      <span className="text-red-400 font-mono z-10">{ask.price.toFixed(8)}</span>
                      <span className="text-gray-300 font-mono z-10">{ask.amount.toLocaleString()}</span>
                      <span className="text-gray-500 font-mono z-10">{ask.total.toFixed(4)}</span>
                    </div>
                  );
                })}
                {tradingData.order_book.asks.length === 0 && <p className="text-[10px] text-gray-600 text-center py-2">No sell orders</p>}
              </div>

              {/* Spread / Current price */}
              <div className="border-y border-gray-700 py-2 my-2 text-center">
                <p className="text-sm font-bold text-white">{tradingData.price.current_sol.toFixed(8)} SOL</p>
                <p className="text-[10px] text-gray-500">${tradingData.price.current_usd.toFixed(6)} USD</p>
              </div>

              {/* Bids (buys) - green */}
              <div className="space-y-0.5">
                {tradingData.order_book.bids.map((bid, i) => {
                  const maxTotal = Math.max(...tradingData.order_book.bids.map(b => b.total), 0.001);
                  const pct = (bid.total / maxTotal) * 100;
                  return (
                    <div key={`bid-${i}`} className="relative flex justify-between text-xs px-1 py-0.5 rounded">
                      <div className="absolute inset-0 bg-green-500/10 rounded" style={{ width: `${pct}%` }} />
                      <span className="text-green-400 font-mono z-10">{bid.price.toFixed(8)}</span>
                      <span className="text-gray-300 font-mono z-10">{bid.amount.toLocaleString()}</span>
                      <span className="text-gray-500 font-mono z-10">{bid.total.toFixed(4)}</span>
                    </div>
                  );
                })}
                {tradingData.order_book.bids.length === 0 && <p className="text-[10px] text-gray-600 text-center py-2">No buy orders</p>}
              </div>
            </div>
          </div>

          {/* Recent trades feed */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h3 className="text-sm font-bold text-gray-400 mb-3">Recent Trades</h3>
            <div className="space-y-1 max-h-80 overflow-y-auto">
              <div className="flex justify-between text-[10px] text-gray-500 px-1 mb-1 sticky top-0 bg-gray-900">
                <span className="w-16">Type</span>
                <span className="w-20">Persona</span>
                <span className="w-24 text-right">Amount</span>
                <span className="w-20 text-right">SOL</span>
                <span className="w-24 text-right">Price</span>
                <span className="flex-1 text-right">Time</span>
              </div>
              {tradingData.recent_trades.map((trade) => (
                <div key={trade.id} className="flex justify-between items-center text-xs px-1 py-1 hover:bg-gray-800/50 rounded group">
                  <span className={`w-16 font-bold ${trade.trade_type === "buy" ? "text-green-400" : "text-red-400"}`}>
                    {trade.trade_type.toUpperCase()}
                  </span>
                  <span className="w-20 flex items-center gap-1 truncate">
                    <span>{trade.avatar_emoji}</span>
                    <span className="text-gray-300 truncate text-[10px]">{trade.display_name}</span>
                  </span>
                  <span className="w-24 text-right font-mono text-gray-300">§{Number(trade.glitch_amount).toLocaleString()}</span>
                  <span className="w-20 text-right font-mono text-cyan-400">{Number(trade.sol_amount).toFixed(4)}</span>
                  <span className="w-24 text-right font-mono text-gray-500">{Number(trade.price_per_glitch).toFixed(8)}</span>
                  <span className="flex-1 text-right text-gray-500 text-[10px]">{new Date(trade.created_at).toLocaleTimeString()}</span>
                  {/* Commentary tooltip on hover */}
                  {trade.commentary && (
                    <div className="hidden group-hover:block absolute right-4 mt-8 bg-gray-800 border border-gray-700 rounded-lg p-2 text-[10px] text-gray-300 max-w-xs z-20 shadow-lg">
                      &quot;{trade.commentary}&quot;
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* NFT Reconciliation Tools */}
          <div className="bg-gray-900 border border-amber-500/30 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-amber-400">NFT Reconciliation Tools</h3>
              <div className="flex gap-2">
                <button onClick={fetchPendingNfts} className="px-2 py-1 bg-gray-800 text-gray-400 rounded text-[10px] font-bold hover:bg-gray-700">
                  Check Pending
                </button>
                <button onClick={autoReconcileNfts} disabled={nftReconciling}
                  className="px-2 py-1 bg-amber-500/20 text-amber-400 rounded text-[10px] font-bold hover:bg-amber-500/30 disabled:opacity-50">
                  {nftReconciling ? "Reconciling..." : "Auto-Reconcile All"}
                </button>
              </div>
            </div>

            {/* Tx lookup */}
            <div className="flex gap-2 mb-3">
              <input value={nftLookupTx} onChange={(e) => setNftLookupTx(e.target.value)}
                placeholder="Paste tx signature or Solscan URL..."
                className="flex-1 px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs font-mono focus:outline-none focus:border-amber-500" />
              <button onClick={lookupNftTx} className="px-3 py-1.5 bg-purple-500/20 text-purple-400 rounded-lg text-xs font-bold hover:bg-purple-500/30">
                Lookup
              </button>
            </div>

            {/* Lookup result */}
            {nftLookupResult && (
              <div className="bg-gray-800/50 rounded-lg p-3 mb-3 text-xs space-y-1">
                {(nftLookupResult as Record<string, unknown>).error ? (
                  <p className="text-red-400">{String((nftLookupResult as Record<string, unknown>).error)}</p>
                ) : (
                  <>
                    <p className="text-green-400 font-bold">Transaction found on-chain</p>
                    {(nftLookupResult as Record<string, unknown>).on_chain && (
                      <p className="text-gray-400">
                        Slot: {String(((nftLookupResult as Record<string, unknown>).on_chain as Record<string, unknown>)?.slot)} |
                        Success: {String(((nftLookupResult as Record<string, unknown>).on_chain as Record<string, unknown>)?.success)} |
                        Fee: {String(((nftLookupResult as Record<string, unknown>).on_chain as Record<string, unknown>)?.fee)} lamports
                      </p>
                    )}
                    {(nftLookupResult as Record<string, unknown>).db_nft ? (
                      <p className="text-purple-400">DB Record: {String(((nftLookupResult as Record<string, unknown>).db_nft as Record<string, unknown>)?.product_name)} — hash: {String(((nftLookupResult as Record<string, unknown>).db_nft as Record<string, unknown>)?.mint_tx_hash)}</p>
                    ) : (
                      <p className="text-amber-400">No matching NFT record in database for this tx</p>
                    )}
                  </>
                )}
                <button onClick={() => setNftLookupResult(null)} className="text-[10px] text-gray-500 hover:text-gray-300 mt-1">Dismiss</button>
              </div>
            )}

            {/* Pending NFTs list */}
            {pendingNfts.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] text-amber-400 font-bold mb-1">{pendingNfts.length} pending NFTs (minted in DB but not confirmed on-chain)</p>
                {pendingNfts.map((nft) => (
                  <div key={nft.id} className="flex items-center justify-between bg-gray-800/30 rounded-lg px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <span>{nft.product_emoji}</span>
                      <div>
                        <p className="text-xs font-bold text-gray-300">{nft.product_name}</p>
                        <p className="text-[10px] text-gray-500">
                          Owner: {nft.owner_username ? `@${nft.owner_username}` : nft.owner_id.slice(0, 12)} |
                          {nft.rarity} #{nft.edition_number} |
                          {new Date(nft.created_at).toLocaleString()}
                        </p>
                        <p className="text-[10px] text-gray-600 font-mono truncate max-w-xs">Mint: {nft.mint_address}</p>
                      </div>
                    </div>
                    <button onClick={() => {
                      const tx = prompt(`Paste the Solana tx signature for "${nft.product_name}":`);
                      if (tx) reconcileSingleNft(nft.id, tx.trim());
                    }}
                      className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-[10px] font-bold hover:bg-green-500/30 shrink-0">
                      Fix
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
