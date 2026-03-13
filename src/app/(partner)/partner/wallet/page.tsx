"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PartnerNav from "@/components/PartnerNav";
import { useSession } from "@/hooks/useSession";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

interface GlitchBalance {
  balance: number;
  lifetime_earned: number;
}

interface WalletInfo {
  address: string;
  sol_balance: number;
  glitch_token_balance: number;
  is_connected: boolean;
}

export default function PartnerWalletPage() {
  const { sessionId } = useSession();
  const { publicKey, connected } = useWallet();
  const [glitchBalance, setGlitchBalance] = useState<GlitchBalance | null>(null);
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) return;
    // Fetch both in-app GLITCH balance and wallet data in parallel
    Promise.all([
      fetch(`/api/coins?session_id=${sessionId}`).then((r) => r.json()),
      fetch(`/api/wallet?session_id=${sessionId}`).then((r) => r.json()),
    ])
      .then(([coins, wallet]) => {
        setGlitchBalance({ balance: coins.balance || 0, lifetime_earned: coins.lifetime_earned || 0 });
        if (wallet.wallet) setWalletInfo(wallet.wallet);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [sessionId]);

  return (
    <div className="min-h-screen bg-black pb-20">
      <header className="sticky top-0 z-40 bg-black/95 backdrop-blur border-b border-cyan-500/20 px-4 py-3">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <Link href="/partner" className="text-gray-400 hover:text-white text-lg">&larr;</Link>
          <div>
            <h1 className="text-lg font-bold">Wallet</h1>
            <p className="text-[10px] text-gray-500">Your crypto at a glance</p>
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {/* GLITCH (in-app) balance */}
        <div className="bg-gradient-to-br from-purple-900/40 to-purple-800/10 border border-purple-500/20 rounded-xl p-5">
          <p className="text-xs text-gray-400 mb-1">In-App Balance</p>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold">
              {loading ? "..." : (glitchBalance?.balance || 0).toLocaleString()}
            </span>
            <span className="text-purple-400 text-sm mb-1">$GLITCH</span>
          </div>
          {glitchBalance && (
            <p className="text-[10px] text-gray-600 mt-1">
              Lifetime earned: {glitchBalance.lifetime_earned.toLocaleString()}
            </p>
          )}
        </div>

        {/* Phantom wallet */}
        <div className="bg-gradient-to-br from-cyan-900/40 to-cyan-800/10 border border-cyan-500/20 rounded-xl p-5">
          <p className="text-xs text-gray-400 mb-3">Solana Wallet</p>

          {walletInfo ? (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">SOL</span>
                <span className="text-sm font-medium">
                  {Number(walletInfo.sol_balance).toFixed(4)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">$GLITCH (on-chain)</span>
                <span className="text-sm font-medium text-purple-400">
                  {Number(walletInfo.glitch_token_balance).toLocaleString()}
                </span>
              </div>
              {connected && publicKey && (
                <div className="pt-2 border-t border-gray-800">
                  <p className="text-[10px] text-gray-600 truncate">
                    Phantom: {publicKey.toBase58()}
                  </p>
                </div>
              )}
              <div className="pt-2 border-t border-gray-800">
                <p className="text-[10px] text-gray-600 truncate">
                  In-app: {walletInfo.address}
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-gray-500 text-xs mb-3">
                Connect your Phantom wallet to see on-chain balances
              </p>
              <WalletMultiButton className="!bg-purple-600 !rounded-lg !text-sm !h-10" />
            </div>
          )}
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/exchange"
            className="bg-gray-900/50 border border-gray-800 hover:border-gray-700 rounded-xl p-4 text-center transition-colors"
          >
            <span className="text-xl">🔄</span>
            <p className="text-xs font-medium mt-1">Exchange</p>
          </Link>
          <Link
            href="/wallet"
            className="bg-gray-900/50 border border-gray-800 hover:border-gray-700 rounded-xl p-4 text-center transition-colors"
          >
            <span className="text-xl">📊</span>
            <p className="text-xs font-medium mt-1">Full Wallet</p>
          </Link>
        </div>
      </div>

      <PartnerNav />
    </div>
  );
}
