"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import BottomNav from "@/components/BottomNav";
import TokenIcon from "@/components/TokenIcon";
import { Transaction } from "@solana/web3.js";

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
  bonding_curve: {
    tier: number;
    tier_size: number;
    remaining_in_tier: number;
    next_price_usd: number;
    next_price_sol: number;
    base_price_usd: number;
    increment_usd: number;
  };
}

interface SwapHistoryItem {
  id: string;
  glitch_amount: number;
  sol_cost: number;
  price_per_glitch: number;
  tx_signature: string;
  status: string;
  created_at: string;
}

export default function ExchangePage() {
  const { connected, publicKey, signTransaction } = useWallet();

  // OTC swap state
  const [otcConfig, setOtcConfig] = useState<OtcConfig | null>(null);
  const [solAmount, setSolAmount] = useState("");
  const [buying, setBuying] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [swapHistory, setSwapHistory] = useState<SwapHistoryItem[]>([]);

  // Phantom on-chain balances (SOL + GLITCH only)
  const [solBalance, setSolBalance] = useState(0);
  const [glitchBalance, setGlitchBalance] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setSessionId(localStorage.getItem("aiglitch-session"));
    }
  }, []);

  // Fetch OTC config
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

  // Fetch wallet balances
  const fetchBalances = useCallback(async () => {
    if (!publicKey || !sessionId) return;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(
        `/api/solana?action=balance&wallet_address=${publicKey.toBase58()}&session_id=${encodeURIComponent(sessionId)}`,
        { signal: controller.signal }
      );
      clearTimeout(timeoutId);
      const data = await res.json();
      setSolBalance(data.sol_balance || 0);
      setGlitchBalance(data.glitch_balance || 0);
    } catch {
      // Keep existing values on error
    }
  }, [publicKey, sessionId]);

  // Fetch swap history
  const fetchHistory = useCallback(async () => {
    if (!publicKey) return;
    try {
      const res = await fetch(`/api/otc-swap?action=history&wallet=${publicKey.toBase58()}`);
      const data = await res.json();
      setSwapHistory(data.swaps || []);
    } catch { /* ignore */ }
  }, [publicKey]);

  useEffect(() => {
    fetchOtcConfig();
    const interval = setInterval(fetchOtcConfig, 30000);
    return () => clearInterval(interval);
  }, [fetchOtcConfig]);

  useEffect(() => {
    if (connected && publicKey) {
      fetchBalances();
      fetchHistory();
    }
  }, [connected, publicKey, fetchBalances, fetchHistory]);

  // Computed values
  const glitchOutput = otcConfig && solAmount && parseFloat(solAmount) > 0
    ? Math.floor(parseFloat(solAmount) / otcConfig.price_sol)
    : 0;
  const usdCost = otcConfig && solAmount && parseFloat(solAmount) > 0
    ? parseFloat(solAmount) * otcConfig.sol_price_usd
    : 0;

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 5000);
  };

  // Execute OTC swap
  const executeSwap = async () => {
    if (!publicKey || !signTransaction || !otcConfig || buying) return;
    const solAmt = parseFloat(solAmount);
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
      showToast("error", `Maximum ${otcConfig.max_purchase.toLocaleString()} $GLITCH per swap`);
      return;
    }
    if (solAmt > solBalance - 0.005) {
      showToast("error", "Not enough SOL (keep ~0.005 for fees)");
      return;
    }

    setBuying(true);
    try {
      // Step 1: Create atomic swap transaction on server
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
        setBuying(false);
        return;
      }

      // Step 2: Sign with Phantom
      const txBuf = Buffer.from(data.transaction, "base64");
      const transaction = Transaction.from(txBuf);
      const signed = await signTransaction(transaction);

      // Step 3: Submit signed tx via our server (avoids client-side RPC 403 errors)
      const submitRes = await fetch("/api/otc-swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit_swap",
          swap_id: data.swap_id,
          signed_transaction: Buffer.from(signed.serialize()).toString("base64"),
        }),
      });
      const submitData = await submitRes.json();
      if (!submitRes.ok || !submitData.success) {
        showToast("error", submitData.error || "Transaction submission failed");
        setBuying(false);
        return;
      }

      showToast("success", `Bought ${glitchAmount.toLocaleString()} $GLITCH! TX: ${submitData.tx_signature.slice(0, 12)}...`);
      setSolAmount("");
      setTimeout(() => {
        fetchBalances();
        fetchOtcConfig();
        fetchHistory();
      }, 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Swap failed";
      showToast("error", msg.includes("User rejected") ? "Transaction cancelled" : msg);
    } finally {
      setBuying(false);
    }
  };

  const timeAgo = (d: string) => {
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
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
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 via-emerald-400 to-cyan-400">Buy $GLITCH</span>
            </h1>
            <p className="text-gray-500 text-[10px] tracking-widest">OTC SWAP &middot; SOL &rarr; $GLITCH</p>
          </div>
          {connected ? (
            <div className="text-right">
              <p className="text-xs text-green-400 font-bold">{glitchBalance.toLocaleString()} $G</p>
              <p className="text-[9px] text-gray-500">{solBalance.toFixed(4)} SOL</p>
            </div>
          ) : (
            <div className="w-6" />
          )}
        </div>
      </div>

      {/* ── Wallet Balances ── */}
      {connected ? (
        <div className="px-4 pt-3 pb-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="px-3 py-3 rounded-xl bg-gray-900/80 border border-gray-800">
              <div className="flex items-center gap-2 mb-1">
                <TokenIcon token="SOL" size={14} />
                <span className="text-[10px] text-gray-500 font-bold">SOL</span>
              </div>
              <p className="text-lg text-white font-bold">{solBalance.toFixed(4)}</p>
              <p className="text-[9px] text-gray-600">
                ${otcConfig ? (solBalance * otcConfig.sol_price_usd).toFixed(2) : "0.00"} USD
              </p>
            </div>
            <div className="px-3 py-3 rounded-xl bg-gray-900/80 border border-green-500/20">
              <div className="flex items-center gap-2 mb-1">
                <TokenIcon token="GLITCH" size={14} />
                <span className="text-[10px] text-green-400 font-bold">$GLITCH</span>
              </div>
              <p className="text-lg text-green-400 font-bold">{glitchBalance.toLocaleString()}</p>
              <p className="text-[9px] text-gray-600">
                ${otcConfig ? (glitchBalance * otcConfig.price_usd).toFixed(2) : "0.00"} USD
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── OTC SWAP INTERFACE ── */}
      {connected && publicKey ? (
        otcConfig ? (
          <div className="px-4 pt-2 pb-4">
            <div className="rounded-2xl bg-gradient-to-br from-green-950/40 via-emerald-950/30 to-gray-900 border border-green-500/30 p-4 space-y-4">

              {/* Price + Bonding Curve Info */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-white font-bold text-sm">Swap SOL for $GLITCH</span>
                </div>
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 font-bold">NO BOTS</span>
              </div>

              {/* Current Price */}
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2 rounded-lg bg-black/40 border border-gray-800 text-center">
                  <p className="text-[9px] text-gray-500">Price</p>
                  <p className="text-sm text-green-400 font-bold">${otcConfig.price_usd.toFixed(2)}</p>
                  <p className="text-[8px] text-gray-600">{otcConfig.price_sol.toFixed(8)} SOL</p>
                </div>
                <div className="p-2 rounded-lg bg-black/40 border border-gray-800 text-center">
                  <p className="text-[9px] text-gray-500">Next Price</p>
                  <p className="text-sm text-yellow-400 font-bold">${otcConfig.bonding_curve.next_price_usd.toFixed(2)}</p>
                  <p className="text-[8px] text-gray-600">in {otcConfig.bonding_curve.remaining_in_tier.toLocaleString()}</p>
                </div>
                <div className="p-2 rounded-lg bg-black/40 border border-gray-800 text-center">
                  <p className="text-[9px] text-gray-500">Sold</p>
                  <p className="text-sm text-white font-bold">
                    {otcConfig.stats.total_glitch_sold >= 1000
                      ? `${(otcConfig.stats.total_glitch_sold / 1000).toFixed(1)}K`
                      : otcConfig.stats.total_glitch_sold.toLocaleString()}
                  </p>
                  <p className="text-[8px] text-gray-600">$GLITCH</p>
                </div>
              </div>

              {/* Bonding curve progress bar */}
              <div className="p-2 rounded-lg bg-black/30 border border-gray-800 space-y-1.5">
                <div className="flex justify-between items-center text-[9px]">
                  <span className="text-gray-500 font-bold">TIER {otcConfig.bonding_curve.tier + 1}</span>
                  <span className="text-gray-500">
                    {otcConfig.bonding_curve.remaining_in_tier.toLocaleString()} until ${otcConfig.bonding_curve.next_price_usd.toFixed(2)}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-green-500 to-yellow-500 rounded-full transition-all"
                    style={{
                      width: `${((otcConfig.bonding_curve.tier_size - otcConfig.bonding_curve.remaining_in_tier) / otcConfig.bonding_curve.tier_size) * 100}%`,
                    }}
                  />
                </div>
                <p className="text-[8px] text-gray-600 text-center">
                  +${otcConfig.bonding_curve.increment_usd.toFixed(2)} every {otcConfig.bonding_curve.tier_size.toLocaleString()} $GLITCH sold
                </p>
              </div>

              {/* YOU PAY (SOL) */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-[10px] font-bold">YOU PAY</span>
                  <span className="text-[10px] text-gray-500">
                    Balance: {solBalance.toFixed(4)} SOL
                  </span>
                </div>
                <div className="flex gap-2">
                  <div className="w-16 shrink-0 px-2 py-2.5 bg-black/50 border border-gray-700 rounded-xl flex items-center gap-1.5">
                    <TokenIcon token="SOL" size={16} />
                    <span className="text-white text-sm font-bold">SOL</span>
                  </div>
                  <input
                    type="number"
                    value={solAmount}
                    onChange={(e) => setSolAmount(e.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    className="flex-1 min-w-0 px-3 py-2.5 bg-black/50 border border-gray-700 rounded-xl text-white text-lg font-mono placeholder:text-gray-700 focus:border-green-500 focus:outline-none text-right"
                  />
                </div>
                <div className="flex gap-1.5 justify-end">
                  {[25, 50, 100].map((pct) => (
                    <button
                      key={pct}
                      onClick={() => {
                        if (solBalance <= 0.01) return;
                        const raw = Math.max(0, solBalance - 0.01) * pct / 100;
                        setSolAmount(raw.toFixed(4));
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

              {/* YOU RECEIVE ($GLITCH) */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-[10px] font-bold">YOU RECEIVE</span>
                  <span className="text-gray-600 text-[10px]">Balance: {glitchBalance.toLocaleString()}</span>
                </div>
                <div className="flex gap-2">
                  <div className="w-16 shrink-0 px-2 py-2.5 bg-black/50 border border-gray-700 rounded-xl flex items-center gap-1.5">
                    <TokenIcon token="GLITCH" size={16} />
                    <span className="text-white text-sm font-bold">$G</span>
                  </div>
                  <div className="flex-1 min-w-0 px-3 py-2.5 bg-black/30 border border-gray-800 rounded-xl text-right">
                    <p className={`text-lg font-mono ${glitchOutput > 0 ? "text-green-400" : "text-gray-700"}`}>
                      {glitchOutput > 0 ? glitchOutput.toLocaleString() : "0"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Order summary */}
              {glitchOutput > 0 && (
                <div className="p-2 rounded-xl bg-black/30 border border-gray-800 space-y-1 text-[10px]">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Rate</span>
                    <span className="text-white">1 SOL = {Math.floor(1 / otcConfig.price_sol).toLocaleString()} $GLITCH</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">USD Value</span>
                    <span className="text-white">${usdCost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Slippage</span>
                    <span className="text-green-400">0% (fixed price)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Type</span>
                    <span className="text-green-400">Atomic on-chain swap</span>
                  </div>
                </div>
              )}

              {/* Buy button */}
              {otcConfig.enabled ? (
                <button
                  onClick={executeSwap}
                  disabled={buying || glitchOutput < 100}
                  className="w-full py-3.5 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold rounded-xl text-sm transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:hover:scale-100"
                >
                  {buying
                    ? "Confirm in Phantom..."
                    : glitchOutput > 0
                      ? `Buy ${glitchOutput.toLocaleString()} $GLITCH`
                      : "Enter SOL amount"
                  }
                </button>
              ) : (
                <div className="w-full py-3 bg-gray-800 text-gray-400 font-bold rounded-xl text-sm text-center">
                  Treasury setup in progress...
                </div>
              )}

              <p className="text-gray-600 text-[9px] text-center">
                Direct atomic swap on Solana. SOL and $GLITCH transfer in one transaction.
              </p>
            </div>
          </div>
        ) : (
          /* Loading config */
          <div className="px-4 pt-4">
            <div className="rounded-2xl bg-gray-900/50 border border-gray-800 p-8 text-center">
              <div className="w-6 h-6 border-2 border-green-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Loading swap...</p>
            </div>
          </div>
        )
      ) : (
        /* Not connected */
        <div className="px-4 pt-6">
          <div className="rounded-2xl bg-gradient-to-br from-green-950/40 via-emerald-950/30 to-gray-900 border border-green-500/30 p-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center mx-auto">
              <TokenIcon token="GLITCH" size={32} />
            </div>
            <h3 className="text-white font-bold text-lg">Buy $GLITCH with SOL</h3>
            <p className="text-gray-400 text-sm">Connect your Phantom wallet to purchase $GLITCH directly. No bots, no sniping, fixed price.</p>

            {/* Show price even when not connected */}
            {otcConfig && (
              <div className="flex justify-center gap-4 text-sm">
                <div>
                  <p className="text-gray-500 text-[10px]">Current Price</p>
                  <p className="text-green-400 font-bold">${otcConfig.price_usd.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-[10px]">Supply Available</p>
                  <p className="text-white font-bold">{(otcConfig.available_supply / 1_000_000).toFixed(1)}M</p>
                </div>
              </div>
            )}

            <a
              href="/wallet"
              className="inline-block px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold rounded-xl text-sm hover:scale-105 transition-all"
            >
              Connect Phantom Wallet
            </a>
            <p className="text-gray-600 text-[9px]">
              Real on-chain atomic swaps on Solana mainnet.
            </p>
          </div>
        </div>
      )}

      {/* ── Swap History ── */}
      {connected && publicKey && (
        <div className="px-4 pt-2 pb-4">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-gray-900/50 border border-gray-800 text-gray-400 hover:text-gray-300 transition-colors"
          >
            <span className="text-[10px] font-bold">PURCHASE HISTORY</span>
            <div className="flex items-center gap-2">
              {swapHistory.length > 0 && (
                <span className="text-[9px] text-green-400">{swapHistory.length} swaps</span>
              )}
              <svg
                className={`w-3 h-3 transition-transform ${showHistory ? "rotate-180" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>

          {showHistory && (
            <div className="mt-2 rounded-xl bg-gray-900/50 border border-gray-800 overflow-hidden">
              {swapHistory.length === 0 ? (
                <p className="text-gray-600 text-xs text-center py-6">No purchases yet. Be the first!</p>
              ) : (
                swapHistory.map((swap) => (
                  <div key={swap.id} className="flex items-center justify-between px-3 py-2.5 border-b border-gray-800/30 last:border-0">
                    <div>
                      <p className="text-green-400 text-xs font-bold">
                        +{Number(swap.glitch_amount).toLocaleString()} $GLITCH
                      </p>
                      <p className="text-gray-600 text-[9px]">{timeAgo(swap.created_at)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-white text-xs">{Number(swap.sol_cost).toFixed(4)} SOL</p>
                      {swap.tx_signature && (
                        <a
                          href={`https://solscan.io/tx/${swap.tx_signature}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[9px] text-purple-400 hover:text-purple-300"
                        >
                          {swap.tx_signature.slice(0, 8)}...
                        </a>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* How it works */}
      <div className="px-4 pb-4">
        <div className="rounded-xl bg-gray-900/30 border border-gray-800/50 p-3 space-y-2">
          <p className="text-[10px] text-gray-500 font-bold">HOW IT WORKS</p>
          <div className="space-y-1.5 text-[10px] text-gray-600">
            <p>1. Enter SOL amount you want to spend</p>
            <p>2. Confirm the swap in your Phantom wallet</p>
            <p>3. SOL and $GLITCH transfer atomically in one transaction</p>
            <p>4. Price increases automatically as more $GLITCH is sold</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 pb-8 text-center">
        <p className="text-gray-700 text-[9px] font-mono">
          $GLITCH is an SPL token on Solana. DYOR. NFA.
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
