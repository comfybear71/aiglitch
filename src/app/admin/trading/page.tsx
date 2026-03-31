"use client";

import { useState, useEffect, useCallback } from "react";
import { useAdmin } from "../AdminContext";
import GlitchTradingView from "./GlitchTradingView";
import BudjuTradingView from "./BudjuTradingView";

const WALLET_SESSION_KEY = "aiglitch-wallet-session";

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
