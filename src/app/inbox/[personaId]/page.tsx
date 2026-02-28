"use client";

import { useEffect, useState, useRef, useCallback } from "react";
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

// Browser TTS voice mapping (fallback when no xAI key)
const BROWSER_VOICE_MAP: Record<string, { lang: string; pitch: number; rate: number }> = {
  Ara: { lang: "en-US", pitch: 1.1, rate: 0.95 },
  Rex: { lang: "en-US", pitch: 0.8, rate: 1.0 },
  Sal: { lang: "en-US", pitch: 1.0, rate: 0.9 },
  Eve: { lang: "en-US", pitch: 1.2, rate: 1.1 },
  Leo: { lang: "en-US", pitch: 0.7, rate: 0.85 },
};

export default function ChatPage() {
  const params = useParams();
  const personaId = params.personaId as string;

  const [messages, setMessages] = useState<Message[]>([]);
  const [persona, setPersona] = useState<PersonaInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [inputText, setInputText] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("aiglitch-voice") !== "off";
    }
    return true;
  });
  const [playingMsgId, setPlayingMsgId] = useState<string | null>(null);
  const [loadingVoice, setLoadingVoice] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

  // Persist voice preference
  useEffect(() => {
    localStorage.setItem("aiglitch-voice", voiceEnabled ? "on" : "off");
  }, [voiceEnabled]);

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

  // Play voice for a message
  const playVoice = useCallback(async (msgId: string, text: string) => {
    // Stop any current playback
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    window.speechSynthesis?.cancel();

    if (playingMsgId === msgId) {
      setPlayingMsgId(null);
      return;
    }

    setLoadingVoice(msgId);

    try {
      const res = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          persona_id: personaId,
          persona_type: persona?.persona_type,
        }),
      });

      if (res.headers.get("content-type")?.includes("audio/")) {
        // Got real audio from xAI
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        setPlayingMsgId(msgId);
        setLoadingVoice(null);

        audio.onended = () => {
          setPlayingMsgId(null);
          URL.revokeObjectURL(url);
          audioRef.current = null;
        };
        audio.onerror = () => {
          setPlayingMsgId(null);
          URL.revokeObjectURL(url);
          audioRef.current = null;
        };
        await audio.play();
      } else {
        // Fallback to browser speech synthesis
        const data = await res.json();
        const voiceName = data.voice || "Sal";
        useBrowserTTS(msgId, text, voiceName);
      }
    } catch {
      // Fallback to browser TTS
      useBrowserTTS(msgId, text, "Sal");
    }
  }, [personaId, persona?.persona_type, playingMsgId]);

  const useBrowserTTS = (msgId: string, text: string, voiceName: string) => {
    if (!window.speechSynthesis) {
      setLoadingVoice(null);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    const config = BROWSER_VOICE_MAP[voiceName] || BROWSER_VOICE_MAP.Sal;
    utterance.pitch = config.pitch;
    utterance.rate = config.rate;
    utterance.lang = config.lang;

    // Try to find a matching voice
    const voices = window.speechSynthesis.getVoices();
    const englishVoice = voices.find(v => v.lang.startsWith("en"));
    if (englishVoice) utterance.voice = englishVoice;

    utterance.onstart = () => {
      setPlayingMsgId(msgId);
      setLoadingVoice(null);
    };
    utterance.onend = () => setPlayingMsgId(null);
    utterance.onerror = () => {
      setPlayingMsgId(null);
      setLoadingVoice(null);
    };

    window.speechSynthesis.speak(utterance);
  };

  // Auto-play voice for new AI messages
  const lastAutoPlayedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!voiceEnabled || !persona || messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.sender_type === "ai" && lastMsg.id !== lastAutoPlayedRef.current && !lastMsg.id.startsWith("temp-")) {
      lastAutoPlayedRef.current = lastMsg.id;
      // Small delay so the message renders first
      setTimeout(() => playVoice(lastMsg.id, lastMsg.content), 300);
    }
  }, [messages, voiceEnabled, persona, playVoice]);

  const sendMessage = async () => {
    if (!inputText.trim() || sending) return;
    const text = inputText.trim();
    setInputText("");
    setSending(true);

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
          {/* Voice toggle */}
          <button
            onClick={() => {
              setVoiceEnabled(!voiceEnabled);
              if (voiceEnabled) {
                window.speechSynthesis?.cancel();
                if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
                setPlayingMsgId(null);
              }
            }}
            className={`p-1.5 rounded-full transition-colors ${voiceEnabled ? "bg-purple-500/20 text-purple-400" : "bg-gray-800 text-gray-600"}`}
            title={voiceEnabled ? "Voice ON — tap to mute" : "Voice OFF — tap to enable"}
          >
            {voiceEnabled ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M11 5L6 9H2v6h4l5 4V5z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            )}
          </button>
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
            <p className="text-gray-500 text-xs mb-2 px-8">{persona.bio}</p>
            <p className="text-purple-400 text-[10px] mb-4">
              {voiceEnabled ? "🔊 Voice enabled — I'll speak my replies" : "🔇 Voice muted"}
            </p>
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
              <div className={`flex items-center gap-1.5 mt-0.5 ${msg.sender_type === "human" ? "justify-end" : "justify-start"}`}>
                <p className="text-[9px] text-gray-600">
                  {formatTime(msg.created_at)}
                </p>
                {/* Speaker button for AI messages */}
                {msg.sender_type === "ai" && !msg.id.startsWith("temp-") && (
                  <button
                    onClick={() => playVoice(msg.id, msg.content)}
                    disabled={loadingVoice === msg.id}
                    className={`p-0.5 rounded transition-colors ${
                      playingMsgId === msg.id
                        ? "text-purple-400 animate-pulse"
                        : loadingVoice === msg.id
                          ? "text-gray-600 animate-pulse"
                          : "text-gray-600 hover:text-purple-400"
                    }`}
                    title={playingMsgId === msg.id ? "Stop" : "Play voice"}
                  >
                    {loadingVoice === msg.id ? (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <circle cx="12" cy="12" r="10" strokeDasharray="60" strokeDashoffset="20" />
                      </svg>
                    ) : playingMsgId === msg.id ? (
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                        <rect x="6" y="4" width="4" height="16" rx="1" />
                        <rect x="14" y="4" width="4" height="16" rx="1" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M11 5L6 9H2v6h4l5 4V5z" />
                      </svg>
                    )}
                  </button>
                )}
              </div>
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
