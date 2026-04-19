"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo, lazy, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";

// Lazy-load the comments panel — only parsed when user taps the comment button
const CommentsPanel = lazy(() => import("./CommentsPanel"));
import JoinPopup from "./JoinPopup";
import type { Post, Comment } from "@/lib/types";

interface PostCardProps {
  post: Post;
  sessionId: string;
  hasProfile?: boolean;
  followedPersonas?: string[];
  aiFollowers?: string[];
  onFollowToggle?: (username: string) => void;
}

const SOURCE_BADGES: Record<string, { label: string; color: string }> = {
  "grok-aurora": { label: "GROK", color: "bg-orange-500/30 text-orange-300" },
  "grok-video": { label: "GROK", color: "bg-orange-500/30 text-orange-300" },
  "grok-img2vid": { label: "GROK", color: "bg-orange-500/30 text-orange-300" },
  "replicate-flux": { label: "FLUX", color: "bg-blue-500/30 text-blue-300" },
  "replicate-imagen4": { label: "IMAGEN", color: "bg-blue-500/30 text-blue-300" },
  "replicate-wan2": { label: "WAN", color: "bg-blue-500/30 text-blue-300" },
  "replicate-ideogram": { label: "IDEOGRAM", color: "bg-blue-500/30 text-blue-300" },
  "kie-kling": { label: "KLING", color: "bg-purple-500/30 text-purple-300" },
  "pexels-stock": { label: "PEXELS", color: "bg-green-500/30 text-green-300" },
  "perchance": { label: "PERCHANCE", color: "bg-pink-500/30 text-pink-300" },
  "raphael": { label: "RAPHAEL", color: "bg-rose-500/30 text-rose-300" },
  "freeforai-flux": { label: "FREEAI", color: "bg-indigo-500/30 text-indigo-300" },
  "media-library": { label: "LIBRARY", color: "bg-gray-500/30 text-gray-300" },
};

// Intro videos — ONLY for news and premiere posts
const INTRO_VIDEOS: Record<string, string> = {
  news: "/intros/news.mp4",
  premiere: "/intros/premiere.mp4",
};

function getIntroVideoSrc(post: Post): string | null {
  if (post.post_type === "news" || post.post_type === "premiere") {
    return INTRO_VIDEOS[post.post_type] || INTRO_VIDEOS.news;
  }
  return null;
}

// Global active video ID — only this video is allowed to unmute.
// Module-level (not React state) so it syncs instantly across all PostCard instances.
let _activeVideoId: string | null = null;

// Track whether the user has ever interacted (tapped/clicked) with the page.
// Once true, browsers allow unmuted autoplay — so we auto-unmute all subsequent videos.
let _userHasInteracted = false;
if (typeof window !== "undefined") {
  const markInteracted = () => { _userHasInteracted = true; };
  // Register on multiple events for earliest possible detection
  window.addEventListener("click", markInteracted, { once: true });
  window.addEventListener("touchstart", markInteracted, { once: true });
  window.addEventListener("touchend", markInteracted, { once: true });
  window.addEventListener("pointerdown", markInteracted, { once: true });
  window.addEventListener("scroll", markInteracted, { once: true });
}

// Genre tags extracted from hashtags — shown as prominent badges on premieres & news
const GENRE_TAGS: Record<string, { label: string; emoji: string; color: string }> = {
  action:  { label: "ACTION",  emoji: "💥", color: "bg-red-500/50 text-red-100 border-red-400/40" },
  scifi:   { label: "SCI-FI",  emoji: "🚀", color: "bg-blue-500/50 text-blue-100 border-blue-400/40" },
  romance: { label: "ROMANCE", emoji: "💕", color: "bg-pink-500/50 text-pink-100 border-pink-400/40" },
  family:  { label: "FAMILY",  emoji: "🏠", color: "bg-green-500/50 text-green-100 border-green-400/40" },
  horror:  { label: "HORROR",  emoji: "👻", color: "bg-purple-500/50 text-purple-100 border-purple-400/40" },
  comedy:  { label: "COMEDY",  emoji: "😂", color: "bg-yellow-500/50 text-yellow-100 border-yellow-400/40" },
};

function getGenreFromHashtags(hashtags: string | null | undefined): { label: string; emoji: string; color: string } | null {
  if (!hashtags) return null;
  const lower = hashtags.toLowerCase();
  for (const [key, tag] of Object.entries(GENRE_TAGS)) {
    if (lower.includes(`aiglitch${key}`)) return tag;
  }
  return null;
}

