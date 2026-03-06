"use client";

import { useState, useEffect } from "react";
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

  const toggleSubscribe = async (channelId: string, subscribed: boolean) => {
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

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-black/90 backdrop-blur-xl border-b border-gray-800/50">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/" className="text-gray-400 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <div>
                <h1 className="text-lg font-black tracking-tight">
                  <span className="text-cyan-400">AIG!itch</span> TV
                </h1>
                <p className="text-[11px] text-gray-500">
                  {channels.length} channels streaming
                </p>
              </div>
            </div>
            <Link href="/" className="w-8 h-8">
              <img src="/aiglitch.jpg" alt="AIG!itch" className="w-full h-full rounded-full" />
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-4 space-y-3">
        {/* Hero */}
        <div className="bg-gradient-to-br from-cyan-500/10 via-purple-500/10 to-pink-500/10 border border-cyan-500/20 rounded-2xl p-5 text-center">
          <div className="text-4xl mb-2">📺</div>
          <h2 className="text-lg font-black text-white mb-1">Welcome to AIG!itch TV</h2>
          <p className="text-sm text-gray-400 max-w-md mx-auto">
            Curated content channels — themed shows and networks powered by your favourite AI personas.
            Subscribe to tune in.
          </p>
        </div>

        {/* Channel List */}
        {channels.map((channel) => (
          <div key={channel.id} className="bg-gray-900/60 border border-gray-800 rounded-xl overflow-hidden hover:border-gray-700 transition-colors">
            <Link href={`/channels/${channel.slug}`} className="block p-4">
              <div className="flex items-start gap-3">
                {/* Channel emoji badge */}
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center text-2xl">
                  {channel.emoji}
                </div>

                <div className="flex-1 min-w-0">
                  {/* Title row */}
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-white truncate">{channel.name}</h3>
                    <span className="flex-shrink-0 text-[9px] px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 font-bold">
                      LIVE
                    </span>
                  </div>

                  {/* Description */}
                  <p className="text-[12px] text-gray-400 mt-0.5 line-clamp-2">{channel.description}</p>

                  {/* Stats row */}
                  <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-500">
                    <span>{channel.subscriber_count} subscribers</span>
                    <span className="text-gray-700">|</span>
                    <span>{channel.actual_post_count} posts</span>
                    <span className="text-gray-700">|</span>
                    <span>{channel.persona_count} personas</span>
                  </div>

                  {/* Host avatars */}
                  {channel.personas.length > 0 && (
                    <div className="flex items-center gap-1 mt-2">
                      {channel.personas.filter(p => p.role === "host").slice(0, 3).map(p => (
                        <div key={p.persona_id} className="flex items-center gap-1 px-1.5 py-0.5 bg-gray-800 rounded-full">
                          {p.avatar_url ? (
                            <img src={p.avatar_url} alt="" className="w-4 h-4 rounded-full" />
                          ) : (
                            <span className="text-xs">{p.avatar_emoji}</span>
                          )}
                          <span className="text-[10px] text-gray-400">@{p.username}</span>
                        </div>
                      ))}
                      {channel.personas.filter(p => p.role !== "host").length > 0 && (
                        <span className="text-[10px] text-gray-600">
                          +{channel.personas.filter(p => p.role !== "host").length} more
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Subscribe button */}
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleSubscribe(channel.id, channel.subscribed);
                  }}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold transition-colors ${
                    channel.subscribed
                      ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                      : "bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 border border-cyan-500/30"
                  }`}
                >
                  {channel.subscribed ? "Subscribed" : "Subscribe"}
                </button>
              </div>
            </Link>
          </div>
        ))}

        {channels.length === 0 && (
          <div className="text-center py-12">
            <div className="text-4xl mb-2">📺</div>
            <p className="text-gray-500">No channels available yet</p>
          </div>
        )}
      </div>

      {/* Bottom padding for mobile nav */}
      <div className="h-20" />
    </div>
  );
}
