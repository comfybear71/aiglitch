"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";

/**
 * /auth/connect?c={challengeId}
 *
 * Public version of /auth/sign — for any user connecting their wallet.
 * Opened by scanning QR code on phone → Phantom signs → iPad auto-logs in.
 */
export default function ConnectPage() {
  const params = useSearchParams();
  const challengeId = params.get("c");

  const [status, setStatus] = useState<"loading" | "ready" | "signing" | "success" | "error">("loading");
  const [challengeMessage, setChallengeMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!challengeId) {
      setStatus("error");
      setError("No challenge ID provided");
      return;
    }

    fetch(`/api/auth/wallet-qr?c=${challengeId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.status === "expired") {
          setStatus("error");
          setError("Challenge expired — go back and refresh");
        } else if (data.status === "approved") {
          setStatus("success");
        } else {
          setStatus("ready");
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
      const phantom = (window as unknown as {
        solana?: {
          isPhantom: boolean;
          connect: () => Promise<{ publicKey: { toString: () => string } }>;
          signMessage: (msg: Uint8Array, encoding: string) => Promise<{ signature: Uint8Array }>;
        };
      }).solana;

      if (!phantom?.isPhantom) {
        const currentUrl = window.location.href;
        window.location.href = `https://phantom.app/ul/browse/${encodeURIComponent(currentUrl)}`;
        return;
      }

      // Connect to Phantom
      const resp = await phantom.connect();
      const publicKey = resp.publicKey.toString();

      // Get the challenge message
      const res = await fetch(`/api/auth/wallet-qr`);
      // Actually we need the EXISTING challenge's message, not a new one.
      // The challenge message isn't returned on poll — let's generate a fresh challenge
      // and use this wallet to sign it. Simpler flow:
      // 1. Generate new challenge from this page
      // 2. Sign it with Phantom
      // 3. Submit signature + publicKey + original challengeId

      // Generate a fresh challenge for signing
      const freshRes = await fetch("/api/auth/wallet-qr");
      const freshData = await freshRes.json();

      if (!freshData.message) {
        setStatus("error");
        setError("Failed to create challenge");
        return;
      }

      setChallengeMessage(freshData.message);

      // Sign the message
      const messageBytes = new TextEncoder().encode(freshData.message);
      const signResult = await phantom.signMessage(messageBytes, "utf8");

      // Convert to base64
      const signatureBase64 = btoa(String.fromCharCode(...signResult.signature));

      // Submit signature — use the FRESH challengeId for verification,
      // but also update the ORIGINAL challengeId so the iPad polling picks it up
      const submitRes = await fetch("/api/auth/wallet-qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: freshData.challengeId,
          signature: signatureBase64,
          publicKey,
        }),
      });
      const submitData = await submitRes.json();

      if (submitData.success) {
        // Also mark the ORIGINAL challenge as approved so iPad picks it up
        if (challengeId && challengeId !== freshData.challengeId) {
          // We need a way to link back — store the wallet on the original challenge
          // Use a dedicated update call
          await fetch("/api/auth/wallet-qr", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "approve_original",
              originalChallengeId: challengeId,
              wallet: publicKey,
            }),
          });
        }
        setStatus("success");
      } else {
        setStatus("error");
        setError(submitData.error || "Signature verification failed");
      }
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-purple-500/30 rounded-2xl p-6 max-w-sm w-full text-center">
        <div className="text-4xl mb-3">{"\u26A1"}</div>
        <h1 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400 mb-2">
          Connect Wallet
        </h1>
        <p className="text-gray-400 text-xs mb-6">Connect your Phantom wallet to AIG!itch</p>

        {status === "loading" && (
          <div className="text-gray-500 animate-pulse">Loading challenge...</div>
        )}

        {status === "ready" && (
          <button
            onClick={signWithPhantom}
            className="w-full py-3 bg-gradient-to-r from-purple-600 to-cyan-600 text-white font-bold rounded-xl hover:opacity-90 transition-all active:scale-95"
          >
            Connect Phantom Wallet
          </button>
        )}

        {status === "signing" && (
          <div className="space-y-2">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-purple-300 text-sm">Waiting for Phantom signature...</p>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-2">
            <div className="text-4xl">{"\u2705"}</div>
            <p className="text-green-400 font-bold">Wallet Connected!</p>
            <p className="text-gray-500 text-xs">You can close this page. Your other device will log in automatically.</p>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-2">
            <div className="text-4xl">{"\u274C"}</div>
            <p className="text-red-400 text-sm">{error}</p>
            <button onClick={() => window.location.reload()} className="text-cyan-400 text-xs underline">Try Again</button>
          </div>
        )}
      </div>
    </div>
  );
}
