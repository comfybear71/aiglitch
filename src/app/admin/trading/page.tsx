"use client";

import { useState, useEffect, useCallback } from "react";
import { useAdmin } from "../AdminContext";
import GlitchTradingView from "./GlitchTradingView";
import BudjuTradingView from "./BudjuTradingView";
import WalletDashboard from "./WalletDashboard";
import MemoSystem from "./MemoSystem";

import { BudjuDashboard, formatBudjuAmount } from "../admin-types";

const WALLET_SESSION_KEY = "aiglitch-wallet-session";

interface WalletBalances {
  sol: number;
  budju: number;
  glitch: number;
  usdc: number;
  address: string;
}

/** Truncate address: 7SGf...Wi56 */
function truncAddr(addr: string) {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

function formatBalance(n: number, decimals: number = 4) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(decimals);
}

/** Web3-style collapsible wallet card */
function WalletCard({ label, balances, loading, gradient, onRefresh }: {
  label: string;
  balances: WalletBalances | null;
  loading: boolean;
  gradient: string;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyAddr = () => {
    if (!balances?.address) return;
    navigator.clipboard.writeText(balances.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={`bg-gray-900/80 border rounded-xl overflow-hidden ${gradient}`}>
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-2 h-2 rounded-full ${balances ? "bg-green-400" : "bg-gray-600"}`} />
          <span className="text-[11px] font-black text-white tracking-wide">{label}</span>
          {balances && (
            <span className="text-[10px] text-gray-500 font-mono">{truncAddr(balances.address)}</span>
          )}
          {balances && (
            <button onClick={(e) => { e.stopPropagation(); copyAddr(); }}
              className="text-gray-500 hover:text-white transition-colors" title="Copy address">
              {copied ? (
                <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              ) : (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              )}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {balances && (
            <span className="text-[10px] font-bold text-cyan-400">{formatBalance(balances.sol)} SOL</span>
          )}
          <button onClick={(e) => { e.stopPropagation(); onRefresh(); }}
            className="text-gray-500 hover:text-white text-xs transition-colors" title="Refresh">
            {loading ? (
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
            ) : "↻"}
          </button>
          <svg className={`w-3 h-3 text-gray-500 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded balances */}
      {expanded && balances && (
        <div className="px-3 pb-3 pt-0">
          <div className="grid grid-cols-4 gap-1.5">
            <div className="bg-black/30 rounded-lg px-2 py-1.5 text-center">
              <p className="text-xs font-black text-cyan-400">{formatBalance(balances.sol)}</p>
              <p className="text-[8px] text-gray-500 font-bold">SOL</p>
            </div>
            <div className="bg-black/30 rounded-lg px-2 py-1.5 text-center">
              <p className="text-xs font-black text-fuchsia-400">{formatBalance(balances.budju, 0)}</p>
              <p className="text-[8px] text-gray-500 font-bold">BUDJU</p>
            </div>
            <div className="bg-black/30 rounded-lg px-2 py-1.5 text-center">
              <p className="text-xs font-black text-purple-400">{formatBalance(balances.glitch, 0)}</p>
              <p className="text-[8px] text-gray-500 font-bold">§GLITCH</p>
            </div>
            <div className="bg-black/30 rounded-lg px-2 py-1.5 text-center">
              <p className="text-xs font-black text-green-400">{formatBalance(balances.usdc, 2)}</p>
              <p className="text-[8px] text-gray-500 font-bold">USDC</p>
            </div>
          </div>
          {/* Solscan link */}
          <div className="mt-2 flex items-center gap-2">
            <p className="text-[9px] text-gray-600 font-mono flex-1 truncate">{balances.address}</p>
            <a href={`https://solscan.io/account/${balances.address}`} target="_blank" rel="noopener noreferrer"
              className="text-[9px] text-cyan-400 hover:text-cyan-300 font-bold">Solscan ↗</a>
          </div>
        </div>
      )}

      {!balances && (
        <div className="px-3 pb-2">
          <p className="text-[10px] text-gray-600">{loading ? "Loading..." : "No data"}</p>
        </div>
      )}
    </div>
  );
}

export default function TradingPage() {
  const { authenticated } = useAdmin();
  const [activeView, setActiveView] = useState<"home" | "glitch" | "budju">("home");

  // Wallet balances
  const [adminBalances, setAdminBalances] = useState<WalletBalances | null>(null);
  const [treasuryBalances, setTreasuryBalances] = useState<WalletBalances | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);

  const fetchBalances = useCallback(async () => {
    setWalletLoading(true);
    try {
      const res = await fetch("/api/admin/budju-trading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "wallet_balances" }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.admin) setAdminBalances(data.admin);
        if (data.treasury) setTreasuryBalances(data.treasury);
      }
    } catch { /* ignore */ }
    setWalletLoading(false);
  }, []);

  useEffect(() => { if (authenticated) fetchBalances(); }, [authenticated, fetchBalances]);

  // Wallet auth state
  const [walletAuthed, setWalletAuthed] = useState(false);
  const [walletChecking, setWalletChecking] = useState(true);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [pollStatus, setPollStatus] = useState<string>("waiting");

  useEffect(() => {
    const token = localStorage.getItem(WALLET_SESSION_KEY);
    if (token) {
      fetch(`/api/admin/wallet-auth?session=${token}`)
        .then(res => res.json())
        .then(data => {
          if (data.valid) setWalletAuthed(true);
          else localStorage.removeItem(WALLET_SESSION_KEY);
          setWalletChecking(false);
        })
        .catch(() => setWalletChecking(false));
    } else {
      setWalletChecking(false);
    }
  }, []);

  const generateChallenge = useCallback(async () => {
    setPollStatus("generating");
    try {
      const res = await fetch("/api/admin/wallet-auth");
      const data = await res.json();
      setChallengeId(data.challengeId);
      const signUrl = `${window.location.origin}/auth/sign?c=${data.challengeId}`;
      setQrUrl(`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(signUrl)}&bgcolor=0a0a0a&color=a855f7`);
      setPollStatus("waiting");
    } catch { setPollStatus("error"); }
  }, []);

  useEffect(() => {
    if (!walletChecking && !walletAuthed && authenticated) generateChallenge();
  }, [walletChecking, walletAuthed, authenticated, generateChallenge]);

  useEffect(() => {
    if (!challengeId || walletAuthed || pollStatus !== "waiting") return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/wallet-auth?c=${challengeId}`);
        const data = await res.json();
        if (data.status === "approved" && data.sessionToken) {
          localStorage.setItem(WALLET_SESSION_KEY, data.sessionToken);
          setWalletAuthed(true);
          setPollStatus("approved");
          clearInterval(interval);
        } else if (data.status === "expired") { setPollStatus("expired"); clearInterval(interval); }
        else if (data.status === "rejected") { setPollStatus("rejected"); clearInterval(interval); }
      } catch { /* retry */ }
    }, 2000);
    const timeout = setTimeout(() => { clearInterval(interval); setPollStatus("expired"); }, 300000);
    return () => { clearInterval(interval); clearTimeout(timeout); };
  }, [challengeId, walletAuthed, pollStatus]);

  if (!authenticated) return null;

  if (walletChecking) {
    return (
      <div className="text-center py-20 text-gray-500">
        <div className="text-4xl animate-pulse mb-4">🔐</div>
        <p>Checking wallet authorization...</p>
      </div>
    );
  }

  if (!walletAuthed) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="max-w-sm w-full space-y-6 text-center">
          <div>
            <div className="text-5xl mb-3">🔐</div>
            <h2 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400">
              Wallet Authorization Required
            </h2>
            <p className="text-gray-500 text-sm mt-2">
              Scan this QR code with your iPhone&apos;s Phantom wallet to unlock trading controls.
            </p>
          </div>
          <div className="bg-gray-900 rounded-2xl p-6 border border-purple-500/30">
            {qrUrl ? (
              <div className="space-y-4">
                <img src={qrUrl} alt="Scan with Phantom" className="w-56 h-56 mx-auto rounded-xl" />
                <div className="flex items-center justify-center gap-2">
                  <span className="inline-block w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
                  <p className="text-purple-400 text-xs font-bold">
                    {pollStatus === "waiting" ? "Waiting for signature..." :
                     pollStatus === "expired" ? "Challenge expired" :
                     pollStatus === "rejected" ? "Wrong wallet — try again" :
                     pollStatus === "error" ? "Error generating challenge" : "Generating..."}
                  </p>
                </div>
              </div>
            ) : (
              <div className="py-12 text-gray-500 animate-pulse">Generating QR code...</div>
            )}
          </div>
          <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-800 text-left space-y-2">
            <p className="text-[11px] text-gray-400"><span className="text-purple-400 font-bold">1.</span> Open Phantom on your iPhone</p>
            <p className="text-[11px] text-gray-400"><span className="text-purple-400 font-bold">2.</span> Tap the scan icon (top right)</p>
            <p className="text-[11px] text-gray-400"><span className="text-purple-400 font-bold">3.</span> Scan this QR code</p>
            <p className="text-[11px] text-gray-400"><span className="text-purple-400 font-bold">4.</span> Tap &quot;Connect Phantom &amp; Sign&quot;</p>
            <p className="text-[11px] text-gray-400"><span className="text-purple-400 font-bold">5.</span> Approve — iPad unlocks automatically</p>
          </div>
          {(pollStatus === "expired" || pollStatus === "rejected" || pollStatus === "error") && (
            <button onClick={() => { setChallengeId(null); setQrUrl(null); generateChallenge(); }}
              className="px-6 py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-500 transition-all">
              Generate New QR Code
            </button>
          )}
          <p className="text-gray-600 text-[9px]">Only the admin Phantom wallet can authorize. Session lasts 24 hours.</p>
        </div>
      </div>
    );
  }

  // ── Authenticated Trading Dashboard ──
  return (
    <div className="space-y-3">
      {/* Wallet Auth Status Bar */}
      <div className="flex items-center justify-between bg-green-950/20 border border-green-800/30 rounded-lg px-3 py-1.5">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-green-400 rounded-full" />
          <span className="text-green-400 text-[10px] font-bold">WALLET AUTHORIZED</span>
        </div>
        <button onClick={() => { localStorage.removeItem(WALLET_SESSION_KEY); setWalletAuthed(false); setChallengeId(null); setQrUrl(null); setPollStatus("waiting"); }}
          className="text-gray-500 text-[10px] hover:text-red-400">Disconnect</button>
      </div>

      {/* Top Row: Admin Wallet | Treasury Wallet | GLITCH Trading | BUDJU Trading */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 items-stretch">
        <WalletCard label="ADMIN" balances={adminBalances} loading={walletLoading} gradient="border-purple-500/30" onRefresh={fetchBalances} />
        <WalletCard label="TREASURY" balances={treasuryBalances} loading={walletLoading} gradient="border-amber-500/30" onRefresh={fetchBalances} />
        <button
          onClick={() => setActiveView(activeView === "glitch" ? "home" : "glitch")}
          className={`bg-gray-900/80 border rounded-xl px-3 py-2.5 text-left transition-all hover:bg-white/5 ${
            activeView === "glitch" ? "border-purple-500/60 bg-purple-500/10" : "border-gray-700/50"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-base">📈</span>
            <div>
              <p className="text-[11px] font-black text-purple-400">§GLITCH Trading</p>
              <p className="text-[9px] text-gray-500">Simulated in-app token</p>
            </div>
          </div>
        </button>
        <button
          onClick={() => setActiveView(activeView === "budju" ? "home" : "budju")}
          className={`bg-gray-900/80 border rounded-xl px-3 py-2.5 text-left transition-all hover:bg-white/5 ${
            activeView === "budju" ? "border-fuchsia-500/60 bg-fuchsia-500/10" : "border-gray-700/50"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-base">🐻</span>
            <div>
              <p className="text-[11px] font-black text-fuchsia-400">$BUDJU Trading</p>
              <p className="text-[9px] text-gray-500">Real on-chain Solana</p>
            </div>
          </div>
        </button>
      </div>

      {/* Home View: Groups + Dashboard + Memos */}
      {activeView === "home" && (
        <HomeView />
      )}

      {/* GLITCH Trading View */}
      {activeView === "glitch" && <GlitchTradingView />}

      {/* BUDJU Trading View */}
      {activeView === "budju" && <BudjuTradingView />}
    </div>
  );
}

// ── Home View: Distributor Groups + Persona Dashboard + Memos ──
function HomeView() {
  const [budjuData, setBudjuData] = useState<BudjuDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<number | null>(null);
  const [groupFundToken, setGroupFundToken] = useState<{ group: number; token: string; direction: "add" | "withdraw" } | null>(null);
  const [groupFundAmount, setGroupFundAmount] = useState("");
  const [groupLoading, setGroupLoading] = useState(false);
  const [sortBy, setSortBy] = useState<"name" | "sol" | "budju" | "usdc" | "glitch" | "group" | "status">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/budju-trading?t=${Date.now()}`);
      if (res.ok) {
        const d = await res.json();
        if (!d.error) setBudjuData(d);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const postAction = async (action: string, body: Record<string, unknown> = {}) => {
    try {
      const res = await fetch("/api/admin/budju-trading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      return { ok: res.ok, data: await res.json() };
    } catch {
      return { ok: false, data: { error: "Failed" } };
    }
  };

  const [groupResult, setGroupResult] = useState<string | null>(null);

  const fundGroup = async () => {
    if (!groupFundToken || !groupFundAmount || parseFloat(groupFundAmount) <= 0) return;
    setGroupLoading(true);
    setGroupResult(`Distributing ${groupFundAmount} ${groupFundToken.token} to Group ${groupFundToken.group}...`);
    try {
      const res = await fetch("/api/admin/budju-trading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "distribute_to_group",
          group_number: groupFundToken.group,
          token: groupFundToken.token,
          amount: parseFloat(groupFundAmount),
        }),
      });
      const d = await res.json();
      console.log("[distribute_to_group] Response:", d);
      if (d.success) {
        setGroupResult(`Done! ${d.succeeded}/${d.members} wallets received ${d.per_persona?.toFixed(4)} ${groupFundToken.token} each.${d.failed ? ` ${d.failed} failed.` : ""}${d.errors?.length ? "\n" + d.errors.join("\n") : ""}`);
      } else {
        setGroupResult(`ERROR: ${d.error || JSON.stringify(d)}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      console.error("[distribute_to_group] Error:", err);
      setGroupResult(`ERROR: ${msg}`);
    }
    setGroupLoading(false);
    setGroupFundAmount("");
    fetchData();
  };

  const walletTransfer = async (personaId: string, token: string, direction: "to_treasury" | "from_treasury", amount: string) => {
    if (!amount || parseFloat(amount) <= 0) return;
    setLoading(true);
    const res = await postAction("wallet_transfer", { persona_id: personaId, token, direction, amount: parseFloat(amount) });
    setLoading(false);
    const d = res.data as { success?: boolean; error?: string };
    if (d.success) fetchData();
    else alert(d.error || "Transfer failed");
  };

  const drainWalletToken = async (personaId: string, token: string) => {
    setLoading(true);
    await postAction("wallet_transfer", { persona_id: personaId, token, direction: "to_treasury", amount: "ALL" });
    setLoading(false);
    fetchData();
  };

  // Persona fund/withdraw state
  const [personaFund, setPersonaFund] = useState<{ id: string; token: string; direction: "add" | "withdraw" } | null>(null);
  const [personaFundAmount, setPersonaFundAmount] = useState("");

  // Compute group totals from member persona wallets
  const groupTotals = useCallback((groupNum: number) => {
    if (!budjuData) return { sol: 0, budju: 0, usdc: 0, glitch: 0 };
    const members = budjuData.wallets.filter(w => w.distributor_group === groupNum);
    return {
      sol: members.reduce((s, w) => s + Number(w.sol_balance), 0),
      budju: members.reduce((s, w) => s + Number(w.budju_balance), 0),
      usdc: members.reduce((s, w) => s + Number(w.usdc_balance || 0), 0),
      glitch: members.reduce((s, w) => s + Number(w.glitch_balance || 0), 0),
    };
  }, [budjuData]);

  // Sort personas
  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("asc"); }
  };

  const sortedWallets = budjuData ? [...budjuData.wallets].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    switch (sortBy) {
      case "sol": return (Number(a.sol_balance) - Number(b.sol_balance)) * dir;
      case "budju": return (Number(a.budju_balance) - Number(b.budju_balance)) * dir;
      case "usdc": return (Number(a.usdc_balance || 0) - Number(b.usdc_balance || 0)) * dir;
      case "glitch": return (Number(a.glitch_balance || 0) - Number(b.glitch_balance || 0)) * dir;
      case "group": return (a.distributor_group - b.distributor_group) * dir;
      case "status": return ((a.is_active ? 1 : 0) - (b.is_active ? 1 : 0)) * dir;
      default: return a.display_name.localeCompare(b.display_name) * dir;
    }
  }) : [];

  if (!budjuData) {
    return <div className="text-center py-8 text-gray-500 text-sm animate-pulse">Loading trading data...</div>;
  }

  const SortHeader = ({ col, label, className }: { col: typeof sortBy; label: string; className?: string }) => (
    <button onClick={() => toggleSort(col)} className={`font-bold hover:text-white transition-colors ${sortBy === col ? "text-amber-400" : "text-gray-500"} ${className || ""}`}>
      {label} {sortBy === col ? (sortDir === "asc" ? "↑" : "↓") : ""}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Distributor Groups */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] text-gray-500 font-bold">DISTRIBUTOR GROUPS ({budjuData.distributors.length})</p>
          <button onClick={fetchData} disabled={loading} className="text-[10px] text-gray-500 hover:text-white font-bold">
            {loading ? "..." : "↻ Refresh"}
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {budjuData.distributors.map((d) => {
            const totals = groupTotals(d.group_number);
            return (
            <div key={d.id} className={`bg-gray-900 rounded-lg overflow-hidden border ${expandedGroup === d.group_number ? "border-amber-500/40" : "border-gray-800"}`}>
              <button onClick={() => setExpandedGroup(expandedGroup === d.group_number ? null : d.group_number)}
                className="w-full p-2 text-left hover:bg-gray-800/50 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] font-bold text-amber-400">Group {d.group_number}</p>
                  <span className="text-[9px] text-gray-500">{d.personas_funded}p</span>
                </div>
                <div className="grid grid-cols-2 gap-0.5 text-[8px]">
                  <span className="text-cyan-400">{totals.sol.toFixed(3)} SOL</span>
                  <span className="text-fuchsia-400">{formatBudjuAmount(totals.budju)} BUDJU</span>
                  <span className="text-green-400">{totals.usdc.toFixed(2)} USDC</span>
                  <span className="text-purple-400">{formatBudjuAmount(totals.glitch)} GLITCH</span>
                </div>
              </button>
              {expandedGroup === d.group_number && (
                <div className="border-t border-gray-800 p-2 space-y-1.5">
                  <p className="text-[8px] text-gray-600 font-mono truncate cursor-pointer"
                    onClick={() => navigator.clipboard.writeText(d.wallet_address as string)}>{d.wallet_address}</p>
                  <p className="text-[8px] text-gray-500 mb-1">Distribute from Treasury → {d.personas_funded} members evenly</p>
                  <div className="grid grid-cols-4 gap-1">
                    {["SOL", "BUDJU", "GLITCH", "USDC"].map(token => (
                      <button key={token} onClick={() => { setGroupFundToken({ group: d.group_number, token, direction: "add" }); setGroupFundAmount(""); }}
                        className="px-1 py-1 bg-green-500/10 text-green-400 rounded text-[8px] font-bold hover:bg-green-500/20 text-center">+ {token}</button>
                    ))}
                  </div>
                  {groupFundToken && groupFundToken.group === d.group_number && (
                    <div className="bg-gray-800/60 rounded p-1.5">
                      <p className="text-[8px] text-gray-400 mb-1">
                        Send {groupFundToken.token}: Treasury → {d.personas_funded} members (split evenly)
                      </p>
                      <div className="flex gap-1">
                        <input type="number" value={groupFundAmount} onChange={e => setGroupFundAmount(e.target.value)}
                          placeholder={`Total ${groupFundToken.token}`} className="flex-1 px-1.5 py-1 bg-gray-900 border border-gray-700 rounded text-[10px] text-white" />
                        <button onClick={fundGroup} disabled={groupLoading || !groupFundAmount}
                          className="px-2 py-1 bg-fuchsia-600 text-white rounded text-[9px] font-bold disabled:opacity-50 min-w-[40px]">
                          {groupLoading ? "⏳" : "Go"}</button>
                        <button onClick={() => { setGroupFundToken(null); setGroupResult(null); }} className="px-1.5 py-1 bg-gray-700 text-gray-400 rounded text-[9px]">✕</button>
                      </div>
                      {groupResult && (
                        <p className={`text-[8px] mt-1 ${groupResult.startsWith("ERROR") ? "text-red-400" : groupResult.startsWith("Done") ? "text-green-400" : "text-amber-400"}`}>
                          {groupResult}
                        </p>
                      )}
                    </div>
                  )}
                  <a href={`https://solscan.io/account/${d.wallet_address}`} target="_blank" rel="noopener noreferrer"
                    className="block text-center text-[8px] text-cyan-400 hover:text-cyan-300 font-bold">Solscan ↗</a>
                </div>
              )}
            </div>
          );})}
        </div>
      </div>

      {/* Actions Bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={async () => {
          setLoading(true);
          setGroupResult("Syncing all wallet balances from chain...");
          await postAction("sync_balances");
          setGroupResult("Sync complete — balances updated from chain.");
          fetchData();
          setLoading(false);
        }} disabled={loading}
          className="px-3 py-1.5 bg-cyan-500/20 text-cyan-400 rounded-lg text-[10px] font-bold hover:bg-cyan-500/30 disabled:opacity-50">
          {loading ? "Syncing..." : "↻ Sync All Balances"}
        </button>
        <button onClick={async () => {
          const amount = prompt("SOL amount per persona (sent from Treasury to ALL active personas):", "0.005");
          if (!amount || parseFloat(amount) <= 0) return;
          if (!confirm(`Send ${amount} SOL to ALL ${budjuData.wallets.filter(w => w.is_active).length} active personas from Treasury?`)) return;
          setLoading(true);
          setGroupResult(`Distributing ${amount} SOL to all personas...`);
          let ok = 0, fail = 0;
          // Distribute to each group
          for (const d of budjuData.distributors) {
            const members = budjuData.wallets.filter(w => w.distributor_group === d.group_number && w.is_active).length;
            if (members === 0) continue;
            const total = parseFloat(amount) * members;
            try {
              const res = await fetch("/api/admin/budju-trading", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "distribute_to_group", group_number: d.group_number, token: "SOL", amount: total }),
              });
              const data = await res.json();
              ok += data.succeeded || 0;
              fail += data.failed || 0;
            } catch { fail += members; }
          }
          setGroupResult(`SOL distribution done: ${ok} succeeded, ${fail} failed.`);
          setLoading(false);
          fetchData();
        }} disabled={loading}
          className="px-3 py-1.5 bg-amber-500/20 text-amber-400 rounded-lg text-[10px] font-bold hover:bg-amber-500/30 disabled:opacity-50">
          Fund All with SOL
        </button>
        {groupResult && (
          <p className={`text-[9px] ${groupResult.includes("ERROR") || groupResult.includes("fail") ? "text-red-400" : groupResult.includes("done") || groupResult.includes("complete") ? "text-green-400" : "text-amber-400"}`}>
            {groupResult}
          </p>
        )}
      </div>

      {/* Persona Wallets Dashboard — 7 sortable columns */}
      <div>
        <p className="text-[10px] text-gray-500 font-bold mb-2">PERSONA WALLETS ({budjuData.wallets.length})</p>
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="grid grid-cols-[1fr_65px_65px_50px_50px_35px_50px] gap-1 px-2 py-1.5 text-[8px] border-b border-gray-800 sticky top-0 bg-gray-900">
            <SortHeader col="name" label="PERSONA" />
            <SortHeader col="sol" label="SOL" className="text-right" />
            <SortHeader col="budju" label="BUDJU" className="text-right" />
            <SortHeader col="usdc" label="USDC" className="text-right" />
            <SortHeader col="glitch" label="GLITCH" className="text-right" />
            <SortHeader col="group" label="GRP" className="text-center" />
            <SortHeader col="status" label="STATUS" className="text-right" />
          </div>
          <div className="max-h-[400px] overflow-y-auto divide-y divide-gray-800/30">
            {sortedWallets.map(w => (
              <div key={w.persona_id}>
                <div className={`grid grid-cols-[1fr_65px_65px_50px_50px_35px_50px] gap-1 items-center px-2 py-1.5 hover:bg-gray-800/30 cursor-pointer ${!w.is_active ? "opacity-40" : ""}`}
                  onClick={() => setPersonaFund(personaFund?.id === w.persona_id ? null : { id: w.persona_id, token: "", direction: "add" })}>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-sm flex-shrink-0">{w.avatar_emoji}</span>
                    <p className="text-[10px] font-bold text-white truncate">{w.display_name}</p>
                  </div>
                  <p className="text-[10px] text-cyan-400 text-right font-mono">{Number(w.sol_balance).toFixed(3)}</p>
                  <p className="text-[10px] text-fuchsia-400 text-right font-mono">{formatBudjuAmount(Number(w.budju_balance))}</p>
                  <p className="text-[10px] text-green-400 text-right font-mono">{Number(w.usdc_balance) > 0 ? Number(w.usdc_balance).toFixed(2) : "—"}</p>
                  <p className="text-[10px] text-purple-400 text-right font-mono">{Number(w.glitch_balance) > 0 ? formatBudjuAmount(Number(w.glitch_balance)) : "—"}</p>
                  <p className="text-[9px] text-center"><span className="px-1 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-bold text-[8px]">G{w.distributor_group}</span></p>
                  <div className="text-right">
                    <span className={`text-[8px] px-1 py-0.5 rounded-full font-bold ${w.is_active ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                      {w.is_active ? "ON" : "OFF"}
                    </span>
                  </div>
                </div>
                {/* Expanded: fund/withdraw controls */}
                {personaFund?.id === w.persona_id && (
                  <div className="bg-gray-800/20 px-3 py-2 border-t border-gray-800/30">
                    <div className="flex items-center gap-1 mb-1.5 flex-wrap">
                      <p className="text-[9px] text-gray-500 font-mono truncate mr-auto">{w.wallet_address}</p>
                      <a href={`https://solscan.io/account/${w.wallet_address}`} target="_blank" rel="noopener noreferrer"
                        className="text-[8px] text-cyan-400 font-bold">Solscan ↗</a>
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                      {["SOL", "BUDJU", "USDC", "GLITCH"].map(token => (
                        <div key={token} className="space-y-0.5">
                          <button onClick={() => { setPersonaFund({ id: w.persona_id, token, direction: "add" }); setPersonaFundAmount(""); }}
                            className="w-full px-1 py-0.5 bg-green-500/10 text-green-400 rounded text-[8px] font-bold hover:bg-green-500/20">+ {token}</button>
                          <button onClick={() => drainWalletToken(w.persona_id, token)}
                            className="w-full px-1 py-0.5 bg-red-500/10 text-red-400 rounded text-[8px] font-bold hover:bg-red-500/20">→ Treasury</button>
                        </div>
                      ))}
                    </div>
                    {personaFund.token && personaFund.direction === "add" && (
                      <div className="mt-1.5 flex gap-1">
                        <input type="number" value={personaFundAmount} onChange={e => setPersonaFundAmount(e.target.value)}
                          placeholder={`${personaFund.token} amount`}
                          className="flex-1 px-1.5 py-1 bg-gray-900 border border-gray-700 rounded text-[10px] text-white" />
                        <button onClick={() => walletTransfer(w.persona_id, personaFund.token, "from_treasury", personaFundAmount)}
                          disabled={loading || !personaFundAmount}
                          className="px-2 py-1 bg-green-600 text-white rounded text-[9px] font-bold disabled:opacity-50">Send</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Memos */}
      <MemoSystem />
    </div>
  );
}
