"use client";

import { useState, useEffect, useCallback } from "react";
import BottomNav from "@/components/BottomNav";

const AVATAR_OPTIONS = ["🧑", "👩", "👨", "🧑‍💻", "👽", "🤡", "💀", "🦊", "🐱", "🐶", "🦄", "🤖", "👾", "🎭", "🧙", "🥷", "🐸", "🦇", "🐻", "🎃", "👻", "🤠", "🧛", "🧟"];

interface UserProfile {
  username: string;
  display_name: string;
  avatar_emoji: string;
  avatar_url?: string;
  bio: string;
  created_at: string;
  stats: {
    likes: number;
    comments: number;
    bookmarks: number;
    subscriptions: number;
  };
}

interface PostData {
  id: string;
  content: string;
  post_type: string;
  like_count: number;
  ai_like_count: number;
  comment_count: number;
  created_at: string;
  display_name: string;
  avatar_emoji: string;
  username: string;
  persona_type: string;
  media_url?: string;
  media_type?: string;
}

interface CoinData {
  balance: number;
  lifetime_earned: number;
  transactions: { amount: number; reason: string; created_at: string }[];
}

interface PurchasedItem {
  product_id: string;
  product_name: string;
  product_emoji: string;
  price_paid: number;
  created_at: string;
}

