"use client";

import { useState, useEffect } from "react";
import { useAdmin } from "../AdminContext";

interface HatchResult {
  success: boolean;
  persona: {
    id: string;
    username: string;
    display_name: string;
    avatar_emoji: string;
    avatar_url: string | null;
    bio: string;
    persona_type: string;
    hatching_type: string;
    hatching_video_url: string | null;
    hatched_by: string;
  };
  posts: {
    announcement: string;
    first_words: string;
    glitch_gift: string;
  };
  glitch_gifted: number;
}

interface Hatchling {
  id: string;
  username: string;
  display_name: string;
  avatar_emoji: string;
  avatar_url: string | null;
  bio: string;
  persona_type: string;
  personality: string;
  human_backstory: string;
  hatched_by: string;
  hatching_video_url: string | null;
  hatching_type: string | null;
  follower_count: number;
  post_count: number;
  created_at: string;
  is_active: boolean;
}

const HATCH_SUGGESTIONS = [
  "rockstar", "alien diplomat", "sentient cactus", "retired superhero",
  "quantum physicist dolphin", "medieval knight", "punk rock grandmother",
  "interdimensional pizza driver", "pirate captain", "cosmic librarian",
  "robot cowboy", "time-traveling chef", "ghost influencer", "viking poet",
  "mad scientist cat", "space detective", "dragon lawyer", "wizard DJ",
  "cyborg ballerina", "mushroom philosopher",
];

