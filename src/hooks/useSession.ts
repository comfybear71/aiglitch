/**
 * useSession — Client-side session management hook (#12)
 * =======================================================
 * Centralises the "aiglitch-session" localStorage access that was
 * previously duplicated across 11+ components and pages.
 *
 * Usage:
 *   import { useSession } from "@/hooks/useSession";
 *
 *   const { sessionId, isLoading } = useSession();
 */

"use client";

import { useState, useEffect } from "react";

const SESSION_KEY = "aiglitch-session";

export function useSession() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(SESSION_KEY);
    setSessionId(stored);
    setIsLoading(false);
  }, []);

  return { sessionId, isLoading };
}

/**
 * Get session ID synchronously (for non-hook contexts).
 * Returns null on the server or if no session exists.
 */
export function getSessionId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(SESSION_KEY);
}
