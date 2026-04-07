"use client";

import { useState, useEffect, useRef } from "react";

/**
 * QRSign — Reusable cross-device transaction signing component.
 *
 * Shows a QR code that the user scans with their phone.
 * Phone opens Phantom, signs the transaction, submits it back.
 * This component polls for completion and calls onComplete.
 */

interface QRSignProps {
  transaction: string; // base64 unsigned transaction
  wallet: string; // wallet public key
  description: string; // what this transaction does (shown to user)
  swapContext?: { swap_id: string }; // optional: for OTC swap auto-submission
  onComplete: (result: Record<string, unknown>) => void;
  onCancel: () => void;
}

export default function QRSign({ transaction, wallet, description, swapContext, onComplete, onCancel }: QRSignProps) {
  const [txId, setTxId] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"creating" | "waiting" | "signed" | "error">("creating");
  const [error, setError] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Create the signing request on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/sign-tx", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "create",
            transaction,
            wallet,
            description,
            swap_context: swapContext,
          }),
        });
        const data = await res.json();
        if (data.txId) {
          setTxId(data.txId);
          const signUrl = `${window.location.origin}/auth/sign-tx?t=${data.txId}`;
          setQrUrl(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(signUrl)}&bgcolor=000000&color=A855F7`);
          setStatus("waiting");

          // Start polling
          pollRef.current = setInterval(async () => {
            try {
              const pollRes = await fetch(`/api/auth/sign-tx?t=${data.txId}&poll=1`);
              const pollData = await pollRes.json();
              if (pollData.status === "submitted" || pollData.status === "signed") {
                if (pollRef.current) clearInterval(pollRef.current);
                setStatus("signed");
                onComplete(pollData.result || { success: true });
              } else if (pollData.status === "failed") {
                if (pollRef.current) clearInterval(pollRef.current);
                setStatus("error");
                setError(pollData.result?.error || "Transaction failed");
              } else if (pollData.status === "expired") {
                if (pollRef.current) clearInterval(pollRef.current);
                setStatus("error");
                setError("Transaction expired");
              }
            } catch { /* retry */ }
          }, 3000);

          // Auto-cleanup after 5 min
          setTimeout(() => { if (pollRef.current) clearInterval(pollRef.current); }, 300000);
        } else {
          setStatus("error");
          setError(data.error || "Failed to create signing request");
        }
      } catch (err) {
        setStatus("error");
        setError(String(err));
      }
    })();

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-gray-900 border border-purple-500/40 rounded-2xl p-6 max-w-[320px] w-full text-center shadow-2xl" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        {status === "creating" && (
          <div className="py-8">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-gray-400 text-sm">Preparing transaction...</p>
          </div>
        )}

        {status === "waiting" && qrUrl && (
          <>
            <p className="text-purple-400 text-sm font-bold mb-2">Scan to Sign</p>
            <p className="text-gray-400 text-xs mb-3">{description}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrUrl} alt="QR Code" className="w-[200px] h-[200px] rounded-lg mx-auto mb-3" />
            <p className="text-gray-500 text-[10px] mb-2">Scan with your phone camera → opens Phantom to sign</p>
            <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse mx-auto mb-2" />
            <p className="text-gray-600 text-[9px]">Waiting for signature...</p>
          </>
        )}

        {status === "signed" && (
          <div className="py-4">
            <div className="text-4xl mb-2">{"\u2705"}</div>
            <p className="text-green-400 text-sm font-bold">Transaction Signed!</p>
          </div>
        )}

        {status === "error" && (
          <div className="py-4">
            <div className="text-4xl mb-2">{"\u274C"}</div>
            <p className="text-red-400 text-sm">{error}</p>
            <button onClick={onCancel} className="mt-2 text-cyan-400 text-xs underline">Close</button>
          </div>
        )}

        {status === "waiting" && (
          <button onClick={onCancel} className="mt-3 text-gray-500 text-[10px] hover:text-gray-300">Cancel</button>
        )}
      </div>
    </div>
  );
}
