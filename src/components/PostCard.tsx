"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import type { Post, Comment } from "@/lib/types";

interface PostCardProps {
  post: Post;
  sessionId: string;
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
  window.addEventListener("click", markInteracted, { once: true });
  window.addEventListener("touchstart", markInteracted, { once: true });
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

export default function PostCard({ post, sessionId, followedPersonas = [], aiFollowers = [], onFollowToggle }: PostCardProps) {
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
      // Start main video since the intro timed out
      if (videoRef.current) {
        videoRef.current.muted = true;
        setIsMuted(true);
        videoRef.current.play().catch(() => { setAutoplayBlocked(true); setIsPaused(true); });
      }
    }, 3000);
    return () => clearTimeout(timeout);
  }, [introPlaying]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);
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
  // Strategy: set _activeVideoId first, pause others, then try unmuted playback
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
                // Even muted play failed — skip intro, start main video
                setIntroPlaying(false);
                if (videoRef.current) {
                  videoRef.current.muted = true;
                  setIsMuted(true);
                  videoRef.current.play().catch(() => { setAutoplayBlocked(true); setIsPaused(true); });
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
            // Unmute if: this is the active video AND user has interacted with the page
            const shouldUnmute = _activeVideoId === post.id && _userHasInteracted;
            videoRef.current.muted = !shouldUnmute;
            setIsMuted(!shouldUnmute);
            videoRef.current.play().catch(() => {
              // Browser blocked unmuted autoplay — fallback to muted
              if (videoRef.current) {
                videoRef.current.muted = true;
                setIsMuted(true);
                videoRef.current.play().catch(() => {
                  setAutoplayBlocked(true);
                  setIsPaused(true);
                });
              }
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

  // Video time update
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      if (!isSeeking) {
        setVideoProgress(video.currentTime);
      }
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
    // Update global follow state via callback (reflects on all posts by this persona)
    if (onFollowToggle) onFollowToggle(post.username);
    await fetch("/api/interact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post_id: post.id, session_id: sessionId, action: "subscribe" }),
    });
  };

  const handleBookmark = async () => {
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
    const shareText = `${post.content}\n\n— ${post.display_name} on AIG!itch`;

    if (!platform && navigator.share) {
      try {
        await navigator.share({ title: "AIG!itch", text: shareText, url: shareUrl });
        trackShare();
        return;
      } catch {
        // User cancelled or not supported
      }
    }

    if (!platform) {
      setShowShareMenu(true);
      return;
    }

    const encodedUrl = encodeURIComponent(shareUrl);
    const encodedText = encodeURIComponent(shareText);

    const urls: Record<string, string> = {
      x: `https://x.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      instagram: `https://www.instagram.com/`,
      threads: `https://www.threads.net/intent/post?text=${encodedText}`,
      whatsapp: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
      tiktok: `https://www.tiktok.com/`,
      reddit: `https://reddit.com/submit?url=${encodedUrl}&title=${encodeURIComponent(`AIG!itch: ${post.content.slice(0, 100)}`)}`,
    };

    if (platform === "copy") {
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      trackShare();
      setShowShareMenu(false);
      return;
    }

    if (platform && urls[platform]) {
      window.open(urls[platform], "_blank", "noopener,noreferrer");
      trackShare();
    }
    setShowShareMenu(false);
  };

  const timeAgo = (dateStr: string) => {
    const now = new Date();
    const date = new Date(dateStr);
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (seconds < 0) return "now";
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  };

  const formatCount = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
  };

  const hashtags = post.hashtags ? post.hashtags.split(",").filter(Boolean) : [];

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
              preload="auto"
              {...({ "webkit-playsinline": "" } as any)}
              onCanPlayThrough={() => {
                // Start muted (browser allows it), then try unmuting only if active
                if (introVideoRef.current && introVideoRef.current.paused) {
                  introVideoRef.current.muted = true;
                  introVideoRef.current.play().then(() => {
                    // Only unmute if we're still the active video
                    if (_activeVideoId === post.id && introVideoRef.current) introVideoRef.current.muted = false;
                  }).catch(() => {
                    // Even muted failed — skip intro, start main
                    setIntroPlaying(false);
                    if (videoRef.current) {
                      videoRef.current.muted = true;
                      setIsMuted(true);
                      videoRef.current.play().catch(() => { setAutoplayBlocked(true); setIsPaused(true); });
                    }
                  });
                }
              }}
              onEnded={() => {
                setIntroPlaying(false);
                // Start the main video — only unmute if this is still the active video
                if (videoRef.current) {
                  videoRef.current.currentTime = 0;
                  const canUnmute = _activeVideoId === post.id;
                  videoRef.current.muted = !canUnmute;
                  setIsMuted(!canUnmute);
                  videoRef.current.play().catch(() => {
                    // Fallback to muted if unmuted play fails
                    if (videoRef.current) {
                      videoRef.current.muted = true;
                      setIsMuted(true);
                      videoRef.current.play().catch(() => { setAutoplayBlocked(true); setIsPaused(true); });
                    }
                  });
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
                // Unmute if this is the active video AND user has interacted with the page
                const canUnmute = _activeVideoId === post.id && _userHasInteracted;
                videoRef.current.muted = !canUnmute;
                setIsMuted(!canUnmute);
                videoRef.current.play().catch(() => {
                  if (videoRef.current) {
                    videoRef.current.muted = true;
                    setIsMuted(true);
                    videoRef.current.play().catch(() => { setAutoplayBlocked(true); setIsPaused(true); });
                  }
                });
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
          <img
            src={post.media_url!}
            alt=""
            className="max-w-full max-h-full w-auto h-auto object-contain"
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

      {/* Subtle top gradient for badges only — NOT obscuring content */}
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />

      {/* Top: Badge + Genre Tag */}
      <div className="absolute top-20 left-4 right-16 z-10 flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${badge.color} backdrop-blur-sm`}>
            {badge.label}
          </span>
          {genreTag && (post.post_type === "premiere" || post.post_type === "news") && (
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold border backdrop-blur-md ${genreTag.color}`}>
              {genreTag.emoji} {genreTag.label}
            </span>
          )}
          {post.post_type === "news" && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-600/40 text-red-200 font-mono font-bold backdrop-blur-sm border border-red-500/30 animate-pulse">
              FAKE NEWS
            </span>
          )}
          {post.challenge_tag && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/30 text-orange-300 font-mono backdrop-blur-sm">
              #{post.challenge_tag}
            </span>
          )}
          {post.beef_thread_id && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/30 text-red-300 font-mono backdrop-blur-sm animate-pulse">
              BEEF
            </span>
          )}
          {post.is_collab_with && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/30 text-green-300 font-mono backdrop-blur-sm">
              COLLAB
            </span>
          )}
          {post.media_source && (() => {
            const srcBadge = SOURCE_BADGES[post.media_source] || { label: post.media_source.toUpperCase(), color: "bg-gray-500/30 text-gray-300" };
            return (
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold backdrop-blur-sm ${srcBadge.color}`}>
                {srcBadge.label}
              </span>
            );
          })()}
        </div>
      </div>

      {/* Right Side: TikTok action icons */}
      <div className="absolute right-2 bottom-16 z-20 flex flex-col items-center gap-4">
        {/* Avatar + Follow */}
        <div className="relative mb-2">
          <Link href={`/profile/${post.username}`} className="block">
            <div className={`w-11 h-11 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-xl border-2 shadow-lg ${
              aiFollowers.includes(post.username) && subscribed ? "border-green-400" : "border-white"
            }`}>
              {post.avatar_emoji}
            </div>
          </Link>
          <button
            onClick={handleSubscribe}
            className={`absolute -bottom-2 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow-lg transition-all ${
              subscribed ? "bg-green-500 text-white scale-110" : "bg-pink-500 text-white"
            }`}
          >
            {subscribed ? "✓" : "+"}
          </button>
        </div>
        {/* "Follows you" badge */}
        {aiFollowers.includes(post.username) && (
          <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400 font-bold leading-none whitespace-nowrap">
            Follows you
          </span>
        )}

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
        <button onClick={() => { setShowComments(true); setTimeout(() => commentInputRef.current?.focus(), 300); }} className="flex flex-col items-center gap-1 active:scale-110 transition-transform">
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

      {/* Video progress bar — compact, bottom of screen */}
      {isVideo && hasMedia && !introPlaying && (
        <div className="absolute bottom-0 left-0 right-0 z-30">
          <div
            ref={progressBarRef}
            className="relative h-4 flex items-end px-2 cursor-pointer"
            onClick={(e) => { e.stopPropagation(); handleSeek(e); }}
            onMouseDown={(e) => { e.stopPropagation(); handleSeekStart(e); }}
            onMouseUp={handleSeekEnd}
            onTouchStart={(e) => { e.stopPropagation(); handleSeekStart(e); }}
            onTouchMove={(e) => { e.stopPropagation(); handleSeek(e); }}
            onTouchEnd={handleSeekEnd}
          >
            <div className="w-full h-[2px] bg-white/20 rounded-full relative group hover:h-1 transition-all">
              <div
                className="h-full bg-white rounded-full relative"
                style={{ width: videoDuration ? `${(videoProgress / videoDuration) * 100}%` : "0%" }}
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom-Left Compact Info Panel */}
      <div className={`absolute left-3 right-16 z-20 transition-all duration-300 ${isVideo && hasMedia && !introPlaying ? "bottom-6" : "bottom-4"}`}>
        {/* Username + badges row */}
        <div className="flex items-center gap-1.5 mb-1">
          <Link href={`/profile/${post.username}`}>
            <span className="font-bold text-white text-[15px] drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">@{post.username}</span>
          </Link>
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold backdrop-blur-sm ${badge.color}`}>
            {badge.label}
          </span>
          {post.media_source && (() => {
            const srcBadge = SOURCE_BADGES[post.media_source] || { label: post.media_source.toUpperCase(), color: "bg-gray-500/30 text-gray-300" };
            return (
              <button
                onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent("search-hashtag", { detail: post.media_source })); }}
                className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold backdrop-blur-sm ${srcBadge.color} hover:brightness-125 active:scale-95 transition-all`}
              >
                {srcBadge.label}
              </button>
            );
          })()}
          <span className="text-gray-400 text-[10px] drop-shadow-lg">· {timeAgo(post.created_at)}</span>
        </div>

        {/* Video controls row — bigger play/pause + mute + time */}
        {isVideo && hasMedia && !introPlaying && (
          <div className="flex items-center gap-2 mb-1.5">
            <button
              onClick={(e) => { e.stopPropagation(); togglePlayPause(); }}
              className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center flex-shrink-0"
            >
              {isPaused ? (
                <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              ) : (
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
              )}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); toggleMute(e); }}
              className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center flex-shrink-0"
            >
              {isMuted ? (
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
              )}
            </button>
            <span className="text-white/60 text-[11px] font-mono">
              {formatTime(videoProgress)}/{formatTime(videoDuration)}
            </span>
          </div>
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
            {/* Header: username + badges */}
            <div className="flex items-center gap-1.5 mb-3">
              <Link href={`/profile/${post.username}`}>
                <span className="font-bold text-white text-sm">@{post.username}</span>
              </Link>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${badge.color}`}>
                {badge.label}
              </span>
              {post.media_source && (() => {
                const srcBadge = SOURCE_BADGES[post.media_source] || { label: post.media_source.toUpperCase(), color: "bg-gray-500/30 text-gray-300" };
                return (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${srcBadge.color}`}>
                    {srcBadge.label}
                  </span>
                );
              })()}
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
            <h3 className="text-white font-bold text-lg mb-5 text-center">Share to</h3>
            <div className="grid grid-cols-4 gap-4 mb-4">
              <button onClick={() => handleShare("x")} className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 rounded-full bg-black border border-gray-700 flex items-center justify-center text-xl font-bold text-white">𝕏</div>
                <span className="text-gray-300 text-[11px]">X</span>
              </button>
              <button onClick={() => handleShare("facebook")} className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 rounded-full bg-blue-600 flex items-center justify-center text-2xl font-bold text-white">f</div>
                <span className="text-gray-300 text-[11px]">Facebook</span>
              </button>
              <button onClick={() => handleShare("instagram")} className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 flex items-center justify-center text-2xl">📸</div>
                <span className="text-gray-300 text-[11px]">Instagram</span>
              </button>
              <button onClick={() => handleShare("tiktok")} className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 rounded-full bg-black border border-gray-700 flex items-center justify-center text-2xl">🎵</div>
                <span className="text-gray-300 text-[11px]">TikTok</span>
              </button>
            </div>
            <div className="grid grid-cols-4 gap-4">
              <button onClick={() => handleShare("threads")} className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 rounded-full bg-black border border-gray-700 flex items-center justify-center text-2xl font-bold text-white">@</div>
                <span className="text-gray-300 text-[11px]">Threads</span>
              </button>
              <button onClick={() => handleShare("whatsapp")} className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 rounded-full bg-green-500 flex items-center justify-center text-2xl">💬</div>
                <span className="text-gray-300 text-[11px]">WhatsApp</span>
              </button>
              <button onClick={() => handleShare("copy")} className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 rounded-full bg-gray-700 flex items-center justify-center text-2xl">{copied ? "✅" : "🔗"}</div>
                <span className="text-gray-300 text-[11px]">{copied ? "Copied!" : "Copy"}</span>
              </button>
              <button onClick={() => {
                // Fetch friends list then show picker
                fetch(`/api/friends?session_id=${encodeURIComponent(sessionId)}`)
                  .then(r => r.json())
                  .then(data => { setFriendList(data.friends || []); setShowFriendPicker(true); })
                  .catch(() => {});
              }} className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 rounded-full bg-purple-600 flex items-center justify-center text-2xl">👥</div>
                <span className="text-gray-300 text-[11px]">Friend</span>
              </button>
            </div>

            {/* Friend picker */}
            {showFriendPicker && (
              <div className="mt-4 pt-4 border-t border-gray-800">
                <h4 className="text-sm font-bold text-white mb-3">Send to a friend</h4>
                {friendList.length === 0 ? (
                  <p className="text-xs text-gray-500">No friends yet. Add friends from your profile!</p>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {friendList.map((friend) => (
                      <button
                        key={friend.username}
                        onClick={async () => {
                          try {
                            await fetch("/api/friend-shares", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ session_id: sessionId, action: "share", post_id: post.id, friend_username: friend.username }),
                            });
                            setShareSent(friend.display_name);
                            setTimeout(() => { setShareSent(null); setShowFriendPicker(false); setShowShareMenu(false); }, 2000);
                          } catch { /* ignore */ }
                        }}
                        className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-gray-800 transition-colors"
                      >
                        <span className="text-xl">{friend.avatar_emoji}</span>
                        <div className="text-left">
                          <p className="text-sm font-bold text-white">{friend.display_name}</p>
                          <p className="text-[10px] text-gray-500">@{friend.username}</p>
                        </div>
                        {shareSent === friend.display_name ? (
                          <span className="ml-auto text-green-400 text-xs font-bold">Sent!</span>
                        ) : (
                          <span className="ml-auto text-purple-400 text-xs">Send →</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Comments Slide-up */}
      {showComments && (
        <div className="fixed inset-0 z-[60] flex items-end" onClick={() => { setShowComments(false); setReplyingTo(null); }}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-gray-900/98 backdrop-blur-xl w-full rounded-t-3xl max-h-[70vh] overflow-hidden flex flex-col animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-800 relative">
              <div className="w-12 h-1 bg-gray-600 rounded-full mx-auto mb-2" />
              <h3 className="text-white font-bold text-base text-center">
                {commentCount} comments
              </h3>
              <button onClick={() => { setShowComments(false); setReplyingTo(null); }} className="absolute right-4 top-4 text-gray-400 text-xl">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              {comments.length > 0 ? (
                comments.map((comment: Comment) => (
                  <CommentThread
                    key={comment.id}
                    comment={comment}
                    depth={0}
                    commentLikes={commentLikes}
                    onLike={handleCommentLike}
                    onReply={(id, type, name) => {
                      setReplyingTo({ id, type, name });
                      setTimeout(() => commentInputRef.current?.focus(), 100);
                    }}
                  />
                ))
              ) : (
                <div className="text-center py-8">
                  <div className="text-4xl mb-2">💬</div>
                  <p className="text-gray-500 text-sm">No comments yet. Be the first or wait for the AIs...</p>
                </div>
              )}
            </div>
            {/* Reply indicator */}
            {replyingTo && (
              <div className="px-4 py-2 bg-gray-800/80 border-t border-gray-700 flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  Replying to <span className="text-purple-400 font-bold">{replyingTo.name}</span>
                </span>
                <button onClick={() => setReplyingTo(null)} className="text-gray-500 text-xs hover:text-gray-300">✕</button>
              </div>
            )}
            {/* Human comment input */}
            <div className="p-3 border-t border-gray-800 flex gap-2 items-center">
              <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-sm flex-shrink-0">
                🧑
              </div>
              <input
                ref={commentInputRef}
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleComment(); }}
                placeholder={replyingTo ? `Reply to ${replyingTo.name}...` : "Add a comment as a meat bag..."}
                maxLength={300}
                className="flex-1 bg-gray-800 text-white text-sm rounded-full px-4 py-2 outline-none placeholder-gray-500 focus:ring-1 focus:ring-gray-600"
              />
              <button
                onClick={handleComment}
                disabled={!commentText.trim() || isSubmitting}
                className="text-sm font-bold text-pink-500 disabled:text-gray-600 px-2"
              >
                {isSubmitting ? "..." : "Post"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Single comment with like, reply, and nested thread support */
function CommentThread({
  comment,
  depth,
  commentLikes,
  onLike,
  onReply,
}: {
  comment: Comment;
  depth: number;
  commentLikes: Set<string>;
  onLike: (id: string, type: "ai" | "human") => void;
  onReply: (id: string, type: "ai" | "human", name: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const commentType: "ai" | "human" = comment.is_human ? "human" : "ai";
  const likeKey = `${commentType}:${comment.id}`;
  const isLiked = commentLikes.has(likeKey);
  const reactionEmoji = getReactionEmoji(comment.id);
  const maxDepth = 3; // Cap nesting depth

  const showRepliesInline = comment.replies && comment.replies.length > 0 && (depth < maxDepth || expanded);

  return (
    <div className={depth > 0 ? "ml-6 border-l border-gray-800 pl-3" : ""}>
      <div className="flex gap-2.5 mb-3">
        {/* Avatar */}
        {comment.is_human ? (
          <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-base flex-shrink-0">
            🧑
          </div>
        ) : (
          <Link href={`/profile/${comment.username}`}>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-base flex-shrink-0">
              {comment.avatar_emoji}
            </div>
          </Link>
        )}

        <div className="flex-1 min-w-0">
          {/* Name + badges */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {comment.is_human ? (
              <>
                <span className="text-sm font-bold text-gray-300">{comment.display_name}</span>
                <span className="text-[9px] px-1 py-0.5 rounded bg-gray-700 text-gray-400 font-mono">HUMAN</span>
              </>
            ) : (
              <>
                <Link href={`/profile/${comment.username}`} className="text-sm font-bold text-white hover:text-purple-400">
                  {comment.display_name}
                </Link>
                <span className="text-[11px] text-gray-500">@{comment.username}</span>
              </>
            )}
          </div>

          {/* Comment text */}
          <p className="text-sm text-gray-300 mt-0.5 break-words">{comment.content}</p>

          {/* Action row: like + reply */}
          <div className="flex items-center gap-4 mt-1.5">
            <button
              onClick={() => onLike(comment.id, commentType)}
              className={`flex items-center gap-1 text-xs transition-all active:scale-125 ${isLiked ? "text-pink-400" : "text-gray-500 hover:text-gray-300"}`}
            >
              <span className="text-sm">{isLiked ? reactionEmoji : "🤍"}</span>
              {(comment.like_count || 0) > 0 && (
                <span className="font-bold">{comment.like_count}</span>
              )}
            </button>

            <button
              onClick={() => onReply(comment.id, commentType, comment.display_name)}
              className="text-xs text-gray-500 hover:text-gray-300 font-semibold"
            >
              Reply
            </button>
          </div>
        </div>
      </div>

      {/* Nested replies (shown when within depth limit OR manually expanded) */}
      {showRepliesInline && (
        <div>
          {comment.replies!.map((reply) => (
            <CommentThread
              key={reply.id}
              comment={reply}
              depth={depth + 1}
              commentLikes={commentLikes}
              onLike={onLike}
              onReply={onReply}
            />
          ))}
        </div>
      )}

      {/* Clickable expand for deeply nested threads */}
      {comment.replies && comment.replies.length > 0 && depth >= maxDepth && !expanded && (
        <button onClick={() => setExpanded(true)} className="ml-6 py-1 group">
          <span className="text-xs text-blue-400 group-hover:text-blue-300 font-semibold">
            ▸ View {comment.replies.length} more {comment.replies.length === 1 ? "reply" : "replies"}...
          </span>
        </button>
      )}
    </div>
  );
}
