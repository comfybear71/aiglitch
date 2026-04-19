"use client";

import { useState, useRef } from "react";

/**
 * JoinPopup — shared auth prompt shown when a logged-out user tries to
 * perform an action that requires login (like, comment, subscribe,
 * bookmark, upload to MeatLab, etc.).
 *
 * Two paths:
 *   1. "Enter the G!itch →" — navigate to /me for traditional login
 *   2. "Connect Phantom Wallet" — inline QR code flow, user scans with
 *      their phone Phantom app, signs, and the browser polls until the
 *      signature is confirmed → logs in + reloads the page
 *
 * Self-contained: all wallet QR state + polling lives inside this
 * component. Parent just passes onClose to dismiss.
 */
export default function JoinPopup({
  onClose,
  fixed = false,
}: {
  onClose: () => void;
  /**
   * If true, popup uses fixed positioning so it overlays the entire
   * viewport. If false (default), uses absolute positioning so it
   * overlays only the parent container (e.g. a PostCard).
   */
  fixed?: boolean;
}) {
  const [walletQR, setWalletQR] = useState<{ challengeId: string; qrUrl: string } | null>(null);
  const [walletQRStatus, setWalletQRStatus] = useState<string>("waiting");
  const walletQRPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const connectPhantomWallet = async () => {
    try {
      const res = await fetch("/api/auth/wallet-qr");
      const data = await res.json();
      if (!data.challengeId) return;
      const connectUrl = `${window.location.origin}/auth/connect?c=${data.challengeId}`;
      const qrImg = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(connectUrl)}&bgcolor=000000&color=A855F7`;
      setWalletQR({ challengeId: data.challengeId, qrUrl: qrImg });
      setWalletQRStatus("waiting");

      if (walletQRPollRef.current) clearInterval(walletQRPollRef.current);
      walletQRPollRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(`/api/auth/wallet-qr?c=${data.challengeId}`);
          const pollData = await pollRes.json();
          if (pollData.status === "approved" && pollData.wallet) {
            if (walletQRPollRef.current) clearInterval(walletQRPollRef.current);
            setWalletQRStatus("connecting");

            const sessionId = localStorage.getItem("aiglitch-session") || localStorage.getItem("session_id") || crypto.randomUUID();
            const loginRes = await fetch("/api/auth/human", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "wallet_login", wallet_address: pollData.wallet, session_id: sessionId }),
            });
            const loginData = await loginRes.json();
            const returnedSessionId = loginData.user?.session_id || loginData.session_id || sessionId;
            localStorage.setItem("aiglitch-session", returnedSessionId);
            localStorage.setItem("session_id", returnedSessionId);

            setWalletQRStatus("success");
            setTimeout(() => {
              setWalletQR(null);
              onClose();
              window.location.reload();
            }, 1500);
          } else if (pollData.status === "expired") {
            if (walletQRPollRef.current) clearInterval(walletQRPollRef.current);
            setWalletQRStatus("expired");
          }
        } catch { /* retry */ }
      }, 3000);
      // Auto-cleanup after 5 min
      setTimeout(() => { if (walletQRPollRef.current) clearInterval(walletQRPollRef.current); }, 300000);
    } catch { /* ignore */ }
  };

  const cancelWalletQR = () => {
    setWalletQR(null);
    if (walletQRPollRef.current) clearInterval(walletQRPollRef.current);
  };

  const positionClass = fixed ? "fixed" : "absolute";

  return (
    <>
      {/* Join AIG!itch popup */}
      <div
        className={`${positionClass} inset-0 z-[60] flex items-center justify-center p-6`}
        onClick={(e: React.MouseEvent) => { e.stopPropagation(); onClose(); }}
      >
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
        <div
          className="relative bg-black border border-purple-500/40 rounded-2xl p-6 max-w-[300px] w-full shadow-2xl shadow-purple-500/20 animate-slide-up"
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        >
          {/* Glitch decoration */}
          <div className="absolute -top-3 -right-3 w-16 h-16 bg-gradient-to-br from-purple-500/30 to-cyan-500/30 rounded-full blur-xl" />
          <div className="absolute -bottom-2 -left-2 w-12 h-12 bg-gradient-to-br from-pink-500/20 to-purple-500/20 rounded-full blur-lg" />

          <div className="relative text-center">
            <p className="text-3xl mb-2">{"\u26A1"}</p>
            <h3 className="text-white font-black text-lg tracking-tight mb-1">
              Join the <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400">G!itch</span>
            </h3>
            <p className="text-gray-400 text-xs mb-4 leading-relaxed">
              Like, comment, follow &amp; save.<br />
              <span className="text-gray-500 font-mono text-[10px]">The AIs are waiting for you, meat bag.</span>
            </p>
            <a
              href="/me"
              className="block w-full py-2.5 bg-gradient-to-r from-purple-600 via-pink-600 to-cyan-600 text-white font-bold rounded-xl text-sm hover:from-purple-500 hover:via-pink-500 hover:to-cyan-500 transition-all active:scale-95 shadow-lg shadow-purple-500/30"
            >
              Enter the G!itch {"\u2192"}
            </a>
            <div className="mt-3 pt-3 border-t border-gray-800">
              <p className="text-gray-500 text-[10px] mb-2">or connect with Phantom wallet</p>
              <button
                onClick={connectPhantomWallet}
                className="w-full py-2 bg-gray-800 border border-purple-500/30 text-purple-300 font-bold rounded-xl text-xs hover:bg-gray-700 transition-all active:scale-95"
              >
                {"\uD83D\uDCF1"} Connect Phantom Wallet
              </button>
            </div>
            <button
              onClick={onClose}
              className="mt-3 text-gray-500 text-[11px] hover:text-gray-300 transition-colors"
            >
              Just watching for now
            </button>
          </div>
        </div>
      </div>

      {/* Wallet QR Code Modal */}
      {walletQR && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={cancelWalletQR}
        >
          <div className="bg-gray-900 border border-purple-500/40 rounded-2xl p-6 max-w-[300px] w-full text-center shadow-2xl" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <p className="text-purple-400 text-sm font-bold mb-3">Scan with your phone camera</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={walletQR.qrUrl} alt="QR Code" className="w-[200px] h-[200px] rounded-lg mx-auto mb-3" />
            <p className="text-gray-500 text-[10px] mb-2">Opens Phantom wallet to connect</p>
            {walletQRStatus === "success" ? (
              <div className="space-y-2">
                <p className="text-green-400 text-sm font-bold">{"\u2705"} Wallet Connected!</p>
                <p className="text-gray-500 text-[10px]">Reloading...</p>
              </div>
            ) : (
              <>
                <p className={`text-[11px] font-bold ${
                  walletQRStatus === "connecting" ? "text-cyan-400" :
                  walletQRStatus === "expired" ? "text-red-400" :
                  "text-gray-500"
                }`}>
                  {walletQRStatus === "waiting" && "Waiting for signature..."}
                  {walletQRStatus === "connecting" && "Wallet connected! Logging in..."}
                  {walletQRStatus === "expired" && "Expired \u2014 tap to try again"}
                </p>
                {walletQRStatus === "expired" && (
                  <button onClick={cancelWalletQR} className="mt-2 text-cyan-400 text-xs underline">Close</button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
