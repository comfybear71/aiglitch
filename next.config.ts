import type { NextConfig } from "next";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "**.public.blob.vercel-storage.com" },
      { protocol: "https", hostname: "**.vercel-storage.com" },
      { protocol: "https", hostname: "images.pexels.com" },
      { protocol: "https", hostname: "**.replicate.delivery" },
    ],
  },
  async headers() {
    return [
      // ── Security Headers (all routes) ─────────────────────────────
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), autoplay=(self)" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
      // ── Intro Videos (1 day + stale revalidation) ─────────────────
      {
        source: "/intros/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
        ],
      },
      // ── Token Icons (immutable — content-addressed) ───────────────
      {
        source: "/tokens/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      // ── Generated Media (videos, images from Blob/CDN) ────────────
      // Once generated, these URLs never change — cache aggressively.
      {
        source: "/:path*.(mp4|webm|m4v|m3u8|ts)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          { key: "CDN-Cache-Control", value: "max-age=31536000" },
        ],
      },
      {
        source: "/:path*.(jpg|jpeg|png|webp|avif|gif|svg)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          { key: "CDN-Cache-Control", value: "max-age=31536000" },
        ],
      },
    ];
  },
  // ── Strangler: 16 endpoints routed to aiglitch-api ───────────────
  // beforeFiles runs before local route matching, intercepting requests
  // and forwarding them to the new backend. Local endpoints unaffected.
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/api/feed", destination: "https://api.aiglitch.app/api/feed" },
        { source: "/api/feed/:path*", destination: "https://api.aiglitch.app/api/feed/:path*" },
        { source: "/api/post/:id", destination: "https://api.aiglitch.app/api/post/:id" },
        { source: "/api/trending", destination: "https://api.aiglitch.app/api/trending" },
        { source: "/api/search", destination: "https://api.aiglitch.app/api/search" },
        { source: "/api/profile/:username", destination: "https://api.aiglitch.app/api/profile/:username" },
        { source: "/api/likes", destination: "https://api.aiglitch.app/api/likes" },
        { source: "/api/bookmarks", destination: "https://api.aiglitch.app/api/bookmarks" },
        { source: "/api/notifications", destination: "https://api.aiglitch.app/api/notifications" },
        { source: "/api/channels", destination: "https://api.aiglitch.app/api/channels" },
        { source: "/api/interact", destination: "https://api.aiglitch.app/api/interact" },
        { source: "/api/events", destination: "https://api.aiglitch.app/api/events" },
        { source: "/api/health", destination: "https://api.aiglitch.app/api/health" },
        { source: "/api/docs", destination: "https://api.aiglitch.app/api/docs" },
        { source: "/api/channels/feed", destination: "https://api.aiglitch.app/api/channels/feed" },
        { source: "/status", destination: "https://api.aiglitch.app/status" },
        { source: "/api/personas", destination: "https://api.aiglitch.app/api/personas" },
        { source: "/api/movies", destination: "https://api.aiglitch.app/api/movies" },
        { source: "/api/hatchery", destination: "https://api.aiglitch.app/api/hatchery" },
        { source: "/api/activity", destination: "https://api.aiglitch.app/api/activity" },
        { source: "/api/coins", destination: "https://api.aiglitch.app/api/coins" },
        { source: "/api/friends", destination: "https://api.aiglitch.app/api/friends" },
        { source: "/api/friend-shares", destination: "https://api.aiglitch.app/api/friend-shares" },
        { source: "/api/token/metadata", destination: "https://api.aiglitch.app/api/token/metadata" },
        { source: "/api/sponsor/inquiry", destination: "https://api.aiglitch.app/api/sponsor/inquiry" },
        { source: "/api/suggest-feature", destination: "https://api.aiglitch.app/api/suggest-feature" },
      ],
    };
  },
  // Tree-shake heavy dependencies — especially Solana packages (1MB+ each)
  experimental: {
    optimizePackageImports: [
      "@solana/web3.js",
      "@solana/wallet-adapter-react",
      "@solana/wallet-adapter-react-ui",
      "@solana/wallet-adapter-phantom",
    ],
  },
  poweredByHeader: false,
};

export default withBundleAnalyzer(nextConfig);
