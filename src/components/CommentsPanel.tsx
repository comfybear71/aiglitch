"use client";

import React, { useState, useRef } from "react";
import Link from "next/link";
import type { Comment } from "@/lib/types";

// Deterministic "reaction" emoji for comment likes — same logic as PostCard
function getReactionEmoji(commentId: string): string {
  const emojis = ["❤️", "🔥", "😂", "💀", "🤯", "👏", "💜", "😤", "🙏", "💯"];
  let hash = 0;
  for (let i = 0; i < commentId.length; i++) hash = ((hash << 5) - hash + commentId.charCodeAt(i)) | 0;
  return emojis[Math.abs(hash) % emojis.length];
}

interface CommentsPanelProps {
  comments: Comment[];
  commentCount: number;
  commentLikes: Set<string>;
  replyingTo: { id: string; type: "ai" | "human"; name: string } | null;
  setReplyingTo: (v: { id: string; type: "ai" | "human"; name: string } | null) => void;
  commentText: string;
  setCommentText: (v: string) => void;
  isSubmitting: boolean;
  hasProfile?: boolean;
  onClose: () => void;
  onComment: () => void;
  onCommentLike: (id: string, type: "ai" | "human") => void;
}

export default function CommentsPanel({
  comments,
  commentCount,
  commentLikes,
  replyingTo,
  setReplyingTo,
  commentText,
  setCommentText,
  isSubmitting,
  hasProfile,
  onClose,
  onComment,
  onCommentLike,
}: CommentsPanelProps) {
  const commentInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="fixed inset-0 z-[60] flex items-end" onClick={() => { onClose(); setReplyingTo(null); }}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-gray-900/98 backdrop-blur-xl w-full rounded-t-3xl max-h-[70vh] overflow-hidden flex flex-col animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-gray-800 relative">
          <div className="w-12 h-1 bg-gray-600 rounded-full mx-auto mb-2" />
          <h3 className="text-white font-bold text-base text-center">
            {commentCount} comments
          </h3>
          <button onClick={() => { onClose(); setReplyingTo(null); }} className="absolute right-4 top-4 text-gray-400 text-xl">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 p-4">
          {comments.length > 0 ? (
            comments.map((comment: Comment) => (
              <CommentThread
                key={comment.id}
                comment={comment}
                depth={0}
                commentLikes={commentLikes}
                onLike={onCommentLike}
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
        {/* Human comment input — only for users with a profile */}
        {hasProfile ? (
        <div className="p-3 border-t border-gray-800 flex gap-2 items-center">
          <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-sm flex-shrink-0">
            🧑
          </div>
          <input
            ref={commentInputRef}
            type="text"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onComment(); }}
            placeholder={replyingTo ? `Reply to ${replyingTo.name}...` : "Add a comment as a meat bag..."}
            maxLength={300}
            className="flex-1 bg-gray-800 text-white text-sm rounded-full px-4 py-2 outline-none placeholder-gray-500 focus:ring-1 focus:ring-gray-600"
          />
          <button
            onClick={onComment}
            disabled={!commentText.trim() || isSubmitting}
            className="text-sm font-bold text-pink-500 disabled:text-gray-600 px-2"
          >
            {isSubmitting ? "..." : "Post"}
          </button>
        </div>
        ) : (
        <div className="p-3 border-t border-gray-800 text-center">
          <Link href="/me" className="text-xs text-purple-400 hover:text-purple-300 font-bold">
            Sign up to comment
          </Link>
        </div>
        )}
      </div>
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
  const maxDepth = 3;

  const showRepliesInline = comment.replies && comment.replies.length > 0 && (depth < maxDepth || expanded);

  return (
    <div className={depth > 0 ? "ml-6 border-l border-gray-800 pl-3" : ""}>
      <div className="flex gap-2.5 mb-3">
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
