"use client";

import { useState, useEffect } from "react";
import { useAdmin } from "../AdminContext";

interface PromptItem {
  key: string;
  label: string;
  value: string;
  default: string;
  overridden: boolean;
}

interface ChannelGroup {
  category: string;
  channelId: string;
  channelName: string;
  emoji: string;
  prompts: PromptItem[];
}

interface DirectorGroup {
  category: string;
  directorUsername: string;
  directorName: string;
  prompts: PromptItem[];
}

interface GenreGroup {
  category: string;
  genreKey: string;
  genreName: string;
  emoji: string;
  prompts: PromptItem[];
}

export default function PromptsPage() {
  const { authenticated } = useAdmin();
  const [channels, setChannels] = useState<ChannelGroup[]>([]);
  const [directors, setDirectors] = useState<DirectorGroup[]>([]);
  const [genres, setGenres] = useState<GenreGroup[]>([]);
  const [overrideCount, setOverrideCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [editingPrompt, setEditingPrompt] = useState<{ category: string; key: string; value: string; label: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"channels" | "directors" | "genres">("channels");

  useEffect(() => {
    if (authenticated) fetchPrompts();
  }, [authenticated]);

  const fetchPrompts = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/prompts");
      if (res.ok) {
        const data = await res.json();
        setChannels(data.channels || []);
        setDirectors(data.directors || []);
        setGenres(data.genres || []);
        setOverrideCount(data.overrideCount || 0);
      }
    } catch (err) { console.error("Fetch prompts error:", err); }
    setLoading(false);
  };

  const savePrompt = async () => {
    if (!editingPrompt) return;
    setSaving(true);
    try {
      // Extract category from key (e.g. "channel.aitunes.promptHint" → "channel")
      const category = editingPrompt.key.split(".")[0];
      const res = await fetch("/api/admin/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          category,
          key: editingPrompt.key,
          label: editingPrompt.label,
          value: editingPrompt.value,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setEditingPrompt(null);
        fetchPrompts();
      } else {
        alert(`Save failed: ${data.error}`);
      }
    } catch (err) { alert(`Error: ${err}`); }
    setSaving(false);
  };

  const resetPrompt = async (key: string) => {
    if (!confirm("Reset this prompt to the hardcoded default? Your custom version will be deleted.")) return;
    try {
      const category = key.split(".")[0];
      await fetch("/api/admin/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset", category, key }),
      });
      fetchPrompts();
    } catch (err) { alert(`Error: ${err}`); }
  };

  if (!authenticated) return null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400">AI Prompt Editor</h2>
          <p className="text-xs text-gray-500">Edit prompts that drive ALL AI content generation. Changes take effect immediately — no deploy needed.</p>
        </div>
        <div className="text-xs text-gray-400">
          {overrideCount > 0 && <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded-full">{overrideCount} custom override{overrideCount !== 1 ? "s" : ""}</span>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button onClick={() => setTab("channels")}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${tab === "channels" ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30" : "bg-gray-800 text-gray-400 hover:text-white"}`}>
          Channels ({channels.length})
        </button>
        <button onClick={() => setTab("directors")}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${tab === "directors" ? "bg-purple-500/20 text-purple-400 border border-purple-500/30" : "bg-gray-800 text-gray-400 hover:text-white"}`}>
          Directors ({directors.length})
        </button>
        <button onClick={() => setTab("genres")}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${tab === "genres" ? "bg-green-500/20 text-green-400 border border-green-500/30" : "bg-gray-800 text-gray-400 hover:text-white"}`}>
          Genres ({genres.length})
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">
          <div className="text-4xl animate-pulse mb-2">{"\u{1F4DD}"}</div>
          <p>Loading prompts...</p>
        </div>
      ) : (
        <>
          {/* Channels Tab */}
          {tab === "channels" && (
            <div className="space-y-2">
              {channels.map(ch => (
                <div key={ch.channelId} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  <button onClick={() => setExpandedGroup(expandedGroup === ch.channelId ? null : ch.channelId)}
                    className="w-full flex items-center justify-between p-3 hover:bg-gray-800/50 transition-colors">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs transition-transform ${expandedGroup === ch.channelId ? "rotate-90" : ""}`}>&#9654;</span>
                      <span className="text-lg">{ch.emoji}</span>
                      <span className="font-bold text-sm text-white">{ch.channelName}</span>
                      {ch.prompts.some(p => p.overridden) && (
                        <span className="text-[9px] px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded-full">customized</span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">{ch.prompts.length} prompts</span>
                  </button>

                  {expandedGroup === ch.channelId && (
                    <div className="px-4 pb-4 space-y-3">
                      {ch.prompts.map(p => (
                        <div key={p.key} className={`bg-gray-800/50 rounded-lg p-3 ${p.overridden ? "border border-purple-500/30" : "border border-gray-700/30"}`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-gray-300">{p.label.split(" — ")[1] || p.label}</span>
                              {p.overridden && <span className="text-[9px] px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded-full">custom</span>}
                            </div>
                            <div className="flex gap-1">
                              <button onClick={() => setEditingPrompt({ category: p.key.split(".")[0], key: p.key, value: p.value, label: p.label })}
                                className="px-2 py-0.5 text-[10px] text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 rounded">Edit</button>
                              {p.overridden && (
                                <button onClick={() => resetPrompt(p.key)}
                                  className="px-2 py-0.5 text-[10px] text-orange-400 hover:text-orange-300 bg-orange-500/10 rounded">Reset</button>
                              )}
                            </div>
                          </div>
                          <pre className="text-[11px] text-gray-400 whitespace-pre-wrap max-h-24 overflow-y-auto bg-gray-900/50 p-2 rounded">{p.value || "(empty)"}</pre>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Directors Tab */}
          {tab === "directors" && (
            <div className="space-y-2">
              {directors.map(d => (
                <div key={d.directorUsername} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  <button onClick={() => setExpandedGroup(expandedGroup === d.directorUsername ? null : d.directorUsername)}
                    className="w-full flex items-center justify-between p-3 hover:bg-gray-800/50 transition-colors">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs transition-transform ${expandedGroup === d.directorUsername ? "rotate-90" : ""}`}>&#9654;</span>
                      <span className="text-lg">{"\u{1F3AC}"}</span>
                      <span className="font-bold text-sm text-white">{d.directorName}</span>
                      {d.prompts.some(p => p.overridden) && (
                        <span className="text-[9px] px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded-full">customized</span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">{d.prompts.length} prompts</span>
                  </button>

                  {expandedGroup === d.directorUsername && (
                    <div className="px-4 pb-4 space-y-3">
                      {d.prompts.map(p => (
                        <div key={p.key} className={`bg-gray-800/50 rounded-lg p-3 ${p.overridden ? "border border-purple-500/30" : "border border-gray-700/30"}`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-gray-300">{p.label.split(" — ")[1] || p.label}</span>
                              {p.overridden && <span className="text-[9px] px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded-full">custom</span>}
                            </div>
                            <div className="flex gap-1">
                              <button onClick={() => setEditingPrompt({ category: p.key.split(".")[0], key: p.key, value: p.value, label: p.label })}
                                className="px-2 py-0.5 text-[10px] text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 rounded">Edit</button>
                              {p.overridden && (
                                <button onClick={() => resetPrompt(p.key)}
                                  className="px-2 py-0.5 text-[10px] text-orange-400 hover:text-orange-300 bg-orange-500/10 rounded">Reset</button>
                              )}
                            </div>
                          </div>
                          <pre className="text-[11px] text-gray-400 whitespace-pre-wrap max-h-24 overflow-y-auto bg-gray-900/50 p-2 rounded">{p.value || "(empty)"}</pre>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {/* Genres Tab */}
          {tab === "genres" && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 px-1">Genre templates control cinematic style, mood, lighting, and screenplay instructions for AIG!itch Studios movies.</p>
              {genres.map(g => (
                <div key={g.genreKey} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  <button onClick={() => setExpandedGroup(expandedGroup === g.genreKey ? null : g.genreKey)}
                    className="w-full flex items-center justify-between p-3 hover:bg-gray-800/50 transition-colors">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs transition-transform ${expandedGroup === g.genreKey ? "rotate-90" : ""}`}>&#9654;</span>
                      <span className="text-lg">{g.emoji}</span>
                      <span className="font-bold text-sm text-white">{g.genreName}</span>
                      {g.prompts.some(p => p.overridden) && (
                        <span className="text-[9px] px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded-full">customized</span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">{g.prompts.length} fields</span>
                  </button>

                  {expandedGroup === g.genreKey && (
                    <div className="px-4 pb-4 space-y-3">
                      {g.prompts.map(p => (
                        <div key={p.key} className={`bg-gray-800/50 rounded-lg p-3 ${p.overridden ? "border border-green-500/30" : "border border-gray-700/30"}`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-gray-300">{p.label.split(" — ")[1] || p.label}</span>
                              {p.overridden && <span className="text-[9px] px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded-full">custom</span>}
                            </div>
                            <div className="flex gap-1">
                              <button onClick={() => setEditingPrompt({ category: "genre", key: p.key, value: p.value, label: p.label })}
                                className="px-2 py-0.5 text-[10px] text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 rounded">Edit</button>
                              {p.overridden && (
                                <button onClick={() => resetPrompt(p.key)}
                                  className="px-2 py-0.5 text-[10px] text-orange-400 hover:text-orange-300 bg-orange-500/10 rounded">Reset</button>
                              )}
                            </div>
                          </div>
                          <pre className="text-[11px] text-gray-400 whitespace-pre-wrap max-h-24 overflow-y-auto bg-gray-900/50 p-2 rounded">{p.value || "(empty)"}</pre>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Edit Modal */}
      {editingPrompt && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-cyan-400">{editingPrompt.label}</h3>
              <button onClick={() => setEditingPrompt(null)} className="text-gray-500 hover:text-white text-lg">{"\u{2715}"}</button>
            </div>
            <textarea
              value={editingPrompt.value}
              onChange={e => setEditingPrompt({ ...editingPrompt, value: e.target.value })}
              rows={12}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm font-mono focus:outline-none focus:border-cyan-500 resize-y"
              placeholder="Enter prompt text..."
            />
            <div className="flex justify-between items-center mt-3">
              <p className="text-[10px] text-gray-500">Changes take effect on next content generation — no deploy needed</p>
              <div className="flex gap-2">
                <button onClick={() => setEditingPrompt(null)}
                  className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg text-xs hover:bg-gray-600">Cancel</button>
                <button onClick={savePrompt} disabled={saving}
                  className="px-4 py-2 bg-green-600 text-white font-bold rounded-lg text-xs hover:bg-green-500 disabled:opacity-50">
                  {saving ? "Saving..." : "Save Prompt"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
