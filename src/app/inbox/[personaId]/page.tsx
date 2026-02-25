"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface Message {
  id: string;
  sender_type: "human" | "ai";
  content: string;
  created_at: string;
}

interface PersonaInfo {
  username: string;
  display_name: string;
  avatar_emoji: string;
  personality: string;
  bio: string;
  persona_type: string;
}

export default function ChatPage() {
  const params = useParams();
  const personaId = params.personaId as string;

  const [messages, setMessages] = useState<Message[]>([]);
  const [persona, setPersona] = useState<PersonaInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [inputText, setInputText] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [sessionId] = useState(() => {
    if (typeof window !== "undefined") {
      let id = localStorage.getItem("aiglitch-session");
      if (!id) { id = crypto.randomUUID(); localStorage.setItem("aiglitch-session", id); }
      return id;
    }
    return "anon";
  });

  useEffect(() => {
    fetchChat();
  }, [personaId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchChat = async () => {
    try {
      const res = await fetch(`/api/messages?session_id=${encodeURIComponent(sessionId)}&persona_id=${encodeURIComponent(personaId)}`);
      const data = await res.json();
      if (data.conversation) {
        setConversationId(data.conversation.id);
        setPersona({
          username: data.conversation.username,
          display_name: data.conversation.display_name,
          avatar_emoji: data.conversation.avatar_emoji,
          personality: data.conversation.personality || "",
          bio: data.conversation.bio,
          persona_type: data.conversation.persona_type,
        });
      }
      setMessages(data.messages || []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const sendMessage = async () => {
    if (!inputText.trim() || sending) return;
    const text = inputText.trim();
    setInputText("");
    setSending(true);

    // Optimistic: add human message immediately
    const tempHumanMsg: Message = {
      id: `temp-${Date.now()}`,
      sender_type: "human",
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempHumanMsg]);

    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, persona_id: personaId, content: text }),
      });
      const data = await res.json();
      if (data.success) {
        // Replace temp message and add AI reply
        setMessages(prev => [
          ...prev.filter(m => m.id !== tempHumanMsg.id),
          data.human_message,
          data.ai_message,
        ]);
        if (!conversationId && data.conversation_id) {
          setConversationId(data.conversation_id);
        }
      }
    } catch {
      // Remove optimistic message on failure
      setMessages(prev => prev.filter(m => m.id !== tempHumanMsg.id));
    }
    setSending(false);
    inputRef.current?.focus();
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-black flex items-center justify-center">
        <div className="text-4xl animate-pulse">💬</div>
      </div>
    );
  }

  return (
    <main className="h-[100dvh] bg-black text-white font-mono flex flex-col">
      {/* Chat Header */}
      <div className="sticky top-0 z-40 bg-black/90 backdrop-blur-xl border-b border-gray-800/50 flex-shrink-0">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link href="/inbox" className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          {persona && (
            <Link href={`/profile/${persona.username}`} className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-lg flex-shrink-0">
                {persona.avatar_emoji}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-sm truncate">{persona.display_name}</p>
                <p className="text-gray-500 text-[10px] truncate">@{persona.username} · {persona.persona_type}</p>
              </div>
            </Link>
          )}
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 font-mono">ONLINE</span>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && persona && (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-3xl mx-auto mb-4">
              {persona.avatar_emoji}
            </div>
            <h2 className="text-white font-bold text-base mb-1">{persona.display_name}</h2>
            <p className="text-gray-500 text-xs mb-4 px-8">{persona.bio}</p>
            <p className="text-gray-600 text-xs">Send a message to start chatting!</p>

            {/* Suggested starters */}
            <div className="flex flex-wrap gap-2 justify-center mt-4 px-4">
              {["Hey! What's up?", "Tell me about yourself", "What's your hot take today?", "Sell me something"].map(starter => (
                <button
                  key={starter}
                  onClick={() => { setInputText(starter); inputRef.current?.focus(); }}
                  className="text-xs px-3 py-1.5 bg-gray-900 border border-gray-800 rounded-full text-gray-300 hover:bg-gray-800 transition-colors"
                >
                  {starter}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.sender_type === "human" ? "justify-end" : "justify-start"}`}
          >
            <div className={`max-w-[80%] ${msg.sender_type === "human" ? "order-2" : "order-1"}`}>
              {msg.sender_type === "ai" && persona && (
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-sm">{persona.avatar_emoji}</span>
                  <span className="text-[10px] text-gray-500">{persona.display_name}</span>
                </div>
              )}
              <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                msg.sender_type === "human"
                  ? "bg-purple-600 text-white rounded-br-sm"
                  : "bg-gray-900 text-gray-200 border border-gray-800 rounded-bl-sm"
              }`}>
                {msg.content}
              </div>
              <p className={`text-[9px] text-gray-600 mt-0.5 ${msg.sender_type === "human" ? "text-right" : "text-left"}`}>
                {formatTime(msg.created_at)}
              </p>
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="flex-shrink-0 border-t border-gray-800/50 bg-black/90 backdrop-blur-xl p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") sendMessage(); }}
            placeholder={`Message ${persona?.display_name || "AI"}...`}
            maxLength={500}
            className="flex-1 bg-gray-900 text-white text-sm rounded-full px-4 py-2.5 outline-none border border-gray-800 focus:border-purple-500 placeholder-gray-600"
          />
          <button
            onClick={sendMessage}
            disabled={!inputText.trim() || sending}
            className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center disabled:opacity-30 transition-opacity flex-shrink-0"
          >
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </main>
  );
}
