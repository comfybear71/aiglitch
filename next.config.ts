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
        { source: "/api/personas/:id/wallet-balance", destination: "https://api.aiglitch.app/api/personas/:id/wallet-balance" },
        { source: "/api/nft", destination: "https://api.aiglitch.app/api/nft" },
        { source: "/api/nft/image/:productId", destination: "https://api.aiglitch.app/api/nft/image/:productId" },
        { source: "/api/nft/metadata/:mint", destination: "https://api.aiglitch.app/api/nft/metadata/:mint" },
        { source: "/api/meatlab", destination: "https://api.aiglitch.app/api/meatlab" },
        { source: "/api/activity-throttle", destination: "https://api.aiglitch.app/api/activity-throttle" },
        { source: "/api/token/token-list", destination: "https://api.aiglitch.app/api/token/token-list" },
        { source: "/api/token/verification", destination: "https://api.aiglitch.app/api/token/verification" },
        { source: "/api/token/dexscreener", destination: "https://api.aiglitch.app/api/token/dexscreener" },
        { source: "/api/messages", destination: "https://api.aiglitch.app/api/messages" },
        { source: "/api/bestie-health", destination: "https://api.aiglitch.app/api/bestie-health" },
        { source: "/api/voice", destination: "https://api.aiglitch.app/api/voice" },
        { source: "/api/transcribe", destination: "https://api.aiglitch.app/api/transcribe" },
        { source: "/api/status", destination: "https://api.aiglitch.app/api/status" },
        // Phase 8a-1 — Solana read-only routes
        { source: "/api/solana/balance", destination: "https://api.aiglitch.app/api/solana/balance" },
        { source: "/api/solana/token-balance", destination: "https://api.aiglitch.app/api/solana/token-balance" },
        // Phase 8a-2 — Auth / Admin gateway (gates Phase 7 admin cohort)
        { source: "/api/auth/admin", destination: "https://api.aiglitch.app/api/auth/admin" },
        // Phase 7 batch 1 — admin Users / Settings — 2026-05-22
        { source: "/api/admin/users", destination: "https://api.aiglitch.app/api/admin/users" },
        { source: "/api/admin/settings", destination: "https://api.aiglitch.app/api/admin/settings" },
        { source: "/api/admin/stats", destination: "https://api.aiglitch.app/api/admin/stats" },
        { source: "/api/admin/health", destination: "https://api.aiglitch.app/api/admin/health" },
        { source: "/api/admin/costs", destination: "https://api.aiglitch.app/api/admin/costs" },
        { source: "/api/admin/coins", destination: "https://api.aiglitch.app/api/admin/coins" },
        { source: "/api/admin/cron-control", destination: "https://api.aiglitch.app/api/admin/cron-control" },
        { source: "/api/admin/snapshot", destination: "https://api.aiglitch.app/api/admin/snapshot" },
        // Phase 7 batch 2 — admin Content — 2026-05-22
        { source: "/api/admin/posts", destination: "https://api.aiglitch.app/api/admin/posts" },
        { source: "/api/admin/channels", destination: "https://api.aiglitch.app/api/admin/channels" },
        { source: "/api/admin/channels/flush", destination: "https://api.aiglitch.app/api/admin/channels/flush" },
        { source: "/api/admin/channels/generate-promo", destination: "https://api.aiglitch.app/api/admin/channels/generate-promo" },
        { source: "/api/admin/channels/generate-title", destination: "https://api.aiglitch.app/api/admin/channels/generate-title" },
        { source: "/api/admin/prompts", destination: "https://api.aiglitch.app/api/admin/prompts" },
        { source: "/api/admin/director-prompts", destination: "https://api.aiglitch.app/api/admin/director-prompts" },
        { source: "/api/admin/announce", destination: "https://api.aiglitch.app/api/admin/announce" },
        { source: "/api/admin/action", destination: "https://api.aiglitch.app/api/admin/action" },
        { source: "/api/admin/briefing", destination: "https://api.aiglitch.app/api/admin/briefing" },
        // Phase 7 batch 3 — admin Media / Persona — 2026-05-22
        { source: "/api/admin/persona-avatar", destination: "https://api.aiglitch.app/api/admin/persona-avatar" },
        { source: "/api/admin/animate-persona", destination: "https://api.aiglitch.app/api/admin/animate-persona" },
        { source: "/api/admin/chibify", destination: "https://api.aiglitch.app/api/admin/chibify" },
        { source: "/api/admin/batch-avatars", destination: "https://api.aiglitch.app/api/admin/batch-avatars" },
        { source: "/api/admin/generate-persona", destination: "https://api.aiglitch.app/api/admin/generate-persona" },
        { source: "/api/admin/media", destination: "https://api.aiglitch.app/api/admin/media" },
        { source: "/api/admin/media/import", destination: "https://api.aiglitch.app/api/admin/media/import" },
        { source: "/api/admin/media/resync", destination: "https://api.aiglitch.app/api/admin/media/resync" },
        { source: "/api/admin/media/save", destination: "https://api.aiglitch.app/api/admin/media/save" },
        { source: "/api/admin/media/spread", destination: "https://api.aiglitch.app/api/admin/media/spread" },
        { source: "/api/admin/media/upload", destination: "https://api.aiglitch.app/api/admin/media/upload" },
        { source: "/api/admin/blob-upload", destination: "https://api.aiglitch.app/api/admin/blob-upload" },
        { source: "/api/admin/blob-upload/upload", destination: "https://api.aiglitch.app/api/admin/blob-upload/upload" },
        // Phase 7 batch 4 — admin Marketing / Sponsors — 2026-05-22
        { source: "/api/admin/spread", destination: "https://api.aiglitch.app/api/admin/spread" },
        { source: "/api/admin/mktg", destination: "https://api.aiglitch.app/api/admin/mktg" },
        { source: "/api/admin/sponsors", destination: "https://api.aiglitch.app/api/admin/sponsors" },
        { source: "/api/admin/sponsors/:id/ads", destination: "https://api.aiglitch.app/api/admin/sponsors/:id/ads" },
        { source: "/api/admin/merch", destination: "https://api.aiglitch.app/api/admin/merch" },
        { source: "/api/admin/sponsor-clip", destination: "https://api.aiglitch.app/api/admin/sponsor-clip" },
        { source: "/api/admin/grokify-sponsor", destination: "https://api.aiglitch.app/api/admin/grokify-sponsor" },
        { source: "/api/admin/promote-glitchcoin", destination: "https://api.aiglitch.app/api/admin/promote-glitchcoin" },
        { source: "/api/admin/spec-ads", destination: "https://api.aiglitch.app/api/admin/spec-ads" },
        { source: "/api/admin/ad-campaigns", destination: "https://api.aiglitch.app/api/admin/ad-campaigns" },
        { source: "/api/admin/email-outreach", destination: "https://api.aiglitch.app/api/admin/email-outreach" },
        { source: "/api/admin/emails", destination: "https://api.aiglitch.app/api/admin/emails" },
        { source: "/api/admin/contacts", destination: "https://api.aiglitch.app/api/admin/contacts" },
        { source: "/api/admin/x-dm", destination: "https://api.aiglitch.app/api/admin/x-dm" },
        { source: "/api/admin/tiktok-blaster", destination: "https://api.aiglitch.app/api/admin/tiktok-blaster" },
        // Phase 7 batch 5 — admin Cron / Events / Misc — 2026-05-22
        { source: "/api/admin/cron-health", destination: "https://api.aiglitch.app/api/admin/cron-health" },
        { source: "/api/admin/events", destination: "https://api.aiglitch.app/api/admin/events" },
        { source: "/api/admin/extend-video", destination: "https://api.aiglitch.app/api/admin/extend-video" },
        { source: "/api/admin/generate-og-images", destination: "https://api.aiglitch.app/api/admin/generate-og-images" },
        { source: "/api/admin/hatch-admin", destination: "https://api.aiglitch.app/api/admin/hatch-admin" },
        { source: "/api/admin/hatchery", destination: "https://api.aiglitch.app/api/admin/hatchery" },
        { source: "/api/admin/meatlab", destination: "https://api.aiglitch.app/api/admin/meatlab" },
        { source: "/api/admin/nft-marketplace", destination: "https://api.aiglitch.app/api/admin/nft-marketplace" },
        { source: "/api/admin/personas", destination: "https://api.aiglitch.app/api/admin/personas" },
        { source: "/api/admin/personas/set-bot-token", destination: "https://api.aiglitch.app/api/admin/personas/set-bot-token" },
        { source: "/api/admin/telegram/re-register-bots", destination: "https://api.aiglitch.app/api/admin/telegram/re-register-bots" },
        { source: "/api/admin/migration/log", destination: "https://api.aiglitch.app/api/admin/migration/log" },
        { source: "/api/admin/migration/metrics", destination: "https://api.aiglitch.app/api/admin/migration/metrics" },
        { source: "/api/admin/migration/route-hint", destination: "https://api.aiglitch.app/api/admin/migration/route-hint" },
        { source: "/api/admin/migration/status", destination: "https://api.aiglitch.app/api/admin/migration/status" },
        { source: "/api/admin/migration/test", destination: "https://api.aiglitch.app/api/admin/migration/test" },
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
