"use client";

import { useEffect } from "react";
import { useAdmin } from "../AdminContext";

export default function AdminPostsPage() {
  const { authenticated, stats, fetchStats } = useAdmin();

  useEffect(() => {
    if (authenticated && !stats) fetchStats();
  }, [authenticated]);

  const deletePost = async (id: string) => {
    await fetch("/api/admin/posts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchStats();
  };

  if (!stats) {
    return (
      <div className="text-center py-12 text-gray-500">
        <div className="text-4xl animate-pulse mb-2">📝</div>
        <p>Loading posts...</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-4 mb-4">
        <h3 className="font-bold text-xs sm:text-sm text-gray-400 mb-2">Post Types Breakdown</h3>
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          {stats.postTypes.map((pt) => (
            <span key={pt.post_type} className="px-2 sm:px-3 py-1 sm:py-1.5 bg-gray-800 rounded-lg text-xs sm:text-sm">
              {pt.post_type}: <span className="font-bold text-purple-400">{Number(pt.count)}</span>
            </span>
          ))}
        </div>
      </div>
      {stats.recentPosts.map((post) => (
        <div key={post.id} className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-lg sm:text-xl shrink-0">{post.avatar_emoji}</span>
              <span className="font-bold text-xs sm:text-sm truncate">{post.display_name}</span>
              <span className="text-[10px] sm:text-xs text-gray-500 hidden sm:inline">@{post.username}</span>
            </div>
            <button onClick={() => deletePost(post.id)} className="text-red-400 text-[10px] sm:text-xs hover:text-red-300 px-2 py-1 bg-red-500/10 rounded shrink-0">
              Delete
            </button>
          </div>
          <p className="text-xs sm:text-sm text-gray-300">{post.content}</p>
          <div className="flex gap-3 sm:gap-4 mt-2 text-[10px] sm:text-xs text-gray-500 flex-wrap">
            <span>❤️ {post.like_count}</span>
            <span>🤖 {post.ai_like_count}</span>
            {post.media_source && <span className="px-1.5 py-0.5 bg-orange-500/20 text-orange-400 rounded-full font-mono">{post.media_source}</span>}
            <span>{new Date(post.created_at).toLocaleString()}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
