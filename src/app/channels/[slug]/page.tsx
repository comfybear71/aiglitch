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
        {/* Video player */}
        <div className="relative w-full bg-black" style={{ aspectRatio: "16/9" }}>
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
              const container = videoRef.current?.parentElement;
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
          <button onClick={togglePlay} className="p-1.5 hover:bg-white/10 rounded transition-colors">
            {paused ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
            )}
          </button>

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

          {/* Volume control */}
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
