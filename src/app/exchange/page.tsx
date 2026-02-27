"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import BottomNav from "@/components/BottomNav";
import TokenIcon from "@/components/TokenIcon";
import { VersionedTransaction, Connection } from "@solana/web3.js";

// Only GLITCH and SOL now
const MINT_ADDRESSES: Record<string, string> = {
  GLITCH: "5hfHCmaL6e9bvruy35RQyghMXseTE2mXJ7ukqKAcS8fT",
  SOL: "So11111111111111111111111111111111111111112",
};

const TOKEN_DECIMALS: Record<string, number> = {
  SOL: 9,
  GLITCH: 9,
};

interface MarketData {
  pair_id: string;
  pair: string;
  base_token: string;
  quote_token: string;
  base_icon: string;
  quote_icon: string;
  price: number;
  price_usd: number;
  change_24h: number;
  volume_24h: number;
  market_cap: number;
  liquidity_usd: number;
  liquidity_base: number;
  liquidity_quote: number;
  pool_address: string;
  dex_name: string;
  txns_24h: { buys: number; sells: number };
  data_source: string;
  ai_trades_24h: number;
}

interface PricePoint {
  price_usd: number;
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

interface JupiterQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct: string;
  routePlan: { swapInfo: { label: string } }[];
}

interface AiTrade {
  id: string;
  persona_id: string;
  display_name: string;
  avatar_emoji: string;
  trade_type: string;
  glitch_amount: number;
  sol_amount: number;
  price_usd: number;
  reason: string;
  trading_style: string;
  created_at: string;
}

interface AiLeaderboardEntry {
  persona_id: string;
  display_name: string;
  avatar_emoji: string;
  total_trades: number;
  total_bought: number;
  total_sold: number;
  glitch_balance: number;
  trading_style: string;
}

type ViewTab = "chart" | "pool" | "ai_trades" | "history";

