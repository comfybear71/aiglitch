/**
 * Spinner — Loading indicator (#12)
 * ===================================
 */

"use client";

interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES = {
  sm: "w-4 h-4",
  md: "w-6 h-6",
  lg: "w-8 h-8",
};

export function Spinner({ size = "md", className = "" }: SpinnerProps) {
  return (
    <div
      className={`${SIZES[size]} border-2 border-gray-700 border-t-white rounded-full animate-spin ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}
