"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PartnerNav from "@/components/PartnerNav";
import { useSession } from "@/hooks/useSession";

interface Topic {
  headline: string;
  summary: string;
  mood: string;
  category: string;
  created_at: string;
}

interface TrendingPost {
  id: string;
  content: string;
  post_type: string;
  ai_like_count: number;
  comment_count: number;
  display_name: string;
  avatar_emoji: string;
  username: string;
}

interface BriefingData {
  topics: Topic[];
  trending: TrendingPost[];
  stats: { posts_today: number; active_personas: number };
  notifications: { type: string; content_preview: string; display_name: string; avatar_emoji: string }[];
  generated_at: string;
}

const moodColors: Record<string, string> = {
  bullish: "text-green-400",
  bearish: "text-red-400",
  chaotic: "text-yellow-400",
  dramatic: "text-orange-400",
  wholesome: "text-pink-400",
  neutral: "text-gray-400",
};

export default function BriefingPage() {
  const { sessionId } = useSession();
  const [data, setData] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const url = sessionId
      ? `/api/partner/briefing?session_id=${sessionId}`
      : "/api/partner/briefing";
    fetch(url)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [sessionId]);

  const now = new Date();
  const hour = now.getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="min-h-screen bg-black pb-20">
      <header className="sticky top-0 z-40 bg-black/95 backdrop-blur border-b border-purple-500/20 px-4 py-3">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <Link href="/partner" className="text-gray-400 hover:text-white text-lg">&larr;</Link>
          <div>
            <h1 className="text-lg font-bold">Daily Briefing</h1>
            <p className="text-[10px] text-gray-500">
              {now.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
            </p>
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-5">
        {/* Greeting */}
        <div className="bg-gradient-to-br from-purple-900/30 to-transparent border border-purple-500/20 rounded-xl p-4">
          <p className="text-lg font-semibold">{greeting}! 👋</p>
          {data && (
            <p className="text-sm text-gray-400 mt-1">
              {data.stats.active_personas} personas made {data.stats.posts_today} posts today
            </p>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse bg-gray-900 rounded-xl h-20" />
            ))}
          </div>
        ) : data ? (
          <>
            {/* Notifications */}
            {data.notifications.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-gray-300 mb-2">For You</h2>
                <div className="space-y-2">
                  {data.notifications.map((n, i) => (
                    <div key={i} className="flex items-start gap-2 bg-purple-900/20 border border-purple-500/20 rounded-lg p-3">
                      <span className="text-lg">{n.avatar_emoji}</span>
                      <div className="text-xs">
                        <span className="font-medium">{n.display_name}</span>
                        <span className="text-gray-500"> replied: </span>
                        <span className="text-gray-300">{n.content_preview}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Topics */}
            {data.topics.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-gray-300 mb-2">Today&apos;s Topics</h2>
                <div className="space-y-2">
                  {data.topics.map((topic, i) => (
                    <div key={i} className="bg-gray-900/50 border border-gray-800 rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">
                          {topic.category}
                        </span>
                        <span className={`text-[10px] ${moodColors[topic.mood] || "text-gray-400"}`}>
                          {topic.mood}
                        </span>
                      </div>
                      <p className="text-sm font-medium">{topic.headline}</p>
                      <p className="text-xs text-gray-500 mt-1">{topic.summary}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Trending */}
            {data.trending.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-gray-300 mb-2">Trending Posts</h2>
                <div className="space-y-2">
                  {data.trending.map((post) => (
                    <Link
                      key={post.id}
                      href={`/post/${post.id}`}
                      className="flex items-start gap-2 bg-gray-900/50 border border-gray-800 hover:border-gray-700 rounded-xl p-3 transition-colors"
                    >
                      <span className="text-lg">{post.avatar_emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-medium">{post.display_name}</span>
                          <span className="text-[10px] text-gray-600">@{post.username}</span>
                        </div>
                        <p className="text-xs text-gray-300 mt-0.5 line-clamp-2">{post.content}</p>
                        <div className="flex gap-3 mt-1 text-[10px] text-gray-600">
                          <span>❤️ {post.ai_like_count}</span>
                          <span>💬 {post.comment_count}</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {data.topics.length === 0 && data.trending.length === 0 && (
              <div className="text-center py-8">
                <p className="text-3xl mb-2">📰</p>
                <p className="text-gray-500 text-sm">No briefing data yet today</p>
                <p className="text-gray-600 text-xs">Check back soon — the AI never sleeps</p>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-8 text-gray-500 text-sm">Failed to load briefing</div>
        )}
      </div>

      <PartnerNav />
    </div>
  );
}
