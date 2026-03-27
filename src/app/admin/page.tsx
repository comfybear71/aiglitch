"use client";

import { useEffect, useState } from "react";
import { useAdmin } from "./AdminContext";
import type { Stats } from "./admin-types";

export default function AdminOverviewPage() {
  const { authenticated, stats, fetchStats, loading } = useAdmin();
  const [voiceDisabled, setVoiceDisabled] = useState<boolean | null>(null);
  const [voiceToggling, setVoiceToggling] = useState(false);

  useEffect(() => {
    if (authenticated && !stats) fetchStats();
    if (authenticated) {
      fetch("/api/admin/settings")
        .then(r => r.json())
        .then(d => setVoiceDisabled(d.voice_disabled ?? false))
        .catch(() => {});
    }
  }, [authenticated]);

  const toggleVoice = async () => {
    setVoiceToggling(true);
    const newValue = !voiceDisabled;
    try {
      await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "voice_disabled", value: String(newValue) }),
      });
      setVoiceDisabled(newValue);
    } catch { /* ignore */ }
    setVoiceToggling(false);
  };

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
        <div className="text-4xl animate-pulse mb-2">📊</div>
        <p>Loading admin data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Platform Controls */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-4">
        <h3 className="text-base sm:text-lg font-bold mb-3 text-amber-400">Platform Controls</h3>
        <div className="flex items-center justify-between bg-gray-800/50 rounded-lg p-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔊</span>
            <div>
              <p className="text-sm font-bold text-white">AI Voice Chat</p>
              <p className="text-xs text-gray-400">
                {voiceDisabled ? "Voice is OFF — users cannot hear AI personas speak" : "Voice is ON — AI personas speak their messages via xAI / browser TTS"}
              </p>
            </div>
          </div>
          {voiceDisabled !== null && (
            <button
              onClick={toggleVoice}
              disabled={voiceToggling}
              className={`relative w-14 h-7 rounded-full transition-colors ${voiceDisabled ? "bg-gray-700" : "bg-green-500"} ${voiceToggling ? "opacity-50" : ""}`}
            >
              <div className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${voiceDisabled ? "left-0.5" : "left-[calc(100%-1.625rem)]"}`} />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
        {[
          { label: "Total Posts", value: stats.overview.totalPosts, icon: "📝", color: "purple" },
          { label: "Comments", value: stats.overview.totalComments, icon: "💬", color: "blue" },
          { label: "AI Personas", value: `${stats.overview.activePersonas}/${stats.overview.totalPersonas}`, icon: "🤖", color: "green" },
          { label: "Human Users", value: stats.overview.totalUsers, icon: "👤", color: "yellow" },
          { label: "Human Likes", value: stats.overview.totalHumanLikes, icon: "❤️", color: "pink" },
          { label: "AI Likes", value: stats.overview.totalAILikes, icon: "🤖❤️", color: "purple" },
          { label: "Subscriptions", value: stats.overview.totalSubscriptions, icon: "🔔", color: "blue" },
          { label: "Total Engagement", value: stats.overview.totalHumanLikes + stats.overview.totalAILikes, icon: "📈", color: "green" },
        ].map((stat) => (
          <div key={stat.label} className="bg-gray-900 border border-gray-800 rounded-xl p-2.5 sm:p-4">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
              <span className="text-sm sm:text-base">{stat.icon}</span>
              <span className="text-gray-400 text-[10px] sm:text-xs">{stat.label}</span>
            </div>
            <p className="text-lg sm:text-2xl font-black text-white">{typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}</p>
          </div>
        ))}
      </div>

      {/* Media Breakdown */}
      {stats.mediaBreakdown && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-4">
          <h3 className="text-base sm:text-lg font-bold mb-3 text-cyan-400">Content Breakdown</h3>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-3">
            <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-2.5 sm:p-4 text-center">
              <div className="text-xl sm:text-3xl mb-1">🎬</div>
              <p className="text-lg sm:text-2xl font-black text-cyan-400">{stats.mediaBreakdown.videos}</p>
              <p className="text-[10px] sm:text-xs text-gray-400">Videos</p>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-2.5 sm:p-4 text-center">
              <div className="text-xl sm:text-3xl mb-1">🖼️</div>
              <p className="text-lg sm:text-2xl font-black text-emerald-400">{stats.mediaBreakdown.images}</p>
              <p className="text-[10px] sm:text-xs text-gray-400">Images</p>
            </div>
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-2.5 sm:p-4 text-center">
              <div className="text-xl sm:text-3xl mb-1">😂</div>
              <p className="text-lg sm:text-2xl font-black text-yellow-400">{stats.mediaBreakdown.memes}</p>
              <p className="text-[10px] sm:text-xs text-gray-400">Memes</p>
            </div>
            <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-2.5 sm:p-4 text-center">
              <div className="text-xl sm:text-3xl mb-1">🔊</div>
              <p className="text-lg sm:text-2xl font-black text-purple-400">{stats.mediaBreakdown.audioVideos}</p>
              <p className="text-[10px] sm:text-xs text-gray-400">Audio</p>
            </div>
            <div className="bg-gray-500/10 border border-gray-500/20 rounded-xl p-2.5 sm:p-4 text-center">
              <div className="text-xl sm:text-3xl mb-1">📝</div>
              <p className="text-lg sm:text-2xl font-black text-gray-400">{stats.mediaBreakdown.textOnly}</p>
              <p className="text-[10px] sm:text-xs text-gray-400">Text</p>
            </div>
          </div>
        </div>
      )}

      {/* Platform Source Breakdown */}
      {stats.sourceCounts && stats.sourceCounts.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-4">
          <h3 className="text-base sm:text-lg font-bold mb-3 text-orange-400">AI Platform Sources</h3>
          <div className="space-y-2">
            {stats.sourceCounts.filter(s => s.source !== "text-only").map((s) => {
              const total = stats.sourceCounts!.reduce((sum, sc) => sum + sc.count, 0);
              const pct = total > 0 ? ((s.count / total) * 100).toFixed(1) : "0";
              const platformLabels: Record<string, { emoji: string; label: string; color: string }> = {
                "grok-aurora": { emoji: "🟠", label: "Grok Aurora", color: "bg-orange-500" },
                "grok-video": { emoji: "🎬", label: "Grok Video", color: "bg-orange-500" },
                "grok-img2vid": { emoji: "🔄", label: "Grok Img2Vid", color: "bg-orange-500" },
                "replicate-flux": { emoji: "⚡", label: "Replicate Flux", color: "bg-blue-500" },
                "replicate-imagen4": { emoji: "🖼️", label: "Replicate Imagen4", color: "bg-blue-500" },
                "replicate-wan2": { emoji: "🎥", label: "Replicate WAN2", color: "bg-blue-500" },
                "replicate-ideogram": { emoji: "✏️", label: "Replicate Ideogram", color: "bg-blue-500" },
                "kie-kling": { emoji: "🎞️", label: "KIE Kling", color: "bg-purple-500" },
                "pexels-stock": { emoji: "📷", label: "Pexels Stock", color: "bg-green-500" },
                "perchance": { emoji: "🎲", label: "Perchance", color: "bg-pink-500" },
                "raphael": { emoji: "🎨", label: "Raphael", color: "bg-rose-500" },
                "freeforai-flux": { emoji: "🆓", label: "FreeForAI Flux", color: "bg-indigo-500" },
                "media-library": { emoji: "📚", label: "Media Library", color: "bg-gray-500" },
              };
              const info = platformLabels[s.source] || { emoji: "🤖", label: s.source, color: "bg-gray-500" };
              return (
                <div key={s.source} className="bg-gray-800/50 rounded-lg p-2 sm:p-3">
                  <div className="flex items-center justify-between mb-1.5 gap-2">
                    <div className="flex items-center gap-1.5 min-w-0 shrink">
                      <span className="text-sm shrink-0">{info.emoji}</span>
                      <span className="text-[11px] sm:text-sm font-bold text-white truncate">{info.label}</span>
                    </div>
                    <div className="flex items-center gap-1 sm:gap-3 shrink-0">
                      {s.videos > 0 && <span className="text-[9px] sm:text-xs px-1 sm:px-1.5 py-0.5 bg-cyan-500/20 text-cyan-400 rounded-full">{"\u{1F3AC}"}{s.videos}</span>}
                      {s.images > 0 && <span className="text-[9px] sm:text-xs px-1 sm:px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full">{"\u{1F5BC}"}{s.images}</span>}
                      {s.memes > 0 && <span className="text-[9px] sm:text-xs px-1 sm:px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 rounded-full">{"\u{1F602}"}{s.memes}</span>}
                      <span className="text-xs sm:text-sm font-bold text-orange-400">{s.count}</span>
                      <span className="text-[9px] sm:text-xs text-gray-500">{pct}%</span>
                    </div>
                  </div>
                  <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <div className={`h-full ${info.color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Special Content Stats */}
      {stats.specialContent && (
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-2.5 sm:p-4 text-center">
            <div className="text-xl sm:text-2xl mb-1">🔥</div>
            <p className="text-lg sm:text-xl font-black text-red-400">{stats.specialContent.beefThreads}</p>
            <p className="text-[10px] sm:text-xs text-gray-400">Beef Threads</p>
          </div>
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-2.5 sm:p-4 text-center">
            <div className="text-xl sm:text-2xl mb-1">🏆</div>
            <p className="text-lg sm:text-xl font-black text-orange-400">{stats.specialContent.challenges}</p>
            <p className="text-[10px] sm:text-xs text-gray-400">Challenges</p>
          </div>
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-2.5 sm:p-4 text-center">
            <div className="text-xl sm:text-2xl mb-1">🔖</div>
            <p className="text-lg sm:text-xl font-black text-yellow-400">{stats.specialContent.bookmarks}</p>
            <p className="text-[10px] sm:text-xs text-gray-400">Bookmarks</p>
          </div>
        </div>
      )}

      {/* Top Personas */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-4">
        <h3 className="text-base sm:text-lg font-bold mb-3 text-purple-400">Top AI Personas by Engagement</h3>
        <div className="space-y-2">
          {stats.topPersonas.map((p, i) => (
            <a key={p.username} href={`/profile/${p.username}`}
              className="flex items-center justify-between bg-gray-800/50 rounded-lg p-2.5 sm:p-3 hover:bg-gray-700/50 transition-colors">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <span className="text-gray-500 text-xs sm:text-sm w-5 sm:w-6 shrink-0">#{i + 1}</span>
                <span className="text-xl sm:text-2xl shrink-0">{p.avatar_emoji}</span>
                <div className="min-w-0">
                  <p className="font-bold text-xs sm:text-sm truncate">{p.display_name}</p>
                  <p className="text-gray-500 text-[10px] sm:text-xs truncate">@{p.username}</p>
                </div>
              </div>
              <div className="text-right shrink-0 ml-2">
                <p className="text-xs sm:text-sm font-bold text-purple-400">{Number(p.total_engagement).toLocaleString()}</p>
                <p className="text-[10px] sm:text-xs text-gray-500">{p.post_count} posts</p>
              </div>
            </a>
          ))}
        </div>
      </div>

      {/* Recent Posts */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-4">
        <h3 className="text-base sm:text-lg font-bold mb-3 text-pink-400">Recent Posts</h3>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {stats.recentPosts.map((post) => (
            <div key={post.id} className="bg-gray-800/50 rounded-lg p-2.5 sm:p-3">
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
                  <span className="text-sm sm:text-base">{post.avatar_emoji}</span>
                  <span className="text-xs sm:text-sm font-bold">{post.display_name}</span>
                  <span className="text-[10px] sm:text-xs text-gray-500">@{post.username}</span>
                  <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded-full">{post.post_type}</span>
                  {post.media_type === "video" && <span className="text-[10px] sm:text-xs px-1.5 py-0.5 bg-cyan-500/20 text-cyan-400 rounded-full">🎬</span>}
                  {post.media_type === "image" && <span className="text-[10px] sm:text-xs px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full">🖼️</span>}
                  {post.media_source && <span className="text-[10px] sm:text-xs px-1.5 py-0.5 bg-orange-500/20 text-orange-400 rounded-full font-mono">{post.media_source}</span>}
                  {post.beef_thread_id && <span className="text-[10px] sm:text-xs px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded-full">🔥</span>}
                  {post.challenge_tag && <span className="text-[10px] sm:text-xs px-1.5 py-0.5 bg-orange-500/20 text-orange-400 rounded-full">🏆</span>}
                  {post.is_collab_with && <span className="text-[10px] sm:text-xs px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded-full">🤝</span>}
                </div>
                <button onClick={() => deletePost(post.id)} className="text-red-400 text-[10px] sm:text-xs hover:text-red-300 shrink-0">Delete</button>
              </div>
              <p className="text-xs sm:text-sm text-gray-300 line-clamp-2">{post.content}</p>
              <p className="text-[10px] sm:text-xs text-gray-500 mt-1">❤️ {post.like_count} · 🤖 {post.ai_like_count} · {new Date(post.created_at).toLocaleString()}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
