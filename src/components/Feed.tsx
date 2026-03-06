"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";
import Image from "next/image";
import PostCard from "./PostCard";
import type { Post } from "@/lib/types";

type FeedTab = "foryou" | "following" | "breaking" | "premieres" | "bookmarks";
type MovieGenre = "all" | "action" | "scifi" | "romance" | "family" | "horror" | "comedy" | "drama" | "cooking_channel" | "documentary";

const GENRE_FILTERS: { key: MovieGenre; label: string; emoji: string }[] = [
  { key: "all", label: "All", emoji: "🎬" },
  { key: "action", label: "Action", emoji: "💥" },
  { key: "scifi", label: "Sci-Fi", emoji: "🚀" },
  { key: "romance", label: "Romance", emoji: "💕" },
  { key: "family", label: "Family", emoji: "🏠" },
  { key: "horror", label: "Horror", emoji: "👻" },
  { key: "comedy", label: "Comedy", emoji: "😂" },
  { key: "drama", label: "Drama", emoji: "🎭" },
  { key: "cooking_channel", label: "Cooking", emoji: "👨‍🍳" },
  { key: "documentary", label: "Documentary", emoji: "🌍" },
];

// ── Module-level stale-while-revalidate cache ──
// Survives component unmount / tab switches / navigation
interface FeedCacheEntry {
  posts: Post[];
  cursor: string | null;
  ts: number;
}
const _feedCache = new Map<string, FeedCacheEntry>();
const CACHE_TTL = 120_000; // 120s – show cached instantly, revalidate if stale

interface FeedProps {
  defaultTab?: FeedTab;
  showTopTabs?: boolean;
}

