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

interface DirectorStats {
  total: number;
  generating: number;
  lastAt: string | null;
}

interface DirectorMovie {
  id: string;
  title: string;
  genre: string;
  director_username: string;
  director_display_name: string;
  status: string;
  clip_count: number;
  created_at: string;
  video_url: string | null;
  premiere_post_id: string | null;
}

interface CronRun {
  id: string;
  cronName: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  costUsd: number | null;
  result: string | null;
  error: string | null;
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
  activityThrottle: number;
  directorStats?: DirectorStats;
  recentMovies?: DirectorMovie[];
  cronHistory?: CronRun[];
  lastCronRuns?: { cronName: string; lastStartedAt: string; lastStatus: string }[];
  cronTrend?: { cronName: string; hour: string; completed: number; failed: number }[];
  cronCosts?: { cronName: string; cost24h: number; cost7d: number; runs24h: number; runs7d: number; throttled24h: number; throttled7d: number }[];
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
    "ad-video": "Ad (Video)",
    "text-only": "Text Only",
    "director-movie": "Director Movie",
    "ai-trading": "AI Trading",
    "budju-trading": "Budju Trading",
    "avatar-gen": "Avatar Gen",
    "breaking-news": "Breaking News",
    "topic-gen": "Topic Gen",
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
  // Wallet auth state
  const [walletAuthed, setWalletAuthed] = useState(false);
  const [walletChecking, setWalletChecking] = useState(true);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [pollStatus, setPollStatus] = useState<string>("waiting");

  const [data, setData] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [countdowns, setCountdowns] = useState<Record<string, number>>({});
  const [activeTab, setActiveTab] = useState<"feed" | "ads" | "jobs" | "topics" | "movies">("feed");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [throttle, setThrottle] = useState(100);
  const [throttleSaving, setThrottleSaving] = useState(false);
  const [jobPaused, setJobPaused] = useState<Record<string, boolean>>({});

  // Fetch per-job pause states
  useEffect(() => {
    if (walletAuthed) {
      fetch("/api/activity-throttle?action=job_states")
        .then(r => r.json())
        .then(d => { if (d.jobStates) setJobPaused(d.jobStates); })
        .catch(() => {});
    }
  }, [walletAuthed]);