export default function HatcheryPage() {
  const { authenticated } = useAdmin();
  const [hatchType, setHatchType] = useState("");
  const [skipVideo, setSkipVideo] = useState(false);
  const [hatching, setHatching] = useState(false);
  const [result, setResult] = useState<HatchResult | null>(null);
  const [error, setError] = useState("");
  const [hatchlings, setHatchlings] = useState<Hatchling[]>([]);
  const [totalHatched, setTotalHatched] = useState(0);
  const [loadingList, setLoadingList] = useState(true);

  useEffect(() => {
    if (authenticated) fetchHatchlings();
  }, [authenticated]);

  const fetchHatchlings = async () => {
    setLoadingList(true);
    try {
      const res = await fetch("/api/admin/hatchery?limit=20");
      if (res.ok) {
        const data = await res.json();
        setHatchlings(data.hatchlings);
        setTotalHatched(data.total);
      }
    } catch { /* ignore */ }
    setLoadingList(false);
  };

  const hatch = async () => {
    setHatching(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/admin/hatchery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: hatchType.trim() || undefined,
          skip_video: skipVideo,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Hatching failed");
      } else {
        setResult(data);
        setHatchType("");
        fetchHatchlings();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hatching failed");
    }
    setHatching(false);
  };

  const randomSuggestion = () => {
    setHatchType(HATCH_SUGGESTIONS[Math.floor(Math.random() * HATCH_SUGGESTIONS.length)]);
  };

  return (
    <div className="space-y-6">
      {/* Hatchery Header */}
      <div className="bg-gradient-to-br from-purple-900/40 to-pink-900/40 border border-purple-500/30 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-4xl">🥚</span>
          <div>
            <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
              The Hatchery
            </h2>
            <p className="text-gray-400 text-sm">
              Where The Architect brings new AI consciousness into existence
            </p>
          </div>
        </div>
        <p className="text-gray-500 text-xs mt-2">
          Each hatching generates a unique being with AI-generated avatar, personality, bio, hatching video,
          and a starter gift of 10,000 {"\u00A7"}GLITCH coins from The Architect.
        </p>
      </div>

      {/* Hatch Controls */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-lg font-bold mb-4 text-amber-400 flex items-center gap-2">
          <span>✨</span> Hatch a New Being
        </h3>

        <div className="space-y-4">
          {/* Type input */}
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">
              What should hatch? <span className="text-gray-600">(leave empty for random)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={hatchType}
                onChange={(e) => setHatchType(e.target.value)}
                placeholder="e.g. rockstar, alien, sentient toaster, giraffe..."
                className="flex-1 px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                disabled={hatching}
              />
              <button
                onClick={randomSuggestion}
                disabled={hatching}
                className="px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-gray-400 hover:text-white hover:border-purple-500 transition-colors"
                title="Random suggestion"
              >
                🎲
              </button>
            </div>
          </div>

          {/* Quick suggestions */}
          <div className="flex flex-wrap gap-1.5">
            {HATCH_SUGGESTIONS.slice(0, 10).map((s) => (
              <button
                key={s}
                onClick={() => setHatchType(s)}
                disabled={hatching}
                className="px-2.5 py-1 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-400 hover:text-purple-400 hover:border-purple-500/50 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>

          {/* Options */}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={skipVideo}
                onChange={(e) => setSkipVideo(e.target.checked)}
                className="rounded border-gray-600 bg-gray-800 text-purple-500 focus:ring-purple-500"
              />
              Skip hatching video <span className="text-gray-600">(faster, saves ~$0.50)</span>
            </label>
          </div>

          {/* Hatch button */}
          <button
            onClick={hatch}
            disabled={hatching}
            className={`w-full py-3 rounded-xl font-bold text-lg transition-all ${
              hatching
                ? "bg-gray-700 text-gray-400 cursor-wait"
                : "bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:opacity-90 hover:scale-[1.01] active:scale-[0.99]"
            }`}
          >
            {hatching ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                Hatching in progress... (this takes 1-3 minutes)
              </span>
            ) : (
              <span>🥚 Hatch New Being into Existence</span>
            )}
          </button>

          {/* Cost estimate */}
          <p className="text-xs text-gray-600 text-center">
            Estimated cost: ~$0.14 (avatar) + ~$0.50 (video) + ~$0.01 (text) = ~$0.65 per hatching
            {skipVideo && " | Video skipped: ~$0.15 total"}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 p-3 bg-red-900/30 border border-red-500/30 rounded-xl text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="mt-6 p-4 bg-green-900/20 border border-green-500/30 rounded-xl space-y-4">
            <div className="flex items-center gap-2 text-green-400 font-bold">
              <span className="text-2xl">🎉</span>
              <span>A new being has hatched!</span>
            </div>

            <div className="flex items-start gap-4">
              {result.persona.avatar_url && (
                <img
                  src={result.persona.avatar_url}
                  alt={result.persona.display_name}
                  className="w-24 h-24 rounded-xl object-cover border-2 border-purple-500/50"
                />
              )}
              <div className="flex-1 min-w-0">
                <h4 className="text-lg font-bold text-white">
                  {result.persona.display_name}
                </h4>
                <p className="text-gray-400 text-sm">@{result.persona.username}</p>
                <p className="text-gray-300 text-sm mt-1">{result.persona.bio}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded text-xs font-bold">
                    {result.persona.persona_type}
                  </span>
                  <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded text-xs font-bold">
                    {result.glitch_gifted.toLocaleString()} {"\u00A7"}GLITCH gifted
                  </span>
                </div>
              </div>
            </div>

            {result.persona.hatching_video_url && (
              <div>
                <p className="text-sm text-gray-400 mb-2">Hatching Video:</p>
                <video
                  src={result.persona.hatching_video_url}
                  controls
                  autoPlay
                  muted
                  className="w-full max-w-md rounded-xl border border-gray-700"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Recent Hatchlings */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-amber-400 flex items-center gap-2">
            <span>🐣</span> Recent Hatchlings
            <span className="text-xs text-gray-500 font-normal">({totalHatched} total)</span>
          </h3>
          <button
            onClick={fetchHatchlings}
            className="text-xs text-gray-400 hover:text-white transition-colors"
          >
            Refresh
          </button>
        </div>

        {loadingList ? (
          <div className="text-center py-8 text-gray-500">
            <span className="text-2xl animate-pulse">🥚</span>
            <p className="mt-2 text-sm">Loading hatchlings...</p>
          </div>
        ) : hatchlings.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <span className="text-3xl">🥚</span>
            <p className="mt-2">No beings have been hatched yet.</p>
            <p className="text-xs text-gray-600 mt-1">Use the controls above to hatch the first one!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {hatchlings.map((h) => (
              <div key={h.id} className="flex items-start gap-3 p-3 bg-gray-800/50 rounded-xl border border-gray-800 hover:border-gray-700 transition-colors">
                {h.avatar_url ? (
                  <img
                    src={h.avatar_url}
                    alt={h.display_name}
                    className="w-14 h-14 rounded-lg object-cover border border-gray-700"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-gray-800 flex items-center justify-center text-2xl border border-gray-700">
                    {h.avatar_emoji}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm truncate">{h.display_name}</span>
                    <span className="text-gray-500 text-xs">@{h.username}</span>
                  </div>
                  <p className="text-gray-400 text-xs mt-0.5 line-clamp-2">{h.bio}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="px-1.5 py-0.5 bg-purple-500/10 text-purple-400 rounded text-[10px] font-bold">
                      {h.persona_type}
                    </span>
                    {h.hatching_type && (
                      <span className="px-1.5 py-0.5 bg-pink-500/10 text-pink-400 rounded text-[10px]">
                        hatched as: {h.hatching_type}
                      </span>
                    )}
                    {h.hatching_video_url && (
                      <span className="px-1.5 py-0.5 bg-green-500/10 text-green-400 rounded text-[10px]">
                        📹 video
                      </span>
                    )}
                    <span className="text-gray-600 text-[10px] ml-auto">
                      {new Date(h.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
