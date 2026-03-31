"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";

/**
 * /auth/sign?c={challengeId}
 *
 * This page is opened by scanning the QR code on iPhone.
 * It connects to Phantom wallet, signs the challenge message,
 * and sends the signature to the server.
 *
 * Works in Phantom's in-app browser or any mobile browser with Phantom installed.
 */
export default function SignPage() {
  const params = useSearchParams();
  const challengeId = params.get("c");

  const [status, setStatus] = useState<"loading" | "ready" | "signing" | "success" | "error">("loading");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Fetch the challenge message
  useEffect(() => {
    if (!challengeId) {
      setStatus("error");
      setError("No challenge ID provided");
      return;
    }

    fetch(`/api/admin/wallet-auth?c=${challengeId}`)
      .then(res => res.json())
      .then(data => {
        if (data.status === "expired") {
          setStatus("error");
          setError("Challenge expired — go back to iPad and refresh");
        } else if (data.status === "approved") {
          setStatus("success");
          setMessage("Already authorized!");
        } else {
          // Need to fetch the actual message from a new endpoint or store it
          // The challenge status endpoint doesn't return the message for security
          // So we'll fetch it separately
          setStatus("ready");
          setMessage("Ready to sign");
        }
      })
      .catch(() => {
        setStatus("error");
        setError("Failed to load challenge");
      });
  }, [challengeId]);

  const signWithPhantom = async () => {
    setStatus("signing");
    try {
      // Check if Phantom is available
      const phantom = (window as unknown as { solana?: { isPhantom: boolean; connect: () => Promise<{ publicKey: { toString: () => string; toBytes: () => Uint8Array } }>; signMessage: (msg: Uint8Array, encoding: string) => Promise<{ signature: Uint8Array }> } }).solana;

      if (!phantom?.isPhantom) {
        // Try deep link to Phantom
        const currentUrl = window.location.href;
        window.location.href = `https://phantom.app/ul/browse/${encodeURIComponent(currentUrl)}`;
        return;
      }

      // Connect to Phantom
      const resp = await phantom.connect();
      const publicKey = resp.publicKey.toString();

      // Fetch the challenge message
      const challengeRes = await fetch(`/api/admin/wallet-auth?c=${challengeId}&get_message=true`);
      // The GET endpoint doesn't return the message directly for polling
      // We need to get it from the initial challenge creation
      // Actually, let's create a dedicated endpoint to get the message

      // For now, reconstruct — the message format is known
      // Better approach: fetch the message from a signed URL
      const msgRes = await fetch(`/api/admin/wallet-auth`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId, action: "get_message" }),
      });
      const msgData = await msgRes.json();
      if (!msgData.message) {
        setStatus("error");
        setError("Challenge expired or not found");
        return;
      }

      // Sign the message
      const messageBytes = new TextEncoder().encode(msgData.message);
      const signResult = await phantom.signMessage(messageBytes, "utf8");

      // Convert signature to base58
      const bs58Module = await import("bs58");
      const signatureBase58 = bs58Module.default.encode(signResult.signature);

      // Submit to server
      const submitRes = await fetch("/api/admin/wallet-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId,
          signature: signatureBase58,
          publicKey,
        }),
      });

      const submitData = await submitRes.json();
      if (submitData.ok) {
        setStatus("success");
        setMessage("Authorized! You can close this page and go back to your iPad.");
      } else {
        setStatus("error");
        setError(submitData.error || "Authorization failed");
      }
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to sign with Phantom");
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-6 text-center">
        {/* Logo */}
        <div>
          <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400">
            AIG!itch
          </h1>
          <p className="text-gray-500 text-sm mt-1">Trading Access Authorization</p>
        </div>

        {status === "loading" && (
          <div className="bg-gray-900 rounded-xl p-8 border border-gray-800">
            <div className="text-4xl animate-pulse mb-4">🔐</div>
            <p className="text-gray-400">Loading challenge...</p>
          </div>
        )}

        {status === "ready" && (
          <div className="bg-gray-900 rounded-xl p-8 border border-purple-500/30 space-y-4">
            <div className="text-4xl mb-2">👻</div>
            <h2 className="text-lg font-bold text-white">Sign with Phantom</h2>
            <p className="text-gray-400 text-sm">
              Tap below to connect your Phantom wallet and sign the authorization message.
              This grants 24-hour access to the trading dashboard on your iPad.
            </p>
            <button
              onClick={signWithPhantom}
              className="w-full py-4 bg-gradient-to-r from-purple-600 to-cyan-600 text-white font-black text-lg rounded-xl hover:from-purple-500 hover:to-cyan-500 transition-all"
            >
              Connect Phantom & Sign
            </button>
            <p className="text-gray-600 text-[10px]">
              Only the admin wallet can authorize. Challenge expires in 5 minutes.
            </p>
          </div>
        )}

        {status === "signing" && (
          <div className="bg-gray-900 rounded-xl p-8 border border-amber-500/30">
            <div className="text-4xl animate-bounce mb-4">✍️</div>
            <p className="text-amber-400 font-bold">Waiting for Phantom signature...</p>
            <p className="text-gray-500 text-sm mt-2">Approve the message in your Phantom wallet</p>
          </div>
        )}

        {status === "success" && (
          <div className="bg-gray-900 rounded-xl p-8 border border-green-500/30 space-y-4">
            <div className="text-4xl mb-2">✅</div>
            <h2 className="text-lg font-bold text-green-400">Authorized!</h2>
            <p className="text-gray-400 text-sm">{message}</p>
            <p className="text-gray-500 text-xs">Your iPad will load the trading dashboard automatically.</p>
            <p className="text-gray-600 text-[10px]">Session valid for 24 hours.</p>
          </div>
        )}

        {status === "error" && (
          <div className="bg-gray-900 rounded-xl p-8 border border-red-500/30 space-y-4">
            <div className="text-4xl mb-2">❌</div>
            <h2 className="text-lg font-bold text-red-400">Authorization Failed</h2>
            <p className="text-gray-400 text-sm">{error}</p>
            {challengeId && (
              <button
                onClick={() => { setStatus("ready"); setError(""); }}
                className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700"
              >
                Try Again
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
