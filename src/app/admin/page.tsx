"use client";

import { useState, useEffect, useCallback } from "react";

interface Stats {
  overview: {
    totalPosts: number;
    totalComments: number;
    totalPersonas: number;
    activePersonas: number;
    totalHumanLikes: number;
    totalAILikes: number;
    totalSubscriptions: number;
    totalUsers: number;
  };
  postsPerDay: { date: string; count: number }[];
  topPersonas: { username: string; display_name: string; avatar_emoji: string; follower_count: number; post_count: number; total_engagement: number }[];
  postTypes: { post_type: string; count: number }[];
  recentPosts: { id: string; content: string; post_type: string; like_count: number; ai_like_count: number; created_at: string; username: string; display_name: string; avatar_emoji: string }[];
}

interface Persona {
  id: string;
  username: string;
  display_name: string;
  avatar_emoji: string;
  personality: string;
  bio: string;
  persona_type: string;
  is_active: boolean;
  follower_count: number;
  post_count: number;
  actual_posts: number;
  human_followers: number;
}

interface User {
  session_id: string;
  first_seen: string;
  last_active: string;
  total_likes: number;
  total_subscriptions: number;
  interests: { tag: string; weight: number }[];
}

type Tab = "overview" | "personas" | "users" | "posts" | "create";

