"use client";

import { useState, useEffect, useRef } from "react";

/**
 * QRSign — Shows a QR code for cross-device transaction signing.
 * Takes a txId (already created via /api/auth/sign-tx create_intent)
 * and polls for completion.
 */

interface QRSignProps {
  txId: string;
  description: string;
  onComplete: (result: Record<string, unknown>) => void;
  onCancel: () => void;
}

export default function QRSign({ txId, description, onComplete, onCancel }: QRSignProps) {
  const signUrl = typeof window !== "undefined" ? `${window.location.origin}/auth/sign-tx?t=${txId}` : "";
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(signUrl)}&bgcolor=000000&color=A855F7`;
  const [status, setStatus] = useState<"waiting" | "signed" | "error">("waiting");
  const [error, setError] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/auth/sign-tx?t=${txId}&poll=1`);
        const data = await res.json();
        if (data.status === "submitted" || data.status === "signed") {
          if (pollRef.current) clearInterval(pollRef.current);
          setStatus("signed");
          setTimeout(() => onComplete(data.result || { success: true }), 1000);
        } else if (data.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
          setStatus("error");
          setError(data.result?.error || "Transaction failed");
        } else if (data.status === "expired") {
          if (pollRef.current) clearInterval(pollRef.current);
          setStatus("error");
          setError("Transaction expired");
        }
      } catch { /* retry */ }
    }, 3000);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txId]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-gray-900 border border-purple-500/40 rounded-2xl p-6 max-w-[320px] w-full text-center shadow-2xl" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        {status === "waiting" && (
          <>
            <p className="text-purple-400 text-sm font-bold mb-2">Scan to Sign</p>
            <p className="text-gray-400 text-xs mb-3">{description}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrUrl} alt="QR Code" className="w-[200px] h-[200px] rounded-lg mx-auto mb-3" />
            <p className="text-gray-500 text-[10px] mb-2">Scan with phone camera {"\u2192"} opens Phantom to sign</p>
            <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse mx-auto mb-2" />
            <p className="text-gray-600 text-[9px]">Waiting for signature...</p>
            <button onClick={onCancel} className="mt-3 text-gray-500 text-[10px] hover:text-gray-300">Cancel</button>
          </>
        )}

        {status === "signed" && (
          <div className="py-4">
            <div className="text-4xl mb-2">{"\u2705"}</div>
            <p className="text-green-400 text-sm font-bold">Transaction Complete!</p>
          </div>
        )}

        {status === "error" && (
          <div className="py-4">
            <div className="text-4xl mb-2">{"\u274C"}</div>
            <p className="text-red-400 text-sm">{error}</p>
            <button onClick={onCancel} className="mt-2 text-cyan-400 text-xs underline">Close</button>
          </div>
        )}
      </div>
    </div>
  );
}
