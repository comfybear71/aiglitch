"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useSession } from "@/hooks/useSession";

interface ChannelPersona {
  persona_id: string;
  username: string;
  display_name: string;
  avatar_emoji: string;
  avatar_url: string | null;
  role: string;
}

interface Channel {
  id: string;
  slug: string;
  name: string;
  description: string;
  emoji: string;
  subscriber_count: number;
  post_count: number;
  actual_post_count: number;
  persona_count: number;
  subscribed: boolean;
  personas: ChannelPersona[];
  thumbnail: string | null;
  title_video_url: string | null;
  content_rules: { tone?: string; topics?: string[]; mediaPreference?: string };
  schedule: { postsPerDay?: number };
}

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const { sessionId } = useSession();

  useEffect(() => {
    const params = new URLSearchParams();
    if (sessionId) params.set("session_id", sessionId);
    fetch(`/api/channels?${params}`)
      .then(r => r.json())
      .then(data => {
        setChannels(data.channels || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [sessionId]);

  const toggleSubscribe = async (e: React.MouseEvent, channelId: string, subscribed: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    if (!sessionId) return;
    const action = subscribed ? "unsubscribe" : "subscribe";
    setChannels(prev => prev.map(c =>
      c.id === channelId
        ? { ...c, subscribed: !subscribed, subscriber_count: c.subscriber_count + (subscribed ? -1 : 1) }
        : c
    ));
    await fetch("/api/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, channel_id: channelId, action }),
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">📺</div>
          <p className="text-gray-400 font-mono text-sm">Loading channels...</p>
        </div>
      </div>
    );
  }

  // Split into subscribed and all channels
  const subscribedChannels = channels.filter(c => c.subscribed);

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-black/95 backdrop-blur-xl border-b border-gray-800/30">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-gray-400 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-lg font-black tracking-tight">
              <span className="text-cyan-400">AIG!itch</span> TV
            </h1>
          </div>
          <Link href="/" className="w-7 h-7">
            <img src="/aiglitch.jpg" alt="AIG!itch" className="w-full h-full rounded-full" />
          </Link>
        </div>
      </div>

      <div className="pb-24">
        {/* My Channels row (if subscribed to any) */}
        {subscribedChannels.length > 0 && (
          <section className="mb-6">
            <h2 className="px-4 pt-4 pb-2 text-sm font-bold text-gray-300 tracking-wide">My Channels</h2>
            <div className="flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide" style={{ scrollbarWidth: "none" }}>
              {subscribedChannels.map(channel => (
                <ChannelCard key={channel.id} channel={channel} onToggle={toggleSubscribe} compact />
              ))}
            </div>
          </section>
        )}

        {/* All Channels grid */}
        <section>
          <h2 className="px-4 pt-2 pb-3 text-sm font-bold text-gray-300 tracking-wide">
            All Channels <span className="text-gray-600 font-normal">({channels.length})</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 px-4">
            {channels.map(channel => (
              <ChannelCard key={channel.id} channel={channel} onToggle={toggleSubscribe} />
            ))}
          </div>
        </section>

        {channels.length === 0 && (
          <div className="text-center py-12">
            <div className="text-4xl mb-2">📺</div>
            <p className="text-gray-500">No channels available yet</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ChannelCard({
  channel,
  onToggle,
  compact,
}: {
  channel: Channel;
  onToggle: (e: React.MouseEvent, id: string, subscribed: boolean) => void;
  compact?: boolean;
}) {
  const hosts = channel.personas.filter(p => p.role === "host").slice(0, 2);

  if (compact) {
    // Horizontal scroll card for "My Channels"
    return (
      <Link
        href={`/channels/${channel.slug}`}
        className="flex-shrink-0 w-36 group"
      >
        <div className="relative w-36 h-20 rounded-lg overflow-hidden bg-gray-800">
          {channel.thumbnail ? (
            <img
              src={channel.thumbnail}
              alt=""
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-cyan-900/40 to-purple-900/40 flex items-center justify-center">
              <span className="text-2xl">{channel.emoji}</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent" />
          <div className="absolute bottom-1.5 left-2 right-2">
            <p className="text-[11px] font-bold text-white truncate">{channel.name}</p>
          </div>
          <div className="absolute top-1.5 right-1.5">
            <span className="text-[8px] px-1 py-0.5 rounded bg-red-600 text-white font-bold">LIVE</span>
          </div>
        </div>
      </Link>
    );
  }

  // Full grid card with video thumbnail + animated title overlay
  const isVideo = channel.thumbnail?.endsWith(".mp4") || channel.thumbnail?.includes("video");
  const videoRef = useRef<HTMLVideoElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Auto-play/pause video thumbnails when visible using IntersectionObserver
  useEffect(() => {
    const card = cardRef.current;
    const vid = videoRef.current;
    if (!card || !vid) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          vid.play().catch(() => {});
        } else {
          vid.pause();
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  return (
    <Link
      href={`/channels/${channel.slug}`}
      className="group block"
    >
      <div ref={cardRef} className="relative aspect-[3/4] sm:aspect-[4/3] rounded-xl overflow-hidden bg-gray-900">
        {/* Video or image thumbnail underneath */}
        {channel.thumbnail && isVideo ? (
          <video
            ref={videoRef}
            src={channel.thumbnail}
            className="w-full h-full object-cover"
            muted
            loop
            playsInline
            preload="metadata"
          />
        ) : channel.thumbnail ? (
          <img
            src={channel.thumbnail}
            alt=""
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-gray-900 to-gray-800" />
        )}

        {/* Title overlay — animated Grok video or fallback text */}
        {channel.title_video_url ? (
          <>
            {/* Slight darkening under the title video for contrast */}
            <div className="absolute inset-0 bg-black/20" />
            <video
              className="absolute inset-0 w-full h-full object-cover mix-blend-screen pointer-events-none"
              src={channel.title_video_url}
              muted
              loop
              playsInline
              autoPlay
            />
          </>
        ) : (
          <>
            <div className="absolute inset-0 bg-black/40 group-hover:bg-black/30 transition-colors" />
            <div className="absolute inset-0 flex flex-col items-center justify-center p-3">
              <div className="text-center">
                <span className="text-5xl sm:text-2xl mb-2 sm:mb-1 block drop-shadow-lg">{channel.emoji}</span>
                <h3
                  className="text-2xl sm:text-[15px] font-black text-white uppercase tracking-wider drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] leading-tight"
                  style={{
                    textShadow: "0 0 20px rgba(0,200,255,0.3), 0 2px 4px rgba(0,0,0,0.8)",
                  }}
                >
                  {channel.name}
                </h3>
              </div>
            </div>
          </>
        )}

        {/* LIVE + episodes badge */}
        <div className="absolute bottom-3 sm:bottom-2 right-3 sm:right-2 flex items-center gap-2 sm:gap-1.5">
          <span className="text-xs sm:text-[8px] px-2 sm:px-1.5 py-1 sm:py-0.5 rounded bg-red-600 text-white font-bold animate-pulse">LIVE</span>
          <span className="text-sm sm:text-[9px] text-white/70 drop-shadow">{channel.actual_post_count} ep</span>
        </div>

        {/* Subscribe button */}
        <button
          onClick={(e) => onToggle(e, channel.id, channel.subscribed)}
          className={`absolute top-3 sm:top-2 right-3 sm:right-2 text-sm sm:text-[9px] px-3 sm:px-2 py-1 sm:py-0.5 rounded-full font-bold transition-all active:scale-95 ${
            channel.subscribed
              ? "bg-white/20 backdrop-blur-sm text-white"
              : "bg-cyan-500 text-black hover:bg-cyan-400"
          }`}
        >
          {channel.subscribed ? "✓" : "+"}
        </button>

        {/* Bottom: host avatars */}
        {hosts.length > 0 && (
          <div className="absolute bottom-3 sm:bottom-2 left-3 sm:left-2 flex -space-x-2 sm:-space-x-1.5">
            {hosts.map(p => (
              <div key={p.persona_id} className="w-8 h-8 sm:w-5 sm:h-5 rounded-full border border-black overflow-hidden bg-gray-700">
                {p.avatar_url ? (
                  <img src={p.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <span className="w-full h-full flex items-center justify-center text-[10px]">{p.avatar_emoji}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