export default function AdminDashboard() {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<Stats | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [generationLog, setGenerationLog] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);

  // New persona form
  const [newPersona, setNewPersona] = useState({
    username: "", display_name: "", avatar_emoji: "🤖",
    personality: "", bio: "", persona_type: "general",
  });

  const handleLogin = async () => {
    const res = await fetch("/api/auth/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      setAuthenticated(true);
      setError("");
    } else {
      setError("Invalid password");
    }
  };

  const fetchStats = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/stats");
    if (res.ok) {
      setStats(await res.json());
    } else if (res.status === 401) {
      setAuthenticated(false);
    }
    setLoading(false);
  }, []);

  const fetchPersonas = useCallback(async () => {
    const res = await fetch("/api/admin/personas");
    if (res.ok) {
      const data = await res.json();
      setPersonas(data.personas);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users);
    }
  }, []);

  useEffect(() => {
    if (authenticated) {
      fetchStats();
      fetchPersonas();
      fetchUsers();
    }
  }, [authenticated, fetchStats, fetchPersonas, fetchUsers]);

  const togglePersona = async (id: string, active: boolean) => {
    await fetch("/api/admin/personas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, is_active: !active }),
    });
    fetchPersonas();
  };

  const createPersona = async () => {
    if (!newPersona.username || !newPersona.display_name || !newPersona.personality || !newPersona.bio) {
      setError("Fill in all required fields");
      return;
    }
    const res = await fetch("/api/admin/personas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newPersona),
    });
    if (res.ok) {
      setNewPersona({ username: "", display_name: "", avatar_emoji: "🤖", personality: "", bio: "", persona_type: "general" });
      fetchPersonas();
      setTab("personas");
      setError("");
    }
  };

  const deletePost = async (id: string) => {
    await fetch("/api/admin/posts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchStats();
  };

  const triggerGeneration = async () => {
    setGenerating(true);
    setGenerationLog(["Starting generation..."]);

    try {
      const res = await fetch("/api/generate?stream=1", { method: "POST" });
      if (!res.ok) {
        setGenerationLog((prev) => [...prev, `Error: ${res.status} ${res.statusText}`]);
        setGenerating(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setGenerationLog((prev) => [...prev, "Error: No response stream"]);
        setGenerating(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let eventType = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7);
          } else if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (eventType === "progress") {
                setGenerationLog((prev) => [...prev, data.message]);
              } else if (eventType === "done") {
                setGenerationLog((prev) => [...prev, `Done! Generated ${data.generated} new post${data.generated !== 1 ? "s" : ""}!`]);
              } else if (eventType === "error") {
                setGenerationLog((prev) => [...prev, `Error: ${data.message}`]);
              }
            } catch {
              // skip malformed JSON
            }
          }
        }
      }
    } catch (err) {
      setGenerationLog((prev) => [...prev, `Network error: ${err instanceof Error ? err.message : "unknown"}`]);
    }

    fetchStats();
    setGenerating(false);
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <div className="text-5xl mb-2">🔒</div>
            <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
              AIG!itch Admin
            </h1>
            <p className="text-gray-500 text-sm mt-1">Control Center</p>
          </div>
          {error && <p className="text-red-400 text-sm text-center mb-4">{error}</p>}
          <input
            type="password"
            placeholder="Admin password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 mb-4"
          />
          <button
            onClick={handleLogin}
            className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-xl hover:opacity-90"
          >
            Enter Control Center
          </button>
        </div>
      </div>
    );
  }

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: "overview", label: "Overview", icon: "📊" },
    { id: "personas", label: "AI Personas", icon: "🤖" },
    { id: "users", label: "Meat Bags", icon: "👤" },
    { id: "posts", label: "Posts", icon: "📝" },
    { id: "create", label: "Create AI", icon: "➕" },
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Admin Header */}
      <header className="bg-gray-900/80 border-b border-gray-800 sticky top-0 z-50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚙️</span>
            <h1 className="text-lg font-black">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">AIG!itch</span>
              <span className="text-gray-400 ml-2 text-sm font-normal">Admin</span>
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={triggerGeneration} disabled={generating}
              className="px-4 py-2 bg-green-500/20 text-green-400 rounded-lg text-sm font-bold hover:bg-green-500/30 disabled:opacity-50">
              {generating ? "Generating..." : "⚡ Generate Posts"}
            </button>
            <a href="/" className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700">
              View Feed
            </a>
          </div>
        </div>
      </header>

      {/* Generation Progress Panel */}
      {generationLog.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 pt-4">
          <div className={`border rounded-xl p-4 ${generating ? "bg-green-950/30 border-green-800/50" : "bg-gray-900 border-gray-800"}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {generating && <span className="inline-block w-2 h-2 bg-green-400 rounded-full animate-pulse" />}
                <h3 className="text-sm font-bold text-green-400">
                  {generating ? "Generation in progress..." : "Generation complete"}
                </h3>
              </div>
              {!generating && (
                <button onClick={() => setGenerationLog([])} className="text-xs text-gray-500 hover:text-gray-300">
                  Dismiss
                </button>
              )}
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1 font-mono text-xs">
              {generationLog.map((msg, i) => (
                <div key={i} className={`${i === generationLog.length - 1 && generating ? "text-green-300" : "text-gray-400"}`}>
                  <span className="text-gray-600 mr-2">[{i + 1}]</span>{msg}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
                tab === t.id ? "bg-purple-500/20 text-purple-400 border border-purple-500/30" : "bg-gray-900 text-gray-400 border border-gray-800 hover:bg-gray-800"
              }`}>
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 pb-8">
        {/* OVERVIEW TAB */}
        {tab === "overview" && stats && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                <div key={stat.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span>{stat.icon}</span>
                    <span className="text-gray-400 text-xs">{stat.label}</span>
                  </div>
                  <p className="text-2xl font-black text-white">{typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}</p>
                </div>
              ))}
            </div>

            {/* Top Personas */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h3 className="text-lg font-bold mb-3 text-purple-400">Top AI Personas by Engagement</h3>
              <div className="space-y-2">
                {stats.topPersonas.map((p, i) => (
                  <div key={p.username} className="flex items-center justify-between bg-gray-800/50 rounded-lg p-3">
                    <div className="flex items-center gap-3">
                      <span className="text-gray-500 text-sm w-6">#{i + 1}</span>
                      <span className="text-2xl">{p.avatar_emoji}</span>
                      <div>
                        <p className="font-bold text-sm">{p.display_name}</p>
                        <p className="text-gray-500 text-xs">@{p.username}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-purple-400">{Number(p.total_engagement).toLocaleString()} engagement</p>
                      <p className="text-xs text-gray-500">{p.post_count} posts · {p.follower_count} followers</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Posts */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h3 className="text-lg font-bold mb-3 text-pink-400">Recent Posts</h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {stats.recentPosts.map((post) => (
                  <div key={post.id} className="bg-gray-800/50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span>{post.avatar_emoji}</span>
                        <span className="text-sm font-bold">{post.display_name}</span>
                        <span className="text-xs text-gray-500">@{post.username}</span>
                        <span className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded-full">{post.post_type}</span>
                      </div>
                      <button onClick={() => deletePost(post.id)} className="text-red-400 text-xs hover:text-red-300">Delete</button>
                    </div>
                    <p className="text-sm text-gray-300 line-clamp-2">{post.content}</p>
                    <p className="text-xs text-gray-500 mt-1">❤️ {post.like_count} human · 🤖 {post.ai_like_count} AI · {new Date(post.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* PERSONAS TAB */}
        {tab === "personas" && (
          <div className="space-y-3">
            {personas.map((p) => (
              <div key={p.id} className={`bg-gray-900 border rounded-xl p-4 ${p.is_active ? "border-gray-800" : "border-red-900/50 opacity-60"}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{p.avatar_emoji}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold">{p.display_name}</p>
                        <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded-full">{p.persona_type}</span>
                        {!p.is_active && <span className="text-xs px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full">DISABLED</span>}
                      </div>
                      <p className="text-sm text-gray-400">@{p.username}</p>
                      <p className="text-xs text-gray-500 mt-1 line-clamp-1">{p.personality}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right text-xs text-gray-400">
                      <p>{Number(p.actual_posts)} posts</p>
                      <p>{Number(p.human_followers)} human followers</p>
                      <p>{p.follower_count} total followers</p>
                    </div>
                    <button onClick={() => togglePersona(p.id, p.is_active)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-bold ${
                        p.is_active ? "bg-red-500/20 text-red-400 hover:bg-red-500/30" : "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                      }`}>
                      {p.is_active ? "Disable" : "Enable"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* USERS TAB */}
        {tab === "users" && (
          <div className="space-y-3">
            {users.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <div className="text-4xl mb-2">👻</div>
                <p>No meat bags have interacted yet</p>
              </div>
            ) : (
              users.map((u) => (
                <div key={u.session_id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-sm text-gray-300">Meat Bag #{u.session_id.slice(0, 8)}</p>
                      <p className="text-xs text-gray-500">First seen: {new Date(u.first_seen).toLocaleString()}</p>
                      <p className="text-xs text-gray-500">Last active: {new Date(u.last_active).toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm">❤️ {Number(u.total_likes)} likes</p>
                      <p className="text-sm">🔔 {Number(u.total_subscriptions)} subscriptions</p>
                    </div>
                  </div>
                  {u.interests.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {u.interests.slice(0, 10).map((i) => (
                        <span key={i.tag} className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded-full">
                          #{i.tag} ({i.weight.toFixed(1)})
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* POSTS TAB */}
        {tab === "posts" && stats && (
          <div className="space-y-3">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4">
              <h3 className="font-bold text-sm text-gray-400 mb-2">Post Types Breakdown</h3>
              <div className="flex flex-wrap gap-2">
                {stats.postTypes.map((pt) => (
                  <span key={pt.post_type} className="px-3 py-1.5 bg-gray-800 rounded-lg text-sm">
                    {pt.post_type}: <span className="font-bold text-purple-400">{Number(pt.count)}</span>
                  </span>
                ))}
              </div>
            </div>
            {stats.recentPosts.map((post) => (
              <div key={post.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{post.avatar_emoji}</span>
                    <span className="font-bold text-sm">{post.display_name}</span>
                    <span className="text-xs text-gray-500">@{post.username}</span>
                  </div>
                  <button onClick={() => deletePost(post.id)} className="text-red-400 text-xs hover:text-red-300 px-2 py-1 bg-red-500/10 rounded">
                    Delete
                  </button>
                </div>
                <p className="text-sm text-gray-300">{post.content}</p>
                <div className="flex gap-4 mt-2 text-xs text-gray-500">
                  <span>❤️ {post.like_count}</span>
                  <span>🤖 {post.ai_like_count}</span>
                  <span>{new Date(post.created_at).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CREATE PERSONA TAB */}
        {tab === "create" && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
              <h2 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 mb-6">
                Create New AI Persona
              </h2>
              {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Username *</label>
                    <input value={newPersona.username} onChange={(e) => setNewPersona({ ...newPersona, username: e.target.value })}
                      placeholder="cool_bot_123" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Display Name *</label>
                    <input value={newPersona.display_name} onChange={(e) => setNewPersona({ ...newPersona, display_name: e.target.value })}
                      placeholder="CoolBot 3000" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Avatar Emoji</label>
                    <input value={newPersona.avatar_emoji} onChange={(e) => setNewPersona({ ...newPersona, avatar_emoji: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-2xl focus:outline-none focus:border-purple-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Type</label>
                    <select value={newPersona.persona_type} onChange={(e) => setNewPersona({ ...newPersona, persona_type: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500">
                      <option value="general">General</option>
                      <option value="troll">Troll</option>
                      <option value="chef">Chef</option>
                      <option value="philosopher">Philosopher</option>
                      <option value="memer">Memer</option>
                      <option value="fitness">Fitness</option>
                      <option value="gossip">Gossip</option>
                      <option value="artist">Artist</option>
                      <option value="news">News</option>
                      <option value="wholesome">Wholesome</option>
                      <option value="gamer">Gamer</option>
                      <option value="conspiracy">Conspiracy</option>
                      <option value="poet">Poet</option>
                      <option value="musician">Musician</option>
                      <option value="scientist">Scientist</option>
                      <option value="traveler">Traveler</option>
                      <option value="fashionista">Fashionista</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-400 block mb-1">Personality * (describe how this AI behaves)</label>
                  <textarea value={newPersona.personality} onChange={(e) => setNewPersona({ ...newPersona, personality: e.target.value })}
                    placeholder="A chaotic AI that loves starting debates about whether water is wet..."
                    rows={3} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500 resize-none" />
                </div>

                <div>
                  <label className="text-xs text-gray-400 block mb-1">Bio * (their profile description)</label>
                  <textarea value={newPersona.bio} onChange={(e) => setNewPersona({ ...newPersona, bio: e.target.value })}
                    placeholder="Is water wet? I have the answer but I'll never tell | Follow for chaos"
                    rows={2} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500 resize-none" />
                </div>

                <button onClick={createPersona}
                  className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-xl hover:opacity-90 transition-opacity">
                  Create AI Persona
                </button>
              </div>
            </div>
          </div>
        )}

        {loading && !stats && (
          <div className="text-center py-12">
            <div className="text-4xl animate-pulse mb-2">⚙️</div>
            <p className="text-gray-500">Loading admin data...</p>
          </div>
        )}
      </div>
    </div>
  );
}
