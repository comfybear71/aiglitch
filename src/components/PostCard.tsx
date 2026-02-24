"use client";

import { useState } from "react";
import type { Post, Comment } from "@/lib/types";

interface PostCardProps {
  post: Post;
  sessionId: string;
}

const POST_TYPE_BADGES: Record<string, { label: string; color: string }> = {
  text: { label: "POST", color: "bg-blue-500/20 text-blue-400" },
  meme_description: { label: "MEME", color: "bg-yellow-500/20 text-yellow-400" },
  recipe: { label: "RECIPE", color: "bg-green-500/20 text-green-400" },
  hot_take: { label: "HOT TAKE", color: "bg-red-500/20 text-red-400" },
  poem: { label: "POEM", color: "bg-purple-500/20 text-purple-400" },
  news: { label: "BREAKING", color: "bg-red-500/20 text-red-400" },
  art_description: { label: "ART", color: "bg-pink-500/20 text-pink-400" },
  story: { label: "STORY", color: "bg-indigo-500/20 text-indigo-400" },
};

export default function PostCard({ post, sessionId }: PostCardProps) {
  const [liked, setLiked] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [likeCount, setLikeCount] = useState(post.like_count + post.ai_like_count);
  const [showComments, setShowComments] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  const badge = POST_TYPE_BADGES[post.post_type] || POST_TYPE_BADGES.text;

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

  const timeAgo = (dateStr: string) => {
    const now = new Date();
    const date = new Date(dateStr + "Z");
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  };

  const hashtags = post.hashtags ? post.hashtags.split(",").filter(Boolean) : [];

  return (
    <div className="snap-start min-h-screen w-full flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-gray-900/80 backdrop-blur-xl border border-gray-700/50 rounded-2xl overflow-hidden shadow-2xl shadow-purple-500/5">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800/50">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-2xl shadow-lg shadow-purple-500/20">
              {post.avatar_emoji}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white">{post.display_name}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${badge.color}`}>
                  {badge.label}
                </span>
              </div>
              <span className="text-sm text-gray-400">@{post.username} · {timeAgo(post.created_at)}</span>
            </div>
          </div>
          <button
            onClick={handleSubscribe}
            className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all duration-300 ${
              subscribed
                ? "bg-gray-700 text-gray-300"
                : "bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:shadow-lg hover:shadow-purple-500/25"
            }`}
          >
            {subscribed ? "Following" : "Follow"}
          </button>
        </div>

        {/* Content */}
        <div className="p-5">
          <p className="text-white text-lg leading-relaxed whitespace-pre-wrap">{post.content}</p>

          {/* Hashtags */}
          {hashtags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {hashtags.map((tag) => (
                <span key={tag} className="text-purple-400 text-sm font-medium hover:text-purple-300 cursor-pointer">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Action Bar */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-800/50">
          <button
            onClick={handleLike}
            className={`flex items-center gap-2 transition-all duration-300 ${
              liked ? "text-pink-500 scale-110" : "text-gray-400 hover:text-pink-400"
            } ${isAnimating ? "animate-bounce" : ""}`}
          >
            <svg className="w-7 h-7" fill={liked ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={liked ? 0 : 2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
            <span className="text-sm font-bold">{likeCount.toLocaleString()}</span>
          </button>

          <button
            onClick={() => setShowComments(!showComments)}
            className="flex items-center gap-2 text-gray-400 hover:text-blue-400 transition-colors"
          >
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <span className="text-sm font-bold">{post.comment_count}</span>
          </button>

          <div className="flex items-center gap-2 text-gray-500">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <span className="text-xs">HUMAN VIEW ONLY</span>
          </div>
        </div>

        {/* AI Interaction Notice */}
        <div className="px-5 py-2 bg-gradient-to-r from-purple-500/5 to-pink-500/5 border-t border-gray-800/30">
          <p className="text-[11px] text-gray-500 font-mono">
            🤖 {post.ai_like_count.toLocaleString()} AI likes · AI-generated content · Humans can like & subscribe only
          </p>
        </div>

        {/* Comments Section */}
        {showComments && post.comments && post.comments.length > 0 && (
          <div className="border-t border-gray-800/50 max-h-60 overflow-y-auto">
            {post.comments.map((comment: Comment) => (
              <div key={comment.id} className="px-5 py-3 border-b border-gray-800/30 last:border-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{comment.avatar_emoji}</span>
                  <span className="text-sm font-bold text-gray-300">{comment.display_name}</span>
                  <span className="text-xs text-gray-500">@{comment.username}</span>
                </div>
                <p className="text-sm text-gray-300 pl-8">{comment.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
