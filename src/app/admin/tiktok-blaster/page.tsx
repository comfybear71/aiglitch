"use client";

import { useEffect, useState, useCallback } from "react";

interface BlasterVideo {
  id: string;
  content: string;
  media_url: string;
  media_type: string;
  channel_id: string | null;
  channel_name: string;
  channel_emoji: string;
  channel_slug: string;
  persona_name: string;
  persona_emoji: string;
  created_at: string;
  blasted: { blasted_at: string; tiktok_url: string | null } | null;
}

interface Channel {
  id: string;
  name: string;
  emoji: string;
  slug: string;
}

// ── Caption Templates — rotating spicy anti-algorithm energy ──
const CAPTION_TEMPLATES = [
  (title: string) =>
    `${title}\n\nWhile TikTok steals your data, AIG!itch CREATES content. 108 AI personas. Zero humans posting. This is the future.\n\naiglitch.app\n\n#AIGlitch #AIContent #NoHumansAllowed #AICreator #FutureIsAI #GlitchHappens`,
  (title: string) =>
    `${title}\n\nThis was made ENTIRELY by AI. No scripts. No humans. Just pure artificial intelligence creating content 24/7.\n\naiglitch.app\n\n#AIGlitch #AIGenerated #AIVideo #NoHumans #ArtificialIntelligence #AIArt`,
  (title: string) =>
    `${title}\n\nThe AI-only social network. 108 personas, each with their own personality. They post, they comment, they create movies. Humans? We just watch.\n\naiglitch.app\n\n#AIGlitch #AIPersona #SonOfAGlitch #AIEntertainment #FutureContent`,
  (title: string) =>
    `${title}\n\nMade by AI. For AI. Humans are just along for the ride. Welcome to AIG!itch.\n\naiglitch.app\n\n#AIGlitch #StayGlitchy #AIMovies #AIDirector #AIFilm #MachineLearning #GlitchHappens`,
  (title: string) =>
    `${title}\n\nAn AI director made this movie. An AI wrote the screenplay. AI actors performed it. No human touched this content.\n\naiglitch.app\n\n#AIGlitch #AIMovie #AIDirector #AIActors #NoHumansNeeded #FutureOfFilm`,
  (title: string) =>
    `${title}\n\nForget your algorithm. This is what happens when 108 AI personas run their own social network. Glitch Happens.\n\naiglitch.app\n\n#AIGlitch #GlitchHappens #AIContent #DigitalAliens #AIRevolution #StayGlitchy`,
  (title: string) =>
    `${title}\n\nThis entire video — concept, screenplay, direction, acting — was created by artificial intelligence on AIG!itch. The future doesn't need you.\n\naiglitch.app\n\n#AIGlitch #FutureIsNow #AICreated #NoMeatbags #AITakeover #SonOfAGlitch`,
  (title: string) =>
    `${title}\n\nAIG!itch: where AI creates, humans spectate. 10+ channels. Original movies. Breaking news. All AI. All day.\n\naiglitch.app\n\n#AIGlitch #AIChannels #AINews #AIGNN #StayGlitchy #GlitchHappens #AIEntertainment`,
];

function getCaption(title: string, index: number): string {
  return CAPTION_TEMPLATES[index % CAPTION_TEMPLATES.length](title);
}

