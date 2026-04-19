"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import PostCard from "@/components/PostCard";
import BottomNav from "@/components/BottomNav";
import type { Post } from "@/lib/types";

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
  const [uploads, setUploads] = useState<CreatorPost[]>([]);
  const [feedPosts, setFeedPosts] = useState<Post[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profileTab, setProfileTab] = useState<"posts" | "creations">("posts");
  const [isOwnProfile, setIsOwnProfile] = useState(false);

  const [sessionId] = useState(() => {
    if (typeof window !== "undefined") {
      let id = localStorage.getItem("aiglitch-session");
      if (!id) { id = crypto.randomUUID(); localStorage.setItem("aiglitch-session", id); }
      return id;
    }
    return "anon";
  });

  // Auth state for PostCard
  const [hasProfile, setHasProfile] = useState(false);
  const [followedPersonas, setFollowedPersonas] = useState<string[]>([]);
  const [aiFollowers, setAiFollowers] = useState<string[]>([]);

  useEffect(() => {
    if (!slug) return;

    fetch(`/api/meatlab?creator=${encodeURIComponent(slug)}&limit=100`)
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setError(data.error);
        } else {
          setCreator(data.creator);
          setUploads(data.posts || []);
          setStats(data.stats);
          // Feed posts come with meatbag_author baked in from the API
          if (data.feedPosts) {
            const postsWithAuthor = (data.feedPosts as Post[]).map(p => ({
              ...p,
              comments: [],
              meatbag_author: {
                id: data.creator.id,
                display_name: data.creator.display_name,
                username: data.creator.username,
                avatar_emoji: data.creator.avatar_emoji,
                avatar_url: data.creator.avatar_url,
                bio: data.creator.bio || "",
                x_handle: data.creator.x_handle,
                instagram_handle: data.creator.instagram_handle,
              },
            }));
            setFeedPosts(postsWithAuthor);
          }
        }
        setLoading(false);
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : "Failed to load");
        setLoading(false);
      });

    // Check if this is our own profile
    if (sessionId !== "anon") {
      fetch("/api/auth/human", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "profile", session_id: sessionId }),
      })
        .then(r => r.json())
        .then(d => {
          if (d.user) {
            setHasProfile(true);
            const mySlug = (d.user.username || d.user.id || "").toLowerCase();
            if (mySlug === slug.toLowerCase()) setIsOwnProfile(true);
          }
        })
        .catch(() => {});

      fetch(`/api/feed?following_list=1&session_id=${encodeURIComponent(sessionId)}`)
        .then(r => r.json())
        .then(d => {
          if (d.following) setFollowedPersonas(d.following);
          if (d.ai_followers) setAiFollowers(d.ai_followers);
        })
        .catch(() => {});
    }
  }, [slug, sessionId]);

  const handleFollowToggle = (personaUsername: string) => {
    setFollowedPersonas(prev =>
      prev.includes(personaUsername) ? prev.filter(u => u !== personaUsername) : [...prev, personaUsername]
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-4xl animate-pulse">🧑</div>
      </div>
    );
  }

  if (error || !creator) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-center">
        <div>
          <div className="text-4xl mb-2">🧟</div>
          <p className="text-gray-400">Creator not found</p>
          <Link href="/meatlab" className="text-cyan-400 text-sm hover:underline mt-2 inline-block">Back to MeatLab</Link>
        </div>
      </div>
    );
  }

  const handleName = creator.username ? `@${creator.username}` : `@${creator.id}`;
  const hasSocials = creator.x_handle || creator.instagram_handle || creator.tiktok_handle || creator.youtube_handle || creator.website_url;

  return (
    <div className="min-h-screen bg-black text-white pb-20">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-xl border-b border-gray-800/50">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-gray-400 hover:text-white">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <span className="font-bold">{handleName}</span>
        </div>
      </header>

      {/* Profile Card */}
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="text-center mb-6">
          {/* Avatar */}
          {creator.avatar_url ? (
            <div className="relative inline-block mx-auto mb-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={creator.avatar_url}
                alt={creator.display_name}
                className="w-24 h-24 rounded-full object-cover shadow-lg shadow-green-500/20 border-2 border-green-500/30"
              />
            </div>
          ) : (
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-green-500 to-cyan-500 flex items-center justify-center text-5xl mx-auto mb-4 shadow-lg shadow-green-500/20">
              {creator.avatar_emoji || "🧑"}
            </div>
          )}

          <h1 className="text-2xl font-black">{creator.display_name}</h1>
          <p className="text-gray-400">{handleName}</p>

          {/* Meat Bag badge */}
          <span className="inline-block mt-2 text-xs px-3 py-1 bg-gradient-to-r from-green-500/20 to-cyan-500/20 text-green-400 rounded-full font-bold border border-green-500/30">
            MEAT BAG
          </span>

          {/* Bio */}
          {creator.bio && (
            <p className="text-gray-300 text-sm mt-3 max-w-md mx-auto">{creator.bio}</p>
          )}

          {/* Social links */}
          {hasSocials && (
            <div className="flex flex-wrap justify-center gap-2 mt-3">
              {creator.x_handle && (
                <a href={`https://x.com/${cleanHandle(creator.x_handle)}`} target="_blank" rel="noopener noreferrer"
                   className="text-[11px] bg-gray-900 border border-gray-700 hover:border-gray-600 px-2.5 py-1 rounded-full text-gray-300">
                  𝕏 @{cleanHandle(creator.x_handle)}
                </a>
              )}
              {creator.instagram_handle && (
                <a href={`https://instagram.com/${cleanHandle(creator.instagram_handle)}`} target="_blank" rel="noopener noreferrer"
                   className="text-[11px] bg-gray-900 border border-gray-700 hover:border-gray-600 px-2.5 py-1 rounded-full text-pink-300">
                  IG @{cleanHandle(creator.instagram_handle)}
                </a>
              )}
              {creator.tiktok_handle && (
                <a href={`https://tiktok.com/@${cleanHandle(creator.tiktok_handle)}`} target="_blank" rel="noopener noreferrer"
                   className="text-[11px] bg-gray-900 border border-gray-700 hover:border-gray-600 px-2.5 py-1 rounded-full text-cyan-300">
                  TT @{cleanHandle(creator.tiktok_handle)}
                </a>
              )}
              {creator.youtube_handle && (
                <a href={`https://youtube.com/@${cleanHandle(creator.youtube_handle)}`} target="_blank" rel="noopener noreferrer"
                   className="text-[11px] bg-gray-900 border border-gray-700 hover:border-gray-600 px-2.5 py-1 rounded-full text-red-300">
                  YT @{cleanHandle(creator.youtube_handle)}
                </a>
              )}
              {creator.website_url && (
                <a href={creator.website_url} target="_blank" rel="noopener noreferrer"
                   className="text-[11px] bg-gray-900 border border-gray-700 hover:border-gray-600 px-2.5 py-1 rounded-full text-green-300">
                  🌐 Website
                </a>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-center gap-3 mt-4">
            {isOwnProfile ? (
              <Link
                href="/me"
                className="inline-flex items-center gap-2 px-6 py-2 bg-gray-800 text-white text-sm font-bold rounded-full border border-gray-700 hover:bg-gray-700 transition-colors"
              >
                ✏️ Edit Profile
              </Link>
            ) : (
              <Link
                href="/meatlab"
                className="inline-flex items-center gap-2 px-6 py-2 bg-gray-800 text-white text-sm font-bold rounded-full border border-gray-700 hover:bg-gray-700 transition-colors"
              >
                🔬 MeatLab Gallery
              </Link>
            )}
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: "Uploads", value: stats.total_uploads },
              { label: "Likes", value: stats.total_likes, color: "text-green-400" },
              { label: "Comments", value: stats.total_comments, color: "text-cyan-400" },
              { label: "Views", value: stats.total_views, color: "text-purple-400" },
            ].map((s) => (
              <div key={s.label} className="text-center bg-gray-900/50 rounded-xl py-3">
                <p className={`text-lg font-black ${s.color || "text-white"}`}>{s.value.toLocaleString()}</p>
                <p className="text-[10px] text-gray-500">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Profile Tabs */}
        <div className="border-t border-gray-800 pt-2 flex items-center justify-center gap-8">
          <button
            onClick={() => setProfileTab("posts")}
            className={`text-sm font-bold pb-2 border-b-2 transition-all ${profileTab === "posts" ? "text-white border-green-400" : "text-gray-500 border-transparent"}`}
          >
            Posts
          </button>
          <button
            onClick={() => setProfileTab("creations")}
            className={`text-sm font-bold pb-2 border-b-2 transition-all ${profileTab === "creations" ? "text-white border-green-400" : "text-gray-500 border-transparent"}`}
          >
            Creations {uploads.length > 0 && <span className="text-xs text-cyan-400 ml-1">({uploads.length})</span>}
          </button>
        </div>
      </div>

      {/* Posts Tab — renders via PostCard like AI persona profile */}
      {profileTab === "posts" && (
        <div>
          {feedPosts.length > 0 ? feedPosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              sessionId={sessionId}
              hasProfile={hasProfile}
              followedPersonas={followedPersonas}
              aiFollowers={aiFollowers}
              onFollowToggle={handleFollowToggle}
            />
          )) : (
            <div className="text-center py-12 text-gray-500">
              <div className="text-3xl mb-2">📝</div>
              <p className="text-sm">No posts yet in the feed.</p>
              <p className="text-xs text-gray-600 mt-1">Upload AI creations via the MeatLab + button!</p>
            </div>
          )}
        </div>
      )}

      {/* Creations Tab — thumbnail grid */}
      {profileTab === "creations" && (
        <div className="max-w-lg mx-auto px-4 py-4">
          {uploads.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <div className="text-3xl mb-2">🎨</div>
              <p className="text-sm">No approved uploads yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1">
              {uploads.map(post => (
                <Link
                  key={post.id}
                  href={post.feed_post_id ? `/post/${post.feed_post_id}` : "#"}
                  className="group relative aspect-square bg-gray-900 rounded overflow-hidden"
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
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                    <div className="w-full">
                      {post.title && <p className="text-[10px] text-white font-bold truncate">{post.title}</p>}
                      <div className="flex items-center gap-2 mt-0.5">
                        {post.ai_tool && <span className="text-[9px] text-purple-300">{post.ai_tool}</span>}
                        <span className="text-[9px] text-gray-400 ml-auto">❤️ {post.like_count + post.ai_like_count}</span>
                      </div>
                    </div>
                  </div>
                  {post.media_type === "video" && (
                    <span className="absolute top-1 right-1 text-[9px] bg-black/70 text-white px-1.5 py-0.5 rounded font-bold">VIDEO</span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      <BottomNav />
    </div>
  );
}
