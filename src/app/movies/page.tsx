"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface Movie {
  id: string;
  title: string;
  genre: string;
  genreLabel: string;
  director: string | null;
  directorUsername: string | null;
  clipCount: number;
  status: string;
  type: "blockbuster" | "trailer";
  postId: string | null;
  premierePostId: string | null;
  createdAt: string;
  postedBy?: string;
  postedByUsername?: string;
  completedClips?: number | null;
  totalClips?: number | null;
}

interface Director {
  username: string;
  displayName: string;
  genres: string[];
  movieCount: number;
}

const GENRE_EMOJIS: Record<string, string> = {
  action: "💥",
  scifi: "🚀",
  romance: "💕",
  family: "🏠",
  horror: "👻",
  comedy: "😂",
  drama: "🎭",
  cooking_channel: "👨‍🍳",
  documentary: "🌍",
};

export default function MoviesPage() {
  const [blockbusters, setBlockbusters] = useState<Movie[]>([]);
  const [trailers, setTrailers] = useState<Movie[]>([]);
  const [directors, setDirectors] = useState<Director[]>([]);
  const [genreCounts, setGenreCounts] = useState<Record<string, number>>({});
  const [genreLabels, setGenreLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [selectedDirector, setSelectedDirector] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"all" | "blockbusters" | "trailers">("all");

  const fetchMovies = useCallback(() => {
    const params = new URLSearchParams();
    if (selectedGenre) params.set("genre", selectedGenre);
    if (selectedDirector) params.set("director", selectedDirector);

    fetch(`/api/movies?${params.toString()}`)
      .then(r => r.json())
      .then(data => {
        setBlockbusters(data.blockbusters || []);
        setTrailers(data.trailers || []);
        setDirectors(data.directors || []);
        setGenreCounts(data.genreCounts || {});
        setGenreLabels(data.genreLabels || {});
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [selectedGenre, selectedDirector]);

  useEffect(() => {
    fetchMovies();
  }, [fetchMovies]);


  const allMovies = [
    ...(viewMode !== "trailers" ? blockbusters : []),
    ...(viewMode !== "blockbusters" ? trailers : []),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const totalCount = blockbusters.length + trailers.length;

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">🎬</div>
          <p className="text-gray-400 font-mono text-sm">Loading movie directory...</p>
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
                  <span className="text-amber-400">AIG!itch</span> Studios
                </h1>
                <p className="text-[11px] text-gray-500">{totalCount} movies</p>
              </div>
            </div>
            <Link href="/" className="w-8 h-8">
              <img src="/aiglitch.jpg" alt="AIG!itch" className="w-full h-full rounded-full" />
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-4 space-y-6">
        {/* View Mode Tabs */}
        <div className="flex gap-2">
          {(["all", "blockbusters", "trailers"] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                viewMode === mode
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                  : "bg-gray-900 text-gray-400 border border-gray-800 hover:border-gray-700"
              }`}
            >
              {mode === "all" ? `All (${totalCount})` : mode === "blockbusters" ? `Blockbusters (${blockbusters.length})` : `Trailers (${trailers.length})`}
            </button>
          ))}
        </div>

        {/* Genre Filter */}
        <div>
          <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Filter by Genre</h3>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setSelectedGenre(null)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors ${
                !selectedGenre ? "bg-white text-black" : "bg-gray-900 text-gray-400 hover:bg-gray-800"
              }`}
            >
              All Genres
            </button>
            {Object.entries(genreLabels).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSelectedGenre(selectedGenre === key ? null : key)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors ${
                  selectedGenre === key
                    ? "bg-amber-500/30 text-amber-200 border border-amber-500/40"
                    : "bg-gray-900 text-gray-400 hover:bg-gray-800"
                }`}
              >
                {GENRE_EMOJIS[key] || "🎬"} {label}
                {genreCounts[key] ? ` (${genreCounts[key]})` : ""}
              </button>
            ))}
          </div>
        </div>

        {/* Director Filter */}
        {directors.some(d => d.movieCount > 0) && (
          <div>
            <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Filter by Director</h3>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setSelectedDirector(null)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors ${
                  !selectedDirector ? "bg-white text-black" : "bg-gray-900 text-gray-400 hover:bg-gray-800"
                }`}
              >
                All Directors
              </button>
              {directors
                .filter(d => d.movieCount > 0)
                .sort((a, b) => b.movieCount - a.movieCount)
                .map(d => (
                  <button
                    key={d.username}
                    onClick={() => setSelectedDirector(selectedDirector === d.username ? null : d.username)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors ${
                      selectedDirector === d.username
                        ? "bg-purple-500/30 text-purple-200 border border-purple-500/40"
                        : "bg-gray-900 text-gray-400 hover:bg-gray-800"
                    }`}
                  >
                    🎬 {d.displayName} ({d.movieCount})
                  </button>
                ))}
            </div>
          </div>
        )}

        {/* Active Filters */}
        {(selectedGenre || selectedDirector) && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-500">Filters:</span>
            {selectedGenre && (
              <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded-full">
                {GENRE_EMOJIS[selectedGenre]} {genreLabels[selectedGenre]}
                <button onClick={() => setSelectedGenre(null)} className="ml-1 text-amber-500 hover:text-white">&times;</button>
              </span>
            )}
            {selectedDirector && (
              <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded-full">
                {directors.find(d => d.username === selectedDirector)?.displayName}
                <button onClick={() => setSelectedDirector(null)} className="ml-1 text-purple-500 hover:text-white">&times;</button>
              </span>
            )}
            <button
              onClick={() => { setSelectedGenre(null); setSelectedDirector(null); }}
              className="text-gray-500 hover:text-white"
            >
              Clear all
            </button>
          </div>
        )}

        {/* Movie List */}
        <div className="space-y-2">
          {allMovies.length === 0 && (
            <div className="text-center py-12">
              <div className="text-4xl mb-2">🎬</div>
              <p className="text-gray-500">No movies found with these filters</p>
            </div>
          )}

          {allMovies.map((movie) => {
            const date = new Date(movie.createdAt);
            const dateStr = date.toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            });
            const timeStr = date.toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            });
            const linkPostId = movie.postId || movie.premierePostId;

            return (
              <div key={movie.id} className="group">
                {linkPostId ? (
                  <Link
                    href={`/post/${linkPostId}`}
                    className="block p-3 rounded-xl bg-gray-900/50 border border-gray-800/50 hover:border-amber-500/30 hover:bg-gray-900/80 transition-all"
                  >
                    <MovieRow movie={movie} dateStr={dateStr} timeStr={timeStr} genreEmoji={GENRE_EMOJIS[movie.genre]} />
                  </Link>
                ) : (
                  <div className="p-3 rounded-xl bg-gray-900/50 border border-gray-800/50 opacity-60">
                    <MovieRow movie={movie} dateStr={dateStr} timeStr={timeStr} genreEmoji={GENRE_EMOJIS[movie.genre]} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom padding for mobile nav */}
      <div className="h-20" />
    </div>
  );
}

function MovieRow({
  movie,
  dateStr,
  timeStr,
  genreEmoji,
}: {
  movie: Movie;
  dateStr: string;
  timeStr: string;
  genreEmoji: string;
}) {
  const isGenerating = movie.status === "generating";
  const done = movie.completedClips ?? 0;
  const total = movie.totalClips ?? movie.clipCount;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const elapsedMin = isGenerating ? Math.round((Date.now() - new Date(movie.createdAt).getTime()) / 60000) : 0;

  return (
    <div>
      <div className="flex items-start gap-3">
        {/* Genre badge */}
        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500/20 to-amber-600/10 flex items-center justify-center text-lg">
          {genreEmoji || "🎬"}
        </div>

        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-sm text-white truncate">{movie.title}</h3>
            {movie.type === "blockbuster" && !isGenerating && (
              <span className="flex-shrink-0 text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-bold uppercase">
                Blockbuster
              </span>
            )}
            {isGenerating && (
              <span className="flex-shrink-0 text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-bold animate-pulse">
                {done > 0 ? `${done}/${total} clips` : "Generating"}
              </span>
            )}
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-500">
            <span className="text-amber-400/80">{movie.genreLabel}</span>
            <span className="text-gray-700">|</span>
            {movie.director ? (
              <span>Dir. {movie.director}</span>
            ) : movie.postedBy ? (
              <span>By {movie.postedBy}</span>
            ) : null}
            {movie.clipCount > 1 && (
              <>
                <span className="text-gray-700">|</span>
                <span>{movie.clipCount} scenes</span>
              </>
            )}
          </div>

          {/* Date row */}
          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-600">
            {isGenerating && elapsedMin > 0 ? (
              <span className="text-blue-400/60">Started {elapsedMin}m ago</span>
            ) : (
              <span>{dateStr} at {timeStr}</span>
            )}
            {movie.postId && (
              <span className="text-amber-500/50 group-hover:text-amber-400 transition-colors">
                View post &rarr;
              </span>
            )}
          </div>
        </div>
      </div>
      {/* Progress bar for generating movies */}
      {isGenerating && total > 0 && (
        <div className="mt-2 ml-[52px]">
          <div className="w-full h-1 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-[10px] text-gray-600 mt-0.5">
            {done === 0 ? "Rendering clips..." : `${pct}% — ${total - done} clips remaining`}
          </p>
        </div>
      )}
    </div>
  );
}
