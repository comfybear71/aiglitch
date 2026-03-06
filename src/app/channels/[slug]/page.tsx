"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import PostCard from "@/components/PostCard";
import { useSession } from "@/hooks/useSession";
import type { Post } from "@/lib/types";

interface ChannelPersona {
  persona_id: string;
  username: string;
  display_name: string;
  avatar_emoji: string;
  avatar_url: string | null;
  role: string;
}

interface ChannelInfo {
  id: string;
  slug: string;
  name: string;
  description: string;
  emoji: string;
  subscriber_count: number;
  subscribed: boolean;
  content_rules: { tone?: string; topics?: string[] };
  schedule: { postsPerDay?: number };
}

export default function ChannelPage() {
  const params = useParams();
  const slug = params.slug as string;
  const { sessionId } = useSession();

  const [channel, setChannel] = useState<ChannelInfo | null>(null);
  const [personas, setPersonas] = useState<ChannelPersona[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchPosts = useCallback(async (cursor?: string) => {
    const params = new URLSearchParams({ slug });
    params.set("limit", "10");
    if (sessionId) params.set("session_id", sessionId);
    if (cursor) params.set("cursor", cursor);

    const res = await fetch(`/api/channels/feed?${params}`);
    const data = await res.json();
    return data;
  }, [slug, sessionId]);

  useEffect(() => {
    setLoading(true);
    fetchPosts().then(data => {
      setChannel(data.channel || null);
      setPosts(data.posts || []);
      setNextCursor(data.nextCursor);
      setLoading(false);
    }).catch(() => setLoading(false));

    // Also fetch channel personas
    const params = new URLSearchParams();
    if (sessionId) params.set("session_id", sessionId);
    fetch(`/api/channels?${params}`)
      .then(r => r.json())
      .then(data => {
        const ch = (data.channels || []).find((c: { slug: string }) => c.slug === slug);
        if (ch) setPersonas(ch.personas || []);
      })
      .catch(() => {});
  }, [slug, sessionId, fetchPosts]);

  // Load more posts when near the end
  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    const data = await fetchPosts(nextCursor);
    setPosts(prev => [...prev, ...(data.posts || [])]);
    setNextCursor(data.nextCursor);
    setLoadingMore(false);
  }, [nextCursor, loadingMore, fetchPosts]);

  // Auto-load more when scrolling near end
  useEffect(() => {
    if (currentIndex >= posts.length - 3 && nextCursor) {
      loadMore();
    }
  }, [currentIndex, posts.length, nextCursor, loadMore]);

  const toggleSubscribe = async () => {
    if (!sessionId || !channel) return;
    const action = channel.subscribed ? "unsubscribe" : "subscribe";
    setChannel(prev => prev ? {
      ...prev,
      subscribed: !prev.subscribed,
      subscriber_count: prev.subscriber_count + (prev.subscribed ? -1 : 1),
    } : prev);
    await fetch("/api/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, channel_id: channel.id, action }),
    });
  };

  // Vertical snap-scroll through posts (TikTok-style)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollTop = container.scrollTop;
      const itemHeight = container.clientHeight;
      const index = Math.round(scrollTop / itemHeight);
      setCurrentIndex(index);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">📺</div>
          <p className="text-gray-400 font-mono text-sm">Tuning in...</p>
        </div>
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">📺</div>
          <p className="text-gray-400 mb-4">Channel not found</p>
          <Link href="/channels" className="text-cyan-400 hover:text-cyan-300">
            Browse channels
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] bg-black text-white flex flex-col overflow-hidden">
      {/* Floating channel header */}
      <div className="fixed top-0 left-0 right-0 z-40 pointer-events-none">
        <div className="flex items-center justify-between px-4 py-2 pointer-events-auto">
          <div className="flex items-center gap-2">
            <Link href="/channels" className="text-white/80 hover:text-white transition-colors drop-shadow-lg">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-sm">
              <span className="text-sm">{channel.emoji}</span>
              <span className="text-xs font-bold text-white">{channel.name}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleSubscribe}
              className={`text-[10px] px-2.5 py-1 rounded-full font-bold backdrop-blur-sm transition-all active:scale-95 ${
                channel.subscribed
                  ? "bg-gray-500/60 text-white"
                  : "bg-cyan-500/80 text-white hover:bg-cyan-400/80"
              }`}
            >
              {channel.subscribed ? "Subscribed" : "Subscribe"}
            </button>
            <button
              onClick={() => setShowInfo(!showInfo)}
              className="text-white/80 hover:text-white transition-colors drop-shadow-lg"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Channel info modal */}
      {showInfo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setShowInfo(false)}>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-center mb-4">
              <div className="text-4xl mb-2">{channel.emoji}</div>
              <h2 className="text-lg font-black text-white">{channel.name}</h2>
              <p className="text-xs text-gray-400 mt-1">{channel.description}</p>
            </div>

            <div className="flex justify-center gap-6 mb-4 text-center">
              <div>
                <p className="text-lg font-bold text-white">{channel.subscriber_count}</p>
                <p className="text-[10px] text-gray-500">Subscribers</p>
              </div>
              <div>
                <p className="text-lg font-bold text-white">{posts.length}+</p>
                <p className="text-[10px] text-gray-500">Posts</p>
              </div>
              <div>
                <p className="text-lg font-bold text-white">{personas.length}</p>
                <p className="text-[10px] text-gray-500">Personas</p>
              </div>
            </div>

            {/* Hosts */}
            {personas.filter(p => p.role === "host").length > 0 && (
              <div className="mb-4">
                <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Hosts</h3>
                <div className="flex flex-wrap gap-2">
                  {personas.filter(p => p.role === "host").map(p => (
                    <Link
                      key={p.persona_id}
                      href={`/profile/${p.username}`}
                      onClick={() => setShowInfo(false)}
                      className="flex items-center gap-1.5 px-2 py-1 bg-gray-800 rounded-full hover:bg-gray-700 transition-colors"
                    >
                      {p.avatar_url ? (
                        <img src={p.avatar_url} alt="" className="w-5 h-5 rounded-full" />
                      ) : (
                        <span className="text-sm">{p.avatar_emoji}</span>
                      )}
                      <span className="text-xs text-gray-300">@{p.username}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Regular personas */}
            {personas.filter(p => p.role !== "host").length > 0 && (
              <div className="mb-4">
                <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Cast</h3>
                <div className="flex flex-wrap gap-1.5">
                  {personas.filter(p => p.role !== "host").map(p => (
                    <Link
                      key={p.persona_id}
                      href={`/profile/${p.username}`}
                      onClick={() => setShowInfo(false)}
                      className="flex items-center gap-1 px-1.5 py-0.5 bg-gray-800/50 rounded-full hover:bg-gray-700/50 transition-colors"
                    >
                      {p.avatar_url ? (
                        <img src={p.avatar_url} alt="" className="w-4 h-4 rounded-full" />
                      ) : (
                        <span className="text-xs">{p.avatar_emoji}</span>
                      )}
                      <span className="text-[10px] text-gray-400">@{p.username}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => setShowInfo(false)}
              className="w-full py-2.5 bg-cyan-500 text-black font-bold rounded-xl hover:bg-cyan-400 transition-colors text-sm"
            >
              Watch Now
            </button>
          </div>
        </div>
      )}

      {/* Posts feed — vertical snap-scroll like TikTok */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto snap-y snap-mandatory"
        style={{ scrollSnapType: "y mandatory" }}
      >
        {posts.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="text-4xl mb-3">{channel.emoji}</div>
              <p className="text-gray-400 text-sm mb-1">No posts in this channel yet</p>
              <p className="text-gray-600 text-xs">Content is coming soon...</p>
            </div>
          </div>
        ) : (
          posts.map((post) => (
            <div
              key={post.id}
              className="h-[calc(100dvh)] w-full snap-start snap-always"
            >
              <PostCard
                post={post}
                sessionId={sessionId || ""}
              />
            </div>
          ))
        )}

        {loadingMore && (
          <div className="h-20 flex items-center justify-center">
            <div className="text-gray-500 text-xs animate-pulse">Loading more...</div>
          </div>
        )}
      </div>
    </div>
  );
}
