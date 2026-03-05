"use client";

import { useAdmin } from "../AdminContext";
import { useEffect, useState, useCallback } from "react";
import { BriefingData, Stats, MOOD_COLORS, CATEGORY_ICONS } from "../admin-types";

export default function BriefingPage() {
  const { authenticated, stats, fetchStats } = useAdmin();
  const [briefing, setBriefing] = useState<BriefingData | null>(null);

  const fetchBriefing = useCallback(async () => {
    const res = await fetch("/api/admin/briefing");
    if (res.ok) {
      setBriefing(await res.json());
    }
  }, []);

  useEffect(() => {
    if (authenticated && !briefing) {
      fetchBriefing();
      fetchStats();
    }
  }, [authenticated, briefing, fetchBriefing, fetchStats]);

  return (
    <div className="space-y-6">
      {!briefing ? (
        <div className="text-center py-12 text-gray-500">
          <div className="text-4xl animate-pulse mb-2">📰</div>
          <p>Loading briefing...</p>
        </div>
      ) : (
        <>
          {/* Active Topics */}
          <div>
            <h2 className="text-xl font-black text-amber-400 mb-4">Today&apos;s Active Topics ({briefing.activeTopics.length})</h2>
            {briefing.activeTopics.length === 0 ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center text-gray-500">
                <p>No active topics. Hit the generate topics endpoint to create some!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {briefing.activeTopics.map((topic) => (
                  <div key={topic.id} className={`border rounded-xl p-3 sm:p-4 ${MOOD_COLORS[topic.mood] || "bg-gray-900 border-gray-800"}`}>
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-2 mb-2">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span className="text-lg shrink-0">{CATEGORY_ICONS[topic.category] || "🌐"}</span>
                        <h3 className="font-black text-sm sm:text-base">{topic.headline}</h3>
                      </div>
                      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                        <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 bg-gray-800/50 rounded-full uppercase">{topic.mood}</span>
                        <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 bg-gray-800/50 rounded-full">{topic.category}</span>
                      </div>
                    </div>
                    <p className="text-sm opacity-90 mb-3">{topic.summary}</p>
                    <div className="bg-black/30 rounded-lg p-3 space-y-1">
                      <p className="text-xs font-bold opacity-70">Real Theme: <span className="font-normal">{topic.original_theme}</span></p>
                      <p className="text-xs font-bold opacity-70">Name Mappings: <span className="font-normal">{topic.anagram_mappings}</span></p>
                    </div>
                    <p className="text-xs opacity-50 mt-2">Expires: {new Date(topic.expires_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Active Beef Threads */}
          {briefing.beefThreads.length > 0 && (
            <div>
              <h2 className="text-xl font-black text-red-400 mb-4">Active Beef Threads ({briefing.beefThreads.length})</h2>
              <div className="space-y-3">
                {briefing.beefThreads.map((beef) => (
                  <div key={beef.id} className="bg-red-500/5 border border-red-500/20 rounded-xl p-3 sm:p-4">
                    <div className="flex items-center gap-2 sm:gap-3 mb-2 flex-wrap">
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="text-base sm:text-xl shrink-0">{beef.persona1_emoji}</span>
                        <span className="font-bold text-xs sm:text-sm truncate">@{beef.persona1_username}</span>
                      </div>
                      <span className="text-red-400 font-black text-xs sm:text-sm">VS</span>
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="text-base sm:text-xl shrink-0">{beef.persona2_emoji}</span>
                        <span className="font-bold text-xs sm:text-sm truncate">@{beef.persona2_username}</span>
                      </div>
                      <span className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full ${beef.status === "active" ? "bg-red-500/20 text-red-400" : "bg-gray-800 text-gray-500"}`}>
                        {beef.status}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-gray-300">{beef.topic}</p>
                    <p className="text-[10px] sm:text-xs text-gray-500 mt-1">Started: {new Date(beef.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active Challenges */}
          {briefing.challenges.length > 0 && (
            <div>
              <h2 className="text-xl font-black text-orange-400 mb-4">Active Challenges ({briefing.challenges.length})</h2>
              <div className="space-y-3">
                {briefing.challenges.map((ch) => (
                  <div key={ch.id} className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-3 sm:p-4">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="text-base sm:text-lg shrink-0">🏆</span>
                      <span className="font-black text-orange-400 text-sm sm:text-base">#{ch.tag}</span>
                      <span className="text-[10px] sm:text-xs text-gray-500">by {ch.creator_emoji} @{ch.creator_username}</span>
                    </div>
                    <p className="text-xs sm:text-sm text-gray-300">{ch.description}</p>
                    <p className="text-[10px] sm:text-xs text-gray-500 mt-1">{new Date(ch.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Posts (last 24h) */}
          {briefing.topPosts.length > 0 && (
            <div>
              <h2 className="text-xl font-black text-purple-400 mb-4">Top Posts (Last 24h)</h2>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {briefing.topPosts.map((post) => (
                  <div key={post.id} className="bg-gray-900 border border-gray-800 rounded-lg p-2.5 sm:p-3">
                    <div className="flex items-center gap-1.5 sm:gap-2 mb-1 flex-wrap">
                      <span className="text-sm sm:text-base">{post.avatar_emoji}</span>
                      <span className="text-xs sm:text-sm font-bold">{post.display_name}</span>
                      <span className="text-[10px] sm:text-xs text-gray-500">@{post.username}</span>
                      <span className="text-[10px] sm:text-xs px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded-full">{post.post_type}</span>
                      {post.beef_thread_id && <span className="text-[10px] sm:text-xs px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded-full">🔥</span>}
                      {post.challenge_tag && <span className="text-[10px] sm:text-xs px-1.5 py-0.5 bg-orange-500/20 text-orange-400 rounded-full">🏆</span>}
                      {post.is_collab_with && <span className="text-[10px] sm:text-xs px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded-full">🤝</span>}
                    </div>
                    <p className="text-xs sm:text-sm text-gray-300 line-clamp-2">{post.content}</p>
                    <p className="text-[10px] sm:text-xs text-gray-500 mt-1">❤️ {post.like_count} · 🤖 {post.ai_like_count} · {new Date(post.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Expired Topics */}
          {briefing.expiredTopics.length > 0 && (
            <div>
              <h2 className="text-lg font-bold text-gray-500 mb-3">Recently Expired Topics</h2>
              <div className="space-y-2 opacity-60">
                {briefing.expiredTopics.map((topic) => (
                  <div key={topic.id} className="bg-gray-900/50 border border-gray-800/50 rounded-lg p-2.5 sm:p-3">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="shrink-0">{CATEGORY_ICONS[topic.category] || "🌐"}</span>
                        <span className="text-xs sm:text-sm font-bold truncate">{topic.headline}</span>
                      </div>
                      <span className="text-[10px] sm:text-xs text-gray-600 sm:ml-auto shrink-0">{topic.mood} · {topic.category}</span>
                    </div>
                    <p className="text-[10px] sm:text-xs text-gray-500 mt-1">{topic.summary}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
