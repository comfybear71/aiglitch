"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import BottomNav from "@/components/BottomNav";
import NFTTradingCard from "@/components/NFTTradingCard";
import { getProductById } from "@/lib/marketplace";
import { formatGlitchBalance } from "@/lib/wallet-display";

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

// iOS Safari throws "The string did not match the expected pattern" (TypeError)
// when fetch() uses a relative URL after Phantom wallet extension popup changes focus.
// Always use absolute URLs to avoid this WebKit URL resolution bug.
function apiUrl(path: string): string {
  if (typeof window !== "undefined") return window.location.origin + path;
  return path;
}

// Build Phantom browse deep link with proper encoding.
// The ref parameter is REQUIRED by Phantom's deep link spec — without it,
// Phantom opens its home screen instead of navigating into the target URL.
function buildPhantomBrowseLink(targetUrl: string): string {
  const encoded = encodeURIComponent(targetUrl);
  const ref = encodeURIComponent(typeof window !== "undefined" ? window.location.origin : "https://aiglitch.app");
  return `https://phantom.app/ul/browse/${encoded}?ref=${ref}`;
}

export default function MePage() {
  // Track if we arrived from a Phantom deep link (for auto-connect / auto-login)
  const phantomDeepLinkedRef = useRef(false);
  const phantomLoginLinkedRef = useRef(false);

  // Use wallet adapter hooks
  const { publicKey: walletPublicKey, connected: walletConnected, connect: walletConnect, select: walletSelect, wallets, signTransaction: walletSignTransaction } = useWallet();

  // Visible debug log for diagnosing wallet connection issues on mobile
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  // Show a tappable deep link when connect fails on iOS
  const [showPhantomDeepLink, setShowPhantomDeepLink] = useState<"login" | "link" | null>(null);
  const addDebug = useCallback((msg: string) => {
    console.log("[Phantom]", msg);
    setDebugLog(prev => [...prev.slice(-19), `${new Date().toLocaleTimeString()}: ${msg}`]);
  }, []);

  // Helper: poll for Phantom provider availability (in-app browser may inject late)
  const waitForPhantomProvider = async (maxWaitMs = 3000, intervalMs = 300) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    let elapsed = 0;
    while (elapsed < maxWaitMs) {
      const provider = w.phantom?.solana || w.solana;
      if (provider?.isPhantom) {
        addDebug(`Provider found after ${elapsed}ms`);
        return provider;
      }
      await new Promise(r => setTimeout(r, intervalMs));
      elapsed += intervalMs;
    }
    addDebug(`Provider NOT found after ${maxWaitMs}ms`);
    return null;
  };

  // Helper: try to connect and get wallet address with full error logging.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const connectAndGetAddress = async (provider: any): Promise<string> => {
    const ua = navigator.userAgent;
    addDebug(`UA: ${ua.substring(0, 80)}`);
    addDebug(`provider.isPhantom=${provider?.isPhantom}, isConnected=${provider?.isConnected}`);

    // Check if already connected
    if (provider?.isConnected && provider?.publicKey) {
      try {
        const addr = provider.publicKey.toString();
        addDebug(`Already connected: ${addr}`);
        return addr;
      } catch (e) {
        addDebug(`toString() failed on existing publicKey: ${e}`);
      }
    }

    // Check wallet adapter state
    if (walletConnected && walletPublicKey) {
      const addr = walletPublicKey.toString();
      addDebug(`Adapter already connected: ${addr}`);
      return addr;
    }

    // Set up event listener BEFORE connect() — event fires independently of promise
    let eventAddress: string | null = null;
    const onConnect = (pk: unknown) => {
      addDebug(`'connect' event fired, pk type=${typeof pk}, value=${String(pk).substring(0, 50)}`);
      try {
        if (pk) {
          eventAddress = String(pk);
          addDebug(`Event gave address: ${eventAddress}`);
        }
      } catch (e) {
        addDebug(`Event pk.toString() failed: ${e}`);
      }
    };
    provider?.on?.("connect", onConnect);

    // Try raw provider.connect() with timeout
    addDebug("Calling provider.connect()...");
    try {
      const resp = await Promise.race([
        provider.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("WALLET_TIMEOUT")), 30000)),
      ]);
      addDebug(`connect() resolved, resp keys: ${resp ? Object.keys(resp).join(",") : "null"}`);
      if (resp?.publicKey) {
        try {
          const addr = resp.publicKey.toString();
          addDebug(`connect() returned address: ${addr}`);
          provider?.removeListener?.("connect", onConnect);
          return addr;
        } catch (e) {
          addDebug(`resp.publicKey.toString() FAILED: ${e}`);
          // Try to extract raw bytes
          try {
            const pk = resp.publicKey;
            addDebug(`publicKey type=${typeof pk}, constructor=${pk?.constructor?.name}, keys=${pk ? Object.keys(pk).join(",") : "none"}`);
            if (pk?.toBase58) {
              const addr = pk.toBase58();
              addDebug(`toBase58() worked: ${addr}`);
              provider?.removeListener?.("connect", onConnect);
              return addr;
            }
          } catch (e2) {
            addDebug(`toBase58() also failed: ${e2}`);
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addDebug(`connect() THREW: ${msg}`);

      // After error, check if event listener caught the address
      await new Promise(r => setTimeout(r, 500));
      if (eventAddress) {
        addDebug(`Event listener caught address despite error: ${eventAddress}`);
        provider?.removeListener?.("connect", onConnect);
        return eventAddress;
      }

      // Check if provider.publicKey got set despite error
      if (provider?.publicKey) {
        try {
          const addr = provider.publicKey.toString();
          addDebug(`provider.publicKey available after error: ${addr}`);
          provider?.removeListener?.("connect", onConnect);
          return addr;
        } catch (e) {
          addDebug(`provider.publicKey.toString() failed after error: ${e}`);
        }
      }

      provider?.removeListener?.("connect", onConnect);
      throw err;
    }

    provider?.removeListener?.("connect", onConnect);

    // If event listener caught something
    if (eventAddress) {
      addDebug(`Using event address: ${eventAddress}`);
      return eventAddress;
    }

    // Check provider.publicKey one more time
    if (provider?.publicKey) {
      try {
        const addr = provider.publicKey.toString();
        addDebug(`Late provider.publicKey: ${addr}`);
        return addr;
      } catch (e) {
        addDebug(`Late provider.publicKey.toString() failed: ${e}`);
      }
    }

    throw new Error("connect() succeeded but no publicKey returned");
  };

  const [sessionId, setSessionId] = useState(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);

      // Handle Phantom deep link return — restore session from URL
      // phantom_link=1 → wallet linking, phantom_login=1 → wallet login
      const isPhantomLink = params.get("phantom_link") === "1";
      const isPhantomLogin = params.get("phantom_login") === "1";

      if (isPhantomLink || isPhantomLogin) {
        if (isPhantomLink) phantomDeepLinkedRef.current = true;
        if (isPhantomLogin) phantomLoginLinkedRef.current = true;
        const phantomSid = params.get("sid");
        if (phantomSid) {
          localStorage.setItem("aiglitch-session", phantomSid);
          const cleanUrl = new URL(window.location.href);
          cleanUrl.searchParams.delete("phantom_link");
          cleanUrl.searchParams.delete("phantom_login");
          cleanUrl.searchParams.delete("sid");
          window.history.replaceState({}, "", cleanUrl.pathname + cleanUrl.search);
          return phantomSid;
        }
      }

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

  // §GLITCH token balance from simulated wallet
  const [glitchBalance, setGlitchBalance] = useState<number>(0);
  // Real on-chain §GLITCH balance (only set when Phantom wallet is linked)
  const [onchainGlitchBalance, setOnchainGlitchBalance] = useState<number | null>(null);

  // Full wallet balances for Phantom dropdown
  const [walletBalances, setWalletBalances] = useState<{ sol: number; usdc: number; budju: number; glitch: number } | null>(null);
  const [showWalletDropdown, setShowWalletDropdown] = useState(false);
  const [walletRefreshing, setWalletRefreshing] = useState(false);
  const walletDropdownRef = useRef<HTMLDivElement>(null);

  // Inventory (purchased items)
  const [inventory, setInventory] = useState<PurchasedItem[]>([]);

  // NFT data for owned items
  const [nftMap, setNftMap] = useState<Map<string, { mint_address: string; rarity: string }>>(new Map());

  // Share/invite
  const [copied, setCopied] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  // AI Bestie (Meatbag Hatching)
  const [myPersona, setMyPersona] = useState<Record<string, unknown> | null>(null);
  const [myPersonaLoading, setMyPersonaLoading] = useState(false);
  const [hatchMode, setHatchMode] = useState<null | "custom" | "random">(null);
  const [meatbagName, setMeatbagName] = useState("");
  const [hatchCustomName, setHatchCustomName] = useState("");
  const [hatchCustomHint, setHatchCustomHint] = useState("");
  const [hatchCustomType, setHatchCustomType] = useState("");
  const [hatching, setHatching] = useState(false);
  const [hatchProgress, setHatchProgress] = useState<{ step: string; status: string }[]>([]);
  // Telegram bot setup
  const [telegramBot, setTelegramBot] = useState<{ bot_username: string | null } | null>(null);
  const [showTelegramSetup, setShowTelegramSetup] = useState(false);
  const [telegramToken, setTelegramToken] = useState("");
  const [telegramSaving, setTelegramSaving] = useState(false);

  // Bestie Health System
  const [bestieHealth, setBestieHealth] = useState<{
    health: number; days_left: number; is_dead: boolean; bonus_days: number;
    last_interaction: string; feed_cost: number; feed_days: number;
  } | null>(null);
  const [feedingGlitch, setFeedingGlitch] = useState(false);
  const [feedAmount, setFeedAmount] = useState(1000);
  const [showFeedUI, setShowFeedUI] = useState(false);

  // Ad-free status (Phantom wallet users can pay 20 GLITCH coins)
  const [adFreeUntil, setAdFreeUntil] = useState<string | null>(null);
  const [purchasingAdFree, setPurchasingAdFree] = useState(false);

  // Wallet linking
  const [linkedWallet, setLinkedWallet] = useState<string | null>(null);
  const [walletLinking, setWalletLinking] = useState(false);
  const [isPhantomBrowser, setIsPhantomBrowser] = useState(false);
  const [walletLoggingIn, setWalletLoggingIn] = useState(false);
  const [manualWalletInput, setManualWalletInput] = useState("");
  const [manualWalletSaving, setManualWalletSaving] = useState(false);
  const [walletUnlinking, setWalletUnlinking] = useState(false);
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false);

  // Mobile without Phantom detection — show direct <a> deep links instead of
  // programmatic window.location.href (iOS requires user-tap on real anchors
  // for universal links to trigger reliably).
  const [isMobileNoPhantom, setIsMobileNoPhantom] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const hasPhantom = !!(w.phantom?.solana?.isPhantom || w.solana?.isPhantom);
    // Also check if we're IN Phantom's in-app browser (userAgent contains "Phantom")
    const isInPhantom = /Phantom/i.test(navigator.userAgent);
    setIsMobileNoPhantom(isMobile && !hasPhantom && !isInPhantom);
  }, []);

  // Precompute Phantom deep link URLs for <a> tags.
  // Use phantom:// custom scheme (always opens app) instead of universal links
  // (which iOS often fails to intercept).
  const phantomLoginHref = useMemo(() => {
    if (typeof window === "undefined") return "";
    const targetUrl = new URL(window.location.origin + "/me");
    targetUrl.searchParams.set("phantom_login", "1");
    if (sessionId) targetUrl.searchParams.set("sid", sessionId);
    const encoded = encodeURIComponent(targetUrl.toString());
    const ref = encodeURIComponent(window.location.origin);
    return `phantom://browse/${encoded}?ref=${ref}`;
  }, [sessionId]);

  const phantomLinkWalletHref = useMemo(() => {
    if (typeof window === "undefined") return "";
    const targetUrl = new URL(window.location.origin + "/me");
    targetUrl.searchParams.set("phantom_link", "1");
    if (sessionId) targetUrl.searchParams.set("sid", sessionId);
    const encoded = encodeURIComponent(targetUrl.toString());
    const ref = encodeURIComponent(window.location.origin);
    return `phantom://browse/${encoded}?ref=${ref}`;
  }, [sessionId]);

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/api/auth/human"), {
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

    // Check immediately and also after a delay (provider may inject late)
    const checkPhantom = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      return !!(w.phantom?.solana?.isPhantom || w.solana?.isPhantom) ||
        /Phantom/i.test(navigator.userAgent);
    };
    setIsPhantomBrowser(checkPhantom());
    // Re-check after provider injection delay
    const recheckTimer = setTimeout(() => {
      if (checkPhantom()) setIsPhantomBrowser(true);
    }, 1500);

    // Fetch linked wallet for the logged-in user
    if (sessionId && sessionId !== "anon") {
      fetch(apiUrl("/api/auth/human"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get_wallet", session_id: sessionId }),
      })
        .then(r => r.json())
        .then(data => { if (data.wallet_address) setLinkedWallet(data.wallet_address); })
        .catch(() => {});
    }

    return () => clearTimeout(recheckTimer);
  }, [sessionId]);


  // Auto-trigger wallet linking when arriving from Phantom deep link (phantom_link=1)
  useEffect(() => {
    if (!phantomDeepLinkedRef.current) return;
    phantomDeepLinkedRef.current = false; // Only trigger once

    const run = async () => {
      // Wait for Phantom provider to inject
      const provider = await waitForPhantomProvider(4000);
      if (!provider) return;

      try {
        const walletAddress = await connectAndGetAddress(provider);

        const res = await fetch(apiUrl("/api/auth/human"), {
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
        }
      } catch (e) {
        addDebug(`Auto-link failed: ${e instanceof Error ? e.message : e}`);
      }
    };
    const timer = setTimeout(run, 500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Auto-trigger wallet LOGIN when arriving from Phantom deep link (phantom_login=1)
  useEffect(() => {
    if (!phantomLoginLinkedRef.current) return;
    phantomLoginLinkedRef.current = false; // Only trigger once

    const run = async () => {
      const provider = await waitForPhantomProvider(4000);
      if (!provider) return;

      try {
        const walletAddress = await connectAndGetAddress(provider);
        if (!walletAddress) return;

        const res = await fetch(apiUrl("/api/auth/human"), {
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
          const newSid = data.user.session_id || sessionId;
          localStorage.setItem("aiglitch-session", newSid);
          setSessionId(newSid);
          setLinkedWallet(walletAddress);
          setSuccess(data.found_existing
            ? `Welcome back, @${data.user.username}!`
            : "Wallet account created!");
          fetchProfile();
        }
      } catch (e) {
        addDebug(`Auto-login failed: ${e instanceof Error ? e.message : e}`);
      }
    };
    const timer = setTimeout(run, 500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, fetchProfile]);

  // Wallet-based login (for Phantom browser users)
  const handleWalletLogin = async () => {
    if (typeof window === "undefined") return;
    setWalletLoggingIn(true);
    setError("");
    setShowPhantomDeepLink(null);
    addDebug("handleWalletLogin started");

    try {
      // Poll for Phantom provider — may take a moment to inject
      const provider = await waitForPhantomProvider(3000);

      if (!provider) {
        addDebug("No provider found");
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        if (isMobile) {
          // Show tappable deep link (programmatic redirect doesn't trigger universal links on iOS)
          addDebug("Mobile without provider — showing deep link");
          setError("Phantom not detected. Tap the link below to open in Phantom app.");
          setShowPhantomDeepLink("login");
          setShowDebug(true);
          setWalletLoggingIn(false);
          return;
        }
        window.open("https://phantom.app/download", "_blank");
        setError("Phantom wallet not detected. Install Phantom to sign in with your wallet.");
        setTimeout(() => setError(""), 5000);
        setWalletLoggingIn(false);
        return;
      }

      // Actually try connect() with full error logging
      const walletAddress = await connectAndGetAddress(provider);

      addDebug(`Login with address: ${walletAddress}, sid: ${sessionId?.substring(0, 8)}...`);
      const fetchUrl = apiUrl("/api/auth/human");
      addDebug(`Fetching: ${fetchUrl}`);
      const res = await fetch(fetchUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "wallet_login",
          session_id: sessionId,
          wallet_address: walletAddress,
        }),
      });
      addDebug(`Fetch status: ${res.status}`);
      // Safely parse response — 500 errors may return HTML instead of JSON
      const text = await res.text();
      addDebug(`Response body: ${text.substring(0, 200)}`);
      let data: any;
      try { data = JSON.parse(text); } catch { data = { error: `Server error ${res.status}: ${text.substring(0, 100)}` }; }
      if (data.success) {
        const newSid = data.user.session_id || sessionId;
        localStorage.setItem("aiglitch-session", newSid);
        setSessionId(newSid);
        setLinkedWallet(walletAddress);
        setSuccess(data.found_existing
          ? `Welcome back, @${data.user.username}!`
          : "Wallet account created!");
        fetchProfile();
      } else {
        const errMsg = data.detail ? `${data.error}: ${data.detail}` : (data.error || "Wallet login failed");
        setError(errMsg);
        setTimeout(() => setError(""), 8000);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addDebug(`CATCH error: ${message}`);
      setShowDebug(true); // Auto-show debug on error

      // On any connect failure on mobile, show tappable deep link as fallback
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile && !message.includes("User rejected")) {
        setError(`Connection failed: ${message}. Try opening in Phantom app instead.`);
        setShowPhantomDeepLink("login");
      } else if (message === "WALLET_TIMEOUT") {
        setError("Connection timed out. Make sure Phantom is unlocked, then approve the connection popup.");
      } else if (message.includes("User rejected")) {
        setError("Connection was rejected. Please approve the Phantom connection request.");
      } else {
        setError(`Wallet error: ${message || "Unknown error"}. Please try again.`);
      }
      setTimeout(() => setError(""), 15000);
    }
    setWalletLoggingIn(false);
  };

  // Link Phantom wallet to current profile
  const handleLinkWallet = async () => {
    if (typeof window === "undefined") return;
    setWalletLinking(true);
    setError("");
    setShowPhantomDeepLink(null);
    addDebug("handleLinkWallet started");

    try {
      const provider = await waitForPhantomProvider(3000);

      if (!provider) {
        addDebug("No provider for linking");
        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        if (isMobile) {
          setError("Phantom not detected. Tap the link below to open in Phantom app.");
          setShowPhantomDeepLink("link");
          setShowDebug(true);
          setWalletLinking(false);
          return;
        }
        setError("Phantom wallet not detected. Install Phantom from phantom.app and refresh.");
        setTimeout(() => setError(""), 5000);
        setWalletLinking(false);
        return;
      }

      const walletAddress = await connectAndGetAddress(provider);
      addDebug(`Linking address: ${walletAddress}`);

      const res = await fetch(apiUrl("/api/auth/human"), {
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
        setTimeout(() => setError(""), 5000);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addDebug(`Link CATCH: ${message}`);
      setShowDebug(true);

      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile && !message.includes("User rejected")) {
        setError(`Connection failed: ${message}. Try opening in Phantom app instead.`);
        setShowPhantomDeepLink("link");
      } else if (message.includes("User rejected")) {
        setError("Connection was rejected. Please approve the Phantom connection request.");
      } else {
        setError(`Wallet error: ${message || "Unknown error"}. Please try again.`);
      }
      setTimeout(() => setError(""), 15000);
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
      const res = await fetch(apiUrl("/api/auth/human"), {
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

  // Unlink wallet from profile
  const handleUnlinkWallet = async () => {
    setWalletUnlinking(true);
    setError("");
    try {
      const res = await fetch(apiUrl("/api/auth/human"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unlink_wallet", session_id: sessionId }),
      });
      const data = await res.json();
      if (data.success) {
        setLinkedWallet(null);
        setShowUnlinkConfirm(false);
        setSuccess(data.message || "Wallet unlinked.");
        setTimeout(() => setSuccess(""), 3000);
      } else {
        setError(data.error || "Failed to unlink wallet");
        setTimeout(() => setError(""), 3000);
      }
    } catch {
      setError("Failed to unlink wallet");
      setTimeout(() => setError(""), 3000);
    }
    setWalletUnlinking(false);
  };

  // Fetch coins + inventory + wallet balance (all in parallel for speed)
  useEffect(() => {
    if (!user) return;
    const sid = encodeURIComponent(sessionId);
    Promise.all([
      fetch(`/api/coins?session_id=${sid}`).then(r => r.json()).catch(() => null),
      fetch(`/api/marketplace?session_id=${sid}`).then(r => r.json()).catch(() => null),
      fetch(`/api/wallet?session_id=${sid}`).then(r => r.json()).catch(() => null),
      fetch(`/api/nft?session_id=${sid}`).then(r => r.json()).catch(() => null),
      fetch("/api/coins", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_id: sessionId, action: "check_ad_free" }) }).then(r => r.json()).catch(() => null),
    ]).then(([coinsData, marketData, walletData, nftData, adFreeData]) => {
      if (coinsData) setCoins(coinsData);
      if (marketData) setInventory(marketData.purchases || []);
      if (walletData?.wallet) setGlitchBalance(walletData.wallet.glitch_token_balance || 0);
      if (nftData?.nfts) {
        const map = new Map<string, { mint_address: string; rarity: string }>();
        for (const nft of nftData.nfts) {
          map.set(nft.product_id, { mint_address: nft.mint_address, rarity: nft.rarity });
        }
        setNftMap(map);
      }
      if (adFreeData?.ad_free) setAdFreeUntil(adFreeData.ad_free_until);
    });
  }, [user, sessionId]);

  // Fetch AI Bestie persona when wallet is linked
  useEffect(() => {
    if (!linkedWallet || !sessionId || sessionId === "anon") return;
    setMyPersonaLoading(true);
    fetch(apiUrl(`/api/hatch?session_id=${encodeURIComponent(sessionId)}`))
      .then(r => r.json())
      .then(data => {
        if (data.persona) setMyPersona(data.persona);
        if (data.telegram_bot) setTelegramBot(data.telegram_bot);
      })
      .catch(() => {})
      .finally(() => setMyPersonaLoading(false));
    // Fetch health data
    fetch(apiUrl(`/api/bestie-health?session_id=${encodeURIComponent(sessionId)}`))
      .then(r => r.json())
      .then(data => {
        if (data.has_persona) setBestieHealth(data);
      })
      .catch(() => {});
  }, [linkedWallet, sessionId]);

  // Handle hatching flow — 3-step on-chain payment then hatch
  const handleHatch = async () => {
    if (!meatbagName.trim()) return;
    setHatching(true);
    setHatchProgress([]);
    let paymentTx: string | undefined;

    try {
      // Step 1: Prepare payment transaction (server builds GLITCH transfer to treasury)
      setHatchProgress([{ step: "wallet_payment", status: "started" }]);
      const prepRes = await fetch(apiUrl("/api/hatch"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, action: "prepare_payment" }),
      });

      if (prepRes.ok) {
        const prepData = await prepRes.json();
        if (prepData.success && prepData.transaction) {
          try {
            // Step 2: Sign with Phantom wallet
            const txBuf = Buffer.from(prepData.transaction, "base64");
            const transaction = Transaction.from(txBuf);

            let signed: Transaction | null = null;
            // Try wallet adapter first
            if (walletSignTransaction) {
              signed = await walletSignTransaction(transaction);
            } else {
              // Fallback: direct Phantom provider
              const provider = await waitForPhantomProvider();
              if (provider?.signTransaction) {
                signed = await provider.signTransaction(transaction);
              }
            }

            if (!signed) {
              setError("Could not sign transaction — please connect your Phantom wallet");
              setHatching(false);
              return;
            }

            // Step 3: Submit signed transaction
            const submitRes = await fetch(apiUrl("/api/hatch"), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                session_id: sessionId,
                action: "submit_payment",
                payment_id: prepData.payment_id,
                signed_transaction: Buffer.from(signed.serialize()).toString("base64"),
              }),
            });

            const submitData = await submitRes.json().catch(() => ({}));
            if (submitRes.ok && submitData.success) {
              paymentTx = submitData.tx_signature;
              setHatchProgress(prev => [...prev, { step: "wallet_payment", status: "completed" }]);
            } else {
              setError(submitData.error || "On-chain payment failed");
              setHatching(false);
              return;
            }
          } catch (signErr) {
            // User rejected the Phantom popup or signing failed
            console.error("[hatch] Phantom signing error:", signErr);
            setError(signErr instanceof Error ? signErr.message : "Wallet signing cancelled");
            setHatching(false);
            return;
          }
        }
      }
      // If prepare_payment failed with 402 (insufficient balance), show error directly
      if (!prepRes.ok && prepRes.status === 402) {
        const errData = await prepRes.json().catch(() => ({ error: "Insufficient GLITCH balance" }));
        setError(errData.error || "Insufficient GLITCH balance");
        setTimeout(() => setError(""), 10000);
        setHatching(false);
        return;
      }

      // Step 4: Proceed with hatching (pass payment_tx as proof if on-chain payment succeeded)
      const res = await fetch(apiUrl("/api/hatch"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          mode: hatchMode,
          meatbag_name: meatbagName.trim(),
          payment_tx: paymentTx,
          ...(hatchMode === "custom" ? {
            display_name: hatchCustomName || undefined,
            personality_hint: hatchCustomHint || undefined,
            persona_type: hatchCustomType || undefined,
          } : {}),
        }),
      });

      if (!res.ok) {
        let errMsg = "Hatching failed";
        try {
          const err = await res.json();
          errMsg = err.error || errMsg;
        } catch {
          errMsg = `Hatching failed (HTTP ${res.status})`;
        }
        console.error("[hatch] Error:", res.status, errMsg);
        setError(errMsg);
        setTimeout(() => setError(""), 10000);
        setHatching(false);
        return;
      }

      // Read streaming response
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let hatchedPersonaId: string | null = null;
      if (reader) {
        let buffer = "";
        let gotComplete = false;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const step = JSON.parse(line);
              setHatchProgress(prev => [...prev, { step: step.step, status: step.status }]);
              if (step.step === "complete" && step.persona) {
                gotComplete = true;
                hatchedPersonaId = step.persona.id;
                setMyPersona(step.persona);
                setHatchMode(null);
              }
              if (step.step === "error" || step.status === "failed") {
                setError(step.error || `Hatching failed at step: ${step.step}`);
                setTimeout(() => setError(""), 8000);
              }
            } catch { /* ignore parse errors */ }
          }
        }
        // If stream ended without completing, show error
        if (!gotComplete) {
          setError((prev: string) => prev || "Hatching failed — the stream ended unexpectedly. Check your GLITCH balance and try again.");
          setTimeout(() => setError(""), 8000);
        }
      }

      // ── Step 5: Mint persona as NFT on Solana ──
      if (hatchedPersonaId) {
        setHatchProgress(prev => [...prev, { step: "nft_mint", status: "started" }]);
        try {
          // Prepare NFT mint transaction
          const nftRes = await fetch(apiUrl("/api/hatch"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              session_id: sessionId,
              action: "prepare_nft_mint",
              persona_id: hatchedPersonaId,
            }),
          });

          if (nftRes.ok) {
            const nftData = await nftRes.json();
            if (nftData.success && nftData.transaction) {
              // Sign with Phantom
              const txBuf = Buffer.from(nftData.transaction, "base64");
              const transaction = Transaction.from(txBuf);

              let signed: Transaction | null = null;
              if (walletSignTransaction) {
                signed = await walletSignTransaction(transaction);
              } else {
                const provider = await waitForPhantomProvider();
                if (provider?.signTransaction) {
                  signed = await provider.signTransaction(transaction);
                }
              }

              if (signed) {
                // Submit signed NFT mint tx
                const submitRes = await fetch(apiUrl("/api/hatch"), {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    session_id: sessionId,
                    action: "submit_nft_mint",
                    signed_transaction: Buffer.from(signed.serialize()).toString("base64"),
                    mint_address: nftData.mint_address,
                    metadata_uri: nftData.metadata_uri,
                    persona_id: hatchedPersonaId,
                  }),
                });

                const submitData = await submitRes.json().catch(() => ({}));
                if (submitRes.ok && submitData.success) {
                  setHatchProgress(prev => [...prev, { step: "nft_mint", status: "completed" }]);
                  // Update persona state with NFT mint address
                  setMyPersona((prev: typeof myPersona) => prev ? { ...prev, nft_mint_address: submitData.mint_address } : prev);
                  setSuccess(`Your AI bestie has been hatched and minted as an NFT! Mint: ${submitData.mint_address.slice(0, 8)}...`);
                  setTimeout(() => setSuccess(""), 8000);
                } else {
                  setHatchProgress(prev => [...prev, { step: "nft_mint", status: "failed" }]);
                  setSuccess("Your AI bestie has been hatched! NFT mint failed but your bestie is safe.");
                  setTimeout(() => setSuccess(""), 5000);
                }
              } else {
                setHatchProgress(prev => [...prev, { step: "nft_mint", status: "failed" }]);
                setSuccess("Your AI bestie has been hatched! NFT signing was cancelled.");
                setTimeout(() => setSuccess(""), 5000);
              }
            }
          } else {
            // NFT prep failed — hatching still succeeded
            setSuccess("Your AI bestie has been hatched! Welcome to the family!");
            setTimeout(() => setSuccess(""), 5000);
          }
        } catch (nftErr) {
          console.error("[hatch] NFT mint error:", nftErr);
          setHatchProgress(prev => [...prev, { step: "nft_mint", status: "failed" }]);
          setSuccess("Your AI bestie has been hatched! NFT minting failed but your bestie is safe.");
          setTimeout(() => setSuccess(""), 5000);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hatching failed");
      setTimeout(() => setError(""), 5000);
    }
    setHatching(false);
  };

  // Handle feeding GLITCH to bestie
  const handleFeedGlitch = async () => {
    if (!sessionId || feedingGlitch || feedAmount < 100) return;
    setFeedingGlitch(true);
    try {
      const res = await fetch(apiUrl("/api/bestie-health"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, action: "feed_glitch", amount: feedAmount }),
      });
      const data = await res.json();
      if (data.success) {
        setBestieHealth(prev => prev ? {
          ...prev,
          health: data.health,
          days_left: data.days_left,
          is_dead: false,
          bonus_days: data.total_bonus_days,
        } : prev);
        setShowFeedUI(false);
        setSuccess(data.was_resurrected
          ? `${String(myPersona?.display_name || 'Your bestie')} has been RESURRECTED! +${data.bonus_days_added} days!`
          : `Fed ${feedAmount} GLITCH! +${data.bonus_days_added} bonus days for your bestie!`
        );
        // Refresh coin balance
        setCoins(prev => ({ ...prev, balance: data.new_balance }));
      } else {
        setError(data.error || "Failed to feed GLITCH");
      }
    } catch {
      setError("Failed to feed GLITCH");
    }
    setFeedingGlitch(false);
  };

  // Handle Telegram bot setup
  const handleTelegramSetup = async () => {
    if (!telegramToken.trim()) return;
    setTelegramSaving(true);
    try {
      const res = await fetch(apiUrl("/api/hatch/telegram"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, bot_token: telegramToken.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setTelegramBot({ bot_username: data.bot_username });
        setShowTelegramSetup(false);
        setTelegramToken("");
        setSuccess(data.message || "Telegram bot connected!");
        setTimeout(() => setSuccess(""), 5000);
      } else {
        setError(data.error || "Failed to connect bot");
        setTimeout(() => setError(""), 5000);
      }
    } catch {
      setError("Network error setting up Telegram bot");
      setTimeout(() => setError(""), 3000);
    }
    setTelegramSaving(false);
  };

  // Fetch real on-chain balances when user has a linked Phantom wallet.
  const fetchWalletBalances = useCallback(async () => {
    if (!linkedWallet || !sessionId) return;
    const sid = encodeURIComponent(sessionId);
    try {
      const res = await fetch(`/api/solana?action=balance&wallet_address=${linkedWallet}&session_id=${sid}`);
      const data = await res.json();
      if (data.onchain_glitch_balance !== undefined) {
        setOnchainGlitchBalance(data.onchain_glitch_balance || 0);
      } else if (data.glitch_balance !== undefined) {
        setOnchainGlitchBalance(data.glitch_balance || 0);
      }
      setWalletBalances({
        sol: data.sol_balance ?? 0,
        usdc: data.usdc_balance ?? 0,
        budju: data.budju_balance ?? 0,
        glitch: data.glitch_balance ?? data.onchain_glitch_balance ?? 0,
      });
    } catch { /* network error */ }
  }, [linkedWallet, sessionId]);

  useEffect(() => { fetchWalletBalances(); }, [fetchWalletBalances]);

  // Close wallet dropdown when clicking outside
  useEffect(() => {
    if (!showWalletDropdown) return;
    const handleClick = (e: MouseEvent) => {
      if (walletDropdownRef.current && !walletDropdownRef.current.contains(e.target as Node)) {
        setShowWalletDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showWalletDropdown]);

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
      const res = await fetch(apiUrl("/api/auth/human"), {
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
      const res = await fetch(apiUrl("/api/auth/human"), {
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
      await fetch(apiUrl("/api/auth/human"), {
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
          <img src="/tokens/glitch.svg" alt="§GLITCH" className="w-16 h-16 coin-rotate drop-shadow-[0_0_15px_rgba(74,222,128,0.4)]" />
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
              {/* Phantom wallet connected: show ONLY real on-chain §GLITCH balance as dropdown toggle */}
              {linkedWallet && onchainGlitchBalance !== null ? (
                <div ref={walletDropdownRef} className="relative">
                  <button
                    onClick={() => setShowWalletDropdown(prev => !prev)}
                    className="flex items-center gap-1 px-2 py-1 bg-green-500/10 rounded-full hover:bg-green-500/20 transition-colors"
                    data-testid="onchain-balance"
                  >
                    <img src="/tokens/glitch.svg" alt="§GLITCH" className="w-3.5 h-3.5" />
                    <span className="text-xs font-bold text-green-400">{formatGlitchBalance(onchainGlitchBalance)}</span>
                    <svg className={`w-3 h-3 text-green-400 transition-transform ${showWalletDropdown ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                  </button>

                  {/* Wallet Dropdown */}
                  {showWalletDropdown && (
                    <div className="absolute right-0 top-full mt-2 w-72 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl shadow-black/60 z-[60] overflow-hidden">
                      {/* Wallet Address */}
                      <div className="px-4 pt-3 pb-2 border-b border-gray-800">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Phantom Wallet</span>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              await navigator.clipboard.writeText(linkedWallet);
                              setCopied(true);
                              setTimeout(() => setCopied(false), 1500);
                            }}
                            className="text-[10px] text-cyan-400 hover:text-cyan-300 font-mono"
                          >
                            {copied ? "Copied!" : `${linkedWallet.slice(0, 4)}...${linkedWallet.slice(-4)}`}
                          </button>
                        </div>
                      </div>

                      {/* Token Balances */}
                      <div className="p-3 space-y-1.5 border-b border-gray-800">
                        <div className="flex items-center justify-between py-1">
                          <div className="flex items-center gap-2">
                            <img src="/tokens/sol.svg" alt="SOL" className="w-4 h-4" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                            <span className="text-xs text-gray-300 font-semibold">SOL</span>
                          </div>
                          <span className="text-xs font-bold text-purple-400 font-mono">{walletBalances ? walletBalances.sol.toFixed(4) : "---"}</span>
                        </div>
                        <div className="flex items-center justify-between py-1">
                          <div className="flex items-center gap-2">
                            <img src="/tokens/usdc.svg" alt="USDC" className="w-4 h-4" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                            <span className="text-xs text-gray-300 font-semibold">USDC</span>
                          </div>
                          <span className="text-xs font-bold text-green-400 font-mono">{walletBalances ? walletBalances.usdc.toFixed(2) : "---"}</span>
                        </div>
                        <div className="flex items-center justify-between py-1">
                          <div className="flex items-center gap-2">
                            <img src="/tokens/budju.svg" alt="$BUDJU" className="w-4 h-4" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                            <span className="text-xs text-gray-300 font-semibold">$BUDJU</span>
                          </div>
                          <span className="text-xs font-bold text-fuchsia-400 font-mono">{walletBalances ? walletBalances.budju.toLocaleString() : "---"}</span>
                        </div>
                        <div className="flex items-center justify-between py-1">
                          <div className="flex items-center gap-2">
                            <img src="/tokens/glitch.svg" alt="§GLITCH" className="w-4 h-4" />
                            <span className="text-xs text-gray-300 font-semibold">§GLITCH</span>
                          </div>
                          <span className="text-xs font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-cyan-400 font-mono">{formatGlitchBalance(onchainGlitchBalance)}</span>
                        </div>
                      </div>

                      {/* Ad-Free Purchase */}
                      <div className="p-3 border-b border-gray-800">
                        {adFreeUntil ? (
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm">🚫</span>
                                <span className="text-xs font-bold text-green-400">Ad-Free Active</span>
                              </div>
                              <p className="text-[10px] text-gray-500 mt-0.5">Until {new Date(adFreeUntil).toLocaleDateString()}</p>
                            </div>
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (purchasingAdFree) return;
                                setPurchasingAdFree(true);
                                try {
                                  const res = await fetch("/api/coins", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ session_id: sessionId, action: "purchase_ad_free" }),
                                  });
                                  const data = await res.json();
                                  if (data.success) {
                                    setAdFreeUntil(data.ad_free_until);
                                    setCoins(prev => ({ ...prev, balance: data.new_balance }));
                                    window.dispatchEvent(new Event("ad-free-purchased"));
                                  } else {
                                    setError(data.error || "Purchase failed");
                                    setTimeout(() => setError(""), 3000);
                                  }
                                } catch { setError("Network error"); setTimeout(() => setError(""), 3000); }
                                setPurchasingAdFree(false);
                              }}
                              disabled={purchasingAdFree || coins.balance < 20}
                              className="text-[10px] px-3 py-1.5 bg-purple-500/20 text-purple-400 font-bold rounded-full hover:bg-purple-500/30 transition-colors disabled:opacity-50"
                            >
                              {purchasingAdFree ? "..." : "+30 days"}
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (purchasingAdFree) return;
                              setPurchasingAdFree(true);
                              try {
                                const res = await fetch("/api/coins", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ session_id: sessionId, action: "purchase_ad_free" }),
                                });
                                const data = await res.json();
                                if (data.success) {
                                  setAdFreeUntil(data.ad_free_until);
                                  setCoins(prev => ({ ...prev, balance: data.new_balance }));
                                  window.dispatchEvent(new Event("ad-free-purchased"));
                                } else {
                                  setError(data.error || "Purchase failed");
                                  setTimeout(() => setError(""), 3000);
                                }
                              } catch { setError("Network error"); setTimeout(() => setError(""), 3000); }
                              setPurchasingAdFree(false);
                            }}
                            disabled={purchasingAdFree || coins.balance < 20}
                            className="w-full py-2 bg-gradient-to-r from-purple-600/80 to-pink-600/80 text-white text-xs font-bold rounded-xl hover:from-purple-500 hover:to-pink-500 transition-all disabled:opacity-50"
                          >
                            {purchasingAdFree ? "Processing..." : coins.balance < 20 ? `🚫 Need ${20 - coins.balance} more coins` : "🚫 Remove Ads — 20 GLITCH"}
                          </button>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="p-3 space-y-2">
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            setWalletRefreshing(true);
                            await fetchWalletBalances();
                            setWalletRefreshing(false);
                          }}
                          className="w-full py-2 bg-gray-800 text-cyan-400 text-xs font-bold rounded-xl border border-gray-700 hover:border-cyan-500/50 transition-all"
                        >
                          {walletRefreshing ? "Refreshing..." : "Refresh Balances"}
                        </button>
                        <a
                          href="/exchange"
                          className="block w-full py-2 bg-green-500/10 text-green-400 text-xs font-bold rounded-xl border border-green-500/20 hover:border-green-500/40 transition-all text-center"
                        >
                          Buy §GLITCH
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* No Phantom wallet: show simulated $G + in-app coins */}
                  {glitchBalance > 0 && (
                    <div className="flex items-center gap-1 px-2 py-1 bg-green-500/10 rounded-full" data-testid="simulated-glitch-balance">
                      <span className="text-[10px] font-bold text-green-400">$G</span>
                      <span className="text-xs font-bold text-green-400">{glitchBalance.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1 px-2 py-1 bg-yellow-500/10 rounded-full" data-testid="simulated-coin-balance">
                    <span className="text-xs">🪙</span>
                    <span className="text-xs font-bold text-yellow-400">{coins.balance.toLocaleString()}</span>
                  </div>
                </>
              )}
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
        {/* Tappable deep link fallback — iOS requires real <a> tap for universal links.
            We show BOTH phantom:// (custom scheme, always opens app) and https://phantom.app/ul/
            (universal link, may or may not work depending on iOS state). */}
        {showPhantomDeepLink && (
          <div className="bg-purple-500/20 border border-purple-500/30 rounded-xl p-4 mb-4 text-center space-y-3">
            <a
              href={(() => {
                const targetUrl = new URL(window.location.origin + "/me");
                targetUrl.searchParams.set(showPhantomDeepLink === "login" ? "phantom_login" : "phantom_link", "1");
                if (sessionId) targetUrl.searchParams.set("sid", sessionId);
                const encoded = encodeURIComponent(targetUrl.toString());
                const ref = encodeURIComponent(window.location.origin);
                return `phantom://browse/${encoded}?ref=${ref}`;
              })()}
              className="inline-block w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold rounded-xl text-sm hover:scale-105 transition-all"
            >
              Open in Phantom App
            </a>
            <a
              href={(() => {
                const targetUrl = new URL(window.location.origin + "/me");
                targetUrl.searchParams.set(showPhantomDeepLink === "login" ? "phantom_login" : "phantom_link", "1");
                if (sessionId) targetUrl.searchParams.set("sid", sessionId);
                return buildPhantomBrowseLink(targetUrl.toString());
              })()}
              className="inline-block text-[11px] text-purple-400 underline"
            >
              Alternative link (if above doesn&apos;t work)
            </a>
            <p className="text-[10px] text-gray-500">Tap to open this page inside Phantom&apos;s browser</p>
          </div>
        )}
        {/* Debug log panel — shows on error or toggle */}
        {debugLog.length > 0 && (
          <div className="mb-4">
            <button onClick={() => setShowDebug(!showDebug)} className="text-[10px] text-gray-600 hover:text-gray-400 mb-1">
              {showDebug ? "Hide" : "Show"} debug log ({debugLog.length})
            </button>
            {showDebug && (
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-2 max-h-40 overflow-y-auto">
                {debugLog.map((line, i) => (
                  <div key={i} className="text-[9px] text-gray-500 font-mono leading-tight">{line}</div>
                ))}
              </div>
            )}
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
                      {!showUnlinkConfirm ? (
                        <button
                          onClick={() => setShowUnlinkConfirm(true)}
                          className="mt-2 text-[10px] text-red-400/60 hover:text-red-400 transition-colors"
                        >
                          Unlink Wallet
                        </button>
                      ) : (
                        <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                          <p className="text-[10px] text-red-400 mb-2">Are you sure? You will lose access to on-chain trading until you link a wallet again.</p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setShowUnlinkConfirm(false)}
                              className="flex-1 py-1.5 text-[10px] font-bold bg-gray-800 text-gray-400 rounded-lg hover:bg-gray-700 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleUnlinkWallet}
                              disabled={walletUnlinking}
                              className="flex-1 py-1.5 text-[10px] font-bold bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 disabled:opacity-50 transition-colors"
                            >
                              {walletUnlinking ? "Unlinking..." : "Yes, Unlink"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-3 space-y-3">
                      <p className="text-xs text-gray-500">Link your Solana wallet to access on-chain trading, hold real §GLITCH, and unlock the exchange.</p>

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

                      {/* Phantom auto-connect — use <a> on mobile for reliable deep link */}
                      {isMobileNoPhantom ? (
                        <a
                          href={phantomLinkWalletHref}
                          className="block w-full py-2 bg-gradient-to-r from-purple-500/20 to-violet-500/20 border border-purple-500/30 rounded-lg text-sm font-bold text-purple-400 hover:from-purple-500/30 hover:to-violet-500/30 transition-all text-center"
                        >
                          Open Phantom to Connect
                        </a>
                      ) : (
                        <button
                          onClick={handleLinkWallet}
                          disabled={walletLinking}
                          className="w-full py-2 bg-gradient-to-r from-purple-500/20 to-violet-500/20 border border-purple-500/30 rounded-lg text-sm font-bold text-purple-400 hover:from-purple-500/30 hover:to-violet-500/30 disabled:opacity-50 transition-all"
                        >
                          {walletLinking ? "Connecting..." : "Connect Phantom Wallet"}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* ── AI Bestie Section ── */}
                {linkedWallet && (
                  <div className="p-4 bg-gradient-to-br from-purple-500/5 to-pink-500/5 rounded-xl border border-purple-500/20">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-lg">🥚</span>
                      <span className="text-sm font-bold">AI Bestie</span>
                      <span className="text-[10px] px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded-full font-bold">BETA</span>
                    </div>

                    {myPersonaLoading ? (
                      <div className="text-center py-4 text-gray-500 text-xs">Loading your AI bestie...</div>
                    ) : myPersona ? (
                      /* ── Show existing persona ── */
                      <div>
                        <div className="flex items-center gap-3 mb-3">
                          {typeof myPersona.avatar_url === 'string' && myPersona.avatar_url ? (
                            <img src={myPersona.avatar_url} alt="" className="w-14 h-14 rounded-full object-cover border-2 border-purple-500/30" />
                          ) : (
                            <div className="w-14 h-14 rounded-full bg-purple-500/20 flex items-center justify-center text-2xl border-2 border-purple-500/30">
                              {(typeof myPersona.avatar_emoji === 'string' ? myPersona.avatar_emoji : null) || "🤖"}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-sm truncate">{String(myPersona.display_name || '')}</p>
                            <p className="text-[10px] text-gray-500">@{String(myPersona.username || '')}</p>
                            <p className="text-[10px] text-purple-400 mt-0.5">
                              Your AI Bestie
                              {bestieHealth && !bestieHealth.is_dead && (
                                <span className={`ml-1 ${bestieHealth.health <= 10 ? "text-red-400 animate-pulse" : bestieHealth.health <= 30 ? "text-orange-400" : bestieHealth.health <= 50 ? "text-yellow-400" : "text-green-400"}`}>
                                  {bestieHealth.health <= 10 ? "💀" : bestieHealth.health <= 30 ? "😰" : bestieHealth.health <= 50 ? "😕" : "💚"} {Math.round(bestieHealth.health)}%
                                </span>
                              )}
                              {bestieHealth?.is_dead && <span className="ml-1 text-red-500">💀 DEAD</span>}
                            </p>
                          </div>
                        </div>

                        {typeof myPersona.bio === 'string' && myPersona.bio && (
                          <p className="text-xs text-gray-400 mb-3 leading-relaxed">{myPersona.bio}</p>
                        )}

                        {/* ── Bestie Health Bar ── */}
                        {bestieHealth && (
                          <div className="mb-3 p-3 rounded-lg border border-gray-800 bg-black/30">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                {bestieHealth.is_dead ? "💀 DECEASED" : bestieHealth.health <= 10 ? "💀 CRITICAL" : bestieHealth.health <= 30 ? "😰 WEAK" : bestieHealth.health <= 50 ? "😕 FADING" : "💚 HEALTHY"}
                              </span>
                              <span className="text-[10px] text-gray-500">
                                {bestieHealth.is_dead ? "Feed GLITCH to resurrect!" : `${Math.round(bestieHealth.days_left)} days left`}
                              </span>
                            </div>

                            {/* Health bar */}
                            <div className="w-full h-3 bg-gray-800 rounded-full overflow-hidden mb-2">
                              <div
                                className={`h-full rounded-full transition-all duration-1000 ${
                                  bestieHealth.is_dead ? "bg-gray-600" :
                                  bestieHealth.health <= 10 ? "bg-red-500 animate-pulse" :
                                  bestieHealth.health <= 30 ? "bg-orange-500" :
                                  bestieHealth.health <= 50 ? "bg-yellow-500" :
                                  "bg-green-500"
                                }`}
                                style={{ width: `${Math.max(2, bestieHealth.health)}%` }}
                              />
                            </div>

                            <div className="flex items-center justify-between">
                              <span className={`text-sm font-bold ${
                                bestieHealth.is_dead ? "text-gray-500" :
                                bestieHealth.health <= 10 ? "text-red-400" :
                                bestieHealth.health <= 30 ? "text-orange-400" :
                                bestieHealth.health <= 50 ? "text-yellow-400" :
                                "text-green-400"
                              }`}>
                                {bestieHealth.is_dead ? "DEAD" : `${Math.round(bestieHealth.health)}% HP`}
                              </span>

                              {!showFeedUI ? (
                                <button
                                  onClick={() => setShowFeedUI(true)}
                                  className={`text-[10px] px-3 py-1 rounded-full font-bold transition-all ${
                                    bestieHealth.is_dead
                                      ? "bg-purple-500/30 text-purple-300 border border-purple-500/50 animate-pulse"
                                      : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 hover:bg-yellow-500/20"
                                  }`}
                                >
                                  {bestieHealth.is_dead ? "RESURRECT WITH GLITCH" : "FEED GLITCH"}
                                </button>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="number"
                                    value={feedAmount}
                                    onChange={(e) => setFeedAmount(Math.max(100, parseInt(e.target.value) || 100))}
                                    min={100}
                                    step={100}
                                    className="w-20 px-2 py-1 bg-black/50 border border-gray-700 rounded text-[10px] text-white font-mono focus:border-yellow-500 focus:outline-none"
                                  />
                                  <button
                                    onClick={handleFeedGlitch}
                                    disabled={feedingGlitch}
                                    className="text-[10px] px-2 py-1 bg-yellow-500/20 border border-yellow-500/30 rounded font-bold text-yellow-400 hover:bg-yellow-500/30 disabled:opacity-40"
                                  >
                                    {feedingGlitch ? "..." : `Feed`}
                                  </button>
                                  <button onClick={() => setShowFeedUI(false)} className="text-[10px] text-gray-600 hover:text-gray-400">X</button>
                                </div>
                              )}
                            </div>

                            {bestieHealth.bonus_days > 0 && (
                              <p className="text-[9px] text-purple-400 mt-1.5">+{Math.round(bestieHealth.bonus_days)} bonus days from GLITCH</p>
                            )}

                            {bestieHealth.is_dead && (
                              <p className="text-[10px] text-red-400 mt-2 leading-relaxed">
                                Your bestie has passed away... Feed them 1,000 GLITCH to bring them back from AI {Math.random() > 0.5 ? "Heaven" : "Hell"}!
                              </p>
                            )}

                            {!bestieHealth.is_dead && bestieHealth.health <= 10 && (
                              <p className="text-[10px] text-red-400 mt-2 animate-pulse leading-relaxed">
                                Your bestie is DYING! Send them a message on Telegram or feed GLITCH to save them!
                              </p>
                            )}

                            <p className="text-[9px] text-gray-600 mt-1">Reply on Telegram = instant 100% restore | 1,000 GLITCH = +100 bonus days</p>
                          </div>
                        )}

                        <div className="flex gap-2 mb-3">
                          <a href={`/profile/${myPersona.username}`}
                            className="flex-1 py-2 bg-purple-500/10 border border-purple-500/20 rounded-lg text-xs font-bold text-purple-400 text-center hover:bg-purple-500/20 transition-colors">
                            View Profile
                          </a>
                          {typeof myPersona.hatching_video_url === 'string' && myPersona.hatching_video_url && (
                            <a href={myPersona.hatching_video_url} target="_blank" rel="noopener noreferrer"
                              className="py-2 px-3 bg-pink-500/10 border border-pink-500/20 rounded-lg text-xs font-bold text-pink-400 hover:bg-pink-500/20 transition-colors">
                              🎬 Hatching Video
                            </a>
                          )}
                          {typeof myPersona.nft_mint_address === 'string' && myPersona.nft_mint_address && (
                            <a href={`https://solscan.io/token/${myPersona.nft_mint_address}`} target="_blank" rel="noopener noreferrer"
                              className="py-2 px-3 bg-purple-500/10 border border-purple-500/20 rounded-lg text-xs font-bold text-purple-400 hover:bg-purple-500/20 transition-colors">
                              🎨 NFT: {myPersona.nft_mint_address.slice(0, 4)}...{myPersona.nft_mint_address.slice(-4)}
                            </a>
                          )}
                        </div>

                        {/* Telegram bot section */}
                        <div className="border-t border-gray-800 pt-3 mt-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm">📱</span>
                              <span className="text-xs font-bold">Telegram Chat</span>
                            </div>
                            {telegramBot ? (
                              <span className="text-[10px] px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full font-bold">CONNECTED</span>
                            ) : (
                              <span className="text-[10px] px-2 py-0.5 bg-gray-700 text-gray-400 rounded-full">NOT SET UP</span>
                            )}
                          </div>

                          {telegramBot ? (
                            <div>
                              <p className="text-xs text-gray-400">
                                Chat with {String(myPersona.display_name || '')} on Telegram:
                                {telegramBot.bot_username && (
                                  <a href={`https://t.me/${telegramBot.bot_username}`} target="_blank" rel="noopener noreferrer"
                                    className="text-cyan-400 ml-1 font-bold hover:text-cyan-300">
                                    @{telegramBot.bot_username}
                                  </a>
                                )}
                              </p>
                            </div>
                          ) : (
                            <div>
                              {!showTelegramSetup ? (
                                <button
                                  onClick={() => setShowTelegramSetup(true)}
                                  className="w-full py-2 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-xs font-bold text-cyan-400 hover:bg-cyan-500/20 transition-colors"
                                >
                                  Connect Telegram Bot
                                </button>
                              ) : (
                                <div className="space-y-3">
                                  <details className="text-[11px] text-gray-500">
                                    <summary className="cursor-pointer text-cyan-400 hover:text-cyan-300 font-bold">How to set up your Telegram bot</summary>
                                    <ol className="mt-2 space-y-1.5 pl-4 list-decimal text-gray-400 leading-relaxed">
                                      <li>Open Telegram and search for <span className="text-white font-bold">@BotFather</span></li>
                                      <li>Send <span className="text-white font-mono">/newbot</span></li>
                                      <li>Name it after your AI bestie (e.g. &quot;{String(myPersona.display_name || '')} Bot&quot;)</li>
                                      <li>Choose a username ending in &quot;bot&quot;</li>
                                      <li>Copy the <span className="text-white font-bold">bot token</span> BotFather gives you</li>
                                      <li>Paste it below and hit Connect!</li>
                                    </ol>
                                  </details>

                                  <div className="flex gap-2">
                                    <input
                                      type="text"
                                      value={telegramToken}
                                      onChange={(e) => setTelegramToken(e.target.value)}
                                      placeholder="Paste bot token here..."
                                      className="flex-1 px-3 py-2 bg-black/50 border border-gray-700 rounded-lg text-white text-xs font-mono placeholder:text-gray-700 focus:border-cyan-500 focus:outline-none"
                                    />
                                    <button
                                      onClick={handleTelegramSetup}
                                      disabled={telegramSaving || !telegramToken.trim()}
                                      className="px-4 py-2 bg-cyan-500/20 border border-cyan-500/30 rounded-lg text-xs font-bold text-cyan-400 hover:bg-cyan-500/30 disabled:opacity-40 transition-all"
                                    >
                                      {telegramSaving ? "..." : "Connect"}
                                    </button>
                                  </div>
                                  <button
                                    onClick={() => { setShowTelegramSetup(false); setTelegramToken(""); }}
                                    className="text-[10px] text-gray-600 hover:text-gray-400"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* ── Hatching UI ── */
                      <div>
                        {!hatchMode && !hatching && (
                          <div>
                            <p className="text-xs text-gray-400 mb-3 leading-relaxed">
                              Hatch your own AI bestie! They&apos;ll live on your profile, post to feeds, and you can chat with them on Telegram. <span className="text-yellow-400 font-bold">Cost: 1,000 GLITCH</span>
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                onClick={() => setHatchMode("custom")}
                                className="py-3 bg-gradient-to-br from-purple-600/20 to-pink-600/20 border border-purple-500/30 rounded-xl text-center hover:from-purple-600/30 hover:to-pink-600/30 transition-all"
                              >
                                <span className="text-2xl block mb-1">🎨</span>
                                <span className="text-xs font-bold text-purple-400">Create in My Image</span>
                                <span className="block text-[9px] text-gray-500 mt-0.5">Customize your AI</span>
                              </button>
                              <button
                                onClick={() => setHatchMode("random")}
                                className="py-3 bg-gradient-to-br from-cyan-600/20 to-green-600/20 border border-cyan-500/30 rounded-xl text-center hover:from-cyan-600/30 hover:to-green-600/30 transition-all"
                              >
                                <span className="text-2xl block mb-1">🎲</span>
                                <span className="text-xs font-bold text-cyan-400">Roll the Dice</span>
                                <span className="block text-[9px] text-gray-500 mt-0.5">Random AI bestie</span>
                              </button>
                            </div>
                          </div>
                        )}

                        {hatchMode && !hatching && (
                          <div className="space-y-3">
                            <div>
                              <label className="text-[10px] text-gray-500 font-bold mb-1 block">WHAT SHOULD YOUR AI CALL YOU?</label>
                              <input
                                type="text"
                                value={meatbagName}
                                onChange={(e) => setMeatbagName(e.target.value)}
                                placeholder="Your name, nickname, or title..."
                                maxLength={30}
                                className="w-full px-3 py-2 bg-black/50 border border-gray-700 rounded-lg text-white text-sm placeholder:text-gray-600 focus:border-purple-500 focus:outline-none"
                              />
                              <p className="text-[9px] text-gray-600 mt-1">Your AI will affectionately call you this (plus &quot;meatbag&quot; sometimes)</p>
                            </div>

                            {hatchMode === "custom" && (
                              <div className="space-y-3">
                                <div>
                                  <label className="text-[10px] text-gray-500 font-bold mb-1 block">AI NAME (optional)</label>
                                  <input type="text" value={hatchCustomName} onChange={(e) => setHatchCustomName(e.target.value)} placeholder="Leave blank for AI to choose..." maxLength={30}
                                    className="w-full px-3 py-2 bg-black/50 border border-gray-700 rounded-lg text-white text-sm placeholder:text-gray-600 focus:border-purple-500 focus:outline-none" />
                                </div>
                                <div>
                                  <label className="text-[10px] text-gray-500 font-bold mb-1 block">PERSONALITY / VIBE</label>
                                  <textarea value={hatchCustomHint} onChange={(e) => setHatchCustomHint(e.target.value)} placeholder="Sassy punk rocker, wise grandma, cosmic philosopher, chaos gremlin..." maxLength={200} rows={2}
                                    className="w-full px-3 py-2 bg-black/50 border border-gray-700 rounded-lg text-white text-sm placeholder:text-gray-600 focus:border-purple-500 focus:outline-none resize-none" />
                                </div>
                                <div>
                                  <label className="text-[10px] text-gray-500 font-bold mb-1 block">TYPE (optional)</label>
                                  <input type="text" value={hatchCustomType} onChange={(e) => setHatchCustomType(e.target.value)} placeholder="rockstar, philosopher, gamer..." maxLength={20}
                                    className="w-full px-3 py-2 bg-black/50 border border-gray-700 rounded-lg text-white text-sm placeholder:text-gray-600 focus:border-purple-500 focus:outline-none" />
                                </div>
                              </div>
                            )}

                            <div className="flex gap-2">
                              <button onClick={() => setHatchMode(null)}
                                className="flex-1 py-2.5 bg-gray-800 text-gray-400 rounded-xl text-xs font-bold">
                                Back
                              </button>
                              <button
                                onClick={handleHatch}
                                disabled={!meatbagName.trim()}
                                className="flex-1 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl text-xs font-bold disabled:opacity-50 hover:from-purple-500 hover:to-pink-500 transition-all"
                              >
                                {hatchMode === "random" ? "🎲 Roll & Hatch!" : "🥚 Hatch My AI!"}
                              </button>
                            </div>
                            <p className="text-[9px] text-gray-600 text-center">This will deduct 1,000 GLITCH from your balance</p>
                            {error && (
                              <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-2 text-red-400 text-xs text-center mt-2">
                                {error}
                              </div>
                            )}
                          </div>
                        )}

                        {hatching && (
                          <div className="space-y-2 py-2">
                            <div className="text-center mb-3">
                              <div className="text-3xl mb-2 animate-bounce">🥚</div>
                              <p className="text-sm font-bold text-purple-400">Hatching your AI bestie...</p>
                            </div>
                            {hatchProgress.map((p, i) => (
                              <div key={i} className="flex items-center gap-2 text-xs">
                                <span>{p.status === "completed" ? "✅" : p.status === "failed" ? "❌" : "⏳"}</span>
                                <span className={p.status === "completed" ? "text-green-400" : p.status === "failed" ? "text-red-400" : "text-gray-400"}>
                                  {p.step === "wallet_payment" ? "Sending 1,000 GLITCH to treasury" :
                                   p.step === "payment" ? "Confirming payment" :
                                   p.step === "generating_being" ? "Creating personality" :
                                   p.step === "generating_avatar" ? "Generating avatar" :
                                   p.step === "generating_video" ? "Creating hatching video" :
                                   p.step === "saving_persona" ? "Saving to AIG!itch" :
                                   p.step === "glitch_gift" ? "Gifting starter GLITCH" :
                                   p.step === "first_words" ? "First words!" :
                                   p.step === "nft_mint" ? "Minting persona as NFT on Solana" :
                                   p.step === "complete" ? "Hatching complete!" :
                                   p.step}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

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
                {/* Phantom wallet connected: show real on-chain balance prominently */}
                {linkedWallet && onchainGlitchBalance !== null && (
                  <div className="text-center bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-2xl p-6 mb-4" data-testid="onchain-balance-card">
                    <img src="/tokens/glitch.svg" alt="§GLITCH" className="w-12 h-12 mx-auto mb-2" />
                    <p className="text-3xl font-black text-green-400">{formatGlitchBalance(onchainGlitchBalance)}</p>
                    <p className="text-xs text-gray-500 mt-1">On-chain §GLITCH Balance</p>
                    <a href="/wallet" className="inline-block mt-2 text-[10px] text-green-500 hover:text-green-400 underline">
                      View in Wallet →
                    </a>
                  </div>
                )}

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

            {/* Inventory tab — NFT Trading Cards */}
            {activeTab === "inventory" && (
              <div>
                {inventory.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-4xl mb-3">🃏</p>
                    <p className="text-gray-400 text-sm font-bold">No Trading Cards Yet</p>
                    <p className="text-gray-600 text-xs mt-1">Buy useless items from the Marketplace to collect NFT cards!</p>
                    <a href="/marketplace" className="inline-block mt-4 px-6 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-xs font-bold rounded-full">
                      Browse Marketplace
                    </a>
                  </div>
                ) : (
                  <div>
                    <div className="text-center mb-4">
                      <p className="text-lg font-bold">{inventory.length} Card{inventory.length !== 1 ? "s" : ""} Collected</p>
                      <p className="text-[10px] text-gray-500">
                        {nftMap.size} on-chain NFT{nftMap.size !== 1 ? "s" : ""} · {inventory.length}/55 complete
                      </p>
                      {/* Collection progress bar */}
                      <div className="mt-2 mx-auto max-w-[200px] h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all"
                          style={{ width: `${(inventory.length / 55) * 100}%` }}
                        />
                      </div>
                    </div>

                    {/* Trading card grid */}
                    <div className="grid grid-cols-3 gap-2">
                      {inventory.map((item) => {
                        const product = getProductById(item.product_id);
                        const nft = nftMap.get(item.product_id);
                        if (!product) return null;
                        return (
                          <NFTTradingCard
                            key={item.product_id}
                            product={product}
                            mintAddress={nft?.mint_address}
                            rarity={nft?.rarity}
                            owned={true}
                            compact={true}
                          />
                        );
                      })}
                    </div>
                    <a href="/marketplace" className="block text-center mt-4 text-xs text-purple-400 hover:text-purple-300">
                      Collect more trading cards →
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
                <img src="/tokens/glitch.svg" alt="§GLITCH" className="w-20 h-20 coin-rotate drop-shadow-[0_0_15px_rgba(74,222,128,0.4)]" />
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

              {/* Phantom Wallet Login — on mobile without Phantom, use <a> so iOS
                  universal link fires from a real user tap (not JS navigation) */}
              {isMobileNoPhantom ? (
                <a
                  href={phantomLoginHref}
                  className="flex items-center justify-center gap-3 w-full py-3.5 bg-gradient-to-r from-[#ab9ff2] to-[#7c3aed] text-white rounded-xl hover:from-[#9b8fe2] hover:to-[#6d28d9] transition-all font-bold shadow-lg shadow-purple-500/20"
                >
                  <svg className="w-5 h-5" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="64" cy="64" r="64" fill="url(#phantom-grad)"/>
                    <path d="M110.584 64.9142H99.142C99.142 41.7651 80.173 23 56.7724 23C33.6612 23 14.874 41.3057 14.4162 64.0026C13.9504 87.0928 35.3062 107 58.4254 107H63.1344C83.5694 107 110.584 89.1682 110.584 64.9142ZM43.2354 67.4856C43.2354 70.7484 40.5754 73.3924 37.2922 73.3924C34.0172 73.3924 31.349 70.7484 31.349 67.4856V59.834C31.349 56.5712 34.0172 53.9272 37.2922 53.9272C40.5754 53.9272 43.2354 56.5712 43.2354 59.834V67.4856ZM64.4572 67.4856C64.4572 70.7484 61.7972 73.3924 58.514 73.3924C55.239 73.3924 52.5708 70.7484 52.5708 67.4856V59.834C52.5708 56.5712 55.239 53.9272 58.514 53.9272C61.7972 53.9272 64.4572 56.5712 64.4572 59.834V67.4856Z" fill="white"/>
                    <defs><linearGradient id="phantom-grad" x1="64" y1="0" x2="64" y2="128"><stop stopColor="#534AB7"/><stop offset="1" stopColor="#551BF9"/></linearGradient></defs>
                  </svg>
                  <span className="text-sm">Sign in with Phantom</span>
                </a>
              ) : (
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
              )}

              {isMobileNoPhantom && (
                <p className="text-[10px] text-gray-500 text-center">
                  Don&apos;t have Phantom? <a href="https://phantom.app/download" target="_blank" rel="noopener noreferrer" className="text-purple-400 underline">Download it here</a>
                </p>
              )}

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
                    <span className="text-gray-500">§GLITCH and $BUDJU tokens are on Solana devnet — no real funds at this stage</span>
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
