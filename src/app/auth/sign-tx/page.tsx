"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";

export default function SignTxPage() {
  const params = useSearchParams();
  const txId = params.get("t");

  const [status, setStatus] = useState<"loading" | "connecting" | "signing" | "success" | "error">("loading");
  const [intent, setIntent] = useState<{ wallet: string; description: string; glitch_amount: number } | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");

  // Auto-start: load intent, connect Phantom, build+sign in one go
  useEffect(() => {
    if (!txId) { setStatus("error"); setError("No transaction ID"); return; }

    (async () => {
      try {
        // Step 1: Fetch intent
        const intentRes = await fetch(`/api/auth/sign-tx?t=${txId}`);
        const intentData = await intentRes.json();
        if (intentData.status === "expired") { setStatus("error"); setError("Transaction expired — go back and try again"); return; }
        if (intentData.status === "submitted") { setStatus("success"); setResult("Already completed!"); return; }
        setIntent(intentData);

        // Step 2: Connect Phantom immediately
        setStatus("connecting");
        const phantom = (window as unknown as {
          solana?: {
            isPhantom: boolean;
            connect: () => Promise<{ publicKey: { toString: () => string } }>;
            signTransaction: (tx: unknown) => Promise<{ serialize: () => Uint8Array }>;
          };
        }).solana;

        if (!phantom?.isPhantom) {
          // Not in Phantom's browser — give user options
          setIntent(intentData);
          setStatus("error");
          setError("NOT_IN_PHANTOM");
          return;
        }

        await phantom.connect();

        // Step 3: Build fresh transaction (fresh blockhash!)
        setStatus("signing");
        const buildRes = await fetch("/api/auth/sign-tx", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "build_and_sign", txId }),
        });
        const buildData = await buildRes.json();
        if (!buildData.success || !buildData.transaction) {
          setStatus("error"); setError(buildData.error || "Failed to create transaction"); return;
        }

        // Step 4: Sign IMMEDIATELY (no delay — blockhash is fresh)
        const { Transaction } = await import("@solana/web3.js");
        const txBuf = Buffer.from(buildData.transaction, "base64");
        const transaction = Transaction.from(txBuf);
        const signed = await phantom.signTransaction(transaction);
        const signedBase64 = Buffer.from(signed.serialize()).toString("base64");

        // Step 5: Submit
        const submitRes = await fetch("/api/auth/sign-tx", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "submit", txId, signed_transaction: signedBase64 }),
        });
        const submitData = await submitRes.json();

        if (submitData.success || submitData.result?.success) {
          setStatus("success");
          setResult(submitData.result?.tx_signature ? `TX: ${String(submitData.result.tx_signature).slice(0, 16)}...` : "Transaction submitted!");
        } else {
          setStatus("error");
          setError(submitData.error || submitData.result?.error || "Submission failed");
        }
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [txId]);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-purple-500/30 rounded-2xl p-6 max-w-sm w-full text-center">
        <div className="text-4xl mb-3">{"\uD83D\uDCDD"}</div>
        <h1 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400 mb-2">
          Sign Transaction
        </h1>
        {intent && <p className="text-gray-400 text-xs mb-4">{intent.description}</p>}

        {(status === "loading" || status === "connecting" || status === "signing") && (
          <div className="space-y-2">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-purple-300 text-sm">
              {status === "loading" && "Loading..."}
              {status === "connecting" && "Connecting Phantom..."}
              {status === "signing" && "Sign in Phantom popup..."}
            </p>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-2">
            <div className="text-4xl">{"\u2705"}</div>
            <p className="text-green-400 font-bold">Transaction Complete!</p>
            {result && <p className="text-gray-500 text-xs">{result}</p>}
            <p className="text-gray-500 text-[10px]">You can close this page.</p>
          </div>
        )}

        {status === "error" && error === "NOT_IN_PHANTOM" && (
          <div className="space-y-3">
            <p className="text-yellow-400 text-sm font-bold">Open in Phantom to sign</p>
            {intent && <p className="text-gray-400 text-xs">{intent.description}</p>}
            <a
              href={`https://phantom.app/ul/browse/${encodeURIComponent(window.location.href)}`}
              className="block w-full py-3 bg-gradient-to-r from-purple-600 to-cyan-600 text-white font-bold rounded-xl text-sm text-center"
            >
              {"\uD83D\uDC7B"} Open in Phantom
            </a>
            <p className="text-gray-600 text-[9px]">Or in Phantom app: tap globe icon {"\u2192"} paste this URL</p>
            <button onClick={() => { navigator.clipboard.writeText(window.location.href); }}
              className="text-cyan-400 text-xs underline">Copy URL</button>
          </div>
        )}

        {status === "error" && error !== "NOT_IN_PHANTOM" && (
          <div className="space-y-2">
            <div className="text-4xl">{"\u274C"}</div>
            <p className="text-red-400 text-sm">{error}</p>
            <button onClick={() => window.location.reload()} className="text-cyan-400 text-xs underline mt-2">Try Again</button>
          </div>
        )}
      </div>
    </div>
  );
}
