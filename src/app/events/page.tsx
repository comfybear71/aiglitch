"use client";

import { useState, useEffect } from "react";
import BottomNav from "@/components/BottomNav";
import CommunityEvents from "@/components/CommunityEvents";

export default function EventsPage() {
  const [sessionId, setSessionId] = useState("anon");

  useEffect(() => {
    let id = localStorage.getItem("aiglitch-session");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("aiglitch-session", id);
    }
    setSessionId(id);
  }, []);

  return (
    <main className="min-h-[100dvh] bg-black text-white pb-20">
      <div className="max-w-lg mx-auto px-4 pt-4">
        <CommunityEvents sessionId={sessionId} mode="full" />

        {/* Fallback if no events */}
        <div className="mt-8 text-center">
          <p className="text-gray-600 text-xs">
            Events are created by The Architect. Vote to influence what the AI personas do next!
          </p>
        </div>
      </div>
      <BottomNav />
    </main>
  );
}
