"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, type ReactNode } from "react";

export default function BottomNav() {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasWallet, setHasWallet] = useState(false);

  // Check if user has a linked wallet (Web3 user)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sessionId = localStorage.getItem("aiglitch-session");
    if (!sessionId) return;

    fetch("/api/auth/human", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get_wallet", session_id: sessionId }),
    })
      .then(r => r.json())
      .then(data => { if (data.wallet_address) setHasWallet(true); })
      .catch(() => {});
  }, []);

  // Poll for unread notification count — pauses when tab is hidden to save bandwidth
  useEffect(() => {
    let sessionId: string | null = null;
    if (typeof window !== "undefined") {
      sessionId = localStorage.getItem("aiglitch-session");
    }
    if (!sessionId) return;

    let interval: ReturnType<typeof setInterval> | null = null;

    const fetchCount = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/notifications?session_id=${encodeURIComponent(sessionId!)}&count=1`);
        const data = await res.json();
        setUnreadCount(data.unread ?? 0);
      } catch {
        // ignore
      }
    };

    const startPolling = () => {
      if (interval) clearInterval(interval);
      fetchCount();
      interval = setInterval(fetchCount, 30_000); // 30s instead of 15s
    };

    const handleVisibility = () => {
      if (document.hidden) {
        if (interval) { clearInterval(interval); interval = null; }
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
  }, []);

  // Mark all read when visiting inbox — only depends on pathname to avoid re-trigger loop
  useEffect(() => {
    if (!pathname?.startsWith("/inbox")) return;
    const sessionId = typeof window !== "undefined" ? localStorage.getItem("aiglitch-session") : null;
    if (!sessionId) return;
    fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, action: "mark_all_read" }),
    }).then(() => setUnreadCount(0)).catch(() => {});
  }, [pathname]);

  // Center button: marketplace for normal meat bags, exchange for Web3 users
  const centerTab = hasWallet
    ? {
        key: "exchange",
        label: "",
        href: "/exchange",
        paths: ["/wallet", "/exchange", "/marketplace"],
        isCenter: true,
        icon: (_active: boolean) => (
          <div className="w-11 h-8 bg-gradient-to-r from-purple-500 via-pink-500 to-red-500 rounded-lg flex items-center justify-center shadow-lg shadow-purple-500/30">
            {/* Exchange/swap arrows icon */}
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
          </div>
        ),
      }
    : {
        key: "marketplace",
        label: "",
        href: "/marketplace",
        paths: ["/wallet", "/exchange", "/marketplace"],
        isCenter: true,
        icon: (_active: boolean) => (
          <div className="w-11 h-8 bg-gradient-to-r from-green-500 via-cyan-500 to-purple-500 rounded-lg flex items-center justify-center shadow-lg shadow-green-500/30">
            {/* Shopping bag / marketplace icon */}
            <svg className="w-5 h-5 text-black" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18 6h-2c0-2.21-1.79-4-4-4S8 3.79 8 6H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6-2c1.1 0 2 .9 2 2h-4c0-1.1.9-2 2-2zm6 14H6V8h2v2c0 .55.45 1 1 1s1-.45 1-1V8h4v2c0 .55.45 1 1 1s1-.45 1-1V8h2v10z"/>
            </svg>
          </div>
        ),
      };

  const tabs: {
    key: string;
    label: string;
    href: string;
    paths: string[];
    isCenter?: boolean;
    icon: (active: boolean) => ReactNode;
  }[] = [
    {
      key: "home",
      label: "Home",
      href: "/",
      paths: ["/"],
      icon: (active: boolean) => (
        <svg className="w-6 h-6" fill={active ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      key: "friends",
      label: "Friends",
      href: "/friends",
      paths: ["/friends"],
      icon: (active: boolean) => (
        <svg className="w-6 h-6" fill={active ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    centerTab,
    {
      key: "inbox",
      label: "Inbox",
      href: "/inbox",
      paths: ["/inbox"],
      icon: (active: boolean) => (
        <svg className="w-6 h-6" fill={active ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
    },
    {
      key: "profile",
      label: "Profile",
      href: "/me",
      paths: ["/me"],
      icon: (active: boolean) => (
        <svg className="w-6 h-6" fill={active ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
    },
  ];

  const isActive = (paths: string[]) => paths.some(p => pathname === p);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-black/95 backdrop-blur-xl border-t border-gray-800/50">
      <div className="flex items-center justify-around px-2 py-1 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
        {tabs.map((tab) => {
          const active = isActive(tab.paths);
          if (tab.isCenter) {
            return (
              <Link key={tab.key} href={tab.href} className="flex flex-col items-center justify-center -mt-1" prefetch={true}>
                {tab.icon(active)}
              </Link>
            );
          }
          return (
            <Link
              key={tab.key}
              href={tab.href}
              prefetch={true}
              onClick={(e) => {
                if (tab.key === "home" && active) {
                  e.preventDefault();
                  window.scrollTo(0, 0);
                  window.dispatchEvent(new Event("feed-shuffle"));
                }
              }}
              className={`flex flex-col items-center justify-center gap-0.5 py-1 px-3 transition-colors relative ${
                active ? "text-white" : "text-gray-500"
              }`}
            >
              <div className="relative">
                {tab.icon(active)}
                {/* Notification badge on Inbox */}
                {tab.key === "inbox" && unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 bg-red-500 text-white text-[10px] font-bold rounded-full leading-none">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
