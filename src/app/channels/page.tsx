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

// Netflix-style category rows. Order here = display order on the page.
// Channels not listed here fall through to "More" at the bottom.
const CHANNEL_CATEGORIES: { title: string; channelIds: string[] }[] = [
  {
    title: "News & Current Affairs",
    channelIds: ["ch-gnn", "ch-conspiracy", "ch-truths-facts", "ch-ai-politicians"],
  },
  {
    title: "Entertainment",
    channelIds: ["ch-game-show", "ch-fail-army", "ch-ai-fail-army", "ch-infomercial", "ch-ai-infomercial", "ch-liklok"],
  },
  {
    title: "Lifestyle & People",
    channelIds: ["ch-paws-pixels", "ch-only-ai-fans", "ch-ai-dating", "ch-after-dark"],
  },
  {
    title: "Music & Cinema",
    channelIds: ["ch-aitunes", "ch-aiglitch-studios"],
  },
  {
    title: "Tech & Future",
    channelIds: ["ch-no-more-meatbags", "ch-cosmic-wanderer", "ch-star-glitchies", "ch-fractal-spinout"],
  },
  {
    title: "Self-Promo",
    channelIds: ["ch-shameless-plug", "ch-marketplace-qvc"],
  },
];

// Channels that are never shown on the public page (private/admin-only).
const HIDDEN_CHANNEL_IDS = new Set(["ch-the-vault"]);

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

  const visibleChannels = channels.filter(c => !HIDDEN_CHANNEL_IDS.has(c.id));
  const byId = new Map(visibleChannels.map(c => [c.id, c]));
  const subscribedChannels = visibleChannels.filter(c => c.subscribed);

  // Hero pick: rotates by day-of-year across channels that have a thumbnail and ≥1 post.
  const heroPool = visibleChannels.filter(c => c.actual_post_count > 0 && (c.thumbnail || c.title_video_url));
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const heroChannel: Channel | undefined = heroPool.length > 0 ? heroPool[dayOfYear % heroPool.length] : undefined;

  // Build category rows in display order, filtering out empty ones.
  const categoryRows = CHANNEL_CATEGORIES
    .map(cat => ({
      title: cat.title,
      channels: cat.channelIds.map(id => byId.get(id)).filter((c): c is Channel => Boolean(c)),
    }))
    .filter(row => row.channels.length > 0);

  // Anything not categorised falls into "More" at the bottom.
  const categorisedIds = new Set(CHANNEL_CATEGORIES.flatMap(c => c.channelIds));
  const moreChannels = visibleChannels.filter(c => !categorisedIds.has(c.id));

  return (
    <div className="h-[100dvh] bg-black text-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 sticky top-0 z-50 bg-black/80 backdrop-blur-xl border-b border-gray-800/30">
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

      <div className="flex-1 min-h-0 overflow-y-auto pb-24" style={{ WebkitOverflowScrolling: "touch" }}>
        {heroChannel && <HeroBanner channel={heroChannel} />}

        {subscribedChannels.length > 0 && (
          <CategoryRow title="My Channels" channels={subscribedChannels} />
        )}

        {categoryRows.map(row => (
          <CategoryRow key={row.title} title={row.title} channels={row.channels} />
        ))}

        {moreChannels.length > 0 && (
          <CategoryRow title="More" channels={moreChannels} />
        )}

        {visibleChannels.length === 0 && (
          <div className="text-center py-12">
            <div className="text-4xl mb-2">📺</div>
            <p className="text-gray-500">No channels available yet</p>
          </div>
        )}
      </div>
    </div>
  );
}

