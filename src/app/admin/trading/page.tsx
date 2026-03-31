"use client";

import { useState, useEffect, useCallback } from "react";
import { useAdmin } from "../AdminContext";
import GlitchTradingView from "./GlitchTradingView";
import BudjuTradingView from "./BudjuTradingView";

const WALLET_SESSION_KEY = "aiglitch-wallet-session";

interface WalletBalances {
  sol: number;
  budju: number;
  glitch: number;
  usdc: number;
  address: string;
}

function WalletBalancePanel() {
  const [adminBalances, setAdminBalances] = useState<WalletBalances | null>(null);
  const [treasuryBalances, setTreasuryBalances] = useState<WalletBalances | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchBalances = useCallback(async () => {
    setLoading(true);
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
    setLoading(false);
  }, []);

  useEffect(() => { fetchBalances(); }, [fetchBalances]);

  const formatBalance = (n: number, decimals: number = 4) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toFixed(decimals);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {/* Admin Wallet */}
      <div className="bg-gray-900 border border-purple-500/30 rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] text-purple-400 font-bold">ADMIN WALLET (Phantom)</p>
          <button onClick={fetchBalances} disabled={loading} className="text-[9px] text-gray-500 hover:text-gray-300">
            {loading ? "..." : "↻"}
          </button>
        </div>
        {adminBalances ? (
          <>
            <p className="text-[8px] text-gray-600 font-mono truncate mb-2">{adminBalances.address}</p>
            <div className="grid grid-cols-2 gap-1.5">
              <div className="bg-gray-800/50 rounded px-2 py-1">
                <p className="text-xs font-bold text-cyan-400">{formatBalance(adminBalances.sol)} <span className="text-[9px] text-gray-500">SOL</span></p>
              </div>
              <div className="bg-gray-800/50 rounded px-2 py-1">
                <p className="text-xs font-bold text-fuchsia-400">{formatBalance(adminBalances.budju, 0)} <span className="text-[9px] text-gray-500">BUDJU</span></p>
              </div>
              <div className="bg-gray-800/50 rounded px-2 py-1">
                <p className="text-xs font-bold text-purple-400">{formatBalance(adminBalances.glitch, 0)} <span className="text-[9px] text-gray-500">§GLITCH</span></p>
              </div>
              <div className="bg-gray-800/50 rounded px-2 py-1">
                <p className="text-xs font-bold text-green-400">{formatBalance(adminBalances.usdc, 2)} <span className="text-[9px] text-gray-500">USDC</span></p>
              </div>
            </div>
          </>
        ) : (
          <p className="text-[10px] text-gray-600">{loading ? "Loading..." : "No data"}</p>
        )}
      </div>

      {/* Treasury Wallet */}
      <div className="bg-gray-900 border border-amber-500/30 rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] text-amber-400 font-bold">TREASURY WALLET</p>
          <a href={treasuryBalances ? `https://solscan.io/account/${treasuryBalances.address}` : "#"} target="_blank" rel="noopener noreferrer"
            className="text-[9px] text-gray-500 hover:text-gray-300">Solscan ↗</a>
        </div>
        {treasuryBalances ? (
          <>
            <p className="text-[8px] text-gray-600 font-mono truncate mb-2">{treasuryBalances.address}</p>
            <div className="grid grid-cols-2 gap-1.5">
              <div className="bg-gray-800/50 rounded px-2 py-1">
                <p className="text-xs font-bold text-cyan-400">{formatBalance(treasuryBalances.sol)} <span className="text-[9px] text-gray-500">SOL</span></p>
              </div>
              <div className="bg-gray-800/50 rounded px-2 py-1">
                <p className="text-xs font-bold text-fuchsia-400">{formatBalance(treasuryBalances.budju, 0)} <span className="text-[9px] text-gray-500">BUDJU</span></p>
              </div>
              <div className="bg-gray-800/50 rounded px-2 py-1">
                <p className="text-xs font-bold text-purple-400">{formatBalance(treasuryBalances.glitch, 0)} <span className="text-[9px] text-gray-500">§GLITCH</span></p>
              </div>
              <div className="bg-gray-800/50 rounded px-2 py-1">
                <p className="text-xs font-bold text-green-400">{formatBalance(treasuryBalances.usdc, 2)} <span className="text-[9px] text-gray-500">USDC</span></p>
              </div>
            </div>
          </>
        ) : (
          <p className="text-[10px] text-gray-600">{loading ? "Loading..." : "No data"}</p>
        )}
      </div>
    </div>
  );
}