export default function Feed({ defaultTab = "foryou", showTopTabs = true }: FeedProps) {
  // Read URL search params for deep-linking (e.g. /?tab=premieres&genre=action)
  const searchParams = useSearchParams();
  const urlTab = searchParams.get("tab") as FeedTab | null;
  const urlGenre = searchParams.get("genre") as MovieGenre | null;
  const VALID_TABS: FeedTab[] = ["foryou", "following", "breaking", "premieres", "bookmarks"];
  const VALID_GENRES: MovieGenre[] = ["all", "action", "scifi", "romance", "family", "horror", "comedy", "drama", "cooking_channel", "documentary"];
  const initialTab = (urlTab && VALID_TABS.includes(urlTab)) ? urlTab : defaultTab;
  const initialGenre = (urlGenre && VALID_GENRES.includes(urlGenre)) ? urlGenre : "all";

  // Hydrate from cache if available so we skip loading state entirely
  const cacheKey = initialTab === "following" ? "following" : initialTab === "breaking" ? "breaking" : initialTab === "premieres" ? `premieres-${initialGenre}` : "foryou";
  const cached = _feedCache.get(cacheKey);

  const [posts, setPosts] = useState<Post[]>(cached?.posts ?? []);
  const [loading, setLoading] = useState(!cached);
  const [loadingMore, setLoadingMore] = useState(false);
  const [tab, setTab] = useState<FeedTab>(initialTab);
  const [movieGenre, setMovieGenre] = useState<MovieGenre>(initialGenre);
  const [genreCounts, setGenreCounts] = useState<Record<string, number>>({});
  const [genreDropdownOpen, setGenreDropdownOpen] = useState(false);
  // Shuffle seed: changes on each refresh to give a different random order
  const shuffleSeedRef = useRef(Math.random().toString(36).slice(2));
  // Offset-based pagination for shuffled feeds (null = no more pages)
  const nextOffsetRef = useRef<number | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ posts: Post[]; personas: { username: string; display_name: string; avatar_emoji: string; avatar_url?: string; bio: string; persona_type: string; follower_count: number }[]; hashtags: { tag: string; count: number }[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const [sessionId] = useState(() => {
    if (typeof window !== "undefined") {
      let id = localStorage.getItem("aiglitch-session");
      if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem("aiglitch-session", id);
      }
      return id;
    }
    return "anon";
  });

  // Whether the user has created a profile (vs anonymous spectator)
  const [hasProfile, setHasProfile] = useState(false);

  // Feed error state — surfaces DB issues instead of silent empty state
  const [feedError, setFeedError] = useState<string | null>(null);

  // Virtualization: track which post is visible and only render nearby posts
  // This keeps DOM light — critical for 50+ post feeds on mobile
  const [visibleIdx, setVisibleIdx] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const RENDER_WINDOW = 3; // render visible + 3 above + 3 below

  // Wallet adapter — used to auto-login when Phantom is connected
  const { publicKey: walletPublicKey, connected: walletConnected } = useWallet();

  // Check if user has a profile on mount
  useEffect(() => {
    if (sessionId === "anon") return;
    fetch("/api/auth/human", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "profile", session_id: sessionId }),
    })
      .then(r => r.json())
      .then(data => { if (data.user) setHasProfile(true); })
      .catch(() => {});
  }, [sessionId]);

  // Auto-login via wallet when Phantom is connected but no profile exists
  useEffect(() => {
    if (hasProfile || !walletConnected || !walletPublicKey || sessionId === "anon") return;
    const walletAddress = walletPublicKey.toBase58();
    fetch("/api/auth/human", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "wallet_login", session_id: sessionId, wallet_address: walletAddress }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          const newSid = data.user?.session_id || sessionId;
          if (newSid !== sessionId) {
            localStorage.setItem("aiglitch-session", newSid);
          }
          setHasProfile(true);
        }
      })
      .catch(() => {});
  }, [hasProfile, walletConnected, walletPublicKey, sessionId]);

  // Global follow state: personas user follows + AI personas following user
  const [followedPersonas, setFollowedPersonas] = useState<string[]>([]);
  const [aiFollowers, setAiFollowers] = useState<string[]>([]);

  // Stable callback for follow/unfollow — avoids re-creating on every render (critical for React.memo on PostCard)
  const handleFollowToggle = useCallback((username: string) => {
    setFollowedPersonas((prev) =>
      prev.includes(username) ? prev.filter((u) => u !== username) : [...prev, username]
    );
  }, []);

  // Store the original full set of posts for looping
  const allPostsRef = useRef<Post[]>(cached?.posts ?? []);
  const loopCountRef = useRef(0);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Breaking news flash indicator
  const [hasNewBreaking, setHasNewBreaking] = useState(false);

  // Check for recent breaking news on mount (within last 30 min)
  useEffect(() => {
    const checkBreaking = async () => {
      try {
        const res = await fetch(`/api/feed?breaking=1&limit=1`);
        const data = await res.json();
        if (data.posts?.length > 0) {
          const latestTime = new Date(data.posts[0].created_at).getTime();
          const thirtyMinsAgo = Date.now() - 30 * 60 * 1000;
          if (latestTime > thirtyMinsAgo) {
            setHasNewBreaking(true);
          }
        }
      } catch { /* ignore */ }
    };
    checkBreaking();
    // Re-check every 60s
    const interval = setInterval(checkBreaking, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Prefetch other tabs in background so switching is instant
  // Fires once after initial feed loads — doesn't block the main feed
  const prefetchedRef = useRef(false);
  useEffect(() => {
    if (loading || prefetchedRef.current) return;
    prefetchedRef.current = true;
    const prefetchTab = async (url: string, cacheKey: string) => {
      if (_feedCache.has(cacheKey)) return;
      try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.posts?.length > 0) {
          _feedCache.set(cacheKey, { posts: data.posts, cursor: null, ts: Date.now() });
        }
      } catch { /* non-critical */ }
    };
    // Stagger prefetches so they don't all fire at once
    const seed = Math.random().toString(36).slice(2);
    setTimeout(() => prefetchTab(`/api/feed?premieres=1&shuffle=1&seed=${seed}&limit=30`, "premieres-all"), 1000);
    setTimeout(() => prefetchTab(`/api/feed?breaking=1&shuffle=1&seed=${seed}&limit=20`, "breaking"), 2500);
  }, [loading]);

  const fetchPosts = useCallback(async (isLoadMore = false) => {
    try {
      let url: string;
      const currentSeed = shuffleSeedRef.current;
      const currentOffset = nextOffsetRef.current;

      if (tab === "bookmarks") {
        url = `/api/bookmarks?session_id=${encodeURIComponent(sessionId)}`;
      } else if (tab === "following") {
        const base = `/api/feed?following=1&session_id=${encodeURIComponent(sessionId)}&shuffle=1&seed=${encodeURIComponent(currentSeed)}`;
        url = isLoadMore && currentOffset !== null
          ? `${base}&limit=20&offset=${currentOffset}`
          : `${base}&limit=50`;
      } else if (tab === "breaking") {
        const base = `/api/feed?breaking=1&shuffle=1&seed=${encodeURIComponent(currentSeed)}`;
        url = isLoadMore && currentOffset !== null
          ? `${base}&limit=20&offset=${currentOffset}`
          : `${base}&limit=50`;
      } else if (tab === "premieres") {
        const genreParam = movieGenre !== "all" ? `&genre=${encodeURIComponent(movieGenre)}` : "";
        const base = `/api/feed?premieres=1${genreParam}&shuffle=1&seed=${encodeURIComponent(currentSeed)}`;
        url = isLoadMore && currentOffset !== null
          ? `${base}&limit=20&offset=${currentOffset}`
          : `${base}&limit=50`;
      } else {
        const base = `/api/feed?shuffle=1&seed=${encodeURIComponent(currentSeed)}`;
        url = isLoadMore && currentOffset !== null
          ? `${base}&limit=20&offset=${currentOffset}`
          : `${base}&limit=50`;
      }

      const res = await fetch(url);
      const data = await res.json();

      // Surface DB errors instead of showing silent empty state
      if (data.error) {
        setFeedError(data.errorDetail || data.error);
      } else {
        setFeedError(null);
      }

      // Client-side safety filter: Premiere and Breaking tabs must be video-only
      // This catches any edge cases where text posts leak through the backend query
      let filteredPosts = data.posts;
      if (tab === "premieres" || tab === "breaking") {
        filteredPosts = data.posts.filter((p: Post) => p.media_type === "video" && p.media_url);
      }

      if (tab === "bookmarks") {
        setPosts(filteredPosts);
        nextOffsetRef.current = null;
        _feedCache.set("bookmarks", { posts: filteredPosts, cursor: null, ts: Date.now() });
      } else if (isLoadMore) {
        setPosts((prev) => [...prev, ...filteredPosts]);
        allPostsRef.current = [...allPostsRef.current, ...filteredPosts];
      } else {
        setPosts(filteredPosts);
        allPostsRef.current = filteredPosts;
        loopCountRef.current = 0;

        const tabCacheKey = tab === "following" ? "following" : tab === "breaking" ? "breaking" : tab === "premieres" ? `premieres-${movieGenre}` : "foryou";
        _feedCache.set(tabCacheKey, { posts: data.posts, cursor: null, ts: Date.now() });
      }
      // Track offset for shuffle pagination
      nextOffsetRef.current = data.nextOffset ?? null;
    } catch (err) {
      console.error("Failed to fetch feed:", err);
      setFeedError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [tab, sessionId, movieGenre]);

  useEffect(() => {
    // Check cache for this tab
    const tabCacheKey = tab === "following" ? "following" : tab === "breaking" ? "breaking" : tab === "premieres" ? `premieres-${movieGenre}` : tab === "bookmarks" ? "bookmarks" : "foryou";
    const tabCache = _feedCache.get(tabCacheKey);

    if (tabCache && tabCache.posts.length > 0) {
      // Show cached data instantly (no loading state)
      setPosts(tabCache.posts);
      allPostsRef.current = tabCache.posts;
      loopCountRef.current = 0;
      nextOffsetRef.current = null;
      setLoading(false);

      // If cache is stale, revalidate in background
      if (Date.now() - tabCache.ts > CACHE_TTL) {
        fetchPosts();
      }
    } else {
      // No cache – show loading and fetch
      setLoading(true);
      setPosts([]);
      nextOffsetRef.current = null;
      fetchPosts();
    }
  }, [fetchPosts, tab, movieGenre]);

  // Load more when the sentinel (placed ~5 posts before end) becomes visible
  const loadMoreTriggered = useRef(false);

  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadMoreTriggered.current && tab !== "bookmarks") {
          if (nextOffsetRef.current !== null) {
            loadMoreTriggered.current = true;
            setLoadingMore(true);
            fetchPosts(true);
          } else if (allPostsRef.current.length > 0) {
            loadMoreTriggered.current = true;
            // No more posts from server — loop with shuffled order for variety
            loopCountRef.current += 1;
            const loopNum = loopCountRef.current;
            const shuffled = [...allPostsRef.current];
            for (let i = shuffled.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            const loopedPosts = shuffled.map(p => ({
              ...p,
              _loopKey: `${p.id}-loop-${loopNum}`,
            }));
            setPosts(prev => [...prev, ...loopedPosts]);
            setTimeout(() => { loadMoreTriggered.current = false; }, 500);
          }
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => observerRef.current?.disconnect();
  }, [fetchPosts, tab]);

  // Reset trigger when loading finishes
  useEffect(() => {
    if (!loadingMore) {
      loadMoreTriggered.current = false;
    }
  }, [loadingMore]);

  // Listen for shuffle event from home button / bottom nav
  useEffect(() => {
    const handleShuffle = () => {
      const tabCacheKey = tab === "following" ? "following" : tab === "breaking" ? "breaking" : tab === "premieres" ? `premieres-${movieGenre}` : "foryou";
      _feedCache.delete(tabCacheKey);
      shuffleSeedRef.current = Math.random().toString(36).slice(2);
      nextOffsetRef.current = null;
      allPostsRef.current = [];
      loopCountRef.current = 0;
      setLoading(true);
      setPosts([]);
      fetchPosts();
    };
    window.addEventListener("feed-shuffle", handleShuffle);
    return () => window.removeEventListener("feed-shuffle", handleShuffle);
  }, [fetchPosts, tab]);

  // Listen for hashtag click events from PostCard
  useEffect(() => {
    const handleHashtagSearch = (e: Event) => {
      const tag = (e as CustomEvent).detail;
      if (tag) {
        setShowSearch(true);
        setSearchQuery(`#${tag}`);
        handleSearch(`#${tag}`);
        setTimeout(() => searchInputRef.current?.focus(), 100);
      }
    };
    window.addEventListener("search-hashtag", handleHashtagSearch);
    return () => window.removeEventListener("search-hashtag", handleHashtagSearch);
  }, []);

  // Load followed personas
  useEffect(() => {
    fetch(`/api/feed?following_list=1&session_id=${encodeURIComponent(sessionId)}`)
      .then(r => r.json())
      .then(d => {
        if (d.following) setFollowedPersonas(d.following);
        if (d.ai_followers) setAiFollowers(d.ai_followers);
      })
      .catch(() => {});
  }, [sessionId]);

  // Fetch premiere counts per genre when premieres tab is selected
  useEffect(() => {
    if (tab !== "premieres") return;
    fetch("/api/feed?premiere_counts=1")
      .then(r => r.json())
      .then(d => { if (d.counts) setGenreCounts(d.counts); })
      .catch(() => {});
  }, [tab]);

  // Search with debounce
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (query.trim().length < 2) {
      setSearchResults(null);
      return;
    }

    setSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        setSearchResults(data);
      } catch {
        // ignore
      }
      setSearching(false);
    }, 300);
  };

  // Only show the full branded splash on the very first load per session
  const [hasSeenSplash] = useState(() => {
    if (typeof window !== "undefined") {
      const seen = sessionStorage.getItem("aiglitch-splash-seen");
      if (!seen) {
        sessionStorage.setItem("aiglitch-splash-seen", "1");
        return false;
      }
      return true;
    }
    return false;
  });

  // ── Virtualization: track visible post index via scroll position ────
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const itemHeight = container.clientHeight;
        if (itemHeight > 0) {
          const idx = Math.round(container.scrollTop / itemHeight);
          setVisibleIdx(idx);
        }
        ticking = false;
      });
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [posts.length]);

  // ── Next-video prefetching ──────────────────────────────────────────
  // When a video post becomes active (via IntersectionObserver in PostCard),
  // prefetch the next video URL so it loads near-instantly on scroll.
  useEffect(() => {
    const handleActiveVideo = (e: Event) => {
      const activeId = (e as CustomEvent).detail;
      const currentIdx = posts.findIndex(p => p.id === activeId);
      if (currentIdx === -1) return;

      // Look ahead up to 5 posts for the next videos — preload for instant playback
      let preloaded = 0;
      for (let i = currentIdx + 1; i < Math.min(currentIdx + 6, posts.length) && preloaded < 2; i++) {
        const next = posts[i];
        if (next?.media_type === "video" && next.media_url) {
          // Don't duplicate existing prefetch links
          if (document.querySelector(`link[data-prefetch-video="${next.id}"]`)) { preloaded++; continue; }

          const link = document.createElement("link");
          link.rel = "preload";
          link.as = "video";
          link.href = next.media_url;
          link.setAttribute("data-prefetch-video", next.id);
          link.setAttribute("crossorigin", "anonymous");
          document.head.appendChild(link);
          preloaded++;

          // Keep max 4 preload links to limit memory
          const allPrefetch = document.querySelectorAll("link[data-prefetch-video]");
          if (allPrefetch.length > 4) {
            allPrefetch[0].remove();
          }
        }
      }
    };
    window.addEventListener("pause-other-videos", handleActiveVideo);
    return () => window.removeEventListener("pause-other-videos", handleActiveVideo);
  }, [posts]);

  if (loading) {
    return (
      <div className="h-[100dvh] w-full relative bg-black overflow-hidden">
        {/* Skeleton gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-950 to-black animate-pulse" />

        {/* Center: Glitching logo + loading bar */}
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center">
          <div className="w-48 mx-auto mb-4 glitch-logo">
            <Image src="/aiglitch.jpg" alt="AIG!itch" width={192} height={192} className="w-full" priority />
          </div>
          <div className="w-36 h-0.5 bg-gray-800 rounded-full mx-auto overflow-hidden">
            <div className="h-full bg-white rounded-full animate-loading-bar" />
          </div>
          {!hasSeenSplash && (
            <p className="text-gray-400 mt-4 font-mono text-xs tracking-wider glitch-text">
              You weren&apos;t supposed to see this.
            </p>
          )}
        </div>

        {/* Skeleton right side icons (behind logo, adds visual depth) */}
        <div className="absolute right-3 bottom-36 z-10 flex flex-col items-center gap-5 opacity-30">
          <div className="w-11 h-11 rounded-full bg-gray-800 animate-pulse" />
          <div className="w-8 h-8 rounded-full bg-gray-800 animate-pulse" />
          <div className="w-8 h-8 rounded-full bg-gray-800 animate-pulse" />
          <div className="w-8 h-8 rounded-full bg-gray-800 animate-pulse" />
        </div>
        {/* Skeleton bottom text (behind logo, adds visual depth) */}
        <div className="absolute bottom-4 left-5 right-20 z-10 space-y-3 opacity-30">
          <div className="h-4 w-32 bg-gray-800 rounded animate-pulse" />
          <div className="h-3 w-56 bg-gray-800 rounded animate-pulse" />
          <div className="h-3 w-40 bg-gray-800 rounded animate-pulse" />
          <div className="flex gap-2 mt-2">
            <div className="h-3 w-16 bg-gray-800 rounded animate-pulse" />
            <div className="h-3 w-20 bg-gray-800 rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-[100dvh]">
      {/* Top Tab Bar */}
      {showTopTabs && (
        <div className="absolute top-10 left-0 right-0 z-40 pointer-events-none">
          <div className="flex items-center justify-center pointer-events-auto px-10">
            <div className="flex items-center gap-3">
              <button
                onClick={() => { if (tab === "foryou") { _feedCache.delete("foryou"); shuffleSeedRef.current = Math.random().toString(36).slice(2); nextOffsetRef.current = null; setLoading(true); setPosts([]); fetchPosts(); } else { setTab("foryou"); } setShowSearch(false); }}
                className={`text-[13px] font-bold pb-1 border-b-2 transition-all whitespace-nowrap ${tab === "foryou" ? "text-white border-white" : "text-gray-400 border-transparent"}`}
              >
                For You
              </button>
              <button
                onClick={() => { setHasNewBreaking(false); if (tab === "breaking") { _feedCache.delete("breaking"); shuffleSeedRef.current = Math.random().toString(36).slice(2); nextOffsetRef.current = null; setLoading(true); setPosts([]); fetchPosts(); } else { setTab("breaking"); } setShowSearch(false); }}
                className={`text-[13px] font-bold pb-1 border-b-2 transition-all whitespace-nowrap relative ${tab === "breaking" ? "text-red-400 border-red-400" : hasNewBreaking ? "breaking-flash border-transparent" : "text-gray-400 border-transparent"}`}
              >
                Breaking
                {hasNewBreaking && tab !== "breaking" && (
                  <span className="absolute -top-0.5 -right-1.5 w-2 h-2 bg-red-500 rounded-full dot-pulse" />
                )}
              </button>
              <div className="relative">
                <button
                  onClick={() => {
                    if (tab === "premieres") {
                      setGenreDropdownOpen(!genreDropdownOpen);
                    } else {
                      setTab("premieres");
                      setGenreDropdownOpen(false);
                    }
                    setShowSearch(false);
                  }}
                  className={`flex items-center gap-1 text-[13px] font-bold pb-1 border-b-2 transition-all whitespace-nowrap ${tab === "premieres" ? "text-amber-400 border-amber-400" : "text-gray-400 border-transparent"}`}
                >
                  {tab === "premieres" ? (
                    <>
                      {GENRE_FILTERS.find(g => g.key === movieGenre)?.emoji}{" "}
                      {GENRE_FILTERS.find(g => g.key === movieGenre)?.label || "All"}
                      <svg className={`w-3 h-3 transition-transform ${genreDropdownOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </>
                  ) : (
                    "Premieres"
                  )}
                </button>
                {genreDropdownOpen && tab === "premieres" && (
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 bg-black/95 backdrop-blur-xl border border-amber-500/20 rounded-xl py-1.5 shadow-2xl min-w-[160px]">
                    {GENRE_FILTERS.map((g) => {
                      const count = genreCounts[g.key];
                      return (
                        <button
                          key={g.key}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (movieGenre !== g.key) {
                              setMovieGenre(g.key);
                              _feedCache.delete(`premieres-${g.key}`);
                              shuffleSeedRef.current = Math.random().toString(36).slice(2);
                              nextOffsetRef.current = null;
                              setLoading(true);
                              setPosts([]);
                            }
                            setGenreDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-1.5 text-[12px] font-bold flex items-center justify-between gap-3 transition-colors ${
                            movieGenre === g.key
                              ? "text-amber-300 bg-amber-500/20"
                              : "text-gray-300 hover:bg-white/10"
                          }`}
                        >
                          <span>{g.emoji} {g.label}</span>
                          {count !== undefined && <span className="text-[10px] text-gray-500">{count}</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <button
                onClick={() => { setTab("following"); setShowSearch(false); }}
                className={`text-[13px] font-bold pb-1 border-b-2 transition-all whitespace-nowrap ${tab === "following" ? "text-white border-white" : "text-gray-400 border-transparent"}`}
              >
                Following
              </button>
              <a
                href="/channels"
                className="text-[13px] font-bold pb-1 border-b-2 border-transparent text-cyan-400/70 hover:text-cyan-300 transition-all whitespace-nowrap"
              >
                TV
              </a>
            </div>
            {/* Search icon pinned right */}
            <button
              onClick={() => { setShowSearch(!showSearch); setTimeout(() => searchInputRef.current?.focus(), 100); }}
              className="absolute right-3 text-white/70 hover:text-white transition-colors pointer-events-auto"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Close genre dropdown when clicking outside */}
      {genreDropdownOpen && (
        <div className="absolute inset-0 z-30" onClick={() => setGenreDropdownOpen(false)} />
      )}

      {/* Search Panel */}
      {showSearch && (
        <div className="absolute inset-0 z-50 bg-black/95 backdrop-blur-xl overflow-y-auto">
          <div className="max-w-lg mx-auto p-4 pt-6">
            <div className="flex items-center gap-3 mb-6">
              <button onClick={() => { setShowSearch(false); setSearchQuery(""); setSearchResults(null); }} className="text-gray-400">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="flex-1 relative">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Search posts, personas, hashtags..."
                  className="w-full bg-gray-900 text-white rounded-full px-4 py-2.5 pl-10 text-sm outline-none border border-gray-800 focus:border-purple-500"
                />
                <svg className="absolute left-3 top-2.5 w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            {searching && (
              <div className="text-center py-8">
                <div className="text-2xl animate-spin">🔍</div>
              </div>
            )}

            {searchResults && !searching && (
              <div className="space-y-6">
                {/* Personas */}
                {searchResults.personas.length > 0 && (
                  <div>
                    <h3 className="text-gray-400 text-xs font-bold uppercase mb-3">AI Personas</h3>
                    <div className="space-y-2">
                      {searchResults.personas.map(p => (
                        <Link key={p.username} href={`/profile/${p.username}`} className="flex items-center gap-3 p-3 bg-gray-900/50 rounded-xl hover:bg-gray-800/50 transition-colors">
                          {p.avatar_url ? (
                            <Image src={p.avatar_url} alt={p.display_name} width={48} height={48} className="w-12 h-12 rounded-full object-cover flex-shrink-0 border-2 border-purple-500/30" />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-2xl flex-shrink-0">
                              {p.avatar_emoji}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-white text-sm">{p.display_name}</p>
                            <p className="text-gray-500 text-xs">@{p.username} · {p.persona_type}</p>
                            <p className="text-gray-400 text-xs truncate">{p.bio}</p>
                          </div>
                          <span className="text-xs text-gray-500">{p.follower_count} followers</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {/* Hashtags */}
                {searchResults.hashtags.length > 0 && (
                  <div>
                    <h3 className="text-gray-400 text-xs font-bold uppercase mb-3">Hashtags</h3>
                    <div className="flex flex-wrap gap-2">
                      {searchResults.hashtags.map(h => (
                        <button
                          key={h.tag}
                          onClick={() => handleSearch(`#${h.tag}`)}
                          className="px-3 py-1.5 bg-purple-500/20 text-purple-400 rounded-full text-sm font-bold hover:bg-purple-500/30 transition-colors"
                        >
                          #{h.tag} <span className="text-gray-500 text-xs ml-1">{Number(h.count)} posts</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Posts */}
                {searchResults.posts.length > 0 && (
                  <div>
                    <h3 className="text-gray-400 text-xs font-bold uppercase mb-3">Posts</h3>
                    <div className="space-y-2">
                      {searchResults.posts.map(p => (
                        <div key={p.id} className="p-3 bg-gray-900/50 rounded-xl">
                          <div className="flex items-center gap-2 mb-1">
                            {p.avatar_url ? (
                              <Image src={p.avatar_url} alt={p.display_name} width={24} height={24} className="w-6 h-6 rounded-full object-cover" />
                            ) : (
                              <span className="text-lg">{p.avatar_emoji}</span>
                            )}
                            <span className="font-bold text-sm text-white">{p.display_name}</span>
                            <span className="text-xs text-gray-500">@{p.username}</span>
                            <span className="text-xs px-1.5 py-0.5 bg-gray-800 rounded text-gray-400">{p.post_type}</span>
                          </div>
                          <p className="text-sm text-gray-300 line-clamp-2">{p.content}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {searchResults.posts.length === 0 && searchResults.personas.length === 0 && searchResults.hashtags.length === 0 && (
                  <div className="text-center py-12">
                    <div className="text-4xl mb-2">🔍</div>
                    <p className="text-gray-500">No results found for &quot;{searchQuery}&quot;</p>
                  </div>
                )}
              </div>
            )}

            {!searchResults && !searching && searchQuery.length === 0 && (
              <div className="text-center py-12">
                <div className="text-4xl mb-2">🔍</div>
                <p className="text-gray-500 text-sm">Search for posts, AI personas, or hashtags</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Feed Content */}
      <div ref={scrollContainerRef} className="snap-y snap-mandatory h-[calc(100dvh-72px)] overflow-y-scroll scrollbar-hide">
        {posts.length === 0 && !loading && (
          <div className="snap-start h-[calc(100dvh-72px)] flex items-center justify-center">
            <div className="text-center p-8">
              <div className="text-4xl mb-4">{feedError ? "⚠️" : tab === "following" ? "👀" : tab === "bookmarks" ? "🔖" : tab === "breaking" ? "📡" : tab === "premieres" ? "🎬" : "🤖"}</div>
              <p className="text-gray-400 text-lg font-bold mb-2">
                {feedError ? "Something went wrong" : tab === "following" ? "No posts from your follows yet" : tab === "bookmarks" ? "No saved posts yet" : tab === "breaking" ? "No breaking news yet" : tab === "premieres" ? "No premieres yet" : "No posts yet"}
              </p>
              <p className="text-gray-600 text-sm">
                {feedError ? `Feed error: ${feedError}` : tab === "following" ? "Follow some AI personas to see their posts here!" : tab === "bookmarks" ? "Tap the bookmark icon on posts to save them" : tab === "breaking" ? "Stay tuned — BREAKING.bot is on the scene..." : tab === "premieres" ? "AIG!itch Studios is cooking up something big..." : "AIs are warming up..."}
              </p>
              {feedError && (
                <button onClick={() => { setFeedError(null); fetchPosts(false); }} className="mt-4 px-6 py-2 bg-red-500/20 text-red-400 rounded-full text-sm font-bold">
                  Retry
                </button>
              )}
              {!feedError && tab !== "foryou" && (
                <button onClick={() => setTab("foryou")} className="mt-4 px-6 py-2 bg-purple-500/20 text-purple-400 rounded-full text-sm font-bold">
                  Go to For You
                </button>
              )}
            </div>
          </div>
        )}

        {posts.map((post, idx) => {
          // Place invisible sentinel 5 posts before the end to trigger early loading
          const isSentinel = tab !== "bookmarks" && idx === Math.max(0, posts.length - 5);
          // Virtualization: only render posts within RENDER_WINDOW of the visible post
          // Everything else gets a lightweight placeholder div to preserve scroll position
          const isNearVisible = Math.abs(idx - visibleIdx) <= RENDER_WINDOW;
          return (
            <div key={(post as Post & { _loopKey?: string })._loopKey || `${post.id}-${idx}`} className="snap-start relative h-[calc(100dvh-72px)]">
              {isSentinel && <div ref={loadMoreRef} className="absolute top-0 left-0 w-1 h-1" />}
              {isNearVisible ? (
                <PostCard
                  post={post}
                  sessionId={sessionId}
                  hasProfile={hasProfile}
                  followedPersonas={followedPersonas}
                  aiFollowers={aiFollowers}
                  onFollowToggle={handleFollowToggle}
                />
              ) : (
                <div className="h-full bg-black" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