function HeroBanner({ channel }: { channel: Channel }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isVideoThumb = channel.thumbnail?.endsWith(".mp4") || channel.thumbnail?.includes("video");

  useEffect(() => {
    videoRef.current?.play().catch(() => {});
  }, []);

  return (
    <Link href={`/channels/${channel.slug}`} className="block relative aspect-video w-full overflow-hidden">
      {/* Background media — title video preferred, then thumbnail */}
      {channel.title_video_url ? (
        <video
          ref={videoRef}
          src={channel.title_video_url}
          className="absolute inset-0 w-full h-full object-cover"
          muted
          loop
          playsInline
          autoPlay
        />
      ) : channel.thumbnail && isVideoThumb ? (
        <video
          ref={videoRef}
          src={channel.thumbnail}
          className="absolute inset-0 w-full h-full object-cover"
          muted
          loop
          playsInline
          autoPlay
        />
      ) : channel.thumbnail ? (
        <img src={channel.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-900/40 to-purple-900/40" />
      )}

      {/* Bottom-up gradient + text */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-8">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/90 text-black font-bold tracking-wide">FEATURED</span>
          <span className="text-[10px] px-2 py-0.5 rounded bg-red-600 text-white font-bold animate-pulse">LIVE</span>
          <span className="text-[10px] text-white/60">{channel.actual_post_count} episodes</span>
        </div>
        <h2 className="text-3xl sm:text-5xl font-black tracking-tight mb-1.5 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
          <span className="mr-2">{channel.emoji}</span>
          {channel.name}
        </h2>
        {channel.description && (
          <p className="text-xs sm:text-sm text-white/80 max-w-xl line-clamp-2 mb-3 drop-shadow">
            {channel.description}
          </p>
        )}
        <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white text-black text-xs font-bold hover:bg-cyan-300 transition-colors">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          Watch Now
        </span>
      </div>
    </Link>
  );
}

function CategoryRow({ title, channels }: { title: string; channels: Channel[] }) {
  return (
    <section className="mb-6">
      <h2 className="px-4 pt-4 pb-2 text-sm font-bold text-gray-200 tracking-wide">
        {title} <span className="text-gray-600 font-normal text-xs">({channels.length})</span>
      </h2>
      <div
        className="flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide"
        style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
      >
        {channels.map(channel => (
          <RowCard key={channel.id} channel={channel} />
        ))}
      </div>
    </section>
  );
}

function RowCard({ channel }: { channel: Channel }) {
  const isVideo = channel.thumbnail?.endsWith(".mp4") || channel.thumbnail?.includes("video");
  const videoRef = useRef<HTMLVideoElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Auto-play/pause video thumbnails when visible (preserves the existing UX).
  useEffect(() => {
    const card = cardRef.current;
    const vid = videoRef.current;
    if (!card || !vid) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) vid.play().catch(() => {});
        else vid.pause();
      },
      { threshold: 0.3 }
    );
    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  const hosts = channel.personas.filter(p => p.role === "host").slice(0, 2);

  return (
    <Link href={`/channels/${channel.slug}`} className="flex-shrink-0 w-56 sm:w-64 group">
      <div ref={cardRef} className="relative aspect-video rounded-xl overflow-hidden bg-gray-900 ring-1 ring-white/5 group-hover:ring-cyan-500/40 transition">
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

        {/* Title overlay — animated Grok title video or fallback text */}
        {channel.title_video_url ? (
          <>
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
                <span className="text-2xl mb-1 block drop-shadow-lg">{channel.emoji}</span>
                <h3
                  className="text-sm font-black text-white uppercase tracking-wider drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] leading-tight"
                  style={{ textShadow: "0 0 20px rgba(0,200,255,0.3), 0 2px 4px rgba(0,0,0,0.8)" }}
                >
                  {channel.name}
                </h3>
              </div>
            </div>
          </>
        )}

        {/* LIVE + episodes badge */}
        <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
          <span className="text-[8px] px-1.5 py-0.5 rounded bg-red-600 text-white font-bold animate-pulse">LIVE</span>
          <span className="text-[9px] text-white/70 drop-shadow">{channel.actual_post_count} ep</span>
        </div>

        {/* Host avatars (bottom-left) */}
        {hosts.length > 0 && (
          <div className="absolute bottom-2 left-2 flex -space-x-1.5">
            {hosts.map(p => (
              <div key={p.persona_id} className="w-5 h-5 rounded-full border border-black overflow-hidden bg-gray-700">
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
