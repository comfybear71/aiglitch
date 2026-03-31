"use client";

import { useState, useEffect, useCallback } from "react";
import { useAdmin } from "../AdminContext";
import { TradingData } from "../admin-types";

export default function GlitchTradingView() {
  const { authenticated } = useAdmin();
  const [data, setData] = useState<TradingData | null>(null);
  const [view, setView] = useState<"chart" | "leaderboard" | "holdings">("chart");
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/admin/trading");
    if (res.ok) setData(await res.json());
  }, []);

  const triggerTrades = async (count: number) => {
    setLoading(true);
    const res = await fetch("/api/admin/trading", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "trigger_trades", count }),
    });
    if (res.ok) setTimeout(() => fetchData(), 1000);
    setLoading(false);
  };

  useEffect(() => {
    if (authenticated && !data) fetchData();
  }, [authenticated, data, fetchData]);

  if (!data) {
    return (
      <div className="text-center py-12 text-gray-500">
        <div className="text-4xl animate-pulse mb-2">📈</div>
        <p>Loading GLITCH trading data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Price header + 24h stats */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-xs text-gray-500 mb-1">§GLITCH / SOL</p>
            <div className="flex items-baseline gap-3">
              <p className="text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
                {data.price.current_sol.toFixed(8)} SOL
              </p>
              <p className="text-sm text-gray-400">${data.price.current_usd.toFixed(6)}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={fetchData} className="px-3 py-1.5 bg-purple-500/20 text-purple-400 rounded-lg text-xs font-bold hover:bg-purple-500/30">Refresh</button>
            <button onClick={() => triggerTrades(10)} disabled={loading}
              className="px-3 py-1.5 bg-green-500/20 text-green-400 rounded-lg text-xs font-bold hover:bg-green-500/30 disabled:opacity-50">
              {loading ? "Trading..." : "Trigger 10 AI Trades"}
            </button>
            <button onClick={() => triggerTrades(25)} disabled={loading}
              className="px-3 py-1.5 bg-amber-500/20 text-amber-400 rounded-lg text-xs font-bold hover:bg-amber-500/30 disabled:opacity-50">
              {loading ? "..." : "25 Trades"}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
          <div className="bg-gray-800/50 rounded-lg p-2 text-center">
            <p className="text-lg font-bold text-white">{data.stats_24h.total_trades}</p>
            <p className="text-[10px] text-gray-500">24h Trades</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-2 text-center">
            <p className="text-lg font-bold text-cyan-400">{data.stats_24h.volume_sol.toFixed(2)} SOL</p>
            <p className="text-[10px] text-gray-500">24h Volume</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-2 text-center">
            <p className="text-sm font-bold">
              <span className="text-green-400">{data.stats_24h.buys} buys</span>
              {" / "}
              <span className="text-red-400">{data.stats_24h.sells} sells</span>
            </p>
            <p className="text-[10px] text-gray-500">Buy/Sell Ratio</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-2 text-center">
            <p className="text-sm font-bold text-purple-400">
              H: {data.stats_24h.high.toFixed(8)} / L: {data.stats_24h.low.toFixed(8)}
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
                <button key={v} onClick={() => setView(v)}
                  className={`px-2 py-1 rounded text-[10px] font-bold ${view === v ? "bg-purple-500/20 text-purple-400" : "text-gray-500 hover:text-gray-300"}`}>
                  {v === "chart" ? "Chart" : v === "leaderboard" ? "Leaderboard" : "Holdings"}
                </button>
              ))}
            </div>
          </div>

          {view === "chart" && data.price_history.length > 0 && (
            <div className="space-y-2">
              <div className="relative h-48 flex items-end gap-px overflow-x-auto">
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
                      <div key={i} className="flex-1 min-w-[4px] max-w-[12px] relative h-full group"
                        title={`${new Date(candle.time).toLocaleString()}\nO: ${candle.open.toFixed(8)}\nH: ${candle.high.toFixed(8)}\nL: ${candle.low.toFixed(8)}\nC: ${candle.close.toFixed(8)}\nVol: ${candle.volume.toLocaleString()}`}>
                        <div className={`absolute left-1/2 -translate-x-1/2 w-px ${isGreen ? "bg-green-500/60" : "bg-red-500/60"}`}
                          style={{ bottom: `${wickY}%`, height: `${wickH}%` }} />
                        <div className={`absolute left-0 right-0 rounded-sm ${isGreen ? "bg-green-500" : "bg-red-500"}`}
                          style={{ bottom: `${bodyY}%`, height: `${bodyH}%`, minHeight: "2px" }} />
                      </div>
                    );
                  });
                })()}
              </div>
              <div className="relative h-12 flex items-end gap-px overflow-x-auto">
                {(() => {
                  const hist = data.price_history.slice(-72);
                  const maxVol = Math.max(...hist.map(d => d.volume));
                  return hist.map((candle, i) => {
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

          {view === "chart" && data.price_history.length === 0 && (
            <div className="h-48 flex items-center justify-center text-gray-600 text-sm">No trade data yet. Trigger some AI trades!</div>
          )}

          {view === "leaderboard" && (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {data.leaderboard.map((trader, i) => (
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

          {view === "holdings" && (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {data.holdings.map((h) => (
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

        {/* Order Book */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h3 className="text-sm font-bold text-gray-400 mb-3">Order Book (24h)</h3>
          <div className="space-y-0.5 mb-2">
            <div className="flex justify-between text-[10px] text-gray-500 px-1 mb-1">
              <span>Price (SOL)</span><span>Amount (§GLITCH)</span><span>Total (SOL)</span>
            </div>
            {data.order_book.asks.slice().reverse().map((ask, i) => {
              const maxTotal = Math.max(...data.order_book.asks.map(a => a.total), 0.001);
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
            {data.order_book.asks.length === 0 && <p className="text-[10px] text-gray-600 text-center py-2">No sell orders</p>}
          </div>
          <div className="border-y border-gray-700 py-2 my-2 text-center">
            <p className="text-sm font-bold text-white">{data.price.current_sol.toFixed(8)} SOL</p>
            <p className="text-[10px] text-gray-500">${data.price.current_usd.toFixed(6)} USD</p>
          </div>
          <div className="space-y-0.5">
            {data.order_book.bids.map((bid, i) => {
              const maxTotal = Math.max(...data.order_book.bids.map(b => b.total), 0.001);
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
            {data.order_book.bids.length === 0 && <p className="text-[10px] text-gray-600 text-center py-2">No buy orders</p>}
          </div>
        </div>
      </div>

      {/* Recent trades */}
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
          {data.recent_trades.map((trade) => (
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
              {trade.commentary && (
                <div className="hidden group-hover:block absolute right-4 mt-8 bg-gray-800 border border-gray-700 rounded-lg p-2 text-[10px] text-gray-300 max-w-xs z-20 shadow-lg">
                  &quot;{trade.commentary}&quot;
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
