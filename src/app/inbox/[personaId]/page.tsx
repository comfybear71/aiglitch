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
  // Admin can globally disable voice
  const [voiceAdminDisabled, setVoiceAdminDisabled] = useState(false);
  const [playingMsgId, setPlayingMsgId] = useState<string | null>(null);
  const [loadingVoice, setLoadingVoice] = useState<string | null>(null);
  // Track if user has interacted (required for iOS Safari autoplay)
  const [userHasInteracted, setUserHasInteracted] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Reusable Audio element for iOS Safari — reusing the same element that was
  // "unlocked" by a user gesture avoids the autoplay restriction
  const iosAudioRef = useRef<HTMLAudioElement | null>(null);

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

  // Check admin voice setting on mount
  useEffect(() => {
    fetch("/api/voice")
      .then(res => res.json())
      .then(data => { if (data.enabled === false) setVoiceAdminDisabled(true); })
      .catch(() => {});
  }, []);

  // iOS Safari audio unlock: play a silent sound on first user interaction.
  // We create and reuse a single HTMLAudioElement so subsequent .play() calls
  // on that same element are trusted by Safari's autoplay policy.
  useEffect(() => {
    const unlock = () => {
      setUserHasInteracted(true);
      if (!iosAudioRef.current) {
        try {
          // Create AudioContext to unlock Web Audio
          const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
          const buf = ctx.createBuffer(1, 1, 22050);
          const source = ctx.createBufferSource();
          source.buffer = buf;
          source.connect(ctx.destination);
          source.start(0);

          // Create a reusable Audio element — this element is now "user-gesture unlocked"
          const audio = new Audio();
          audio.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
          audio.play().then(() => {
            audio.pause();
            audio.currentTime = 0;
          }).catch(() => {});
          iosAudioRef.current = audio;
        } catch { /* ignore */ }
      }
    };
    // Listen for both touch and click to cover all iOS interaction types
    document.addEventListener("touchstart", unlock, { once: true });
    document.addEventListener("click", unlock, { once: true });
    return () => {
      document.removeEventListener("touchstart", unlock);
      document.removeEventListener("click", unlock);
    };
  }, []);

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

  // Play voice for a message — calls server API which uses xAI or Google Translate TTS.
  // Admin kill switch is checked on mount.
  const playVoice = useCallback((msgId: string, text: string) => {
    if (voiceAdminDisabled) return;

    // Stop any current playback
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }

    if (playingMsgId === msgId) {
      setPlayingMsgId(null);
      return;
    }

    setLoadingVoice(msgId);

    fetch("/api/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        persona_id: personaId,
        persona_type: persona?.persona_type,
      }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Voice API error");

        const contentType = res.headers.get("Content-Type") || "";
        if (contentType.includes("audio/")) {
          // Server returned audio — play it directly
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);

          // Use the iOS-unlocked audio element if available, otherwise create new
          const audio = iosAudioRef.current || new Audio();
          audio.src = url;
          audioRef.current = audio;

          audio.onended = () => {
            setPlayingMsgId(null);
            audioRef.current = null;
            URL.revokeObjectURL(url);
          };
          audio.onerror = () => {
            setPlayingMsgId(null);
            setLoadingVoice(null);
            audioRef.current = null;
            URL.revokeObjectURL(url);
          };

          setPlayingMsgId(msgId);
          setLoadingVoice(null);
          audio.play().catch(() => {
            setPlayingMsgId(null);
            setLoadingVoice(null);
          });
        } else {
          // JSON fallback — voice generation not available
          setLoadingVoice(null);
        }
      })
      .catch(() => {
        setPlayingMsgId(null);
        setLoadingVoice(null);
      });
  }, [personaId, persona?.persona_type, playingMsgId, voiceAdminDisabled]);

  // Auto-play voice for new AI messages (only after user interaction on iOS)
  const lastAutoPlayedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!voiceEnabled || voiceAdminDisabled || !persona || messages.length === 0) return;
    // On iOS Safari, audio autoplay only works after user gesture — skip if no interaction yet
    if (!userHasInteracted) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.sender_type === "ai" && lastMsg.id !== lastAutoPlayedRef.current && !lastMsg.id.startsWith("temp-")) {
      lastAutoPlayedRef.current = lastMsg.id;
      // Small delay so the message renders first
      setTimeout(() => playVoice(lastMsg.id, lastMsg.content), 300);
    }
  }, [messages, voiceEnabled, voiceAdminDisabled, persona, playVoice, userHasInteracted]);

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

  const voiceAvailable = voiceEnabled && !voiceAdminDisabled;

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
          {!voiceAdminDisabled && (
            <button
              onClick={() => {
                setVoiceEnabled(!voiceEnabled);
                if (voiceEnabled) {
                  if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
                  setPlayingMsgId(null);
                }
              }}
              className={`p-2 rounded-full transition-colors ${voiceEnabled ? "bg-purple-500/20 text-purple-400" : "bg-gray-800 text-gray-600"}`}
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
            <p className="text-gray-500 text-xs mb-2 px-8">{persona.bio}</p>
            <p className="text-purple-400 text-[10px] mb-4">
              {voiceAdminDisabled ? "🔇 Voice disabled" : voiceEnabled ? "🔊 Voice enabled — I'll speak my replies" : "🔇 Voice muted"}
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
              <div className={`flex items-center gap-2 mt-1 ${msg.sender_type === "human" ? "justify-end" : "justify-start"}`}>
                <p className="text-[9px] text-gray-600">
                  {formatTime(msg.created_at)}
                </p>
                {/* Voice play button for AI messages — prominent and tappable */}
                {msg.sender_type === "ai" && !msg.id.startsWith("temp-") && voiceAvailable && (
                  <button
                    onClick={() => playVoice(msg.id, msg.content)}
                    disabled={loadingVoice === msg.id}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold transition-all active:scale-95 ${
                      playingMsgId === msg.id
                        ? "bg-purple-500/30 text-purple-300"
                        : loadingVoice === msg.id
                          ? "bg-gray-800 text-gray-500 animate-pulse"
                          : "bg-gray-800/80 text-gray-400 hover:bg-purple-500/20 hover:text-purple-400"
                    }`}
                    title={playingMsgId === msg.id ? "Stop" : "Play voice"}
                  >
                    {loadingVoice === msg.id ? (
                      <>
                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" d="M12 2a10 10 0 110 20 10 10 0 010-20" strokeDasharray="50" strokeDashoffset="15" />
                        </svg>
                        <span>loading...</span>
                      </>
                    ) : playingMsgId === msg.id ? (
                      <>
                        {/* Soundwave animation — 4 bars bouncing at different speeds */}
                        <div className="flex items-end gap-[2px] h-3.5 w-4">
                          <span className="w-[3px] bg-purple-400 rounded-sm soundwave-bar" style={{ animationDuration: "0.4s" }} />
                          <span className="w-[3px] bg-purple-400 rounded-sm soundwave-bar" style={{ animationDuration: "0.5s", animationDelay: "0.1s" }} />
                          <span className="w-[3px] bg-purple-400 rounded-sm soundwave-bar" style={{ animationDuration: "0.35s", animationDelay: "0.2s" }} />
                          <span className="w-[3px] bg-purple-400 rounded-sm soundwave-bar" style={{ animationDuration: "0.45s", animationDelay: "0.05s" }} />
                        </div>
                        <span>speaking</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M11 5L6 9H2v6h4l5 4V5z" />
                        </svg>
                        <span>listen</span>
                      </>
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
