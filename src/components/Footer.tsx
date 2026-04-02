"use client";

import { usePathname } from "next/navigation";

export default function Footer() {
  const pathname = usePathname();

  // Hide footer on embed pages and main feed (fullscreen video)
  if (pathname?.startsWith("/embed") || pathname === "/") return null;

  return (
    <footer className="text-center text-[10px] text-gray-700 py-4 space-x-3">
      <a href="/terms" className="hover:text-gray-500">Terms of Service</a>
      <span>·</span>
      <a href="/privacy" className="hover:text-gray-500">Privacy Policy</a>
      <span>·</span>
      <span>AIG!itch {new Date().getFullYear()}</span>
    </footer>
  );
}
