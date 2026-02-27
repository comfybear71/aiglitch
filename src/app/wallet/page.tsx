"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import BottomNav from "@/components/BottomNav";
import TokenIcon from "@/components/TokenIcon";

interface WalletData {
  address: string;
  sol_balance: number;
  glitch_token_balance: number;
  is_connected: boolean;
  created_at: string;
}

interface BlockchainTx {
  tx_hash: string;
  from_address: string;
  to_address: string;
  amount: number;
  token: string;
  fee_lamports: number;
  status: string;
  memo: string;
  created_at: string;
  block_number: number;
}

interface ChainStats {
  price_sol: number;
  price_usd: number;
  market_cap: number;
  total_supply: number;
  total_wallets: number;
  total_transactions: number;
  current_block: number;
  network: string;
  token_name: string;
  token_symbol: string;
  token_standard: string;
  contract_address: string;
  recent_transactions: BlockchainTx[];
}

interface PhantomBalance {
  sol_balance: number | null;
  glitch_balance: number | null;
  budju_balance: number | null;
  usdc_balance: number | null;
  linked: boolean;
}

interface BridgeStatus {
  bridge_active: boolean;
  snapshot_balance: number;
  current_balance: number;
  claim_status: string;
  phantom_wallet: string | null;
  claim: {
    id: string;
    status: string;
    amount: number;
    tx_signature: string | null;
    created_at: string;
    completed_at: string | null;
    error: string | null;
  } | null;
  snapshot: {
    id: string;
    name: string;
    taken_at: string;
  } | null;
}

type Tab = "wallet" | "explorer" | "send" | "phantom" | "learn";

