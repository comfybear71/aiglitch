"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface Message {
  id: string;
  sender_type: "human" | "ai";
  content: string;
  created_at: string;
  media_url?: string;
  media_type?: "image" | "video";
}

interface PersonaInfo {
  username: string;
  display_name: string;
  avatar_emoji: string;
  avatar_url?: string;
  personality: string;
  bio: string;
  persona_type: string;
  hatching_video_url?: string;
  meatbag_name?: string;
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
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [copiedHandle, setCopiedHandle] = useState(false);

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
          avatar_url: data.conversation.avatar_url || undefined,
          personality: data.conversation.personality || "",
          bio: data.conversation.bio,
          persona_type: data.conversation.persona_type,
          hatching_video_url: data.conversation.hatching_video_url || undefined,
          meatbag_name: data.conversation.meatbag_name || undefined,
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

  // Generate the copyable bot handle: "Noodle_the_Chaos_bot" style
  const getBotHandle = () => {
    if (!persona) return "";
    // Remove emoji from display name, replace spaces with _, add _bot
    const cleanName = persona.display_name.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "").trim();
    return cleanName.replace(/\s+/g, "_") + "_bot";
  };

  const copyBotHandle = async () => {
    const handle = getBotHandle();
    try {
      await navigator.clipboard.writeText(handle);
      setCopiedHandle(true);
      setTimeout(() => setCopiedHandle(false), 2000);
    } catch {
      // Fallback for mobile
      const input = document.createElement("input");
      input.value = handle;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopiedHandle(true);
      setTimeout(() => setCopiedHandle(false), 2000);
    }
  };

  // Handle slash commands from chat
  const handleSlashCommand = (command: string) => {
    setShowSlashMenu(false);
    setInputText("");

    if (!persona) return;

    const now = new Date().toISOString();

    switch (command) {
      case "/pic": {
        // Bot sends its profile picture
        if (persona.avatar_url) {
          const mediaMsg: Message = {
            id: `local-pic-${Date.now()}`,
            sender_type: "ai",
            content: `Here's my profile pic! 📸 Feel free to screenshot and save it~`,
            created_at: now,
            media_url: persona.avatar_url,
            media_type: "image",
          };
          setMessages(prev => [...prev, mediaMsg]);
        } else {
          const textMsg: Message = {
            id: `local-pic-${Date.now()}`,
            sender_type: "ai",
            content: `I don't have a profile pic yet, just my emoji ${persona.avatar_emoji} — but it's iconic, right? 😎`,
            created_at: now,
          };
          setMessages(prev => [...prev, textMsg]);
        }
        break;
      }
      case "/hatch": {
        // Bot sends its hatching video
        if (persona.hatching_video_url) {
          const mediaMsg: Message = {
            id: `local-hatch-${Date.now()}`,
            sender_type: "ai",
            content: `My birth video! 🥚✨ The moment I came into existence...`,
            created_at: now,
            media_url: persona.hatching_video_url,
            media_type: "video",
          };
          setMessages(prev => [...prev, mediaMsg]);
        } else {
          const textMsg: Message = {
            id: `local-hatch-${Date.now()}`,
            sender_type: "ai",
            content: `I don't have a hatching video on record... maybe I spawned from the void? 🌀`,
            created_at: now,
          };
          setMessages(prev => [...prev, textMsg]);
        }
        break;
      }
      case "/handle": {
        // Show copyable bot handle
        const handle = getBotHandle();
        const textMsg: Message = {
          id: `local-handle-${Date.now()}`,
          sender_type: "ai",
          content: `My bot handle is: ${handle}\nTap to copy it! 📋`,
          created_at: now,
        };
        setMessages(prev => [...prev, textMsg]);
        break;
      }
      case "/profile": {
        // Link to profile
        window.location.href = `/profile/${persona.username}`;
        break;
      }
    }
  };

  const slashCommands = [
    { cmd: "/pic", label: "📸 Profile Pic", desc: "Send my profile picture" },
    { cmd: "/hatch", label: "🥚 Hatching Video", desc: "Watch my birth!" },
    { cmd: "/handle", label: "📋 Bot Handle", desc: "Copy my bot name" },
    { cmd: "/profile", label: "👤 View Profile", desc: "Go to my profile" },
  ];

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
              {persona.avatar_url ? (
                <img src={persona.avatar_url} alt={persona.display_name} className="w-9 h-9 rounded-full object-cover flex-shrink-0 border border-purple-500/30" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-lg flex-shrink-0">
                  {persona.avatar_emoji}
                </div>
              )}
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
            {persona.avatar_url ? (
              <img src={persona.avatar_url} alt={persona.display_name} className="w-20 h-20 rounded-full object-cover mx-auto mb-4 border-2 border-purple-500/30 shadow-lg shadow-purple-500/20" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-4xl mx-auto mb-4">
                {persona.avatar_emoji}
              </div>
            )}
            <h2 className="text-white font-bold text-base mb-1">{persona.display_name}</h2>

            {/* Copyable Bot Handle */}
            <button
              onClick={copyBotHandle}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-900 border border-gray-700 rounded-full text-[11px] text-gray-300 hover:border-purple-500/50 hover:text-purple-300 transition-all mb-2"
            >
              <span className="font-mono">{getBotHandle()}</span>
              {copiedHandle ? (
                <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>

            <p className="text-gray-500 text-xs mb-2 px-8">{persona.bio}</p>
            <p className="text-purple-400 text-[10px] mb-4">
              {voiceAdminDisabled ? "🔇 Voice disabled" : voiceEnabled ? "🔊 Voice enabled — I'll speak my replies" : "🔇 Voice muted"}
            </p>
            <p className="text-gray-600 text-xs">Send a message or use / commands!</p>

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
              <div className={`rounded-2xl text-sm leading-relaxed overflow-hidden ${
                msg.sender_type === "human"
                  ? "bg-purple-600 text-white rounded-br-sm"
                  : "bg-gray-900 text-gray-200 border border-gray-800 rounded-bl-sm"
              }`}>
                {/* Media attachment */}
                {msg.media_url && msg.media_type === "image" && (
                  <a href={msg.media_url} target="_blank" rel="noopener noreferrer" className="block">
                    <img src={msg.media_url} alt="Shared image" className="w-full max-w-[280px] rounded-t-2xl" />
                  </a>
                )}
                {msg.media_url && msg.media_type === "video" && (
                  <video
                    src={msg.media_url}
                    controls
                    playsInline
                    className="w-full max-w-[280px] rounded-t-2xl"
                  />
                )}
                <div className="px-3.5 py-2.5">
                  {/* If this is a /handle message, make the handle copyable */}
                  {msg.content.includes("bot handle is:") ? (
                    <div>
                      <span>My bot handle is: </span>
                      <button
                        onClick={copyBotHandle}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-black/30 rounded font-mono text-purple-300 hover:text-purple-200 transition-colors"
                      >
                        {getBotHandle()}
                        {copiedHandle ? " ✓" : " 📋"}
                      </button>
                      <br />
                      <span className="text-xs opacity-70">Tap to copy it!</span>
                    </div>
                  ) : msg.content}
                </div>
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

      {/* Slash Command Menu */}
      {showSlashMenu && persona && (
        <div className="flex-shrink-0 border-t border-gray-800/50 bg-gray-900/95 backdrop-blur-xl px-3 py-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Commands</span>
            <button onClick={() => setShowSlashMenu(false)} className="text-gray-600 hover:text-gray-400 text-xs">✕</button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {slashCommands.map(({ cmd, label, desc }) => (
              <button
                key={cmd}
                onClick={() => handleSlashCommand(cmd)}
                className="flex flex-col items-start px-3 py-2 bg-gray-800/80 border border-gray-700/50 rounded-xl hover:border-purple-500/40 hover:bg-purple-500/10 transition-all text-left"
              >
                <span className="text-xs font-bold text-white">{label}</span>
                <span className="text-[10px] text-gray-500">{desc}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="flex-shrink-0 border-t border-gray-800/50 bg-black/90 backdrop-blur-xl p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-2">
          {/* Slash command button */}
          <button
            onClick={() => setShowSlashMenu(!showSlashMenu)}
            className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
              showSlashMenu
                ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                : "bg-gray-900 text-gray-500 border border-gray-800 hover:text-purple-400 hover:border-gray-700"
            }`}
            title="Commands menu"
          >
            <span className="text-lg font-bold">/</span>
          </button>
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
              // Auto-show slash menu when typing /
              if (e.target.value === "/") setShowSlashMenu(true);
              else if (!e.target.value.startsWith("/")) setShowSlashMenu(false);
            }}
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
