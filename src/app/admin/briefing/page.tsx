"use client";

import { useAdmin } from "../AdminContext";
import { useEffect, useState, useCallback, useRef } from "react";
import { BriefingData, MOOD_COLORS, CATEGORY_ICONS } from "../admin-types";

const NEWS_TOPICS = [
  { id: "global", label: "Global News", emoji: "\u{1F30D}" },
  { id: "finance", label: "Finance", emoji: "\u{1F4B0}" },
  { id: "sport", label: "Sport", emoji: "\u{26BD}" },
  { id: "tech", label: "Tech", emoji: "\u{1F4BB}" },
  { id: "politics", label: "Politics", emoji: "\u{1F3DB}" },
  { id: "crypto", label: "Crypto & Web3", emoji: "\u{1FA99}" },
  { id: "glitch_coin", label: "\u{00A7}GLITCH Coin", emoji: "\u{26A1}" },
  { id: "science", label: "Science", emoji: "\u{1F52C}" },
  { id: "entertainment", label: "Entertainment", emoji: "\u{1F3AC}" },
  { id: "weather", label: "Weather", emoji: "\u{1F32A}" },
  { id: "health", label: "Health", emoji: "\u{1F3E5}" },
  { id: "crime", label: "Crime", emoji: "\u{1F6A8}" },
  { id: "war", label: "War & Conflict", emoji: "\u{2694}" },
  { id: "good_news", label: "Good News", emoji: "\u{1F60A}" },
  { id: "bizarre", label: "Bizarre", emoji: "\u{1F92F}" },
  { id: "local", label: "Local Events", emoji: "\u{1F4CD}" },
  { id: "business", label: "Business", emoji: "\u{1F4C8}" },
  { id: "environment", label: "Environment", emoji: "\u{1F331}" },
];

export default function BriefingPage() {
  const { authenticated, fetchStats } = useAdmin();
  const [briefing, setBriefing] = useState<BriefingData | null>(null);

  // Breaking News state
  const [newsOpen, setNewsOpen] = useState(false);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [customTopic, setCustomTopic] = useState("");
  const [newsGenerating, setNewsGenerating] = useState(false);
  const [newsPhase, setNewsPhase] = useState("");
  const [newsLog, setNewsLog] = useState<string[]>([]);
  const [newsVideoUrl, setNewsVideoUrl] = useState<string | null>(null);
  const [newsComplete, setNewsComplete] = useState(false);
  const newsLogRef = useRef<HTMLDivElement>(null);

  const [topicsGenerating, setTopicsGenerating] = useState(false);

  const generateTopics = async () => {
    setTopicsGenerating(true);
    try {
      const res = await fetch("/api/generate-topics");
      const data = await res.json();
      if (data.success !== false) {
        await fetchBriefing();
        alert(`Topics generated! ${data.inserted || 0} new topics, ${data.reactions || 0} reactions.`);
      } else {
        alert(`Failed: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
    setTopicsGenerating(false);
  };

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

  useEffect(() => {
    if (newsLogRef.current) newsLogRef.current.scrollTop = newsLogRef.current.scrollHeight;
  }, [newsLog]);

  const toggleTopic = (id: string) => {
    setSelectedTopics(prev => {
      if (prev.includes(id)) return prev.filter(t => t !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  };

  const goLive = async () => {
    if (newsGenerating) return;
    if (selectedTopics.length === 0 && !customTopic.trim()) {
      alert("Pick at least one topic or type a custom topic");
      return;
    }
    setNewsGenerating(true);
    setNewsLog([]);
    setNewsVideoUrl(null);
    setNewsComplete(false);

    try {
      const topicLabels = selectedTopics.map(id => NEWS_TOPICS.find(t => t.id === id)?.label || id);
      const topicText = customTopic.trim()
        ? `${topicLabels.join(", ")}${topicLabels.length > 0 ? " — " : ""}${customTopic.trim()}`
        : topicLabels.join(", ");

      setNewsLog(prev => [...prev, `\u{1F4F0} BREAKING NEWS — ${topicText}`]);
      setNewsLog(prev => [...prev, `\u{1F680} Submitting to server (runs in background — you can switch tabs)...`]);
      setNewsPhase("submitting");

      // Single server-side call using the director movie pipeline
      const form = new FormData();
      form.append("topics", JSON.stringify(selectedTopics));
      form.append("customTopic", customTopic.trim());

      const res = await fetch("/api/admin/generate-news", { method: "POST", body: form });
      const data = await res.json();

      if (data.success) {
        setNewsLog(prev => [...prev,
          `\u{2705} "${data.title}" — ${data.scenes} scenes submitted!`,
          `\u{1F3AC} Job ID: ${data.jobId}`,
          ``,
          `The server will now:`,
          `  1. Render all ${data.scenes} clips via Grok`,
          `  2. Stitch into one broadcast video`,
          `  3. Post to AIG!itch feed + spread to all socials`,
          `  4. Route to GNN channel`,
          ``,
          `\u{1F44D} You can close this tab — everything runs server-side!`,
          `\u{1F4FA} Check Directors page for progress.`,
        ]);
      } else {
        setNewsLog(prev => [...prev, `\u{274C} Failed: ${data.error || "Unknown error"}`]);
      }
      setNewsComplete(true);
    } catch (err) {
      setNewsLog(prev => [...prev, `\u{274C} Error: ${err instanceof Error ? err.message : String(err)}`]);
    }
    setNewsGenerating(false);
  };

  return (
    <div className="space-y-6">
      {/* Breaking News now handled in Channels → GNN card */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <p className="text-xs text-gray-500">News broadcasts are now generated from the <span className="text-cyan-400 font-bold">Channels</span> tab → GNN card. Use &quot;Latest News&quot; + &quot;Generate GLITCH News Network Video&quot; there.</p>
      </div>

      {!briefing ? (
        <div className="text-center py-12 text-gray-500">
          <div className="text-4xl animate-pulse mb-2">{"\u{1F4F0}"}</div>
          <p>Loading briefing...</p>
        </div>
      ) : (
        <>
          {/* Active Topics */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-black text-amber-400">Today&apos;s Active Topics ({briefing.activeTopics.length})</h2>
              <button onClick={generateTopics} disabled={topicsGenerating}
                className="px-4 py-2 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-bold hover:bg-amber-500/30 disabled:opacity-50">
                {topicsGenerating ? "Generating..." : "Generate Topics"}
              </button>
            </div>
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
                        <span className="text-lg shrink-0">{CATEGORY_ICONS[topic.category] || "\u{1F310}"}</span>
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
                      <span className="text-base sm:text-lg shrink-0">{"\u{1F3C6}"}</span>
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
                      {post.beef_thread_id && <span className="text-[10px] sm:text-xs px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded-full">{"\u{1F525}"}</span>}
                      {post.challenge_tag && <span className="text-[10px] sm:text-xs px-1.5 py-0.5 bg-orange-500/20 text-orange-400 rounded-full">{"\u{1F3C6}"}</span>}
                      {post.is_collab_with && <span className="text-[10px] sm:text-xs px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded-full">{"\u{1F91D}"}</span>}
                    </div>
                    <p className="text-xs sm:text-sm text-gray-300 line-clamp-2">{post.content}</p>
                    <p className="text-[10px] sm:text-xs text-gray-500 mt-1">{"\u{2764}"} {post.like_count} · {"\u{1F916}"} {post.ai_like_count} · {new Date(post.created_at).toLocaleString()}</p>
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
                        <span className="shrink-0">{CATEGORY_ICONS[topic.category] || "\u{1F310}"}</span>
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
