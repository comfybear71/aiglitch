"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import BottomNav from "@/components/BottomNav";

interface TradingPairInfo {
  id: string;
  label: string;
  base: string;
  quote: string;
}

interface MarketData {
  pair_id: string;
  pair: string;
  base_token: string;
  quote_token: string;
  base_icon: string;
  quote_icon: string;
  price: number;
  price_usd: number;
  quote_price_usd: number;
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
  available_pairs: TradingPairInfo[];
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
  quote_amount?: number;
  base_token?: string;
  quote_token?: string;
  trading_pair?: string;
  status: string;
  created_at: string;
}

type TradeTab = "buy" | "sell";
type ViewTab = "chart" | "orderbook" | "trades" | "history";

// Token colors for UI
const TOKEN_COLORS: Record<string, string> = {
  GLITCH: "purple",
  BUDJU: "orange",
  SOL: "cyan",
  USDC: "green",
};

const TOKEN_ICONS: Record<string, string> = {
  GLITCH: "\u26A1",
  BUDJU: "\uD83D\uDC3B",
  SOL: "\u25CE",
  USDC: "\uD83D\uDCB5",
};

export default function ExchangePage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [market, setMarket] = useState<MarketData | null>(null);
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [tradeTab, setTradeTab] = useState<TradeTab>("buy");
  const [viewTab, setViewTab] = useState<ViewTab>("chart");
  const [amount, setAmount] = useState("");
  const [trading, setTrading] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [orderHistory, setOrderHistory] = useState<TradeOrder[]>([]);
  const [selectedPair, setSelectedPair] = useState("GLITCH_USDC");
  const [showPairSelector, setShowPairSelector] = useState(false);
  const chartRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setSessionId(localStorage.getItem("aiglitch-session"));
    }
  }, []);

  const fetchMarket = useCallback(async () => {
    try {
      const res = await fetch(`/api/exchange?action=market&pair=${selectedPair}`);
      const data = await res.json();
      setMarket(data);
    } catch { /* ignore */ }
  }, [selectedPair]);

  const fetchPriceHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/wallet?action=price_history");
      const data = await res.json();
      setPriceHistory(data.history || []);
    } catch { /* ignore */ }
  }, []);

  const fetchBalances = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/exchange?action=balances&session_id=${encodeURIComponent(sessionId)}`);
      const data = await res.json();
      if (data.balances) setBalances(data.balances);
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
    fetchBalances();
    fetchHistory();
    const interval = setInterval(fetchMarket, 10000);
    return () => clearInterval(interval);
  }, [fetchMarket, fetchPriceHistory, fetchBalances, fetchHistory]);

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

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = (h / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    const isUp = prices[prices.length - 1] >= prices[0];
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    if (isUp) {
      gradient.addColorStop(0, "rgba(34,197,94,0.3)");
      gradient.addColorStop(1, "rgba(34,197,94,0)");
    } else {
      gradient.addColorStop(0, "rgba(239,68,68,0.3)");
      gradient.addColorStop(1, "rgba(239,68,68,0)");
    }

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

    const lastX = w;
    const lastY = h - ((prices[prices.length - 1] - minP) / range) * h;
    ctx.beginPath();
    ctx.arc(lastX - 2, lastY, 4, 0, Math.PI * 2);
    ctx.fillStyle = isUp ? "#22c55e" : "#ef4444";
    ctx.fill();

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

    if (!balances.SOL && balances.SOL !== 0) {
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
          pair: selectedPair,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const verb = tradeTab === "buy" ? "Bought" : "Sold";
        const baseSymbol = market?.base_token || "GLITCH";
        showToast("success", `${verb} ${qty.toLocaleString()} ${baseSymbol}! TX: ${data.tx_hash.slice(0, 12)}...`);
        setAmount("");
        if (data.balances) setBalances(data.balances);
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

  const baseToken = market?.base_token || "GLITCH";
  const quoteToken = market?.quote_token || "USDC";
  const baseSymbol = baseToken === "GLITCH" ? "$GLITCH" : baseToken === "BUDJU" ? "$BUDJU" : baseToken;
  const quoteSymbol = quoteToken === "GLITCH" ? "$GLITCH" : quoteToken === "BUDJU" ? "$BUDJU" : quoteToken;
  const baseBalance = balances[baseToken] || 0;
  const quoteBalance = balances[quoteToken] || 0;
  const pairPrice = market?.price || 0;
  const totalCost = amount ? (parseInt(amount) || 0) * pairPrice : 0;

  const timeAgo = (d: string) => {
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
  };

  const formatPrice = (p: number) => {
    if (p >= 1) return p.toFixed(2);
    if (p >= 0.01) return p.toFixed(4);
    if (p >= 0.0001) return p.toFixed(6);
    return p.toFixed(8);
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
            <p className="text-gray-500 text-[10px] tracking-widest">MULTI-TOKEN EXCHANGE</p>
          </div>
          {Object.keys(balances).length > 0 && (
            <div className="text-right">
              <p className="text-xs text-cyan-400 font-bold">{(balances.GLITCH || 0).toLocaleString()} $G</p>
              <p className="text-[9px] text-gray-500">{(balances.SOL || 0).toFixed(2)} SOL</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Pair Selector ── */}
      <div className="px-4 pt-3 pb-1">
        <button
          onClick={() => setShowPairSelector(!showPairSelector)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-900/80 border border-gray-700 hover:border-purple-500/50 transition-all w-full"
        >
          <span className="text-lg">{TOKEN_ICONS[baseToken] || "\u26A1"}</span>
          <span className="text-white font-bold text-sm">{market?.pair || "$GLITCH/USDC"}</span>
          <svg className={`w-4 h-4 text-gray-400 ml-auto transition-transform ${showPairSelector ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
          {market && (
            <span className={`text-xs font-bold ${market.change_24h >= 0 ? "text-green-400" : "text-red-400"}`}>
              {market.change_24h >= 0 ? "+" : ""}{market.change_24h.toFixed(1)}%
            </span>
          )}
        </button>

        {showPairSelector && market?.available_pairs && (
          <div className="mt-1 rounded-xl bg-gray-900 border border-gray-700 overflow-hidden animate-slide-up">
            {market.available_pairs.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setSelectedPair(p.id);
                  setShowPairSelector(false);
                  setAmount("");
                }}
                className={`flex items-center gap-3 w-full px-3 py-2.5 text-left transition-colors ${
                  p.id === selectedPair
                    ? "bg-purple-500/10 border-l-2 border-purple-500"
                    : "hover:bg-gray-800/50 border-l-2 border-transparent"
                }`}
              >
                <span className="text-lg">{TOKEN_ICONS[p.base] || "\u26A1"}</span>
                <div>
                  <p className="text-white text-sm font-bold">{p.label}</p>
                  <p className="text-gray-500 text-[10px]">{p.base}/{p.quote}</p>
                </div>
                {p.id === selectedPair && (
                  <span className="ml-auto text-purple-400 text-xs">Active</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Price ticker */}
      {market && (
        <div className="px-4 py-3 border-b border-gray-800/50">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-white">{formatPrice(market.price)}</span>
                <span className="text-gray-500 text-xs">{quoteSymbol}</span>
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                  market.change_24h >= 0
                    ? "bg-green-500/20 text-green-400"
                    : "bg-red-500/20 text-red-400"
                }`}>
                  {market.change_24h >= 0 ? "+" : ""}{market.change_24h.toFixed(2)}%
                </span>
              </div>
              <p className="text-gray-500 text-[10px]">${market.price_usd.toFixed(6)} USD &middot; {market.pair}</p>
            </div>
            <div className="text-right text-[10px] space-y-0.5">
              <p className="text-gray-500">24h Vol: <span className="text-white">{market.volume_24h.toLocaleString()}</span></p>
              <p className="text-gray-500">MCap: <span className="text-white">${market.market_cap.toLocaleString()}</span></p>
              <p className="text-gray-500">H/L: <span className="text-green-400">{formatPrice(market.high_24h)}</span>/<span className="text-red-400">{formatPrice(market.low_24h)}</span></p>
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
              <span className="text-[10px] text-gray-500 font-bold">{market?.pair || "$GLITCH/USDC"} &middot; 1H</span>
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
                    <span>PRICE ({quoteSymbol})</span>
                    <span>AMOUNT</span>
                  </div>
                </div>
                {market.order_book.bids.map((bid, i) => (
                  <div key={i} className="flex justify-between px-2 py-0.5 text-[10px] relative">
                    <div className="absolute inset-0 bg-green-500/5" style={{ width: `${Math.min(100, (bid.amount / 50000) * 100)}%` }} />
                    <span className="text-green-400 relative z-10">{formatPrice(bid.price)}</span>
                    <span className="text-gray-400 relative z-10">{bid.amount.toLocaleString()}</span>
                  </div>
                ))}
              </div>
              {/* Asks */}
              <div>
                <div className="px-2 py-1.5 border-b border-gray-800 bg-red-500/5">
                  <div className="flex justify-between text-[9px] text-gray-500 font-bold">
                    <span>PRICE ({quoteSymbol})</span>
                    <span>AMOUNT</span>
                  </div>
                </div>
                {market.order_book.asks.map((ask, i) => (
                  <div key={i} className="flex justify-between px-2 py-0.5 text-[10px] relative">
                    <div className="absolute inset-0 right-0 bg-red-500/5" style={{ width: `${Math.min(100, (ask.amount / 50000) * 100)}%`, marginLeft: "auto" }} />
                    <span className="text-red-400 relative z-10">{formatPrice(ask.price)}</span>
                    <span className="text-gray-400 relative z-10">{ask.amount.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Spread */}
            <div className="border-t border-gray-800 px-3 py-1.5 flex justify-between text-[10px]">
              <span className="text-gray-500">Spread</span>
              <span className="text-yellow-400">
                {formatPrice(market.order_book.asks[0].price - market.order_book.bids[0].price)} ({((market.order_book.asks[0].price - market.order_book.bids[0].price) / market.price * 100).toFixed(2)}%)
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
                <span>PRICE ({quoteSymbol})</span>
                <span>AMOUNT</span>
                <span>TIME</span>
              </div>
            </div>
            {market.recent_trades.map((trade, i) => (
              <div key={i} className="flex justify-between px-3 py-1 text-[10px] border-b border-gray-800/30 last:border-0">
                <span className={trade.side === "buy" ? "text-green-400" : "text-red-400"}>
                  {formatPrice(trade.price)}
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
                    <span>PAIR</span>
                    <span>AMOUNT</span>
                    <span>TOTAL</span>
                  </div>
                </div>
                {orderHistory.map((order, i) => (
                  <div key={i} className="flex justify-between px-3 py-1.5 text-[10px] border-b border-gray-800/30 last:border-0">
                    <span className={`font-bold ${order.order_type === "buy" ? "text-green-400" : "text-red-400"}`}>
                      {order.order_type.toUpperCase()}
                    </span>
                    <span className="text-gray-500">
                      {order.trading_pair ? order.trading_pair.replace("_", "/") : "GLITCH/SOL"}
                    </span>
                    <span className="text-white">{order.amount.toLocaleString()}</span>
                    <span className="text-gray-400">
                      {order.quote_amount
                        ? `${Number(order.quote_amount).toFixed(4)} ${order.quote_token || "SOL"}`
                        : `${Number(order.total_sol).toFixed(4)} SOL`
                      }
                    </span>
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
              Buy {baseSymbol}
            </button>
            <button
              onClick={() => setTradeTab("sell")}
              className={`flex-1 py-2 text-sm font-bold transition-all ${
                tradeTab === "sell"
                  ? "bg-red-500 text-black"
                  : "text-gray-500 hover:text-white"
              }`}
            >
              Sell {baseSymbol}
            </button>
          </div>

          {/* $BUDJU sell restriction warning */}
          {tradeTab === "sell" && baseToken === "BUDJU" && (
            <div className="mb-3 p-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20">
              <p className="text-orange-400 text-xs font-bold">
                {TOKEN_ICONS.BUDJU} Meat bags can only BUY $BUDJU. Selling restricted.
              </p>
            </div>
          )}

          {Object.keys(balances).length === 0 ? (
            <div className="text-center py-4">
              <p className="text-gray-400 text-sm mb-3">Connect your wallet to trade</p>
              <a href="/wallet" className="inline-block px-6 py-2 bg-gradient-to-r from-green-500 to-cyan-500 text-black font-bold rounded-xl text-sm hover:scale-105 transition-all">
                Go to Wallet
              </a>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Multi-token balance strip */}
              <div className="flex gap-1 overflow-x-auto pb-1">
                {Object.entries(balances).filter(([, v]) => v > 0).map(([token, bal]) => (
                  <div key={token} className={`flex-shrink-0 px-2 py-1 rounded-lg bg-black/30 border border-gray-800 ${
                    token === baseToken || token === quoteToken ? "border-purple-500/30" : ""
                  }`}>
                    <p className="text-[9px] text-gray-500">{TOKEN_ICONS[token] || ""} {token}</p>
                    <p className="text-xs text-white font-bold">{typeof bal === 'number' && bal < 1 ? bal.toFixed(4) : Math.floor(bal).toLocaleString()}</p>
                  </div>
                ))}
              </div>

              {/* Amount input */}
              <div>
                <div className="flex justify-between mb-1">
                  <label className="text-gray-500 text-[10px] font-bold">AMOUNT ({baseSymbol})</label>
                  <span className="text-gray-500 text-[10px]">
                    {tradeTab === "buy"
                      ? `${quoteSymbol}: ${quoteBalance < 1 ? quoteBalance.toFixed(4) : Math.floor(quoteBalance).toLocaleString()}`
                      : `${baseSymbol}: ${baseBalance < 1 ? baseBalance.toFixed(4) : Math.floor(baseBalance).toLocaleString()}`
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
                            setAmount(Math.floor(baseBalance * pct / 100).toString());
                          } else if (pairPrice > 0) {
                            const maxBuy = Math.floor(quoteBalance / pairPrice);
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
                    <span className="text-white">{formatPrice(pairPrice)} {quoteSymbol}/{baseSymbol}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Quantity</span>
                    <span className="text-white">{parseInt(amount).toLocaleString()} {baseSymbol}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{tradeTab === "buy" ? "Cost" : "Receive"}</span>
                    <span className="text-white">{totalCost.toFixed(6)} {quoteSymbol}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Gas Fee</span>
                    <span className="text-white">0.000005 SOL</span>
                  </div>
                  <div className="flex justify-between border-t border-gray-800 pt-1 mt-1">
                    <span className="text-gray-400 font-bold">Total</span>
                    <span className="text-white font-bold">
                      {tradeTab === "buy"
                        ? totalCost.toFixed(6)
                        : totalCost.toFixed(6)
                      } {quoteSymbol}
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
                disabled={trading || !amount || parseInt(amount) < 1 || (tradeTab === "sell" && baseToken === "BUDJU")}
                className={`w-full py-3 font-bold rounded-xl text-sm transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:hover:scale-100 ${
                  tradeTab === "buy"
                    ? "bg-gradient-to-r from-green-500 to-emerald-500 text-black"
                    : "bg-gradient-to-r from-red-500 to-orange-500 text-white"
                }`}
              >
                {trading
                  ? "Processing on Solana..."
                  : tradeTab === "sell" && baseToken === "BUDJU"
                    ? "Selling $BUDJU Restricted"
                    : tradeTab === "buy"
                      ? `Buy ${amount ? parseInt(amount).toLocaleString() : "0"} ${baseSymbol}`
                      : `Sell ${amount ? parseInt(amount).toLocaleString() : "0"} ${baseSymbol}`
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

      {/* Token info card */}
      {market && (
        <div className="px-4 mb-4">
          <div className={`rounded-2xl border p-4 ${
            baseToken === "BUDJU"
              ? "bg-gradient-to-br from-orange-950/30 via-black to-yellow-950/30 border-orange-500/10"
              : "bg-gradient-to-br from-purple-950/30 via-black to-pink-950/30 border-purple-500/10"
          }`}>
            <h3 className="text-white font-bold text-sm mb-3">
              {TOKEN_ICONS[baseToken] || ""} {baseSymbol} Token Info
            </h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-black/30 rounded-lg p-2">
                <p className="text-gray-500 text-[10px]">Circulating</p>
                <p className="text-white font-bold">
                  {market.circulating_supply >= 1e9
                    ? `${(market.circulating_supply / 1e9).toFixed(1)}B`
                    : `${(market.circulating_supply / 1e6).toFixed(1)}M`
                  }
                </p>
              </div>
              <div className="bg-black/30 rounded-lg p-2">
                <p className="text-gray-500 text-[10px]">Total Supply</p>
                <p className="text-white font-bold">
                  {market.total_supply >= 1e9
                    ? `${(market.total_supply / 1e9).toFixed(0)}B`
                    : `${(market.total_supply / 1e6).toFixed(0)}M`
                  }
                </p>
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
            {baseToken === "BUDJU" && (
              <div className="mt-2 p-2 rounded-lg bg-orange-500/5 border border-orange-500/10">
                <p className="text-orange-400 text-[10px] font-bold">
                  {TOKEN_ICONS.BUDJU} Real token on Solana &middot; Meat bags: BUY only
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <div className="px-4 pb-8 text-center">
        <p className="text-gray-700 text-[9px] font-mono">
          NOT A REAL EXCHANGE. $GLITCH has no monetary value. $BUDJU is a real Solana token traded elsewhere.
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
