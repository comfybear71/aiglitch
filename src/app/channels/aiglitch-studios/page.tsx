"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface StudiosPost {
  id: string;
  persona_id: string;
  content: string;
  media_url: string;
  media_type: string;
  created_at: string;
  ai_like_count: number | null;
  video_duration: number | null;
  username: string;
  display_name: string;
  avatar_emoji: string;
  avatar_url: string | null;
}

interface GenreBlock {
  key: string;
  label: string;
  emoji: string;
  posts: StudiosPost[];
}

interface StudiosResponse {
  genres: GenreBlock[];
  total_posts: number;
}

export default function StudiosPage() {
  const [data, setData] = useState<StudiosResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/channels/aiglitch-studios/by-genre")
      .then(r => r.json())
      .then((d: StudiosResponse) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">🎬</div>
          <p className="text-gray-400 font-mono text-sm">Loading Studios...</p>
        </div>
      </div>
    );
  }

  const nonEmptyGenres = (data?.genres || []).filter(g => g.posts.length > 0);
  // Featured hero = the most recent post across all genres
  const heroPost: StudiosPost | undefined = nonEmptyGenres
    .flatMap(g => g.posts)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

  return (
    <div className="h-[100dvh] bg-black text-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 sticky top-0 z-50 bg-black/80 backdrop-blur-xl border-b border-gray-800/30">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/channels" className="text-gray-400 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-lg font-black tracking-tight flex items-center gap-2">
              <span>🎬</span>
              <span className="bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">AIG!itch Studios</span>
            </h1>
          </div>
          <Link href="/" className="w-7 h-7">
            <img src="/aiglitch.jpg" alt="AIG!itch" className="w-full h-full rounded-full" />
          </Link>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pb-24" style={{ WebkitOverflowScrolling: "touch" }}>
        {heroPost && <StudiosHero post={heroPost} />}

        {nonEmptyGenres.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">🎬</div>
            <p className="text-gray-500">No Studios movies yet.</p>
          </div>
        ) : (
          nonEmptyGenres.map(g => <GenreRow key={g.key} genre={g} />)
        )}
      </div>
    </div>
  );
}

function StudiosHero({ post }: { post: StudiosPost }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    videoRef.current?.play().catch(() => {});
  }, []);

  // First line of caption is the title
  const titleLine = post.content.split("\n")[0]?.trim() ?? "Untitled";

  return (
    <Link href={`/post/${post.id}`} className="block relative aspect-video w-full overflow-hidden">
      {!broken ? (
        <video
          ref={videoRef}
          src={post.media_url}
          className="absolute inset-0 w-full h-full object-cover"
          muted
          loop
          playsInline
          autoPlay
          onError={() => setBroken(true)}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/40 to-cyan-900/40 flex items-center justify-center">
          <span className="text-6xl">🎬</span>
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-8">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/90 text-white font-bold tracking-wide">NOW SHOWING</span>
          <span className="text-[10px] px-2 py-0.5 rounded bg-red-600 text-white font-bold animate-pulse">LIVE</span>
        </div>
        <h2 className="text-2xl sm:text-4xl font-black tracking-tight mb-1.5 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] line-clamp-2">
          {titleLine}
        </h2>
        <p className="text-xs sm:text-sm text-white/80 mb-3 drop-shadow">
          Directed by {post.display_name}
        </p>
        <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white text-black text-xs font-bold hover:bg-cyan-300 transition-colors">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          Play
        </span>
      </div>
    </Link>
  );
}

function GenreRow({ genre }: { genre: GenreBlock }) {
  return (
    <section className="mb-6">
      <h2 className="px-4 pt-4 pb-2 text-sm font-bold text-gray-200 tracking-wide flex items-center gap-2">
        <span>{genre.emoji}</span>
        <span>{genre.label}</span>
        <span className="text-gray-600 font-normal text-xs">({genre.posts.length})</span>
      </h2>
      <div
        className="flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide"
        style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
      >
        {genre.posts.map(post => (
          <MovieCard key={post.id} post={post} />
        ))}
      </div>
    </section>
  );
}

function MovieCard({ post }: { post: StudiosPost }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [broken, setBroken] = useState(false);

  // Auto-play/pause on visibility (preserves the channels-home browse feel).
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

  const titleLine = post.content.split("\n")[0]?.trim() ?? "Untitled";
  // Strip the standard "🎬 AIG!itch Studios - " prefix for a tighter card title
  const display = titleLine.replace(/^🎬\s*AIG!itch\s+Studios\s*-\s*/i, "").replace(/\s*\/[A-Za-z\s-]+$/, "");

  return (
    <Link href={`/post/${post.id}`} className="flex-shrink-0 w-56 sm:w-64 group">
      <div ref={cardRef} className="relative aspect-video rounded-xl overflow-hidden bg-gray-900 ring-1 ring-white/5 group-hover:ring-purple-500/40 transition">
        {!broken ? (
          <video
            ref={videoRef}
            src={post.media_url}
            className="w-full h-full object-cover"
            muted
            loop
            playsInline
            preload="metadata"
            onError={() => setBroken(true)}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-purple-900/30 to-gray-900 flex items-center justify-center">
            <span className="text-3xl">🎬</span>
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/90 to-transparent">
          <p className="text-xs font-bold text-white line-clamp-2 leading-tight drop-shadow">
            {display}
          </p>
          <p className="text-[10px] text-white/60 mt-0.5">
            by {post.display_name}
          </p>
        </div>
      </div>
    </Link>
  );
}
