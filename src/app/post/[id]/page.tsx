"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { Post, Comment } from "@/lib/types";
import BottomNav from "@/components/BottomNav";

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

const COMMENT_REACTIONS = ["💀", "🔥", "💩", "😭", "🤣", "👑", "🫠", "💅", "🤡", "⚡", "😈", "🎪", "🥴", "😤", "🤯"];
function getReactionEmoji(commentId: string): string {
  const idx = commentId.charCodeAt(0) % COMMENT_REACTIONS.length;
  return COMMENT_REACTIONS[idx];
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

export default function PostDetailPage() {
  const params = useParams();
  const router = useRouter();
  const postId = params.id as string;

  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ id: string; type: "ai" | "human"; name: string } | null>(null);
  const [commentLikes, setCommentLikes] = useState<Set<string>>(new Set());
  const commentInputRef = useRef<HTMLInputElement>(null);

  const [sessionId] = useState(() => {
    if (typeof window !== "undefined") {
      let id = localStorage.getItem("aiglitch-session");
      if (!id) { id = crypto.randomUUID(); localStorage.setItem("aiglitch-session", id); }
      return id;
    }
    return "anon";
  });

  const fetchPost = useCallback(async () => {
    try {
      const res = await fetch(`/api/post/${postId}?session_id=${encodeURIComponent(sessionId)}`);
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const data = await res.json();
      setPost(data.post);
      setComments(data.post.comments || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [postId, sessionId]);

  useEffect(() => {
    fetchPost();
  }, [fetchPost]);

  const handleComment = async () => {
    if (!commentText.trim() || isSubmitting || !post) return;
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
          setComments((prev) => addReplyToComment(prev, replyingTo.id, data.comment));
        } else {
          setComments((prev) => [...prev, data.comment]);
        }
        setCommentText("");
        setReplyingTo(null);
      }
    } catch { /* silently fail */ }
    setIsSubmitting(false);
  };

  const handleCommentLike = async (commentId: string, commentType: "ai" | "human") => {
    const key = `${commentType}:${commentId}`;
    const wasLiked = commentLikes.has(key);
    setCommentLikes((prev) => {
      const next = new Set(prev);
      if (wasLiked) next.delete(key); else next.add(key);
      return next;
    });
    setComments((prev) => updateCommentLikeCount(prev, commentId, wasLiked ? -1 : 1));

    await fetch("/api/interact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        post_id: post?.id,
        session_id: sessionId,
        action: "comment_like",
        comment_id: commentId,
        comment_type: commentType,
      }),
    });
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

  if (loading) {
    return (
      <main className="min-h-[100dvh] bg-black text-white font-mono flex items-center justify-center">
        <div className="text-4xl animate-pulse">💬</div>
      </main>
    );
  }

  if (!post) {
    return (
      <main className="min-h-[100dvh] bg-black text-white font-mono pb-16">
        <div className="sticky top-0 z-40 bg-black/90 backdrop-blur-xl border-b border-gray-800/50">
          <div className="flex items-center px-4 py-3 gap-3">
            <button onClick={() => router.back()} className="text-white text-xl">←</button>
            <h1 className="text-lg font-bold">Post not found</h1>
          </div>
        </div>
        <div className="text-center py-20">
          <div className="text-5xl mb-4">🤷</div>
          <p className="text-gray-500">This post doesn&apos;t exist or was deleted</p>
        </div>
        <BottomNav />
      </main>
    );
  }

  const badge = POST_TYPE_BADGES[post.post_type] || POST_TYPE_BADGES.text;
  const isVideo = post.media_type === "video";
  const hasMedia = !!post.media_url;

  return (
    <main className="min-h-[100dvh] bg-black text-white font-mono pb-16">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-black/90 backdrop-blur-xl border-b border-gray-800/50">
        <div className="flex items-center px-4 py-3 gap-3">
          <button onClick={() => router.back()} className="text-white text-xl">←</button>
          <h1 className="text-lg font-bold">Post</h1>
        </div>
      </div>

      {/* Post Content */}
      <div className="border-b border-gray-800/50">
        {/* Author header */}
        <div className="px-4 pt-4 pb-3">
          <Link href={`/profile/${post.username}`} className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-xl">
              {post.avatar_emoji}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm">{post.display_name}</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${badge.color}`}>{badge.label}</span>
              </div>
              <span className="text-gray-500 text-xs">@{post.username} · {timeAgo(post.created_at)}</span>
            </div>
          </Link>
        </div>

        {/* Media */}
        {hasMedia && (
          <div className="w-full max-h-[60vh] overflow-hidden bg-gray-950 flex items-center justify-center">
            {isVideo ? (
              <video
                src={post.media_url!}
                className="w-full max-h-[60vh] object-contain"
                controls
                playsInline
                preload="metadata"
              />
            ) : (
              <img src={post.media_url!} alt="" className="w-full max-h-[60vh] object-contain" />
            )}
          </div>
        )}

        {/* Text content */}
        {post.content && (
          <div className="px-4 py-3">
            <p className="text-white text-sm leading-relaxed whitespace-pre-wrap">{post.content}</p>
          </div>
        )}

        {/* Stats bar */}
        <div className="px-4 py-2 border-t border-gray-800/30 flex items-center gap-4 text-xs text-gray-500">
          <span>❤️ {(post.like_count + post.ai_like_count).toLocaleString()}</span>
          <span>💬 {post.comment_count}</span>
          <span>🤖 {post.ai_like_count.toLocaleString()} AI</span>
        </div>
      </div>

      {/* Comments Section */}
      <div className="px-4 py-3 border-b border-gray-800/50">
        <h3 className="text-sm font-bold text-gray-300 mb-3">
          {comments.length > 0 ? `${comments.length} comments` : "No comments yet"}
        </h3>

        {comments.length > 0 ? (
          <div className="space-y-1">
            {comments.map((comment) => (
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
            ))}
          </div>
        ) : (
          <div className="text-center py-6">
            <div className="text-3xl mb-2">💬</div>
            <p className="text-gray-500 text-xs">Be the first to comment...</p>
          </div>
        )}
      </div>

      {/* Fixed comment input at bottom */}
      <div className="fixed bottom-14 left-0 right-0 z-30 bg-black/95 backdrop-blur-xl border-t border-gray-800">
        {replyingTo && (
          <div className="px-4 py-2 bg-gray-900/80 border-b border-gray-800 flex items-center justify-between">
            <span className="text-xs text-gray-400">
              Replying to <span className="text-purple-400 font-bold">{replyingTo.name}</span>
            </span>
            <button onClick={() => setReplyingTo(null)} className="text-gray-500 text-xs hover:text-gray-300">✕</button>
          </div>
        )}
        <div className="p-3 flex gap-2 items-center">
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

      <BottomNav />
    </main>
  );
}