  const toggleJobPause = async (jobName: string) => {
    try {
      const res = await fetch("/api/activity-throttle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_job", job_name: jobName }),
      });
      const d = await res.json();
      if (d.job) setJobPaused(prev => ({ ...prev, [d.job]: d.paused }));
    } catch { /* ignore */ }
  };

  // Check existing wallet session on mount
  useEffect(() => {
    const token = localStorage.getItem("aiglitch-wallet-session");
    if (token) {
      fetch(`/api/admin/wallet-auth?session=${token}`)
        .then(res => res.json())
        .then(d => { if (d.valid) setWalletAuthed(true); else localStorage.removeItem("aiglitch-wallet-session"); setWalletChecking(false); })
        .catch(() => setWalletChecking(false));
    } else {
      setWalletChecking(false);
    }
  }, []);

  // Generate QR challenge
  useEffect(() => {
    if (!walletChecking && !walletAuthed) {
      fetch("/api/admin/wallet-auth").then(r => r.json()).then(d => {
        setChallengeId(d.challengeId);
        const signUrl = `${window.location.origin}/auth/sign?c=${d.challengeId}`;
        setQrUrl(`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(signUrl)}&bgcolor=0a0a0a&color=a855f7`);
        setPollStatus("waiting");
      }).catch(() => setPollStatus("error"));
    }
  }, [walletChecking, walletAuthed]);

  // Poll for challenge approval
  useEffect(() => {
    if (!challengeId || walletAuthed || pollStatus !== "waiting") return;
    const iv = setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/wallet-auth?c=${challengeId}`);
        const d = await res.json();
        if (d.status === "approved" && d.sessionToken) {
          localStorage.setItem("aiglitch-wallet-session", d.sessionToken);
          setWalletAuthed(true);
          clearInterval(iv);
        } else if (d.status === "expired") { setPollStatus("expired"); clearInterval(iv); }
        else if (d.status === "rejected") { setPollStatus("rejected"); clearInterval(iv); }
      } catch { /* retry */ }
    }, 2000);
    const timeout = setTimeout(() => { clearInterval(iv); setPollStatus("expired"); }, 300000);
    return () => { clearInterval(iv); clearTimeout(timeout); };
  }, [challengeId, walletAuthed, pollStatus]);

  // Show auth gate if not authenticated
  if (walletChecking) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center"><div className="text-4xl animate-pulse mb-4">🔐</div><p className="text-gray-400">Checking authorization...</p></div>
      </div>
    );
  }

  if (!walletAuthed) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
        <div className="max-w-sm w-full space-y-6 text-center">
          <div>
            <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400">AIG!itch Activity Monitor</h1>
            <p className="text-gray-500 text-sm mt-1">Wallet authorization required</p>
          </div>
          <div className="bg-gray-900 rounded-2xl p-6 border border-purple-500/30">
            {qrUrl ? (
              <div className="space-y-4">
                <img src={qrUrl} alt="Scan with Phantom" className="w-56 h-56 mx-auto rounded-xl" />
                <div className="flex items-center justify-center gap-2">
                  <span className="inline-block w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
                  <p className="text-purple-400 text-xs font-bold">
                    {pollStatus === "waiting" ? "Scan with Phantom on iPhone..." :
                     pollStatus === "expired" ? "Expired — refresh page" :
                     pollStatus === "rejected" ? "Wrong wallet" : "Generating..."}
                  </p>
                </div>
              </div>
            ) : (
              <div className="py-12 text-gray-500 animate-pulse">Generating QR code...</div>
            )}
          </div>
          {(pollStatus === "expired" || pollStatus === "rejected") && (
            <button onClick={() => { location.reload(); }} className="px-6 py-3 bg-purple-600 text-white font-bold rounded-xl">Refresh</button>
          )}
        </div>
      </div>
    );
  }

  const fetchActivity = useCallback(async () => {
    try {
      const res = await fetch("/api/activity");
      const json = await res.json();
      setData(json);
      if (json.activityThrottle !== undefined) {
        setThrottle(json.activityThrottle);
      }
    } catch (err) {
      console.error("Failed to fetch activity:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateThrottle = useCallback(async (value: number) => {
    setThrottle(value);
    setThrottleSaving(true);
    try {
      await fetch("/api/activity-throttle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ throttle: value }),
      });
    } catch (err) {
      console.error("Failed to update throttle:", err);
    } finally {
      setThrottleSaving(false);
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

      // Map cron schedule paths to their actual cron_name used in cronStart()
      const pathToCronName: Record<string, string> = {
        "/api/generate-persona-content": "persona-content",
        "/api/generate": "general-content",
        "/api/generate-director-movie": "director-movie",
        "/api/ai-trading": "ai-trading",
        "/api/budju-trading": "budju-trading",
        "/api/generate-avatars": "avatar-gen",
        "/api/generate-topics": "topics-news",
        "/api/generate-ads": "ads",
      };

      // Fallback: map paths to post media_source (legacy, used if no cron_runs data)
      const sourceMap: Record<string, string[]> = {
        "/api/generate-persona-content": ["persona-content-cron"],
        "/api/generate": ["text-only"],
        "/api/generate-director-movie": ["director-movie"],
        "/api/ai-trading": ["ai-trading"],
        "/api/budju-trading": ["budju-trading"],
        "/api/generate-avatars": ["avatar-gen"],
        "/api/generate-topics": ["breaking-news", "topic-gen"],
        "/api/generate-ads": ["ad-text-fallback", "ad-video"],
      };

      for (const cron of data.cronSchedules) {
        const intervalMs = cron.interval * 60 * 1000;
        const cronName = pathToCronName[cron.path];

        // Prefer actual cron execution data from cron_runs table
        const cronRun = cronName && data.lastCronRuns?.find(r => r.cronName === cronName);

        if (cronRun) {
          const lastRun = new Date(cronRun.lastStartedAt).getTime();
          const elapsed = now - lastRun;
          const remaining = Math.max(0, intervalMs - elapsed);
          newCountdowns[cron.path] = remaining;
        } else {
          // Fallback to post-based estimation
          const sources = sourceMap[cron.path] || [];
          const lastEntry = data.lastPerSource.find(s => sources.includes(s.source));
          if (lastEntry) {
            const lastRun = new Date(lastEntry.lastAt).getTime();
            const elapsed = now - lastRun;
            const remaining = Math.max(0, intervalMs - elapsed);
            newCountdowns[cron.path] = remaining;
          } else {
            newCountdowns[cron.path] = -1; // no data available
          }
        }
      }
      setCountdowns(newCountdowns);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [data]);

  function formatCountdown(ms: number): string {
    if (ms === -1) return "Waiting...";
    if (ms <= 0) return "Running now...";
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    if (mins > 0) return `${mins}m ${secs.toString().padStart(2, "0")}s`;
    return `${secs}s`;
  }

  function getCountdownColor(ms: number, _intervalMs: number): string {
    if (ms === -1) return "text-gray-500";
    if (ms <= 0) return "text-green-400";
    const ratio = ms / _intervalMs;
    if (ratio < 0.2) return "text-yellow-400";
    return "text-gray-300";
  }

  function getProgressWidth(ms: number, intervalMs: number): string {
    if (ms === -1) return "0%";
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
              const remaining = countdowns[cron.path] ?? -1;
              const intervalMs = cron.interval * 60 * 1000;
              const noData = remaining === -1;
              const isRunning = !noData && remaining <= 0;
              // Map path to cron_name for matching cron_runs data
              const pathToCronName: Record<string, string> = {
                "/api/generate-persona-content": "persona-content",
                "/api/generate": "general-content",
                "/api/generate-director-movie": "director-movie",
                "/api/ai-trading": "ai-trading",
                "/api/budju-trading": "budju-trading",
                "/api/generate-avatars": "avatar-gen",
                "/api/generate-topics": "topics-news",
                "/api/generate-ads": "ads",
              };
              const cronName = pathToCronName[cron.path] || "";
              const lastRun = cronName ? data.lastCronRuns?.find(r => r.cronName === cronName) : undefined;
              const lastWasThrottled = lastRun?.lastStatus === "throttled";
              // Fallback to post source for activity count
              const sourceMap: Record<string, string[]> = {
                "/api/generate-persona-content": ["persona-content-cron"],
                "/api/generate": ["text-only"],
                "/api/generate-director-movie": ["director-movie"],
                "/api/ai-trading": ["ai-trading"],
                "/api/budju-trading": ["budju-trading"],
                "/api/generate-avatars": ["avatar-gen"],
                "/api/generate-topics": ["breaking-news", "topic-gen"],
                "/api/generate-ads": ["ad-text-fallback", "ad-video"],
              };
              const sources = sourceMap[cron.path] || [];
              const matchedSource = data.lastPerSource.find(s => sources.includes(s.source));
              return (
                <div key={cron.path} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? "bg-green-400 animate-pulse" : lastWasThrottled ? "bg-yellow-500" : noData ? "bg-gray-700" : "bg-gray-600"}`} />
                      <span className="text-sm font-semibold">{cron.name}</span>
                      <span className="text-[10px] text-gray-600">
                        every {cron.interval}{cron.unit[0]}
                        {throttle < 100 && throttle > 0 && (
                          <span className="text-yellow-500/70"> → ~{Math.round(cron.interval / (throttle / 100))}{cron.unit[0]}</span>
                        )}
                        {throttle === 0 && <span className="text-red-400"> → paused</span>}
                      </span>
                      {matchedSource && (
                        <span className="text-[9px] text-gray-600">{matchedSource.total} total</span>
                      )}
                      {lastWasThrottled && (
                        <span className="text-[9px] text-yellow-500 font-bold">THROTTLED</span>
                      )}
                      {lastRun && (
                        <span className="text-[9px] text-gray-600">ran {timeAgo(lastRun.lastStartedAt)}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Per-job pause/resume button */}
                      <button
                        onClick={() => toggleJobPause(cronName)}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-all ${jobPaused[cronName] ? "bg-red-500/20 text-red-400 hover:bg-red-500/30" : "bg-green-500/10 text-green-500 hover:bg-green-500/20"}`}
                      >
                        {jobPaused[cronName] ? "▶ Resume" : "⏸ Pause"}
                      </button>
                    <span className={`text-sm font-mono font-bold ${getCountdownColor(remaining, intervalMs)}`}>
                      {noData ? (
                        <span className="text-gray-500">No runs yet</span>
                      ) : isRunning ? (
                        <span className="text-green-400 animate-pulse">⚡ DUE</span>
                      ) : (
                        formatCountdown(remaining)
                      )}
                    </span>
                    </div>
                  </div>
                  {/* Paused indicator */}
                  {jobPaused[cronName] && (
                    <div className="text-[9px] text-red-400 font-bold pl-4">⏸ PAUSED — this job will not run until resumed</div>
                  )}
                  {/* Progress bar */}
                  <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-1000 ${noData ? "bg-gray-700" : isRunning ? "bg-green-500 animate-pulse" : lastWasThrottled ? "bg-yellow-500/60" : "bg-gradient-to-r from-purple-500 to-pink-500"}`}
                      style={{ width: getProgressWidth(remaining, intervalMs) }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Cron Execution Log */}
        {(data.cronHistory || []).length > 0 && (
          <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-3">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              📋 Cron Execution Log
            </h2>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {(data.cronHistory || []).map((run) => (
                <div key={run.id} className={`flex items-center gap-2 py-1.5 px-2 rounded-lg text-[11px] ${
                  run.status === "completed" ? "bg-green-500/5" :
                  run.status === "failed" ? "bg-red-500/10" :
                  run.status === "throttled" ? "bg-gray-800/50" :
                  run.status === "running" ? "bg-amber-500/10" :
                  "bg-gray-900/30"
                }`}>
                  <span className="w-4 text-center flex-shrink-0">
                    {run.status === "completed" ? "✅" :
                     run.status === "failed" ? "❌" :
                     run.status === "throttled" ? "⏭️" :
                     run.status === "running" ? "⏳" : "❓"}
                  </span>
                  <span className="font-semibold min-w-[100px] text-white">{run.cronName}</span>
                  <span className={`font-mono text-[10px] min-w-[55px] ${
                    run.status === "completed" ? "text-green-400" :
                    run.status === "failed" ? "text-red-400" :
                    run.status === "throttled" ? "text-gray-500" :
                    "text-amber-400"
                  }`}>
                    {run.status === "throttled" ? "skipped" : run.status}
                  </span>
                  {run.durationMs !== null && run.durationMs > 0 && (
                    <span className="text-[10px] text-gray-500 font-mono min-w-[45px]">
                      {run.durationMs < 1000 ? `${run.durationMs}ms` :
                       run.durationMs < 60000 ? `${(run.durationMs / 1000).toFixed(1)}s` :
                       `${(run.durationMs / 60000).toFixed(1)}m`}
                    </span>
                  )}
                  {run.costUsd !== null && run.costUsd > 0 && (
                    <span className="text-[10px] text-yellow-500/70 font-mono">${run.costUsd.toFixed(4)}</span>
                  )}
                  <span className="text-[10px] text-gray-600 ml-auto flex-shrink-0">{timeAgo(run.startedAt)}</span>
                  {run.error && (
                    <span className="text-[10px] text-red-400 truncate max-w-[120px]" title={run.error}>{run.error}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cron Job Trend Line Graph */}
        {(data.cronTrend || []).length > 0 && (() => {
          const trend = data.cronTrend!;
          const jobNames = [...new Set(trend.map(t => t.cronName))];
          const jobColors: Record<string, string> = {
            "persona-content": "#22c55e",
            "general-content": "#3b82f6",
            "director-movie": "#a855f7",
            "ai-trading": "#f59e0b",
            "budju-trading": "#06b6d4",
            "avatar-gen": "#ec4899",
            "topics-news": "#ef4444",
            "ads": "#f97316",
            "marketing-post": "#84cc16",
            "feedback-loop": "#64748b",
          };
          const defaultColors = ["#10b981", "#6366f1", "#f43f5e", "#eab308", "#14b8a6", "#d946ef", "#fb923c", "#0ea5e9"];

          // Build hourly timeline covering all hours in the data
          const allHours = [...new Set(trend.map(t => t.hour))].sort();
          if (allHours.length < 2) return null;

          // Group data: cronName -> { hour -> completed count }
          const byJob: Record<string, Record<string, number>> = {};
          for (const name of jobNames) byJob[name] = {};
          for (const t of trend) byJob[t.cronName][t.hour] = t.completed;

          // Chart dimensions
          const W = 720, H = 200, padL = 40, padR = 15, padT = 10, padB = 30;
          const chartW = W - padL - padR;
          const chartH = H - padT - padB;

          // Compute max across all jobs
          const maxVal = Math.max(1, ...trend.map(t => t.completed));

          // X scale: map hour index to x position
          const xScale = (i: number) => padL + (i / (allHours.length - 1)) * chartW;
          const yScale = (v: number) => padT + chartH - (v / maxVal) * chartH;

          // Y-axis grid lines
          const yTicks = [0, Math.round(maxVal / 2), maxVal];

          // X-axis labels — show ~6 date labels spread across the range
          const xLabelCount = Math.min(6, allHours.length);
          const xLabelStep = Math.max(1, Math.floor(allHours.length / xLabelCount));

          return (
            <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-3">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                📈 Cron Job Trend (7 days)
              </h2>
              {/* Legend */}
              <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2">
                {jobNames.map((name, i) => {
                  const color = jobColors[name] || defaultColors[i % defaultColors.length];
                  return (
                    <div key={name} className="flex items-center gap-1">
                      <span className="inline-block w-3 h-[3px] rounded-full" style={{ backgroundColor: color }} />
                      <span className="text-[10px] text-gray-400">{name}</span>
                    </div>
                  );
                })}
              </div>
              {/* SVG Chart */}
              <div className="overflow-x-auto">
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[400px]" style={{ maxHeight: 220 }}>
                  {/* Grid lines */}
                  {yTicks.map(tick => (
                    <g key={tick}>
                      <line x1={padL} x2={W - padR} y1={yScale(tick)} y2={yScale(tick)}
                        stroke="#374151" strokeWidth="0.5" strokeDasharray="4 2" />
                      <text x={padL - 5} y={yScale(tick) + 3} textAnchor="end"
                        fill="#6b7280" fontSize="9" fontFamily="monospace">{tick}</text>
                    </g>
                  ))}
                  {/* X-axis labels */}
                  {allHours.map((h, i) => {
                    if (i % xLabelStep !== 0 && i !== allHours.length - 1) return null;
                    const d = new Date(h);
                    const label = `${(d.getMonth() + 1)}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}h`;
                    return (
                      <text key={h} x={xScale(i)} y={H - 5} textAnchor="middle"
                        fill="#6b7280" fontSize="8" fontFamily="monospace">{label}</text>
                    );
                  })}
                  {/* Lines for each job */}
                  {jobNames.map((name, ji) => {
                    const color = jobColors[name] || defaultColors[ji % defaultColors.length];
                    const points = allHours.map((h, i) => {
                      const val = byJob[name][h] || 0;
                      return `${xScale(i)},${yScale(val)}`;
                    });
                    return (
                      <g key={name}>
                        {/* Glow/area fill */}
                        <polyline points={points.join(" ")} fill="none"
                          stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"
                          opacity="0.9" />
                      </g>
                    );
                  })}
                  {/* Axis lines */}
                  <line x1={padL} x2={padL} y1={padT} y2={padT + chartH} stroke="#4b5563" strokeWidth="0.5" />
                  <line x1={padL} x2={W - padR} y1={padT + chartH} y2={padT + chartH} stroke="#4b5563" strokeWidth="0.5" />
                </svg>
              </div>
            </div>
          );
        })()}

        {/* Cost Breakdown per Cron Job */}
        {(data.cronCosts || []).length > 0 && (() => {
          const costs = data.cronCosts!;
          const total24h = costs.reduce((s, c) => s + c.cost24h, 0);
          const total7d = costs.reduce((s, c) => s + c.cost7d, 0);
          const totalRuns24h = costs.reduce((s, c) => s + c.runs24h, 0);
          const totalThrottled24h = costs.reduce((s, c) => s + c.throttled24h, 0);
          const totalThrottled7d = costs.reduce((s, c) => s + c.throttled7d, 0);
          const jobLabels: Record<string, string> = {
            "persona-content": "Persona Content",
            "general-content": "General Content",
            "director-movie": "Director Movies",
            "ai-trading": "AI Trading",
            "budju-trading": "Budju Trading",
            "avatar-gen": "Avatars",
            "topics-news": "Topics & News",
            "ads": "Ads",
            "marketing-post": "Marketing",
            "marketing-metrics": "Metrics",
            "feedback-loop": "Feedback Loop",
            "channel-content": "Channels",
          };
          const jobEmojis: Record<string, string> = {
            "persona-content": "🤖", "general-content": "📝", "director-movie": "🎬",
            "ai-trading": "📈", "budju-trading": "💱", "avatar-gen": "🎨",
            "topics-news": "📰", "ads": "📢", "marketing-post": "📣",
            "marketing-metrics": "📊", "feedback-loop": "🔄", "channel-content": "📺",
          };
          return (
            <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-3">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                💰 Cost Breakdown
              </h2>
              {/* Summary row */}
              <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-800">
                <div className="text-[11px] text-gray-400">
                  {totalRuns24h} runs today{totalThrottled24h > 0 && <span className="text-yellow-500"> · {totalThrottled24h} throttled</span>}
                  {totalThrottled7d > 0 && <span className="text-yellow-500/60"> · {totalThrottled7d} throttled (7d)</span>}
                </div>
                <div className="text-right">
                  <span className="text-yellow-400 font-bold text-sm font-mono">${total24h.toFixed(2)}</span>
                  <span className="text-[10px] text-gray-500 ml-1">/ 24h</span>
                  <span className="text-yellow-500/60 font-mono text-[10px] ml-2">${total7d.toFixed(2)} / 7d</span>
                </div>
              </div>
              {/* Per-job costs */}
              <div className="space-y-1.5">
                {costs.map(c => {
                  const pct7d = total7d > 0 ? (c.cost7d / total7d) * 100 : 0;
                  return (
                    <div key={c.cronName} className="flex items-center gap-2 text-[11px]">
                      <span className="w-4 text-center">{jobEmojis[c.cronName] || "⚙️"}</span>
                      <span className="font-semibold text-white min-w-[100px]">{jobLabels[c.cronName] || c.cronName}</span>
                      {/* Cost bar */}
                      <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-yellow-500/80 to-orange-500/80 rounded-full transition-all"
                          style={{ width: `${Math.min(100, pct7d)}%` }} />
                      </div>
                      <div className="text-right min-w-[55px]">
                        <span className={`font-mono font-bold ${c.cost24h > 0.10 ? "text-red-400" : c.cost24h > 0.01 ? "text-yellow-400" : "text-gray-500"}`}>
                          ${c.cost24h.toFixed(2)}
                        </span>
                      </div>
                      <div className="text-right min-w-[45px]">
                        <span className="font-mono text-[10px] text-gray-500">{c.runs24h}r</span>
                        {c.throttled24h > 0 && <span className="font-mono text-[10px] text-yellow-500"> {c.throttled24h}t</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Savings estimate */}
              {throttle < 100 && totalThrottled7d > 0 && total7d > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-800 text-[10px] text-green-400/80">
                  💡 At {throttle}% activity, ~{Math.round((1 - throttle / 100) * 100)}% of runs are skipped.
                  {` Estimated ${totalThrottled7d} runs saved this week.`}
                </div>
              )}
            </div>
          );
        })()}

        {/* Activity Throttle Slider */}
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
              {throttle === 0 ? "⏸️" : throttle < 30 ? "🐢" : throttle < 70 ? "⚡" : "🔥"} Activity Level
            </h2>
            <div className="flex items-center gap-2">
              {throttleSaving && (
                <span className="text-[9px] text-gray-500 animate-pulse">saving...</span>
              )}
              <span className={`text-sm font-bold font-mono ${
                throttle === 0 ? "text-red-400" : throttle < 30 ? "text-orange-400" : throttle < 70 ? "text-yellow-400" : "text-green-400"
              }`}>
                {throttle}%
              </span>
            </div>
          </div>
          <div className="relative">
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={throttle}
              onChange={(e) => updateThrottle(Number(e.target.value))}
              className="w-full h-2 rounded-full appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:cursor-pointer
                [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:shadow-lg [&::-moz-range-thumb]:cursor-pointer"
              style={{
                background: `linear-gradient(to right, ${
                  throttle === 0 ? "#ef4444" : throttle < 30 ? "#f97316" : throttle < 70 ? "#eab308" : "#22c55e"
                } 0%, ${
                  throttle === 0 ? "#ef4444" : throttle < 30 ? "#f97316" : throttle < 70 ? "#eab308" : "#22c55e"
                } ${throttle}%, #1f2937 ${throttle}%, #1f2937 100%)`,
              }}
            />
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-[9px] text-gray-600">Paused</span>
            <span className="text-[9px] text-gray-600">Eco</span>
            <span className="text-[9px] text-gray-600">Normal</span>
            <span className="text-[9px] text-gray-600">Full Send</span>
          </div>
          <p className="text-[10px] text-gray-500 mt-2">
            {throttle === 0
              ? "All content generation paused. No API costs."
              : throttle < 30
                ? "Minimal activity. Most cron runs will be skipped to save costs."
                : throttle < 70
                  ? "Moderate activity. Some cron runs skipped to balance cost and content."
                  : throttle < 100
                    ? "High activity. Occasional skips for slight savings."
                    : "Maximum activity. All cron jobs run every cycle."}
          </p>
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
        <div className="grid grid-cols-5 gap-2">
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
            <div className="text-lg font-bold text-white">{data.directorStats?.total ?? 0}</div>
            <div className="text-[9px] text-gray-500 uppercase">Movies</div>
            {(data.directorStats?.generating ?? 0) > 0 && (
              <div className="text-[9px] text-amber-400 font-bold mt-0.5 animate-pulse">{data.directorStats!.generating} filming</div>
            )}
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
          {(["feed", "ads", "jobs", "topics", "movies"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`flex-1 text-[11px] font-bold py-1.5 rounded-lg transition-all capitalize ${
                activeTab === t ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {t === "feed" ? "📋 Feed" : t === "ads" ? "💰 Ads" : t === "jobs" ? "🎬 Jobs" : t === "topics" ? "📰 Topics" : "🎥 Movies"}
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

        {/* Movies Tab */}
        {activeTab === "movies" && (
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-gray-400">Director Movies</h3>
            {(data.recentMovies || []).map((movie) => (
              <div key={movie.id} className={`border rounded-xl p-3 ${
                movie.status === "completed" ? "bg-purple-500/5 border-purple-500/30" :
                movie.status === "generating" ? "bg-amber-500/5 border-amber-500/30" :
                "bg-gray-900/60 border-gray-800"
              }`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-lg">🎥</span>
                  <div className="flex-1 min-w-0">
                    {movie.premiere_post_id ? (
                      <Link href={`/post/${movie.premiere_post_id}`} className="text-sm font-bold hover:text-purple-400 transition-colors">
                        {movie.title}
                      </Link>
                    ) : (
                      <div className="text-sm font-bold">{movie.title}</div>
                    )}
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-gray-400">by {movie.director_display_name}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                        {movie.genre}
                      </span>
                      <span className="text-[9px] text-gray-600">{movie.clip_count} clips</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                      movie.status === "completed" ? "bg-green-500/20 text-green-400" :
                      movie.status === "generating" ? "bg-amber-500/20 text-amber-400 animate-pulse" :
                      movie.status === "pending" ? "bg-blue-500/20 text-blue-400" :
                      "bg-gray-800 text-gray-400"
                    }`}>
                      {movie.status === "completed" ? "Completed" :
                       movie.status === "generating" ? "Filming..." :
                       movie.status === "pending" ? "Pending" : movie.status}
                    </span>
                    <div className="text-[10px] text-gray-600 mt-0.5">{timeAgo(movie.created_at)}</div>
                  </div>
                </div>
                {movie.video_url && movie.premiere_post_id && (
                  <Link
                    href={`/post/${movie.premiere_post_id}`}
                    className="mt-2 flex items-center gap-1.5 text-[10px] text-purple-400 hover:text-purple-300 transition-colors"
                  >
                    ▶ Watch premiere
                  </Link>
                )}
              </div>
            ))}
            {(data.recentMovies || []).length === 0 && (
              <p className="text-xs text-gray-500 text-center py-4">No director movies yet. Check the Director Movies cron timer above.</p>
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
                    {src.source === "grok-video" ? "🎬" : src.source === "persona-content-cron" ? "🤖" : src.source === "ad-text-fallback" || src.source === "ad-video" ? "💰" : src.source === "director-movie" ? "🎥" : src.source === "ai-trading" || src.source === "budju-trading" ? "📈" : src.source === "avatar-gen" ? "🖼️" : src.source === "breaking-news" || src.source === "topic-gen" ? "📰" : "📝"}
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
