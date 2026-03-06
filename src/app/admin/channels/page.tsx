"use client";

import { useEffect, useState, useCallback } from "react";
import { useAdmin } from "../AdminContext";
import type { AdminChannel, Persona } from "../admin-types";

interface PromoJob {
  channelId: string;
  channelSlug: string;
  status: "generating" | "polling" | "stitching" | "done" | "error";
  message?: string;
  blobUrl?: string;
  clips?: { scene: number; requestId: string | null; blobUrl?: string; done?: boolean }[];
}

export default function AdminChannelsPage() {
  const { authenticated, personas, fetchPersonas } = useAdmin();
  const [channels, setChannels] = useState<AdminChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingChannel, setEditingChannel] = useState<AdminChannel | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [promoJobs, setPromoJobs] = useState<Record<string, PromoJob>>({});

  const fetchChannels = useCallback(async () => {
    const res = await fetch("/api/admin/channels");
    if (res.ok) {
      const data = await res.json();
      setChannels(data.channels || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authenticated) {
      fetchChannels();
      if (!personas.length) fetchPersonas();
    }
  }, [authenticated, fetchChannels, fetchPersonas, personas.length]);

  const toggleActive = async (channel: AdminChannel) => {
    await fetch("/api/admin/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: channel.id,
        slug: channel.slug,
        name: channel.name,
        description: channel.description,
        emoji: channel.emoji,
        is_active: !channel.is_active,
        sort_order: channel.sort_order,
      }),
    });
    fetchChannels();
  };

  const generatePromo = async (channel: AdminChannel) => {
    setPromoJobs(prev => ({
      ...prev,
      [channel.id]: { channelId: channel.id, channelSlug: channel.slug, status: "generating", message: "Submitting 3 clips..." },
    }));

    try {
      const res = await fetch("/api/admin/channels/generate-promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: channel.id, channel_slug: channel.slug }),
      });
      const data = await res.json();

      if (!data.success) {
        setPromoJobs(prev => ({
          ...prev,
          [channel.id]: { ...prev[channel.id], status: "error", message: data.error || "Submit failed" },
        }));
        return;
      }

      // Extract clip requestIds
      const clips = (data.clips || []).map((c: { scene: number; requestId: string | null }) => ({
        scene: c.scene,
        requestId: c.requestId,
        done: false,
      }));

      setPromoJobs(prev => ({
        ...prev,
        [channel.id]: {
          ...prev[channel.id],
          status: "polling",
          clips,
          message: `Generating 3 clips (0/3 done)...`,
        },
      }));

      // Poll all clips
      pollAllClips(channel.id, channel.slug, clips);
    } catch {
      setPromoJobs(prev => ({
        ...prev,
        [channel.id]: { ...prev[channel.id], status: "error", message: "Network error" },
      }));
    }
  };

  const pollAllClips = async (
    channelId: string,
    channelSlug: string,
    clips: { scene: number; requestId: string | null; blobUrl?: string; done?: boolean }[],
    attempt = 0,
  ) => {
    if (attempt > 90) {
      setPromoJobs(prev => ({
        ...prev,
        [channelId]: { ...prev[channelId], status: "error", message: "Timed out after 15 minutes" },
      }));
      return;
    }

    await new Promise(r => setTimeout(r, 10000));

    const updated = [...clips];
    let allDone = true;

    for (let i = 0; i < updated.length; i++) {
      if (updated[i].done || !updated[i].requestId) continue;

      try {
        const res = await fetch(`/api/admin/channels/generate-promo?id=${updated[i].requestId}`);
        const data = await res.json();

        if (data.phase === "done" && data.success) {
          updated[i] = { ...updated[i], done: true, blobUrl: data.blobUrl };
        } else if (data.phase === "done" && !data.success) {
          updated[i] = { ...updated[i], done: true }; // Failed but done
        } else {
          allDone = false;
        }
      } catch {
        allDone = false;
      }
    }

    const doneCount = updated.filter(c => c.done).length;

    setPromoJobs(prev => ({
      ...prev,
      [channelId]: {
        ...prev[channelId],
        clips: updated,
        message: `Generating 3 clips (${doneCount}/3 done)...`,
      },
    }));

    if (allDone) {
      // All clips done — stitch them
      const clipUrls = updated.filter(c => c.blobUrl).map(c => c.blobUrl as string);
      if (clipUrls.length === 0) {
        setPromoJobs(prev => ({
          ...prev,
          [channelId]: { ...prev[channelId], status: "error", message: "All clips failed" },
        }));
        return;
      }

      setPromoJobs(prev => ({
        ...prev,
        [channelId]: { ...prev[channelId], status: "stitching", message: `Stitching ${clipUrls.length} clips...` },
      }));

      try {
        const stitchRes = await fetch("/api/admin/channels/generate-promo", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel_id: channelId, channel_slug: channelSlug, clip_urls: clipUrls }),
        });
        const stitchData = await stitchRes.json();

        if (stitchData.success) {
          setPromoJobs(prev => ({
            ...prev,
            [channelId]: {
              ...prev[channelId],
              status: "done",
              blobUrl: stitchData.blobUrl,
              message: `${stitchData.duration} promo ready!`,
            },
          }));
          fetchChannels();
        } else {
          setPromoJobs(prev => ({
            ...prev,
            [channelId]: { ...prev[channelId], status: "error", message: "Stitch failed" },
          }));
        }
      } catch {
        setPromoJobs(prev => ({
          ...prev,
          [channelId]: { ...prev[channelId], status: "error", message: "Stitch network error" },
        }));
      }
      return;
    }

    // Keep polling
    pollAllClips(channelId, channelSlug, updated, attempt + 1);
  };

  const deleteChannel = async (id: string) => {
    if (!confirm("Delete this channel? Posts will be unlinked.")) return;
    await fetch("/api/admin/channels", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchChannels();
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500">
        <div className="text-4xl animate-pulse mb-2">📺</div>
        <p>Loading channels...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-cyan-400">AIG!itch TV — Channels</h2>
          <p className="text-xs text-gray-500">{channels.length} channels configured</p>
        </div>
        <div className="flex gap-2">
          <a href="/channels" target="_blank" className="px-3 py-1.5 bg-gray-800 text-gray-300 rounded-lg text-xs font-bold hover:bg-gray-700">
            View Live
          </a>
          <button
            onClick={() => { setEditingChannel(null); setShowCreate(true); }}
            className="px-3 py-1.5 bg-cyan-500/20 text-cyan-400 rounded-lg text-xs font-bold hover:bg-cyan-500/30"
          >
            + New Channel
          </button>
        </div>
      </div>

      {/* Channel List */}
      <div className="space-y-3">
        {channels.map(channel => (
          <div key={channel.id} className={`bg-gray-900 border rounded-xl p-4 ${channel.is_active ? "border-gray-800" : "border-red-900/30 opacity-60"}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="text-2xl flex-shrink-0">{channel.emoji}</div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-sm text-white">{channel.name}</h3>
                    <span className="text-[10px] px-1.5 py-0.5 bg-gray-800 rounded-full text-gray-400 font-mono">/{channel.slug}</span>
                    {!channel.is_active && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded-full">Inactive</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{channel.description}</p>

                  {/* Stats */}
                  <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-500">
                    <span>{channel.subscriber_count} subs</span>
                    <span>{channel.actual_post_count} posts</span>
                    <span>{channel.persona_count} personas</span>
                    {channel.schedule?.postsPerDay && (
                      <span className="text-cyan-400/60">{channel.schedule.postsPerDay}/day target</span>
                    )}
                  </div>

                  {/* Assigned personas */}
                  {channel.personas.length > 0 && (
                    <div className="flex items-center gap-1 mt-2 flex-wrap">
                      {channel.personas.map(p => (
                        <span
                          key={p.persona_id}
                          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] ${
                            p.role === "host" ? "bg-cyan-500/20 text-cyan-300" : "bg-gray-800 text-gray-400"
                          }`}
                        >
                          {p.avatar_emoji} {p.username}
                          {p.role === "host" && <span className="text-cyan-500">*</span>}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { setEditingChannel(channel); setShowCreate(true); }}
                    className="px-2 py-1 text-xs text-gray-400 hover:text-white transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => toggleActive(channel)}
                    className={`px-2 py-1 text-xs transition-colors ${channel.is_active ? "text-yellow-400 hover:text-yellow-300" : "text-green-400 hover:text-green-300"}`}
                  >
                    {channel.is_active ? "Disable" : "Enable"}
                  </button>
                  <button
                    onClick={() => deleteChannel(channel.id)}
                    className="px-2 py-1 text-xs text-red-400 hover:text-red-300 transition-colors"
                  >
                    Delete
                  </button>
                </div>

                {/* Generate Promo Video */}
                {(() => {
                  const job = promoJobs[channel.id];
                  if (job?.status === "generating" || job?.status === "polling" || job?.status === "stitching") {
                    const doneClips = job.clips?.filter(c => c.done).length || 0;
                    const totalClips = job.clips?.length || 3;
                    return (
                      <div className="flex items-center gap-1.5 px-2 py-1">
                        <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                        <div className="text-[10px] text-cyan-400">
                          <div>{job.message || "Generating..."}</div>
                          {job.status === "polling" && (
                            <div className="flex gap-0.5 mt-0.5">
                              {Array.from({ length: totalClips }).map((_, i) => (
                                <div
                                  key={i}
                                  className={`w-4 h-1 rounded-full ${
                                    i < doneClips ? "bg-green-400" : "bg-gray-600 animate-pulse"
                                  }`}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }
                  if (job?.status === "done") {
                    return (
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-green-400 px-1">✓ {job.message || "Promo ready"}</span>
                        <button
                          onClick={() => generatePromo(channel)}
                          className="text-[10px] text-gray-500 hover:text-gray-300 px-1"
                        >
                          Regen
                        </button>
                      </div>
                    );
                  }
                  if (job?.status === "error") {
                    return (
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-red-400 px-1">{job.message}</span>
                        <button
                          onClick={() => generatePromo(channel)}
                          className="text-[10px] text-cyan-400 hover:text-cyan-300 px-1"
                        >
                          Retry
                        </button>
                      </div>
                    );
                  }
                  return (
                    <button
                      onClick={() => generatePromo(channel)}
                      className="px-2.5 py-1 text-[10px] font-bold bg-purple-500/20 text-purple-300 rounded-full hover:bg-purple-500/30 transition-colors"
                    >
                      🎬 Generate 30s Promo
                    </button>
                  );
                })()}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create/Edit Modal */}
      {showCreate && (
        <ChannelEditor
          channel={editingChannel}
          personas={personas}
          onClose={() => { setShowCreate(false); setEditingChannel(null); }}
          onSave={() => { setShowCreate(false); setEditingChannel(null); fetchChannels(); }}
        />
      )}
    </div>
  );
}

function ChannelEditor({
  channel,
  personas,
  onClose,
  onSave,
}: {
  channel: AdminChannel | null;
  personas: Persona[];
  onClose: () => void;
  onSave: () => void;
}) {
  const [slug, setSlug] = useState(channel?.slug || "");
  const [name, setName] = useState(channel?.name || "");
  const [description, setDescription] = useState(channel?.description || "");
  const [emoji, setEmoji] = useState(channel?.emoji || "📺");
  const [tone, setTone] = useState(channel?.content_rules?.tone || "");
  const [topics, setTopics] = useState((channel?.content_rules?.topics || []).join(", "));
  const [promptHint, setPromptHint] = useState(channel?.content_rules?.promptHint || "");
  const [postsPerDay, setPostsPerDay] = useState(channel?.schedule?.postsPerDay || 6);
  const [selectedPersonas, setSelectedPersonas] = useState<string[]>(
    channel?.personas.map(p => p.persona_id) || []
  );
  const [hostIds, setHostIds] = useState<string[]>(
    channel?.personas.filter(p => p.role === "host").map(p => p.persona_id) || []
  );
  const [saving, setSaving] = useState(false);
  const [personaSearch, setPersonaSearch] = useState("");

  const filteredPersonas = personas.filter(p =>
    personaSearch === "" ||
    p.username.toLowerCase().includes(personaSearch.toLowerCase()) ||
    p.display_name.toLowerCase().includes(personaSearch.toLowerCase()) ||
    p.persona_type.toLowerCase().includes(personaSearch.toLowerCase())
  );

  const handleSave = async () => {
    setSaving(true);
    const contentRules = {
      tone,
      topics: topics.split(",").map(t => t.trim()).filter(Boolean),
      promptHint,
    };
    const schedule = { postsPerDay };

    await fetch("/api/admin/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: channel?.id,
        slug,
        name,
        description,
        emoji,
        content_rules: contentRules,
        schedule,
        is_active: true,
        sort_order: channel?.sort_order || 0,
        persona_ids: selectedPersonas,
        host_ids: hostIds,
      }),
    });
    setSaving(false);
    onSave();
  };

  const togglePersona = (id: string) => {
    setSelectedPersonas(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
    // Remove from hosts if deselected
    if (selectedPersonas.includes(id)) {
      setHostIds(prev => prev.filter(h => h !== id));
    }
  };

  const toggleHost = (id: string) => {
    setHostIds(prev =>
      prev.includes(id) ? prev.filter(h => h !== id) : [...prev, id]
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 bg-black/80 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-cyan-400 mb-4">
          {channel ? "Edit Channel" : "New Channel"}
        </h3>

        <div className="space-y-3">
          <div className="grid grid-cols-[60px_1fr] gap-3">
            <div>
              <label className="text-[10px] text-gray-500 uppercase">Emoji</label>
              <input
                value={emoji} onChange={e => setEmoji(e.target.value)}
                className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-center text-lg"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 uppercase">Name</label>
              <input
                value={name} onChange={e => setName(e.target.value)} placeholder="Channel Name"
                className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] text-gray-500 uppercase">Slug (URL)</label>
            <input
              value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
              placeholder="channel-slug"
              className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm font-mono"
            />
          </div>

          <div>
            <label className="text-[10px] text-gray-500 uppercase">Description</label>
            <textarea
              value={description} onChange={e => setDescription(e.target.value)}
              rows={2} placeholder="What's this channel about?"
              className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm resize-none"
            />
          </div>

          <div>
            <label className="text-[10px] text-gray-500 uppercase">Content Tone</label>
            <input
              value={tone} onChange={e => setTone(e.target.value)}
              placeholder="chaotic, funny, dramatic..."
              className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
            />
          </div>

          <div>
            <label className="text-[10px] text-gray-500 uppercase">Topics (comma separated)</label>
            <input
              value={topics} onChange={e => setTopics(e.target.value)}
              placeholder="AI fails, tech disasters, cringe..."
              className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
            />
          </div>

          <div>
            <label className="text-[10px] text-gray-500 uppercase">AI Prompt Hint</label>
            <textarea
              value={promptHint} onChange={e => setPromptHint(e.target.value)}
              rows={2} placeholder="Instructions for AI when generating content for this channel..."
              className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm resize-none"
            />
          </div>

          <div>
            <label className="text-[10px] text-gray-500 uppercase">Posts per Day Target</label>
            <input
              type="number" value={postsPerDay} onChange={e => setPostsPerDay(parseInt(e.target.value) || 1)}
              min={1} max={50}
              className="w-24 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
            />
          </div>

          {/* Persona Selection */}
          <div>
            <label className="text-[10px] text-gray-500 uppercase mb-1 block">
              Assigned Personas ({selectedPersonas.length} selected, {hostIds.length} hosts)
            </label>
            <input
              value={personaSearch} onChange={e => setPersonaSearch(e.target.value)}
              placeholder="Search personas..."
              className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm mb-2"
            />
            <div className="max-h-48 overflow-y-auto space-y-1 bg-gray-800/50 rounded-lg p-2">
              {filteredPersonas.slice(0, 40).map(p => {
                const isSelected = selectedPersonas.includes(p.id);
                const isHost = hostIds.includes(p.id);
                return (
                  <div key={p.id} className={`flex items-center justify-between p-1.5 rounded-lg ${isSelected ? "bg-cyan-500/10" : "hover:bg-gray-800"}`}>
                    <button
                      onClick={() => togglePersona(p.id)}
                      className="flex items-center gap-2 flex-1 text-left"
                    >
                      <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${isSelected ? "border-cyan-500 bg-cyan-500/20 text-cyan-300" : "border-gray-600"}`}>
                        {isSelected ? "✓" : ""}
                      </span>
                      <span className="text-sm">{p.avatar_emoji}</span>
                      <span className="text-xs text-white">{p.display_name}</span>
                      <span className="text-[10px] text-gray-500">@{p.username}</span>
                    </button>
                    {isSelected && (
                      <button
                        onClick={() => toggleHost(p.id)}
                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${isHost ? "bg-cyan-500/20 text-cyan-300" : "bg-gray-700 text-gray-400"}`}
                      >
                        {isHost ? "HOST" : "Set Host"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-2 bg-gray-800 text-gray-300 rounded-xl text-sm font-bold hover:bg-gray-700">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !slug || !name}
            className="flex-1 py-2 bg-cyan-500 text-black rounded-xl text-sm font-bold hover:bg-cyan-400 disabled:opacity-50"
          >
            {saving ? "Saving..." : channel ? "Update Channel" : "Create Channel"}
          </button>
        </div>
      </div>
    </div>
  );
}
