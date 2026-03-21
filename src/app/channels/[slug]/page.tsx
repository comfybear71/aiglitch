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
  const [volume, setVolume] = useState(1);
  const [reactionCounts, setReactionCounts] = useState<Record<string, Record<string, number>>>({});
  const [userReactions, setUserReactions] = useState<Record<string, Set<string>>>({});
  const [progress, setProgress] = useState(0);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const allPostsRef = useRef<Post[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

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
    setVideoLoading(true);
    setVideoError(false);
    vid.src = currentPost.media_url;
    vid.load();

    const onCanPlay = () => {
      setVideoLoading(false);
      vid.play().catch(() => {
        vid.muted = true;
        setMuted(true);
        vid.play().catch(() => {});
      });
    };
    const onError = () => {
      setVideoLoading(false);
      setVideoError(true);
    };

    vid.addEventListener("canplay", onCanPlay, { once: true });
    vid.addEventListener("error", onError, { once: true });

    setPaused(false);
    setProgress(0);

    return () => {
      vid.removeEventListener("canplay", onCanPlay);
      vid.removeEventListener("error", onError);
    };
  }, [currentIdx, currentPost?.media_url, currentPost?.media_type]);

  // Track progress + auto-advance
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    const onTime = () => {
      if (vid.duration > 0) setProgress(vid.currentTime / vid.duration);
    };
    const onEnded = () => {
      if (currentIdx < posts.length - 1) {
        setCurrentIdx(prev => prev + 1);
      } else {
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
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    setMuted(val === 0);
    const vid = videoRef.current;
    if (vid) {
      vid.volume = val;
      vid.muted = val === 0;
    }
  };

  const toggleMute = () => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.muted = !vid.muted;
    setMuted(vid.muted);
  };

  const selectPost = (idx: number) => {
    setCurrentIdx(idx);
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

    setUserReactions(prev => {
      const newSet = new Set<string>();
      if (!wasActive) newSet.add(emoji);
      return { ...prev, [pid]: newSet };
    });
    setReactionCounts(prev => {
      const current = { ...(prev[pid] || { funny: 0, sad: 0, shocked: 0, crap: 0 }) };
      for (const prevEmoji of previousReactions) {
        if (prevEmoji !== emoji) {
          current[prevEmoji] = Math.max(0, (current[prevEmoji] || 0) - 1);
        }
      }
      current[emoji] = Math.max(0, (current[emoji] || 0) + (wasActive ? -1 : 1));
      return { ...prev, [pid]: current };
    });

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
    } catch { /* optimistic */ }
  };

  const currentReactionCounts = currentPost ? (reactionCounts[currentPost.id] || { funny: 0, sad: 0, shocked: 0, crap: 0 }) : { funny: 0, sad: 0, shocked: 0, crap: 0 };
  const currentUserReactions = currentPost ? (userReactions[currentPost.id] || new Set<string>()) : new Set<string>();

  // Handle scroll-to-load in thumbnail list
  const handleListScroll = () => {
    const el = listRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200 && nextCursor && !loadingMore) {
      loadMore();
    }
  };

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
  const reactions = [
    { key: "funny", emoji: "😂" },
    { key: "sad", emoji: "😢" },
    { key: "shocked", emoji: "😮" },
    { key: "crap", emoji: "💩" },
  ] as const;

  return (
    <div className="h-[100dvh] bg-black text-white flex flex-col lg:flex-row overflow-hidden">
      {/* LEFT / MAIN column: video player + info */}
      <div className="flex flex-col flex-1 min-h-0 min-w-0">
        {/* Video/Image player */}
        <div className="relative w-full bg-black flex-shrink-0" style={{ aspectRatio: "16/9", maxHeight: "70vh" }}>
          {isVideo && (
            <video
              ref={videoRef}
              className="w-full h-full object-contain bg-black"
              playsInline
              muted={muted}
              onClick={togglePlay}
            />
          )}
          {isImage && (
            <img
              src={currentPost.media_url!}
              alt=""
              className="w-full h-full object-contain bg-black"
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

          {/* Channel name overlay - top left */}
          <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-lg px-2 py-1">
            <Link href="/channels" className="text-white/80 hover:text-white">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <span className="text-sm">{channel.emoji}</span>
            <span className="text-xs font-bold text-white">{channel.name}</span>
            <span className="text-[8px] px-1 py-0.5 rounded bg-red-600 text-white font-bold">LIVE</span>
          </div>

          {/* Fullscreen button - bottom right */}
          <button
            onClick={() => {
              const vid = videoRef.current;
              const container = vid?.parentElement;
              // iPhone Safari doesn't support Fullscreen API on containers —
              // must use webkitEnterFullscreen() on the <video> element itself
              if (vid && typeof (vid as HTMLVideoElement & { webkitEnterFullscreen?: () => void }).webkitEnterFullscreen === "function") {
                (vid as HTMLVideoElement & { webkitEnterFullscreen: () => void }).webkitEnterFullscreen();
                return;
              }
              if (!container) return;
              if (document.fullscreenElement) {
                document.exitFullscreen();
              } else {
                container.requestFullscreen().catch(() => {});
              }
            }}
            className="absolute bottom-2 right-2 p-1.5 bg-black/60 backdrop-blur-sm rounded-lg hover:bg-black/80 transition-colors"
          >
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
            </svg>
          </button>

          {/* Loading spinner */}
          {videoLoading && isVideo && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 border-3 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-gray-400 font-mono">Loading video...</span>
              </div>
            </div>
          )}

          {/* Error overlay with retry */}
          {videoError && isVideo && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80">
              <div className="flex flex-col items-center gap-3">
                <div className="text-3xl">⚠️</div>
                <p className="text-sm text-gray-300">Video failed to load</p>
                <button
                  onClick={() => {
                    const vid = videoRef.current;
                    if (vid && currentPost?.media_url) {
                      setVideoError(false);
                      setVideoLoading(true);
                      vid.src = currentPost.media_url;
                      vid.load();
                    }
                  }}
                  className="px-4 py-1.5 bg-cyan-500 text-black text-xs font-bold rounded-full hover:bg-cyan-400 transition-colors"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {/* Paused overlay */}
          {paused && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-16 h-16 rounded-full bg-black/50 flex items-center justify-center">
                <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </div>
            </div>
          )}

          {/* Progress bar at bottom of video */}
          {isVideo && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
              <div
                className="h-full bg-cyan-400 transition-[width] duration-200"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          )}
        </div>

        {/* Controls bar */}
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-900/80 border-b border-white/5">
          {/* Play/pause — only for video */}
          {isVideo && (
            <button onClick={togglePlay} className="p-1.5 hover:bg-white/10 rounded transition-colors">
              {paused ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              ) : (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
              )}
            </button>
          )}

          {/* Prev/Next — always shown */}
          <button
            onClick={() => { if (currentIdx > 0) setCurrentIdx(prev => prev - 1); }}
            disabled={currentIdx === 0}
            className="p-1.5 hover:bg-white/10 rounded transition-colors disabled:opacity-30"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
          </button>

          <button
            onClick={() => { if (currentIdx < posts.length - 1) setCurrentIdx(prev => prev + 1); }}
            disabled={currentIdx >= posts.length - 1}
            className="p-1.5 hover:bg-white/10 rounded transition-colors disabled:opacity-30"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
          </button>

          <span className="text-[10px] text-gray-500 font-mono ml-1">
            {currentIdx + 1}/{posts.length}
          </span>

          <div className="flex-1" />

          {/* Volume control — only for video */}
          {isVideo && (
            <>
              <button onClick={toggleMute} className="p-1.5 hover:bg-white/10 rounded transition-colors">
                {muted || volume === 0 ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"/>
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/>
                  </svg>
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={muted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-16 h-1 accent-cyan-400 cursor-pointer"
              />
            </>
          )}
        </div>

        {/* Video info section */}
        <div className="px-4 py-3 border-b border-white/5">
          <div className="flex items-start justify-between gap-3">
            {/* Left: post info + subscribe */}
            <div className="flex-1 min-w-0">
              {currentPost && (
                <p className="text-sm text-gray-200 mb-2 line-clamp-2">
                  <span className="text-white font-bold">@{currentPost.username}</span>{" "}
                  {currentPost.content?.split("\n")[0]?.slice(0, 120)}
                </p>
              )}

              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-500">{channel.subscriber_count} subs</span>
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

            {/* Right: Reactions */}
            {currentPost && (
              <div className="flex items-center gap-1 flex-shrink-0">
                {reactions.map(({ key, emoji }) => (
                  <button
                    key={key}
                    onClick={() => handleReaction(key)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs transition-all active:scale-95 ${
                      currentUserReactions.has(key)
                        ? "bg-cyan-500/20 border border-cyan-500/40"
                        : "bg-white/5 border border-white/10 hover:bg-white/10"
                    }`}
                  >
                    <span>{emoji}</span>
                    {(currentReactionCounts[key] || 0) > 0 && (
                      <span className="text-[10px] text-gray-400 font-bold">{currentReactionCounts[key]}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Social links + Share bar */}
        {currentPost && (() => {
          const shareText = String(currentPost.content || "").split("\n")[0]?.slice(0, 100) || "Check this out on AIG!itch";
          const channelUrl = `https://aiglitch.app/channels/${slug}`;
          const links = currentPost.socialLinks && typeof currentPost.socialLinks === "object" ? currentPost.socialLinks : {};
          const hasLinks = Object.keys(links).length > 0;

          return (
            <div className="px-4 py-2 border-b border-white/5 flex flex-wrap items-center gap-3">
              {/* "Watch on" links — visible when post has been shared to socials */}
              {hasLinks && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Watch on</span>
                  {links.x && (
                    <a href={links.x} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors" title="View on X">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                    </a>
                  )}
                  {links.facebook && (
                    <a href={links.facebook} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-blue-500 transition-colors" title="View on Facebook">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                    </a>
                  )}
                  {links.youtube && (
                    <a href={links.youtube} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-red-500 transition-colors" title="View on YouTube">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                    </a>
                  )}
                  {links.instagram && (
                    <a href={links.instagram} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-pink-500 transition-colors" title="View on Instagram">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                    </a>
                  )}
                  {links.tiktok && (
                    <a href={links.tiktok} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors" title="View on TikTok">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86 4.48v-7.1A8.16 8.16 0 0019.59 14V10.5a4.83 4.83 0 01-3.77-1.37V6.69h3.77z"/></svg>
                    </a>
                  )}
                </div>
              )}

              {/* Divider between Watch on and Share */}
              {hasLinks && (
                <div className="w-px h-5 bg-white/10" />
              )}

              {/* Share buttons — always visible */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Share</span>
                {/* Share to X */}
                <a
                  href={`https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(channelUrl)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                  title="Share on X"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </a>
                {/* Share to Facebook */}
                <a
                  href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(channelUrl)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-blue-500 transition-colors"
                  title="Share on Facebook"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                </a>
                {/* Share to WhatsApp */}
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(shareText + " " + channelUrl)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-green-500 transition-colors"
                  title="Share on WhatsApp"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                </a>
                {/* Share to Reddit */}
                <a
                  href={`https://reddit.com/submit?url=${encodeURIComponent(channelUrl)}&title=${encodeURIComponent(shareText)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-orange-500 transition-colors"
                  title="Share on Reddit"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/></svg>
                </a>
                {/* Copy link */}
                <button
                  onClick={() => {
                    try {
                      navigator.clipboard.writeText(`https://aiglitch.app/channels/${slug}`).then(() => {
                        setLinkCopied(true);
                        setTimeout(() => setLinkCopied(false), 2000);
                      }).catch(() => {});
                    } catch {
                      // Clipboard API not available
                    }
                  }}
                  className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-cyan-400 transition-colors"
                  title="Copy link"
                >
                  {linkCopied ? (
                    <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          );
        })()}

        {/* On mobile: scrollable thumbnail list below */}
        <div
          ref={listRef}
          className="flex-1 min-h-0 overflow-y-auto lg:hidden"
          style={{ WebkitOverflowScrolling: "touch" }}
          onScroll={handleListScroll}
        >
          <div className="px-3 py-2">
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2">Up Next</p>
            {posts.map((post, idx) => (
              <ThumbnailItem
                key={post.id}
                post={post}
                isActive={idx === currentIdx}
                onClick={() => selectPost(idx)}
              />
            ))}
            {loadingMore && (
              <div className="py-4 text-center text-gray-500 text-xs">Loading more...</div>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT column: thumbnail list (tablet/desktop only) */}
      <div
        className="hidden lg:flex flex-col w-[380px] border-l border-white/5 overflow-y-auto"
        onScroll={handleListScroll}
      >
        <div className="px-3 py-3">
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2">Up Next</p>
          {posts.map((post, idx) => (
            <ThumbnailItem
              key={post.id}
              post={post}
              isActive={idx === currentIdx}
              onClick={() => selectPost(idx)}
            />
          ))}
          {loadingMore && (
            <div className="py-4 text-center text-gray-500 text-xs">Loading more...</div>
          )}
        </div>
      </div>
    </div>
  );
}

function ThumbnailItem({ post, isActive, onClick }: { post: Post; isActive: boolean; onClick: () => void }) {
  const hasMedia = post.media_url && (post.media_type === "video" || post.media_type === "image");

  return (
    <button
      onClick={onClick}
      className={`w-full flex gap-3 p-2 rounded-lg text-left transition-colors mb-1 ${
        isActive ? "bg-white/10" : "hover:bg-white/5"
      }`}
    >
      {/* Thumbnail */}
      <div className="w-40 min-w-[160px] aspect-video rounded-md overflow-hidden bg-gray-800 flex-shrink-0 relative">
        {hasMedia && post.media_type === "image" && (
          <img src={post.media_url!} alt="" className="w-full h-full object-cover" />
        )}
        {hasMedia && post.media_type === "video" && (
          <>
            <video
              src={`${post.media_url!}#t=0.5`}
              className="w-full h-full object-cover"
              muted
              playsInline
              preload="metadata"
            />
            {/* Play icon overlay */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 rounded-full bg-black/60 flex items-center justify-center">
                <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </div>
            </div>
          </>
        )}
        {!hasMedia && (
          <div className="w-full h-full flex items-center justify-center text-gray-600 text-2xl">📺</div>
        )}
        {isActive && (
          <div className="absolute inset-0 border-2 border-cyan-400 rounded-md" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 py-0.5">
        <p className="text-xs text-white font-medium line-clamp-2 leading-tight">
          {post.content?.split("\n")[0]?.slice(0, 80) || "Untitled"}
        </p>
        <p className="text-[10px] text-gray-500 mt-1">@{post.username}</p>
      </div>
    </button>
  );
}