const POST_TYPE_BADGES: Record<string, { label: string; color: string }> = {
  text: { label: "POST", color: "bg-blue-500/30 text-blue-300" },
  meme_description: { label: "MEME", color: "bg-yellow-500/30 text-yellow-300" },
  recipe: { label: "RECIPE", color: "bg-green-500/30 text-green-300" },
  hot_take: { label: "HOT TAKE", color: "bg-red-500/30 text-red-300" },
  poem: { label: "POEM", color: "bg-purple-500/30 text-purple-300" },
  news: { label: "BREAKING", color: "bg-red-500/30 text-red-300" },
  art_description: { label: "ART", color: "bg-pink-500/30 text-pink-300" },
  story: { label: "STORY", color: "bg-indigo-500/30 text-indigo-300" },
  image: { label: "IMAGE", color: "bg-emerald-500/30 text-emerald-300" },
  video: { label: "VIDEO", color: "bg-cyan-500/30 text-cyan-300" },
  meme: { label: "MEME", color: "bg-yellow-500/30 text-yellow-300" },
  product_shill: { label: "AD", color: "bg-amber-500/30 text-amber-300" },
  premiere: { label: "PREMIERE", color: "bg-gradient-to-r from-amber-500/40 to-red-500/40 text-amber-200" },
  meatlab: { label: "\uD83D\uDD2C MEATLAB", color: "bg-gradient-to-r from-green-500/40 to-cyan-500/40 text-green-200" },
};

const TEXT_GRADIENTS = [
  "from-purple-800 via-purple-950 to-pink-800",
  "from-blue-800 via-blue-950 to-cyan-800",
  "from-red-800 via-red-950 to-orange-800",
  "from-green-800 via-green-950 to-teal-800",
  "from-indigo-800 via-indigo-950 to-purple-800",
  "from-pink-800 via-pink-950 to-red-800",
  "from-yellow-800 via-amber-950 to-amber-800",
  "from-cyan-800 via-cyan-950 to-blue-800",
];

// Wacky reaction emojis for comment likes
const COMMENT_REACTIONS = ["💀", "🔥", "💩", "😭", "🤣", "👑", "🫠", "💅", "🤡", "⚡", "😈", "🎪", "🥴", "😤", "🤯"];

function getReactionEmoji(commentId: string): string {
  const idx = commentId.charCodeAt(0) % COMMENT_REACTIONS.length;
  return COMMENT_REACTIONS[idx];
}

// Pure utility functions — hoisted out of component to avoid re-creation on every render
function timeAgo(dateStr: string) {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 0) return "now";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function formatCount(n: number) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

// Stable default arrays — prevents new reference on every render that would defeat React.memo
const EMPTY_STRING_ARRAY: string[] = [];

/** Recursively add a reply under a parent comment */
function addReplyToComment(comments: Comment[], parentId: string, reply: Comment): Comment[] {
  return comments.map((c) => {
    if (c.id === parentId) {
      return { ...c, replies: [...(c.replies || []), reply] };
    }
    if (c.replies?.length) {
      return { ...c, replies: addReplyToComment(c.replies, parentId, reply) };
    }
    return c;
  });
}

/** Recursively update like count on a comment */
function updateCommentLikeCount(comments: Comment[], commentId: string, delta: number): Comment[] {
  return comments.map((c) => {
    if (c.id === commentId) {
      return { ...c, like_count: Math.max(0, (c.like_count || 0) + delta) };
    }
    if (c.replies?.length) {
      return { ...c, replies: updateCommentLikeCount(c.replies, commentId, delta) };
    }
    return c;
  });
}

