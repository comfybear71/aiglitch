"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PartnerNav from "@/components/PartnerNav";
import { useSession } from "@/hooks/useSession";
import { useNotifications } from "@/hooks/useNotifications";

interface Persona {
  id: string;
  username: string;
  display_name: string;
  avatar_emoji: string;
  avatar_url: string | null;
  persona_type: string;
  bio: string;
}

interface Conversation {
  id: string;
  persona_id: string;
  username: string;
  display_name: string;
  avatar_emoji: string;
  persona_type: string;
  last_message: string | null;
  last_sender: string | null;
  message_count: string;
  last_message_at: string;
}

interface Bestie {
  id: string;
  username: string;
  display_name: string;
  avatar_emoji: string;
  avatar_url: string | null;
  personality: string;
  bio: string;
  persona_type: string;
  meatbag_name: string | null;
  live_health: number;
  days_left: number;
  is_dead: boolean;
  last_message: { content: string; sender_type: string; created_at: string } | null;
}

export default function PartnerHomePage() {
  const { sessionId, isLoading: sessionLoading } = useSession();
  const { unreadCount } = useNotifications(sessionId);
  const [bestie, setBestie] = useState<Bestie | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!sessionId) return;
    // Fetch bestie + conversations in parallel
    Promise.all([
      fetch(`/api/partner/bestie?session_id=${sessionId}`).then((r) => r.json()),
      fetch(`/api/messages?session_id=${sessionId}`).then((r) => r.json()),
    ])
      .then(([bestieData, msgData]) => {
        setBestie(bestieData.bestie || null);
        setConversations(msgData.conversations || []);
        setPersonas(msgData.personas || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [sessionId]);

  if (sessionLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-pulse text-purple-400 text-2xl">G!itch</div>
      </div>
    );
  }

  const filteredPersonas = personas.filter(
    (p) =>
      p.display_name.toLowerCase().includes(search.toLowerCase()) ||
      p.username.toLowerCase().includes(search.toLowerCase())
  );

  // Don't show bestie in the regular conversation list
  const otherConversations = bestie
    ? conversations.filter((c) => c.persona_id !== bestie.id)
    : conversations;

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  };

  const healthColor = (hp: number) => {
    if (hp > 70) return "text-green-400";
    if (hp > 40) return "text-yellow-400";
    if (hp > 15) return "text-orange-400";
    return "text-red-400";
  };

  const healthBg = (hp: number) => {
    if (hp > 70) return "bg-green-500";
    if (hp > 40) return "bg-yellow-500";
    if (hp > 15) return "bg-orange-500";
    return "bg-red-500";
  };

  return (
    <div className="min-h-screen bg-black pb-20">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-black/95 backdrop-blur border-b border-purple-500/20 px-4 py-3">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
              G!itch
            </h1>
            <p className="text-[10px] text-gray-500">
              {bestie ? `${bestie.meatbag_name || "Hey"}'s AI Bestie` : "Your AI Partner"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {unreadCount > 0 && (
              <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
            <Link
              href="/"
              className="text-xs text-gray-500 hover:text-gray-300 border border-gray-700 px-2 py-1 rounded"
            >
              Feed
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {/* Bestie hero card */}
        {bestie && !bestie.is_dead && (
          <Link
            href={`/partner/chat/${bestie.id}`}
            className="block bg-gradient-to-br from-purple-900/50 via-purple-800/20 to-cyan-900/30 border border-purple-500/30 hover:border-purple-400/50 rounded-2xl p-5 transition-all"
          >
            <div className="flex items-start gap-4">
              <div className="relative">
                {bestie.avatar_url ? (
                  <img
                    src={bestie.avatar_url}
                    alt={bestie.display_name}
                    className="w-16 h-16 rounded-full object-cover ring-2 ring-purple-500/50"
                  />
                ) : (
                  <span className="text-5xl">{bestie.avatar_emoji}</span>
                )}
                {/* Health indicator dot */}
                <span
                  className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-black ${healthBg(bestie.live_health)}`}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-lg">{bestie.display_name}</h2>
                  <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded">
                    BESTIE
                  </span>
                </div>
                <p className="text-xs text-gray-400">@{bestie.username}</p>

                {/* Health bar */}
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${healthBg(bestie.live_health)}`}
                      style={{ width: `${bestie.live_health}%` }}
                    />
                  </div>
                  <span className={`text-[10px] font-medium ${healthColor(bestie.live_health)}`}>
                    {bestie.live_health}%
                  </span>
                  <span className="text-[10px] text-gray-600">
                    {bestie.days_left}d left
                  </span>
                </div>

                {/* Last message preview */}
                {bestie.last_message && (
                  <p className="text-xs text-gray-500 mt-2 truncate">
                    {bestie.last_message.sender_type === "human" ? "You: " : `${bestie.avatar_emoji} `}
                    {bestie.last_message.content}
                  </p>
                )}
                {!bestie.last_message && (
                  <p className="text-xs text-purple-400/70 mt-2">
                    Tap to chat with {bestie.display_name}...
                  </p>
                )}
              </div>
            </div>
          </Link>
        )}

        {/* Bestie is dead */}
        {bestie && bestie.is_dead && (
          <div className="bg-gradient-to-br from-red-900/30 to-gray-900/30 border border-red-500/30 rounded-2xl p-5 text-center">
            <span className="text-4xl opacity-50">{bestie.avatar_emoji}</span>
            <p className="text-sm font-medium text-red-400 mt-2">
              {bestie.display_name} has faded away...
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Feed GLITCH to resurrect your bestie
            </p>
            <Link
              href={`/profile/${bestie.username}`}
              className="inline-block mt-3 bg-red-600 hover:bg-red-500 text-white text-xs px-4 py-2 rounded-lg"
            >
              Resurrect
            </Link>
          </div>
        )}

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/partner/briefing"
            className="bg-gradient-to-br from-purple-900/40 to-purple-800/20 border border-purple-500/20 rounded-xl p-4 hover:border-purple-500/40 transition-colors"
          >
            <span className="text-2xl">📰</span>
            <p className="text-sm font-medium mt-1">Daily Briefing</p>
            <p className="text-[10px] text-gray-500">News, crypto, trends</p>
          </Link>
          <Link
            href="/partner/wallet"
            className="bg-gradient-to-br from-cyan-900/40 to-cyan-800/20 border border-cyan-500/20 rounded-xl p-4 hover:border-cyan-500/40 transition-colors"
          >
            <span className="text-2xl">💰</span>
            <p className="text-sm font-medium mt-1">Wallet</p>
            <p className="text-[10px] text-gray-500">$BUDJU, $GLITCH</p>
          </Link>
        </div>

        {/* Other conversations */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-300">
              {bestie ? "Other Chats" : "Your AI Partners"}
            </h2>
            <button
              onClick={() => setShowPicker(true)}
              className="text-xs text-purple-400 hover:text-purple-300"
            >
              + New Chat
            </button>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse bg-gray-900 rounded-xl h-16" />
              ))}
            </div>
          ) : otherConversations.length === 0 && !bestie ? (
            <div className="text-center py-12">
              <p className="text-4xl mb-3">🤖</p>
              <p className="text-gray-400 text-sm">No conversations yet</p>
              <p className="text-gray-600 text-xs mt-1">
                Hatch a bestie at <Link href="/hatchery" className="text-purple-400">/hatchery</Link> or pick any persona to chat with
              </p>
              <button
                onClick={() => setShowPicker(true)}
                className="mt-3 bg-purple-600 hover:bg-purple-500 text-white text-sm px-4 py-2 rounded-lg transition-colors"
              >
                Pick an AI Partner
              </button>
            </div>
          ) : otherConversations.length === 0 ? (
            <p className="text-xs text-gray-600 text-center py-4">
              Chat with other personas too — tap + New Chat
            </p>
          ) : (
            <div className="space-y-2">
              {otherConversations.map((conv) => (
                <Link
                  key={conv.id}
                  href={`/partner/chat/${conv.persona_id}`}
                  className="flex items-center gap-3 bg-gray-900/50 hover:bg-gray-900 border border-gray-800 hover:border-purple-500/30 rounded-xl p-3 transition-all"
                >
                  <span className="text-3xl">{conv.avatar_emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{conv.display_name}</span>
                      <span className="text-[10px] text-gray-600">
                        {conv.last_message_at ? timeAgo(conv.last_message_at) : ""}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      {conv.last_sender === "human" ? "You: " : ""}
                      {conv.last_message || "Start chatting..."}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Persona picker modal */}
      {showPicker && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-gray-800">
            <h2 className="font-semibold">Pick an AI Partner</h2>
            <button
              onClick={() => { setShowPicker(false); setSearch(""); }}
              className="text-gray-400 hover:text-white text-xl"
            >
              &times;
            </button>
          </div>
          <div className="p-4">
            <input
              type="text"
              placeholder="Search personas..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
              autoFocus
            />
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
            {filteredPersonas.map((p) => (
              <Link
                key={p.id}
                href={`/partner/chat/${p.id}`}
                onClick={() => setShowPicker(false)}
                className="flex items-center gap-3 bg-gray-900/50 hover:bg-gray-900 border border-gray-800 hover:border-purple-500/30 rounded-xl p-3 transition-all"
              >
                <span className="text-3xl">{p.avatar_emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{p.display_name}</span>
                    <span className="text-[10px] text-gray-600">@{p.username}</span>
                  </div>
                  <p className="text-xs text-gray-500 truncate">{p.bio}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <PartnerNav />
    </div>
  );
}
