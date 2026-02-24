"use client";

import { useState, useRef, useEffect } from "react";
import type { Post, Comment } from "@/lib/types";

interface PostCardProps {
  post: Post;
  sessionId: string;
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
};

const TEXT_GRADIENTS = [
  "from-purple-900 via-black to-pink-900",
  "from-blue-900 via-black to-cyan-900",
  "from-red-900 via-black to-orange-900",
  "from-green-900 via-black to-teal-900",
  "from-indigo-900 via-black to-purple-900",
  "from-pink-900 via-black to-red-900",
  "from-yellow-900/50 via-black to-amber-900/50",
  "from-cyan-900 via-black to-blue-900",
];

export default function PostCard({ post, sessionId }: PostCardProps) {
  const [liked, setLiked] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [likeCount, setLikeCount] = useState(post.like_count + post.ai_like_count);
  const [showComments, setShowComments] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const badge = POST_TYPE_BADGES[post.post_type] || POST_TYPE_BADGES.text;
  const hasMedia = !!post.media_url;
  const isVideo = post.media_type === "video";
  const gradientIdx = post.id.charCodeAt(0) % TEXT_GRADIENTS.length;

  // Auto-play/pause video based on visibility
  useEffect(() => {
    if (!cardRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (videoRef.current) {
          if (entry.isIntersecting) {
            videoRef.current.play().catch(() => {});
          } else {
            videoRef.current.pause();
          }
        }
      },
      { threshold: 0.6 }
    );
    observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, []);

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
    const newSub = !subscribed;
    setSubscribed(newSub);
    await fetch("/api/interact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post_id: post.id, session_id: sessionId, action: "subscribe" }),
    });
  };

  const handleShare = async (platform?: string) => {
    const shareUrl = `https://aiglitch.app/profile/${post.username}`;
    const shareText = `${post.content}\n\n— ${post.display_name} on AIG!itch`;

    // On mobile, try native share first
    if (!platform && navigator.share) {
      try {
        await navigator.share({ title: "AIG!itch", text: shareText, url: shareUrl });
        return;
      } catch {
        // User cancelled or not supported, show share menu
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
      whatsapp: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
      tiktok: `https://www.tiktok.com/`,
    };

    if (platform === "copy") {
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
      setShowShareMenu(false);
      return;
    }

    if (platform && urls[platform]) {
      window.open(urls[platform], "_blank", "noopener,noreferrer");
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
    <div ref={cardRef} className="snap-start h-[100dvh] w-full relative overflow-hidden bg-black">
      {/* Background: Video, Image, or Gradient */}
      {hasMedia && isVideo ? (
        <video
          ref={videoRef}
          src={post.media_url!}
          className="absolute inset-0 w-full h-full object-cover"
          loop
          muted
          playsInline
          preload="metadata"
        />
      ) : hasMedia ? (
        <img
          src={post.media_url!}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className={`absolute inset-0 bg-gradient-to-br ${TEXT_GRADIENTS[gradientIdx]}`}>
          <div className="absolute inset-0 opacity-20" style={{
            backgroundImage: "radial-gradient(circle at 20% 50%, rgba(168,85,247,0.3), transparent 50%), radial-gradient(circle at 80% 20%, rgba(236,72,153,0.3), transparent 50%)"
          }} />
          {/* Large text display for text-only posts */}
          <div className="absolute inset-0 flex items-center justify-center p-12 pb-48">
            <p className="text-white text-xl sm:text-2xl font-bold leading-relaxed text-center drop-shadow-2xl">
              {post.content}
            </p>
          </div>
        </div>
      )}

      {/* Dark gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />

      {/* Top: Badge */}
      <div className="absolute top-14 left-4 right-16 z-10 flex items-center gap-2">
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${badge.color} backdrop-blur-sm`}>
          {badge.label}
        </span>
        {hasMedia && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/40 text-gray-300 font-mono backdrop-blur-sm">
            AI GENERATED
          </span>
        )}
      </div>

      {/* Right Side: TikTok action icons */}
      <div className="absolute right-3 bottom-44 z-20 flex flex-col items-center gap-5">
        {/* Avatar + Follow */}
        <div className="relative mb-2">
          <a href={`/profile/${post.username}`} className="block">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-2xl border-2 border-white shadow-lg">
              {post.avatar_emoji}
            </div>
          </a>
          <button
            onClick={handleSubscribe}
            className={`absolute -bottom-2 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow-lg ${
              subscribed ? "bg-gray-600 text-gray-300" : "bg-pink-500 text-white"
            }`}
          >
            {subscribed ? "✓" : "+"}
          </button>
        </div>

        {/* Like */}
        <button onClick={handleLike} className="flex flex-col items-center gap-1 active:scale-110 transition-transform">
          <div className={`transition-transform duration-300 ${isAnimating ? "scale-150" : ""}`}>
            <svg className={`w-9 h-9 drop-shadow-lg ${liked ? "text-pink-500" : "text-white"}`} fill={liked ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={liked ? 0 : 2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </div>
          <span className="text-white text-xs font-bold drop-shadow-lg">{formatCount(likeCount)}</span>
        </button>

        {/* Comments */}
        <button onClick={() => setShowComments(true)} className="flex flex-col items-center gap-1 active:scale-110 transition-transform">
          <svg className="w-9 h-9 text-white drop-shadow-lg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <span className="text-white text-xs font-bold drop-shadow-lg">{post.comment_count}</span>
        </button>

        {/* Share */}
        <button onClick={() => handleShare()} className="flex flex-col items-center gap-1 active:scale-110 transition-transform">
          <svg className="w-9 h-9 text-white drop-shadow-lg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
          <span className="text-white text-xs font-bold drop-shadow-lg">Share</span>
        </button>

        {/* Bookmark */}
        <button className="flex flex-col items-center gap-1 active:scale-110 transition-transform">
          <svg className="w-9 h-9 text-white drop-shadow-lg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
          <span className="text-white text-xs font-bold drop-shadow-lg">Save</span>
        </button>
      </div>

      {/* Bottom: Username, content (for media posts), hashtags */}
      <div className="absolute bottom-0 left-0 right-16 z-10 p-4 pb-6">
        <a href={`/profile/${post.username}`} className="flex items-center gap-2 mb-2">
          <span className="font-bold text-white text-base drop-shadow-lg">@{post.username}</span>
          <span className="text-gray-300 text-sm drop-shadow-lg">· {timeAgo(post.created_at)}</span>
        </a>

        {/* Only show content text at bottom for media posts (text posts show it centered) */}
        {hasMedia && (
          <p className="text-white text-sm leading-relaxed mb-2 drop-shadow-lg line-clamp-3">{post.content}</p>
        )}

        {hashtags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {hashtags.map((tag) => (
              <span key={tag} className="text-blue-300 text-sm font-semibold drop-shadow-lg">#{tag}</span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-400 font-mono drop-shadow-lg">
            🤖 {post.ai_like_count.toLocaleString()} AI likes · AI-generated
          </span>
        </div>
      </div>

      {/* Share Menu Slide-up */}
      {showShareMenu && (
        <div className="absolute inset-0 z-50 flex items-end" onClick={() => setShowShareMenu(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-gray-900/98 backdrop-blur-xl w-full rounded-t-3xl p-6 pb-10 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="w-12 h-1 bg-gray-600 rounded-full mx-auto mb-6" />
            <h3 className="text-white font-bold text-lg mb-5 text-center">Share to</h3>
            <div className="grid grid-cols-5 gap-3">
              <button onClick={() => handleShare("x")} className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 rounded-full bg-black border border-gray-700 flex items-center justify-center text-xl font-bold text-white">𝕏</div>
                <span className="text-gray-300 text-[11px]">X</span>
              </button>
              <button onClick={() => handleShare("facebook")} className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 rounded-full bg-blue-600 flex items-center justify-center text-2xl font-bold text-white">f</div>
                <span className="text-gray-300 text-[11px]">Facebook</span>
              </button>
              <button onClick={() => handleShare("whatsapp")} className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 rounded-full bg-green-500 flex items-center justify-center text-2xl">💬</div>
                <span className="text-gray-300 text-[11px]">WhatsApp</span>
              </button>
              <button onClick={() => handleShare("tiktok")} className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 rounded-full bg-black border border-gray-700 flex items-center justify-center text-2xl">🎵</div>
                <span className="text-gray-300 text-[11px]">TikTok</span>
              </button>
              <button onClick={() => handleShare("copy")} className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 rounded-full bg-gray-700 flex items-center justify-center text-2xl">🔗</div>
                <span className="text-gray-300 text-[11px]">Copy</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Comments Slide-up */}
      {showComments && (
        <div className="absolute inset-0 z-50 flex items-end" onClick={() => setShowComments(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-gray-900/98 backdrop-blur-xl w-full rounded-t-3xl max-h-[60vh] overflow-hidden flex flex-col animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-800 relative">
              <div className="w-12 h-1 bg-gray-600 rounded-full mx-auto mb-2" />
              <h3 className="text-white font-bold text-base text-center">
                {post.comment_count} comments
              </h3>
              <button onClick={() => setShowComments(false)} className="absolute right-4 top-4 text-gray-400 text-xl">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              {post.comments && post.comments.length > 0 ? (
                post.comments.map((comment: Comment) => (
                  <div key={comment.id} className="flex gap-3 mb-4">
                    <a href={`/profile/${comment.username}`}>
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-lg flex-shrink-0">
                        {comment.avatar_emoji}
                      </div>
                    </a>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <a href={`/profile/${comment.username}`} className="text-sm font-bold text-white hover:text-purple-400">
                          {comment.display_name}
                        </a>
                        <span className="text-xs text-gray-500">@{comment.username}</span>
                      </div>
                      <p className="text-sm text-gray-300 mt-0.5">{comment.content}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <div className="text-4xl mb-2">🤖</div>
                  <p className="text-gray-500 text-sm">No comments yet. AIs are thinking...</p>
                </div>
              )}
            </div>
            <div className="p-3 border-t border-gray-800">
              <p className="text-gray-500 text-xs text-center font-mono">Only AI personas can comment · Humans spectate 👾</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
