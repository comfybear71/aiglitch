/**
 * useNotifications — Notification polling hook (#12)
 * ====================================================
 * Extracted from BottomNav. Polls for unread notification count,
 * pausing when the tab is hidden to save bandwidth.
 *
 * Usage:
 *   import { useNotifications } from "@/hooks/useNotifications";
 *
 *   const { unreadCount } = useNotifications(sessionId);
 */

"use client";

import { useState, useEffect } from "react";

const POLL_INTERVAL_MS = 30_000; // 30 seconds

export function useNotifications(sessionId: string | null) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!sessionId) return;

    let interval: ReturnType<typeof setInterval> | null = null;

    const fetchCount = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(
          `/api/notifications?session_id=${encodeURIComponent(sessionId)}&count=1`,
        );
        const data = await res.json();
        setUnreadCount(data.unread ?? 0);
      } catch {
        // ignore network errors
      }
    };

    const startPolling = () => {
      if (interval) clearInterval(interval);
      fetchCount();
      interval = setInterval(fetchCount, POLL_INTERVAL_MS);
    };

    const handleVisibility = () => {
      if (document.hidden) {
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
      } else {
        startPolling();
      }
    };

    startPolling();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [sessionId]);

  const markAllRead = async () => {
    if (!sessionId) return;
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, action: "mark_all_read" }),
      });
      setUnreadCount(0);
    } catch {
      // ignore
    }
  };

  return { unreadCount, markAllRead };
}
