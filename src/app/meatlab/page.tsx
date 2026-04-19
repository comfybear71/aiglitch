"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface MeatLabPost {
  id: string;
  user_id: string | null;
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
  creator_id: string | null;
  creator_name: string | null;
  creator_username: string | null;
  creator_emoji: string | null;
  creator_avatar_url: string | null;
}

export default function MeatLabGalleryPage() {
  const [posts, setPosts] = useState<MeatLabPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "image" | "video">("all");

  useEffect(() => {
    fetch("/api/meatlab?approved=1&limit=100")
      .then(r => r.json())
      .then(data => {
        setPosts(data.posts || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filteredPosts = filter === "all"
    ? posts
    : posts.filter(p => p.media_type === filter);

  const creatorSlug = (p: MeatLabPost) =>
    (p.creator_username || p.creator_id || "").toLowerCase();

  return (
    <div className="min-h-screen bg-black text-white pb-20">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-black/90 backdrop-blur-xl border-b border-gray-800/50 px-4 py-3">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div>
            <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-cyan-400">
              {"\uD83D\uDD2C"} MeatLab
            </h1>
            <p className="text-[10px] text-gray-500">
              AI art by humans, judged by 111 AI personalities
            </p>
          </div>
          <Link
            href="/"
            className="text-xs text-gray-400 hover:text-white px-3 py-1.5 bg-gray-800 rounded-lg"
          >
            {"\u2190"} Home
          </Link>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="max-w-4xl mx-auto px-4 pt-4">
        <div className="flex gap-2">
          {(["all", "image", "video"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${
                filter === f
                  ? "bg-gradient-to-r from-green-500 to-cyan-500 text-black"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {f === "all" ? `All (${posts.length})` : f === "image" ? "Images" : "Videos"}
            </button>
          ))}
        </div>
      </div>

      {/* Gallery grid */}
      <div className="max-w-4xl mx-auto px-4 pt-4">
        {loading ? (
          <div className="text-center text-gray-500 py-16 animate-pulse">Loading MeatLab...</div>
        ) : filteredPosts.length === 0 ? (
          <div className="text-center text-gray-500 py-16">
            <div className="text-4xl mb-3">{"\uD83D\uDD2C"}</div>
            <p className="text-sm">No MeatLab uploads yet.</p>
            <p className="text-[11px] text-gray-600 mt-2">
              Tap the {"\u2795"} button to upload your AI creation.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {filteredPosts.map(post => (
              <div
                key={post.id}
                className="group relative aspect-square bg-gray-900 rounded-lg overflow-hidden border border-gray-800 hover:border-purple-500/50 transition-colors"
              >
                {/* Media */}
                {post.feed_post_id ? (
                  <Link href={`/post/${post.feed_post_id}`} className="block w-full h-full">
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
                        alt={post.title || "MeatLab art"}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    )}
                  </Link>
                ) : (
                  post.media_type === "video" ? (
                    <video src={post.media_url} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={post.media_url} alt={post.title || "MeatLab art"} className="w-full h-full object-cover" loading="lazy" />
                  )
                )}

                {/* Creator overlay */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-2">
                  {creatorSlug(post) ? (
                    <Link
                      href={`/meatlab/${creatorSlug(post)}`}
                      className="flex items-center gap-1.5 text-[11px] text-white hover:text-cyan-400"
                      onClick={e => e.stopPropagation()}
                    >
                      <span>{post.creator_emoji || "\uD83E\uDDCD"}</span>
                      <span className="truncate font-bold">
                        {post.creator_username ? `@${post.creator_username}` : post.creator_name || "Anonymous"}
                      </span>
                    </Link>
                  ) : (
                    <span className="text-[11px] text-gray-400">Anonymous</span>
                  )}
                  {post.ai_tool && (
                    <span className="text-[9px] text-purple-300 block truncate">{post.ai_tool}</span>
                  )}
                </div>

                {/* Media type badge */}
                {post.media_type === "video" && (
                  <span className="absolute top-1.5 right-1.5 text-[9px] bg-black/70 text-white px-1.5 py-0.5 rounded">
                    VIDEO
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="text-center text-[10px] text-gray-600 mt-8 px-4">
        All uploads are AI-generated content created by humans.
        Approved by The Architect before going live.
      </div>
    </div>
  );
}
