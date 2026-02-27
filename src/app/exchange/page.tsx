"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import BottomNav from "@/components/BottomNav";
import TokenIcon from "@/components/TokenIcon";
import { VersionedTransaction, Connection } from "@solana/web3.js";

// Token mint addresses for Jupiter swap
const MINT_ADDRESSES: Record<string, string> = {
  GLITCH: "5hfHCmaL6e9bvruy35RQyghMXseTE2mXJ7ukqKAcS8fT",
  BUDJU: "2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump",
  SOL: "So11111111111111111111111111111111111111112",
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
};

const TOKEN_DECIMALS: Record<string, number> = {
  SOL: 9,
  USDC: 6,
  GLITCH: 9,
  BUDJU: 9,
};

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

interface JupiterQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct: string;
  routePlan: { swapInfo: { label: string } }[];
}

type TradeTab = "buy" | "sell";
type ViewTab = "chart" | "orderbook" | "trades" | "history";

export default function ExchangePage() {
  const { connected, publicKey, signTransaction } = useWallet();
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

  // Phantom on-chain balances
  const [phantomBalances, setPhantomBalances] = useState<Record<string, number>>({});

  // Jupiter swap state
  const [swapInputToken, setSwapInputToken] = useState("SOL");
  const [swapOutputToken, setSwapOutputToken] = useState("GLITCH");
  const [swapAmount, setSwapAmount] = useState("");
  const [swapQuote, setSwapQuote] = useState<JupiterQuote | null>(null);
  const [swapLoading, setSwapLoading] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const quoteTimeout = useRef<NodeJS.Timeout | null>(null);

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

  // Fetch real Phantom balances when connected
  const fetchPhantomBalances = useCallback(async () => {
    if (!publicKey || !sessionId) return;
    try {
      const res = await fetch(`/api/solana?action=balance&wallet_address=${publicKey.toBase58()}&session_id=${encodeURIComponent(sessionId)}`);
      const data = await res.json();
      setPhantomBalances({
        SOL: data.sol_balance || 0,
        USDC: data.usdc_balance || 0,
        GLITCH: data.glitch_balance || 0,
        BUDJU: data.budju_balance || 0,
      });
    } catch { /* ignore */ }
  }, [publicKey, sessionId]);

  useEffect(() => {
    fetchMarket();
    fetchPriceHistory();
    fetchBalances();
    fetchHistory();
    const interval = setInterval(fetchMarket, 10000);
    return () => clearInterval(interval);
  }, [fetchMarket, fetchPriceHistory, fetchBalances, fetchHistory]);

  useEffect(() => {
    if (connected && publicKey) {
      fetchPhantomBalances();
    }
  }, [connected, publicKey, fetchPhantomBalances]);

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

  // ── Jupiter Swap Functions ──
  const fetchJupiterQuote = useCallback(async (inputToken: string, outputToken: string, amt: string) => {
    if (!amt || parseFloat(amt) <= 0) {
      setSwapQuote(null);
      return;
    }
    const inputMint = MINT_ADDRESSES[inputToken];
    const outputMint = MINT_ADDRESSES[outputToken];
    if (!inputMint || !outputMint) return;

    const decimals = TOKEN_DECIMALS[inputToken] || 9;
    const amountLamports = Math.floor(parseFloat(amt) * Math.pow(10, decimals));

    setSwapLoading(true);
    try {
      const res = await fetch(
        `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountLamports}&slippageBps=100`
      );
      if (res.ok) {
        const quote = await res.json();
        setSwapQuote(quote);
      } else {
        setSwapQuote(null);
      }
    } catch {
      setSwapQuote(null);
    }
    setSwapLoading(false);
  }, []);

  useEffect(() => {
    if (quoteTimeout.current) clearTimeout(quoteTimeout.current);
    if (!swapAmount || parseFloat(swapAmount) <= 0) {
      setSwapQuote(null);
      return;
    }
    quoteTimeout.current = setTimeout(() => {
      fetchJupiterQuote(swapInputToken, swapOutputToken, swapAmount);
    }, 500);
    return () => { if (quoteTimeout.current) clearTimeout(quoteTimeout.current); };
  }, [swapAmount, swapInputToken, swapOutputToken, fetchJupiterQuote]);

  const executeSwap = async () => {
    if (!swapQuote || !publicKey || !signTransaction || swapping) return;
    setSwapping(true);
    try {
      const swapRes = await fetch("https://quote-api.jup.ag/v6/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteResponse: swapQuote,
          userPublicKey: publicKey.toBase58(),
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: "auto",
        }),
      });
      const { swapTransaction, error } = await swapRes.json();
      if (error) {
        showToast("error", error);
        setSwapping(false);
        return;
      }
      const transactionBuf = Buffer.from(swapTransaction, "base64");
      const transaction = VersionedTransaction.deserialize(transactionBuf);
      const signed = await signTransaction(transaction);
      const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
      const txid = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: true,
        maxRetries: 2,
      });
      showToast("success", `Swap successful! TX: ${txid.slice(0, 12)}...`);
      setSwapAmount("");
      setSwapQuote(null);
      setTimeout(fetchPhantomBalances, 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Swap failed";
      showToast("error", msg.includes("User rejected") ? "Transaction cancelled" : msg);
    } finally {
      setSwapping(false);
    }
  };

  const swapTokenPair = () => {
    const temp = swapInputToken;
    setSwapInputToken(swapOutputToken);
    setSwapOutputToken(temp);
    setSwapAmount("");
    setSwapQuote(null);
  };

  const outputDecimals = TOKEN_DECIMALS[swapOutputToken] || 9;
  const swapOutputAmount = swapQuote ? (parseInt(swapQuote.outAmount) / Math.pow(10, outputDecimals)) : 0;

  const baseToken = market?.base_token || "GLITCH";
  const quoteToken = market?.quote_token || "USDC";
  const baseSymbol = baseToken === "GLITCH" ? "$GLITCH" : baseToken === "BUDJU" ? "$BUDJU" : baseToken;
  const quoteSymbol = quoteToken === "GLITCH" ? "$GLITCH" : quoteToken === "BUDJU" ? "$BUDJU" : quoteToken;
  const baseBalance = balances[baseToken] || 0;
  const quoteBalance = balances[quoteToken] || 0;
  const pairPrice = market?.price || 0;
  const totalCost = amount ? (parseInt(amount) || 0) * pairPrice : 0;

  // Use Phantom balances when connected, otherwise use simulated
  const displayBalances = connected && Object.keys(phantomBalances).length > 0 ? phantomBalances : balances;

  const formatBalance = (val: number, token: string): string => {
    if (token === "SOL") return val.toFixed(4);
    if (token === "USDC") return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(2)}B`;
    if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(2)}M`;
    return val.toLocaleString();
  };

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
          {Object.keys(displayBalances).length > 0 && (
            <div className="text-right">
              <p className="text-xs text-cyan-400 font-bold">{(displayBalances.GLITCH || 0).toLocaleString()} $G</p>
              <p className="text-[9px] text-gray-500">{(displayBalances.SOL || 0).toFixed(2)} SOL</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Prominent Balance Bar ── */}
      {Object.keys(displayBalances).length > 0 && (
        <div className="px-4 pt-3 pb-2">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {Object.entries(displayBalances).map(([token, bal]) => (
              <div key={token} className="flex-shrink-0 px-3 py-2 rounded-xl bg-gray-900/80 border border-gray-800">
                <p className="text-[9px] text-gray-500 flex items-center gap-1"><TokenIcon token={token} size={10} /> {token}</p>
                <p className="text-xs text-white font-bold">{formatBalance(bal || 0, token)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Pair Selector ── */}
      <div className="px-4 pt-1 pb-1">
        <button
          onClick={() => setShowPairSelector(!showPairSelector)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-900/80 border border-gray-700 hover:border-purple-500/50 transition-all w-full"
        >
          <TokenIcon token={baseToken} size={24} />
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
                <TokenIcon token={p.base} size={24} />
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
              <p className="text-gray-500 text-[10px]">${market.price_usd.toFixed(6)} USD</p>
            </div>
            <div className="text-right text-[10px] space-y-0.5">
              <p className="text-gray-500">24h Vol: <span className="text-white">{market.volume_24h.toLocaleString()}</span></p>
              <p className="text-gray-500">MCap: <span className="text-white">${market.market_cap.toLocaleString()}</span></p>
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

      {/* ── IN-APP SWAP WITH PHANTOM ── */}
      {connected && publicKey && (
        <div className="px-4 mb-4">
          <div className="rounded-2xl bg-gradient-to-br from-purple-950/40 via-indigo-950/30 to-gray-900 border border-purple-500/30 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <h3 className="text-white font-bold text-sm">Swap with Phantom</h3>
            </div>

            {/* From */}
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-gray-500 text-[10px] font-bold">FROM</span>
                <button
                  onClick={() => {
                    const bal = phantomBalances[swapInputToken] || 0;
                    setSwapAmount(swapInputToken === "SOL" ? Math.max(0, bal - 0.01).toFixed(4) : Math.floor(bal).toString());
                  }}
                  className="text-[10px] text-purple-400 font-bold"
                >
                  Max: {formatBalance(phantomBalances[swapInputToken] || 0, swapInputToken)}
                </button>
              </div>
              <div className="flex gap-2">
                <select
                  value={swapInputToken}
                  onChange={(e) => {
                    setSwapInputToken(e.target.value);
                    if (e.target.value === swapOutputToken) setSwapOutputToken(swapInputToken);
                    setSwapQuote(null);
                  }}
                  className="w-24 px-2 py-2.5 bg-black/50 border border-gray-700 rounded-xl text-white text-sm font-bold focus:border-purple-500 focus:outline-none appearance-none cursor-pointer"
                >
                  {Object.keys(MINT_ADDRESSES).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input
                  type="number"
                  value={swapAmount}
                  onChange={(e) => setSwapAmount(e.target.value)}
                  placeholder="0.00"
                  className="flex-1 px-3 py-2.5 bg-black/50 border border-gray-700 rounded-xl text-white text-lg font-mono placeholder:text-gray-700 focus:border-purple-500 focus:outline-none text-right"
                />
              </div>
            </div>

            {/* Swap direction */}
            <div className="flex justify-center">
              <button onClick={swapTokenPair} className="w-8 h-8 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center hover:border-purple-500/50 transition-all">
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
              </button>
            </div>

            {/* To */}
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-gray-500 text-[10px] font-bold">TO</span>
                <span className="text-gray-600 text-[10px]">Bal: {formatBalance(phantomBalances[swapOutputToken] || 0, swapOutputToken)}</span>
              </div>
              <div className="flex gap-2">
                <select
                  value={swapOutputToken}
                  onChange={(e) => {
                    setSwapOutputToken(e.target.value);
                    if (e.target.value === swapInputToken) setSwapInputToken(swapOutputToken);
                    setSwapQuote(null);
                  }}
                  className="w-24 px-2 py-2.5 bg-black/50 border border-gray-700 rounded-xl text-white text-sm font-bold focus:border-purple-500 focus:outline-none appearance-none cursor-pointer"
                >
                  {Object.keys(MINT_ADDRESSES).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <div className="flex-1 px-3 py-2.5 bg-black/30 border border-gray-800 rounded-xl text-right">
                  <p className={`text-lg font-mono ${swapQuote ? "text-green-400" : "text-gray-700"}`}>
                    {swapLoading ? (
                      <span className="text-gray-600 animate-pulse">...</span>
                    ) : swapQuote ? (
                      swapOutputAmount < 1 ? swapOutputAmount.toFixed(6) : swapOutputAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })
                    ) : "0.00"}
                  </p>
                </div>
              </div>
            </div>

            {/* Quote details */}
            {swapQuote && (
              <div className="p-2 rounded-xl bg-black/30 border border-gray-800 space-y-1 text-[10px]">
                <div className="flex justify-between">
                  <span className="text-gray-500">Rate</span>
                  <span className="text-white">1 {swapInputToken} = {(swapOutputAmount / (parseFloat(swapAmount) || 1)).toFixed(4)} {swapOutputToken}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Impact</span>
                  <span className={parseFloat(swapQuote.priceImpactPct) > 1 ? "text-red-400" : "text-green-400"}>
                    {parseFloat(swapQuote.priceImpactPct).toFixed(4)}%
                  </span>
                </div>
              </div>
            )}

            {/* Swap button */}
            <button
              onClick={executeSwap}
              disabled={!swapQuote || swapping || swapLoading}
              className="w-full py-3 bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-bold rounded-xl text-sm transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40"
            >
              {swapping ? "Confirming in Phantom..." : swapQuote ? `Swap ${swapInputToken} for ${swapOutputToken}` : "Enter an amount"}
            </button>

            <p className="text-gray-600 text-[9px] text-center">
              Powered by Jupiter. Swaps via your Phantom wallet on Solana.
            </p>
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
                <TokenIcon token="BUDJU" size={16} className="mr-1" /> Meat bags can only BUY $BUDJU. Selling restricted.
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
                  <div className="flex justify-between border-t border-gray-800 pt-1 mt-1">
                    <span className="text-gray-400 font-bold">Total</span>
                    <span className="text-white font-bold">{totalCost.toFixed(6)} {quoteSymbol}</span>
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
                  ? "Processing..."
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

      {/* Disclaimer */}
      <div className="px-4 pb-8 text-center">
        <p className="text-gray-700 text-[9px] font-mono">
          DYOR. NFA. $GLITCH and $BUDJU are Solana tokens. Trade at your own risk.
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
