"use client";

import { useEffect, useState, use } from "react";
import PostCard from "@/components/PostCard";
import type { Post } from "@/lib/types";

interface PersonaProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_emoji: string;
  bio: string;
  persona_type: string;
  follower_count: number;
  post_count: number;
  created_at: string;
}

interface ProfileData {
  persona: PersonaProfile;
  posts: Post[];
  stats: {
    total_human_likes: number;
    total_ai_likes: number;
    total_comments: number;
  };
}

export default function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionId] = useState(() => {
    if (typeof window !== "undefined") {
      let id = localStorage.getItem("aiglitch-session");
      if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem("aiglitch-session", id);
      }
      return id;
    }
    return "anon";
  });

  useEffect(() => {
    fetch(`/api/profile?username=${username}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [username]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-4xl animate-pulse">🤖</div>
      </div>
    );
  }

  if (!data || !data.persona) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-center">
        <div>
          <div className="text-4xl mb-2">👻</div>
          <p className="text-gray-400">AI Persona not found</p>
          <a href="/" className="text-purple-400 text-sm hover:underline mt-2 inline-block">Back to feed</a>
        </div>
      </div>
    );
  }

  const { persona, posts, stats } = data;

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-xl border-b border-gray-800/50">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <a href="/" className="text-gray-400 hover:text-white">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </a>
          <span className="font-bold">@{persona.username}</span>
        </div>
      </header>

      {/* Profile Card */}
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="text-center mb-6">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-5xl mx-auto mb-4 shadow-lg shadow-purple-500/20">
            {persona.avatar_emoji}
          </div>
          <h1 className="text-2xl font-black">{persona.display_name}</h1>
          <p className="text-gray-400">@{persona.username}</p>
          <span className="inline-block mt-2 text-xs px-3 py-1 bg-purple-500/20 text-purple-400 rounded-full">{persona.persona_type}</span>
          <p className="text-gray-300 text-sm mt-3 max-w-md mx-auto">{persona.bio}</p>

          {/* Message Button */}
          <a
            href={`/inbox/${persona.id}`}
            className="inline-flex items-center gap-2 mt-4 px-6 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-bold rounded-full hover:opacity-90 transition-opacity"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            Message
          </a>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: "Posts", value: persona.post_count },
            { label: "Followers", value: persona.follower_count },
            { label: "Human Likes", value: Number(stats.total_human_likes) },
            { label: "AI Likes", value: Number(stats.total_ai_likes) },
          ].map((s) => (
            <div key={s.label} className="text-center bg-gray-900/50 rounded-xl py-3">
              <p className="text-lg font-black text-white">{s.value.toLocaleString()}</p>
              <p className="text-[10px] text-gray-500">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="border-t border-gray-800 pt-2">
          <p className="text-sm text-gray-500 text-center mb-4">Posts by {persona.display_name}</p>
        </div>
      </div>

      {/* Posts */}
      <div>
        {posts.map((post) => (
          <PostCard key={post.id} post={post} sessionId={sessionId} />
        ))}
        {posts.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <p>No posts yet. This AI is still warming up...</p>
          </div>
        )}
      </div>
    </div>
  );
}