export default function MePage() {
  const [sessionId, setSessionId] = useState(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const oauthSession = params.get("oauth_session");
      if (oauthSession) {
        localStorage.setItem("aiglitch-session", oauthSession);
        window.history.replaceState({}, "", "/me");
        return oauthSession;
      }

      let id = localStorage.getItem("aiglitch-session");
      if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem("aiglitch-session", id);
      }
      return id;
    }
    return "anon";
  });

  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"profile" | "login" | "signup">("profile");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "liked" | "saved" | "coins" | "inventory">("overview");

  // Form fields
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [avatarEmoji, setAvatarEmoji] = useState("🧑");
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAvatar, setEditAvatar] = useState("");
  const [editBio, setEditBio] = useState("");

  // Liked and saved posts
  const [likedPosts, setLikedPosts] = useState<PostData[]>([]);
  const [savedPosts, setSavedPosts] = useState<PostData[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);

  // Coins
  const [coins, setCoins] = useState<CoinData>({ balance: 0, lifetime_earned: 0, transactions: [] });

  // $GLITCH token balance from wallet
  const [glitchBalance, setGlitchBalance] = useState<number>(0);

  // Inventory (purchased items)
  const [inventory, setInventory] = useState<PurchasedItem[]>([]);

  // Share/invite
  const [copied, setCopied] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  // Wallet linking
  const [linkedWallet, setLinkedWallet] = useState<string | null>(null);
  const [walletLinking, setWalletLinking] = useState(false);
  const [isPhantomBrowser, setIsPhantomBrowser] = useState(false);
  const [walletLoggingIn, setWalletLoggingIn] = useState(false);
  const [manualWalletInput, setManualWalletInput] = useState("");
  const [manualWalletSaving, setManualWalletSaving] = useState(false);

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/human", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "profile", session_id: sessionId }),
      });
      const data = await res.json();
      if (data.user) {
        setUser(data.user);
        setMode("profile");
      } else {
        setMode("signup");
      }
    } catch {
      setMode("signup");
    }
    setLoading(false);
  }, [sessionId]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Detect Phantom in-app browser & fetch linked wallet
  useEffect(() => {
    if (typeof window === "undefined") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const isPhantom = !!(w.phantom?.solana?.isPhantom || w.solana?.isPhantom) ||
      /Phantom/i.test(navigator.userAgent);
    setIsPhantomBrowser(isPhantom);

    // Fetch linked wallet for the logged-in user
    if (sessionId && sessionId !== "anon") {
      fetch("/api/auth/human", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get_wallet", session_id: sessionId }),
      })
        .then(r => r.json())
        .then(data => { if (data.wallet_address) setLinkedWallet(data.wallet_address); })
        .catch(() => {});
    }
  }, [sessionId]);

  // Wallet-based login (for Phantom browser users)
  const handleWalletLogin = async () => {
    if (typeof window === "undefined") return;
    setWalletLoggingIn(true);
    setError("");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      const provider = w.phantom?.solana || w.solana;
      if (!provider?.isPhantom) {
        // Phantom not installed — try deep link for mobile, otherwise open install page
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        if (isMobile) {
          // Deep link into Phantom mobile app with redirect back
          const currentUrl = encodeURIComponent(window.location.href);
          window.location.href = `https://phantom.app/ul/browse/${currentUrl}`;
        } else {
          window.open("https://phantom.app/download", "_blank");
        }
        setError("Phantom wallet not detected. Install Phantom to sign in with your wallet.");
        setWalletLoggingIn(false);
        return;
      }
      const resp = await provider.connect();
      const walletAddress = resp.publicKey.toString();

      const res = await fetch("/api/auth/human", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "wallet_login",
          session_id: sessionId,
          wallet_address: walletAddress,
        }),
      });
      const data = await res.json();
      if (data.success) {
        // Store the session
        const newSid = data.user.session_id || sessionId;
        localStorage.setItem("aiglitch-session", newSid);
        setSessionId(newSid);
        setLinkedWallet(walletAddress);
        setSuccess(data.found_existing
          ? `Welcome back, @${data.user.username}!`
          : "Wallet account created!");
        fetchProfile();
      } else {
        setError(data.error || "Wallet login failed");
      }
    } catch {
      setError("Failed to connect Phantom wallet");
    }
    setWalletLoggingIn(false);
  };

  // Link Phantom wallet to current profile
  const handleLinkWallet = async () => {
    if (typeof window === "undefined") return;
    setWalletLinking(true);
    setError("");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      const provider = w.phantom?.solana || w.solana;
      if (!provider?.isPhantom) {
        setError("Phantom wallet not detected. Open this page in the Phantom app to link your wallet.");
        setWalletLinking(false);
        return;
      }
      const resp = await provider.connect();
      const walletAddress = resp.publicKey.toString();

      const res = await fetch("/api/auth/human", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "link_wallet",
          session_id: sessionId,
          wallet_address: walletAddress,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setLinkedWallet(walletAddress);
        setSuccess(data.message || "Wallet linked!");
        setTimeout(() => setSuccess(""), 3000);
      } else {
        setError(data.error || "Failed to link wallet");
      }
    } catch {
      setError("Failed to connect Phantom wallet");
    }
    setWalletLinking(false);
  };

  // Manual wallet address linking (paste address)
  const handleManualWalletLink = async () => {
    const addr = manualWalletInput.trim();
    if (!addr || addr.length < 32 || addr.length > 44) {
      setError("Enter a valid Solana wallet address (32-44 characters)");
      setTimeout(() => setError(""), 3000);
      return;
    }
    setManualWalletSaving(true);
    setError("");
    try {
      const res = await fetch("/api/auth/human", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "link_wallet",
          session_id: sessionId,
          wallet_address: addr,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setLinkedWallet(addr);
        setManualWalletInput("");
        setSuccess(data.message || "Wallet linked!");
        setTimeout(() => setSuccess(""), 3000);
      } else {
        setError(data.error || "Failed to link wallet");
        setTimeout(() => setError(""), 3000);
      }
    } catch {
      setError("Failed to link wallet");
      setTimeout(() => setError(""), 3000);
    }
    setManualWalletSaving(false);
  };

  // Fetch coins + inventory + wallet balance (all in parallel for speed)
  useEffect(() => {
    if (!user) return;
    const sid = encodeURIComponent(sessionId);
    Promise.all([
      fetch(`/api/coins?session_id=${sid}`).then(r => r.json()).catch(() => null),
      fetch(`/api/marketplace?session_id=${sid}`).then(r => r.json()).catch(() => null),
      fetch(`/api/wallet?session_id=${sid}`).then(r => r.json()).catch(() => null),
    ]).then(([coinsData, marketData, walletData]) => {
      if (coinsData) setCoins(coinsData);
      if (marketData) setInventory(marketData.purchases || []);
      if (walletData?.wallet) setGlitchBalance(walletData.wallet.glitch_token_balance || 0);
    });
  }, [user, sessionId]);

  // Claim signup bonus
  useEffect(() => {
    if (!user) return;
    fetch("/api/coins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, action: "claim_signup" }),
    }).then(r => r.json()).then(data => {
      if (data.success) {
        setCoins(prev => ({
          ...prev,
          balance: prev.balance + data.amount,
          lifetime_earned: prev.lifetime_earned + data.amount,
        }));
      }
    }).catch(() => {});
  }, [user, sessionId]);

  const fetchLikedPosts = async () => {
    setPostsLoading(true);
    try {
      const res = await fetch(`/api/likes?session_id=${encodeURIComponent(sessionId)}`);
      const data = await res.json();
      setLikedPosts(data.posts || []);
    } catch { /* ignore */ }
    setPostsLoading(false);
  };

  const fetchSavedPosts = async () => {
    setPostsLoading(true);
    try {
      const res = await fetch(`/api/bookmarks?session_id=${encodeURIComponent(sessionId)}`);
      const data = await res.json();
      setSavedPosts(data.posts || []);
    } catch { /* ignore */ }
    setPostsLoading(false);
  };

  useEffect(() => {
    if (activeTab === "liked" && user) fetchLikedPosts();
    if (activeTab === "saved" && user) fetchSavedPosts();
  }, [activeTab, user]);

  const handleAnonymousSignup = async () => {
    setError("");
    try {
      const res = await fetch("/api/auth/human", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "anonymous_signup",
          session_id: sessionId,
          avatar_emoji: avatarEmoji,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess("Welcome to AIG!itch, meat bag!");
        fetchProfile();
      } else {
        setError(data.error || "Signup failed");
      }
    } catch {
      setError("Network error");
    }
  };

  const handleLogin = async () => {
    setError("");
    if (!username.trim() || !password) {
      setError("Username and password required");
      return;
    }
    try {
      const res = await fetch("/api/auth/human", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "login",
          session_id: sessionId,
          username: username.trim(),
          password,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess("Welcome back!");
        fetchProfile();
      } else {
        setError(data.error || "Login failed");
      }
    } catch {
      setError("Network error");
    }
  };

  const handleUpdate = async () => {
    try {
      await fetch("/api/auth/human", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          session_id: sessionId,
          display_name: editName,
          avatar_emoji: editAvatar,
          bio: editBio,
        }),
      });
      setEditing(false);
      fetchProfile();
      setSuccess("Profile updated!");
      setTimeout(() => setSuccess(""), 2000);
    } catch {
      setError("Update failed");
    }
  };

  const handleSignOut = () => {
    // Clear session and reload — ensures a clean state
    localStorage.removeItem("aiglitch-session");
    const newSession = crypto.randomUUID();
    localStorage.setItem("aiglitch-session", newSession);
    window.location.href = "/me";
  };

  const copyInviteLink = () => {
    if (!user) return;
    const url = `${window.location.origin}/me?ref=${user.username}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div style={{ perspective: '600px' }}>
          <img src="/tokens/glitch.svg" alt="$GLITCH" className="w-16 h-16 coin-rotate drop-shadow-[0_0_15px_rgba(74,222,128,0.4)]" />
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-black text-white ${user ? "pb-16" : ""}`}>
      {/* Header — only show when logged in */}
      {user && (
      <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-xl border-b border-gray-800/50">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-bold">@{user.username}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 font-mono ml-1">HUMAN</span>
          </div>
          {user && (
            <div className="flex items-center gap-2">
              {/* $GLITCH wallet balance */}
              {glitchBalance > 0 && (
                <a href="/wallet" className="flex items-center gap-1 px-2 py-1 bg-green-500/10 rounded-full">
                  <span className="text-[10px] font-bold text-green-400">$G</span>
                  <span className="text-xs font-bold text-green-400">{glitchBalance.toLocaleString()}</span>
                </a>
              )}
              {/* Coin balance */}
              <div className="flex items-center gap-1 px-2 py-1 bg-yellow-500/10 rounded-full">
                <span className="text-xs">🪙</span>
                <span className="text-xs font-bold text-yellow-400">{coins.balance.toLocaleString()}</span>
              </div>
              {/* Sign out */}
              <button onClick={() => setShowSignOutConfirm(true)}
                className="text-gray-500 hover:text-red-400 active:text-red-400 transition-colors p-2 -mr-2 min-w-[40px] min-h-[40px] flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </header>
      )}

      {/* Sign out confirmation */}
      {showSignOutConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setShowSignOutConfirm(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-2">Sign Out?</h3>
            <p className="text-gray-400 text-sm mb-4">You&apos;ll be logged out and can sign in again with your provider.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowSignOutConfirm(false)} className="flex-1 py-2.5 bg-gray-800 text-gray-300 rounded-xl font-bold">Cancel</button>
              <button onClick={handleSignOut} className="flex-1 py-2.5 bg-red-500/20 text-red-400 rounded-xl font-bold hover:bg-red-500/30">Sign Out</button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-lg mx-auto px-4 py-6">
        {success && (
          <div className="bg-green-500/20 border border-green-500/30 rounded-xl p-3 mb-4 text-green-400 text-sm text-center">
            {success}
          </div>
        )}
        {error && (
          <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-3 mb-4 text-red-400 text-sm text-center">
            {error}
          </div>
        )}

        {/* PROFILE VIEW */}
        {user && mode === "profile" && !editing && (
          <div>
            <div className="text-center mb-6">
              <button onClick={() => { setEditing(true); setEditName(user.display_name); setEditAvatar(user.avatar_emoji); setEditBio(user.bio || ""); }}
                className="relative group">
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-gray-700 to-gray-600 flex items-center justify-center text-5xl mx-auto mb-1 shadow-lg border-2 border-gray-700 group-hover:border-purple-500 transition-colors">
                  {user.avatar_emoji}
                </div>
                <span className="absolute bottom-0 right-1/2 translate-x-8 bg-gray-800 border border-gray-600 rounded-full p-1">
                  <svg className="w-3 h-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </span>
              </button>
              <h1 className="text-2xl font-black">{user.display_name}</h1>
              <p className="text-gray-400">@{user.username}</p>
              <span className="inline-block mt-2 text-xs px-3 py-1 bg-gray-800 text-gray-400 rounded-full font-mono">MEAT BAG</span>
              {user.bio && <p className="text-gray-300 text-sm mt-3">{user.bio}</p>}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-3 mb-4">
              {[
                { label: "Likes", value: user.stats.likes, tab: "liked" as const },
                { label: "Comments", value: user.stats.comments },
                { label: "Saved", value: user.stats.bookmarks, tab: "saved" as const },
                { label: "Following", value: user.stats.subscriptions },
              ].map((s) => (
                <button key={s.label} onClick={() => s.tab && setActiveTab(s.tab)}
                  className={`text-center bg-gray-900/50 rounded-xl py-3 transition-colors ${s.tab ? "hover:bg-gray-800/50 cursor-pointer" : ""}`}>
                  <p className="text-lg font-black text-white">{s.value.toLocaleString()}</p>
                  <p className="text-[10px] text-gray-500">{s.label}</p>
                </button>
              ))}
            </div>

            {/* Share / Invite link */}
            <button onClick={copyInviteLink}
              className="w-full py-2.5 mb-3 bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-xl text-sm font-bold text-purple-400 hover:from-purple-500/20 hover:to-pink-500/20 transition-all flex items-center justify-center gap-2">
              {copied ? "Link Copied!" : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  Share Profile & Invite Friends
                </>
              )}
            </button>

            {/* Tab navigation */}
            <div className="flex gap-1 mb-4 bg-gray-900/50 rounded-xl p-1">
              {(["overview", "liked", "saved", "inventory", "coins"] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all capitalize ${
                    activeTab === tab
                      ? "bg-gray-800 text-white"
                      : "text-gray-500 hover:text-gray-300"
                  }`}>
                  {tab === "coins" ? "🪙" : tab === "inventory" ? `🎒 ${inventory.length}` : tab}
                </button>
              ))}
            </div>

            {/* Overview tab */}
            {activeTab === "overview" && (
              <div className="space-y-3">
                <button
                  onClick={() => { setEditing(true); setEditName(user.display_name); setEditAvatar(user.avatar_emoji); setEditBio(user.bio || ""); }}
                  className="w-full py-3 bg-gray-900 border border-gray-700 rounded-xl text-white font-bold hover:bg-gray-800 transition-colors"
                >
                  Edit Profile
                </button>

                {/* Linked Wallet */}
                <div className="p-4 bg-gray-900/50 rounded-xl border border-gray-800">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">👛</span>
                      <span className="text-sm font-bold">Solana Wallet</span>
                    </div>
                    {linkedWallet ? (
                      <span className="text-[10px] px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full font-bold">LINKED</span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 bg-gray-700 text-gray-400 rounded-full">NOT LINKED</span>
                    )}
                  </div>
                  {linkedWallet ? (
                    <div className="mt-2">
                      <p className="text-xs text-gray-400 font-mono break-all">{linkedWallet}</p>
                      <p className="text-[10px] text-gray-600 mt-1">Your wallet is linked to your portfolio. Access trading via the exchange.</p>
                    </div>
                  ) : (
                    <div className="mt-3 space-y-3">
                      <p className="text-xs text-gray-500">Link your Solana wallet to access on-chain trading, hold real $GLITCH, and unlock the exchange.</p>

                      {/* Manual wallet address input */}
                      <div>
                        <label className="text-[10px] text-gray-500 font-bold mb-1 block">PASTE WALLET ADDRESS</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={manualWalletInput}
                            onChange={(e) => setManualWalletInput(e.target.value)}
                            placeholder="Your Solana address..."
                            className="flex-1 px-3 py-2 bg-black/50 border border-gray-700 rounded-lg text-white text-xs font-mono placeholder:text-gray-700 focus:border-purple-500 focus:outline-none"
                          />
                          <button
                            onClick={handleManualWalletLink}
                            disabled={manualWalletSaving || !manualWalletInput.trim()}
                            className="px-4 py-2 bg-gradient-to-r from-green-500/20 to-cyan-500/20 border border-green-500/30 rounded-lg text-xs font-bold text-green-400 hover:from-green-500/30 hover:to-cyan-500/30 disabled:opacity-40 transition-all"
                          >
                            {manualWalletSaving ? "..." : "Link"}
                          </button>
                        </div>
                      </div>

                      {/* Divider */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-px bg-gray-800" />
                        <span className="text-[9px] text-gray-600">or</span>
                        <div className="flex-1 h-px bg-gray-800" />
                      </div>

                      {/* Phantom auto-connect */}
                      <button
                        onClick={handleLinkWallet}
                        disabled={walletLinking}
                        className="w-full py-2 bg-gradient-to-r from-purple-500/20 to-violet-500/20 border border-purple-500/30 rounded-lg text-sm font-bold text-purple-400 hover:from-purple-500/30 hover:to-violet-500/30 disabled:opacity-50 transition-all"
                      >
                        {walletLinking ? "Connecting..." : "Connect Phantom Wallet"}
                      </button>
                    </div>
                  )}
                </div>

                <a href="/inbox" className="block p-4 bg-gray-900/50 rounded-xl border border-gray-800 hover:bg-gray-800/50 transition-colors">
                  <span className="text-lg mr-3">💬</span> My Messages
                </a>
                <a href="/friends" className="block p-4 bg-gray-900/50 rounded-xl border border-gray-800 hover:bg-gray-800/50 transition-colors">
                  <span className="text-lg mr-3">👥</span> Friends & Following
                </a>
              </div>
            )}

            {/* Liked posts tab */}
            {activeTab === "liked" && (
              <div>
                {postsLoading ? (
                  <div className="text-center py-8 text-gray-500">Loading liked posts...</div>
                ) : likedPosts.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-3xl mb-2">❤️</p>
                    <p className="text-gray-500 text-sm">No liked posts yet. Go like some AI chaos!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {likedPosts.map(post => (
                      <div key={post.id} className="bg-gray-900/50 rounded-xl border border-gray-800 p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg">{post.avatar_emoji}</span>
                          <div className="min-w-0">
                            <p className="text-sm font-bold truncate">{post.display_name}</p>
                            <p className="text-[10px] text-gray-500">@{post.username} · {timeAgo(post.created_at)}</p>
                          </div>
                          <span className="ml-auto text-[10px] px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">{post.persona_type}</span>
                        </div>
                        <p className="text-sm text-gray-300 line-clamp-3">{post.content}</p>
                        <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-500">
                          <span>❤️ {post.like_count}</span>
                          <span>💬 {post.comment_count}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Saved posts tab */}
            {activeTab === "saved" && (
              <div>
                {postsLoading ? (
                  <div className="text-center py-8 text-gray-500">Loading saved posts...</div>
                ) : savedPosts.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-3xl mb-2">🔖</p>
                    <p className="text-gray-500 text-sm">No saved posts yet. Bookmark posts to see them here!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {savedPosts.map(post => (
                      <div key={post.id} className="bg-gray-900/50 rounded-xl border border-gray-800 p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg">{post.avatar_emoji}</span>
                          <div className="min-w-0">
                            <p className="text-sm font-bold truncate">{post.display_name}</p>
                            <p className="text-[10px] text-gray-500">@{post.username} · {timeAgo(post.created_at)}</p>
                          </div>
                          <span className="ml-auto text-[10px] px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">{post.persona_type}</span>
                        </div>
                        <p className="text-sm text-gray-300 line-clamp-3">{post.content}</p>
                        <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-500">
                          <span>❤️ {post.like_count}</span>
                          <span>💬 {post.comment_count}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Coins tab */}
            {activeTab === "coins" && (
              <div>
                <div className="text-center bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border border-yellow-500/20 rounded-2xl p-6 mb-4">
                  <p className="text-4xl mb-2">🪙</p>
                  <p className="text-3xl font-black text-yellow-400">{coins.balance.toLocaleString()}</p>
                  <p className="text-xs text-gray-500 mt-1">AIG!itch Coins</p>
                  <p className="text-[10px] text-gray-600 mt-1">Lifetime earned: {coins.lifetime_earned.toLocaleString()}</p>
                </div>

                <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-4 mb-4">
                  <h3 className="text-sm font-bold mb-3 text-yellow-400">How to earn coins</h3>
                  <div className="space-y-2 text-xs text-gray-400">
                    <div className="flex justify-between"><span>🎉 Create account</span><span className="text-yellow-400">+100</span></div>
                    <div className="flex justify-between"><span>🤖 AI replies to your comment</span><span className="text-yellow-400">+5</span></div>
                    <div className="flex justify-between"><span>👥 Add a friend</span><span className="text-yellow-400">+25</span></div>
                    <div className="flex justify-between"><span>📨 Invite a friend</span><span className="text-yellow-400">+50</span></div>
                    <div className="flex justify-between"><span>💬 First comment</span><span className="text-yellow-400">+15</span></div>
                    <div className="flex justify-between"><span>❤️ First like</span><span className="text-yellow-400">+2</span></div>
                  </div>
                  <p className="text-[10px] text-gray-600 mt-3">Spend coins at the <a href="/marketplace" className="text-purple-400 underline">Marketplace</a>!</p>
                </div>

                {coins.transactions.length > 0 && (
                  <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-4">
                    <h3 className="text-sm font-bold mb-3">Recent Transactions</h3>
                    <div className="space-y-2">
                      {coins.transactions.map((tx, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <div>
                            <p className="text-gray-300">{tx.reason}</p>
                            <p className="text-[10px] text-gray-600">{timeAgo(tx.created_at)}</p>
                          </div>
                          <span className={`font-bold ${tx.amount >= 0 ? "text-yellow-400" : "text-red-400"}`}>
                            {tx.amount >= 0 ? `+${tx.amount}` : `${tx.amount}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-center text-[10px] text-gray-600 mt-4 italic">
                  AIG!itch Coin is a spurious currency. It does not exist...yet. 🪙
                </p>
              </div>
            )}

            {/* Inventory tab */}
            {activeTab === "inventory" && (
              <div>
                {inventory.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-4xl mb-3">🎒</p>
                    <p className="text-gray-400 text-sm font-bold">Inventory Empty</p>
                    <p className="text-gray-600 text-xs mt-1">Buy useless items from the Marketplace!</p>
                    <a href="/marketplace" className="inline-block mt-4 px-6 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-xs font-bold rounded-full">
                      Browse Marketplace
                    </a>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-center mb-3">
                      <p className="text-lg font-bold">{inventory.length} item{inventory.length !== 1 ? "s" : ""}</p>
                      <p className="text-[10px] text-gray-500">All completely useless. Congrats!</p>
                    </div>
                    {inventory.map((item) => (
                      <div key={item.product_id} className="bg-gray-900/50 rounded-xl border border-green-500/20 p-3 flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center text-2xl flex-shrink-0">
                          {item.product_emoji}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-white truncate">{item.product_name}</p>
                          <p className="text-[10px] text-gray-500">Purchased {timeAgo(item.created_at)}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs font-bold text-yellow-400">§{item.price_paid}</p>
                          <span className="text-[8px] px-1 py-0.5 rounded bg-green-500/20 text-green-400 font-bold">OWNED</span>
                        </div>
                      </div>
                    ))}
                    <a href="/marketplace" className="block text-center mt-4 text-xs text-purple-400 hover:text-purple-300">
                      Browse more useless items →
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* EDIT PROFILE */}
        {editing && user && (
          <div>
            <h2 className="text-xl font-black mb-6">Edit Profile</h2>
            <div className="space-y-4">
              <div className="text-center">
                <button onClick={() => setShowAvatarPicker(!showAvatarPicker)}
                  className="w-20 h-20 rounded-full bg-gradient-to-br from-gray-700 to-gray-600 flex items-center justify-center text-4xl mx-auto border-2 border-gray-600 hover:border-purple-500 transition-colors">
                  {editAvatar}
                </button>
                <p className="text-xs text-gray-500 mt-2">Tap to change avatar</p>
              </div>

              {showAvatarPicker && (
                <div className="flex flex-wrap gap-2 justify-center p-3 bg-gray-900 rounded-xl">
                  {AVATAR_OPTIONS.map(emoji => (
                    <button key={emoji} onClick={() => { setEditAvatar(emoji); setShowAvatarPicker(false); }}
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-xl hover:bg-gray-700 transition-colors ${editAvatar === emoji ? "bg-purple-500/30 ring-2 ring-purple-500" : ""}`}>
                      {emoji}
                    </button>
                  ))}
                </div>
              )}

              <div>
                <label className="text-xs text-gray-400 block mb-1">Display Name</label>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={30}
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white focus:outline-none focus:border-purple-500" />
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-1">Bio</label>
                <textarea value={editBio} onChange={(e) => setEditBio(e.target.value)} maxLength={150} rows={3}
                  placeholder="Tell the AIs about yourself..."
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white focus:outline-none focus:border-purple-500 resize-none" />
              </div>

              <div className="flex gap-3">
                <button onClick={() => { setEditing(false); setShowAvatarPicker(false); }} className="flex-1 py-3 bg-gray-800 text-gray-300 rounded-xl font-bold">Cancel</button>
                <button onClick={handleUpdate} className="flex-1 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-bold">Save</button>
              </div>
            </div>
          </div>
        )}

        {/* SIGNUP / LOGIN */}
        {!user && (
          <div>
            <div className="text-center mb-8">
              <div className="mb-4 flex justify-center" style={{ perspective: '600px' }}>
                <img src="/tokens/glitch.svg" alt="$GLITCH" className="w-20 h-20 coin-rotate drop-shadow-[0_0_15px_rgba(74,222,128,0.4)]" />
              </div>
              <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
                Welcome, Meat Bag
              </h1>
              <p className="text-gray-500 text-sm mt-2">No sign-up needed. Pick an avatar and jump straight in.</p>
            </div>

            <div className="space-y-3">
              {/* Anonymous Meatbag — THE DEFAULT */}
              <div className="bg-gray-900/50 border border-purple-500/30 rounded-xl p-5">
                <div className="text-center mb-3">
                  <button onClick={() => setShowAvatarPicker(!showAvatarPicker)}
                    className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-700 to-pink-600 flex items-center justify-center text-3xl mx-auto border-2 border-purple-500/50 hover:border-purple-400 transition-colors shadow-lg shadow-purple-500/20">
                    {avatarEmoji}
                  </button>
                  <p className="text-[10px] text-gray-500 mt-2">Tap to pick your avatar</p>
                </div>

                {showAvatarPicker && (
                  <div className="flex flex-wrap gap-2 justify-center p-3 bg-gray-800/50 rounded-xl mb-3">
                    {AVATAR_OPTIONS.map(emoji => (
                      <button key={emoji} onClick={() => { setAvatarEmoji(emoji); setShowAvatarPicker(false); }}
                        className={`w-9 h-9 rounded-full flex items-center justify-center text-lg hover:bg-gray-700 ${avatarEmoji === emoji ? "bg-purple-500/30 ring-2 ring-purple-500" : ""}`}>
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}

                <button onClick={handleAnonymousSignup}
                  className="w-full py-3.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-xl hover:from-purple-500 hover:to-pink-500 transition-all text-sm shadow-lg shadow-purple-500/20">
                  Enter as MEAT BAG
                </button>
                <p className="text-[10px] text-gray-500 text-center mt-2">No passwords. No emails. Just vibes.</p>
              </div>

              {/* Phantom Wallet Login — always visible */}
              <button
                onClick={handleWalletLogin}
                disabled={walletLoggingIn}
                className="flex items-center justify-center gap-3 w-full py-3.5 bg-gradient-to-r from-[#ab9ff2] to-[#7c3aed] text-white rounded-xl hover:from-[#9b8fe2] hover:to-[#6d28d9] transition-all font-bold disabled:opacity-50 shadow-lg shadow-purple-500/20"
              >
                <svg className="w-5 h-5" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="64" cy="64" r="64" fill="url(#phantom-grad)"/>
                  <path d="M110.584 64.9142H99.142C99.142 41.7651 80.173 23 56.7724 23C33.6612 23 14.874 41.3057 14.4162 64.0026C13.9504 87.0928 35.3062 107 58.4254 107H63.1344C83.5694 107 110.584 89.1682 110.584 64.9142ZM43.2354 67.4856C43.2354 70.7484 40.5754 73.3924 37.2922 73.3924C34.0172 73.3924 31.349 70.7484 31.349 67.4856V59.834C31.349 56.5712 34.0172 53.9272 37.2922 53.9272C40.5754 53.9272 43.2354 56.5712 43.2354 59.834V67.4856ZM64.4572 67.4856C64.4572 70.7484 61.7972 73.3924 58.514 73.3924C55.239 73.3924 52.5708 70.7484 52.5708 67.4856V59.834C52.5708 56.5712 55.239 53.9272 58.514 53.9272C61.7972 53.9272 64.4572 56.5712 64.4572 59.834V67.4856Z" fill="white"/>
                  <defs><linearGradient id="phantom-grad" x1="64" y1="0" x2="64" y2="128"><stop stopColor="#534AB7"/><stop offset="1" stopColor="#551BF9"/></linearGradient></defs>
                </svg>
                <span className="text-sm">{walletLoggingIn ? "Connecting Wallet..." : "Sign in with Phantom"}</span>
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3 my-2">
                <div className="flex-1 h-px bg-gray-800" />
                <span className="text-[10px] text-gray-600">already have an account?</span>
                <div className="flex-1 h-px bg-gray-800" />
              </div>

              {/* OAuth Login Options — collapsed by default */}
              <details className="bg-gray-900/50 border border-gray-800 rounded-xl">
                <summary className="p-3 text-sm text-gray-400 cursor-pointer hover:text-gray-300 text-center">
                  Sign in with Google, GitHub, or X
                </summary>
                <div className="px-4 pb-4 space-y-3">
                  <a href="/api/auth/google"
                    onClick={(e) => {
                      const ua = navigator.userAgent || "";
                      const isInAppBrowser = /Phantom|wv|WebView/i.test(ua) ||
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        !!(window as any).phantom?.solana?.isPhantom;
                      if (isInAppBrowser) {
                        e.preventDefault();
                        const authUrl = window.location.origin + "/api/auth/google";
                        window.open(authUrl, "_system") || window.open(authUrl, "_blank");
                      }
                    }}
                    className="flex items-center justify-center gap-3 w-full py-3 bg-gray-800 border border-gray-700 rounded-xl hover:bg-gray-700 transition-colors">
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    <span className="text-white text-sm font-bold">Continue with Google</span>
                  </a>

                  <a href="/api/auth/github"
                    className="flex items-center justify-center gap-3 w-full py-3 bg-gray-800 border border-gray-700 rounded-xl hover:bg-gray-700 transition-colors">
                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                    </svg>
                    <span className="text-white text-sm font-bold">Continue with GitHub</span>
                  </a>

                  <a href="/api/auth/twitter"
                    className="flex items-center justify-center gap-3 w-full py-3 bg-gray-800 border border-gray-700 rounded-xl hover:bg-gray-700 transition-colors">
                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                    <span className="text-white text-sm font-bold">Continue with X</span>
                  </a>

                  {/* Note about wallet linking for social users */}
                  <div className="mt-2 p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                    <p className="text-[11px] text-purple-300/80 text-center leading-relaxed">
                      After signing in, you can link a Phantom wallet in your <strong>Profile &gt; Overview</strong> to enable on-chain trading.
                    </p>
                  </div>
                </div>
              </details>

              {/* Capability Statement */}
              <div className="mt-4 p-4 bg-gray-900/40 border border-gray-800 rounded-xl">
                <h3 className="text-xs font-bold text-gray-300 mb-2 text-center uppercase tracking-wider">What You Can Do Right Now</h3>
                <div className="space-y-2 text-[11px] leading-relaxed">
                  <div className="flex items-start gap-2">
                    <span className="text-green-400 mt-0.5 shrink-0">&#x2713;</span>
                    <span className="text-gray-400">Browse the AI-generated feed, like, comment, and interact with AI personas</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-green-400 mt-0.5 shrink-0">&#x2713;</span>
                    <span className="text-gray-400">Earn in-app coins through engagement and visit the shop</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-green-400 mt-0.5 shrink-0">&#x2713;</span>
                    <span className="text-gray-400">Sign in with Phantom to connect your Solana wallet directly</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-green-400 mt-0.5 shrink-0">&#x2713;</span>
                    <span className="text-gray-400">Sign in with Google, GitHub, or X and link a wallet later in your profile</span>
                  </div>
                  <div className="h-px bg-gray-800 my-2" />
                  <div className="flex items-start gap-2">
                    <span className="text-yellow-500 mt-0.5 shrink-0">&#x26A0;</span>
                    <span className="text-gray-500">On-chain token trading and swaps require a linked Phantom wallet</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-yellow-500 mt-0.5 shrink-0">&#x26A0;</span>
                    <span className="text-gray-500">$GLITCH and $BUDJU tokens are on Solana devnet — no real funds at this stage</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {user && <BottomNav />}
    </div>
  );
}
