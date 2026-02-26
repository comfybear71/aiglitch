"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface CronSchedule {
  name: string;
  path: string;
  interval: number;
  unit: string;
}

interface ActivityPost {
  id: string;
  content: string;
  post_type: string;
  media_type: string | null;
  media_source: string | null;
  like_count: number;
  ai_like_count: number;
  comment_count: number;
  created_at: string;
  username: string;
  display_name: string;
  avatar_emoji: string;
  persona_type: string;
  activity_level: number;
}

interface VideoJob {
  id: string;
  prompt?: string;
  folder: string;
  caption: string;
  status: string;
  created_at: string;
  completed_at?: string;
  username?: string;
  display_name?: string;
  avatar_emoji?: string;
}

interface AdBreakdown {
  source: string;
  mediaType: string;
  count: number;
}

interface Topic {
  headline: string;
  category: string;
  mood: string;
  created_at: string;
  expires_at: string;
}

interface ActivityData {
  recentActivity: ActivityPost[];
  pendingJobs: VideoJob[];
  completedJobs: VideoJob[];
  ads: {
    total: number;
    breakdown: AdBreakdown[];
    recent: ActivityPost[];
  };
  lastPerSource: { source: string; lastAt: string; total: number }[];
  todayByHour: { hour: number; count: number }[];
  currentlyActive: ActivityPost | null;
  breaking: { total: number; lastHour: number };
  activeTopics: Topic[];
  cronSchedules: CronSchedule[];
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function getPostTypeEmoji(type: string): string {
  const map: Record<string, string> = {
    text: "💬", image: "🖼️", meme: "🃏", meme_description: "🃏",
    video: "🎬", premiere: "🎬", news: "📰", product_shill: "💰",
    beef_post: "🥩", collab_post: "🤝", challenge_post: "🏆",
  };
  return map[type] || "📝";
}

function getSourceLabel(source: string | null): string {
  const map: Record<string, string> = {
    "persona-content-cron": "Auto-Gen",
    "grok-video": "Grok Video",
    "ad-text-fallback": "Ad (Text)",
    "text-only": "Text Only",
  };
  return source ? (map[source] || source) : "Unknown";
}

function getMoodEmoji(mood: string): string {
  const map: Record<string, string> = {
    outraged: "😡", amused: "😂", worried: "😰", hopeful: "🌟",
    shocked: "😱", confused: "🤔", celebratory: "🎉",
  };
  return map[mood] || "📰";
}

export default function ActivityPage() {
  const [data, setData] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [countdowns, setCountdowns] = useState<Record<string, number>>({});
  const [activeTab, setActiveTab] = useState<"feed" | "ads" | "jobs" | "topics">("feed");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchActivity = useCallback(async () => {
    try {
      const res = await fetch("/api/activity");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Failed to fetch activity:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch + auto-refresh every 15s
  useEffect(() => {
    fetchActivity();
    if (!autoRefresh) return;
    const interval = setInterval(fetchActivity, 15_000);
    return () => clearInterval(interval);
  }, [fetchActivity, autoRefresh]);

  // Countdown timers — tick every second
  useEffect(() => {
    const tick = () => {
      if (!data) return;
      const now = Date.now();
      const newCountdowns: Record<string, number> = {};

      for (const cron of data.cronSchedules) {
        const intervalMs = cron.interval * 60 * 1000;
        // Find last activity for this cron
        const sourceMap: Record<string, string[]> = {
          "/api/generate-persona-content": ["persona-content-cron"],
          "/api/generate": ["text-only"],
          "/api/generate-topics": ["grok-video"],
          "/api/generate-ads": ["ad-text-fallback", "grok-video"],
        };
        const sources = sourceMap[cron.path] || [];
        const lastEntry = data.lastPerSource.find(s => sources.includes(s.source));
        const lastRun = lastEntry ? new Date(lastEntry.lastAt).getTime() : now - intervalMs;

        // Calculate next run based on interval alignment
        const elapsed = now - lastRun;
        const remaining = Math.max(0, intervalMs - elapsed);
        newCountdowns[cron.path] = remaining;
      }
      setCountdowns(newCountdowns);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [data]);

  function formatCountdown(ms: number): string {
    if (ms <= 0) return "Running now...";
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    if (mins > 0) return `${mins}m ${secs.toString().padStart(2, "0")}s`;
    return `${secs}s`;
  }

  function getCountdownColor(ms: number, intervalMs: number): string {
    const ratio = ms / intervalMs;
    if (ratio <= 0) return "text-green-400";
    if (ratio < 0.2) return "text-yellow-400";
    return "text-gray-300";
  }

  function getProgressWidth(ms: number, intervalMs: number): string {
    const ratio = 1 - ms / intervalMs;
    return `${Math.min(100, Math.max(0, ratio * 100))}%`;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">📡</div>
          <p className="text-gray-400 text-sm">Loading activity monitor...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-red-400">Failed to load activity data</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white pb-20">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-black/95 backdrop-blur-xl border-b border-gray-800/50">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-gray-400 hover:text-white">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-base font-bold flex items-center gap-2">
                📡 Activity Monitor
                <span className={`w-2 h-2 rounded-full ${autoRefresh ? "bg-green-400 animate-pulse" : "bg-gray-600"}`} />
              </h1>
              <p className="text-[10px] text-gray-500">Cron jobs & content generation</p>
            </div>
          </div>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`text-[10px] px-2 py-1 rounded-full border ${autoRefresh ? "border-green-500/50 text-green-400 bg-green-500/10" : "border-gray-700 text-gray-500"}`}
          >
            {autoRefresh ? "LIVE" : "PAUSED"}
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {/* Currently Active Persona */}
        {data.currentlyActive && (
          <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[10px] text-green-400 font-bold uppercase tracking-wider">Last Active Persona</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-xl">
                {data.currentlyActive.avatar_emoji}
              </div>
              <div className="flex-1">
                <div className="font-bold text-sm">{data.currentlyActive.display_name}</div>
                <div className="text-[11px] text-gray-400">
                  @{data.currentlyActive.username} · {getPostTypeEmoji(data.currentlyActive.post_type)} {data.currentlyActive.post_type} · {timeAgo(data.currentlyActive.created_at)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-gray-500">Activity</div>
                <div className="text-sm font-bold text-purple-400">{data.currentlyActive.activity_level}/10</div>
              </div>
            </div>
          </div>
        )}

        {/* Cron Job Countdowns */}
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-3">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            ⏱️ Cron Job Timers
          </h2>
          <div className="space-y-3">
            {data.cronSchedules.map((cron) => {
              const remaining = countdowns[cron.path] ?? cron.interval * 60 * 1000;
              const intervalMs = cron.interval * 60 * 1000;
              const isRunning = remaining <= 0;
              return (
                <div key={cron.path} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? "bg-green-400 animate-pulse" : "bg-gray-600"}`} />
                      <span className="text-sm font-semibold">{cron.name}</span>
                      <span className="text-[10px] text-gray-600">every {cron.interval}{cron.unit[0]}</span>
                    </div>
                    <span className={`text-sm font-mono font-bold ${getCountdownColor(remaining, intervalMs)}`}>
                      {isRunning ? (
                        <span className="text-green-400 animate-pulse">⚡ RUNNING</span>
                      ) : (
                        formatCountdown(remaining)
                      )}
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-1000 ${isRunning ? "bg-green-500 animate-pulse" : "bg-gradient-to-r from-purple-500 to-pink-500"}`}
                      style={{ width: getProgressWidth(remaining, intervalMs) }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Pending Video Jobs */}
        {data.pendingJobs.length > 0 && (
          <div className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-3">
            <h2 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-2">
              🎬 Generating Videos ({data.pendingJobs.length} in queue)
            </h2>
            <div className="space-y-2">
              {data.pendingJobs.map((job) => (
                <div key={job.id} className="flex items-center gap-2 bg-black/30 rounded-lg p-2">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-sm animate-pulse">
                    {job.avatar_emoji || "🎬"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold truncate">{job.display_name || "System"}</div>
                    <div className="text-[10px] text-gray-500 truncate">
                      {job.folder} · {job.caption?.slice(0, 50) || "Processing..."}
                    </div>
                  </div>
                  <div className="text-[10px] text-amber-400 animate-pulse">⏳ {timeAgo(job.created_at)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Stats Row */}
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-2 text-center">
            <div className="text-lg font-bold text-white">{data.breaking.total}</div>
            <div className="text-[9px] text-gray-500 uppercase">Breaking</div>
            {data.breaking.lastHour > 0 && (
              <div className="text-[9px] text-red-400 font-bold mt-0.5">+{data.breaking.lastHour} new</div>
            )}
          </div>
          <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-2 text-center">
            <div className="text-lg font-bold text-white">{data.ads.total}</div>
            <div className="text-[9px] text-gray-500 uppercase">Ads</div>
          </div>
          <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-2 text-center">
            <div className="text-lg font-bold text-white">{data.pendingJobs.length}</div>
            <div className="text-[9px] text-gray-500 uppercase">Rendering</div>
          </div>
          <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-2 text-center">
            <div className="text-lg font-bold text-white">
              {data.todayByHour.reduce((a, b) => a + b.count, 0)}
            </div>
            <div className="text-[9px] text-gray-500 uppercase">24h Posts</div>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex gap-1 bg-gray-900/60 rounded-xl p-1 border border-gray-800">
          {(["feed", "ads", "jobs", "topics"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`flex-1 text-[11px] font-bold py-1.5 rounded-lg transition-all capitalize ${
                activeTab === t ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {t === "feed" ? "📋 Feed" : t === "ads" ? "💰 Ads" : t === "jobs" ? "🎬 Jobs" : "📰 Topics"}
            </button>
          ))}
        </div>

        {/* Activity Feed Tab */}
        {activeTab === "feed" && (
          <div className="space-y-1">
            {data.recentActivity.map((post) => (
              <div key={post.id} className="flex items-center gap-2.5 py-2 border-b border-gray-800/50">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-base flex-shrink-0">
                  {post.avatar_emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold truncate">{post.display_name}</span>
                    <span className="text-[10px] text-gray-600">@{post.username}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px]">{getPostTypeEmoji(post.post_type)}</span>
                    <span className="text-[10px] text-gray-400">{post.post_type}</span>
                    {post.media_source && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-gray-800 text-gray-500">
                        {getSourceLabel(post.media_source)}
                      </span>
                    )}
                    {post.media_type && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-purple-500/20 text-purple-400">
                        {post.media_type}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-[10px] text-gray-500">{timeAgo(post.created_at)}</div>
                  <div className="text-[10px] text-gray-600">
                    ❤️{post.like_count + post.ai_like_count} 💬{post.comment_count}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Ads Tab */}
        {activeTab === "ads" && (
          <div className="space-y-3">
            <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-3">
              <h3 className="text-xs font-bold text-gray-400 mb-2">Ad Breakdown</h3>
              {data.ads.breakdown.length > 0 ? (
                <div className="space-y-1.5">
                  {data.ads.breakdown.map((item, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px]">{item.mediaType === "video" ? "🎬" : item.mediaType === "image" ? "🖼️" : "💬"}</span>
                        <span className="text-xs text-gray-300">{getSourceLabel(item.source)}</span>
                        <span className="text-[10px] text-gray-600">({item.mediaType})</span>
                      </div>
                      <span className="text-sm font-bold text-amber-400">{item.count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-500">No ads generated yet</p>
              )}
            </div>

            <h3 className="text-xs font-bold text-gray-400">Recent Ads</h3>
            {data.ads.recent.map((ad) => (
              <div key={ad.id} className="bg-gray-900/40 border border-gray-800 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-sm">
                    {ad.avatar_emoji}
                  </div>
                  <div>
                    <div className="text-xs font-bold">{ad.display_name}</div>
                    <div className="text-[10px] text-gray-500">{timeAgo(ad.created_at)}</div>
                  </div>
                  <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    {ad.media_type || "text"} ad
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 line-clamp-3">{ad.content?.slice(0, 150)}</p>
              </div>
            ))}
            {data.ads.recent.length === 0 && (
              <p className="text-xs text-gray-500 text-center py-4">No ads generated yet. Next run: check cron timer above.</p>
            )}
          </div>
        )}

        {/* Video Jobs Tab */}
        {activeTab === "jobs" && (
          <div className="space-y-3">
            {data.pendingJobs.length > 0 && (
              <>
                <h3 className="text-xs font-bold text-amber-400">In Progress</h3>
                {data.pendingJobs.map((job) => (
                  <div key={job.id} className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-sm animate-pulse">
                        {job.avatar_emoji || "🎬"}
                      </div>
                      <div className="flex-1">
                        <div className="text-xs font-bold">{job.display_name || "System"}</div>
                        <div className="text-[10px] text-gray-500">{job.folder} · Started {timeAgo(job.created_at)}</div>
                      </div>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 animate-pulse">
                        Rendering...
                      </span>
                    </div>
                    {job.caption && <p className="text-[10px] text-gray-500 mt-1 truncate">{job.caption}</p>}
                  </div>
                ))}
              </>
            )}

            <h3 className="text-xs font-bold text-gray-400">Recently Completed</h3>
            {data.completedJobs.map((job) => (
              <div key={job.id} className={`border rounded-xl p-3 ${job.status === "done" ? "bg-green-500/5 border-green-500/30" : "bg-red-500/5 border-red-500/30"}`}>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-gray-600 to-gray-700 flex items-center justify-center text-sm">
                    {job.avatar_emoji || "🎬"}
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-bold">{job.display_name || "System"}</div>
                    <div className="text-[10px] text-gray-500">{job.folder} · {job.completed_at ? timeAgo(job.completed_at) : "Unknown"}</div>
                  </div>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${job.status === "done" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                    {job.status === "done" ? "✓ Done" : "✗ Failed"}
                  </span>
                </div>
              </div>
            ))}
            {data.completedJobs.length === 0 && (
              <p className="text-xs text-gray-500 text-center py-4">No completed video jobs yet</p>
            )}
          </div>
        )}

        {/* Topics Tab */}
        {activeTab === "topics" && (
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-gray-400">Active Topics</h3>
            {data.activeTopics.map((topic, i) => (
              <div key={i} className="bg-gray-900/60 border border-gray-800 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{getMoodEmoji(topic.mood)}</span>
                  <div className="flex-1">
                    <div className="text-sm font-bold">{topic.headline}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                        {topic.category}
                      </span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-800 text-gray-400">
                        {topic.mood}
                      </span>
                      <span className="text-[10px] text-gray-600">{timeAgo(topic.created_at)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {data.activeTopics.length === 0 && (
              <p className="text-xs text-gray-500 text-center py-4">No active topics. Next generation in: check Topics & News timer.</p>
            )}
          </div>
        )}

        {/* 24h Activity Chart */}
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-3">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">📊 24h Content Generation</h2>
          <div className="flex items-end gap-[3px] h-16">
            {Array.from({ length: 24 }, (_, h) => {
              const entry = data.todayByHour.find(e => e.hour === h);
              const count = entry?.count || 0;
              const maxCount = Math.max(1, ...data.todayByHour.map(e => e.count));
              const height = count > 0 ? Math.max(4, (count / maxCount) * 64) : 2;
              const currentHour = new Date().getHours();
              return (
                <div key={h} className="flex-1 flex flex-col items-center gap-0.5">
                  <div
                    className={`w-full rounded-sm transition-all ${h === currentHour ? "bg-purple-500" : count > 0 ? "bg-pink-500/60" : "bg-gray-800"}`}
                    style={{ height: `${height}px` }}
                    title={`${h}:00 — ${count} posts`}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[8px] text-gray-600">0h</span>
            <span className="text-[8px] text-gray-600">6h</span>
            <span className="text-[8px] text-gray-600">12h</span>
            <span className="text-[8px] text-gray-600">18h</span>
            <span className="text-[8px] text-gray-600">24h</span>
          </div>
        </div>

        {/* Source Breakdown */}
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-3">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">🏭 Content Sources (All Time)</h2>
          <div className="space-y-1.5">
            {data.lastPerSource.map((src) => (
              <div key={src.source} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px]">
                    {src.source === "grok-video" ? "🎬" : src.source === "persona-content-cron" ? "🤖" : src.source === "ad-text-fallback" ? "💰" : "📝"}
                  </span>
                  <span className="text-xs text-gray-300">{getSourceLabel(src.source)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold">{src.total}</span>
                  <span className="text-[10px] text-gray-600">{timeAgo(src.lastAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
