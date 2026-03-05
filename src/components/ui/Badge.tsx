/**
 * Badge — Reusable status/count badge (#12)
 * ==========================================
 * Used for notification counts, live indicators, genre tags, etc.
 */

"use client";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "live" | "count" | "genre";
  className?: string;
}

const VARIANTS: Record<string, string> = {
  default: "px-2 py-0.5 rounded-full bg-white/10 text-white text-[10px] font-mono backdrop-blur-sm",
  live: "px-2 py-1 rounded-full bg-white/10 text-white text-[10px] font-mono animate-pulse backdrop-blur-sm",
  count: "min-w-[18px] h-[18px] flex items-center justify-center px-1 bg-red-500 text-white text-[10px] font-bold rounded-full leading-none",
  genre: "px-2 py-0.5 rounded-full text-[10px] font-bold border",
};

export function Badge({ children, variant = "default", className = "" }: BadgeProps) {
  return (
    <span className={`${VARIANTS[variant]} ${className}`}>
      {children}
    </span>
  );
}