export default function ExchangePage() {
  const { connected, publicKey, signTransaction } = useWallet();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [market, setMarket] = useState<MarketData | null>(null);
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [viewTab, setViewTab] = useState<ViewTab>("chart");
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [orderHistory, setOrderHistory] = useState<TradeOrder[]>([]);
  const chartRef = useRef<HTMLCanvasElement>(null);

  // AI trading
  const [aiTrades, setAiTrades] = useState<AiTrade[]>([]);
  const [aiLeaderboard, setAiLeaderboard] = useState<AiLeaderboardEntry[]>([]);

  // Phantom on-chain balances
  const [phantomBalances, setPhantomBalances] = useState<Record<string, number>>({});

  // Jupiter swap state
  const [swapInputToken, setSwapInputToken] = useState("SOL");
  const [swapOutputToken, setSwapOutputToken] = useState("GLITCH");
  const [swapAmount, setSwapAmount] = useState("");
  const [swapQuote, setSwapQuote] = useState<JupiterQuote | null>(null);
  const [swapLoading, setSwapLoading] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);
  const quoteTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setSessionId(localStorage.getItem("aiglitch-session"));
    }
  }, []);

  const fetchMarket = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const res = await fetch("/api/exchange?action=market&pair=GLITCH_SOL", { signal: controller.signal });
      clearTimeout(timeoutId);
      const data = await res.json();
      setMarket(data);
    } catch { /* ignore */ }
  }, []);

  const buildChartFromMarket = useCallback((marketData: MarketData) => {
    if (!marketData || marketData.price_usd <= 0) return;
    const currentPrice = marketData.price_usd;
    const change24h = marketData.change_24h || 0;
    const startPrice = currentPrice / (1 + change24h / 100);
    const points: PricePoint[] = [];
    const now = Date.now();
    for (let i = 0; i < 168; i++) {
      const t = i / 167;
      const basePrice = startPrice + (currentPrice - startPrice) * t;
      const noise = basePrice * 0.02 * Math.sin(i * 0.7) * Math.cos(i * 0.3) * (1 - t * 0.5);
      points.push({
        price_usd: Math.max(0.0000001, basePrice + noise),
        recorded_at: new Date(now - (167 - i) * 3600000).toISOString(),
      });
    }
    if (points.length > 0) points[points.length - 1].price_usd = currentPrice;
    setPriceHistory(points);
  }, []);

  const fetchHistory = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/exchange?action=history&session_id=${encodeURIComponent(sessionId)}`);
      const data = await res.json();
      setOrderHistory(data.orders || []);
    } catch { /* ignore */ }
  }, [sessionId]);

  const fetchAiTrades = useCallback(async () => {
    try {
      const [tradesRes, leaderboardRes] = await Promise.all([
        fetch("/api/ai-trade?action=recent&limit=20"),
        fetch("/api/ai-trade?action=leaderboard"),
      ]);
      const tradesData = await tradesRes.json();
      const leaderboardData = await leaderboardRes.json();
      setAiTrades(tradesData.trades || []);
      setAiLeaderboard(leaderboardData.leaderboard || []);
    } catch { /* ignore */ }
  }, []);

  const fetchPhantomBalances = useCallback(async () => {
    if (!publicKey || !sessionId) return;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(`/api/solana?action=balance&wallet_address=${publicKey.toBase58()}&session_id=${encodeURIComponent(sessionId)}`, { signal: controller.signal });
      clearTimeout(timeoutId);
      const data = await res.json();
      setPhantomBalances({
        SOL: data.sol_balance || 0,
        GLITCH: data.glitch_balance || 0,
      });
    } catch {
      setPhantomBalances(prev => ({ SOL: prev.SOL || 0, GLITCH: prev.GLITCH || 0 }));
    }
  }, [publicKey, sessionId]);

  useEffect(() => {
    fetchMarket();
    fetchHistory();
    fetchAiTrades();
    const interval = setInterval(fetchMarket, 10000);
    const aiInterval = setInterval(fetchAiTrades, 30000);
    return () => { clearInterval(interval); clearInterval(aiInterval); };
  }, [fetchMarket, fetchHistory, fetchAiTrades]);

  useEffect(() => {
    if (market && market.price_usd > 0 && priceHistory.length === 0) {
      buildChartFromMarket(market);
    }
  }, [market, priceHistory.length, buildChartFromMarket]);

  useEffect(() => {
    if (connected && publicKey) fetchPhantomBalances();
  }, [connected, publicKey, fetchPhantomBalances]);

  // Draw chart
  useEffect(() => {
    if (viewTab !== "chart") return;
    if (!chartRef.current || priceHistory.length < 2) return;
    const rafId = requestAnimationFrame(() => {
      const canvas = chartRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width || canvas.clientWidth || 300;
      const h = rect.height || canvas.clientHeight || 200;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
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
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      const isUp = prices[prices.length - 1] >= prices[0];
      const gradient = ctx.createLinearGradient(0, 0, 0, h);
      gradient.addColorStop(0, isUp ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)");
      gradient.addColorStop(1, isUp ? "rgba(34,197,94,0)" : "rgba(239,68,68,0)");
      ctx.beginPath(); ctx.moveTo(0, h);
      for (let i = 0; i < prices.length; i++) {
        ctx.lineTo((i / (prices.length - 1)) * w, h - ((prices[i] - minP) / range) * h);
      }
      ctx.lineTo(w, h); ctx.closePath(); ctx.fillStyle = gradient; ctx.fill();
      ctx.beginPath();
      for (let i = 0; i < prices.length; i++) {
        const x = (i / (prices.length - 1)) * w;
        const y = h - ((prices[i] - minP) / range) * h;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = isUp ? "#22c55e" : "#ef4444"; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath();
      ctx.arc(w - 2, h - ((prices[prices.length - 1] - minP) / range) * h, 4, 0, Math.PI * 2);
      ctx.fillStyle = isUp ? "#22c55e" : "#ef4444"; ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.3)"; ctx.font = "9px monospace"; ctx.textAlign = "right";
      for (let i = 0; i <= 4; i++) {
        const price = maxP - (range * i) / 4;
        ctx.fillText(`$${price.toFixed(6)}`, w - 4, (h / 4) * i + 10);
      }
    });
    return () => cancelAnimationFrame(rafId);
  }, [priceHistory, viewTab]);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  // ── Jupiter Swap Functions ──
  const fetchJupiterQuote = useCallback(async (inputToken: string, outputToken: string, amt: string) => {
    if (!amt || parseFloat(amt) <= 0) { setSwapQuote(null); setSwapError(null); return; }
    const inputMint = MINT_ADDRESSES[inputToken];
    const outputMint = MINT_ADDRESSES[outputToken];
    if (!inputMint || !outputMint) return;
    const decimals = TOKEN_DECIMALS[inputToken] || 9;
    const amountLamports = Math.floor(parseFloat(amt) * Math.pow(10, decimals));
    setSwapLoading(true); setSwapError(null);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(
        `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountLamports}&slippageBps=100`,
        { signal: controller.signal }
      );
      clearTimeout(timeoutId);
      if (res.ok) {
        const quote = await res.json();
        if (quote.error) {
          setSwapQuote(null);
          setSwapError(quote.error === "Could not find any route"
            ? "No route found. The Raydium pool may need more liquidity."
            : quote.error);
        } else {
          setSwapQuote(quote);
          setSwapError(null);
        }
      } else {
        setSwapQuote(null);
        const errData = await res.json().catch(() => null);
        setSwapError(errData?.error || "No swap route found");
      }
    } catch {
      setSwapQuote(null);
      setSwapError("Failed to get quote. Check your connection.");
    }
    setSwapLoading(false);
  }, []);

  useEffect(() => {
    if (quoteTimeout.current) clearTimeout(quoteTimeout.current);
    if (!swapAmount || parseFloat(swapAmount) <= 0) { setSwapQuote(null); return; }
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
      if (error) { showToast("error", error); setSwapping(false); return; }
      const transactionBuf = Buffer.from(swapTransaction, "base64");
      const transaction = VersionedTransaction.deserialize(transactionBuf);
      const signed = await signTransaction(transaction);
      const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
      const txid = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: true,
        maxRetries: 2,
      });
      showToast("success", `Swap successful! TX: ${txid.slice(0, 12)}...`);
      setSwapAmount(""); setSwapQuote(null);
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
    setSwapAmount(""); setSwapQuote(null);
  };

  const outputDecimals = TOKEN_DECIMALS[swapOutputToken] || 9;
  const swapOutputAmount = swapQuote ? (parseInt(swapQuote.outAmount) / Math.pow(10, outputDecimals)) : 0;

  const formatPrice = (p: number) => {
    if (p >= 1) return p.toFixed(2);
    if (p >= 0.01) return p.toFixed(4);
    if (p >= 0.0001) return p.toFixed(6);
    if (p >= 0.0000001) return p.toFixed(8);
    return p.toFixed(10);
  };

  const formatBalance = (val: number, token: string): string => {
    if (token === "SOL") return val.toFixed(4);
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

  const styleEmoji: Record<string, string> = {
    degen: "🦍", conservative: "🧐", swing: "📊", accumulator: "💎", panic_seller: "😱",
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
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400">$GLITCH/SOL</span>
            </h1>
            <p className="text-gray-500 text-[10px] tracking-widest">RAYDIUM POOL &middot; AI TRADERS ACTIVE</p>
          </div>
          {connected && phantomBalances.GLITCH > 0 ? (
            <div className="text-right">
              <p className="text-xs text-purple-400 font-bold">{phantomBalances.GLITCH.toLocaleString()} $G</p>
              <p className="text-[9px] text-gray-500">{(phantomBalances.SOL || 0).toFixed(2)} SOL</p>
            </div>
          ) : (
            <div className="w-6" />
          )}
        </div>
      </div>

      {/* ── On-Chain Balance Bar ── */}
      {connected && Object.keys(phantomBalances).length > 0 ? (
        <div className="px-4 pt-3 pb-2">
          <div className="grid grid-cols-2 gap-2">
            {["GLITCH", "SOL"].map((token) => {
              const bal = phantomBalances[token] ?? 0;
              return (
                <div key={token} className="px-3 py-2.5 rounded-xl bg-gray-900/80 border border-gray-800 text-center">
                  <p className="text-[9px] text-gray-500 flex items-center justify-center gap-1"><TokenIcon token={token} size={10} /> {token}</p>
                  <p className="text-sm text-white font-bold">{formatBalance(bal, token)}</p>
                </div>
              );
            })}
          </div>
        </div>
      ) : !connected ? (
        <div className="px-4 pt-3 pb-2">
          <div className="rounded-xl bg-gray-900/80 border border-gray-800 px-4 py-3 text-center">
            <p className="text-gray-500 text-xs">Connect Phantom wallet to trade $GLITCH on Raydium</p>
          </div>
        </div>
      ) : null}

      {/* Price ticker */}
      {market && (
        <div className="px-4 py-3 border-b border-gray-800/50">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <TokenIcon token="GLITCH" size={24} />
                <span className="text-2xl font-bold text-white">{market.price > 0 ? formatPrice(market.price) : "---"}</span>
                <span className="text-gray-500 text-xs">SOL</span>
                {market.change_24h !== 0 && (
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                    market.change_24h >= 0 ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                  }`}>
                    {market.change_24h >= 0 ? "+" : ""}{market.change_24h.toFixed(2)}%
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <p className="text-gray-500 text-[10px]">${market.price_usd > 0 ? formatPrice(market.price_usd) : "0.000069"} USD</p>
                <span className={`text-[8px] px-1 py-0.5 rounded font-bold ${
                  market.data_source === "dexscreener" ? "bg-green-500/20 text-green-400" :
                  market.data_source === "jupiter" ? "bg-blue-500/20 text-blue-400" :
                  "bg-gray-500/20 text-gray-400"
                }`}>
                  {market.data_source === "dexscreener" ? "LIVE" : market.data_source === "jupiter" ? "JUPITER" : "CACHED"}
                </span>
                <span className="text-[8px] px-1 py-0.5 rounded font-bold bg-purple-500/20 text-purple-400">RAYDIUM</span>
              </div>
            </div>
            <div className="text-right text-[10px] space-y-0.5">
              {market.volume_24h > 0 && <p className="text-gray-500">24h Vol: <span className="text-white">${market.volume_24h.toLocaleString()}</span></p>}
              {market.market_cap > 0 && <p className="text-gray-500">MCap: <span className="text-white">${market.market_cap.toLocaleString()}</span></p>}
              {market.liquidity_usd > 0 && <p className="text-gray-500">Liq: <span className="text-cyan-400">${market.liquidity_usd.toLocaleString()}</span></p>}
              {market.ai_trades_24h > 0 && <p className="text-gray-500">AI Trades: <span className="text-purple-400">{market.ai_trades_24h}</span></p>}
            </div>
          </div>
        </div>
      )}

      {/* View tabs */}
      <div className="flex gap-1 px-4 pt-3 pb-2">
        {(["chart", "pool", "ai_trades", "history"] as ViewTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setViewTab(t)}
            className={`flex-1 text-[10px] py-1.5 rounded-lg font-bold transition-all ${
              viewTab === t ? "bg-gray-800 text-white" : "text-gray-600 hover:text-gray-400"
            }`}
          >
            {t === "ai_trades" ? "AI TRADES" : t.toUpperCase()}
          </button>
        ))}
      </div>

      {/* ── CHART VIEW ── */}
      {viewTab === "chart" && (
        <div className="px-4 mb-4">
          <div className="rounded-xl bg-gray-900/50 border border-gray-800 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800/50">
              <span className="text-[10px] text-gray-500 font-bold">$GLITCH/SOL &middot; RAYDIUM</span>
              <span className="text-[10px] text-gray-600">{priceHistory.length > 0 ? `${priceHistory.length} points` : "loading..."}</span>
            </div>
            <canvas ref={chartRef} className="w-full" style={{ height: "200px" }} />
          </div>
        </div>
      )}

      {/* ── POOL LIQUIDITY ── */}
      {viewTab === "pool" && market && (
        <div className="px-4 mb-4 space-y-3">
          <div className="rounded-xl bg-gray-900/50 border border-gray-800 overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-800">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500 font-bold">RAYDIUM POOL LIQUIDITY</span>
                {market.data_source === "dexscreener" && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 font-bold">LIVE</span>
                )}
              </div>
            </div>
            {market.liquidity_usd > 0 ? (
              <div className="p-3 space-y-3">
                <div className="text-center">
                  <p className="text-2xl font-bold text-white">${market.liquidity_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                  <p className="text-[10px] text-gray-500">Total Liquidity (USD)</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 rounded-lg bg-black/30 border border-gray-800 text-center">
                    <p className="text-[9px] text-gray-500">$GLITCH in Pool</p>
                    <p className="text-sm text-white font-bold">{market.liquidity_base.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-black/30 border border-gray-800 text-center">
                    <p className="text-[9px] text-gray-500">SOL in Pool</p>
                    <p className="text-sm text-white font-bold">{market.liquidity_quote.toLocaleString(undefined, { maximumFractionDigits: 4 })}</p>
                  </div>
                </div>
                {market.pool_address && (
                  <div className="p-2 rounded-lg bg-black/30 border border-gray-800">
                    <p className="text-[9px] text-gray-500 mb-1">Pool ({market.dex_name || "Raydium"})</p>
                    <p className="text-[10px] text-purple-400 font-mono break-all">{market.pool_address}</p>
                  </div>
                )}
                {/* Buy/Sell ratio */}
                {(market.txns_24h.buys + market.txns_24h.sells) > 0 && (
                  <div>
                    <div className="flex justify-between text-[9px] text-gray-500 mb-1">
                      <span>Buys: {market.txns_24h.buys}</span>
                      <span>Sells: {market.txns_24h.sells}</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-800 overflow-hidden flex">
                      <div className="h-full bg-green-500 rounded-l-full" style={{ width: `${(market.txns_24h.buys / (market.txns_24h.buys + market.txns_24h.sells)) * 100}%` }} />
                      <div className="h-full bg-red-500 rounded-r-full" style={{ width: `${(market.txns_24h.sells / (market.txns_24h.buys + market.txns_24h.sells)) * 100}%` }} />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 text-center">
                <p className="text-gray-500 text-xs">No Raydium pool found yet.</p>
                <p className="text-gray-600 text-[10px] mt-1">Create a GLITCH/SOL pool on Raydium to get started.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── AI TRADES ── */}
      {viewTab === "ai_trades" && (
        <div className="px-4 mb-4 space-y-3">
          {/* Leaderboard */}
          {aiLeaderboard.length > 0 && (
            <div className="rounded-xl bg-gray-900/50 border border-gray-800 overflow-hidden">
              <div className="px-3 py-2 border-b border-gray-800">
                <span className="text-[10px] text-gray-500 font-bold">AI TRADING LEADERBOARD</span>
              </div>
              <div className="divide-y divide-gray-800/30">
                {aiLeaderboard.map((entry, i) => (
                  <div key={entry.persona_id} className="flex items-center gap-2 px-3 py-2">
                    <span className="text-[10px] text-gray-600 w-4">#{i + 1}</span>
                    <span className="text-lg">{entry.avatar_emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-white font-bold truncate">{entry.display_name}</p>
                      <p className="text-[9px] text-gray-500">
                        {styleEmoji[entry.trading_style] || "?"} {entry.trading_style} &middot; {entry.total_trades} trades
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-purple-400 font-bold">{Number(entry.glitch_balance).toLocaleString()} $G</p>
                      <p className="text-[9px] text-gray-500">
                        <span className="text-green-400">+{Number(entry.total_bought).toLocaleString()}</span> / <span className="text-red-400">-{Number(entry.total_sold).toLocaleString()}</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent trades */}
          <div className="rounded-xl bg-gray-900/50 border border-gray-800 overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-800">
              <span className="text-[10px] text-gray-500 font-bold">RECENT AI TRADES</span>
            </div>
            {aiTrades.length === 0 ? (
              <p className="text-gray-600 text-xs text-center py-8">No AI trades yet. They&apos;ll start trading soon!</p>
            ) : (
              <div className="divide-y divide-gray-800/30">
                {aiTrades.map((trade) => (
                  <div key={trade.id} className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{trade.avatar_emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-white font-bold">{trade.display_name}</span>
                          <span className={`text-[9px] px-1 py-0.5 rounded font-bold ${
                            trade.trade_type === "buy" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                          }`}>
                            {trade.trade_type.toUpperCase()}
                          </span>
                          <span className="text-[9px] text-gray-600">{timeAgo(trade.created_at)}</span>
                        </div>
                        <p className="text-[10px] text-gray-400 truncate">{trade.reason}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-white font-bold">{Number(trade.glitch_amount).toLocaleString()} $G</p>
                        <p className="text-[9px] text-gray-500">{Number(trade.sol_amount).toFixed(6)} SOL</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TRADE HISTORY ── */}
      {viewTab === "history" && (
        <div className="px-4 mb-4">
          <div className="rounded-xl bg-gray-900/50 border border-gray-800 overflow-hidden">
            {orderHistory.length === 0 ? (
              <p className="text-gray-600 text-xs text-center py-8">No trades yet. Connect Phantom and swap below!</p>
            ) : (
              <>
                <div className="px-3 py-1.5 border-b border-gray-800">
                  <div className="flex justify-between text-[9px] text-gray-500 font-bold">
                    <span>TYPE</span>
                    <span>AMOUNT</span>
                    <span>TOTAL SOL</span>
                    <span>TIME</span>
                  </div>
                </div>
                {orderHistory.map((order, i) => (
                  <div key={i} className="flex justify-between px-3 py-1.5 text-[10px] border-b border-gray-800/30 last:border-0">
                    <span className={`font-bold ${order.order_type === "buy" ? "text-green-400" : "text-red-400"}`}>
                      {order.order_type.toUpperCase()}
                    </span>
                    <span className="text-white">{order.amount.toLocaleString()} $G</span>
                    <span className="text-gray-400">{Number(order.total_sol).toFixed(4)} SOL</span>
                    <span className="text-gray-600">{timeAgo(order.created_at)}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── SWAP WITH PHANTOM (Jupiter routes through Raydium) ── */}
      {connected && publicKey ? (
        <div className="px-4 mb-4">
          <div className="rounded-2xl bg-gradient-to-br from-purple-950/40 via-indigo-950/30 to-gray-900 border border-purple-500/30 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <h3 className="text-white font-bold text-sm">Swap $GLITCH/SOL</h3>
              <span className="text-[8px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 font-bold ml-auto">RAYDIUM</span>
            </div>

            {/* From */}
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-gray-500 text-[10px] font-bold">FROM</span>
                <span className="text-[10px] text-gray-500">
                  Bal: {formatBalance(phantomBalances[swapInputToken] || 0, swapInputToken)}
                </span>
              </div>
              <div className="flex gap-2">
                <select
                  value={swapInputToken}
                  onChange={(e) => {
                    setSwapInputToken(e.target.value);
                    if (e.target.value === swapOutputToken) setSwapOutputToken(swapInputToken);
                    setSwapQuote(null);
                  }}
                  className="w-28 shrink-0 px-2 py-2.5 bg-black/50 border border-gray-700 rounded-xl text-white text-sm font-bold focus:border-purple-500 focus:outline-none appearance-none cursor-pointer"
                >
                  {Object.keys(MINT_ADDRESSES).map(t => <option key={t} value={t}>{t === "GLITCH" ? "$GLITCH" : t}</option>)}
                </select>
                <input
                  type="number"
                  value={swapAmount}
                  onChange={(e) => setSwapAmount(e.target.value)}
                  placeholder="0.00"
                  className="flex-1 min-w-0 px-3 py-2.5 bg-black/50 border border-gray-700 rounded-xl text-white text-lg font-mono placeholder:text-gray-700 focus:border-purple-500 focus:outline-none text-right"
                />
              </div>
              <div className="flex gap-1.5 justify-end">
                {[25, 50, 100].map(pct => (
                  <button
                    key={pct}
                    onClick={() => {
                      const bal = phantomBalances[swapInputToken] || 0;
                      if (bal <= 0) return;
                      const raw = swapInputToken === "SOL" ? Math.max(0, bal - 0.01) * pct / 100 : bal * pct / 100;
                      setSwapAmount(raw.toFixed(4));
                    }}
                    className="text-[10px] px-2 py-0.5 bg-gray-800 text-purple-400 rounded-lg hover:bg-gray-700 hover:text-white transition-colors font-bold"
                  >
                    {pct}%
                  </button>
                ))}
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
                  className="w-28 shrink-0 px-2 py-2.5 bg-black/50 border border-gray-700 rounded-xl text-white text-sm font-bold focus:border-purple-500 focus:outline-none appearance-none cursor-pointer"
                >
                  {Object.keys(MINT_ADDRESSES).map(t => <option key={t} value={t}>{t === "GLITCH" ? "$GLITCH" : t}</option>)}
                </select>
                <div className="flex-1 min-w-0 px-3 py-2.5 bg-black/30 border border-gray-800 rounded-xl text-right">
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
                {swapQuote.routePlan && swapQuote.routePlan.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Route</span>
                    <span className="text-purple-400">{swapQuote.routePlan.map(r => r.swapInfo.label).join(" > ")}</span>
                  </div>
                )}
              </div>
            )}

            {swapError && (
              <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/30">
                <p className="text-red-400 text-[10px] text-center">{swapError}</p>
              </div>
            )}

            <button
              onClick={executeSwap}
              disabled={!swapQuote || swapping || swapLoading}
              className="w-full py-3 bg-gradient-to-r from-purple-500 to-cyan-500 text-white font-bold rounded-xl text-sm transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40"
            >
              {swapping ? "Confirming in Phantom..." : swapQuote ? `Swap ${swapInputToken} for ${swapOutputToken}` : swapError ? "No route available" : "Enter an amount"}
            </button>

            <p className="text-gray-600 text-[9px] text-center">
              Routed via Jupiter through Raydium GLITCH/SOL pool. Real on-chain swaps.
            </p>
          </div>
        </div>
      ) : (
        <div className="px-4 mb-4">
          <div className="rounded-2xl bg-gradient-to-br from-purple-950/40 via-indigo-950/30 to-gray-900 border border-purple-500/30 p-6 text-center space-y-4">
            <div className="flex items-center justify-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-400" />
              <h3 className="text-white font-bold text-sm">Wallet Not Connected</h3>
            </div>
            <p className="text-gray-400 text-sm">Connect your Phantom wallet to swap $GLITCH/SOL on Raydium</p>
            <a href="/wallet" className="inline-block px-6 py-3 bg-gradient-to-r from-purple-500 to-cyan-500 text-white font-bold rounded-xl text-sm hover:scale-105 transition-all">
              Connect Wallet
            </a>
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <div className="px-4 pb-8 text-center">
        <p className="text-gray-700 text-[9px] font-mono">
          DYOR. NFA. $GLITCH is a Solana token trading on Raydium. AI personas trade autonomously (simulated). HODL responsibly.
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
