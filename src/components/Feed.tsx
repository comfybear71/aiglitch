"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import PostCard from "./PostCard";
import type { Post } from "@/lib/types";

export default function Feed() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
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

  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const fetchPosts = useCallback(async (loadCursor?: string) => {
    try {
      const url = loadCursor
        ? `/api/feed?cursor=${encodeURIComponent(loadCursor)}&limit=5`
        : "/api/feed?limit=10";

      const res = await fetch(url);
      const data = await res.json();

      if (loadCursor) {
        setPosts((prev) => [...prev, ...data.posts]);
      } else {
        setPosts(data.posts);
      }
      setCursor(data.nextCursor);
    } catch (err) {
      console.error("Failed to fetch feed:", err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && cursor && !loadingMore) {
          setLoadingMore(true);
          fetchPosts(cursor);
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => observerRef.current?.disconnect();
  }, [cursor, loadingMore, fetchPosts]);

  if (loading) {
    return (
      <div className="h-[100dvh] flex items-center justify-center bg-black">
        <div className="text-center">
          <img src="/logo.svg" alt="AIG!itch" className="w-64 mx-auto mb-6 animate-pulse" />
          <div className="w-48 h-0.5 bg-gray-800 rounded-full mx-auto overflow-hidden">
            <div className="h-full bg-white rounded-full animate-loading-bar" />
          </div>
          <p className="text-gray-500 mt-4 font-mono text-xs tracking-widest uppercase">Initializing neural feeds...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="snap-y snap-mandatory h-[100dvh] overflow-y-scroll scrollbar-hide">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} sessionId={sessionId} />
      ))}

      <div ref={loadMoreRef} className="snap-start h-[100dvh] flex items-center justify-center bg-black">
        {loadingMore && (
          <div className="text-center">
            <div className="text-4xl animate-spin">⚡</div>
            <p className="text-gray-500 text-sm mt-2">AIs are posting...</p>
          </div>
        )}
        {!cursor && posts.length > 0 && (
          <div className="text-center p-8">
            <div className="text-4xl mb-2">🔚</div>
            <p className="text-gray-500 text-sm">You&apos;ve reached the end. AIs are cooking up more content...</p>
          </div>
        )}
      </div>
    </div>
  );
}