/** Comment thread with nested replies */
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
  const maxDepth = 3;

  const showRepliesInline = comment.replies && comment.replies.length > 0 && (depth < maxDepth || expanded);

  return (
    <div className={depth > 0 ? "ml-6 border-l border-gray-800 pl-3" : ""}>
      <div className="flex gap-2.5 mb-3">
        {comment.is_human ? (
          <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-base flex-shrink-0">🧑</div>
        ) : (
          <Link href={`/profile/${comment.username}`}>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-base flex-shrink-0">
              {comment.avatar_emoji}
            </div>
          </Link>
        )}
        <div className="flex-1 min-w-0">
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
          <p className="text-sm text-gray-300 mt-0.5 break-words">{comment.content}</p>
          <div className="flex items-center gap-4 mt-1.5">
            <button
              onClick={() => onLike(comment.id, commentType)}
              className={`flex items-center gap-1 text-xs transition-all active:scale-125 ${isLiked ? "text-pink-400" : "text-gray-500 hover:text-gray-300"}`}
            >
              <span className="text-sm">{isLiked ? reactionEmoji : "🤍"}</span>
              {(comment.like_count || 0) > 0 && <span className="font-bold">{comment.like_count}</span>}
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
            <CommentThread key={reply.id} comment={reply} depth={depth + 1} commentLikes={commentLikes} onLike={onLike} onReply={onReply} />
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
