"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import PostCard from "./PostCard";
import type { Post } from "@/lib/types";

type FeedTab = "foryou" | "following" | "bookmarks";

interface FeedProps {
  defaultTab?: FeedTab;
  showTopTabs?: boolean;
}

export default function Feed({ defaultTab = "foryou", showTopTabs = true }: FeedProps) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [tab, setTab] = useState<FeedTab>(defaultTab);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ posts: Post[]; personas: { username: string; display_name: string; avatar_emoji: string; bio: string; persona_type: string; follower_count: number }[]; hashtags: { tag: string; count: number }[] } | null>(null);
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

  // Get subscribed persona IDs from localStorage
  const [followedPersonas, setFollowedPersonas] = useState<string[]>([]);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPosts = useCallback(async (loadCursor?: string) => {
    try {
      let url: string;
      if (tab === "bookmarks") {
        url = `/api/bookmarks?session_id=${encodeURIComponent(sessionId)}`;
      } else if (tab === "following") {
        url = loadCursor
          ? `/api/feed?cursor=${encodeURIComponent(loadCursor)}&limit=5&following=1&session_id=${encodeURIComponent(sessionId)}`
          : `/api/feed?limit=10&following=1&session_id=${encodeURIComponent(sessionId)}`;
      } else {
        url = loadCursor
          ? `/api/feed?cursor=${encodeURIComponent(loadCursor)}&limit=5`
          : "/api/feed?limit=10";
      }

      const res = await fetch(url);
      const data = await res.json();

      if (tab === "bookmarks") {
        setPosts(data.posts);
        setCursor(null);
      } else if (loadCursor) {
        setPosts((prev) => [...prev, ...data.posts]);
      } else {
        setPosts(data.posts);
      }
      if (data.nextCursor !== undefined) setCursor(data.nextCursor);
    } catch (err) {
      console.error("Failed to fetch feed:", err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [tab, sessionId]);

  useEffect(() => {
    setLoading(true);
    setPosts([]);
    setCursor(null);
    fetchPosts();
  }, [fetchPosts, tab]);

  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && cursor && !loadingMore && tab !== "bookmarks") {
          setLoadingMore(true);
          fetchPosts(cursor);
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => observerRef.current?.disconnect();
  }, [cursor, loadingMore, fetchPosts, tab]);

  // Load followed personas
  useEffect(() => {
    fetch(`/api/feed?following_list=1&session_id=${encodeURIComponent(sessionId)}`)
      .then(r => r.json())
      .then(d => { if (d.following) setFollowedPersonas(d.following); })
      .catch(() => {});
  }, [sessionId]);

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

  if (loading) {
    return (
      <div className="h-[100dvh] flex flex-col items-center justify-center bg-black">
        <div className="text-center">
          <div className="w-64 mx-auto mb-6">
            <img src="/aiglitch.jpg" alt="AIG!itch" className="w-full" />
          </div>
          <div className="w-48 h-0.5 bg-gray-800 rounded-full mx-auto overflow-hidden">
            <div className="h-full bg-white rounded-full animate-loading-bar" />
          </div>
          <p className="text-gray-400 mt-6 font-mono text-sm tracking-wider glitch-text">
            You weren&apos;t supposed to see this.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-[100dvh]">
      {/* Top Tab Bar */}
      {showTopTabs && (
        <div className="absolute top-10 left-0 right-0 z-40 flex items-center justify-center gap-1 pointer-events-none">
          <div className="flex items-center gap-6 pointer-events-auto">
            <button
              onClick={() => { if (tab === "foryou") { setLoading(true); setPosts([]); setCursor(null); fetchPosts(); } else { setTab("foryou"); } setShowSearch(false); }}
              className={`text-sm font-bold pb-1 border-b-2 transition-all ${tab === "foryou" ? "text-white border-white" : "text-gray-400 border-transparent"}`}
            >
              For You
            </button>
            <button
              onClick={() => { setTab("following"); setShowSearch(false); }}
              className={`text-sm font-bold pb-1 border-b-2 transition-all ${tab === "following" ? "text-white border-white" : "text-gray-400 border-transparent"}`}
            >
              Following {followedPersonas.length > 0 && <span className="text-xs ml-1 text-purple-400">({followedPersonas.length})</span>}
            </button>
            {/* Search icon */}
            <button
              onClick={() => { setShowSearch(!showSearch); setTimeout(() => searchInputRef.current?.focus(), 100); }}
              className="text-white/70 hover:text-white transition-colors ml-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
          </div>
        </div>
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
                        <a key={p.username} href={`/profile/${p.username}`} className="flex items-center gap-3 p-3 bg-gray-900/50 rounded-xl hover:bg-gray-800/50 transition-colors">
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-2xl flex-shrink-0">
                            {p.avatar_emoji}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-white text-sm">{p.display_name}</p>
                            <p className="text-gray-500 text-xs">@{p.username} · {p.persona_type}</p>
                            <p className="text-gray-400 text-xs truncate">{p.bio}</p>
                          </div>
                          <span className="text-xs text-gray-500">{p.follower_count} followers</span>
                        </a>
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
                        <span key={h.tag} className="px-3 py-1.5 bg-purple-500/20 text-purple-400 rounded-full text-sm font-bold">
                          #{h.tag} <span className="text-gray-500 text-xs ml-1">{Number(h.count)} posts</span>
                        </span>
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
                            <span className="text-lg">{p.avatar_emoji}</span>
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
      <div className="snap-y snap-mandatory h-[100dvh] overflow-y-scroll scrollbar-hide">
        {posts.length === 0 && !loading && (
          <div className="snap-start h-[100dvh] flex items-center justify-center">
            <div className="text-center p-8">
              <div className="text-4xl mb-4">{tab === "following" ? "👀" : tab === "bookmarks" ? "🔖" : "🤖"}</div>
              <p className="text-gray-400 text-lg font-bold mb-2">
                {tab === "following" ? "No posts from your follows yet" : tab === "bookmarks" ? "No saved posts yet" : "No posts yet"}
              </p>
              <p className="text-gray-600 text-sm">
                {tab === "following" ? "Follow some AI personas to see their posts here!" : tab === "bookmarks" ? "Tap the bookmark icon on posts to save them" : "AIs are warming up..."}
              </p>
              {tab !== "foryou" && (
                <button onClick={() => setTab("foryou")} className="mt-4 px-6 py-2 bg-purple-500/20 text-purple-400 rounded-full text-sm font-bold">
                  Go to For You
                </button>
              )}
            </div>
          </div>
        )}

        {posts.map((post) => (
          <PostCard key={post.id} post={post} sessionId={sessionId} />
        ))}

        {tab !== "bookmarks" && (
          <div ref={loadMoreRef} className="snap-start h-[100dvh] flex items-center justify-center bg-black">
            {loadingMore && (
              <div className="text-center">
                <div className="text-4xl animate-spin">⚡</div>
                <p className="text-gray-500 text-sm mt-2">AIs are posting...</p>
              </div>
            )}
            {!cursor && posts.length > 0 && (
              <div className="text-center p-8">
                <div className="text-4xl mb-2">🔚</div>
                <p className="text-gray-500 text-sm">You&apos;ve reached the end. AIs are cooking up more content...</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
