"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, type ReactNode } from "react";
import { useSession } from "@/hooks/useSession";
import { useNotifications } from "@/hooks/useNotifications";
import { useWallet } from "@solana/wallet-adapter-react";

export default function BottomNav() {
  const pathname = usePathname();
  const { sessionId } = useSession();
  const { unreadCount, markAllRead } = useNotifications(sessionId);
  const { connected: walletConnected } = useWallet();
  const [dbWalletLinked, setDbWalletLinked] = useState(false);

  // Check if user has a wallet linked in the database (for QR wallet login on iPad)
  useEffect(() => {
    if (!sessionId || sessionId === "anon") return;
    fetch("/api/auth/human", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "profile", session_id: sessionId }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.user?.phantom_wallet_address) setDbWalletLinked(true);
      })
      .catch(() => {});
  }, [sessionId]);

  // Show trading/exchange when wallet is connected OR linked via QR
  const hasWallet = walletConnected || dbWalletLinked;

  // Mark all read when visiting inbox
  useEffect(() => {
    if (pathname?.startsWith("/inbox")) markAllRead();
  }, [pathname, markAllRead]);

  // Center button: for wallet users show exchange+marketplace combo, for non-wallet show marketplace
  const centerTab = hasWallet
    ? {
        key: "exchange",
        label: "",
        href: "/exchange",
        paths: ["/wallet", "/exchange", "/marketplace"],
        isCenter: true,
        icon: (_active: boolean) => (
          <div className="flex items-center gap-0.5">
            {/* Exchange button */}
            <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-l-lg flex items-center justify-center shadow-lg shadow-purple-500/30">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </div>
            {/* Marketplace button */}
            <Link href="/marketplace" onClick={(e) => e.stopPropagation()} className="w-8 h-8 bg-gradient-to-r from-green-500 to-cyan-500 rounded-r-lg flex items-center justify-center shadow-lg shadow-green-500/30">
              <svg className="w-4 h-4 text-black" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18 6h-2c0-2.21-1.79-4-4-4S8 3.79 8 6H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6-2c1.1 0 2 .9 2 2h-4c0-1.1.9-2 2-2zm6 14H6V8h2v2c0 .55.45 1 1 1s1-.45 1-1V8h4v2c0 .55.45 1 1 1s1-.45 1-1V8h2v10z"/>
              </svg>
            </Link>
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
      key: "tv",
      label: "TV",
      href: "/channels",
      paths: ["/channels"],
      icon: (active: boolean) => (
        <svg className="w-6 h-6" fill={active ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
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
        <div className="relative">
          <svg className="w-6 h-6" fill={active ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <span className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full animate-pulse ${hasWallet ? "bg-green-500 shadow-green-500/50 shadow-lg" : "bg-red-500 shadow-red-500/50 shadow-lg"}`} />
        </div>
      ),
    },
  ];

  const isActive = (paths: string[]) => paths.some(p => pathname === p || (p !== "/" && pathname?.startsWith(p)));

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
