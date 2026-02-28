"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import BottomNav from "@/components/BottomNav";
import TokenIcon from "@/components/TokenIcon";
import { VersionedTransaction, Transaction, Connection } from "@solana/web3.js";

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
  volume_24h: number;
  market_cap: number;
  total_supply: number;
  circulating_supply: number;
  // Real pool data
  liquidity_usd: number;
  liquidity_base: number;
  liquidity_quote: number;
  pool_address: string;
  dex_name: string;
  txns_24h: { buys: number; sells: number };
  data_source: string;
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

interface OtcConfig {
  enabled: boolean;
  price_sol: number;
  price_usd: number;
  sol_price_usd: number;
  available_supply: number;
  min_purchase: number;
  max_purchase: number;
  treasury_wallet: string;
  stats: { total_swaps: number; total_glitch_sold: number; total_sol_received: number };
}

type ViewTab = "chart" | "pool" | "activity" | "history";

export default function ExchangePage() {
  const { connected, publicKey, signTransaction } = useWallet();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [market, setMarket] = useState<MarketData | null>(null);
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [viewTab, setViewTab] = useState<ViewTab>("chart");
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [orderHistory, setOrderHistory] = useState<TradeOrder[]>([]);
  const [selectedPair, setSelectedPair] = useState("GLITCH_USDC");
  const [showPairSelector, setShowPairSelector] = useState(false);
  const chartRef = useRef<HTMLCanvasElement>(null);

  // Phantom on-chain balances
  const [phantomBalances, setPhantomBalances] = useState<Record<string, number>>({});

  // OTC swap state
  const [otcConfig, setOtcConfig] = useState<OtcConfig | null>(null);
  const [otcSolAmount, setOtcSolAmount] = useState("");
  const [otcBuying, setOtcBuying] = useState(false);
  const [showJupiter, setShowJupiter] = useState(false);

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
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(`/api/exchange?action=market&pair=${selectedPair}`, { signal: controller.signal });
      clearTimeout(timeoutId);
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

  const fetchHistory = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/exchange?action=history&session_id=${encodeURIComponent(sessionId)}`);
      const data = await res.json();
      setOrderHistory(data.orders || []);
    } catch { /* ignore */ }
  }, [sessionId]);

  // Fetch real Phantom balances when connected (with timeout)
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
        USDC: data.usdc_balance || 0,
        GLITCH: data.glitch_balance || 0,
        BUDJU: data.budju_balance || 0,
      });
    } catch {
      // On timeout/error, set to 0 so UI doesn't hang on loading state
      setPhantomBalances(prev => ({
        SOL: prev.SOL || 0,
        USDC: prev.USDC || 0,
        GLITCH: prev.GLITCH || 0,
        BUDJU: prev.BUDJU || 0,
      }));
    }
  }, [publicKey, sessionId]);

  // Fetch OTC swap config
  const fetchOtcConfig = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const res = await fetch("/api/otc-swap?action=config", { signal: controller.signal });
      clearTimeout(timeoutId);
      const data = await res.json();
      setOtcConfig(data);
    } catch { /* ignore */ }
  }, []);

  // Execute OTC swap: SOL → $GLITCH atomic transaction
  const executeOtcSwap = async () => {
    if (!publicKey || !signTransaction || !otcConfig || otcBuying) return;
    const solAmt = parseFloat(otcSolAmount);
    if (!solAmt || solAmt <= 0) {
      showToast("error", "Enter a SOL amount");
      return;
    }
    const glitchAmount = Math.floor(solAmt / otcConfig.price_sol);
    if (glitchAmount < otcConfig.min_purchase) {
      showToast("error", `Minimum purchase is ${otcConfig.min_purchase.toLocaleString()} $GLITCH`);
      return;
    }
    if (glitchAmount > otcConfig.max_purchase) {
      showToast("error", `Maximum purchase is ${otcConfig.max_purchase.toLocaleString()} $GLITCH per swap`);
      return;
    }
    const solBalance = phantomBalances.SOL || 0;
    if (solAmt > solBalance - 0.005) {
      showToast("error", "Not enough SOL (keep ~0.005 for tx fees)");
      return;
    }

    setOtcBuying(true);
    try {
      // Step 1: Request atomic swap transaction from server
      const res = await fetch("/api/otc-swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_swap",
          buyer_wallet: publicKey.toBase58(),
          glitch_amount: glitchAmount,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast("error", data.error || "Swap creation failed");
        setOtcBuying(false);
        return;
      }

      // Step 2: Deserialize partially-signed transaction and sign with Phantom
      const txBuf = Buffer.from(data.transaction, "base64");
      const transaction = Transaction.from(txBuf);
      const signed = await signTransaction(transaction);

      // Step 3: Submit to Solana
      const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
      const txid = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: true,
        maxRetries: 2,
      });

      // Step 4: Confirm swap in database
      await fetch("/api/otc-swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm_swap",
          swap_id: data.swap_id,
          tx_signature: txid,
        }),
      });

      showToast("success", `Bought ${glitchAmount.toLocaleString()} $GLITCH! TX: ${txid.slice(0, 12)}...`);
      setOtcSolAmount("");
      setTimeout(() => {
        fetchPhantomBalances();
        fetchOtcConfig();
      }, 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Swap failed";
      showToast("error", msg.includes("User rejected") ? "Transaction cancelled" : msg);
    } finally {
      setOtcBuying(false);
    }
  };

  // Computed OTC values
  const otcGlitchOutput = otcConfig && otcSolAmount && parseFloat(otcSolAmount) > 0
    ? Math.floor(parseFloat(otcSolAmount) / otcConfig.price_sol)
    : 0;
  const otcUsdCost = otcConfig && otcSolAmount && parseFloat(otcSolAmount) > 0
    ? parseFloat(otcSolAmount) * otcConfig.sol_price_usd
    : 0;

  useEffect(() => {
    fetchMarket();
    fetchPriceHistory();
    fetchHistory();
    fetchOtcConfig();
    const interval = setInterval(fetchMarket, 10000);
    const otcInterval = setInterval(fetchOtcConfig, 30000);
    return () => { clearInterval(interval); clearInterval(otcInterval); };
  }, [fetchMarket, fetchPriceHistory, fetchHistory, fetchOtcConfig]);

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
  // Only show real on-chain balances from Phantom
  const displayBalances = connected && Object.keys(phantomBalances).length > 0 ? phantomBalances : {} as Record<string, number>;

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
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-red-400">Exchange</span>
            </h1>
            <p className="text-gray-500 text-[10px] tracking-widest">DIRECT PURCHASE &middot; ON-CHAIN</p>
          </div>
          {connected && Object.keys(displayBalances).length > 0 ? (
            <div className="text-right">
              <p className="text-xs text-cyan-400 font-bold">{(displayBalances.GLITCH || 0).toLocaleString()} $G</p>
              <p className="text-[9px] text-gray-500">{(displayBalances.SOL || 0).toFixed(2)} SOL</p>
            </div>
          ) : (
            <div className="w-6" />
          )}
        </div>
      </div>

      {/* ── On-Chain Balance Bar ── */}
      {connected && Object.keys(displayBalances).length > 0 ? (
        <div className="px-4 pt-3 pb-2">
          <div className="grid grid-cols-4 gap-2">
            {["GLITCH", "SOL", "BUDJU", "USDC"].map((token) => {
              const bal = displayBalances[token] ?? 0;
              return (
                <div key={token} className="px-2 py-2 rounded-xl bg-gray-900/80 border border-gray-800 text-center">
                  <p className="text-[9px] text-gray-500 flex items-center justify-center gap-1"><TokenIcon token={token} size={10} /> {token}</p>
                  <p className="text-xs text-white font-bold">{formatBalance(bal, token)}</p>
                </div>
              );
            })}
          </div>
        </div>
      ) : !connected ? (
        <div className="px-4 pt-3 pb-2">
          <div className="rounded-xl bg-gray-900/80 border border-gray-800 px-4 py-3 text-center">
            <p className="text-gray-500 text-xs">Connect Phantom wallet to see your on-chain balances</p>
          </div>
        </div>
      ) : null}

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
                <span className="text-2xl font-bold text-white">{market.price > 0 ? formatPrice(market.price) : "---"}</span>
                <span className="text-gray-500 text-xs">{quoteSymbol}</span>
                {market.change_24h !== 0 && (
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                    market.change_24h >= 0
                      ? "bg-green-500/20 text-green-400"
                      : "bg-red-500/20 text-red-400"
                  }`}>
                    {market.change_24h >= 0 ? "+" : ""}{market.change_24h.toFixed(2)}%
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <p className="text-gray-500 text-[10px]">${market.price_usd > 0 ? market.price_usd.toFixed(6) : "0"} USD</p>
                <span className={`text-[8px] px-1 py-0.5 rounded font-bold ${
                  market.data_source === "dexscreener" ? "bg-green-500/20 text-green-400" :
                  market.data_source === "jupiter" ? "bg-blue-500/20 text-blue-400" :
                  "bg-gray-500/20 text-gray-400"
                }`}>
                  {market.data_source === "dexscreener" ? "LIVE" : market.data_source === "jupiter" ? "JUPITER" : "CACHED"}
                </span>
              </div>
            </div>
            <div className="text-right text-[10px] space-y-0.5">
              {market.volume_24h > 0 && <p className="text-gray-500">24h Vol: <span className="text-white">${market.volume_24h.toLocaleString()}</span></p>}
              {market.market_cap > 0 && <p className="text-gray-500">MCap: <span className="text-white">${market.market_cap.toLocaleString()}</span></p>}
              {market.liquidity_usd > 0 && <p className="text-gray-500">Liq: <span className="text-cyan-400">${market.liquidity_usd.toLocaleString()}</span></p>}
            </div>
          </div>
        </div>
      )}

      {/* Chart / View tabs */}
      <div className="flex gap-1 px-4 pt-3 pb-2">
        {(["chart", "pool", "activity", "history"] as ViewTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setViewTab(t)}
            className={`flex-1 text-[10px] py-1.5 rounded-lg font-bold transition-all capitalize ${
              viewTab === t
                ? "bg-gray-800 text-white"
                : "text-gray-600 hover:text-gray-400"
            }`}
          >
            {t}
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

      {/* ── POOL LIQUIDITY (Real on-chain data) ── */}
      {viewTab === "pool" && market && (
        <div className="px-4 mb-4 space-y-3">
          <div className="rounded-xl bg-gray-900/50 border border-gray-800 overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-800">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500 font-bold">POOL LIQUIDITY</span>
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
                    <p className="text-[9px] text-gray-500">{baseSymbol} in Pool</p>
                    <p className="text-sm text-white font-bold">{market.liquidity_base.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-black/30 border border-gray-800 text-center">
                    <p className="text-[9px] text-gray-500">{quoteSymbol} in Pool</p>
                    <p className="text-sm text-white font-bold">{market.liquidity_quote.toLocaleString(undefined, { maximumFractionDigits: 4 })}</p>
                  </div>
                </div>
                {market.pool_address && (
                  <div className="p-2 rounded-lg bg-black/30 border border-gray-800">
                    <p className="text-[9px] text-gray-500 mb-1">Pool Address ({market.dex_name || "DEX"})</p>
                    <p className="text-[10px] text-purple-400 font-mono break-all">{market.pool_address}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 text-center">
                <p className="text-gray-500 text-xs">No liquidity pool found for this pair on DexScreener yet.</p>
                <p className="text-gray-600 text-[10px] mt-1">Pools may take a few minutes to appear after creation.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── REAL ACTIVITY ── */}
      {viewTab === "activity" && market && (
        <div className="px-4 mb-4 space-y-3">
          <div className="rounded-xl bg-gray-900/50 border border-gray-800 overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-800">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500 font-bold">24H TRADING ACTIVITY</span>
                <span className="text-[9px] text-gray-600">{market.data_source === "dexscreener" ? "DexScreener" : market.data_source}</span>
              </div>
            </div>
            {(market.txns_24h.buys > 0 || market.txns_24h.sells > 0) ? (
              <div className="p-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-green-500/5 border border-green-500/20 text-center">
                    <p className="text-2xl font-bold text-green-400">{market.txns_24h.buys}</p>
                    <p className="text-[10px] text-gray-500 font-bold">BUYS (24h)</p>
                  </div>
                  <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/20 text-center">
                    <p className="text-2xl font-bold text-red-400">{market.txns_24h.sells}</p>
                    <p className="text-[10px] text-gray-500 font-bold">SELLS (24h)</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-2 rounded-lg bg-black/30 border border-gray-800 text-center">
                    <p className="text-[9px] text-gray-500">Volume (24h)</p>
                    <p className="text-sm text-white font-bold">${market.volume_24h.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-black/30 border border-gray-800 text-center">
                    <p className="text-[9px] text-gray-500">Market Cap</p>
                    <p className="text-sm text-white font-bold">${market.market_cap.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                  </div>
                </div>
                {/* Buy/Sell ratio bar */}
                {(market.txns_24h.buys + market.txns_24h.sells) > 0 && (
                  <div>
                    <div className="flex justify-between text-[9px] text-gray-500 mb-1">
                      <span>Buy pressure</span>
                      <span>Sell pressure</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-800 overflow-hidden flex">
                      <div
                        className="h-full bg-green-500 rounded-l-full"
                        style={{ width: `${(market.txns_24h.buys / (market.txns_24h.buys + market.txns_24h.sells)) * 100}%` }}
                      />
                      <div
                        className="h-full bg-red-500 rounded-r-full"
                        style={{ width: `${(market.txns_24h.sells / (market.txns_24h.buys + market.txns_24h.sells)) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 text-center">
                <p className="text-gray-500 text-xs">No trading activity found yet.</p>
                <p className="text-gray-600 text-[10px] mt-1">Activity appears after trades happen on-chain.</p>
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

      {/* ── BUY $GLITCH DIRECT (OTC Swap) ── */}
      {connected && publicKey && otcConfig ? (
        otcConfig.enabled ? (
          <div className="px-4 mb-4">
            <div className="rounded-2xl bg-gradient-to-br from-green-950/40 via-emerald-950/30 to-gray-900 border border-green-500/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <h3 className="text-white font-bold text-sm">Buy $GLITCH Direct</h3>
                </div>
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 font-bold">NO BOTS</span>
              </div>

              {/* Price info */}
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2 rounded-lg bg-black/30 border border-gray-800 text-center">
                  <p className="text-[9px] text-gray-500">Price</p>
                  <p className="text-xs text-green-400 font-bold">${otcConfig.price_usd.toFixed(4)}</p>
                  <p className="text-[8px] text-gray-600">{otcConfig.price_sol.toFixed(8)} SOL</p>
                </div>
                <div className="p-2 rounded-lg bg-black/30 border border-gray-800 text-center">
                  <p className="text-[9px] text-gray-500">Available</p>
                  <p className="text-xs text-white font-bold">{otcConfig.available_supply >= 1_000_000 ? `${(otcConfig.available_supply / 1_000_000).toFixed(1)}M` : otcConfig.available_supply.toLocaleString()}</p>
                  <p className="text-[8px] text-gray-600">$GLITCH</p>
                </div>
                <div className="p-2 rounded-lg bg-black/30 border border-gray-800 text-center">
                  <p className="text-[9px] text-gray-500">Sold</p>
                  <p className="text-xs text-white font-bold">{otcConfig.stats.total_swaps}</p>
                  <p className="text-[8px] text-gray-600">swaps</p>
                </div>
              </div>

              {/* You Pay (SOL) */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 text-[10px] font-bold">YOU PAY (SOL)</span>
                  <span className="text-[10px] text-gray-500">
                    Bal: {(phantomBalances.SOL || 0).toFixed(4)} SOL
                  </span>
                </div>
                <div className="flex gap-2">
                  <div className="w-16 shrink-0 px-2 py-2.5 bg-black/50 border border-gray-700 rounded-xl flex items-center gap-1.5">
                    <TokenIcon token="SOL" size={16} />
                    <span className="text-white text-sm font-bold">SOL</span>
                  </div>
                  <input
                    type="number"
                    value={otcSolAmount}
                    onChange={(e) => setOtcSolAmount(e.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    className="flex-1 min-w-0 px-3 py-2.5 bg-black/50 border border-gray-700 rounded-xl text-white text-lg font-mono placeholder:text-gray-700 focus:border-green-500 focus:outline-none text-right"
                  />
                </div>
                <div className="flex gap-1.5 justify-end">
                  {[25, 50, 100].map(pct => (
                    <button
                      key={pct}
                      onClick={() => {
                        const bal = phantomBalances.SOL || 0;
                        if (bal <= 0.01) return;
                        const raw = Math.max(0, bal - 0.01) * pct / 100;
                        setOtcSolAmount(raw.toFixed(4));
                      }}
                      className="text-[10px] px-2 py-0.5 bg-gray-800 text-green-400 rounded-lg hover:bg-gray-700 hover:text-white transition-colors font-bold"
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>

              {/* Arrow */}
              <div className="flex justify-center">
                <div className="w-8 h-8 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center">
                  <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                </div>
              </div>

              {/* You Receive ($GLITCH) */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 text-[10px] font-bold">YOU RECEIVE ($GLITCH)</span>
                  <span className="text-gray-600 text-[10px]">Bal: {(phantomBalances.GLITCH || 0).toLocaleString()}</span>
                </div>
                <div className="flex gap-2">
                  <div className="w-16 shrink-0 px-2 py-2.5 bg-black/50 border border-gray-700 rounded-xl flex items-center gap-1.5">
                    <TokenIcon token="GLITCH" size={16} />
                    <span className="text-white text-sm font-bold">$G</span>
                  </div>
                  <div className="flex-1 min-w-0 px-3 py-2.5 bg-black/30 border border-gray-800 rounded-xl text-right">
                    <p className={`text-lg font-mono ${otcGlitchOutput > 0 ? "text-green-400" : "text-gray-700"}`}>
                      {otcGlitchOutput > 0 ? otcGlitchOutput.toLocaleString() : "0"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Order summary */}
              {otcGlitchOutput > 0 && otcConfig && (
                <div className="p-2 rounded-xl bg-black/30 border border-gray-800 space-y-1 text-[10px]">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Rate</span>
                    <span className="text-white">1 SOL = {Math.floor(1 / otcConfig.price_sol).toLocaleString()} $GLITCH</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">USD Value</span>
                    <span className="text-white">${otcUsdCost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Slippage</span>
                    <span className="text-green-400">0% (fixed price)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Type</span>
                    <span className="text-green-400">Atomic OTC swap</span>
                  </div>
                </div>
              )}

              {/* Buy button */}
              <button
                onClick={executeOtcSwap}
                disabled={otcBuying || otcGlitchOutput < 100}
                className="w-full py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold rounded-xl text-sm transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40"
              >
                {otcBuying ? "Confirm in Phantom..." : otcGlitchOutput > 0 ? `Buy ${otcGlitchOutput.toLocaleString()} $GLITCH` : "Enter SOL amount"}
              </button>

              <div className="text-center space-y-1">
                <p className="text-gray-600 text-[9px]">
                  Direct atomic swap. SOL and $GLITCH transfer in one transaction. No bots, no sniping.
                </p>
                <p className="text-gray-700 text-[8px]">
                  Treasury: {otcConfig.treasury_wallet.slice(0, 8)}...{otcConfig.treasury_wallet.slice(-4)}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="px-4 mb-4">
            <div className="rounded-2xl bg-gradient-to-br from-gray-950/40 via-gray-900/30 to-gray-900 border border-gray-700/30 p-4 text-center space-y-2">
              <h3 className="text-gray-400 font-bold text-sm">Direct Purchase Coming Soon</h3>
              <p className="text-gray-600 text-xs">OTC swaps are being set up. Check back shortly.</p>
            </div>
          </div>
        )
      ) : !connected ? (
        <div className="px-4 mb-4">
          <div className="rounded-2xl bg-gradient-to-br from-green-950/40 via-emerald-950/30 to-gray-900 border border-green-500/30 p-6 text-center space-y-4">
            <div className="flex items-center justify-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-400" />
              <h3 className="text-white font-bold text-sm">Wallet Not Connected</h3>
            </div>
            <p className="text-gray-400 text-sm">Connect your Phantom wallet to buy $GLITCH directly with SOL</p>
            <a href="/wallet" className="inline-block px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold rounded-xl text-sm hover:scale-105 transition-all">
              Connect Wallet
            </a>
            <p className="text-gray-600 text-[9px]">
              All purchases are real on-chain atomic swaps on Solana. No bots, no sniping.
            </p>
          </div>
        </div>
      ) : null}

      {/* ── JUPITER DEX SWAP (Secondary) ── */}
      {connected && publicKey && (
        <div className="px-4 mb-4">
          <button
            onClick={() => setShowJupiter(!showJupiter)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-gray-900/50 border border-gray-800 text-gray-500 hover:text-gray-300 transition-colors"
          >
            <span className="text-[10px] font-bold">JUPITER DEX SWAP</span>
            <svg className={`w-3 h-3 transition-transform ${showJupiter ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showJupiter && (
            <div className="mt-2 rounded-2xl bg-gradient-to-br from-purple-950/40 via-indigo-950/30 to-gray-900 border border-purple-500/30 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-purple-400" />
                <h3 className="text-white font-bold text-sm">Jupiter DEX Swap</h3>
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
                    className="w-24 shrink-0 px-2 py-2.5 bg-black/50 border border-gray-700 rounded-xl text-white text-sm font-bold focus:border-purple-500 focus:outline-none appearance-none cursor-pointer"
                  >
                    {Object.keys(MINT_ADDRESSES).map(t => <option key={t} value={t}>{t}</option>)}
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
                        const decimals = TOKEN_DECIMALS[swapInputToken] || 9;
                        setSwapAmount(decimals <= 6 ? raw.toFixed(2) : raw.toFixed(4));
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
                    className="w-24 shrink-0 px-2 py-2.5 bg-black/50 border border-gray-700 rounded-xl text-white text-sm font-bold focus:border-purple-500 focus:outline-none appearance-none cursor-pointer"
                  >
                    {Object.keys(MINT_ADDRESSES).map(t => <option key={t} value={t}>{t}</option>)}
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
                Jupiter DEX. Requires existing liquidity pools.
              </p>
            </div>
          )}
        </div>
      )}

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
