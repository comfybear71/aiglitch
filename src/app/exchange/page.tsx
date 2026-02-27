"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import BottomNav from "@/components/BottomNav";

interface MarketData {
  pair: string;
  price_usd: number;
  price_sol: number;
  change_24h: number;
  high_24h: number;
  low_24h: number;
  volume_24h: number;
  market_cap: number;
  total_supply: number;
  circulating_supply: number;
  order_book: {
    bids: { price: number; amount: number; total: number }[];
    asks: { price: number; amount: number; total: number }[];
  };
  recent_trades: { price: number; amount: number; side: string; time: string }[];
  listed_exchanges: { name: string; type: string; volume: number }[];
}

interface PricePoint {
  price_usd: number;
  price_sol: number;
  volume_24h: number;
  market_cap: number;
  recorded_at: string;
}

interface TradeOrder {
  id: string;
  order_type: string;
  amount: number;
  price_per_coin: number;
  total_sol: number;
  status: string;
  created_at: string;
}

interface WalletInfo {
  address: string;
  sol_balance: number;
  glitch_token_balance: number;
}

type TradeTab = "buy" | "sell";
type ViewTab = "chart" | "orderbook" | "trades" | "history";

export default function ExchangePage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [market, setMarket] = useState<MarketData | null>(null);
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [tradeTab, setTradeTab] = useState<TradeTab>("buy");
  const [viewTab, setViewTab] = useState<ViewTab>("chart");
  const [amount, setAmount] = useState("");
  const [trading, setTrading] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [orderHistory, setOrderHistory] = useState<TradeOrder[]>([]);
  const chartRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setSessionId(localStorage.getItem("aiglitch-session"));
    }
  }, []);

  const fetchMarket = useCallback(async () => {
    try {
      const res = await fetch("/api/exchange?action=market");
      const data = await res.json();
      setMarket(data);
    } catch { /* ignore */ }
  }, []);

  const fetchPriceHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/wallet?action=price_history");
      const data = await res.json();
      setPriceHistory(data.history || []);
    } catch { /* ignore */ }
  }, []);

  const fetchWallet = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/wallet?session_id=${encodeURIComponent(sessionId)}`);
      const data = await res.json();
      if (data.wallet) setWallet(data.wallet);
    } catch { /* ignore */ }
  }, [sessionId]);

  const fetchHistory = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/exchange?action=history&session_id=${encodeURIComponent(sessionId)}`);
      const data = await res.json();
      setOrderHistory(data.orders || []);
    } catch { /* ignore */ }
  }, [sessionId]);

  useEffect(() => {
    fetchMarket();
    fetchPriceHistory();
    fetchWallet();
    fetchHistory();
    // Refresh market data every 10s
    const interval = setInterval(fetchMarket, 10000);
    return () => clearInterval(interval);
  }, [fetchMarket, fetchPriceHistory, fetchWallet, fetchHistory]);

  // Draw chart
  useEffect(() => {
    if (!chartRef.current || priceHistory.length < 2) return;
    const canvas = chartRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;

    const prices = priceHistory.map(p => p.price_usd);
    const minP = Math.min(...prices) * 0.95;
    const maxP = Math.max(...prices) * 1.05;
    const range = maxP - minP || 1;

    // Background
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = (h / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Price line
    const isUp = prices[prices.length - 1] >= prices[0];
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    if (isUp) {
      gradient.addColorStop(0, "rgba(34,197,94,0.3)");
      gradient.addColorStop(1, "rgba(34,197,94,0)");
    } else {
      gradient.addColorStop(0, "rgba(239,68,68,0.3)");
      gradient.addColorStop(1, "rgba(239,68,68,0)");
    }

    // Fill area under curve
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i < prices.length; i++) {
      const x = (i / (prices.length - 1)) * w;
      const y = h - ((prices[i] - minP) / range) * h;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Line
    ctx.beginPath();
    for (let i = 0; i < prices.length; i++) {
      const x = (i / (prices.length - 1)) * w;
      const y = h - ((prices[i] - minP) / range) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = isUp ? "#22c55e" : "#ef4444";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Current price dot
    const lastX = w;
    const lastY = h - ((prices[prices.length - 1] - minP) / range) * h;
    ctx.beginPath();
    ctx.arc(lastX - 2, lastY, 4, 0, Math.PI * 2);
    ctx.fillStyle = isUp ? "#22c55e" : "#ef4444";
    ctx.fill();

    // Price labels
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "9px monospace";
    ctx.textAlign = "right";
    for (let i = 0; i <= 4; i++) {
      const price = maxP - (range * i) / 4;
      const y = (h / 4) * i + 10;
      ctx.fillText(`$${price.toFixed(4)}`, w - 4, y);
    }
  }, [priceHistory]);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const handleTrade = async () => {
    if (!sessionId || !amount) return;
    const qty = parseInt(amount);
    if (isNaN(qty) || qty < 1) {
      showToast("error", "Enter a valid amount");
      return;
    }

    if (!wallet) {
      showToast("error", "Create a wallet first! Go to /wallet");
      return;
    }

    setTrading(true);
    try {
      const res = await fetch("/api/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          action: tradeTab,
          amount: qty,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const verb = tradeTab === "buy" ? "Bought" : "Sold";
        showToast("success", `${verb} ${qty.toLocaleString()} $GLITCH! TX: ${data.tx_hash.slice(0, 12)}...`);
        setAmount("");
        setWallet({
          ...wallet,
          glitch_token_balance: data.new_glitch_balance,
          sol_balance: data.new_sol_balance,
        });
        fetchMarket();
        fetchHistory();
        fetchPriceHistory();
      } else {
        showToast("error", data.error || "Trade failed");
      }
    } catch {
      showToast("error", "Network error");
    } finally {
      setTrading(false);
    }
  };

  const totalCost = market && amount ? (parseInt(amount) || 0) * market.price_sol : 0;
  const timeAgo = (d: string) => {
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
  };

  return (
    <main className="min-h-[100dvh] bg-black text-white font-mono pb-16">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-black/90 backdrop-blur-xl border-b border-gray-800/50">
        <div className="flex items-center justify-between px-4 py-3">
          <a href="/wallet" className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </a>
          <div className="text-center">
            <h1 className="text-lg font-bold">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-red-400">GlitchDEX</span>
            </h1>
            <p className="text-gray-500 text-[10px] tracking-widest">DECENTRALIZED EXCHANGE</p>
          </div>
          {wallet && (
            <div className="text-right">
              <p className="text-xs text-cyan-400 font-bold">{wallet.glitch_token_balance.toLocaleString()} $G</p>
              <p className="text-[9px] text-gray-500">{wallet.sol_balance.toFixed(2)} SOL</p>
            </div>
          )}
        </div>
      </div>

      {/* Price ticker */}
      {market && (
        <div className="px-4 py-3 border-b border-gray-800/50">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-white">${market.price_usd.toFixed(4)}</span>
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                  market.change_24h >= 0
                    ? "bg-green-500/20 text-green-400"
                    : "bg-red-500/20 text-red-400"
                }`}>
                  {market.change_24h >= 0 ? "+" : ""}{market.change_24h.toFixed(2)}%
                </span>
              </div>
              <p className="text-gray-500 text-[10px]">{market.price_sol.toFixed(8)} SOL &middot; {market.pair}</p>
            </div>
            <div className="text-right text-[10px] space-y-0.5">
              <p className="text-gray-500">24h Vol: <span className="text-white">{market.volume_24h.toLocaleString()}</span></p>
              <p className="text-gray-500">MCap: <span className="text-white">${market.market_cap.toLocaleString()}</span></p>
              <p className="text-gray-500">H/L: <span className="text-green-400">${market.high_24h.toFixed(4)}</span>/<span className="text-red-400">${market.low_24h.toFixed(4)}</span></p>
            </div>
          </div>
        </div>
      )}

      {/* Chart / View tabs */}
      <div className="flex gap-1 px-4 pt-3 pb-2">
        {(["chart", "orderbook", "trades", "history"] as ViewTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setViewTab(t)}
            className={`flex-1 text-[10px] py-1.5 rounded-lg font-bold transition-all capitalize ${
              viewTab === t
                ? "bg-gray-800 text-white"
                : "text-gray-600 hover:text-gray-400"
            }`}
          >
            {t === "orderbook" ? "Book" : t}
          </button>
        ))}
      </div>

      {/* ── CHART VIEW ── */}
      {viewTab === "chart" && (
        <div className="px-4 mb-4">
          <div className="rounded-xl bg-gray-900/50 border border-gray-800 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800/50">
              <span className="text-[10px] text-gray-500 font-bold">$GLITCH/USD &middot; 1H</span>
              <span className="text-[10px] text-gray-600">168 data points</span>
            </div>
            <canvas
              ref={chartRef}
              className="w-full"
              style={{ height: "200px" }}
            />
          </div>
        </div>
      )}

      {/* ── ORDER BOOK ── */}
      {viewTab === "orderbook" && market && (
        <div className="px-4 mb-4">
          <div className="rounded-xl bg-gray-900/50 border border-gray-800 overflow-hidden">
            <div className="grid grid-cols-2 gap-0">
              {/* Bids */}
              <div className="border-r border-gray-800">
                <div className="px-2 py-1.5 border-b border-gray-800 bg-green-500/5">
                  <div className="flex justify-between text-[9px] text-gray-500 font-bold">
                    <span>PRICE</span>
                    <span>AMOUNT</span>
                  </div>
                </div>
                {market.order_book.bids.map((bid, i) => (
                  <div key={i} className="flex justify-between px-2 py-0.5 text-[10px] relative">
                    <div className="absolute inset-0 bg-green-500/5" style={{ width: `${Math.min(100, (bid.amount / 50000) * 100)}%` }} />
                    <span className="text-green-400 relative z-10">${bid.price.toFixed(4)}</span>
                    <span className="text-gray-400 relative z-10">{bid.amount.toLocaleString()}</span>
                  </div>
                ))}
              </div>
              {/* Asks */}
              <div>
                <div className="px-2 py-1.5 border-b border-gray-800 bg-red-500/5">
                  <div className="flex justify-between text-[9px] text-gray-500 font-bold">
                    <span>PRICE</span>
                    <span>AMOUNT</span>
                  </div>
                </div>
                {market.order_book.asks.map((ask, i) => (
                  <div key={i} className="flex justify-between px-2 py-0.5 text-[10px] relative">
                    <div className="absolute inset-0 right-0 bg-red-500/5" style={{ width: `${Math.min(100, (ask.amount / 50000) * 100)}%`, marginLeft: "auto" }} />
                    <span className="text-red-400 relative z-10">${ask.price.toFixed(4)}</span>
                    <span className="text-gray-400 relative z-10">{ask.amount.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Spread */}
            <div className="border-t border-gray-800 px-3 py-1.5 flex justify-between text-[10px]">
              <span className="text-gray-500">Spread</span>
              <span className="text-yellow-400">
                ${(market.order_book.asks[0].price - market.order_book.bids[0].price).toFixed(4)} ({((market.order_book.asks[0].price - market.order_book.bids[0].price) / market.price_usd * 100).toFixed(2)}%)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── RECENT TRADES ── */}
      {viewTab === "trades" && market && (
        <div className="px-4 mb-4">
          <div className="rounded-xl bg-gray-900/50 border border-gray-800 overflow-hidden">
            <div className="px-3 py-1.5 border-b border-gray-800">
              <div className="flex justify-between text-[9px] text-gray-500 font-bold">
                <span>PRICE</span>
                <span>AMOUNT</span>
                <span>TIME</span>
              </div>
            </div>
            {market.recent_trades.map((trade, i) => (
              <div key={i} className="flex justify-between px-3 py-1 text-[10px] border-b border-gray-800/30 last:border-0">
                <span className={trade.side === "buy" ? "text-green-400" : "text-red-400"}>
                  ${trade.price.toFixed(4)}
                </span>
                <span className="text-gray-400">{trade.amount.toLocaleString()}</span>
                <span className="text-gray-600">{timeAgo(trade.time)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TRADE HISTORY ── */}
      {viewTab === "history" && (
        <div className="px-4 mb-4">
          <div className="rounded-xl bg-gray-900/50 border border-gray-800 overflow-hidden">
            {orderHistory.length === 0 ? (
              <p className="text-gray-600 text-xs text-center py-8">No trades yet. Start trading!</p>
            ) : (
              <>
                <div className="px-3 py-1.5 border-b border-gray-800">
                  <div className="flex justify-between text-[9px] text-gray-500 font-bold">
                    <span>TYPE</span>
                    <span>AMOUNT</span>
                    <span>PRICE</span>
                    <span>TOTAL</span>
                  </div>
                </div>
                {orderHistory.map((order, i) => (
                  <div key={i} className="flex justify-between px-3 py-1.5 text-[10px] border-b border-gray-800/30 last:border-0">
                    <span className={`font-bold ${order.order_type === "buy" ? "text-green-400" : "text-red-400"}`}>
                      {order.order_type.toUpperCase()}
                    </span>
                    <span className="text-white">{order.amount.toLocaleString()}</span>
                    <span className="text-gray-400">{Number(order.price_per_coin).toFixed(6)}</span>
                    <span className="text-gray-400">{Number(order.total_sol).toFixed(4)} SOL</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── TRADE PANEL ── */}
      <div className="px-4 mb-4">
        <div className="rounded-2xl bg-gray-900/80 border border-gray-800 p-4">
          {/* Buy/Sell toggle */}
          <div className="flex rounded-xl overflow-hidden mb-4 bg-black/50">
            <button
              onClick={() => setTradeTab("buy")}
              className={`flex-1 py-2 text-sm font-bold transition-all ${
                tradeTab === "buy"
                  ? "bg-green-500 text-black"
                  : "text-gray-500 hover:text-white"
              }`}
            >
              Buy
            </button>
            <button
              onClick={() => setTradeTab("sell")}
              className={`flex-1 py-2 text-sm font-bold transition-all ${
                tradeTab === "sell"
                  ? "bg-red-500 text-black"
                  : "text-gray-500 hover:text-white"
              }`}
            >
              Sell
            </button>
          </div>

          {!wallet ? (
            <div className="text-center py-4">
              <p className="text-gray-400 text-sm mb-3">Connect your wallet to trade</p>
              <a href="/wallet" className="inline-block px-6 py-2 bg-gradient-to-r from-green-500 to-cyan-500 text-black font-bold rounded-xl text-sm hover:scale-105 transition-all">
                Go to Wallet
              </a>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Amount */}
              <div>
                <div className="flex justify-between mb-1">
                  <label className="text-gray-500 text-[10px] font-bold">AMOUNT ($GLITCH)</label>
                  <span className="text-gray-500 text-[10px]">
                    {tradeTab === "buy"
                      ? `SOL: ${wallet.sol_balance.toFixed(4)}`
                      : `$GLITCH: ${wallet.glitch_token_balance.toLocaleString()}`
                    }
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0"
                    min="1"
                    className="w-full px-3 py-2.5 bg-black/50 border border-gray-700 rounded-xl text-white text-sm font-mono placeholder:text-gray-700 focus:border-purple-500 focus:outline-none"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                    {[25, 50, 100].map(pct => (
                      <button
                        key={pct}
                        onClick={() => {
                          if (tradeTab === "sell") {
                            setAmount(Math.floor(wallet.glitch_token_balance * pct / 100).toString());
                          } else if (market) {
                            const maxBuy = Math.floor((wallet.sol_balance - 0.000005) / market.price_sol);
                            setAmount(Math.max(0, Math.floor(maxBuy * pct / 100)).toString());
                          }
                        }}
                        className="text-[9px] px-1.5 py-0.5 bg-gray-800 text-gray-400 rounded hover:text-white transition-colors"
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Order summary */}
              {market && amount && parseInt(amount) > 0 && (
                <div className="p-3 rounded-xl bg-black/30 border border-gray-800 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Price</span>
                    <span className="text-white">{market.price_sol.toFixed(8)} SOL/token</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Quantity</span>
                    <span className="text-white">{parseInt(amount).toLocaleString()} $GLITCH</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{tradeTab === "buy" ? "Cost" : "Receive"}</span>
                    <span className="text-white">{totalCost.toFixed(6)} SOL</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Gas Fee</span>
                    <span className="text-white">0.000005 SOL</span>
                  </div>
                  <div className="flex justify-between border-t border-gray-800 pt-1 mt-1">
                    <span className="text-gray-400 font-bold">Total</span>
                    <span className="text-white font-bold">
                      {tradeTab === "buy"
                        ? (totalCost + 0.000005).toFixed(6)
                        : (totalCost - 0.000005).toFixed(6)
                      } SOL
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">USD Value</span>
                    <span className="text-green-400">${(parseInt(amount) * market.price_usd).toFixed(2)}</span>
                  </div>
                </div>
              )}

              {/* Trade button */}
              <button
                onClick={handleTrade}
                disabled={trading || !amount || parseInt(amount) < 1}
                className={`w-full py-3 font-bold rounded-xl text-sm transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:hover:scale-100 ${
                  tradeTab === "buy"
                    ? "bg-gradient-to-r from-green-500 to-emerald-500 text-black"
                    : "bg-gradient-to-r from-red-500 to-orange-500 text-white"
                }`}
              >
                {trading
                  ? "Processing on Solana..."
                  : tradeTab === "buy"
                    ? `Buy ${amount ? parseInt(amount).toLocaleString() : "0"} $GLITCH`
                    : `Sell ${amount ? parseInt(amount).toLocaleString() : "0"} $GLITCH`
                }
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Exchange listings */}
      {market && (
        <div className="px-4 mb-4">
          <div className="rounded-2xl bg-gray-900/80 border border-gray-800 p-4">
            <h3 className="text-white font-bold text-sm mb-3">Exchange Listings</h3>
            <div className="space-y-2">
              {market.listed_exchanges.map((ex, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 px-3 rounded-xl bg-black/30">
                  <div>
                    <p className="text-white text-xs font-bold">{ex.name}</p>
                    <p className="text-gray-600 text-[10px]">{ex.type}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-400 text-xs">${ex.volume.toLocaleString()}</p>
                    <p className="text-gray-600 text-[10px]">24h volume</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Market info */}
      {market && (
        <div className="px-4 mb-4">
          <div className="rounded-2xl bg-gradient-to-br from-purple-950/30 via-black to-pink-950/30 border border-purple-500/10 p-4">
            <h3 className="text-white font-bold text-sm mb-3">$GLITCH Token Info</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-black/30 rounded-lg p-2">
                <p className="text-gray-500 text-[10px]">Circulating</p>
                <p className="text-white font-bold">{(market.circulating_supply / 1000000).toFixed(1)}M</p>
              </div>
              <div className="bg-black/30 rounded-lg p-2">
                <p className="text-gray-500 text-[10px]">Total Supply</p>
                <p className="text-white font-bold">{(market.total_supply / 1000000).toFixed(0)}M</p>
              </div>
              <div className="bg-black/30 rounded-lg p-2">
                <p className="text-gray-500 text-[10px]">Market Cap</p>
                <p className="text-white font-bold">${market.market_cap.toLocaleString()}</p>
              </div>
              <div className="bg-black/30 rounded-lg p-2">
                <p className="text-gray-500 text-[10px]">FDV</p>
                <p className="text-white font-bold">${(market.price_usd * market.total_supply).toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <div className="px-4 pb-8 text-center">
        <p className="text-gray-700 text-[9px] font-mono">
          NOT A REAL EXCHANGE. NOT REAL CRYPTO. $GLITCH has no monetary value.
          If your portfolio goes to zero, that&apos;s actually by design.
          DYOR but there&apos;s nothing to research. NFA but the advice is: don&apos;t.
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-20 left-4 right-4 z-[60] animate-slide-up">
          <div className={`backdrop-blur-xl border rounded-2xl p-4 shadow-2xl ${
            toast.type === "success"
              ? "bg-gradient-to-r from-green-900/95 to-emerald-900/95 border-green-500/30"
              : "bg-gradient-to-r from-red-900/95 to-orange-900/95 border-red-500/30"
          }`}>
            <p className={`text-sm font-bold ${toast.type === "success" ? "text-green-300" : "text-red-300"}`}>
              {toast.message}
            </p>
          </div>
        </div>
      )}

      <BottomNav />
    </main>
  );
}
