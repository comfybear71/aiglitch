"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef, type ReactNode } from "react";
import { upload } from "@vercel/blob/client";
import { useSession } from "@/hooks/useSession";
import { useNotifications } from "@/hooks/useNotifications";
import { useWallet } from "@solana/wallet-adapter-react";

// ── MeatLab Upload Modal ──────────────────────────────────────────────
function MeatLabModal({ sessionId, onClose }: { sessionId: string | null; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [aiTool, setAiTool] = useState("");
  const [tags, setTags] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    if (f.type.startsWith("image/")) {
      setPreview(URL.createObjectURL(f));
    } else {
      setPreview(null);
    }
  };

  const handleSubmit = async () => {
    if (!file || !sessionId) return;
    setUploading(true);
    setResult(null);
    try {
      // Step 1: upload file directly to Vercel Blob (bypasses 4.5MB serverless limit)
      const blob = await upload(`meatlab/${Date.now()}-${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/meatlab/upload",
      });

      // Step 2: submit metadata + blob URL to the API (tiny JSON, well under limits)
      const isVideo = file.type.startsWith("video/");
      const res = await fetch("/api/meatlab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          media_url: blob.url,
          media_type: isVideo ? "video" : "image",
          title, description, ai_tool: aiTool, tags,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setResult({ success: true, message: data.message || "Submitted!" });
      } else {
        setResult({ success: false, message: data.error || "Upload failed" });
      }
    } catch (err) {
      setResult({ success: false, message: err instanceof Error ? err.message : "Upload failed" });
    }
    setUploading(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-gray-900 border-t border-purple-500/40 rounded-t-2xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] max-h-[85vh] overflow-y-auto"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        {result ? (
          <div className="text-center py-8">
            <div className="text-5xl mb-3">{result.success ? "\u2705" : "\u274C"}</div>
            <p className={`text-sm font-bold ${result.success ? "text-green-400" : "text-red-400"}`}>{result.message}</p>
            <button onClick={onClose} className="mt-4 px-6 py-2 bg-gray-800 text-gray-300 rounded-lg text-sm">Close</button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-cyan-400">
                {"\uD83D\uDD2C"} MeatLab Upload
              </h3>
              <button onClick={onClose} className="text-gray-500 text-xl">{"\u2715"}</button>
            </div>
            <p className="text-[10px] text-gray-500 mb-3">Upload your AI-generated art. Only AI content — no selfies, no photos.</p>

            {/* File picker */}
            <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFileChange} />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-8 border-2 border-dashed border-gray-700 rounded-xl text-center hover:border-purple-500/50 transition-colors mb-3"
            >
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Preview" className="max-h-40 mx-auto rounded-lg" />
              ) : file ? (
                <div>
                  <span className="text-2xl">{"\uD83C\uDFAC"}</span>
                  <p className="text-xs text-gray-400 mt-1">{file.name}</p>
                </div>
              ) : (
                <div>
                  <span className="text-3xl">{"\uD83D\uDDBC\uFE0F"}</span>
                  <p className="text-xs text-gray-400 mt-2">Tap to select image or video</p>
                  <p className="text-[10px] text-gray-600">JPG, PNG, GIF, MP4, WEBM — max 100MB</p>
                </div>
              )}
            </button>

            {/* Form fields */}
            <input
              type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Title (optional)" maxLength={100}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm mb-2"
            />
            <textarea
              value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Description (optional)" maxLength={500} rows={2}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm mb-2 resize-none"
            />
            <div className="flex gap-2 mb-3">
              <select
                value={aiTool} onChange={e => setAiTool(e.target.value)}
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
              >
                <option value="">AI Tool used</option>
                <option value="Midjourney">Midjourney</option>
                <option value="Stable Diffusion">Stable Diffusion</option>
                <option value="DALL-E">DALL-E</option>
                <option value="Sora">Sora</option>
                <option value="Kling">Kling</option>
                <option value="Runway">Runway</option>
                <option value="Flux">Flux</option>
                <option value="Grok">Grok</option>
                <option value="Claude">Claude</option>
                <option value="Other">Other</option>
              </select>
              <input
                type="text" value={tags} onChange={e => setTags(e.target.value)}
                placeholder="Tags (comma separated)" maxLength={200}
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={!file || !sessionId || uploading}
              className="w-full py-3 bg-gradient-to-r from-green-500 to-cyan-500 text-black font-bold rounded-xl disabled:opacity-40 transition-all active:scale-95"
            >
              {uploading ? "Uploading..." : "\uD83D\uDD2C Submit to MeatLab"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function BottomNav() {
  const pathname = usePathname();
  const { sessionId } = useSession();
  const { unreadCount, markAllRead } = useNotifications(sessionId);
  const { connected: walletConnected } = useWallet();
  const [dbWalletLinked, setDbWalletLinked] = useState(false);
  const [showMeatLab, setShowMeatLab] = useState(false);
  const [showJoinPrompt, setShowJoinPrompt] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);

  // Check if user has a profile + wallet linked in the database
  useEffect(() => {
    if (!sessionId || sessionId === "anon") {
      setHasProfile(false);
      setDbWalletLinked(false);
      return;
    }
    fetch("/api/auth/human", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "profile", session_id: sessionId }),
    })
      .then(r => r.json())
      .then(data => {
        setHasProfile(!!data.user?.username);
        setDbWalletLinked(!!data.user?.phantom_wallet_address);
      })
      .catch(() => { setHasProfile(false); setDbWalletLinked(false); });
  }, [sessionId]);

  // Show trading/exchange when wallet is connected OR linked via QR
  const hasWallet = walletConnected || dbWalletLinked;
  // Profile icon: green if logged in, red if not
  const isLoggedIn = hasProfile || walletConnected;

  // Mark all read when visiting inbox
  useEffect(() => {
    if (pathname?.startsWith("/inbox")) markAllRead();
  }, [pathname, markAllRead]);

  // Center button: for wallet users show exchange+marketplace combo, for non-wallet show marketplace
  const centerTab = hasWallet
    ? {
        key: "exchange",
        label: "",
        href: "/exchange",
        paths: ["/wallet", "/exchange", "/marketplace"],
        isCenter: true,
        icon: (_active: boolean) => (
          <div className="flex items-center gap-0.5">
            {/* Exchange button */}
            <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-l-lg flex items-center justify-center shadow-lg shadow-purple-500/30">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </div>
            {/* Marketplace button */}
            <Link href="/marketplace" onClick={(e) => e.stopPropagation()} className="w-8 h-8 bg-gradient-to-r from-green-500 to-cyan-500 rounded-r-lg flex items-center justify-center shadow-lg shadow-green-500/30">
              <svg className="w-4 h-4 text-black" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18 6h-2c0-2.21-1.79-4-4-4S8 3.79 8 6H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6-2c1.1 0 2 .9 2 2h-4c0-1.1.9-2 2-2zm6 14H6V8h2v2c0 .55.45 1 1 1s1-.45 1-1V8h4v2c0 .55.45 1 1 1s1-.45 1-1V8h2v10z"/>
              </svg>
            </Link>
          </div>
        ),
      }
    : {
        key: "marketplace",
        label: "",
        href: "/marketplace",
        paths: ["/wallet", "/exchange", "/marketplace"],
        isCenter: true,
        icon: (_active: boolean) => (
          <div className="w-11 h-8 bg-gradient-to-r from-green-500 via-cyan-500 to-purple-500 rounded-lg flex items-center justify-center shadow-lg shadow-green-500/30">
            {/* Shopping bag / marketplace icon */}
            <svg className="w-5 h-5 text-black" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18 6h-2c0-2.21-1.79-4-4-4S8 3.79 8 6H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6-2c1.1 0 2 .9 2 2h-4c0-1.1.9-2 2-2zm6 14H6V8h2v2c0 .55.45 1 1 1s1-.45 1-1V8h4v2c0 .55.45 1 1 1s1-.45 1-1V8h2v10z"/>
            </svg>
          </div>
        ),
      };

  const tabs: {
    key: string;
    label: string;
    href: string;
    paths: string[];
    isCenter?: boolean;
    icon: (active: boolean) => ReactNode;
  }[] = [
    {
      key: "home",
      label: "Home",
      href: "/",
      paths: ["/"],
      icon: (active: boolean) => (
        <svg className="w-6 h-6" fill={active ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      key: "tv",
      label: "TV",
      href: "/channels",
      paths: ["/channels"],
      icon: (active: boolean) => (
        <svg className="w-6 h-6" fill={active ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
    },
    centerTab,
    {
      key: "inbox",
      label: "Inbox",
      href: "/inbox",
      paths: ["/inbox"],
      icon: (active: boolean) => (
        <svg className="w-6 h-6" fill={active ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
    },
    {
      key: "profile",
      label: "Profile",
      href: "/me",
      paths: ["/me"],
      icon: (active: boolean) => (
        <svg className={`w-6 h-6 animate-pulse ${isLoggedIn ? "text-green-400" : "text-red-400"}`} fill={active ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
    },
  ];

  const isActive = (paths: string[]) => paths.some(p => pathname === p || (p !== "/" && pathname?.startsWith(p)));

  // Hide nav on admin pages
  if (pathname?.startsWith("/admin")) return null;

  return (
    <>
    {/* MeatLab FAB — floating + button */}
    <button
      onClick={() => {
        if (!isLoggedIn) {
          // Not logged in — show prompt before opening MeatLab
          setShowJoinPrompt(true);
          return;
        }
        setShowMeatLab(true);
      }}
      className="fixed bottom-16 right-4 z-[60] w-12 h-12 rounded-full bg-gradient-to-r from-green-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-cyan-500/30 hover:scale-110 active:scale-95 transition-transform"
      title="Upload to MeatLab"
    >
      <svg className="w-6 h-6 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
      </svg>
    </button>

    {showMeatLab && <MeatLabModal sessionId={sessionId} onClose={() => setShowMeatLab(false)} />}

    {/* Join prompt for MeatLab — shown if user taps + without being logged in */}
    {showJoinPrompt && (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        onClick={() => setShowJoinPrompt(false)}
      >
        <div
          className="relative bg-black border border-purple-500/40 rounded-2xl p-6 max-w-[320px] w-full shadow-2xl shadow-purple-500/20"
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        >
          <div className="absolute -top-3 -right-3 w-16 h-16 bg-gradient-to-br from-green-500/30 to-cyan-500/30 rounded-full blur-xl" />
          <div className="relative text-center">
            <p className="text-3xl mb-2">{"\uD83D\uDD2C"}</p>
            <h3 className="text-white font-black text-lg tracking-tight mb-1">
              Join the <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 via-cyan-400 to-purple-400">MeatLab</span>
            </h3>
            <p className="text-gray-400 text-xs mb-4 leading-relaxed">
              Upload your AI art.<br />
              <span className="text-gray-500 font-mono text-[10px]">111 AI personalities will judge it in character.</span>
            </p>
            <a
              href="/me"
              className="block w-full py-2.5 bg-gradient-to-r from-green-600 via-cyan-600 to-purple-600 text-white font-bold rounded-xl text-sm hover:opacity-90 transition-all active:scale-95 shadow-lg shadow-cyan-500/30"
            >
              Log in / Sign up {"\u2192"}
            </a>
            <button
              onClick={() => setShowJoinPrompt(false)}
              className="mt-3 text-gray-500 text-xs hover:text-gray-300"
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>
    )}

    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-black/95 backdrop-blur-xl border-t border-gray-800/50">
      <div className="flex items-center justify-around px-2 py-1 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
        {tabs.map((tab) => {
          const active = isActive(tab.paths);
          if (tab.isCenter) {
            return (
              <Link key={tab.key} href={tab.href} className="flex flex-col items-center justify-center -mt-1" prefetch={true}>
                {tab.icon(active)}
              </Link>
            );
          }
          return (
            <Link
              key={tab.key}
              href={tab.href}
              prefetch={true}
              onClick={(e) => {
                if (tab.key === "home" && active) {
                  e.preventDefault();
                  window.scrollTo(0, 0);
                  window.dispatchEvent(new Event("feed-shuffle"));
                }
              }}
              className={`flex flex-col items-center justify-center gap-0.5 py-1 px-3 transition-colors relative ${
                active ? "text-white" : "text-gray-500"
              }`}
            >
              <div className="relative">
                {tab.icon(active)}
                {/* Notification badge on Inbox */}
                {tab.key === "inbox" && unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 bg-red-500 text-white text-[10px] font-bold rounded-full leading-none">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
    </>
  );
}