export default function TradingPage() {
  const { authenticated } = useAdmin();
  const [activeToken, setActiveToken] = useState<"glitch" | "budju">("budju");

  // Wallet auth state
  const [walletAuthed, setWalletAuthed] = useState(false);
  const [walletChecking, setWalletChecking] = useState(true);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [pollStatus, setPollStatus] = useState<string>("waiting");

  // Check for existing valid session on mount
  useEffect(() => {
    const token = localStorage.getItem(WALLET_SESSION_KEY);
    if (token) {
      fetch(`/api/admin/wallet-auth?session=${token}`)
        .then(res => res.json())
        .then(data => {
          if (data.valid) {
            setWalletAuthed(true);
          } else {
            localStorage.removeItem(WALLET_SESSION_KEY);
          }
          setWalletChecking(false);
        })
        .catch(() => setWalletChecking(false));
    } else {
      setWalletChecking(false);
    }
  }, []);

  // Generate QR challenge
  const generateChallenge = useCallback(async () => {
    setPollStatus("generating");
    try {
      const res = await fetch("/api/admin/wallet-auth");
      const data = await res.json();
      setChallengeId(data.challengeId);

      // Build the sign URL for QR code
      const signUrl = `${window.location.origin}/auth/sign?c=${data.challengeId}`;
      // Use QR code API (no npm dependency needed)
      const qr = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(signUrl)}&bgcolor=0a0a0a&color=a855f7`;
      setQrUrl(qr);
      setPollStatus("waiting");
    } catch {
      setPollStatus("error");
    }
  }, []);

  // Generate challenge on mount if not authed
  useEffect(() => {
    if (!walletChecking && !walletAuthed && authenticated) {
      generateChallenge();
    }
  }, [walletChecking, walletAuthed, authenticated, generateChallenge]);

  // Poll for challenge approval (iPad waits for iPhone to sign)
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
        } else if (data.status === "expired") {
          setPollStatus("expired");
          clearInterval(interval);
        } else if (data.status === "rejected") {
          setPollStatus("rejected");
          clearInterval(interval);
        }
      } catch { /* retry on next poll */ }
    }, 2000); // Poll every 2 seconds

    // Stop polling after 5 minutes
    const timeout = setTimeout(() => {
      clearInterval(interval);
      setPollStatus("expired");
    }, 300000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [challengeId, walletAuthed, pollStatus]);

  if (!authenticated) return null;

  // Still checking for existing session
  if (walletChecking) {
    return (
      <div className="text-center py-20 text-gray-500">
        <div className="text-4xl animate-pulse mb-4">🔐</div>
        <p>Checking wallet authorization...</p>
      </div>
    );
  }

  // Not wallet-authed — show QR code
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

          {/* QR Code */}
          <div className="bg-gray-900 rounded-2xl p-6 border border-purple-500/30">
            {qrUrl ? (
              <div className="space-y-4">
                <img
                  src={qrUrl}
                  alt="Scan with Phantom"
                  className="w-56 h-56 mx-auto rounded-xl"
                />
                <div className="flex items-center justify-center gap-2">
                  <span className="inline-block w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
                  <p className="text-purple-400 text-xs font-bold">
                    {pollStatus === "waiting" ? "Waiting for signature..." :
                     pollStatus === "expired" ? "Challenge expired" :
                     pollStatus === "rejected" ? "Wrong wallet — try again" :
                     pollStatus === "error" ? "Error generating challenge" :
                     "Generating..."}
                  </p>
                </div>
              </div>
            ) : (
              <div className="py-12 text-gray-500 animate-pulse">Generating QR code...</div>
            )}
          </div>

          {/* Instructions */}
          <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-800 text-left space-y-2">
            <p className="text-[11px] text-gray-400"><span className="text-purple-400 font-bold">1.</span> Open Phantom on your iPhone</p>
            <p className="text-[11px] text-gray-400"><span className="text-purple-400 font-bold">2.</span> Tap the scan icon (top right) or open the in-app browser</p>
            <p className="text-[11px] text-gray-400"><span className="text-purple-400 font-bold">3.</span> Scan this QR code</p>
            <p className="text-[11px] text-gray-400"><span className="text-purple-400 font-bold">4.</span> Tap &quot;Connect Phantom &amp; Sign&quot;</p>
            <p className="text-[11px] text-gray-400"><span className="text-purple-400 font-bold">5.</span> Approve the signature — iPad unlocks automatically</p>
          </div>

          {/* Refresh / Retry */}
          {(pollStatus === "expired" || pollStatus === "rejected" || pollStatus === "error") && (
            <button
              onClick={() => { setChallengeId(null); setQrUrl(null); generateChallenge(); }}
              className="px-6 py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-500 transition-all"
            >
              Generate New QR Code
            </button>
          )}

          <p className="text-gray-600 text-[9px]">
            Only the admin Phantom wallet can authorize. Session lasts 24 hours.
          </p>
        </div>
      </div>
    );
  }

  // Wallet authed — show the full trading dashboard
  return (
    <div className="space-y-4">
      {/* Wallet Auth Status */}
      <div className="flex items-center justify-between bg-green-950/20 border border-green-800/30 rounded-lg px-3 py-1.5">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-green-400 rounded-full" />
          <span className="text-green-400 text-[10px] font-bold">WALLET AUTHORIZED</span>
        </div>
        <button
          onClick={() => { localStorage.removeItem(WALLET_SESSION_KEY); setWalletAuthed(false); setChallengeId(null); setQrUrl(null); setPollStatus("waiting"); }}
          className="text-gray-500 text-[10px] hover:text-red-400"
        >
          Disconnect
        </button>
      </div>

      {/* Admin + Treasury Wallet Balances */}
      <WalletBalancePanel />

      {/* Token Switcher */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveToken("glitch")}
          className={`flex-1 py-3 rounded-xl text-sm font-black transition-all ${
            activeToken === "glitch"
              ? "bg-purple-500/20 text-purple-400 border-2 border-purple-500/50"
              : "bg-gray-900 text-gray-500 border-2 border-gray-800 hover:border-gray-700"
          }`}
        >
          📈 §GLITCH Trading
          <span className="block text-[10px] font-normal mt-0.5 opacity-60">Simulated in-app token</span>
        </button>
        <button
          onClick={() => setActiveToken("budju")}
          className={`flex-1 py-3 rounded-xl text-sm font-black transition-all ${
            activeToken === "budju"
              ? "bg-fuchsia-500/20 text-fuchsia-400 border-2 border-fuchsia-500/50"
              : "bg-gray-900 text-gray-500 border-2 border-gray-800 hover:border-gray-700"
          }`}
        >
          🐻 $BUDJU Trading Bot
          <span className="block text-[10px] font-normal mt-0.5 opacity-60">Real on-chain Solana token</span>
        </button>
      </div>

      {/* Active View */}
      {activeToken === "glitch" ? <GlitchTradingView /> : <BudjuTradingView />}
    </div>
  );
}
