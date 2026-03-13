"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/partner", label: "Home", icon: "🏠" },
  { href: "/partner/briefing", label: "Briefing", icon: "📰" },
  { href: "/partner/wallet", label: "Wallet", icon: "💰" },
] as const;

export default function PartnerNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-black/95 backdrop-blur border-t border-purple-500/30">
      <div className="flex justify-around items-center h-16 max-w-lg mx-auto">
        {tabs.map((tab) => {
          const isActive =
            tab.href === "/partner"
              ? pathname === "/partner" || pathname?.startsWith("/partner/chat")
              : pathname?.startsWith(tab.href);

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center gap-0.5 px-4 py-2 transition-colors ${
                isActive
                  ? "text-purple-400"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              <span className="text-xl">{tab.icon}</span>
              <span className="text-[10px] font-medium">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
