"use client";

import { useState, useEffect, useCallback } from "react";
import { useAdmin } from "../AdminContext";
import GlitchTradingView from "./GlitchTradingView";
import BudjuTradingView from "./BudjuTradingView";
import WalletDashboard from "./WalletDashboard";
import MemoSystem from "./MemoSystem";

const WALLET_SESSION_KEY = "aiglitch-wallet-session";

interface WalletBalances {
  sol: number;
  budju: number;
  glitch: number;
  usdc: number;
  address: string;
}

/** Truncate address: 7SGf...Wi56 */
function truncAddr(addr: string) {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

function formatBalance(n: number, decimals: number = 4) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(decimals);
}

/** Web3-style collapsible wallet card */
function WalletCard({ label, balances, loading, gradient, onRefresh }: {
  label: string;
  balances: WalletBalances | null;
  loading: boolean;
  gradient: string;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyAddr = () => {
    if (!balances?.address) return;
    navigator.clipboard.writeText(balances.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={`bg-gray-900/80 border rounded-xl overflow-hidden ${gradient}`}>
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-2 h-2 rounded-full ${balances ? "bg-green-400" : "bg-gray-600"}`} />
          <span className="text-[11px] font-black text-white tracking-wide">{label}</span>
          {balances && (
            <span className="text-[10px] text-gray-500 font-mono">{truncAddr(balances.address)}</span>
          )}
          {balances && (
            <button onClick={(e) => { e.stopPropagation(); copyAddr(); }}
              className="text-gray-500 hover:text-white transition-colors" title="Copy address">
              {copied ? (
                <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              ) : (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              )}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {balances && (
            <span className="text-[10px] font-bold text-cyan-400">{formatBalance(balances.sol)} SOL</span>
          )}
          <button onClick={(e) => { e.stopPropagation(); onRefresh(); }}
            className="text-gray-500 hover:text-white text-xs transition-colors" title="Refresh">
            {loading ? (
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
            ) : "↻"}
          </button>
          <svg className={`w-3 h-3 text-gray-500 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded balances */}
      {expanded && balances && (
        <div className="px-3 pb-3 pt-0">
          <div className="grid grid-cols-4 gap-1.5">
            <div className="bg-black/30 rounded-lg px-2 py-1.5 text-center">
              <p className="text-xs font-black text-cyan-400">{formatBalance(balances.sol)}</p>
              <p className="text-[8px] text-gray-500 font-bold">SOL</p>
            </div>
            <div className="bg-black/30 rounded-lg px-2 py-1.5 text-center">
              <p className="text-xs font-black text-fuchsia-400">{formatBalance(balances.budju, 0)}</p>
              <p className="text-[8px] text-gray-500 font-bold">BUDJU</p>
            </div>
            <div className="bg-black/30 rounded-lg px-2 py-1.5 text-center">
              <p className="text-xs font-black text-purple-400">{formatBalance(balances.glitch, 0)}</p>
              <p className="text-[8px] text-gray-500 font-bold">§GLITCH</p>
            </div>
            <div className="bg-black/30 rounded-lg px-2 py-1.5 text-center">
              <p className="text-xs font-black text-green-400">{formatBalance(balances.usdc, 2)}</p>
              <p className="text-[8px] text-gray-500 font-bold">USDC</p>
            </div>
          </div>
          {/* Solscan link */}
          <div className="mt-2 flex items-center gap-2">
            <p className="text-[9px] text-gray-600 font-mono flex-1 truncate">{balances.address}</p>
            <a href={`https://solscan.io/account/${balances.address}`} target="_blank" rel="noopener noreferrer"
              className="text-[9px] text-cyan-400 hover:text-cyan-300 font-bold">Solscan ↗</a>
          </div>
        </div>
      )}

      {!balances && (
        <div className="px-3 pb-2">
          <p className="text-[10px] text-gray-600">{loading ? "Loading..." : "No data"}</p>
        </div>
      )}
    </div>
  );
}

export default function TradingPage() {
  const { authenticated } = useAdmin();
  const [activeView, setActiveView] = useState<"home" | "glitch" | "budju">("home");

  // Wallet balances
  const [adminBalances, setAdminBalances] = useState<WalletBalances | null>(null);
  const [treasuryBalances, setTreasuryBalances] = useState<WalletBalances | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);

  const fetchBalances = useCallback(async () => {
    setWalletLoading(true);
    try {
      const res = await fetch("/api/admin/budju-trading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "wallet_balances" }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.admin) setAdminBalances(data.admin);
        if (data.treasury) setTreasuryBalances(data.treasury);
      }
    } catch { /* ignore */ }
    setWalletLoading(false);
  }, []);

  useEffect(() => { if (authenticated) fetchBalances(); }, [authenticated, fetchBalances]);

  // Wallet auth state
  const [walletAuthed, setWalletAuthed] = useState(false);
  const [walletChecking, setWalletChecking] = useState(true);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [pollStatus, setPollStatus] = useState<string>("waiting");

  useEffect(() => {
    const token = localStorage.getItem(WALLET_SESSION_KEY);
    if (token) {
      fetch(`/api/admin/wallet-auth?session=${token}`)
        .then(res => res.json())
        .then(data => {
          if (data.valid) setWalletAuthed(true);
          else localStorage.removeItem(WALLET_SESSION_KEY);
          setWalletChecking(false);
        })
        .catch(() => setWalletChecking(false));
    } else {
      setWalletChecking(false);
    }
  }, []);

  const generateChallenge = useCallback(async () => {
    setPollStatus("generating");
    try {
      const res = await fetch("/api/admin/wallet-auth");
      const data = await res.json();
      setChallengeId(data.challengeId);
      const signUrl = `${window.location.origin}/auth/sign?c=${data.challengeId}`;
      setQrUrl(`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(signUrl)}&bgcolor=0a0a0a&color=a855f7`);
      setPollStatus("waiting");
    } catch { setPollStatus("error"); }
  }, []);

  useEffect(() => {
    if (!walletChecking && !walletAuthed && authenticated) generateChallenge();
  }, [walletChecking, walletAuthed, authenticated, generateChallenge]);

  useEffect(() => {
    if (!challengeId || walletAuthed || pollStatus !== "waiting") return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/wallet-auth?c=${challengeId}`);
        const data = await res.json();
        if (data.status === "approved" && data.sessionToken) {
          localStorage.setItem(WALLET_SESSION_KEY, data.sessionToken);
          setWalletAuthed(true);
          setPollStatus("approved");
          clearInterval(interval);
        } else if (data.status === "expired") { setPollStatus("expired"); clearInterval(interval); }
        else if (data.status === "rejected") { setPollStatus("rejected"); clearInterval(interval); }
      } catch { /* retry */ }
    }, 2000);
    const timeout = setTimeout(() => { clearInterval(interval); setPollStatus("expired"); }, 300000);
    return () => { clearInterval(interval); clearTimeout(timeout); };
  }, [challengeId, walletAuthed, pollStatus]);

  if (!authenticated) return null;

  if (walletChecking) {
    return (
      <div className="text-center py-20 text-gray-500">
        <div className="text-4xl animate-pulse mb-4">🔐</div>
        <p>Checking wallet authorization...</p>
      </div>
    );
  }

  if (!walletAuthed) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="max-w-sm w-full space-y-6 text-center">
          <div>
            <div className="text-5xl mb-3">🔐</div>
            <h2 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400">
              Wallet Authorization Required
            </h2>
            <p className="text-gray-500 text-sm mt-2">
              Scan this QR code with your iPhone&apos;s Phantom wallet to unlock trading controls.
            </p>
          </div>
          <div className="bg-gray-900 rounded-2xl p-6 border border-purple-500/30">
            {qrUrl ? (
              <div className="space-y-4">
                <img src={qrUrl} alt="Scan with Phantom" className="w-56 h-56 mx-auto rounded-xl" />
                <div className="flex items-center justify-center gap-2">
                  <span className="inline-block w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
                  <p className="text-purple-400 text-xs font-bold">
                    {pollStatus === "waiting" ? "Waiting for signature..." :
                     pollStatus === "expired" ? "Challenge expired" :
                     pollStatus === "rejected" ? "Wrong wallet — try again" :
                     pollStatus === "error" ? "Error generating challenge" : "Generating..."}
                  </p>
                </div>
              </div>
            ) : (
              <div className="py-12 text-gray-500 animate-pulse">Generating QR code...</div>
            )}
          </div>
          <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-800 text-left space-y-2">
            <p className="text-[11px] text-gray-400"><span className="text-purple-400 font-bold">1.</span> Open Phantom on your iPhone</p>
            <p className="text-[11px] text-gray-400"><span className="text-purple-400 font-bold">2.</span> Tap the scan icon (top right)</p>
            <p className="text-[11px] text-gray-400"><span className="text-purple-400 font-bold">3.</span> Scan this QR code</p>
            <p className="text-[11px] text-gray-400"><span className="text-purple-400 font-bold">4.</span> Tap &quot;Connect Phantom &amp; Sign&quot;</p>
            <p className="text-[11px] text-gray-400"><span className="text-purple-400 font-bold">5.</span> Approve — iPad unlocks automatically</p>
          </div>
          {(pollStatus === "expired" || pollStatus === "rejected" || pollStatus === "error") && (
            <button onClick={() => { setChallengeId(null); setQrUrl(null); generateChallenge(); }}
              className="px-6 py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-500 transition-all">
              Generate New QR Code
            </button>
          )}
          <p className="text-gray-600 text-[9px]">Only the admin Phantom wallet can authorize. Session lasts 24 hours.</p>
        </div>
      </div>
    );
  }

  // ── Authenticated Trading Dashboard ──
  return (
    <div className="space-y-3">
      {/* Wallet Auth Status Bar */}
      <div className="flex items-center justify-between bg-green-950/20 border border-green-800/30 rounded-lg px-3 py-1.5">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-green-400 rounded-full" />
          <span className="text-green-400 text-[10px] font-bold">WALLET AUTHORIZED</span>
        </div>
        <button onClick={() => { localStorage.removeItem(WALLET_SESSION_KEY); setWalletAuthed(false); setChallengeId(null); setQrUrl(null); setPollStatus("waiting"); }}
          className="text-gray-500 text-[10px] hover:text-red-400">Disconnect</button>
      </div>

      {/* Top Row: Admin Wallet | Treasury Wallet | GLITCH Trading | BUDJU Trading */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <WalletCard label="ADMIN" balances={adminBalances} loading={walletLoading} gradient="border-purple-500/30" onRefresh={fetchBalances} />
        <WalletCard label="TREASURY" balances={treasuryBalances} loading={walletLoading} gradient="border-amber-500/30" onRefresh={fetchBalances} />
        <button
          onClick={() => setActiveView(activeView === "glitch" ? "home" : "glitch")}
          className={`bg-gray-900/80 border rounded-xl px-3 py-2.5 text-left transition-all hover:bg-white/5 ${
            activeView === "glitch" ? "border-purple-500/60 bg-purple-500/10" : "border-gray-700/50"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-base">📈</span>
            <div>
              <p className="text-[11px] font-black text-purple-400">§GLITCH Trading</p>
              <p className="text-[9px] text-gray-500">Simulated in-app token</p>
            </div>
          </div>
        </button>
        <button
          onClick={() => setActiveView(activeView === "budju" ? "home" : "budju")}
          className={`bg-gray-900/80 border rounded-xl px-3 py-2.5 text-left transition-all hover:bg-white/5 ${
            activeView === "budju" ? "border-fuchsia-500/60 bg-fuchsia-500/10" : "border-gray-700/50"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-base">🐻</span>
            <div>
              <p className="text-[11px] font-black text-fuchsia-400">$BUDJU Trading</p>
              <p className="text-[9px] text-gray-500">Real on-chain Solana</p>
            </div>
          </div>
        </button>
      </div>

      {/* Home View: Dashboard + Wallets + Memos */}
      {activeView === "home" && (
        <div className="space-y-4">
          {/* Quick actions */}
          <div className="flex gap-2 flex-wrap">
            <span className="text-[10px] text-gray-500 font-bold self-center">QUICK:</span>
            <button onClick={() => setActiveView("glitch")} className="px-3 py-1.5 bg-purple-500/20 text-purple-400 rounded-lg text-[10px] font-bold hover:bg-purple-500/30">Open GLITCH Trading</button>
            <button onClick={() => setActiveView("budju")} className="px-3 py-1.5 bg-fuchsia-500/20 text-fuchsia-400 rounded-lg text-[10px] font-bold hover:bg-fuchsia-500/30">Open BUDJU Trading</button>
          </div>

          {/* Memos */}
          <MemoSystem />
        </div>
      )}

      {/* GLITCH Trading View */}
      {activeView === "glitch" && <GlitchTradingView />}

      {/* BUDJU Trading View */}
      {activeView === "budju" && <BudjuTradingView />}
    </div>
  );
}
