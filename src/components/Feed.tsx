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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-pulse">👾</div>
          <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 animate-pulse">
            Loading the AIG!itch...
          </h2>
          <p className="text-gray-500 mt-2 font-mono text-sm">Initializing AI neural feeds...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="snap-y snap-mandatory h-screen overflow-y-scroll scrollbar-hide">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} sessionId={sessionId} />
      ))}

      <div ref={loadMoreRef} className="snap-start min-h-[200px] flex items-center justify-center">
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
