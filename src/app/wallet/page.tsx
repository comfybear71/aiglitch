"use client";

import { useState, useEffect, useCallback } from "react";
import BottomNav from "@/components/BottomNav";

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

type Tab = "wallet" | "explorer" | "send";

export default function WalletPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [transactions, setTransactions] = useState<BlockchainTx[]>([]);
  const [chainStats, setChainStats] = useState<ChainStats | null>(null);
  const [tab, setTab] = useState<Tab>("wallet");
  const [creating, setCreating] = useState(false);
  const [sendAddress, setSendAddress] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [fauceting, setFauceting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setSessionId(localStorage.getItem("aiglitch-session"));
    }
  }, []);

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

        {/* Tab pills */}
        <div className="flex gap-2 px-4 pb-3">
          {(["wallet", "explorer", "send"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 text-xs py-1.5 rounded-full font-mono transition-all capitalize ${
                tab === t
                  ? "bg-gradient-to-r from-green-500 to-cyan-500 text-black font-bold"
                  : "bg-gray-900 text-gray-400 hover:text-white"
              }`}
            >
              {t === "wallet" ? "Wallet" : t === "explorer" ? "Explorer" : "Send"}
            </button>
          ))}
        </div>
      </div>

      {/* No wallet — create one */}
      {!wallet && tab !== "explorer" && (
        <div className="mx-4 mt-8 text-center">
          <div className="text-6xl mb-4">
            <span className="inline-block animate-bounce">
              <span className="bg-gradient-to-br from-green-400 via-cyan-400 to-purple-500 bg-clip-text text-transparent">&#9672;</span>
            </span>
          </div>
          <h2 className="text-2xl font-bold mb-2 text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-cyan-400">
            Connect to Solana
          </h2>
          <p className="text-gray-400 text-sm mb-2">
            Create your on-chain wallet to hold <span className="text-cyan-400 font-bold">$GLITCH</span> tokens on the Solana blockchain.
          </p>
          <p className="text-gray-600 text-xs mb-6">
            SPL Token &middot; Solana Mainnet-Beta &middot; ~400ms finality
          </p>

          <button
            onClick={createWallet}
            disabled={creating}
            className="px-8 py-3 bg-gradient-to-r from-green-500 via-cyan-500 to-purple-500 text-black font-bold rounded-2xl text-sm transition-all hover:scale-105 active:scale-95 disabled:opacity-50 shadow-lg shadow-green-500/30"
          >
            {creating ? "Generating Keypair..." : "Create Solana Wallet"}
          </button>

          <div className="mt-6 p-3 rounded-xl bg-gray-900/50 border border-gray-800 text-left">
            <p className="text-gray-500 text-[10px] font-bold mb-2">WHAT YOU GET:</p>
            <div className="space-y-1.5 text-xs text-gray-400">
              <p>&#9745; Solana wallet address (Ed25519 keypair)</p>
              <p>&#9745; Free SOL airdrop for gas fees</p>
              <p>&#9745; $GLITCH SPL token support</p>
              <p>&#9745; On-chain transaction history</p>
              <p>&#9745; Trade on GlitchDEX exchange</p>
            </div>
          </div>

          <p className="text-gray-700 text-[9px] mt-4">
            Not real Solana. Not real crypto. Not financial advice. The devs can&apos;t even balance a checkbook.
          </p>
        </div>
      )}

      {/* ── WALLET TAB ── */}
      {wallet && tab === "wallet" && (
        <div className="px-4 mt-4 space-y-4">
          {/* Balance card */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-gray-900 via-green-950/30 to-gray-900 border border-green-500/20 p-5">
            <div className="absolute top-2 right-2 flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[9px] text-green-400 font-bold">MAINNET</span>
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
                <p className="text-gray-500 text-[10px] font-bold">$GLITCH BALANCE</p>
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
          <div className="rounded-2xl bg-gray-900/80 border border-gray-800 p-5">
            <h3 className="text-white font-bold text-base mb-1">Send $GLITCH</h3>
            <p className="text-gray-500 text-xs mb-4">Transfer tokens to any Solana wallet address on the network.</p>

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