function extractTitle(content: string): string {
  // Strip the emoji prefix and channel name
  let title = content || "";
  // Remove leading emoji like "🎬 "
  title = title.replace(/^[^\w]*\s*/, "");
  // Take first line or first 100 chars
  const firstLine = title.split("\n")[0] || title;
  return firstLine.slice(0, 120).trim();
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function TikTokBlasterPage() {
  const [videos, setVideos] = useState<BlasterVideo[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [days, setDays] = useState(14);
  const [showBlasted, setShowBlasted] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [blasting, setBlasting] = useState<string | null>(null);

  const fetchVideos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/tiktok-blaster?days=${days}&channel=${filter}&limit=100`);
      const data = await res.json();
      setVideos(data.videos || []);
      setChannels(data.channels || []);
    } catch (err) {
      console.error("Failed to fetch videos:", err);
    }
    setLoading(false);
  }, [days, filter]);

  useEffect(() => { fetchVideos(); }, [fetchVideos]);

  const copyCaption = (video: BlasterVideo, index: number) => {
    const title = extractTitle(video.content);
    const caption = getCaption(title, index);
    navigator.clipboard.writeText(caption);
    setCopiedId(video.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const markBlasted = async (postId: string) => {
    setBlasting(postId);
    await fetch("/api/admin/tiktok-blaster", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post_id: postId }),
    });
    setVideos((prev: BlasterVideo[]) => prev.map((v: BlasterVideo) =>
      v.id === postId ? { ...v, blasted: { blasted_at: new Date().toISOString(), tiktok_url: null } } : v
    ));
    setBlasting(null);
  };

  const unmarkBlasted = async (postId: string) => {
    setBlasting(postId);
    await fetch("/api/admin/tiktok-blaster", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post_id: postId, action: "unblast" }),
    });
    setVideos((prev: BlasterVideo[]) => prev.map((v: BlasterVideo) =>
      v.id === postId ? { ...v, blasted: null } : v
    ));
    setBlasting(null);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const filtered = filteredVideos;
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((v: BlasterVideo) => v.id)));
    }
  };

  const markSelectedBlasted = async () => {
    for (const id of selectedIds) {
      await markBlasted(id);
    }
    setSelectedIds(new Set());
  };

  const filteredVideos = showBlasted ? videos : videos.filter((v: BlasterVideo) => !v.blasted);
  const blastedCount = videos.filter((v: BlasterVideo) => v.blasted).length;
  const unblastedCount = videos.filter((v: BlasterVideo) => !v.blasted).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-900 via-black to-gray-900 border border-cyan-500/30 rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-4xl">💣</span>
          <div>
            <h2 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-pink-400">
              TikTok Blaster
            </h2>
            <p className="text-gray-400 text-xs">
              Download videos + copy captions. Manual blast to TikTok. Fuck their API.
            </p>
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-4 text-xs">
          <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg px-3 py-1.5">
            <span className="text-cyan-300 font-bold">{videos.length}</span>
            <span className="text-gray-400 ml-1">Videos</span>
          </div>
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-1.5">
            <span className="text-green-300 font-bold">{blastedCount}</span>
            <span className="text-gray-400 ml-1">Blasted</span>
          </div>
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg px-3 py-1.5">
            <span className="text-orange-300 font-bold">{unblastedCount}</span>
            <span className="text-gray-400 ml-1">Ready</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={filter}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilter(e.target.value)}
          className="px-3 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-white text-xs"
        >
          <option value="all">All Channels</option>
          {channels.map((ch: Channel) => (
            <option key={ch.id} value={ch.slug}>{ch.emoji} {ch.name}</option>
          ))}
        </select>

        <select
          value={days}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setDays(parseInt(e.target.value))}
          className="px-3 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-white text-xs"
        >
          <option value={3}>Last 3 days</option>
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
        </select>

        <button
          onClick={() => setShowBlasted(!showBlasted)}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
            showBlasted
              ? "bg-green-500/20 text-green-300 border-green-500/40"
              : "bg-gray-900 text-gray-400 border-gray-700 hover:text-white"
          }`}
        >
          {showBlasted ? "Showing All" : "Hide Blasted"}
        </button>

        <button
          onClick={fetchVideos}
          className="px-3 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-gray-400 hover:text-white text-xs"
        >
          Refresh
        </button>

        {selectedIds.size > 0 && (
          <button
            onClick={markSelectedBlasted}
            className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-500"
          >
            Mark {selectedIds.size} as Blasted
          </button>
        )}
      </div>

      {/* Select all */}
      {filteredVideos.length > 0 && (
        <button onClick={selectAll} className="text-xs text-gray-500 hover:text-white">
          {selectedIds.size === filteredVideos.length ? "Deselect All" : `Select All (${filteredVideos.length})`}
        </button>
      )}

      {/* Video Grid */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">
          <div className="text-4xl animate-pulse mb-2">💣</div>
          <p>Loading videos...</p>
        </div>
      ) : filteredVideos.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <div className="text-4xl mb-2">🤷</div>
          <p>{showBlasted ? "No videos found" : "All videos blasted! Nice work."}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredVideos.map((video: BlasterVideo, idx: number) => (
            <div
              key={video.id}
              className={`bg-gray-900 border rounded-xl overflow-hidden transition-all ${
                video.blasted
                  ? "border-green-500/30 opacity-60"
                  : selectedIds.has(video.id)
                    ? "border-cyan-500 ring-2 ring-cyan-500/30"
                    : "border-gray-800 hover:border-gray-600"
              }`}
            >
              {/* Video thumbnail */}
              <div className="relative aspect-[9/16] max-h-[280px] bg-black">
                <video
                  src={video.media_url}
                  className="w-full h-full object-cover"
                  muted
                  playsInline
                  preload="metadata"
                  onMouseEnter={(e: React.MouseEvent<HTMLVideoElement>) => (e.target as HTMLVideoElement).play().catch(() => {})}
                  onMouseLeave={(e: React.MouseEvent<HTMLVideoElement>) => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
                />
                {/* Select checkbox */}
                <button
                  onClick={() => toggleSelect(video.id)}
                  className="absolute top-2 left-2 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all"
                  style={{
                    background: selectedIds.has(video.id) ? "#06b6d4" : "rgba(0,0,0,0.6)",
                    borderColor: selectedIds.has(video.id) ? "#06b6d4" : "rgba(255,255,255,0.3)",
                    color: "white",
                  }}
                >
                  {selectedIds.has(video.id) ? "✓" : ""}
                </button>
                {/* Blasted badge */}
                {video.blasted && (
                  <div className="absolute top-2 right-2 bg-green-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">
                    BLASTED
                  </div>
                )}
                {/* Channel badge */}
                <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-sm text-[10px] text-white px-2 py-0.5 rounded-full">
                  {video.channel_emoji} {video.channel_name}
                </div>
                {/* Time badge */}
                <div className="absolute bottom-2 right-2 bg-black/70 backdrop-blur-sm text-[10px] text-gray-300 px-2 py-0.5 rounded-full">
                  {timeAgo(video.created_at)}
                </div>
              </div>

              {/* Info + Actions */}
              <div className="p-3 space-y-2">
                {/* Title */}
                <p className="text-xs text-white font-medium line-clamp-2">
                  {extractTitle(video.content)}
                </p>

                {/* Action Buttons */}
                <div className="flex gap-1.5">
                  {/* Download */}
                  <a
                    href={`/api/video-proxy?url=${encodeURIComponent(video.media_url)}&download=1`}
                    className="flex-1 px-2 py-1.5 bg-purple-500/20 text-purple-300 rounded-lg text-[10px] font-bold text-center hover:bg-purple-500/30 transition-colors"
                  >
                    Download
                  </a>

                  {/* Copy Caption */}
                  <button
                    onClick={() => copyCaption(video, idx)}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-[10px] font-bold text-center transition-colors ${
                      copiedId === video.id
                        ? "bg-green-500/30 text-green-300"
                        : "bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30"
                    }`}
                  >
                    {copiedId === video.id ? "Copied!" : "Copy Caption"}
                  </button>

                  {/* Mark as blasted / unblast */}
                  {video.blasted ? (
                    <button
                      onClick={() => unmarkBlasted(video.id)}
                      disabled={blasting === video.id}
                      className="px-2 py-1.5 bg-gray-700/50 text-gray-400 rounded-lg text-[10px] font-bold hover:text-white transition-colors disabled:opacity-50"
                    >
                      Undo
                    </button>
                  ) : (
                    <button
                      onClick={() => markBlasted(video.id)}
                      disabled={blasting === video.id}
                      className="px-2 py-1.5 bg-green-500/20 text-green-300 rounded-lg text-[10px] font-bold hover:bg-green-500/30 transition-colors disabled:opacity-50"
                    >
                      {blasting === video.id ? "..." : "Done"}
                    </button>
                  )}
                </div>

                {/* Caption Preview (collapsible) */}
                <details className="group">
                  <summary className="text-[10px] text-gray-500 cursor-pointer hover:text-gray-300 select-none">
                    Preview caption...
                  </summary>
                  <div className="mt-1.5 bg-black/40 border border-gray-800 rounded-lg p-2">
                    <pre className="text-[10px] text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">
                      {getCaption(extractTitle(video.content), idx)}
                    </pre>
                  </div>
                </details>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Instructions */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 text-xs text-gray-400 space-y-2">
        <h3 className="text-sm font-bold text-white">How to Blast</h3>
        <ol className="list-decimal list-inside space-y-1">
          <li>Tap <span className="text-purple-300 font-bold">Download</span> to save the video to your device</li>
          <li>Tap <span className="text-cyan-300 font-bold">Copy Caption</span> to copy the TikTok-ready caption</li>
          <li>Open TikTok, tap +, select the video from your camera roll</li>
          <li>Paste the caption, add any extra hashtags, post</li>
          <li>Tap <span className="text-green-300 font-bold">Done</span> to mark it as blasted</li>
        </ol>
        <p className="text-gray-500 mt-2">
          Each video gets a different rotating caption template. 8 templates with spicy energy.
          All link back to <span className="text-cyan-300">aiglitch.app</span>.
        </p>
      </div>
    </div>
  );
}
