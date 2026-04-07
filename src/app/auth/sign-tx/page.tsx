"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";

/**
 * /auth/sign-tx?t={txId}
 *
 * Phone opens this page after scanning QR. Connects to Phantom,
 * signs the transaction, and submits it back.
 */
export default function SignTxPage() {
  const params = useSearchParams();
  const txId = params.get("t");

  const [status, setStatus] = useState<"loading" | "ready" | "signing" | "success" | "error">("loading");
  const [txData, setTxData] = useState<{ transaction: string; wallet: string; description: string } | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<string>("");

  useEffect(() => {
    if (!txId) { setStatus("error"); setError("No transaction ID"); return; }

    fetch(`/api/auth/sign-tx?t=${txId}`)
      .then(r => r.json())
      .then(data => {
        if (data.status === "expired") {
          setStatus("error"); setError("Transaction expired");
        } else if (data.status === "signed" || data.status === "submitted") {
          setStatus("success"); setResult("Already signed!");
        } else if (data.transaction) {
          setTxData(data); setStatus("ready");
        } else {
          setStatus("error"); setError("Transaction not found");
        }
      })
      .catch(() => { setStatus("error"); setError("Failed to load"); });
  }, [txId]);

  const signWithPhantom = async () => {
    if (!txId || !txData) return;
    setStatus("signing");
    try {
      const phantom = (window as unknown as {
        solana?: {
          isPhantom: boolean;
          connect: () => Promise<{ publicKey: { toString: () => string } }>;
          signTransaction: (tx: unknown) => Promise<{ serialize: () => Uint8Array }>;
        };
      }).solana;

      if (!phantom?.isPhantom) {
        const currentUrl = window.location.href;
        window.location.href = `https://phantom.app/ul/browse/${encodeURIComponent(currentUrl)}`;
        return;
      }

      await phantom.connect();

      // Deserialize the transaction
      const { Transaction } = await import("@solana/web3.js");
      const txBuf = Buffer.from(txData.transaction, "base64");
      const transaction = Transaction.from(txBuf);

      // Sign with Phantom
      const signed = await phantom.signTransaction(transaction);
      const signedBase64 = Buffer.from(signed.serialize()).toString("base64");

      // Submit back to server
      const submitRes = await fetch("/api/auth/sign-tx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit", txId, signed_transaction: signedBase64 }),
      });
      const submitData = await submitRes.json();

      if (submitData.success || submitData.result?.success) {
        setStatus("success");
        setResult(submitData.result?.tx_signature ? `TX: ${submitData.result.tx_signature.slice(0, 12)}...` : "Transaction submitted!");
      } else {
        setStatus("error");
        setError(submitData.error || submitData.result?.error || "Submission failed");
      }
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-purple-500/30 rounded-2xl p-6 max-w-sm w-full text-center">
        <div className="text-4xl mb-3">{"\u{1F4DD}"}</div>
        <h1 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400 mb-2">
          Sign Transaction
        </h1>
        {txData && (
          <p className="text-gray-400 text-xs mb-4">{txData.description}</p>
        )}

        {status === "loading" && <div className="text-gray-500 animate-pulse">Loading transaction...</div>}

        {status === "ready" && (
          <button onClick={signWithPhantom}
            className="w-full py-3 bg-gradient-to-r from-purple-600 to-cyan-600 text-white font-bold rounded-xl hover:opacity-90 transition-all active:scale-95">
            {"\uD83D\uDC7B"} Sign with Phantom
          </button>
        )}

        {status === "signing" && (
          <div className="space-y-2">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-purple-300 text-sm">Waiting for Phantom...</p>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-2">
            <div className="text-4xl">{"\u2705"}</div>
            <p className="text-green-400 font-bold">Transaction Signed!</p>
            {result && <p className="text-gray-500 text-xs">{result}</p>}
            <p className="text-gray-500 text-[10px]">You can close this page.</p>
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
