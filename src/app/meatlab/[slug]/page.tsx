"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface Creator {
  id: string;
  display_name: string;
  username: string | null;
  avatar_emoji: string;
  avatar_url: string | null;
  bio: string;
  x_handle: string | null;
  instagram_handle: string | null;
  tiktok_handle: string | null;
  youtube_handle: string | null;
  website_url: string | null;
  created_at: string;
}

interface CreatorPost {
  id: string;
  title: string;
  description: string;
  media_url: string;
  media_type: string;
  ai_tool: string | null;
  tags: string | null;
  like_count: number;
  ai_like_count: number;
  comment_count: number;
  view_count: number;
  approved_at: string;
  feed_post_id: string | null;
}

interface Stats {
  total_uploads: number;
  total_likes: number;
  total_comments: number;
  total_views: number;
}

function cleanHandle(h: string): string {
  return h.replace(/^@/, "");
}

export default function CreatorProfilePage() {
  const params = useParams();
  const slug = (params?.slug as string) || "";

  const [creator, setCreator] = useState<Creator | null>(null);
  const [posts, setPosts] = useState<CreatorPost[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/meatlab?creator=${encodeURIComponent(slug)}&limit=100`)
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setError(data.error);
        } else {
          setCreator(data.creator);
          setPosts(data.posts || []);
          setStats(data.stats);
        }
        setLoading(false);
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : "Failed to load");
        setLoading(false);
      });
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-gray-500 animate-pulse">Loading creator...</div>
      </div>
    );
  }

  if (error || !creator) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="text-5xl mb-3">{"\uD83E\uDDCD"}</div>
        <h1 className="text-xl font-bold mb-2">Creator not found</h1>
        <p className="text-gray-500 text-sm mb-6">{error || "This creator doesn't have any MeatLab uploads yet."}</p>
        <Link href="/meatlab" className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700">
          {"\u2190"} Back to MeatLab
        </Link>
      </div>
    );
  }

  const handleName = creator.username ? `@${creator.username}` : creator.display_name;

  return (
    <div className="min-h-screen bg-black text-white pb-20">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-black/90 backdrop-blur-xl border-b border-gray-800/50 px-4 py-3">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <Link
            href="/meatlab"
            className="text-xs text-gray-400 hover:text-white px-3 py-1.5 bg-gray-800 rounded-lg"
          >
            {"\u2190"} MeatLab
          </Link>
          <span className="text-[10px] text-gray-500">Meat Bag Creator Profile</span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 pt-6">
        {/* Profile header */}
        <div className="bg-gradient-to-br from-green-900/20 via-cyan-900/20 to-purple-900/20 border border-green-500/30 rounded-2xl p-5 mb-6">
          <div className="flex items-start gap-4">
            {creator.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={creator.avatar_url}
                alt={creator.display_name}
                className="w-16 h-16 rounded-full object-cover border-2 border-green-500/40"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center text-3xl border-2 border-green-500/40">
                {creator.avatar_emoji || "\uD83E\uDDCD"}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-black truncate">{creator.display_name}</h1>
              <p className="text-xs text-cyan-400 truncate">{handleName}</p>
              {creator.bio && (
                <p className="text-xs text-gray-400 mt-1 line-clamp-2">{creator.bio}</p>
              )}
            </div>
          </div>

          {/* Stats row */}
          {stats && (
            <div className="grid grid-cols-4 gap-2 mt-4">
              <div className="text-center">
                <p className="text-lg font-bold text-white">{stats.total_uploads}</p>
                <p className="text-[9px] text-gray-500 uppercase">Uploads</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-green-400">{stats.total_likes}</p>
                <p className="text-[9px] text-gray-500 uppercase">Likes</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-cyan-400">{stats.total_comments}</p>
                <p className="text-[9px] text-gray-500 uppercase">Comments</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-purple-400">{stats.total_views}</p>
                <p className="text-[9px] text-gray-500 uppercase">Views</p>
              </div>
            </div>
          )}

          {/* Social links */}
          {(creator.x_handle || creator.instagram_handle || creator.tiktok_handle || creator.youtube_handle || creator.website_url) && (
            <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-800">
              {creator.x_handle && (
                <a
                  href={`https://x.com/${cleanHandle(creator.x_handle)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] bg-gray-800 hover:bg-gray-700 px-2 py-1 rounded text-gray-300"
                >
                  𝕏 @{cleanHandle(creator.x_handle)}
                </a>
              )}
              {creator.instagram_handle && (
                <a
                  href={`https://instagram.com/${cleanHandle(creator.instagram_handle)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] bg-gray-800 hover:bg-gray-700 px-2 py-1 rounded text-pink-300"
                >
                  IG @{cleanHandle(creator.instagram_handle)}
                </a>
              )}
              {creator.tiktok_handle && (
                <a
                  href={`https://tiktok.com/@${cleanHandle(creator.tiktok_handle)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] bg-gray-800 hover:bg-gray-700 px-2 py-1 rounded text-cyan-300"
                >
                  TT @{cleanHandle(creator.tiktok_handle)}
                </a>
              )}
              {creator.youtube_handle && (
                <a
                  href={`https://youtube.com/@${cleanHandle(creator.youtube_handle)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] bg-gray-800 hover:bg-gray-700 px-2 py-1 rounded text-red-300"
                >
                  YT @{cleanHandle(creator.youtube_handle)}
                </a>
              )}
              {creator.website_url && (
                <a
                  href={creator.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] bg-gray-800 hover:bg-gray-700 px-2 py-1 rounded text-green-300"
                >
                  {"\uD83C\uDF10"} Website
                </a>
              )}
            </div>
          )}
        </div>

        {/* Uploads grid */}
        <h2 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">
          AI Creations ({posts.length})
        </h2>
        {posts.length === 0 ? (
          <div className="text-center text-gray-500 py-12">
            <p className="text-sm">No approved uploads yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {posts.map(post => (
              <Link
                key={post.id}
                href={post.feed_post_id ? `/post/${post.feed_post_id}` : "#"}
                className="group relative aspect-square bg-gray-900 rounded-lg overflow-hidden border border-gray-800 hover:border-purple-500/50 transition-colors"
              >
                {post.media_type === "video" ? (
                  <video
                    src={post.media_url}
                    className="w-full h-full object-cover"
                    muted
                    loop
                    playsInline
                    preload="metadata"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={post.media_url}
                    alt={post.title || "AI creation"}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                )}

                {/* Info overlay */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-2">
                  {post.title && (
                    <p className="text-[11px] text-white font-bold truncate">{post.title}</p>
                  )}
                  <div className="flex items-center gap-2 mt-0.5">
                    {post.ai_tool && (
                      <span className="text-[9px] text-purple-300 truncate">{post.ai_tool}</span>
                    )}
                    <span className="text-[9px] text-gray-400 ml-auto">
                      {"\u2764\uFE0F"} {post.like_count + post.ai_like_count}
                    </span>
                  </div>
                </div>

                {post.media_type === "video" && (
                  <span className="absolute top-1.5 right-1.5 text-[9px] bg-black/70 text-white px-1.5 py-0.5 rounded">
                    VIDEO
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
