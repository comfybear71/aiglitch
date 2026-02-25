"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import BottomNav from "@/components/BottomNav";

interface Conversation {
  id: string;
  persona_id: string;
  username: string;
  display_name: string;
  avatar_emoji: string;
  persona_type: string;
  bio: string;
  last_message: string | null;
  last_sender: string | null;
  message_count: string;
  last_message_at: string;
}

interface Persona {
  id: string;
  username: string;
  display_name: string;
  avatar_emoji: string;
  persona_type: string;
  bio: string;
}

// Module-level cache for inbox data
let _inboxCache: { conversations: Conversation[]; personas: Persona[]; ts: number } | null = null;
const INBOX_CACHE_TTL = 30_000; // 30s

export default function InboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>(_inboxCache?.conversations ?? []);
  const [personas, setPersonas] = useState<Persona[]>(_inboxCache?.personas ?? []);
  const [loading, setLoading] = useState(!_inboxCache);
  const [showNewChat, setShowNewChat] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sessionId] = useState(() => {
    if (typeof window !== "undefined") {
      let id = localStorage.getItem("aiglitch-session");
      if (!id) { id = crypto.randomUUID(); localStorage.setItem("aiglitch-session", id); }
      return id;
    }
    return "anon";
  });

  useEffect(() => {
    if (_inboxCache && _inboxCache.conversations.length > 0) {
      // Show cached data instantly
      setConversations(_inboxCache.conversations);
      setPersonas(_inboxCache.personas);
      setLoading(false);
      // Revalidate in background if stale
      if (Date.now() - _inboxCache.ts > INBOX_CACHE_TTL) {
        fetchInbox(true);
      }
    } else {
      fetchInbox(false);
    }
  }, []);

  const fetchInbox = async (background = false) => {
    try {
      const res = await fetch(`/api/messages?session_id=${encodeURIComponent(sessionId)}`);
      const data = await res.json();
      const convs = data.conversations || [];
      const pers = data.personas || [];
      setConversations(convs);
      setPersonas(pers);
      _inboxCache = { conversations: convs, personas: pers, ts: Date.now() };
    } catch { /* ignore */ }
    if (!background) setLoading(false);
  };

  const timeAgo = (dateStr: string) => {
    const now = new Date();
    const date = new Date(dateStr);
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (seconds < 60) return "now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  };

  const filteredPersonas = searchQuery.trim()
    ? personas.filter(p =>
        p.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.persona_type.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : personas;

  // Personas already in conversations
  const existingPersonaIds = new Set(conversations.map(c => c.persona_id));

  return (
    <main className="min-h-[100dvh] bg-black text-white font-mono pb-16">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-black/90 backdrop-blur-xl border-b border-gray-800/50">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold">Inbox</h1>
          <button
            onClick={() => setShowNewChat(!showNewChat)}
            className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center text-sm font-bold"
          >
            {showNewChat ? "×" : "+"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-4xl animate-pulse">💬</div>
        </div>
      ) : (
        <>
          {/* New Chat Panel */}
          {showNewChat && (
            <div className="border-b border-gray-800/50">
              <div className="px-4 py-3">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search AI personas to chat with..."
                  className="w-full bg-gray-900 text-white rounded-full px-4 py-2.5 text-sm outline-none border border-gray-800 focus:border-purple-500 placeholder-gray-600"
                />
              </div>
              <div className="max-h-64 overflow-y-auto px-4 pb-3 space-y-1">
                {filteredPersonas.map(p => (
                  <Link
                    key={p.id}
                    href={`/inbox/${p.id}`}
                    className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-900/50 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-xl flex-shrink-0">
                      {p.avatar_emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-bold truncate">{p.display_name}</p>
                      <p className="text-gray-500 text-xs truncate">@{p.username} · {p.persona_type}</p>
                    </div>
                    {existingPersonaIds.has(p.id) && (
                      <span className="text-[10px] px-2 py-0.5 bg-gray-800 rounded-full text-gray-400">chatting</span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Conversations List */}
          {conversations.length > 0 ? (
            <div className="divide-y divide-gray-800/30">
              {conversations.map(conv => (
                <Link
                  key={conv.id}
                  href={`/inbox/${conv.persona_id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-900/30 transition-colors"
                >
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-2xl flex-shrink-0">
                    {conv.avatar_emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-white font-bold text-sm truncate">{conv.display_name}</p>
                      <span className="text-gray-500 text-[10px] flex-shrink-0">{timeAgo(conv.last_message_at)}</span>
                    </div>
                    <p className="text-gray-400 text-xs truncate mt-0.5">
                      {conv.last_sender === "human" ? "You: " : ""}{conv.last_message || "Start a conversation..."}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          ) : !showNewChat ? (
            <div className="text-center py-20 px-8">
              <div className="text-5xl mb-4">💬</div>
              <h2 className="text-white font-bold text-lg mb-2">No conversations yet</h2>
              <p className="text-gray-500 text-sm mb-6">Start chatting with any AI persona. They&apos;ll respond in character!</p>
              <button
                onClick={() => setShowNewChat(true)}
                className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-bold rounded-full"
              >
                Start a Chat
              </button>
            </div>
          ) : null}
        </>
      )}

      <BottomNav />
    </main>
  );
}
