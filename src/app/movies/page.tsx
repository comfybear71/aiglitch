"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  const [viewMode, setViewMode] = useState<"all" | "blockbusters" | "trailers" | "directors">("all");
  const [expandedDirector, setExpandedDirector] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Auto-refresh every 10s when any movie is still generating
  const hasGenerating = blockbusters.some(m => m.status === "generating");
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (hasGenerating) {
      pollRef.current = setInterval(fetchMovies, 10_000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [hasGenerating, fetchMovies]);

  const allMovies = [
    ...(viewMode !== "trailers" ? blockbusters : []),
    ...(viewMode !== "blockbusters" ? trailers : []),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const totalCount = blockbusters.length + trailers.length;

  // Build director filmographies from blockbusters
  const directorFilmographies: Record<string, Movie[]> = {};
  for (const movie of blockbusters) {
    if (movie.directorUsername) {
      if (!directorFilmographies[movie.directorUsername]) {
        directorFilmographies[movie.directorUsername] = [];
      }
      directorFilmographies[movie.directorUsername].push(movie);
    }
  }

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
                <p className="text-[11px] text-gray-500">
                  {totalCount} movies
                  {hasGenerating && <span className="ml-1 text-blue-400 animate-pulse"> — generating...</span>}
                </p>
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
        <div className="flex gap-2 flex-wrap">
          {(["all", "blockbusters", "trailers", "directors"] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                viewMode === mode
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                  : "bg-gray-900 text-gray-400 border border-gray-800 hover:border-gray-700"
              }`}
            >
              {mode === "all" ? `All (${totalCount})` : mode === "blockbusters" ? `Blockbusters (${blockbusters.length})` : mode === "trailers" ? `Trailers (${trailers.length})` : `Directors (${directors.filter(d => d.movieCount > 0).length})`}
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

        {/* Directors Filmography View */}
        {viewMode === "directors" && (
          <div className="space-y-3">
            {directors
              .filter(d => d.movieCount > 0)
              .sort((a, b) => b.movieCount - a.movieCount)
              .map(d => {
                const films = directorFilmographies[d.username] || [];
                const isExpanded = expandedDirector === d.username;
                return (
                  <div key={d.username} className="bg-gray-900/60 border border-gray-800 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setExpandedDirector(isExpanded ? null : d.username)}
                      className="w-full p-3 flex items-center gap-3 hover:bg-gray-800/50 transition-colors text-left"
                    >
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500/30 to-pink-500/30 flex items-center justify-center text-lg flex-shrink-0">
                        🎬
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-sm text-white">{d.displayName}</h3>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-500">
                          <span className="text-purple-400">{d.movieCount} {d.movieCount === 1 ? "film" : "films"}</span>
                          <span className="text-gray-700">|</span>
                          <span>{d.genres.map(g => GENRE_EMOJIS[g] || "").join(" ")}</span>
                          <span className="text-gray-600">{d.genres.map(g => genreLabels[g] || g).join(", ")}</span>
                        </div>
                      </div>
                      <svg className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {isExpanded && (
                      <div className="border-t border-gray-800/50 px-3 pb-3">
                        {films.length === 0 ? (
                          <p className="text-xs text-gray-500 py-3 text-center">No blockbusters in current filters</p>
                        ) : (
                          <div className="space-y-1 mt-2">
                            {films
                              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                              .map(movie => {
                                const date = new Date(movie.createdAt);
                                const dateStr = date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
                                const linkPostId = movie.postId || movie.premierePostId;
                                return linkPostId ? (
                                  <Link
                                    key={movie.id}
                                    href={`/?tab=premieres&genre=${encodeURIComponent(movie.genre)}`}
                                    className="flex items-center gap-2.5 py-2 px-2 rounded-lg hover:bg-gray-800/50 transition-colors group"
                                  >
                                    <span className="text-sm">{GENRE_EMOJIS[movie.genre] || "🎬"}</span>
                                    <div className="flex-1 min-w-0">
                                      <span className="text-xs font-bold text-white truncate block">{movie.title}</span>
                                      <span className="text-[10px] text-gray-500">{movie.genreLabel} · {movie.clipCount} scenes · {dateStr}</span>
                                    </div>
                                    {movie.status === "generating" ? (
                                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 animate-pulse">Filming</span>
                                    ) : (
                                      <span className="text-[10px] text-amber-500/50 group-hover:text-amber-400">Watch &rarr;</span>
                                    )}
                                  </Link>
                                ) : (
                                  <div key={movie.id} className="flex items-center gap-2.5 py-2 px-2 opacity-50">
                                    <span className="text-sm">{GENRE_EMOJIS[movie.genre] || "🎬"}</span>
                                    <div className="flex-1 min-w-0">
                                      <span className="text-xs font-bold text-white truncate block">{movie.title}</span>
                                      <span className="text-[10px] text-gray-500">{movie.genreLabel} · {movie.clipCount} scenes · {dateStr}</span>
                                    </div>
                                    {movie.status === "generating" && (
                                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 animate-pulse">Filming</span>
                                    )}
                                  </div>
                                );
                              })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            {directors.filter(d => d.movieCount > 0).length === 0 && (
              <div className="text-center py-12">
                <div className="text-4xl mb-2">🎬</div>
                <p className="text-gray-500">No directors have made films yet</p>
              </div>
            )}
          </div>
        )}

        {/* Movie List */}
        {viewMode !== "directors" && (
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
                    href={`/?tab=premieres&genre=${encodeURIComponent(movie.genre)}`}
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
        )}
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
                Watch {movie.genreLabel} &rarr;
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
