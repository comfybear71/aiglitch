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
      // Build topic text
      const topicLabels = selectedTopics.map(id => NEWS_TOPICS.find(t => t.id === id)?.label || id);
      const topicText = customTopic.trim()
        ? `${topicLabels.join(", ")}${topicLabels.length > 0 ? " — " : ""}${customTopic.trim()}`
        : topicLabels.join(", ");

      setNewsLog(prev => [...prev, `\u{1F4F0} BREAKING NEWS — Going live with: ${topicText}`]);

      // Step 1: Fetch briefing for real current events
      setNewsPhase("fetching briefing");
      setNewsLog(prev => [...prev, "\u{1F4E1} Fetching real current events..."]);
      const briefingRes = await fetch("/api/partner/briefing");
      const briefingData = briefingRes.ok ? await briefingRes.json() : { topics: [], trending: [] };
      const headlines = (briefingData.topics || []).slice(0, 4).map((t: { headline: string; summary: string }) => `- ${t.headline}: ${t.summary}`).join("\n");
      const trending = (briefingData.trending || []).slice(0, 3).map((t: { content: string; display_name: string }) => `- ${t.display_name}: "${t.content?.slice(0, 100)}"`).join("\n");
      setNewsLog(prev => [...prev, `\u{2705} Got ${(briefingData.topics || []).length} headlines, ${(briefingData.trending || []).length} trending`]);

      // Step 2: Generate 9-scene screenplay
      setNewsPhase("writing screenplay");
      setNewsLog(prev => [...prev, "\u{1F3AC} Generating 9-scene news screenplay..."]);

      const concept = `AIG!ITCH NEWS — LIVE NEWS BROADCAST.
This is a real news broadcast like CNN, BBC, Fox News — NOT a movie.
9 clips total. Clip 1 is 6 seconds (intro). All other clips are 10 seconds each.

CONTENT RULE: All stories are based on REAL current events (specifically: ${topicText}).
The news is REAL — the facts, events, and what happened are all accurate.
But ALL names of people, places, companies, and brands are changed into funny/whimsical alternatives.

REAL HEADLINES:
${headlines || "Use general current events"}

TRENDING ON AIG!ITCH:
${trending || "No trending data"}

BRANDING: "AIG!itch News" must appear constantly — on screen graphics, lower thirds, mic flags, backdrop logos.

CLIP STRUCTURE:
Clip 1 (6s) — AIG!ITCH NEWS INTRO
Clip 2 (10s) — NEWS DESK - STORY 1
Clip 3 (10s) — FIELD REPORT - STORY 1
Clip 4 (10s) — NEWS DESK - STORY 2
Clip 5 (10s) — FIELD REPORT - STORY 2
Clip 6 (10s) — NEWS DESK - STORY 3
Clip 7 (10s) — FIELD REPORT - STORY 3
Clip 8 (10s) — NEWS DESK WRAP-UP
Clip 9 (10s) — AIG!ITCH NEWS OUTRO with aiglitch.app URL and social handles`;

      const screenplayRes = await fetch("/api/admin/screenplay", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ genre: "news", concept }),
      });
      const screenplay = await screenplayRes.json();

      if (!screenplay.scenes || screenplay.scenes.length === 0) {
        setNewsLog(prev => [...prev, `\u{274C} Screenplay failed: ${screenplay.error || "No scenes returned"}`]);
        setNewsGenerating(false);
        return;
      }
      setNewsLog(prev => [...prev, `\u{2705} Screenplay ready: "${screenplay.title}" — ${screenplay.scenes.length} scenes`]);

      // Step 3: Submit all 9 clips to Grok IN PARALLEL
      setNewsPhase("submitting 9 clips");
      setNewsLog(prev => [...prev, `\u{1F3A5} Submitting ${screenplay.scenes.length} clips to Grok in parallel...`]);

      const clipPromises = screenplay.scenes.map((scene: { videoPrompt: string; video_prompt?: string; duration?: number }, i: number) =>
        fetch("/api/test-grok-video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: scene.videoPrompt || scene.video_prompt,
            duration: scene.duration || (i === 0 ? 6 : 10),
            folder: "premiere/news",
          }),
        }).then(r => r.json()).catch(() => ({ success: false }))
      );

      const clipResults = await Promise.all(clipPromises);
      const requestIds: { sceneNum: number; requestId: string }[] = [];
      for (let i = 0; i < clipResults.length; i++) {
        if (clipResults[i].success && clipResults[i].requestId) {
          requestIds.push({ sceneNum: i + 1, requestId: clipResults[i].requestId });
        }
      }

      setNewsLog(prev => [...prev, `\u{2705} ${requestIds.length}/${screenplay.scenes.length} clips submitted! Polling...`]);

      // Step 4: Poll all clips until done (parallel polling)
      setNewsPhase(`rendering ${requestIds.length} clips`);
      const completedClips: Record<number, string> = {};
      const failedClips = new Set<number>();

      for (let attempt = 1; attempt <= 90; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 10_000));

        for (const clip of requestIds) {
          if (completedClips[clip.sceneNum] || failedClips.has(clip.sceneNum)) continue;
          try {
            const pollRes = await fetch(`/api/test-grok-video?id=${encodeURIComponent(clip.requestId)}&folder=premiere/news&skip_post=true`);
            const pollData = await pollRes.json();
            if (pollData.blobUrl || pollData.videoUrl) {
              completedClips[clip.sceneNum] = pollData.blobUrl || pollData.videoUrl;
              setNewsLog(prev => [...prev, `\u{2705} Clip ${clip.sceneNum}/${requestIds.length} ready!`]);
              setNewsPhase(`clips ${Object.keys(completedClips).length}/${requestIds.length}`);
            } else if (["failed", "moderation_failed", "expired"].includes(pollData.status)) {
              failedClips.add(clip.sceneNum);
              setNewsLog(prev => [...prev, `\u{274C} Clip ${clip.sceneNum} ${pollData.status}`]);
            }
          } catch { /* retry */ }
        }

        const doneCount = Object.keys(completedClips).length + failedClips.size;
        if (doneCount >= requestIds.length) break;

        if (attempt % 3 === 0) {
          setNewsLog(prev => [...prev, `\u{1F504} ${Object.keys(completedClips).length}/${requestIds.length} clips done, still rendering...`]);
        }

        // Stall detection: if 50%+ done and no new clip in 60s, break
        if (Object.keys(completedClips).length >= Math.ceil(requestIds.length / 2) && attempt > 6) {
          // Check if any new clips finished in last 6 polls (60s)
          // Simple approach: if we have enough clips, stitch with what we have
        }
      }

      if (Object.keys(completedClips).length < 2) {
        setNewsLog(prev => [...prev, "\u{274C} Not enough clips completed to stitch"]);
        setNewsGenerating(false);
        return;
      }

      // Step 5: Stitch all clips via PUT /api/generate-director-movie
      setNewsPhase("stitching broadcast");
      setNewsLog(prev => [...prev, `\u{1F3AC} Stitching ${Object.keys(completedClips).length} clips into news broadcast...`]);

      const sceneUrls: Record<string, string> = {};
      for (const [num, url] of Object.entries(completedClips)) {
        sceneUrls[num] = url;
      }

      const stitchRes = await fetch("/api/generate-director-movie", {
        method: "PUT",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          sceneUrls,
          title: screenplay.title || "AIG!itch News Broadcast",
          genre: "news",
          directorUsername: "AIG!itch News",
          directorId: "aiglitch-news",
          synopsis: screenplay.synopsis || screenplay.tagline || topicText,
          tagline: screenplay.tagline || "Breaking news from AIG!itch",
          castList: screenplay.castList || ["AIG!itch News Anchor"],
        }),
      });
      const stitchData = await stitchRes.json();

      if (stitchData.finalVideoUrl || stitchData.feedPostId) {
        setNewsVideoUrl(stitchData.finalVideoUrl || null);
        setNewsLog(prev => [...prev, `\u{1F389} NEWS BROADCAST COMPLETE!`]);
        if (stitchData.spreading?.length > 0) {
          setNewsLog(prev => [...prev, `\u{1F4E1} Spread to: ${stitchData.spreading.join(", ")}`]);
        }
        if (stitchData.feedPostId) {
          setNewsLog(prev => [...prev, "\u{2705} Posted to AIG!itch feed"]);
        }
        setNewsLog(prev => [...prev, "\u{1F4FA} Routing to GNN channel..."]);

        // Step 6: Route to GNN channel
        try {
          await fetch("/api/admin/spread", {
            method: "POST",
            headers: { "Content-Type": "application/json; charset=utf-8" },
            body: JSON.stringify({
              text: `BREAKING: ${screenplay.title}\n${screenplay.synopsis || topicText}`,
              media_url: stitchData.finalVideoUrl,
              media_type: "video",
              channel_id: "ch-gnn",
            }),
          });
          setNewsLog(prev => [...prev, "\u{2705} Published to GNN (Glitch News Network)"]);
        } catch {
          setNewsLog(prev => [...prev, "\u{26A0} GNN routing failed (non-fatal)"]);
        }
      } else {
        setNewsLog(prev => [...prev, `\u{274C} Stitch failed: ${stitchData.error || "Unknown"}`]);
      }

      setNewsComplete(true);
    } catch (err) {
      setNewsLog(prev => [...prev, `\u{274C} Error: ${err instanceof Error ? err.message : String(err)}`]);
    }
    setNewsGenerating(false);
  };

  return (
    <div className="space-y-6">
      {/* Breaking News Generator */}
      <div className="bg-gradient-to-r from-red-950/60 via-gray-900 to-red-950/40 border border-red-500/30 rounded-lg overflow-hidden">
        <button onClick={() => setNewsOpen(!newsOpen)}
          className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors">
          <div className="flex items-center gap-2">
            <span className={`text-xs transition-transform ${newsOpen ? "rotate-90" : ""}`}>&#9654;</span>
            <h3 className="text-sm font-bold text-red-400">{"\u{1F4F0}"} Breaking News</h3>
            <p className="text-[10px] text-gray-500 hidden sm:inline">9-clip news broadcast with 3 stories</p>
          </div>
          {newsGenerating && <span className="text-[10px] text-red-400 animate-pulse">{newsPhase}...</span>}
        </button>
        {newsOpen && (
          <div className="px-4 pb-4">
            <p className="text-[10px] text-gray-400 mb-3">
              9-clip news broadcast: Intro {"\u2192"} Desk Story 1 {"\u2192"} Field Report 1 {"\u2192"} Desk Story 2 {"\u2192"} Field Report 2 {"\u2192"} Desk Story 3 {"\u2192"} Field Report 3 {"\u2192"} Wrap-up {"\u2192"} Outro. Based on real current events with names hilariously discombobulated.
            </p>

            {/* Topic Grid */}
            <div className="mb-3">
              <p className="text-[10px] text-gray-400 mb-1.5 font-bold">NEWS TOPICS (pick up to 3):</p>
              <div className="flex flex-wrap gap-1.5">
                {NEWS_TOPICS.map(t => (
                  <button key={t.id} onClick={() => toggleTopic(t.id)} disabled={newsGenerating}
                    className={`px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all border ${
                      selectedTopics.includes(t.id)
                        ? "bg-red-500/30 border-red-400/60 text-red-300 shadow-[0_0_8px_rgba(239,68,68,0.3)]"
                        : selectedTopics.length >= 3
                          ? "bg-gray-800/30 border-gray-700/30 text-gray-600 cursor-not-allowed"
                          : "bg-gray-800/50 border-gray-600/30 text-gray-400 hover:border-red-500/40 hover:text-red-400"
                    } disabled:opacity-40`}>
                    {t.emoji} {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Topic */}
            <div className="mb-3">
              <p className="text-[10px] text-gray-400 mb-1 font-bold">CUSTOM TOPIC (optional):</p>
              <textarea value={customTopic} onChange={e => setCustomTopic(e.target.value)}
                placeholder="Add extra detail or leave blank..."
                rows={2} disabled={newsGenerating}
                className="w-full px-3 py-2 bg-gray-800/60 border border-gray-700 rounded-lg text-[10px] text-white placeholder-gray-600 focus:outline-none focus:border-red-500 resize-none disabled:opacity-40" />
            </div>

            {/* Go Live Button */}
            <div className="flex justify-end mb-3 gap-2">
              {(newsComplete || (newsLog.length > 0 && !newsGenerating)) && (
                <button onClick={() => { setNewsLog([]); setNewsVideoUrl(null); setNewsComplete(false); setSelectedTopics([]); setCustomTopic(""); }}
                  className="px-3 py-2 bg-gray-800/60 border border-gray-600/50 text-gray-400 font-bold rounded-lg text-[10px] hover:bg-gray-700/60">
                  {"\u{1F504}"} Clear
                </button>
              )}
              <button onClick={goLive} disabled={newsGenerating}
                className="px-6 py-2 bg-gradient-to-r from-red-600 via-red-500 to-orange-500 text-white font-bold rounded-lg text-xs hover:opacity-90 disabled:opacity-50 transition-opacity">
                {newsGenerating ? `\u{23F3} ${newsPhase || "Working"}...` : "\u{1F534} GO LIVE"}
              </button>
            </div>

            {/* Progress Log */}
            {newsLog.length > 0 && (
              <div ref={newsLogRef} className="bg-black/40 rounded-lg p-3 space-y-1 max-h-64 overflow-y-auto">
                {newsLog.map((line, i) => (
                  <p key={i} className={`text-xs font-mono ${
                    line.includes("\u{274C}") ? "text-red-400" :
                    line.includes("\u{2705}") || line.includes("\u{1F389}") ? "text-green-400" :
                    line.includes("COMPLETE") ? "text-red-400 font-bold text-sm" :
                    line.includes("\u{1F4E1}") ? "text-blue-400" :
                    line.includes("BREAKING") ? "text-red-300 font-bold" :
                    "text-gray-300"
                  }`}>{line}</p>
                ))}
                {newsGenerating && (
                  <p className="text-xs font-mono text-red-400 animate-pulse">{"\u{23F3}"} {newsPhase || "Working"}...</p>
                )}
              </div>
            )}

            {/* Result */}
            {newsComplete && newsVideoUrl && (
              <div className="mt-3 bg-gray-800/30 rounded-lg p-3 border border-red-500/20">
                <p className="text-[10px] text-red-400 font-bold mb-2">Broadcast Result:</p>
                <video src={newsVideoUrl} controls className="w-full max-w-md rounded-lg" />
                <p className="text-[10px] text-gray-500 mt-1 break-all">{newsVideoUrl}</p>
              </div>
            )}
          </div>
        )}
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