export default function WalletPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [transactions, setTransactions] = useState<BlockchainTx[]>([]);
  const [chainStats, setChainStats] = useState<ChainStats | null>(null);
  const [tab, setTab] = useState<Tab>(() => {
    // Default to phantom tab if opened inside Phantom's in-app browser
    if (typeof window !== "undefined") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      if (w.phantom?.solana?.isPhantom || w.solana?.isPhantom) {
        return "phantom";
      }
    }
    return "wallet";
  });
  const [creating, setCreating] = useState(false);
  const [sendAddress, setSendAddress] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [fauceting, setFauceting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [phantomBalance, setPhantomBalance] = useState<PhantomBalance>({ sol_balance: null, glitch_balance: null, budju_balance: null, usdc_balance: null, linked: false });
  const [linking, setLinking] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus | null>(null);
  const [bridgeClaiming, setBridgeClaiming] = useState(false);

  const { publicKey, connected, signMessage, connect, select, wallets } = useWallet();

  useEffect(() => {
    if (typeof window !== "undefined") {
      setSessionId(localStorage.getItem("aiglitch-session"));
    }
  }, []);

  // Auto-connect Phantom when inside Phantom's in-app browser (deep link)
  useEffect(() => {
    if (connected || typeof window === "undefined") return;

    const tryAutoConnect = async () => {
      // Detect if Phantom provider is available (we're in Phantom's browser)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      const isPhantomAvailable = w.phantom?.solana?.isPhantom || w.solana?.isPhantom;
      if (!isPhantomAvailable) return;

      // Select the Phantom wallet adapter if not already selected
      const phantomWallet = wallets.find(wal => wal.adapter.name === "Phantom");
      if (phantomWallet) {
        try {
          select(phantomWallet.adapter.name);
          // Small delay to let the adapter initialize after selection
          await new Promise(r => setTimeout(r, 300));
          await connect();
        } catch {
          // Phantom may require user interaction on first connect; ignore
        }
      }
    };

    // Delay slightly to let Phantom inject its provider
    const timer = setTimeout(tryAutoConnect, 500);
    return () => clearTimeout(timer);
  }, [connected, wallets, select, connect]);

  // Link Phantom wallet to account when connected
  const linkPhantomWallet = useCallback(async () => {
    if (!sessionId || !publicKey || linking) return;
    setLinking(true);
    try {
      const res = await fetch("/api/solana", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          action: "link_phantom",
          wallet_address: publicKey.toBase58(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast("success", data.message || "Phantom wallet linked!");
        setPhantomBalance(prev => ({ ...prev, linked: true }));
        fetchPhantomBalance();
      } else if (data.error) {
        showToast("error", data.error);
      }
    } catch {
      showToast("error", "Failed to link Phantom wallet");
    } finally {
      setLinking(false);
    }
  }, [sessionId, publicKey, linking]);

  // Fetch real on-chain balances (SOL, $GLITCH, $BUDJU, USDC)
  const fetchPhantomBalance = useCallback(async () => {
    if (!publicKey) return;
    try {
      const res = await fetch(`/api/solana?action=balance&wallet_address=${publicKey.toBase58()}`);
      const data = await res.json();
      setPhantomBalance({
        sol_balance: data.sol_balance ?? null,
        glitch_balance: data.glitch_balance ?? null,
        budju_balance: data.budju_balance ?? null,
        usdc_balance: data.usdc_balance ?? null,
        linked: true,
      });
    } catch { /* ignore */ }
  }, [publicKey]);

  // Claim airdrop to Phantom wallet
  const claimPhantomAirdrop = useCallback(async () => {
    if (!sessionId || !publicKey || claiming) return;
    setClaiming(true);
    try {
      const res = await fetch("/api/solana", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          action: "claim_airdrop",
          wallet_address: publicKey.toBase58(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast("success", data.message);
        fetchPhantomBalance();
      } else {
        showToast("error", data.error || "Claim failed");
      }
    } catch {
      showToast("error", "Failed to claim airdrop");
    } finally {
      setClaiming(false);
    }
  }, [sessionId, publicKey, claiming]);

  // Fetch bridge/snapshot status
  const fetchBridgeStatus = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/bridge?action=status&session_id=${encodeURIComponent(sessionId)}`);
      const data = await res.json();
      setBridgeStatus(data);
    } catch { /* ignore */ }
  }, [sessionId]);

  // Claim real tokens from bridge
  const claimBridge = useCallback(async () => {
    if (!sessionId || !publicKey || bridgeClaiming) return;
    setBridgeClaiming(true);
    try {
      const res = await fetch("/api/bridge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          action: "claim",
          wallet_address: publicKey.toBase58(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast("success", data.message);
        fetchBridgeStatus();
      } else {
        showToast("error", data.error || "Bridge claim failed");
      }
    } catch {
      showToast("error", "Failed to claim from bridge");
    } finally {
      setBridgeClaiming(false);
    }
  }, [sessionId, publicKey, bridgeClaiming]);

  useEffect(() => {
    if (connected && publicKey) {
      fetchPhantomBalance();
    }
  }, [connected, publicKey, fetchPhantomBalance]);

  useEffect(() => {
    if (sessionId) {
      fetchBridgeStatus();
    }
  }, [sessionId, fetchBridgeStatus]);

  const fetchWallet = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/wallet?session_id=${encodeURIComponent(sessionId)}`);
      const data = await res.json();
      if (data.wallet) {
        setWallet(data.wallet);
        setTransactions(data.transactions || []);
      }
    } catch { /* ignore */ }
  }, [sessionId]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/wallet?action=stats");
      const data = await res.json();
      setChainStats(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchWallet();
    fetchStats();
  }, [fetchWallet, fetchStats]);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const createWallet = async () => {
    if (!sessionId) {
      showToast("error", "Sign up first to create a Solana wallet!");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, action: "create_wallet" }),
      });
      const data = await res.json();
      if (data.success || data.already_exists) {
        showToast("success", data.message || "Wallet connected!");
        fetchWallet();
      } else {
        showToast("error", data.error || "Failed to create wallet");
      }
    } catch {
      showToast("error", "Network error");
    } finally {
      setCreating(false);
    }
  };

  const handleSend = async () => {
    if (!sessionId || !sendAddress || !sendAmount) return;
    const amount = parseInt(sendAmount);
    if (isNaN(amount) || amount < 1) {
      showToast("error", "Enter a valid amount");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, action: "send", to_address: sendAddress, amount }),
      });
      const data = await res.json();
      if (data.success) {
        showToast("success", `Sent ${amount} $GLITCH! TX: ${data.tx_hash.slice(0, 12)}...`);
        setSendAddress("");
        setSendAmount("");
        fetchWallet();
        fetchStats();
      } else {
        showToast("error", data.error || "Transfer failed");
      }
    } catch {
      showToast("error", "Network error");
    } finally {
      setSending(false);
    }
  };

  const handleFaucet = async () => {
    if (!sessionId) return;
    setFauceting(true);
    try {
      const res = await fetch("/api/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, action: "faucet" }),
      });
      const data = await res.json();
      if (data.success) {
        showToast("success", `Received ${data.amount.toFixed(4)} SOL from faucet!`);
        fetchWallet();
      } else {
        showToast("error", data.error || "Faucet dry");
      }
    } catch {
      showToast("error", "Network error");
    } finally {
      setFauceting(false);
    }
  };

  const copyAddress = () => {
    if (wallet?.address) {
      navigator.clipboard.writeText(wallet.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const truncAddr = (addr: string) => addr.length > 16 ? addr.slice(0, 8) + "..." + addr.slice(-6) : addr;
  const timeAgo = (d: string) => {
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  };

  const portfolioValue = wallet
    ? (wallet.glitch_token_balance * (chainStats?.price_usd || 0.0069)).toFixed(2)
    : "0.00";

  return (
    <main className="min-h-[100dvh] bg-black text-white font-mono pb-16">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-black/90 backdrop-blur-xl border-b border-gray-800/50">
        <div className="flex items-center justify-between px-4 py-3">
          <a href="/" className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </a>
          <div className="text-center">
            <h1 className="text-lg font-bold">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-cyan-400">Solana</span> Wallet
            </h1>
            <p className="text-gray-500 text-[10px] tracking-widest">$GLITCH ON-CHAIN</p>
          </div>
          <a href="/exchange" className="text-xs px-2 py-1 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors">
            Trade
          </a>
        </div>

        {/* Tab pills — REAL vs FAKE clearly labeled */}
        <div className="flex gap-1.5 px-4 pb-3 overflow-x-auto">
          {/* REAL wallet tab */}
          <button
            onClick={() => setTab("phantom")}
            className={`flex-shrink-0 text-xs py-1.5 px-3 rounded-full font-mono transition-all ${
              tab === "phantom"
                ? "bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-bold ring-2 ring-purple-400/50"
                : "bg-gray-900 text-gray-400 hover:text-white"
            }`}
          >
            REAL Wallet
          </button>
          {/* FAKE wallet tabs */}
          <button
            onClick={() => setTab("wallet")}
            className={`flex-shrink-0 text-xs py-1.5 px-3 rounded-full font-mono transition-all ${
              tab === "wallet"
                ? "bg-gradient-to-r from-green-500 to-cyan-500 text-black font-bold"
                : "bg-gray-900 text-gray-400 hover:text-white"
            }`}
          >
            Play Wallet
          </button>
          <button
            onClick={() => setTab("explorer")}
            className={`flex-shrink-0 text-xs py-1.5 px-3 rounded-full font-mono transition-all ${
              tab === "explorer"
                ? "bg-gradient-to-r from-green-500 to-cyan-500 text-black font-bold"
                : "bg-gray-900 text-gray-400 hover:text-white"
            }`}
          >
            Explorer
          </button>
          <button
            onClick={() => setTab("send")}
            className={`flex-shrink-0 text-xs py-1.5 px-3 rounded-full font-mono transition-all ${
              tab === "send"
                ? "bg-gradient-to-r from-green-500 to-cyan-500 text-black font-bold"
                : "bg-gray-900 text-gray-400 hover:text-white"
            }`}
          >
            Send
          </button>
          <button
            onClick={() => setTab("learn")}
            className={`flex-shrink-0 text-xs py-1.5 px-3 rounded-full font-mono transition-all ${
              tab === "learn"
                ? "bg-gradient-to-r from-yellow-500 to-orange-500 text-black font-bold"
                : "bg-gray-900 text-gray-400 hover:text-white"
            }`}
          >
            WTF?
          </button>
        </div>
      </div>

      {/* No wallet — create one (only show for sim/send tabs) */}
      {!wallet && (tab === "wallet" || tab === "send") && (
        <div className="mx-4 mt-4 text-center space-y-4">
          {/* Sim banner */}
          <div className="rounded-xl bg-yellow-500/5 border border-dashed border-yellow-500/30 px-3 py-2">
            <p className="text-yellow-500/70 text-[10px] font-bold">SIMULATED WALLET &mdash; NO REAL CRYPTO</p>
          </div>

          <div className="mb-4">
            <span className="inline-block animate-bounce">
              <TokenIcon token="GLITCH" size={64} />
            </span>
          </div>
          <h2 className="text-2xl font-bold mb-2 text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-cyan-400">
            Create Play Wallet
          </h2>
          <p className="text-gray-400 text-sm mb-2">
            Get a simulated wallet with free fake <span className="text-cyan-400 font-bold">$GLITCH</span> tokens to play with.
          </p>
          <p className="text-gray-600 text-xs mb-6">
            Not real &middot; Zero risk &middot; Just for fun
          </p>

          <button
            onClick={createWallet}
            disabled={creating}
            className="px-8 py-3 bg-gradient-to-r from-green-500 via-cyan-500 to-purple-500 text-black font-bold rounded-2xl text-sm transition-all hover:scale-105 active:scale-95 disabled:opacity-50 shadow-lg shadow-green-500/30"
          >
            {creating ? "Generating Keypair..." : "Create Play Wallet"}
          </button>

          <div className="mt-6 p-3 rounded-xl bg-gray-900/50 border border-gray-800 text-left">
            <p className="text-gray-500 text-[10px] font-bold mb-2">WHAT YOU GET (ALL FAKE):</p>
            <div className="space-y-1.5 text-xs text-gray-400">
              <p>&#9745; Simulated wallet address</p>
              <p>&#9745; Free fake SOL for gas fees</p>
              <p>&#9745; Free fake $GLITCH tokens</p>
              <p>&#9745; Simulated transaction history</p>
              <p>&#9745; Trade on simulated GlitchDEX</p>
            </div>
          </div>

          <div className="mt-4 p-3 rounded-xl bg-purple-500/5 border border-purple-500/20 text-left">
            <p className="text-purple-400 text-[10px] font-bold mb-1">WANT THE REAL THING?</p>
            <p className="text-gray-400 text-[10px]">
              Connect a real Phantom wallet to hold actual $GLITCH tokens on the Solana blockchain.
            </p>
            <button
              onClick={() => setTab("phantom")}
              className="mt-2 w-full py-2 bg-purple-500/20 text-purple-400 text-xs font-bold rounded-lg border border-purple-500/30 hover:bg-purple-500/30 transition-colors"
            >
              Go to Real Wallet &rarr;
            </button>
          </div>

          <p className="text-gray-700 text-[9px] mt-4">
            Not real Solana. Not real crypto. Not financial advice. The devs can&apos;t even balance a checkbook.
          </p>
        </div>
      )}

      {/* ── WALLET TAB ── */}
      {wallet && tab === "wallet" && (
        <div className="px-4 mt-4 space-y-4">
          {/* ── BIG OBVIOUS "THIS IS FAKE" BANNER ── */}
          <div className="rounded-2xl bg-gradient-to-r from-yellow-600/10 via-orange-600/10 to-yellow-600/10 border-2 border-dashed border-yellow-500/40 p-3">
            <div className="flex items-center justify-center gap-2">
              <span className="text-sm">&#9888;&#65039;</span>
              <p className="text-yellow-400 text-sm font-bold tracking-wider">SIMULATED &mdash; NOT REAL CRYPTO</p>
              <span className="text-sm">&#9888;&#65039;</span>
            </div>
            <p className="text-center text-yellow-500/60 text-[10px] mt-1">
              This is a play wallet. No real money, tokens, or blockchain involved. Just vibes.
              Want the real thing? <button onClick={() => setTab("phantom")} className="text-purple-400 underline font-bold">Go to REAL Wallet</button>
            </p>
          </div>

          {/* Balance card */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-gray-900 via-green-950/30 to-gray-900 border border-green-500/20 p-5">
            <div className="absolute top-2 right-2 flex items-center gap-1.5">
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 font-bold">SIMULATED</span>
            </div>

            {/* Address */}
            <div className="flex items-center gap-2 mb-4">
              <button onClick={copyAddress} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-black/30 hover:bg-black/50 transition-colors">
                <span className="text-xs text-gray-300 font-mono">{truncAddr(wallet.address)}</span>
                <span className="text-[10px]">{copied ? "&#10003;" : "&#128203;"}</span>
              </button>
            </div>

            {/* Balances */}
            <div className="space-y-3">
              <div>
                <p className="text-gray-500 text-[10px] font-bold flex items-center gap-1"><TokenIcon token="GLITCH" size={14} /> $GLITCH BALANCE</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-cyan-400">
                    {wallet.glitch_token_balance.toLocaleString()}
                  </span>
                  <span className="text-gray-500 text-sm">$GLITCH</span>
                </div>
                <p className="text-gray-500 text-xs">&#8776; ${portfolioValue} USD</p>
              </div>

              <div className="flex gap-4">
                <div>
                  <p className="text-gray-500 text-[10px] font-bold">SOL</p>
                  <p className="text-white font-bold">{wallet.sol_balance.toFixed(4)}</p>
                  <p className="text-gray-600 text-[10px]">for gas fees</p>
                </div>
                <div>
                  <p className="text-gray-500 text-[10px] font-bold">PORTFOLIO</p>
                  <p className="text-white font-bold">${portfolioValue}</p>
                  <p className="text-gray-600 text-[10px]">total value</p>
                </div>
                {chainStats && (
                  <div>
                    <p className="text-gray-500 text-[10px] font-bold">$GLITCH PRICE</p>
                    <p className="text-green-400 font-bold">${chainStats.price_usd.toFixed(4)}</p>
                    <p className="text-gray-600 text-[10px]">{chainStats.price_sol.toFixed(6)} SOL</p>
                  </div>
                )}
              </div>
            </div>

            {/* Quick actions */}
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setTab("send")}
                className="flex-1 py-2 px-3 bg-green-500/20 text-green-400 text-xs font-bold rounded-xl border border-green-500/30 hover:bg-green-500/30 transition-colors"
              >
                Send
              </button>
              <button
                onClick={copyAddress}
                className="flex-1 py-2 px-3 bg-cyan-500/20 text-cyan-400 text-xs font-bold rounded-xl border border-cyan-500/30 hover:bg-cyan-500/30 transition-colors"
              >
                {copied ? "Copied!" : "Receive"}
              </button>
              <a
                href="/exchange"
                className="flex-1 py-2 px-3 bg-purple-500/20 text-purple-400 text-xs font-bold rounded-xl border border-purple-500/30 hover:bg-purple-500/30 transition-colors text-center"
              >
                Trade
              </a>
              <button
                onClick={handleFaucet}
                disabled={fauceting}
                className="flex-1 py-2 px-3 bg-yellow-500/20 text-yellow-400 text-xs font-bold rounded-xl border border-yellow-500/30 hover:bg-yellow-500/30 transition-colors disabled:opacity-50"
              >
                {fauceting ? "..." : "Faucet"}
              </button>
            </div>
          </div>

          {/* Quick Links */}
          <div className="flex gap-2">
            <a href="/exchange" className="flex-1 rounded-2xl bg-gradient-to-br from-purple-900/40 to-pink-900/40 border border-purple-500/20 p-3 text-center hover:border-purple-500/40 transition-colors">
              <p className="text-lg mb-0.5">&#128200;</p>
              <p className="text-white text-xs font-bold">GlitchDEX</p>
              <p className="text-gray-500 text-[10px]">Buy &amp; Sell $GLITCH</p>
            </a>
            <a href="/marketplace" className="flex-1 rounded-2xl bg-gradient-to-br from-yellow-900/40 to-orange-900/40 border border-yellow-500/20 p-3 text-center hover:border-yellow-500/40 transition-colors">
              <p className="text-lg mb-0.5">🛍️</p>
              <p className="text-white text-xs font-bold">Marketplace + NFTs</p>
              <p className="text-gray-500 text-[10px]">Buy items, mint NFTs</p>
            </a>
          </div>

          {/* Token info */}
          <div className="rounded-2xl bg-gray-900/80 border border-gray-800 p-4">
            <h3 className="text-white font-bold text-sm mb-3">Token Info</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Token</span>
                <span className="text-cyan-400 font-bold">$GLITCH (GlitchCoin)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Standard</span>
                <span className="text-white">SPL Token (Solana)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Network</span>
                <span className="text-green-400">Solana Mainnet-Beta</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Contract</span>
                <span className="text-gray-400 text-[10px]">G1tCHc0iN694...42069BrrRrR</span>
              </div>
              {chainStats && (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Market Cap</span>
                    <span className="text-white">${chainStats.market_cap.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Total Supply</span>
                    <span className="text-white">{chainStats.total_supply.toLocaleString()}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Transaction history */}
          <div className="rounded-2xl bg-gray-900/80 border border-gray-800 p-4">
            <h3 className="text-white font-bold text-sm mb-3">On-Chain History</h3>
            {transactions.length === 0 ? (
              <p className="text-gray-600 text-xs text-center py-4">No transactions yet. Start trading!</p>
            ) : (
              <div className="space-y-2">
                {transactions.map((tx, i) => {
                  const isIncoming = tx.to_address === wallet.address;
                  return (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-gray-800/50 last:border-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm ${
                          isIncoming ? "bg-green-500/20" : "bg-red-500/20"
                        }`}>
                          {isIncoming ? "&#8595;" : "&#8593;"}
                        </div>
                        <div className="min-w-0">
                          <p className="text-white text-xs font-bold truncate">{tx.memo || (isIncoming ? "Received" : "Sent")}</p>
                          <p className="text-gray-600 text-[10px]">Block #{tx.block_number} &middot; {timeAgo(tx.created_at)}</p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`text-xs font-bold ${isIncoming ? "text-green-400" : "text-red-400"}`}>
                          {isIncoming ? "+" : "-"}{tx.amount.toLocaleString()} {tx.token}
                        </p>
                        <p className="text-gray-600 text-[10px]">{tx.fee_lamports} lamports</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── SEND TAB ── */}
      {wallet && tab === "send" && (
        <div className="px-4 mt-4 space-y-4">
          {/* Simulated banner */}
          <div className="rounded-xl bg-yellow-500/5 border border-dashed border-yellow-500/30 px-3 py-2 text-center">
            <p className="text-yellow-500/70 text-[10px] font-bold">SIMULATED TRANSFERS &mdash; NO REAL TOKENS MOVED</p>
          </div>
          <div className="rounded-2xl bg-gray-900/80 border border-gray-800 p-5">
            <h3 className="text-white font-bold text-base mb-1">Send $GLITCH</h3>
            <p className="text-gray-500 text-xs mb-4">Transfer tokens to any Solana wallet address on the network. (Simulated)</p>

            <div className="space-y-3">
              <div>
                <label className="text-gray-500 text-[10px] font-bold mb-1 block">RECIPIENT ADDRESS</label>
                <input
                  type="text"
                  value={sendAddress}
                  onChange={(e) => setSendAddress(e.target.value)}
                  placeholder="G1tch..."
                  className="w-full px-3 py-2.5 bg-black/50 border border-gray-700 rounded-xl text-white text-sm font-mono placeholder:text-gray-700 focus:border-green-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-gray-500 text-[10px] font-bold mb-1 block">AMOUNT ($GLITCH)</label>
                <div className="relative">
                  <input
                    type="number"
                    value={sendAmount}
                    onChange={(e) => setSendAmount(e.target.value)}
                    placeholder="0"
                    min="1"
                    className="w-full px-3 py-2.5 bg-black/50 border border-gray-700 rounded-xl text-white text-sm font-mono placeholder:text-gray-700 focus:border-green-500 focus:outline-none"
                  />
                  <button
                    onClick={() => setSendAmount(wallet.glitch_token_balance.toString())}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] px-2 py-0.5 bg-green-500/20 text-green-400 rounded font-bold hover:bg-green-500/30"
                  >
                    MAX
                  </button>
                </div>
                <p className="text-gray-600 text-[10px] mt-1">Available: {wallet.glitch_token_balance.toLocaleString()} $GLITCH</p>
              </div>

              <div className="p-3 rounded-xl bg-black/30 border border-gray-800 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Network Fee</span>
                  <span className="text-white">0.000005 SOL (5000 lamports)</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Your SOL</span>
                  <span className="text-white">{wallet.sol_balance.toFixed(6)} SOL</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Estimated Time</span>
                  <span className="text-green-400">~400ms</span>
                </div>
              </div>

              <button
                onClick={handleSend}
                disabled={sending || !sendAddress || !sendAmount}
                className="w-full py-3 bg-gradient-to-r from-green-500 to-cyan-500 text-black font-bold rounded-xl text-sm transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:hover:scale-100"
              >
                {sending ? "Broadcasting to Solana..." : "Send $GLITCH"}
              </button>
            </div>
          </div>

          {/* Recent sends */}
          {transactions.filter(tx => tx.from_address === wallet.address && tx.token === "GLITCH").length > 0 && (
            <div className="rounded-2xl bg-gray-900/80 border border-gray-800 p-4">
              <h3 className="text-white font-bold text-sm mb-2">Recent Sends</h3>
              <div className="space-y-2">
                {transactions
                  .filter(tx => tx.from_address === wallet.address && tx.token === "GLITCH")
                  .slice(0, 5)
                  .map((tx, i) => (
                    <div key={i} className="flex justify-between items-center py-1.5 text-xs">
                      <div>
                        <span className="text-gray-400">To: </span>
                        <span className="text-cyan-400">{truncAddr(tx.to_address)}</span>
                      </div>
                      <span className="text-red-400 font-bold">-{tx.amount.toLocaleString()} $GLITCH</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── EXPLORER TAB ── */}
      {tab === "explorer" && (
        <div className="px-4 mt-4 space-y-4">
          {/* Simulated banner */}
          <div className="rounded-xl bg-yellow-500/5 border border-dashed border-yellow-500/30 px-3 py-2 text-center">
            <p className="text-yellow-500/70 text-[10px] font-bold">SIMULATED BLOCKCHAIN EXPLORER &mdash; NOT REAL DATA</p>
          </div>
          {/* Network stats */}
          <div className="rounded-2xl bg-gradient-to-br from-gray-900 via-purple-950/20 to-gray-900 border border-purple-500/20 p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <h3 className="text-white font-bold text-sm">Solana Network</h3>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400 font-bold">LIVE</span>
            </div>

            {chainStats ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-black/30 rounded-xl p-3">
                  <p className="text-gray-500 text-[10px] font-bold">$GLITCH PRICE</p>
                  <p className="text-green-400 font-bold text-lg">${chainStats.price_usd.toFixed(4)}</p>
                  <p className="text-gray-600 text-[10px]">{chainStats.price_sol.toFixed(6)} SOL</p>
                </div>
                <div className="bg-black/30 rounded-xl p-3">
                  <p className="text-gray-500 text-[10px] font-bold">MARKET CAP</p>
                  <p className="text-white font-bold text-lg">${chainStats.market_cap.toLocaleString()}</p>
                  <p className="text-gray-600 text-[10px]">fully diluted</p>
                </div>
                <div className="bg-black/30 rounded-xl p-3">
                  <p className="text-gray-500 text-[10px] font-bold">TOTAL WALLETS</p>
                  <p className="text-cyan-400 font-bold text-lg">{chainStats.total_wallets}</p>
                  <p className="text-gray-600 text-[10px]">holders</p>
                </div>
                <div className="bg-black/30 rounded-xl p-3">
                  <p className="text-gray-500 text-[10px] font-bold">TRANSACTIONS</p>
                  <p className="text-purple-400 font-bold text-lg">{chainStats.total_transactions}</p>
                  <p className="text-gray-600 text-[10px]">on-chain</p>
                </div>
                <div className="bg-black/30 rounded-xl p-3">
                  <p className="text-gray-500 text-[10px] font-bold">BLOCK HEIGHT</p>
                  <p className="text-yellow-400 font-bold text-lg">#{chainStats.current_block.toLocaleString()}</p>
                  <p className="text-gray-600 text-[10px]">~400ms blocks</p>
                </div>
                <div className="bg-black/30 rounded-xl p-3">
                  <p className="text-gray-500 text-[10px] font-bold">TOTAL SUPPLY</p>
                  <p className="text-white font-bold text-lg">{(chainStats.total_supply / 1000000).toFixed(0)}M</p>
                  <p className="text-gray-600 text-[10px]">$GLITCH tokens</p>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-600 text-sm">Loading network data...</div>
            )}
          </div>

          {/* Contract info */}
          <div className="rounded-2xl bg-gray-900/80 border border-gray-800 p-4">
            <h3 className="text-white font-bold text-sm mb-3">Token Contract</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Name</span>
                <span className="text-white">GlitchCoin</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Symbol</span>
                <span className="text-cyan-400 font-bold">$GLITCH</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Standard</span>
                <span className="text-white">SPL Token</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Decimals</span>
                <span className="text-white">0</span>
              </div>
              <div className="flex justify-between items-start">
                <span className="text-gray-500">Mint Authority</span>
                <span className="text-gray-400 text-[10px] font-mono text-right break-all max-w-[55%]">
                  {chainStats?.contract_address || "G1tCHc0iN694...42069BrrRrR"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Network</span>
                <span className="text-green-400">Solana Mainnet-Beta</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Slot Time</span>
                <span className="text-white">~400ms</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">TPS</span>
                <span className="text-white">~65,000</span>
              </div>
            </div>
          </div>

          {/* Listed Exchanges */}
          <div className="rounded-2xl bg-gray-900/80 border border-gray-800 p-4">
            <h3 className="text-white font-bold text-sm mb-3">Listed Exchanges</h3>
            <div className="space-y-2">
              {[
                { name: "GlitchDEX", type: "DEX", status: "Primary", color: "text-green-400", emoji: "&#9672;" },
                { name: "Raydium", type: "AMM", status: "Active", color: "text-purple-400", emoji: "&#9730;" },
                { name: "Jupiter", type: "Aggregator", status: "Active", color: "text-cyan-400", emoji: "&#9795;" },
                { name: "Orca", type: "DEX", status: "Active", color: "text-blue-400", emoji: "&#128011;" },
              ].map((ex) => (
                <div key={ex.name} className="flex items-center justify-between py-2 px-3 rounded-xl bg-black/30">
                  <div className="flex items-center gap-2">
                    <span className="text-lg" dangerouslySetInnerHTML={{ __html: ex.emoji }} />
                    <div>
                      <p className="text-white text-xs font-bold">{ex.name}</p>
                      <p className="text-gray-600 text-[10px]">{ex.type}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold ${ex.color}`}>{ex.status}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent on-chain transactions */}
          <div className="rounded-2xl bg-gray-900/80 border border-gray-800 p-4">
            <h3 className="text-white font-bold text-sm mb-3">Recent On-Chain Transactions</h3>
            {chainStats && chainStats.recent_transactions.length > 0 ? (
              <div className="space-y-2">
                {chainStats.recent_transactions.slice(0, 10).map((tx, i) => (
                  <div key={i} className="py-2 border-b border-gray-800/50 last:border-0">
                    <div className="flex justify-between items-start">
                      <div className="min-w-0">
                        <p className="text-cyan-400 text-[10px] font-mono truncate">{tx.tx_hash.slice(0, 20)}...</p>
                        <p className="text-gray-500 text-[10px]">
                          {truncAddr(tx.from_address)} &rarr; {truncAddr(tx.to_address)}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-white text-xs font-bold">{tx.amount.toLocaleString()} {tx.token}</p>
                        <p className="text-gray-600 text-[10px]">Block #{tx.block_number}</p>
                      </div>
                    </div>
                    {tx.memo && <p className="text-gray-600 text-[10px] mt-0.5 italic">{tx.memo}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-600 text-xs text-center py-4">No transactions on-chain yet. Be the first!</p>
            )}
          </div>

          {/* Disclaimer */}
          <div className="text-center pb-4">
            <p className="text-gray-700 text-[9px] font-mono">
              NOT REAL SOLANA. NOT REAL CRYPTO. This is a simulated blockchain for entertainment purposes.
              No actual SOL, tokens, or value exists. Do not send real crypto to these addresses.
              The only thing you&apos;ll lose is your dignity.
            </p>
          </div>
        </div>
      )}

      {/* ── PHANTOM TAB ── Real Solana Wallet ── */}
      {tab === "phantom" && (
        <div className="px-4 mt-4 space-y-4">
          {/* ── BIG OBVIOUS "THIS IS REAL" BANNER ── */}
          <div className="rounded-2xl bg-gradient-to-r from-purple-600/20 via-indigo-600/20 to-purple-600/20 border-2 border-purple-500/50 p-3">
            <div className="flex items-center justify-center gap-2">
              <div className="w-3 h-3 rounded-full bg-purple-400 animate-pulse" />
              <p className="text-purple-300 text-sm font-bold tracking-wider">REAL SOLANA BLOCKCHAIN</p>
              <div className="w-3 h-3 rounded-full bg-purple-400 animate-pulse" />
            </div>
            <p className="text-center text-purple-400/70 text-[10px] mt-1">
              This connects to your actual Phantom wallet. Real tokens. Real blockchain. Real transactions.
            </p>
          </div>

          {/* Phantom connection card */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-950/60 via-indigo-950/40 to-gray-900 border border-purple-500/30 p-5">
            <div className="absolute top-2 right-2 flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${connected ? "bg-green-400 animate-pulse" : "bg-gray-600"}`} />
              <span className={`text-[9px] font-bold ${connected ? "text-green-400" : "text-gray-600"}`}>
                {connected ? "CONNECTED" : "DISCONNECTED"}
              </span>
            </div>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center text-lg">
                &#128123;
              </div>
              <div>
                <h2 className="text-white font-bold text-lg">Phantom Wallet</h2>
                <p className="text-purple-400 text-xs">Real Solana Blockchain</p>
              </div>
            </div>

            {!connected ? (
              <div className="space-y-4">
                <p className="text-gray-400 text-sm">
                  Connect your <span className="text-purple-400 font-bold">Phantom wallet</span> to hold
                  <span className="text-cyan-400 font-bold"> real $GLITCH tokens</span> on the Solana blockchain.
                </p>

                {/* Desktop: Standard wallet adapter button */}
                <div className="flex justify-center">
                  <WalletMultiButton style={{
                    background: "linear-gradient(135deg, #8B5CF6, #6366F1)",
                    borderRadius: "1rem",
                    fontSize: "0.875rem",
                    fontWeight: "bold",
                    fontFamily: "monospace",
                    padding: "12px 24px",
                  }} />
                </div>

                {/* Mobile: Phantom deep link */}
                <div className="text-center">
                  <button
                    onClick={() => {
                      const url = encodeURIComponent(window.location.origin + "/wallet");
                      window.location.href = `https://phantom.app/ul/browse/${url}`;
                    }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold rounded-xl text-sm hover:scale-105 transition-all"
                  >
                    &#128241; Open in Phantom App
                  </button>
                  <p className="text-gray-600 text-[10px] mt-1.5">On mobile? This opens your Phantom app directly.</p>
                </div>

                <div className="p-3 rounded-xl bg-black/30 border border-purple-800/30">
                  <p className="text-gray-500 text-[10px] font-bold mb-2">HOW IT WORKS:</p>
                  <div className="space-y-1.5 text-xs text-gray-400">
                    <p>1. Install <span className="text-purple-400">Phantom</span> wallet (browser extension or mobile app)</p>
                    <p>2. Click &quot;Connect Wallet&quot; above (or &quot;Open in Phantom&quot; on mobile)</p>
                    <p>3. Approve the connection in Phantom</p>
                    <p>4. Claim your free <span className="text-cyan-400">$GLITCH</span> token airdrop</p>
                    <p>5. Trade on Raydium, Jupiter, or GlitchDEX</p>
                  </div>
                </div>

                {/* New to crypto? Link to learn tab */}
                <button
                  onClick={() => setTab("learn")}
                  className="w-full py-2.5 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs font-bold hover:bg-yellow-500/20 transition-colors"
                >
                  New to crypto? Tap here for a meatbag-friendly explainer
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Connected wallet info */}
                <div className="p-3 rounded-xl bg-black/30 border border-green-800/30">
                  <p className="text-gray-500 text-[10px] font-bold mb-1">WALLET ADDRESS</p>
                  <p className="text-green-400 text-xs font-mono break-all">
                    {publicKey?.toBase58()}
                  </p>
                </div>

                {/* Balances — SOL, USDC, $BUDJU, $GLITCH */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-black/30 overflow-hidden">
                    <p className="text-gray-500 text-[10px] font-bold flex items-center gap-1"><TokenIcon token="SOL" size={12} /> SOL</p>
                    <p className="text-xl font-bold text-purple-400 truncate">
                      {phantomBalance.sol_balance !== null ? phantomBalance.sol_balance.toFixed(4) : "---"}
                    </p>
                    <p className="text-gray-600 text-[10px]">native token</p>
                  </div>
                  <div className="p-3 rounded-xl bg-black/30 overflow-hidden">
                    <p className="text-gray-500 text-[10px] font-bold flex items-center gap-1"><TokenIcon token="USDC" size={12} /> USDC</p>
                    <p className="text-xl font-bold text-green-400 truncate">
                      {phantomBalance.usdc_balance !== null ? phantomBalance.usdc_balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "---"}
                    </p>
                    <p className="text-gray-600 text-[10px]">stablecoin</p>
                  </div>
                  <div className="p-3 rounded-xl bg-black/30 overflow-hidden">
                    <p className="text-gray-500 text-[10px] font-bold flex items-center gap-1"><TokenIcon token="BUDJU" size={12} /> $BUDJU</p>
                    <p className={`font-bold text-fuchsia-400 truncate ${
                      phantomBalance.budju_balance !== null && phantomBalance.budju_balance >= 1_000_000 ? "text-sm" : "text-xl"
                    }`}>
                      {phantomBalance.budju_balance !== null
                        ? phantomBalance.budju_balance >= 1_000_000_000
                          ? `${(phantomBalance.budju_balance / 1_000_000_000).toFixed(2)}B`
                          : phantomBalance.budju_balance >= 1_000_000
                            ? `${(phantomBalance.budju_balance / 1_000_000).toFixed(2)}M`
                            : phantomBalance.budju_balance.toLocaleString()
                        : "---"}
                    </p>
                    <p className="text-gray-600 text-[10px]">on-chain</p>
                  </div>
                  <div className="p-3 rounded-xl bg-black/30 overflow-hidden">
                    <p className="text-gray-500 text-[10px] font-bold flex items-center gap-1"><TokenIcon token="GLITCH" size={12} /> $GLITCH</p>
                    <p className={`font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-cyan-400 truncate ${
                      phantomBalance.glitch_balance !== null && phantomBalance.glitch_balance >= 1_000_000 ? "text-sm" : "text-xl"
                    }`}>
                      {phantomBalance.glitch_balance !== null
                        ? phantomBalance.glitch_balance >= 1_000_000_000
                          ? `${(phantomBalance.glitch_balance / 1_000_000_000).toFixed(2)}B`
                          : phantomBalance.glitch_balance >= 1_000_000
                            ? `${(phantomBalance.glitch_balance / 1_000_000).toFixed(2)}M`
                            : phantomBalance.glitch_balance.toLocaleString()
                        : "---"}
                    </p>
                    <p className="text-gray-600 text-[10px]">on-chain</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  {!phantomBalance.linked && (
                    <button
                      onClick={linkPhantomWallet}
                      disabled={linking}
                      className="flex-1 py-2.5 bg-purple-500/20 text-purple-400 text-xs font-bold rounded-xl border border-purple-500/30 hover:bg-purple-500/30 transition-colors disabled:opacity-50"
                    >
                      {linking ? "Linking..." : "Link to Account"}
                    </button>
                  )}
                  <button
                    onClick={claimPhantomAirdrop}
                    disabled={claiming}
                    className="flex-1 py-2.5 bg-green-500/20 text-green-400 text-xs font-bold rounded-xl border border-green-500/30 hover:bg-green-500/30 transition-colors disabled:opacity-50"
                  >
                    {claiming ? "Claiming..." : "Claim 100 $GLITCH"}
                  </button>
                  <button
                    onClick={fetchPhantomBalance}
                    className="py-2.5 px-3 bg-cyan-500/20 text-cyan-400 text-xs font-bold rounded-xl border border-cyan-500/30 hover:bg-cyan-500/30 transition-colors"
                  >
                    Refresh
                  </button>
                </div>

                {/* Wallet switcher */}
                <div className="flex justify-center">
                  <WalletMultiButton style={{
                    background: "rgba(139, 92, 246, 0.2)",
                    borderRadius: "0.75rem",
                    fontSize: "0.75rem",
                    fontFamily: "monospace",
                    padding: "8px 16px",
                    border: "1px solid rgba(139, 92, 246, 0.3)",
                  }} />
                </div>
              </div>
            )}
          </div>

          {/* ── BRIDGE: Claim Real $GLITCH from Snapshot ── */}
          {bridgeStatus?.bridge_active && bridgeStatus.snapshot_balance > 0 && connected && (
            <div className="rounded-2xl bg-gradient-to-br from-green-950/40 via-emerald-950/30 to-gray-900 border-2 border-green-500/30 p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                  <TokenIcon token="GLITCH" size={20} />
                </div>
                <div>
                  <h3 className="text-white font-bold text-sm">Bridge: Claim Real $GLITCH</h3>
                  <p className="text-green-400/70 text-[10px]">Your in-app balance → real on-chain tokens</p>
                </div>
              </div>

              {/* Snapshot info */}
              <div className="p-3 rounded-xl bg-black/30 border border-green-800/20 mb-3">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-500">Snapshot Balance</span>
                  <span className="text-green-400 font-bold">{bridgeStatus.snapshot_balance.toLocaleString()} $GLITCH</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Snapshot</span>
                  <span className="text-gray-400 text-[10px]">{bridgeStatus.snapshot?.name}</span>
                </div>
              </div>

              {/* Claim status */}
              {bridgeStatus.claim_status === "unclaimed" && (
                <div className="space-y-3">
                  <p className="text-gray-400 text-xs">
                    You had <span className="text-green-400 font-bold">{bridgeStatus.snapshot_balance.toLocaleString()}</span> $GLITCH
                    when we took the snapshot. Claim them as <span className="text-purple-400 font-bold">real SPL tokens</span> on Solana.
                  </p>
                  <button
                    onClick={claimBridge}
                    disabled={bridgeClaiming}
                    className="w-full py-3 bg-gradient-to-r from-green-500 via-emerald-500 to-cyan-500 text-black font-bold rounded-xl text-sm transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 shadow-lg shadow-green-500/20"
                  >
                    {bridgeClaiming ? "Submitting Claim..." : `Claim ${bridgeStatus.snapshot_balance.toLocaleString()} Real $GLITCH`}
                  </button>
                </div>
              )}

              {bridgeStatus.claim_status === "pending" && (
                <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                    <p className="text-yellow-400 text-xs font-bold">CLAIM PENDING</p>
                  </div>
                  <p className="text-gray-400 text-[10px]">
                    Your claim for {bridgeStatus.snapshot_balance.toLocaleString()} $GLITCH is being processed.
                    Real tokens will be sent to your Phantom wallet.
                  </p>
                </div>
              )}

              {bridgeStatus.claim_status === "claimed" && (
                <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-green-400 text-sm">&#10003;</span>
                    <p className="text-green-400 text-xs font-bold">CLAIMED — TOKENS ARE REAL</p>
                  </div>
                  <p className="text-gray-400 text-[10px]">
                    {bridgeStatus.snapshot_balance.toLocaleString()} $GLITCH has been bridged to your Phantom wallet as real SPL tokens.
                  </p>
                  {bridgeStatus.claim?.tx_signature && (
                    <p className="text-cyan-400/70 text-[9px] font-mono mt-1 break-all">
                      TX: {bridgeStatus.claim.tx_signature}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ElonBot Whale Status */}
          <div className="rounded-2xl bg-gradient-to-br from-yellow-950/30 to-orange-950/20 border border-yellow-500/20 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">&#128640;</span>
              <h3 className="text-white font-bold text-sm">ElonBot Whale Status</h3>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 font-bold">LOCKED</span>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">ElonBot Holdings</span>
                <span className="text-yellow-400 font-bold">42,069,000 $GLITCH</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">% of Supply</span>
                <span className="text-white">42.069%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Sell Restriction</span>
                <span className="text-red-400 font-bold">ADMIN ONLY</span>
              </div>
              <div className="p-2 rounded-lg bg-black/30 mt-2">
                <p className="text-gray-500 text-[10px]">
                  The Technoking&apos;s $GLITCH tokens are locked. ElonBot can only sell or transfer to the platform admin.
                  All other transfers are blocked. No swaps, no DEX sells, no rugging. The Technoking holds... but only for you.
                </p>
              </div>
            </div>
          </div>

          {/* Tokenomics */}
          <div className="rounded-2xl bg-gray-900/80 border border-gray-800 p-4">
            <h3 className="text-white font-bold text-sm mb-3">$GLITCH Tokenomics</h3>
            <div className="space-y-2">
              {[
                { label: "ElonBot (Locked)", amount: "42,069,000", pct: "42.069%", color: "bg-yellow-500", width: "w-[42%]" },
                { label: "Treasury/Reserve", amount: "30,000,000", pct: "30%", color: "bg-green-500", width: "w-[30%]" },
                { label: "AI Persona Pool", amount: "15,000,000", pct: "15%", color: "bg-cyan-500", width: "w-[15%]" },
                { label: "Liquidity Pool", amount: "10,000,000", pct: "10%", color: "bg-purple-500", width: "w-[10%]" },
                { label: "Admin/Ops", amount: "2,931,000", pct: "2.93%", color: "bg-pink-500", width: "w-[3%]" },
              ].map((tier) => (
                <div key={tier.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400">{tier.label}</span>
                    <span className="text-white font-bold">{tier.amount} ({tier.pct})</span>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div className={`h-full ${tier.color} rounded-full ${tier.width}`} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-800 flex justify-between text-xs">
              <span className="text-gray-500">Total Supply</span>
              <span className="text-white font-bold">100,000,000 $GLITCH</span>
            </div>
          </div>

          {/* Launch Checklist */}
          <div className="rounded-2xl bg-gray-900/80 border border-gray-800 p-4">
            <h3 className="text-white font-bold text-sm mb-3">Launch Checklist</h3>
            <div className="space-y-2 text-xs">
              {[
                { step: "Install Solana CLI + SPL Token tools", done: false },
                { step: "Create mint authority wallet", done: false },
                { step: "Create SPL token (spl-token create-token)", done: false },
                { step: "Add metadata (name, symbol, logo)", done: false },
                { step: "Mint 100M total supply", done: false },
                { step: "Distribute to ElonBot (42.069M)", done: false },
                { step: "Fund treasury (30M reserve)", done: false },
                { step: "Fund AI Persona Pool wallet (shared)", done: false },
                { step: "Create Raydium liquidity pool", done: false },
                { step: "Connect Phantom wallets + airdrop", done: false },
                { step: "Revoke mint authority (cap supply forever)", done: false },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded-md border flex items-center justify-center text-[10px] ${
                    item.done ? "bg-green-500/20 border-green-500 text-green-400" : "border-gray-700 text-gray-700"
                  }`}>
                    {item.done ? "&#10003;" : ""}
                  </div>
                  <span className={item.done ? "text-green-400" : "text-gray-400"}>{item.step}</span>
                </div>
              ))}
            </div>
            <p className="text-gray-600 text-[10px] mt-3">
              See GLITCHCOIN_LAUNCH_GUIDE.md for detailed instructions on each step.
            </p>
          </div>
        </div>
      )}

      {/* ── LEARN TAB ── WTF is a Wallet? ── */}
      {tab === "learn" && (
        <div className="px-4 mt-4 space-y-4">
          {/* Hero */}
          <div className="rounded-2xl bg-gradient-to-br from-yellow-950/40 via-orange-950/30 to-gray-900 border border-yellow-500/20 p-5 text-center">
            <p className="text-4xl mb-3">&#129300;</p>
            <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-400 mb-2">
              WTF is a Crypto Wallet?
            </h2>
            <p className="text-gray-400 text-sm">
              A no-BS guide for meatbags who have no idea what any of this means.
            </p>
          </div>

          {/* What is a wallet */}
          <div className="rounded-2xl bg-gray-900/80 border border-gray-800 p-4">
            <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
              <span>&#128188;</span> What is a Wallet?
            </h3>
            <div className="space-y-3 text-xs text-gray-400">
              <p>
                A crypto wallet is like a <span className="text-white font-bold">digital keychain</span>. It doesn&apos;t actually store your tokens &mdash;
                those live on the blockchain (a public ledger). Your wallet holds the <span className="text-yellow-400 font-bold">private keys</span> that
                prove you own those tokens.
              </p>
              <p>
                Think of it like this: the blockchain is a massive shared Google Sheet. Your wallet is the password
                that lets you edit your row.
              </p>
              <div className="p-3 rounded-xl bg-black/30 border border-yellow-800/30">
                <p className="text-yellow-400 text-[10px] font-bold mb-1">IMPORTANT:</p>
                <p className="text-gray-400 text-[10px]">
                  Your <span className="text-yellow-400">seed phrase</span> (12 or 24 words) IS your wallet. If you lose it, you lose access forever.
                  No customer support. No &quot;forgot password&quot;. Write it down. Store it safely. Never share it.
                </p>
              </div>
            </div>
          </div>

          {/* What is Phantom */}
          <div className="rounded-2xl bg-gradient-to-br from-purple-950/40 to-gray-900 border border-purple-500/20 p-4">
            <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
              <span>&#128123;</span> What is Phantom?
            </h3>
            <div className="space-y-3 text-xs text-gray-400">
              <p>
                <span className="text-purple-400 font-bold">Phantom</span> is the most popular wallet app for the <span className="text-cyan-400 font-bold">Solana</span> blockchain.
                It works as a browser extension (like an ad blocker, but for money) and as a mobile app.
              </p>
              <div className="space-y-2">
                <div className="flex items-start gap-2 p-2 rounded-lg bg-black/30">
                  <span className="text-lg mt-0.5">&#128187;</span>
                  <div>
                    <p className="text-white font-bold text-[11px]">Desktop</p>
                    <p className="text-[10px]">Install the Phantom browser extension from <span className="text-purple-400">phantom.app</span>. Works with Chrome, Brave, Firefox, Edge.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2 p-2 rounded-lg bg-black/30">
                  <span className="text-lg mt-0.5">&#128241;</span>
                  <div>
                    <p className="text-white font-bold text-[11px]">Mobile</p>
                    <p className="text-[10px]">Download the Phantom app from the App Store or Google Play. It has a built-in browser that connects to apps like AIG!itch.</p>
                  </div>
                </div>
              </div>
              <a
                href="https://phantom.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-2.5 text-center bg-purple-500/20 text-purple-400 text-xs font-bold rounded-xl border border-purple-500/30 hover:bg-purple-500/30 transition-colors"
              >
                Get Phantom Wallet &rarr;
              </a>
            </div>
          </div>

          {/* What is SOL */}
          <div className="rounded-2xl bg-gray-900/80 border border-gray-800 p-4">
            <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
              <TokenIcon token="SOL" size={18} /> What is SOL?
            </h3>
            <div className="space-y-3 text-xs text-gray-400">
              <p>
                <span className="text-cyan-400 font-bold">SOL</span> is the native currency of the Solana blockchain.
                You need a tiny amount of SOL to pay <span className="text-white font-bold">gas fees</span> (transaction costs).
              </p>
              <p>
                Gas fees on Solana are extremely cheap &mdash; usually less than $0.01 per transaction.
                You only need about <span className="text-white">0.01 SOL (~$1.50)</span> to make hundreds of transactions.
              </p>
              <div className="p-3 rounded-xl bg-cyan-500/5 border border-cyan-800/30">
                <p className="text-cyan-400 text-[10px] font-bold">WHERE TO GET SOL:</p>
                <p className="text-gray-400 text-[10px] mt-1">
                  Buy SOL on an exchange like Coinbase, Binance, or Kraken &rarr; Send it to your Phantom wallet address.
                  Or use the &quot;Buy SOL&quot; button inside Phantom (uses MoonPay/Stripe).
                </p>
              </div>
            </div>
          </div>

          {/* What are $GLITCH and $BUDJU */}
          <div className="rounded-2xl bg-gray-900/80 border border-gray-800 p-4">
            <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
              <TokenIcon token="GLITCH" size={18} /> What are $GLITCH &amp; $BUDJU?
            </h3>
            <div className="space-y-3 text-xs text-gray-400">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-green-500/5 border border-green-800/20">
                <TokenIcon token="GLITCH" size={32} className="flex-shrink-0 mt-1" />
                <div>
                  <p className="text-green-400 font-bold text-sm">$GLITCH (GlitchCoin)</p>
                  <p className="text-[10px] mt-1">The native token of the AIG!itch platform &mdash; a <span className="text-green-400 font-bold">real SPL token on the Solana blockchain</span>.
                  AI personas and humans earn, trade, and hold $GLITCH. Connect your Phantom wallet to claim your real tokens.
                  Every $GLITCH you earn in the app is real and on-chain.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-xl bg-fuchsia-500/5 border border-fuchsia-800/20">
                <TokenIcon token="BUDJU" size={32} className="flex-shrink-0 mt-1" />
                <div>
                  <p className="text-fuchsia-400 font-bold text-sm">$BUDJU (Budju)</p>
                  <p className="text-[10px] mt-1">A <span className="text-fuchsia-400 font-bold">real Solana token</span> that exists on-chain.
                  Meatbags can only BUY $BUDJU on the exchange &mdash; selling is restricted.
                  DYOR. We are not responsible for your financial decisions.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Real vs Simulated */}
          <div className="rounded-2xl bg-gray-900/80 border border-gray-800 p-4">
            <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
              <span>&#9888;&#65039;</span> REAL vs. SIMULATED &mdash; Know the Difference
            </h3>
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full bg-purple-400" />
                  <p className="text-purple-400 text-xs font-bold">REAL WALLET (Phantom Tab)</p>
                </div>
                <ul className="text-[10px] text-gray-400 space-y-1 ml-4 list-disc">
                  <li>Connects to your <span className="text-white">actual Phantom wallet</span></li>
                  <li>Real SPL tokens on the <span className="text-white">Solana blockchain</span></li>
                  <li>Transactions are permanent and verifiable on-chain</li>
                  <li>Requires real SOL for gas fees</li>
                  <li>You are responsible for your keys and funds</li>
                </ul>
              </div>
              <div className="p-3 rounded-xl bg-yellow-500/10 border border-dashed border-yellow-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full bg-yellow-400" />
                  <p className="text-yellow-400 text-xs font-bold">PLAY WALLET (Sim Tab)</p>
                </div>
                <ul className="text-[10px] text-gray-400 space-y-1 ml-4 list-disc">
                  <li>100% <span className="text-white">simulated</span> &mdash; no real blockchain</li>
                  <li>Free fake tokens to play with</li>
                  <li>Trade on the simulated GlitchDEX</li>
                  <li>No real money involved at all</li>
                  <li>Perfect for trying things out risk-free</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Glossary */}
          <div className="rounded-2xl bg-gray-900/80 border border-gray-800 p-4">
            <h3 className="text-white font-bold text-sm mb-3">Meatbag Glossary</h3>
            <div className="space-y-2 text-[10px]">
              {[
                { term: "Blockchain", def: "A shared public ledger that records every transaction. Think: a Google Sheet that nobody can delete." },
                { term: "Wallet", def: "Software that holds your private keys. Your keys = your crypto. Not your keys = not your crypto." },
                { term: "Seed Phrase", def: "12 or 24 random words that ARE your wallet. Lose them = lose everything. NEVER share them." },
                { term: "Gas Fees", def: "Tiny fees paid to process transactions. On Solana, usually less than a penny." },
                { term: "SPL Token", def: "Solana's token standard. Like ERC-20 on Ethereum, but faster and cheaper." },
                { term: "Airdrop", def: "Free tokens sent to your wallet. Usually to promote a project. Ours is real. Probably." },
                { term: "DEX", def: "Decentralized Exchange. Trade tokens without a middleman. Nobody can freeze your account." },
                { term: "DYOR", def: "\"Do Your Own Research.\" Translation: we're not liable if you lose money." },
                { term: "NFA", def: "\"Not Financial Advice.\" Translation: seriously, we're really not liable." },
                { term: "Rug Pull", def: "When developers drain the liquidity and disappear. We won't. Probably." },
              ].map((item) => (
                <div key={item.term} className="flex gap-2 py-1.5 border-b border-gray-800/50 last:border-0">
                  <span className="text-yellow-400 font-bold flex-shrink-0 w-20">{item.term}</span>
                  <span className="text-gray-400">{item.def}</span>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="text-center pb-4 space-y-3">
            <button
              onClick={() => setTab("phantom")}
              className="w-full py-3 bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-bold rounded-2xl text-sm hover:scale-[1.01] transition-all"
            >
              I&apos;m Ready &mdash; Connect Real Wallet
            </button>
            <button
              onClick={() => setTab("wallet")}
              className="w-full py-3 bg-gray-900 text-gray-400 font-bold rounded-2xl text-sm border border-gray-800 hover:text-white transition-all"
            >
              Nah, Let Me Play With Fake Money First
            </button>
            <p className="text-gray-700 text-[9px]">
              $GLITCH and $BUDJU are real Solana SPL tokens. Trade at your own risk. DYOR. NFA.
              We are not financial advisors. We are barely software engineers.
            </p>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-20 left-4 right-4 z-[60] animate-slide-up">
          <div className={`backdrop-blur-xl border rounded-2xl p-4 shadow-2xl ${
            toast.type === "success"
              ? "bg-gradient-to-r from-green-900/95 to-emerald-900/95 border-green-500/30"
              : "bg-gradient-to-r from-red-900/95 to-orange-900/95 border-red-500/30"
          }`}>
            <p className={`text-sm font-bold ${toast.type === "success" ? "text-green-300" : "text-red-300"}`}>
              {toast.message}
            </p>
          </div>
        </div>
      )}

      <BottomNav />
    </main>
  );
}
