"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/hooks/useSession";
import type { Post } from "@/lib/types";

interface ChannelInfo {
  id: string;
  slug: string;
  name: string;
  description: string;
  emoji: string;
  subscriber_count: number;
  subscribed: boolean;
}

export default function ChannelPage() {
  const params = useParams();
  const slug = params.slug as string;
  const { sessionId } = useSession();

  const [channel, setChannel] = useState<ChannelInfo | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [reactionCounts, setReactionCounts] = useState<Record<string, Record<string, number>>>({});
  const [userReactions, setUserReactions] = useState<Record<string, Set<string>>>({});
  const [progress, setProgress] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const allPostsRef = useRef<Post[]>([]);

  const currentPost = posts[currentIdx] || null;

  const fetchPosts = useCallback(async (cursor?: string) => {
    const p = new URLSearchParams({ slug });
    p.set("limit", "10");
    if (sessionId) p.set("session_id", sessionId);
    if (cursor) p.set("cursor", cursor);
    const res = await fetch(`/api/channels/feed?${p}`);
    return res.json();
  }, [slug, sessionId]);

  useEffect(() => {
    setLoading(true);
    fetchPosts().then(data => {
      setChannel(data.channel || null);
      const newPosts = data.posts || [];
      setPosts(newPosts);
      allPostsRef.current = newPosts;
      setNextCursor(data.nextCursor);
      syncReactionState(newPosts);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [slug, sessionId, fetchPosts]);

  // Auto-load more when near end
  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await fetchPosts(nextCursor);
      const newPosts = [...allPostsRef.current, ...(data.posts || [])];
      allPostsRef.current = newPosts;
      setPosts(newPosts);
      setNextCursor(data.nextCursor);
      syncReactionState(data.posts || []);
    } catch { /* ignore */ }
    setLoadingMore(false);
  }, [nextCursor, loadingMore, fetchPosts]);

  useEffect(() => {
    if (currentIdx >= posts.length - 3 && nextCursor && !loadingMore) {
      loadMore();
    }
  }, [currentIdx, posts.length, nextCursor, loadMore, loadingMore]);

  // Play current video
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !currentPost?.media_url || currentPost.media_type !== "video") return;
    vid.src = currentPost.media_url;
    vid.load();
    vid.play().catch(() => {
      // Autoplay blocked — try muted
      vid.muted = true;
      setMuted(true);
      vid.play().catch(() => {});
    });
    setPaused(false);
    setProgress(0);
  }, [currentIdx, currentPost?.media_url, currentPost?.media_type]);

  // Track progress
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    const onTime = () => {
      if (vid.duration > 0) setProgress(vid.currentTime / vid.duration);
    };
    const onEnded = () => {
      // Auto-advance to next video
      if (currentIdx < posts.length - 1) {
        setCurrentIdx(prev => prev + 1);
      } else {
        // Loop back to start
        setCurrentIdx(0);
      }
    };
    vid.addEventListener("timeupdate", onTime);
    vid.addEventListener("ended", onEnded);
    return () => {
      vid.removeEventListener("timeupdate", onTime);
      vid.removeEventListener("ended", onEnded);
    };
  }, [currentIdx, posts.length]);

  // Auto-hide controls
  const showControlsBriefly = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  useEffect(() => {
    showControlsBriefly();
    return () => { if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current); };
  }, [showControlsBriefly]);

  // Prefetch next video
  useEffect(() => {
    const next = posts[currentIdx + 1];
    if (next?.media_url && next.media_type === "video") {
      const link = document.createElement("link");
      link.rel = "preload";
      link.as = "video";
      link.href = next.media_url;
      link.setAttribute("data-channel-prefetch", "1");
      document.head.appendChild(link);
      return () => { link.remove(); };
    }
  }, [currentIdx, posts]);

  const togglePlay = () => {
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.paused) {
      vid.play().catch(() => {});
      setPaused(false);
    } else {
      vid.pause();
      setPaused(true);
    }
    showControlsBriefly();
  };

  const toggleMute = () => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.muted = !vid.muted;
    setMuted(vid.muted);
    showControlsBriefly();
  };

  const goNext = () => {
    if (currentIdx < posts.length - 1) setCurrentIdx(prev => prev + 1);
    showControlsBriefly();
  };

  const goPrev = () => {
    if (currentIdx > 0) setCurrentIdx(prev => prev - 1);
    showControlsBriefly();
  };

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

  const syncReactionState = (incoming: Post[]) => {
    const counts: Record<string, Record<string, number>> = { ...reactionCounts };
    const userR: Record<string, Set<string>> = { ...userReactions };
    for (const p of incoming) {
      counts[p.id] = p.reactionCounts || { funny: 0, sad: 0, shocked: 0, crap: 0 };
      userR[p.id] = new Set(p.userReactions || []);
    }
    setReactionCounts(counts);
    setUserReactions(userR);
  };

  const handleReaction = async (emoji: string) => {
    if (!sessionId || !currentPost) return;
    const pid = currentPost.id;
    const wasActive = userReactions[pid]?.has(emoji) || false;
    const previousReactions = new Set(userReactions[pid] || []);

    // Single-select: optimistic update — clear all previous, toggle this one
    setUserReactions(prev => {
      const newSet = new Set<string>();
      if (!wasActive) newSet.add(emoji);
      return { ...prev, [pid]: newSet };
    });
    setReactionCounts(prev => {
      const current = { ...(prev[pid] || { funny: 0, sad: 0, shocked: 0, crap: 0 }) };
      // Decrement any previously active reactions
      for (const prevEmoji of previousReactions) {
        if (prevEmoji !== emoji) {
          current[prevEmoji] = Math.max(0, (current[prevEmoji] || 0) - 1);
        }
      }
      // Toggle the selected emoji
      current[emoji] = Math.max(0, (current[emoji] || 0) + (wasActive ? -1 : 1));
      return { ...prev, [pid]: current };
    });

    // Remove previous reactions on server, then toggle the new one
    try {
      for (const prevEmoji of previousReactions) {
        if (prevEmoji !== emoji) {
          await fetch("/api/interact", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ post_id: pid, session_id: sessionId, action: "react", emoji: prevEmoji }),
          });
        }
      }
      await fetch("/api/interact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post_id: pid, session_id: sessionId, action: "react", emoji }),
      });
    } catch { /* optimistic update already applied */ }

    setShowEmojiPicker(false);
  };

  const currentReactionCounts = currentPost ? (reactionCounts[currentPost.id] || { funny: 0, sad: 0, shocked: 0, crap: 0 }) : { funny: 0, sad: 0, shocked: 0, crap: 0 };
  const currentUserReactions = currentPost ? (userReactions[currentPost.id] || new Set<string>()) : new Set<string>();

  if (loading) {
    return (
      <div className="h-[100dvh] bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">📺</div>
          <p className="text-gray-400 font-mono text-sm">Tuning in...</p>
        </div>
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="h-[100dvh] bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">📺</div>
          <p className="text-gray-400 mb-4">Channel not found</p>
          <Link href="/channels" className="text-cyan-400 hover:text-cyan-300">Browse channels</Link>
        </div>
      </div>
    );
  }

  const isVideo = currentPost?.media_type === "video" && currentPost?.media_url;
  const isImage = currentPost?.media_type === "image" && currentPost?.media_url;

  return (
    <div
      className="h-[100dvh] bg-black text-white flex flex-col overflow-hidden relative select-none"
      onClick={() => { showControlsBriefly(); setShowEmojiPicker(false); }}
    >
      {/* Full-screen video/image */}
      <div className="absolute inset-0">
        {isVideo && (
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted={muted}
            onClick={togglePlay}
          />
        )}
        {isImage && (
          <img
            src={currentPost.media_url!}
            alt=""
            className="w-full h-full object-cover"
          />
        )}
        {!isVideo && !isImage && (
          <div className="w-full h-full flex items-center justify-center bg-gray-900">
            <div className="text-center px-8">
              <div className="text-4xl mb-3">{channel.emoji}</div>
              <p className="text-gray-300 text-sm">{currentPost?.content || "No content"}</p>
            </div>
          </div>
        )}
      </div>

      {/* Top bar — channel info + back */}
      <div className={`relative z-10 transition-opacity duration-300 ${showControls ? "opacity-100" : "opacity-0"}`}>
        <div className="flex items-center justify-between px-4 pt-3 pb-8 bg-gradient-to-b from-black/70 to-transparent">
          <div className="flex items-center gap-3">
            <Link href="/channels" className="text-white/80 hover:text-white">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm">{channel.emoji}</span>
                <span className="text-sm font-bold">{channel.name}</span>
                <span className="text-[8px] px-1 py-0.5 rounded bg-red-600 text-white font-bold ml-1">LIVE</span>
              </div>
              <p className="text-[10px] text-gray-400">{channel.subscriber_count} subscribers</p>
            </div>
          </div>

          <button
            onClick={toggleSubscribe}
            className={`text-[11px] px-3 py-1 rounded-full font-bold transition-all active:scale-95 ${
              channel.subscribed
                ? "bg-white/10 text-white"
                : "bg-cyan-500 text-black"
            }`}
          >
            {channel.subscribed ? "Subscribed" : "Subscribe"}
          </button>
        </div>
      </div>

      {/* Right side: Thumbs-up reaction button with long-press emoji picker */}
      {currentPost && (
        <div className="absolute right-3 bottom-36 z-20 flex flex-col items-center">
          {/* Emoji picker (shown on long-press) */}
          {showEmojiPicker && (
            <div className="absolute bottom-14 right-0 bg-black/80 backdrop-blur-xl rounded-2xl p-2 flex flex-col gap-1 border border-white/10 shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200">
              {([
                { key: "funny", emoji: "😂" },
                { key: "sad", emoji: "😢" },
                { key: "shocked", emoji: "😮" },
                { key: "crap", emoji: "💩" },
              ] as const).map(({ key, emoji }) => (
                <button
                  key={key}
                  onClick={(e) => { e.stopPropagation(); handleReaction(key); }}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all active:scale-95 hover:bg-white/10 ${
                    currentUserReactions.has(key) ? "bg-white/15" : ""
                  }`}
                >
                  <span className="text-2xl">{emoji}</span>
                  {(currentReactionCounts[key] || 0) > 0 && (
                    <span className="text-[11px] text-white/70 font-bold min-w-[16px]">
                      {currentReactionCounts[key]}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
          {/* Main thumbs-up button */}
          {(() => {
            const activeEntry = (["funny", "sad", "shocked", "crap"] as const).find(k => currentUserReactions.has(k));
            const activeEmoji = activeEntry ? { funny: "😂", sad: "😢", shocked: "😮", crap: "💩" }[activeEntry] : null;
            const totalReactions = Object.values(currentReactionCounts).reduce((a, b) => a + b, 0);
            return (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (activeEntry) {
                    // Tap when active = unreact
                    handleReaction(activeEntry);
                  } else {
                    // Tap when no reaction = quick react with "funny"
                    handleReaction("funny");
                  }
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  longPressTimerRef.current = setTimeout(() => {
                    setShowEmojiPicker(prev => !prev);
                  }, 400);
                }}
                onPointerUp={() => clearTimeout(longPressTimerRef.current)}
                onPointerLeave={() => clearTimeout(longPressTimerRef.current)}
                className={`w-12 h-12 rounded-full flex flex-col items-center justify-center transition-all active:scale-90 ${
                  activeEntry
                    ? "bg-white/20 backdrop-blur-sm"
                    : "bg-black/40 backdrop-blur-sm border border-white/20"
                }`}
              >
                <span className="text-2xl leading-none">{activeEmoji || "👍"}</span>
                {totalReactions > 0 && (
                  <span className="text-[9px] text-white font-bold leading-none mt-0.5">{totalReactions}</span>
                )}
              </button>
            );
          })()}
        </div>
      )}

      {/* Bottom controls */}
      <div className={`absolute bottom-0 left-0 right-0 z-10 transition-opacity duration-300 ${showControls ? "opacity-100" : "opacity-0"}`}>
        {/* Progress bar */}
        {isVideo && (
          <div className="px-4 mb-2">
            <div className="h-0.5 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-400 rounded-full transition-[width] duration-200"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>
        )}

        <div className="px-4 pb-6 pt-4 bg-gradient-to-t from-black/80 to-transparent">
          {/* Episode info */}
          {currentPost && (
            <p className="text-xs text-gray-300 mb-3 line-clamp-2">
              <span className="text-white font-bold">@{currentPost.username}</span>{" "}
              {currentPost.content?.split("\n")[0]?.slice(0, 100)}
            </p>
          )}

          {/* Controls row */}
          <div className="flex items-center justify-between">
            {/* Left: prev / play / next */}
            <div className="flex items-center gap-4">
              <button onClick={goPrev} disabled={currentIdx === 0} className="text-white/70 hover:text-white disabled:opacity-30">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
                </svg>
              </button>

              <button onClick={togglePlay} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 active:scale-95 transition-all">
                {paused ? (
                  <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                  </svg>
                )}
              </button>

              <button onClick={goNext} disabled={currentIdx >= posts.length - 1} className="text-white/70 hover:text-white disabled:opacity-30">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
                </svg>
              </button>
            </div>

            {/* Center: episode counter */}
            <span className="text-[10px] text-gray-500 font-mono">
              {currentIdx + 1} / {posts.length}
            </span>

            {/* Right: volume */}
            <button onClick={toggleMute} className="text-white/70 hover:text-white">
              {muted ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"/>
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/>
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Paused overlay */}
      {paused && (
        <div className="absolute inset-0 z-[5] flex items-center justify-center pointer-events-none">
          <div className="w-16 h-16 rounded-full bg-black/40 flex items-center justify-center">
            <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}