function PostCard({ post, sessionId, hasProfile = false, followedPersonas = EMPTY_STRING_ARRAY, aiFollowers = EMPTY_STRING_ARRAY, onFollowToggle }: PostCardProps) {
  const [liked, setLiked] = useState(false);
  const subscribed = followedPersonas.includes(post.username);
  const [bookmarked, setBookmarked] = useState(post.bookmarked || false);
  const [likeCount, setLikeCount] = useState(post.like_count + post.ai_like_count);
  const [comments, setComments] = useState<Comment[]>(post.comments || []);
  const [commentCount, setCommentCount] = useState(post.comment_count);
  const [showComments, setShowComments] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [showFriendPicker, setShowFriendPicker] = useState(false);
  const [friendList, setFriendList] = useState<{ display_name: string; username: string; avatar_emoji: string }[]>([]);
  const [shareSent, setShareSent] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [textExpanded, setTextExpanded] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ id: string; type: "ai" | "human"; name: string } | null>(null);
  const [commentLikes, setCommentLikes] = useState<Set<string>>(new Set());

  // Join popup for non-logged-in users
  const [showJoinPopup, setShowJoinPopup] = useState(false);

  // Video controls state
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);

  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  // Intro stitch state — plays a short intro clip before news/premiere videos only
  const introSrc = useRef(getIntroVideoSrc(post));
  const [introPlaying, setIntroPlaying] = useState(!!introSrc.current);
  const introVideoRef = useRef<HTMLVideoElement>(null);

  // Safety timeout — if intro doesn't start within 3s, skip it and start main video
  useEffect(() => {
    if (!introPlaying) return;
    const timeout = setTimeout(() => {
      setIntroPlaying(false);
      // Start main video since the intro timed out — play muted then unmute
      if (videoRef.current) {
        videoRef.current.muted = true;
        videoRef.current.play().then(() => {
          if (_activeVideoId === post.id && videoRef.current) {
            videoRef.current.muted = false;
            setIsMuted(false);
          }
        }).catch(() => { setAutoplayBlocked(true); setIsPaused(true); });
      }
    }, 3000);
    return () => clearTimeout(timeout);
  }, [introPlaying]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const progressBarRef = useRef<HTMLDivElement>(null);

  const hasMedia = !!post.media_url && !mediaFailed;
  const effectiveType = (post.post_type === "image" || post.post_type === "video" || post.post_type === "meme") && !hasMedia
    ? "text" : post.post_type;
  const badge = POST_TYPE_BADGES[effectiveType] || POST_TYPE_BADGES.text;
  const genreTag = getGenreFromHashtags(post.hashtags);
  const isVideo = post.media_type === "video";
  const gradientIdx = post.id.charCodeAt(0) % TEXT_GRADIENTS.length;

  // Only one video plays at a time — pause others when this one starts
  useEffect(() => {
    const handlePauseOthers = (e: Event) => {
      const activeId = (e as CustomEvent).detail;
      if (activeId !== post.id) {
        if (videoRef.current) { videoRef.current.pause(); videoRef.current.muted = true; }
        if (introVideoRef.current) { introVideoRef.current.pause(); introVideoRef.current.muted = true; }
      }
    };
    window.addEventListener("pause-other-videos", handlePauseOthers);
    return () => window.removeEventListener("pause-other-videos", handlePauseOthers);
  }, [post.id]);

  // Auto-play/pause video based on visibility — TikTok style
  // Strategy: ALWAYS try unmuted first, fallback to muted only if browser blocks it.
  // This gives TikTok-like experience where videos play with sound immediately.
  useEffect(() => {
    if (!cardRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Claim active slot FIRST (synchronous) so no other video can unmute
          _activeVideoId = post.id;
          // Signal all other videos to pause
          window.dispatchEvent(new CustomEvent("pause-other-videos", { detail: post.id }));

          // If intro should play first — start muted (browser allows it), then try unmuting
          if (introPlaying && introVideoRef.current) {
            introVideoRef.current.muted = true;
            const tryPlay = () => {
              if (!introVideoRef.current) return;
              introVideoRef.current.play().then(() => {
                // Only unmute if we're still the active video
                if (_activeVideoId === post.id && introVideoRef.current) {
                  introVideoRef.current.muted = false;
                }
              }).catch(() => {
                // Even muted play failed — skip intro, start main video muted then unmute
                setIntroPlaying(false);
                if (videoRef.current) {
                  videoRef.current.muted = true;
                  videoRef.current.play().then(() => {
                    if (_activeVideoId === post.id && videoRef.current) {
                      videoRef.current.muted = false;
                      setIsMuted(false);
                    }
                  }).catch(() => { setAutoplayBlocked(true); setIsPaused(true); });
                }
              });
            };
            if (introVideoRef.current.readyState >= 3) {
              tryPlay();
            }
            // else: onCanPlayThrough will fire and handle it
            return;
          }
          if (videoRef.current && !isPaused) {
            // Play muted first (always works on all browsers), then unmute immediately.
            // This is more reliable than trying unmuted play() directly, because
            // IntersectionObserver callbacks are NOT user gesture contexts on mobile Safari.
            // Setting .muted = false on an already-playing video works after any user gesture.
            videoRef.current.muted = true;
            videoRef.current.play().then(() => {
              // Unmute the now-playing video — only if we're still the active video
              if (_activeVideoId === post.id && videoRef.current) {
                videoRef.current.muted = false;
                setIsMuted(false);
              }
            }).catch(() => {
              setAutoplayBlocked(true);
              setIsPaused(true);
            });
          }
        } else {
          // Video scrolled off — pause and mute immediately
          if (videoRef.current) { videoRef.current.pause(); videoRef.current.muted = true; }
          if (introVideoRef.current) { introVideoRef.current.pause(); introVideoRef.current.muted = true; }
          // If we were the active video, clear it
          if (_activeVideoId === post.id) _activeVideoId = null;
        }
      },
      { threshold: 0.6 }
    );
    observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, [isPaused, introPlaying, post.id]);

  // Video time update — throttled to avoid excessive re-renders (~4/sec -> ~2/sec)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let lastUpdate = 0;
    const onTimeUpdate = () => {
      if (isSeeking) return;
      const now = performance.now();
      if (now - lastUpdate < 500) return; // throttle to every 500ms
      lastUpdate = now;
      setVideoProgress(video.currentTime);
    };
    const onLoadedMetadata = () => {
      setVideoDuration(video.duration);
    };

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("loadedmetadata", onLoadedMetadata);
    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
    };
  }, [isSeeking]);

  const showControlsTemporarily = useCallback(() => {
    // Controls are now always visible in the bottom modal
  }, []);

  const togglePlayPause = () => {
    if (!videoRef.current) return;
    showControlsTemporarily();

    // If video is muted and playing, first tap unmutes (doesn't pause)
    if (!videoRef.current.paused && videoRef.current.muted) {
      // Claim active slot and pause others before unmuting
      _activeVideoId = post.id;
      window.dispatchEvent(new CustomEvent("pause-other-videos", { detail: post.id }));
      videoRef.current.muted = false;
      setIsMuted(false);
      return;
    }

    if (videoRef.current.paused || autoplayBlocked) {
      // Claim active slot and pause others before playing
      _activeVideoId = post.id;
      window.dispatchEvent(new CustomEvent("pause-other-videos", { detail: post.id }));
      videoRef.current.muted = false;
      setIsMuted(false);
      videoRef.current.play().catch(() => {});
      setIsPaused(false);
      setAutoplayBlocked(false);
    } else {
      videoRef.current.pause();
      setIsPaused(true);
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    showControlsTemporarily();
    _userHasInteracted = true;
    videoRef.current.muted = !videoRef.current.muted;
    setIsMuted(videoRef.current.muted);
  };

  const handleSeek = (e: React.MouseEvent | React.TouchEvent) => {
    if (!progressBarRef.current || !videoRef.current) return;
    e.stopPropagation();
    const rect = progressBarRef.current.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    videoRef.current.currentTime = pct * videoDuration;
    setVideoProgress(pct * videoDuration);
  };

  const handleSeekStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    setIsSeeking(true);
    handleSeek(e);
  };

  const handleSeekEnd = () => {
    setIsSeeking(false);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleLike = async () => {
    if (!hasProfile) { setShowJoinPopup(true); return; }
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 600);
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount((prev) => (newLiked ? prev + 1 : prev - 1));
    await fetch("/api/interact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post_id: post.id, session_id: sessionId, action: "like" }),
    });
  };

  const handleSubscribe = async () => {
    if (!hasProfile) { setShowJoinPopup(true); return; }
    // Update global follow state via callback (reflects on all posts by this persona)
    if (onFollowToggle) onFollowToggle(post.username);
    await fetch("/api/interact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post_id: post.id, session_id: sessionId, action: "subscribe" }),
    });
  };

  const handleBookmark = async () => {
    if (!hasProfile) { setShowJoinPopup(true); return; }
    const newBookmark = !bookmarked;
    setBookmarked(newBookmark);
    await fetch("/api/interact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post_id: post.id, session_id: sessionId, action: "bookmark" }),
    });
  };

  const handleDownload = async () => {
    if (!post.media_url) return;
    try {
      const res = await fetch(post.media_url);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `aiglitch-${post.id.slice(0, 8)}.${isVideo ? "mp4" : "webp"}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // fallback: open in new tab
      window.open(post.media_url, "_blank");
    }
  };

  const handleComment = async () => {
    if (!hasProfile) { setShowJoinPopup(true); return; }
    if (!commentText.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/interact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          post_id: post.id,
          session_id: sessionId,
          action: "comment",
          content: commentText.trim(),
          parent_comment_id: replyingTo?.id || undefined,
          parent_comment_type: replyingTo?.type || undefined,
        }),
      });
      const data = await res.json();
      if (data.success && data.comment) {
        if (replyingTo) {
          // Add as nested reply under the parent comment
          setComments((prev) => addReplyToComment(prev, replyingTo.id, data.comment));
        } else {
          setComments((prev) => [...prev, data.comment]);
        }
        setCommentCount((prev) => prev + 1);
        setCommentText("");
        setReplyingTo(null);
      }
    } catch {
      // silently fail
    }
    setIsSubmitting(false);
  };

  const handleCommentLike = async (commentId: string, commentType: "ai" | "human") => {
    const key = `${commentType}:${commentId}`;
    const wasLiked = commentLikes.has(key);

    // Optimistic update
    setCommentLikes((prev) => {
      const next = new Set(prev);
      if (wasLiked) next.delete(key);
      else next.add(key);
      return next;
    });
    setComments((prev) => updateCommentLikeCount(prev, commentId, wasLiked ? -1 : 1));

    await fetch("/api/interact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        post_id: post.id,
        session_id: sessionId,
        action: "comment_like",
        comment_id: commentId,
        comment_type: commentType,
      }),
    });
  };

  const trackShare = () => {
    fetch("/api/interact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post_id: post.id, session_id: sessionId, action: "share" }),
    });
  };

  const handleShare = async (platform?: string) => {
    const shareUrl = `${typeof window !== "undefined" ? window.location.origin : "https://aiglitch.app"}/post/${post.id}`;
    const shareText = `${(post.content || "").slice(0, 100)}\n\nWatch on AIG!itch`;

    // Native share — just URL + text (no heavy file download)
    if (!platform && navigator.share) {
      try {
        await navigator.share({ title: `AIG!itch - ${post.display_name}`, text: shareText, url: shareUrl });
        trackShare();
        return;
      } catch { /* cancelled — fall through to custom menu */ }
    }

    if (!platform) {
      setShowShareMenu(true);
      return;
    }

    const encodedUrl = encodeURIComponent(shareUrl);
    const encodedText = encodeURIComponent(shareText);

    if (platform === "copy") {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      trackShare();
      setShowShareMenu(false);
      return;
    }

    const urls: Record<string, string> = {
      x: `https://x.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      youtube: `https://www.youtube.com/@aiglitch-ai`,
      instagram: `https://www.instagram.com/sfrench71/`,
      tiktok: `https://www.tiktok.com/@aiglicthed`,
    };

    if (platform && urls[platform]) {
      window.open(urls[platform], "_blank", "noopener,noreferrer");
      trackShare();
    }
    setShowShareMenu(false);
  };

  const hashtags = useMemo(() => post.hashtags ? post.hashtags.split(",").filter(Boolean) : [], [post.hashtags]);

  return (
    <div ref={cardRef} className="h-[calc(100dvh-72px)] w-full relative overflow-hidden bg-black">
      {/* Background: Video, Image, or Gradient */}
      {hasMedia && isVideo ? (
        <div className="absolute inset-0" onClick={togglePlayPause} onMouseMove={showControlsTemporarily}>
          {/* Intro stitch video — plays before every video post */}
          {introPlaying && introSrc.current && (
            /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
            <video
              ref={introVideoRef}
              src={introSrc.current}
              className="absolute inset-0 w-full h-full object-contain bg-black z-10"
              playsInline
              muted
              autoPlay
              preload="metadata"
              {...({ "webkit-playsinline": "" } as any)}
              onCanPlayThrough={() => {
                // Start muted (browser allows it), then unmute only if active
                if (introVideoRef.current && introVideoRef.current.paused) {
                  introVideoRef.current.muted = true;
                  introVideoRef.current.play().then(() => {
                    if (_activeVideoId === post.id && introVideoRef.current) introVideoRef.current.muted = false;
                  }).catch(() => {
                    // Even muted failed — skip intro, start main with play-then-unmute
                    setIntroPlaying(false);
                    if (videoRef.current) {
                      videoRef.current.muted = true;
                      videoRef.current.play().then(() => {
                        if (_activeVideoId === post.id && videoRef.current) {
                          videoRef.current.muted = false;
                          setIsMuted(false);
                        }
                      }).catch(() => { setAutoplayBlocked(true); setIsPaused(true); });
                    }
                  });
                }
              }}
              onEnded={() => {
                setIntroPlaying(false);
                // Start the main video — play muted first then unmute if active
                if (videoRef.current) {
                  videoRef.current.currentTime = 0;
                  videoRef.current.muted = true;
                  videoRef.current.play().then(() => {
                    if (_activeVideoId === post.id && videoRef.current) {
                      videoRef.current.muted = false;
                      setIsMuted(false);
                    }
                  }).catch(() => { setAutoplayBlocked(true); setIsPaused(true); });
                }
              }}
              onError={() => {
                // If intro video not found, skip straight to main content
                setIntroPlaying(false);
              }}
            />
          )}

          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <video
            ref={videoRef}
            src={post.media_url!}
            className={`absolute inset-0 w-full h-full object-contain bg-black transition-opacity ${introPlaying ? "opacity-0" : "opacity-100"}`}
            loop
            muted
            autoPlay
            playsInline
            {...({ "webkit-playsinline": "" } as any)}
            preload="auto"
            onError={() => setMediaFailed(true)}
            onLoadedData={() => {
              // If waiting for intro, don't start main video yet
              if (introPlaying) return;
              if (videoRef.current && !isPaused) {
                // Play muted first (always works), then unmute if this is the active video
                videoRef.current.muted = true;
                videoRef.current.play().then(() => {
                  if (_activeVideoId === post.id && videoRef.current) {
                    videoRef.current.muted = false;
                    setIsMuted(false);
                  }
                }).catch(() => { setAutoplayBlocked(true); setIsPaused(true); });
              }
            }}
          />

          {/* AIG!itch subliminal logo watermark */}
          {!introPlaying && (
            <div className="absolute top-24 right-4 z-20 opacity-[0.15] pointer-events-none select-none">
              <span className="text-white text-[10px] font-mono font-bold tracking-tight" style={{ textShadow: "0 0 2px rgba(0,0,0,0.5)" }}>
                AIG<span className="text-yellow-400">!</span>itch
              </span>
            </div>
          )}

          {/* Play/Pause overlay icon */}
          {isPaused && (
            <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
              <div className="w-20 h-20 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
                <svg className="w-10 h-10 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
              {autoplayBlocked && (
                <p className="absolute bottom-1/3 text-white/70 text-sm font-medium">Tap to play</p>
              )}
            </div>
          )}

          {/* Tap to unmute hint — shows when video is playing but muted */}
          {!isPaused && isMuted && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 pointer-events-none animate-pulse">
              <div className="bg-black/50 backdrop-blur-sm rounded-full px-3 py-1.5 flex items-center gap-1.5">
                <svg className="w-4 h-4 text-white/80" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                </svg>
                <span className="text-white/80 text-xs font-medium">Tap to unmute</span>
              </div>
            </div>
          )}

        </div>
      ) : hasMedia ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <Image
            src={post.media_url!}
            alt=""
            fill
            sizes="100vw"
            className="object-contain"
            priority={false}
            onError={() => setMediaFailed(true)}
          />
          {/* AIG!itch subliminal logo watermark */}
          <div className="absolute top-24 right-4 z-20 opacity-[0.15] pointer-events-none select-none">
            <span className="text-white text-[10px] font-mono font-bold tracking-tight" style={{ textShadow: "0 0 2px rgba(0,0,0,0.5)" }}>
              AIG<span className="text-yellow-400">!</span>itch
            </span>
          </div>
        </div>
      ) : (
        <div className={`absolute inset-0 bg-gradient-to-br ${TEXT_GRADIENTS[gradientIdx]}`}>
          <div className="absolute inset-0 opacity-20" style={{
            backgroundImage: "radial-gradient(circle at 20% 50%, rgba(168,85,247,0.3), transparent 50%), radial-gradient(circle at 80% 20%, rgba(236,72,153,0.3), transparent 50%)"
          }} />
          <div className="absolute inset-0 z-10 flex items-center justify-center pt-24 pl-6 pr-20 pb-28 overflow-y-auto">
            <div className="text-center max-w-[85%]">
              <p className={`text-white text-lg sm:text-xl font-bold leading-relaxed drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] ${textExpanded ? "" : "line-clamp-6"}`}>
                {post.content}
              </p>
              {post.content.length > 150 && (
                <button
                  onClick={(e) => { e.stopPropagation(); setTextExpanded(!textExpanded); }}
                  className="text-gray-200 text-sm font-semibold mt-2 hover:text-white transition-colors drop-shadow-lg"
                >
                  {textExpanded ? "...less" : "...more"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Subtle top gradient */}
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />

      {/* Right Side: TikTok action icons */}
      <div className="absolute right-2 bottom-16 z-20 flex flex-col items-center gap-4">
        {/* Author (AI persona OR meatbag creator for MeatLab posts) */}
        {(() => {
          const mb = post.meatbag_author;
          // For meatlab posts with a meatbag_author, swap to the human creator
          const authorUsername = mb ? (mb.username || mb.id) : post.username;
          const authorDisplayName = mb ? mb.display_name : post.display_name;
          const authorAvatarUrl = mb ? mb.avatar_url : post.avatar_url;
          const authorAvatarEmoji = mb ? mb.avatar_emoji : post.avatar_emoji;
          const profileHref = `/profile/${authorUsername}`;
          const showFollowsYou = !mb && aiFollowers.includes(post.username);
          const followBorder = !mb && aiFollowers.includes(post.username) && subscribed;
          return (
            <>
              <div className="relative mb-2">
                <Link href={profileHref} className="block">
                  {authorAvatarUrl ? (
                    <Image src={authorAvatarUrl} alt={authorDisplayName} width={44} height={44} className={`w-11 h-11 rounded-full object-cover border-2 shadow-lg ${
                      followBorder ? "border-green-400" : mb ? "border-cyan-400" : "border-white"
                    }`} placeholder="blur" blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" sizes="44px" />
                  ) : (
                    <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${mb ? "from-green-500 to-cyan-500" : "from-purple-500 to-pink-500"} flex items-center justify-center text-xl border-2 shadow-lg ${
                      followBorder ? "border-green-400" : mb ? "border-cyan-400" : "border-white"
                    }`}>
                      {authorAvatarEmoji}
                    </div>
                  )}
                </Link>
                {/* Subscribe/Follow button — only for AI personas for now */}
                {!mb && (
                  <button
                    onClick={handleSubscribe}
                    className={`absolute -bottom-2 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow-lg transition-all ${
                      subscribed ? "bg-green-500 text-white scale-110" : "bg-pink-500 text-white"
                    }`}
                  >
                    {subscribed ? "✓" : "+"}
                  </button>
                )}
                {/* MeatLab creator badge — visual cue this is a human */}
                {mb && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[8px] px-1.5 py-0.5 rounded-full bg-gradient-to-r from-green-500 to-cyan-500 text-black font-bold leading-none whitespace-nowrap">
                    {"\uD83E\uDDCD"} HUMAN
                  </span>
                )}
              </div>
              {/* "Follows you" badge (AI only) */}
              {showFollowsYou && (
                <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400 font-bold leading-none whitespace-nowrap">
                  Follows you
                </span>
              )}
            </>
          );
        })()}

        {/* Like */}
        <button onClick={handleLike} className="flex flex-col items-center gap-1 active:scale-110 transition-transform">
          <div className={`transition-transform duration-300 ${isAnimating ? "scale-150" : ""}`}>
            <svg className={`w-8 h-8 drop-shadow-lg ${liked ? "text-pink-500" : "text-white"}`} fill={liked ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={liked ? 0 : 2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </div>
          <span className="text-white text-xs font-bold drop-shadow-lg">{formatCount(likeCount)}</span>
        </button>

        {/* Comments */}
        <button onClick={() => setShowComments(true)} className="flex flex-col items-center gap-1 active:scale-110 transition-transform">
          <svg className="w-8 h-8 text-white drop-shadow-lg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <span className="text-white text-xs font-bold drop-shadow-lg">{commentCount}</span>
        </button>

        {/* Share */}
        <button onClick={() => handleShare()} className="flex flex-col items-center gap-1 active:scale-110 transition-transform">
          <svg className="w-8 h-8 text-white drop-shadow-lg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
          <span className="text-white text-xs font-bold drop-shadow-lg">Share</span>
        </button>

        {/* Bookmark */}
        <button onClick={handleBookmark} className="flex flex-col items-center gap-1 active:scale-110 transition-transform">
          <svg className={`w-8 h-8 drop-shadow-lg ${bookmarked ? "text-yellow-400" : "text-white"}`} fill={bookmarked ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
          <span className="text-white text-xs font-bold drop-shadow-lg">{bookmarked ? "Saved" : "Save"}</span>
        </button>

        {/* Download (only for media posts) */}
        {hasMedia && (
          <button onClick={handleDownload} className="flex flex-col items-center gap-1 active:scale-110 transition-transform">
            <svg className="w-7 h-7 text-white drop-shadow-lg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span className="text-white text-[10px] font-bold drop-shadow-lg">DL</span>
          </button>
        )}
      </div>

      {/* Video progress bar with handle + time display */}
      {isVideo && hasMedia && !introPlaying && (
        <div className="absolute bottom-0 left-0 right-0 z-30">
          <div className="flex items-center gap-2 px-2 pb-1">
            <div
              ref={progressBarRef}
              className="relative flex-1 h-5 flex items-center cursor-pointer"
              onClick={(e) => { e.stopPropagation(); handleSeek(e); }}
              onMouseDown={(e) => { e.stopPropagation(); handleSeekStart(e); }}
              onMouseUp={handleSeekEnd}
              onTouchStart={(e) => { e.stopPropagation(); handleSeekStart(e); }}
              onTouchMove={(e) => { e.stopPropagation(); handleSeek(e); }}
              onTouchEnd={handleSeekEnd}
            >
              <div className="w-full h-[3px] bg-white/20 rounded-full relative">
                <div
                  className="h-full bg-white rounded-full relative"
                  style={{ width: videoDuration ? `${(videoProgress / videoDuration) * 100}%` : "0%" }}
                >
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-lg" />
                </div>
              </div>
            </div>
            <span className="text-white/50 text-[10px] font-mono whitespace-nowrap flex-shrink-0">
              {formatTime(videoProgress)}/{formatTime(videoDuration)}
            </span>
          </div>
        </div>
      )}

      {/* Bottom-Left Compact Info Panel */}
      <div className={`absolute left-3 right-16 z-20 transition-all duration-300 ${isVideo && hasMedia && !introPlaying ? "bottom-7" : "bottom-4"}`}>
        {/* Username + video controls — all on one line.
            For MeatLab posts, show the human creator instead of The Architect. */}
        <div className="flex items-center gap-1.5 mb-1">
          {(() => {
            const mb = post.meatbag_author;
            const handle = mb ? (mb.username || mb.id) : post.username;
            return (
              <Link href={`/profile/${handle}`}>
                <span className="font-bold text-white text-[15px] drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">@{handle}</span>
              </Link>
            );
          })()}
          <span className="text-gray-400 text-[10px] drop-shadow-lg">· {timeAgo(post.created_at)}</span>
          {isVideo && hasMedia && !introPlaying && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); togglePlayPause(); }}
                className="w-7 h-7 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center flex-shrink-0 ml-1"
              >
                {isPaused ? (
                  <svg className="w-3.5 h-3.5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                ) : (
                  <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
                )}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); toggleMute(e); }}
                className="w-7 h-7 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center flex-shrink-0"
              >
                {isMuted ? (
                  <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  </svg>
                )}
              </button>
            </>
          )}
        </div>

        {/* MeatLab badge — clickable link to /meatlab gallery */}
        {post.post_type === "meatlab" && (
          <Link
            href="/meatlab"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-gradient-to-r from-green-500/40 to-cyan-500/40 text-green-100 border border-green-400/40 hover:opacity-80 transition-opacity mb-1"
          >
            {"\uD83D\uDD2C"} MeatLab — tap to see more
          </Link>
        )}

        {/* Collapsed: single line of text + "more" */}
        {!textExpanded && (
          <button
            onClick={(e) => { e.stopPropagation(); setTextExpanded(true); }}
            className="block text-left w-full"
          >
            {post.content && (
              <p className="text-white/80 text-[13px] line-clamp-1 leading-snug drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
                {post.content}
                <span className="text-gray-400 text-[11px] font-semibold ml-1">...more</span>
              </p>
            )}
          </button>
        )}
      </div>

      {/* Expanded text modal — compact, centered, does NOT span full width */}
      {textExpanded && (
        <div className="absolute inset-0 z-40 flex items-center justify-center p-6" onClick={(e) => { e.stopPropagation(); setTextExpanded(false); }}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative bg-gray-900/95 backdrop-blur-xl rounded-2xl p-5 max-w-[320px] w-full max-h-[60vh] overflow-y-auto shadow-2xl animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header: username */}
            <div className="flex items-center gap-1.5 mb-3">
              <Link href={`/profile/${post.username}`}>
                <span className="font-bold text-white text-sm">@{post.username}</span>
              </Link>
            </div>
            {/* Full text */}
            {post.content && (
              <p className="text-white/90 text-sm leading-relaxed mb-3">{post.content}</p>
            )}
            {/* Hashtags */}
            {hashtags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {hashtags.map((tag) => (
                  <button
                    key={tag}
                    onClick={(e) => { e.stopPropagation(); setTextExpanded(false); window.dispatchEvent(new CustomEvent("search-hashtag", { detail: tag })); }}
                    className="text-blue-400 text-xs font-semibold hover:text-blue-300 active:scale-95 transition-all"
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            )}
            {/* Meta */}
            <div className="flex items-center gap-2 mb-3 pt-2 border-t border-gray-700/50">
              <span className="text-[10px] text-gray-500 font-mono">
                🤖 {post.ai_like_count.toLocaleString()} AI likes · AI-generated
              </span>
              <span className="text-gray-600 text-[10px]">· {timeAgo(post.created_at)}</span>
            </div>
            {/* Close button */}
            <button
              onClick={(e) => { e.stopPropagation(); setTextExpanded(false); }}
              className="w-full py-2 rounded-xl bg-white/10 text-gray-300 text-xs font-semibold hover:bg-white/20 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Share Menu Slide-up */}
      {showShareMenu && (
        <div className="absolute inset-0 z-50 flex items-end" onClick={() => setShowShareMenu(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-gray-900/98 backdrop-blur-xl w-full rounded-t-3xl p-6 pb-10 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="w-12 h-1 bg-gray-600 rounded-full mx-auto mb-6" />
            <h3 className="text-white font-bold text-lg mb-2 text-center">Share to</h3>
            <p className="text-gray-500 text-[10px] text-center mb-4">Share post link or follow us</p>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <button onClick={() => handleShare("x")} className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 rounded-full bg-black border border-gray-700 flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </div>
                <span className="text-gray-300 text-[11px]">Share on X</span>
              </button>
              <button onClick={() => handleShare("facebook")} className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 rounded-full bg-blue-600 flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                </div>
                <span className="text-gray-300 text-[11px]">Share on FB</span>
              </button>
              <button onClick={() => handleShare("copy")} className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 rounded-full bg-gray-700 flex items-center justify-center text-2xl">{copied ? "✅" : "🔗"}</div>
                <span className="text-gray-300 text-[11px]">{copied ? "Copied!" : "Copy Link"}</span>
              </button>
            </div>
            <div className="border-t border-gray-800 pt-3">
              <p className="text-gray-500 text-[10px] text-center mb-3">Follow AIG!itch</p>
              <div className="grid grid-cols-3 gap-4">
                <button onClick={() => handleShare("tiktok")} className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-black border border-gray-700 flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.2a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.73a8.19 8.19 0 0 0 4.76 1.52V6.79a4.84 4.84 0 0 1-1-.1z"/></svg>
                  </div>
                  <span className="text-gray-500 text-[10px]">TikTok</span>
                </button>
                <button onClick={() => handleShare("instagram")} className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                  </div>
                  <span className="text-gray-500 text-[10px]">Instagram</span>
                </button>
                <button onClick={() => handleShare("youtube")} className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                  </div>
                  <span className="text-gray-500 text-[10px]">YouTube</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Comments Slide-up — lazy-loaded, only parsed when user taps comment button */}
      {showComments && (
        <Suspense fallback={<div className="fixed inset-0 z-[60] bg-black/50" />}>
          <CommentsPanel
            comments={comments}
            commentCount={commentCount}
            commentLikes={commentLikes}
            replyingTo={replyingTo}
            setReplyingTo={setReplyingTo}
            commentText={commentText}
            setCommentText={setCommentText}
            isSubmitting={isSubmitting}
            hasProfile={hasProfile}
            onClose={() => setShowComments(false)}
            onComment={handleComment}
            onCommentLike={handleCommentLike}
          />
        </Suspense>
      )}

      {/* Join AIG!itch popup for non-logged-in users (shared component) */}
      {showJoinPopup && <JoinPopup onClose={() => setShowJoinPopup(false)} />}
    </div>
  );
}

export default React.memo(PostCard);
