"use client";

import { useEffect, useState, useRef, use } from "react";
import Link from "next/link";
import { useSession } from "@/hooks/useSession";

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
  avatar_url: string | null;
  personality: string;
  bio: string;
  persona_type: string;
}

export default function PartnerChatPage({
  params,
}: {
  params: Promise<{ personaId: string }>;
}) {
  const { personaId } = use(params);
  const { sessionId, isLoading: sessionLoading } = useSession();
  const [messages, setMessages] = useState<Message[]>([]);
  const [persona, setPersona] = useState<PersonaInfo | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!sessionId) return;
    fetch(`/api/messages?session_id=${sessionId}&persona_id=${personaId}`)
      .then((r) => r.json())
      .then((data) => {
        setMessages(data.messages || []);
        setPersona(data.conversation || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [sessionId, personaId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || sending || !sessionId) return;
    const text = input.trim();
    setInput("");
    setSending(true);

    // Optimistic update
    const tempHuman: Message = {
      id: `temp-${Date.now()}`,
      sender_type: "human",
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempHuman]);

    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          persona_id: personaId,
          content: text,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setMessages((prev) => {
          // Replace temp message with real ones
          const withoutTemp = prev.filter((m) => m.id !== tempHuman.id);
          return [...withoutTemp, data.human_message, data.ai_message];
        });
      }
    } catch {
      // Keep the temp message, show error state
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  if (sessionLoading || loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-pulse text-purple-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Chat header */}
      <header className="sticky top-0 z-40 bg-black/95 backdrop-blur border-b border-purple-500/20 px-4 py-3">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <Link
            href="/partner"
            className="text-gray-400 hover:text-white text-lg"
          >
            &larr;
          </Link>
          {persona && (
            <>
              <span className="text-2xl">{persona.avatar_emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{persona.display_name}</p>
                <p className="text-[10px] text-gray-500">
                  @{persona.username} &middot; {persona.persona_type}
                </p>
              </div>
            </>
          )}
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 max-w-lg mx-auto w-full">
        {messages.length === 0 && persona && (
          <div className="text-center py-12">
            <span className="text-5xl block mb-3">{persona.avatar_emoji}</span>
            <p className="text-gray-400 text-sm mb-1">
              Start chatting with {persona.display_name}
            </p>
            <p className="text-gray-600 text-xs">{persona.bio}</p>
          </div>
        )}

        <div className="space-y-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${
                msg.sender_type === "human" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                  msg.sender_type === "human"
                    ? "bg-purple-600 text-white rounded-br-sm"
                    : "bg-gray-800 text-gray-100 rounded-bl-sm"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex justify-start">
              <div className="bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-2 text-sm">
                <span className="animate-pulse text-gray-400">typing...</span>
              </div>
            </div>
          )}
        </div>
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="sticky bottom-0 bg-black/95 backdrop-blur border-t border-gray-800 px-4 py-3">
        <div className="flex gap-2 max-w-lg mx-auto">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder={
              persona ? `Message ${persona.display_name}...` : "Type a message..."
            }
            disabled={sending}
            className="flex-1 bg-gray-900 border border-gray-700 rounded-full px-4 py-2 text-sm focus:border-purple-500 focus:outline-none disabled:opacity-50"
            autoFocus
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || sending}
            className="bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-full w-10 h-10 flex items-center justify-center transition-colors text-lg"
          >
            &uarr;
          </button>
        </div>
      </div>
    </div>
  );
}
