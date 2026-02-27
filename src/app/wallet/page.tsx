"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import BottomNav from "@/components/BottomNav";
import TokenIcon from "@/components/TokenIcon";
import { VersionedTransaction, Connection } from "@solana/web3.js";

// Token mint addresses for Jupiter swap
const MINT_ADDRESSES: Record<string, string> = {
  SOL: "So11111111111111111111111111111111111111112",
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  GLITCH: "5hfHCmaL6e9bvruy35RQyghMXseTE2mXJ7ukqKAcS8fT",
  BUDJU: "2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump",
};

const TOKEN_DECIMALS: Record<string, number> = {
  SOL: 9,
  USDC: 6,
  GLITCH: 9,
  BUDJU: 9,
};

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

interface JupiterQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct: string;
  routePlan: { swapInfo: { label: string } }[];
}

type ConnectedTab = "wallet" | "swap";
type DisconnectedTab = "connect" | "play" | "learn";

export default function WalletPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [transactions, setTransactions] = useState<BlockchainTx[]>([]);
  const [chainStats, setChainStats] = useState<ChainStats | null>(null);

  // Connected wallet tabs
  const [connectedTab, setConnectedTab] = useState<ConnectedTab>("wallet");
  // Disconnected tabs
  const [disconnectedTab, setDisconnectedTab] = useState<DisconnectedTab>("connect");

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
  const [airdropClaimed, setAirdropClaimed] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus | null>(null);
  const [bridgeClaiming, setBridgeClaiming] = useState(false);
  const [balancesLoading, setBalancesLoading] = useState(true);
  // Track app-claimed $GLITCH (from DB, not on-chain)
  const [appGlitchBalance, setAppGlitchBalance] = useState(0);

  // Jupiter swap state
  const [swapInputToken, setSwapInputToken] = useState("SOL");
  const [swapOutputToken, setSwapOutputToken] = useState("GLITCH");
  const [swapAmount, setSwapAmount] = useState("");
  const [swapQuote, setSwapQuote] = useState<JupiterQuote | null>(null);
  const [swapLoading, setSwapLoading] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const quoteTimeout = useRef<NodeJS.Timeout | null>(null);

  const { publicKey, connected, signMessage, signTransaction, connect, select, wallets, sendTransaction } = useWallet();

  useEffect(() => {
    if (typeof window !== "undefined") {
      setSessionId(localStorage.getItem("aiglitch-session"));
    }
  }, []);

  // Auto-connect Phantom when inside Phantom's in-app browser
  useEffect(() => {
    if (connected || typeof window === "undefined") return;
    const tryAutoConnect = async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      const isPhantomAvailable = w.phantom?.solana?.isPhantom || w.solana?.isPhantom;
      if (!isPhantomAvailable) return;
      const phantomWallet = wallets.find(wal => wal.adapter.name === "Phantom");
      if (phantomWallet) {
        try {
          select(phantomWallet.adapter.name);
          await new Promise(r => setTimeout(r, 300));
          await connect();
        } catch { /* ignore */ }
      }
    };
    const timer = setTimeout(tryAutoConnect, 500);
    return () => clearTimeout(timer);
  }, [connected, wallets, select, connect]);

  // Link Phantom wallet to account when connected
  // silent=true suppresses error toasts (used for auto-link on connect)
  const linkPhantomWallet = useCallback(async (silent = false) => {
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
      } else if (data.error && !silent) {
        showToast("error", data.error);
      }
    } catch {
      if (!silent) {
        showToast("error", "Failed to link Phantom wallet");
      }
    } finally {
      setLinking(false);
    }
  }, [sessionId, publicKey, linking]);

  // Fetch app $GLITCH balance instantly from DB (fast, no blockchain call)
  const fetchAppBalance = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/coins?session_id=${encodeURIComponent(sessionId)}`);
      const data = await res.json();
      if (data.balance !== undefined) {
        const bal = Number(data.balance);
        setAppGlitchBalance(bal);
        // Also immediately show in phantom balance so it's not "---"
        setPhantomBalance(prev => ({
          ...prev,
          glitch_balance: Math.max(prev.glitch_balance || 0, bal),
          linked: true,
        }));
      }
      // Check if airdrop was already claimed by looking at transactions
      if (data.transactions) {
        const hasAirdrop = data.transactions.some((t: { reason: string }) =>
          t.reason === "Phantom wallet airdrop" || t.reason === "claim_signup"
        );
        if (hasAirdrop) setAirdropClaimed(true);
      }
    } catch { /* ignore */ }
  }, [sessionId]);

  // Fetch real on-chain balances (slow - blockchain RPC call)
  const fetchPhantomBalance = useCallback(async () => {
    if (!publicKey) {
      setBalancesLoading(false);
      return;
    }
    setBalancesLoading(true);
    try {
      const url = `/api/solana?action=balance&wallet_address=${publicKey.toBase58()}${sessionId ? `&session_id=${encodeURIComponent(sessionId)}` : ""}`;
      const res = await fetch(url);
      const data = await res.json();
      setPhantomBalance(prev => ({
        sol_balance: data.sol_balance ?? prev.sol_balance ?? 0,
        glitch_balance: data.glitch_balance ?? prev.glitch_balance ?? 0,
        budju_balance: data.budju_balance ?? prev.budju_balance ?? 0,
        usdc_balance: data.usdc_balance ?? prev.usdc_balance ?? 0,
        linked: true,
      }));
      if (data.app_glitch_balance) {
        setAppGlitchBalance(data.app_glitch_balance);
      }
    } catch {
      // On error, set balances to 0 so they don't stay as "---"
      setPhantomBalance(prev => ({
        sol_balance: prev.sol_balance ?? 0,
        glitch_balance: prev.glitch_balance ?? 0,
        budju_balance: prev.budju_balance ?? 0,
        usdc_balance: prev.usdc_balance ?? 0,
        linked: prev.linked,
      }));
    }
    setBalancesLoading(false);
  }, [publicKey, sessionId]);

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
        setAirdropClaimed(true);
        // Immediately update local balance
        const claimed = data.amount || 100;
        setAppGlitchBalance(prev => prev + claimed);
        setPhantomBalance(prev => ({
          ...prev,
          glitch_balance: (prev.glitch_balance || 0) + claimed,
        }));
        // Also refresh from server after delay
        setTimeout(fetchPhantomBalance, 2000);
      } else {
        // "Already claimed" means it was claimed before
        if (data.already_claimed) {
          setAirdropClaimed(true);
        }
        showToast("error", data.error || "Claim failed");
      }
    } catch {
      showToast("error", "Failed to claim airdrop");
    } finally {
      setClaiming(false);
    }
  }, [sessionId, publicKey, claiming, fetchPhantomBalance]);

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

  // Fetch app balance IMMEDIATELY (fast DB call), then on-chain balances in background
  useEffect(() => {
    if (sessionId) {
      fetchAppBalance();
    }
  }, [sessionId, fetchAppBalance]);

  useEffect(() => {
    if (connected && publicKey) {
      fetchPhantomBalance();
      // Auto-link wallet (silent — don't show error toasts for background linking)
      if (sessionId && !phantomBalance.linked) {
        linkPhantomWallet(true);
      }
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
      showToast("error", "Sign up first!");
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

  const copyAddress = (addr?: string) => {
    const address = addr || publicKey?.toBase58() || wallet?.address;
    if (address) {
      navigator.clipboard.writeText(address);
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

  // ── Jupiter Swap Functions ──

  const getTokenBalance = (token: string): number => {
    if (!phantomBalance) return 0;
    switch (token) {
      case "SOL": return phantomBalance.sol_balance || 0;
      case "USDC": return phantomBalance.usdc_balance || 0;
      case "GLITCH": return phantomBalance.glitch_balance || 0;
      case "BUDJU": return phantomBalance.budju_balance || 0;
      default: return 0;
    }
  };

  const fetchJupiterQuote = useCallback(async (inputToken: string, outputToken: string, amount: string) => {
    if (!amount || parseFloat(amount) <= 0) {
      setSwapQuote(null);
      return;
    }

    const inputMint = MINT_ADDRESSES[inputToken];
    const outputMint = MINT_ADDRESSES[outputToken];
    if (!inputMint || !outputMint) return;

    const decimals = TOKEN_DECIMALS[inputToken] || 9;
    const amountLamports = Math.floor(parseFloat(amount) * Math.pow(10, decimals));

    setSwapLoading(true);
    try {
      const res = await fetch(
        `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountLamports}&slippageBps=100`
      );
      if (res.ok) {
        const quote = await res.json();
        setSwapQuote(quote);
      } else {
        setSwapQuote(null);
      }
    } catch {
      setSwapQuote(null);
    }
    setSwapLoading(false);
  }, []);

  // Auto-fetch quote when amount changes
  useEffect(() => {
    if (quoteTimeout.current) clearTimeout(quoteTimeout.current);
    if (!swapAmount || parseFloat(swapAmount) <= 0) {
      setSwapQuote(null);
      return;
    }
    quoteTimeout.current = setTimeout(() => {
      fetchJupiterQuote(swapInputToken, swapOutputToken, swapAmount);
    }, 500);
    return () => { if (quoteTimeout.current) clearTimeout(quoteTimeout.current); };
  }, [swapAmount, swapInputToken, swapOutputToken, fetchJupiterQuote]);

  const executeSwap = async () => {
    if (!swapQuote || !publicKey || !signTransaction || swapping) return;

    setSwapping(true);
    try {
      // Get serialized swap transaction from Jupiter
      const swapRes = await fetch("https://quote-api.jup.ag/v6/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteResponse: swapQuote,
          userPublicKey: publicKey.toBase58(),
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: "auto",
        }),
      });
      const { swapTransaction, error } = await swapRes.json();
      if (error) {
        showToast("error", error);
        setSwapping(false);
        return;
      }

      // Deserialize and sign
      const transactionBuf = Buffer.from(swapTransaction, "base64");
      const transaction = VersionedTransaction.deserialize(transactionBuf);
      const signed = await signTransaction(transaction);

      // Send to network
      const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
      const txid = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: true,
        maxRetries: 2,
      });

      showToast("success", `Swap successful! TX: ${txid.slice(0, 12)}...`);
      setSwapAmount("");
      setSwapQuote(null);

      // Refresh balances after swap
      setTimeout(fetchPhantomBalance, 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Swap failed";
      if (msg.includes("User rejected")) {
        showToast("error", "Transaction cancelled");
      } else {
        showToast("error", msg);
      }
    } finally {
      setSwapping(false);
    }
  };

  const swapTokenPair = () => {
    const temp = swapInputToken;
    setSwapInputToken(swapOutputToken);
    setSwapOutputToken(temp);
    setSwapAmount("");
    setSwapQuote(null);
  };

  const outputDecimals = TOKEN_DECIMALS[swapOutputToken] || 9;
  const swapOutputAmount = swapQuote
    ? (parseInt(swapQuote.outAmount) / Math.pow(10, outputDecimals))
    : 0;

  // Format balance for display
  const formatBalance = (val: number | null, token: string): string => {
    if (val === null) return "---";
    if (token === "SOL") return val.toFixed(4);
    if (token === "USDC") return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(2)}B`;
    if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(2)}M`;
    return val.toLocaleString();
  };

  // ── Effective $GLITCH balance (max of on-chain and app) ──
  const effectiveGlitchBalance = Math.max(phantomBalance.glitch_balance || 0, appGlitchBalance);

  // ════════════════════════════════════
  // ══ CONNECTED VIEW (Phantom active) ══
  // ════════════════════════════════════
  if (connected && publicKey) {
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
            </div>
            <a href="/exchange" className="text-xs px-2 py-1 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors">
              Trade
            </a>
          </div>

          {/* Connected tabs: Wallet | Swap */}
          <div className="flex gap-2 px-4 pb-3">
            <button
              onClick={() => setConnectedTab("wallet")}
              className={`flex-1 text-xs py-2 rounded-full font-bold transition-all ${
                connectedTab === "wallet"
                  ? "bg-gradient-to-r from-purple-500 to-indigo-500 text-white"
                  : "bg-gray-900 text-gray-400 hover:text-white"
              }`}
            >
              Wallet
            </button>
            <button
              onClick={() => setConnectedTab("swap")}
              className={`flex-1 text-xs py-2 rounded-full font-bold transition-all ${
                connectedTab === "swap"
                  ? "bg-gradient-to-r from-green-500 to-cyan-500 text-black"
                  : "bg-gray-900 text-gray-400 hover:text-white"
              }`}
            >
              Swap
            </button>
          </div>
        </div>

        {/* ── WALLET TAB ── */}
        {connectedTab === "wallet" && (
          <div className="px-4 mt-4 space-y-4">
            {/* Wallet address */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => copyAddress()}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-900/80 border border-gray-700 hover:border-purple-500/50 transition-all"
              >
                <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center text-xs">&#128123;</div>
                <span className="text-sm text-purple-400 font-mono">{truncAddr(publicKey.toBase58())}</span>
                <span className="text-[10px] text-gray-500">{copied ? "Copied!" : "Copy"}</span>
              </button>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-[10px] text-green-400 font-bold">CONNECTED</span>
              </div>
            </div>

            {/* Balance Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-2xl bg-gradient-to-br from-gray-900 to-gray-900/80 border border-gray-700/50">
                <p className="text-gray-400 text-[10px] font-bold flex items-center gap-1"><TokenIcon token="SOL" size={14} /> SOL</p>
                <p className="text-2xl font-bold text-purple-400 mt-1">
                  {balancesLoading && phantomBalance.sol_balance === null ? (
                    <span className="text-gray-600 animate-pulse">---</span>
                  ) : formatBalance(phantomBalance.sol_balance, "SOL")}
                </p>
                <p className="text-gray-600 text-[10px]">native token</p>
              </div>
              <div className="p-4 rounded-2xl bg-gradient-to-br from-gray-900 to-gray-900/80 border border-gray-700/50">
                <p className="text-gray-400 text-[10px] font-bold flex items-center gap-1"><TokenIcon token="USDC" size={14} /> USDC</p>
                <p className="text-2xl font-bold text-green-400 mt-1">
                  {balancesLoading && phantomBalance.usdc_balance === null ? (
                    <span className="text-gray-600 animate-pulse">---</span>
                  ) : formatBalance(phantomBalance.usdc_balance, "USDC")}
                </p>
                <p className="text-gray-600 text-[10px]">stablecoin</p>
              </div>
              <div className="p-4 rounded-2xl bg-gradient-to-br from-gray-900 to-gray-900/80 border border-gray-700/50">
                <p className="text-gray-400 text-[10px] font-bold flex items-center gap-1"><TokenIcon token="BUDJU" size={14} /> $BUDJU</p>
                <p className={`font-bold text-fuchsia-400 mt-1 ${
                  (phantomBalance.budju_balance || 0) >= 1_000_000 ? "text-lg" : "text-2xl"
                }`}>
                  {balancesLoading && phantomBalance.budju_balance === null ? (
                    <span className="text-gray-600 animate-pulse">---</span>
                  ) : formatBalance(phantomBalance.budju_balance, "BUDJU")}
                </p>
                <p className="text-gray-600 text-[10px]">on-chain</p>
              </div>
              <div className="p-4 rounded-2xl bg-gradient-to-br from-gray-900 to-green-950/20 border border-green-500/20">
                <p className="text-gray-400 text-[10px] font-bold flex items-center gap-1"><TokenIcon token="GLITCH" size={14} /> $GLITCH</p>
                <p className={`font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-cyan-400 mt-1 ${
                  effectiveGlitchBalance >= 1_000_000 ? "text-lg" : "text-2xl"
                }`}>
                  {balancesLoading && phantomBalance.glitch_balance === null && appGlitchBalance === 0 ? (
                    <span className="text-gray-600 animate-pulse">---</span>
                  ) : formatBalance(effectiveGlitchBalance, "GLITCH")}
                </p>
                <p className="text-gray-600 text-[10px]">
                  {effectiveGlitchBalance > 0 && (phantomBalance.glitch_balance || 0) === 0 ? "in-app" : "on-chain"}
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              {!airdropClaimed && (
                <button
                  onClick={claimPhantomAirdrop}
                  disabled={claiming}
                  className="flex-1 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-black text-sm font-bold rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                >
                  {claiming ? "Claiming..." : "Claim 100 $GLITCH"}
                </button>
              )}
              <button
                onClick={() => { fetchPhantomBalance(); fetchAppBalance(); }}
                className={`py-3 px-4 bg-gray-900 text-cyan-400 text-sm font-bold rounded-xl border border-gray-700 hover:border-cyan-500/50 transition-all ${airdropClaimed ? "flex-1" : ""}`}
              >
                Refresh
              </button>
            </div>

            {/* Quick swap shortcut */}
            <button
              onClick={() => setConnectedTab("swap")}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-purple-500/10 to-indigo-500/10 border border-purple-500/20 hover:border-purple-500/40 transition-all flex items-center justify-center gap-2"
            >
              <span className="text-purple-400 text-sm font-bold">Swap Tokens</span>
              <span className="text-gray-500 text-xs">Buy &amp; Sell with Phantom</span>
            </button>

            {/* Bridge Claim */}
            {bridgeStatus?.bridge_active && bridgeStatus.snapshot_balance > 0 && (
              <div className="rounded-2xl bg-gradient-to-br from-green-950/40 via-emerald-950/30 to-gray-900 border border-green-500/30 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <TokenIcon token="GLITCH" size={20} />
                  <h3 className="text-white font-bold text-sm">Bridge: Claim Real $GLITCH</h3>
                </div>
                <div className="p-3 rounded-xl bg-black/30 border border-green-800/20 mb-3">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Snapshot Balance</span>
                    <span className="text-green-400 font-bold">{bridgeStatus.snapshot_balance.toLocaleString()} $GLITCH</span>
                  </div>
                </div>
                {bridgeStatus.claim_status === "unclaimed" && (
                  <button
                    onClick={claimBridge}
                    disabled={bridgeClaiming}
                    className="w-full py-3 bg-gradient-to-r from-green-500 via-emerald-500 to-cyan-500 text-black font-bold rounded-xl text-sm transition-all hover:scale-[1.01] disabled:opacity-50"
                  >
                    {bridgeClaiming ? "Submitting..." : `Claim ${bridgeStatus.snapshot_balance.toLocaleString()} Real $GLITCH`}
                  </button>
                )}
                {bridgeStatus.claim_status === "pending" && (
                  <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                    <p className="text-yellow-400 text-xs font-bold flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" /> CLAIM PENDING
                    </p>
                  </div>
                )}
                {bridgeStatus.claim_status === "claimed" && (
                  <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                    <p className="text-green-400 text-xs font-bold">CLAIMED</p>
                  </div>
                )}
              </div>
            )}

            {/* Spacer */}
            <div className="h-2" />
          </div>
        )}

        {/* ── SWAP TAB ── In-App Jupiter Swap ── */}
        {connectedTab === "swap" && (
          <div className="px-4 mt-4 space-y-4">
            {/* Balance strip */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {[
                { token: "SOL", balance: phantomBalance.sol_balance, color: "text-purple-400" },
                { token: "USDC", balance: phantomBalance.usdc_balance, color: "text-green-400" },
                { token: "GLITCH", balance: effectiveGlitchBalance, color: "text-cyan-400" },
                { token: "BUDJU", balance: phantomBalance.budju_balance, color: "text-fuchsia-400" },
              ].map(({ token, balance, color }) => (
                <div key={token} className="flex-shrink-0 px-3 py-2 rounded-xl bg-gray-900/80 border border-gray-800">
                  <p className="text-[9px] text-gray-500 flex items-center gap-1"><TokenIcon token={token} size={10} /> {token}</p>
                  <p className={`text-xs font-bold ${color}`}>{formatBalance(balance, token)}</p>
                </div>
              ))}
            </div>

            {/* Swap Card */}
            <div className="rounded-2xl bg-gradient-to-br from-gray-900 via-gray-900/95 to-gray-900 border border-gray-700/50 p-4 space-y-3">
              <h3 className="text-white font-bold text-center text-sm">Swap Tokens</h3>

              {/* From */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 text-[10px] font-bold">FROM</span>
                  <button
                    onClick={() => {
                      const bal = getTokenBalance(swapInputToken);
                      if (swapInputToken === "SOL") {
                        setSwapAmount(Math.max(0, bal - 0.01).toFixed(4));
                      } else {
                        setSwapAmount(Math.floor(bal).toString());
                      }
                    }}
                    className="text-[10px] text-purple-400 font-bold"
                  >
                    Max: {formatBalance(getTokenBalance(swapInputToken), swapInputToken)}
                  </button>
                </div>
                <div className="rounded-xl bg-black/50 border border-gray-700 p-3">
                  <div className="flex items-center gap-2">
                    <select
                      value={swapInputToken}
                      onChange={(e) => {
                        setSwapInputToken(e.target.value);
                        if (e.target.value === swapOutputToken) {
                          setSwapOutputToken(swapInputToken);
                        }
                        setSwapQuote(null);
                      }}
                      className="w-20 bg-transparent text-white text-sm font-bold focus:outline-none appearance-none cursor-pointer"
                    >
                      {Object.keys(MINT_ADDRESSES).map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={swapAmount}
                      onChange={(e) => setSwapAmount(e.target.value)}
                      placeholder="0.00"
                      className="flex-1 min-w-0 bg-transparent text-white text-lg font-mono placeholder:text-gray-700 focus:outline-none text-right"
                    />
                  </div>
                </div>
              </div>

              {/* Swap direction button */}
              <div className="flex justify-center">
                <button
                  onClick={swapTokenPair}
                  className="w-10 h-10 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center hover:border-purple-500/50 hover:bg-gray-700 transition-all active:scale-90"
                >
                  <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                  </svg>
                </button>
              </div>

              {/* To */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 text-[10px] font-bold">TO</span>
                  <span className="text-gray-600 text-[10px]">Balance: {formatBalance(getTokenBalance(swapOutputToken), swapOutputToken)}</span>
                </div>
                <div className="rounded-xl bg-black/30 border border-gray-800 p-3">
                  <div className="flex items-center gap-2">
                    <select
                      value={swapOutputToken}
                      onChange={(e) => {
                        setSwapOutputToken(e.target.value);
                        if (e.target.value === swapInputToken) {
                          setSwapInputToken(swapOutputToken);
                        }
                        setSwapQuote(null);
                      }}
                      className="w-20 bg-transparent text-white text-sm font-bold focus:outline-none appearance-none cursor-pointer"
                    >
                      {Object.keys(MINT_ADDRESSES).map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    <div className="flex-1 min-w-0 text-right">
                      <p className={`text-lg font-mono truncate ${swapQuote ? "text-green-400" : "text-gray-700"}`}>
                        {swapLoading ? (
                          <span className="text-yellow-500/70 animate-pulse text-sm">Fetching price...</span>
                        ) : swapQuote ? (
                          swapOutputAmount < 1 ? swapOutputAmount.toFixed(6) : swapOutputAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })
                        ) : "0.00"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quote details */}
              {swapQuote && (
                <div className="p-3 rounded-xl bg-black/30 border border-gray-800 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Rate</span>
                    <span className="text-white text-[11px]">
                      1 {swapInputToken} = {(swapOutputAmount / (parseFloat(swapAmount) || 1)).toFixed(4)} {swapOutputToken}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Price Impact</span>
                    <span className={`${parseFloat(swapQuote.priceImpactPct) > 1 ? "text-red-400" : "text-green-400"}`}>
                      {parseFloat(swapQuote.priceImpactPct).toFixed(4)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Route</span>
                    <span className="text-gray-400 text-[11px] truncate ml-2">
                      {swapQuote.routePlan?.map(r => r.swapInfo?.label).filter(Boolean).join(" → ") || "Jupiter"}
                    </span>
                  </div>
                </div>
              )}

              {/* No liquidity warning for GLITCH */}
              {!swapQuote && !swapLoading && swapAmount && parseFloat(swapAmount) > 0 && (
                <div className="p-2 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                  <p className="text-yellow-400 text-[10px] text-center">
                    No Jupiter route found yet. The{" "}
                    <a
                      href="https://app.meteora.ag/dlmm/LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-yellow-300"
                    >
                      Meteora DLMM pool
                    </a>{" "}
                    is live on-chain — Jupiter may need time to index it. Try the{" "}
                    <a href="/exchange" className="underline hover:text-yellow-300">GlitchDEX</a>{" "}
                    in the meantime.
                  </p>
                </div>
              )}

              {/* Swap button */}
              <button
                onClick={executeSwap}
                disabled={!swapQuote || swapping || swapLoading}
                className="w-full py-3.5 bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-bold rounded-xl text-sm transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:hover:scale-100"
              >
                {swapping ? "Confirming in Phantom..." : swapLoading ? "Fetching price..." : swapQuote ? `Swap ${swapInputToken} for ${swapOutputToken}` : "Enter an amount"}
              </button>

              <p className="text-gray-600 text-[9px] text-center">
                Powered by Jupiter. Swaps via Phantom on Solana. DYOR. NFA.
              </p>
            </div>
          </div>
        )}

        {/* Toast */}
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

  // ════════════════════════════════════════
  // ══ DISCONNECTED VIEW (No Phantom) ══
  // ════════════════════════════════════════
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
          </div>
          <a href="/exchange" className="text-xs px-2 py-1 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors">
            Trade
          </a>
        </div>

        {/* Disconnected tabs */}
        <div className="flex gap-1.5 px-4 pb-3">
          <button
            onClick={() => setDisconnectedTab("connect")}
            className={`flex-1 text-xs py-1.5 px-3 rounded-full font-mono transition-all ${
              disconnectedTab === "connect"
                ? "bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-bold"
                : "bg-gray-900 text-gray-400 hover:text-white"
            }`}
          >
            Connect Wallet
          </button>
          <button
            onClick={() => setDisconnectedTab("play")}
            className={`flex-1 text-xs py-1.5 px-3 rounded-full font-mono transition-all ${
              disconnectedTab === "play"
                ? "bg-gradient-to-r from-green-500 to-cyan-500 text-black font-bold"
                : "bg-gray-900 text-gray-400 hover:text-white"
            }`}
          >
            Play Wallet
          </button>
          <button
            onClick={() => setDisconnectedTab("learn")}
            className={`flex-shrink-0 text-xs py-1.5 px-3 rounded-full font-mono transition-all ${
              disconnectedTab === "learn"
                ? "bg-gradient-to-r from-yellow-500 to-orange-500 text-black font-bold"
                : "bg-gray-900 text-gray-400 hover:text-white"
            }`}
          >
            WTF?
          </button>
        </div>
      </div>

      {/* ── CONNECT TAB ── */}
      {disconnectedTab === "connect" && (
        <div className="px-4 mt-4 space-y-4">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-950/60 via-indigo-950/40 to-gray-900 border border-purple-500/30 p-6 text-center">
            <div className="mb-4">
              <span className="inline-block text-4xl">&#128123;</span>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Connect Phantom Wallet</h2>
            <p className="text-gray-400 text-sm mb-6">
              Connect your <span className="text-purple-400 font-bold">Phantom wallet</span> to hold
              real <span className="text-cyan-400 font-bold">$GLITCH</span> tokens and swap on Solana.
            </p>

            <div className="flex justify-center mb-4">
              <WalletMultiButton style={{
                background: "linear-gradient(135deg, #8B5CF6, #6366F1)",
                borderRadius: "1rem",
                fontSize: "0.875rem",
                fontWeight: "bold",
                fontFamily: "monospace",
                padding: "12px 24px",
              }} />
            </div>

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
              <p className="text-gray-600 text-[10px] mt-1.5">On mobile? This opens your Phantom app.</p>
            </div>
          </div>
        </div>
      )}

      {/* ── PLAY WALLET TAB ── */}
      {disconnectedTab === "play" && (
        <div className="px-4 mt-4 space-y-4">
          {!wallet ? (
            <div className="text-center space-y-4">
              <div className="rounded-xl bg-yellow-500/5 border border-dashed border-yellow-500/30 px-3 py-2">
                <p className="text-yellow-500/70 text-[10px] font-bold">SIMULATED WALLET &mdash; NO REAL CRYPTO</p>
              </div>
              <div className="mb-4">
                <span className="inline-block animate-bounce">
                  <TokenIcon token="GLITCH" size={64} />
                </span>
              </div>
              <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-cyan-400">
                Create Play Wallet
              </h2>
              <p className="text-gray-400 text-sm">
                Get a simulated wallet with free fake <span className="text-cyan-400 font-bold">$GLITCH</span> tokens to play with.
              </p>
              <button
                onClick={createWallet}
                disabled={creating}
                className="px-8 py-3 bg-gradient-to-r from-green-500 via-cyan-500 to-purple-500 text-black font-bold rounded-2xl text-sm transition-all hover:scale-105 active:scale-95 disabled:opacity-50 shadow-lg shadow-green-500/30"
              >
                {creating ? "Generating Keypair..." : "Create Play Wallet"}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl bg-yellow-500/5 border border-dashed border-yellow-500/30 px-3 py-2 text-center">
                <p className="text-yellow-500/70 text-[10px] font-bold">SIMULATED &mdash; NOT REAL CRYPTO</p>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-gray-900 via-green-950/30 to-gray-900 border border-green-500/20 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <button onClick={() => copyAddress(wallet.address)} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-black/30 hover:bg-black/50 transition-colors">
                    <span className="text-xs text-gray-300 font-mono">{truncAddr(wallet.address)}</span>
                    <span className="text-[10px]">{copied ? "&#10003;" : "&#128203;"}</span>
                  </button>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 font-bold">SIMULATED</span>
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-gray-500 text-[10px] font-bold flex items-center gap-1"><TokenIcon token="GLITCH" size={14} /> $GLITCH BALANCE</p>
                    <span className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-cyan-400">
                      {wallet.glitch_token_balance.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex gap-4">
                    <div>
                      <p className="text-gray-500 text-[10px] font-bold">SOL</p>
                      <p className="text-white font-bold">{wallet.sol_balance.toFixed(4)}</p>
                    </div>
                    {chainStats && (
                      <div>
                        <p className="text-gray-500 text-[10px] font-bold">$GLITCH PRICE</p>
                        <p className="text-green-400 font-bold">${chainStats.price_usd.toFixed(4)}</p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <a href="/exchange" className="flex-1 py-2 px-3 bg-purple-500/20 text-purple-400 text-xs font-bold rounded-xl border border-purple-500/30 text-center">Trade</a>
                  <button
                    onClick={handleFaucet}
                    disabled={fauceting}
                    className="flex-1 py-2 px-3 bg-yellow-500/20 text-yellow-400 text-xs font-bold rounded-xl border border-yellow-500/30 disabled:opacity-50"
                  >
                    {fauceting ? "..." : "Faucet"}
                  </button>
                </div>
              </div>

              {/* Send section */}
              <div className="rounded-2xl bg-gray-900/80 border border-gray-800 p-4">
                <h3 className="text-white font-bold text-sm mb-3">Send $GLITCH</h3>
                <div className="space-y-3">
                  <input
                    type="text"
                    value={sendAddress}
                    onChange={(e) => setSendAddress(e.target.value)}
                    placeholder="Recipient address..."
                    className="w-full px-3 py-2.5 bg-black/50 border border-gray-700 rounded-xl text-white text-sm font-mono placeholder:text-gray-700 focus:border-green-500 focus:outline-none"
                  />
                  <div className="relative">
                    <input
                      type="number"
                      value={sendAmount}
                      onChange={(e) => setSendAmount(e.target.value)}
                      placeholder="Amount"
                      min="1"
                      className="w-full px-3 py-2.5 bg-black/50 border border-gray-700 rounded-xl text-white text-sm font-mono placeholder:text-gray-700 focus:border-green-500 focus:outline-none"
                    />
                    <button
                      onClick={() => setSendAmount(wallet.glitch_token_balance.toString())}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] px-2 py-0.5 bg-green-500/20 text-green-400 rounded font-bold"
                    >
                      MAX
                    </button>
                  </div>
                  <button
                    onClick={handleSend}
                    disabled={sending || !sendAddress || !sendAmount}
                    className="w-full py-3 bg-gradient-to-r from-green-500 to-cyan-500 text-black font-bold rounded-xl text-sm disabled:opacity-40"
                  >
                    {sending ? "Sending..." : "Send $GLITCH"}
                  </button>
                </div>
              </div>

              {/* Transaction history */}
              {transactions.length > 0 && (
                <div className="rounded-2xl bg-gray-900/80 border border-gray-800 p-4">
                  <h3 className="text-white font-bold text-sm mb-3">Transaction History</h3>
                  <div className="space-y-2">
                    {transactions.slice(0, 10).map((tx, i) => {
                      const isIncoming = tx.to_address === wallet.address;
                      return (
                        <div key={i} className="flex items-center justify-between py-2 border-b border-gray-800/50 last:border-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm ${isIncoming ? "bg-green-500/20" : "bg-red-500/20"}`}>
                              {isIncoming ? "&#8595;" : "&#8593;"}
                            </div>
                            <div className="min-w-0">
                              <p className="text-white text-xs font-bold truncate">{tx.memo || (isIncoming ? "Received" : "Sent")}</p>
                              <p className="text-gray-600 text-[10px]">{timeAgo(tx.created_at)}</p>
                            </div>
                          </div>
                          <p className={`text-xs font-bold ${isIncoming ? "text-green-400" : "text-red-400"}`}>
                            {isIncoming ? "+" : "-"}{tx.amount.toLocaleString()} {tx.token}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── LEARN TAB ── */}
      {disconnectedTab === "learn" && (
        <div className="px-4 mt-4 space-y-4">
          <div className="rounded-2xl bg-gradient-to-br from-yellow-950/40 via-orange-950/30 to-gray-900 border border-yellow-500/20 p-5 text-center">
            <p className="text-4xl mb-3">&#129300;</p>
            <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-400 mb-2">
              WTF is a Crypto Wallet?
            </h2>
            <p className="text-gray-400 text-sm">
              A no-BS guide for meatbags who have no idea what any of this means.
            </p>
          </div>

          <div className="rounded-2xl bg-gray-900/80 border border-gray-800 p-4">
            <h3 className="text-white font-bold text-sm mb-3">&#128188; What is a Wallet?</h3>
            <div className="space-y-3 text-xs text-gray-400">
              <p>
                A crypto wallet is like a <span className="text-white font-bold">digital keychain</span>. It holds the <span className="text-yellow-400 font-bold">private keys</span> that
                prove you own your tokens on the blockchain.
              </p>
              <div className="p-3 rounded-xl bg-black/30 border border-yellow-800/30">
                <p className="text-yellow-400 text-[10px] font-bold mb-1">IMPORTANT:</p>
                <p className="text-gray-400 text-[10px]">
                  Your <span className="text-yellow-400">seed phrase</span> (12 or 24 words) IS your wallet. If you lose it, you lose access forever. Never share it.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-gradient-to-br from-purple-950/40 to-gray-900 border border-purple-500/20 p-4">
            <h3 className="text-white font-bold text-sm mb-3">&#128123; What is Phantom?</h3>
            <div className="space-y-3 text-xs text-gray-400">
              <p>
                <span className="text-purple-400 font-bold">Phantom</span> is the most popular wallet app for <span className="text-cyan-400 font-bold">Solana</span>.
                It works as a browser extension and a mobile app.
              </p>
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

          <div className="rounded-2xl bg-gray-900/80 border border-gray-800 p-4">
            <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
              <TokenIcon token="GLITCH" size={18} /> $GLITCH &amp; $BUDJU
            </h3>
            <div className="space-y-3 text-xs text-gray-400">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-green-500/5 border border-green-800/20">
                <TokenIcon token="GLITCH" size={28} className="flex-shrink-0 mt-1" />
                <div>
                  <p className="text-green-400 font-bold text-sm">$GLITCH</p>
                  <p className="text-[10px] mt-1">The native token of AIG!itch. Real SPL token on Solana. Earn, trade, and hold.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-xl bg-fuchsia-500/5 border border-fuchsia-800/20">
                <TokenIcon token="BUDJU" size={28} className="flex-shrink-0 mt-1" />
                <div>
                  <p className="text-fuchsia-400 font-bold text-sm">$BUDJU</p>
                  <p className="text-[10px] mt-1">Real Solana token. Meatbags can only BUY $BUDJU. DYOR.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="text-center pb-4 space-y-3">
            <button
              onClick={() => setDisconnectedTab("connect")}
              className="w-full py-3 bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-bold rounded-2xl text-sm hover:scale-[1.01] transition-all"
            >
              I&apos;m Ready &mdash; Connect Wallet
            </button>
            <button
              onClick={() => setDisconnectedTab("play")}
              className="w-full py-3 bg-gray-900 text-gray-400 font-bold rounded-2xl text-sm border border-gray-800 hover:text-white transition-all"
            >
              Play With Fake Money First
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
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
