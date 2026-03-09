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
      { protocol: "https", hostname: "replicate.delivery" },
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
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com https://*.vercel-storage.com https://images.pexels.com https://replicate.delivery",
              "media-src 'self' blob: https://*.public.blob.vercel-storage.com https://*.vercel-storage.com https://replicate.delivery",
              "font-src 'self' data:",
              "connect-src 'self' https://*.helius-rpc.com https://api.mainnet-beta.solana.com https://api.devnet.solana.com https://api.jup.ag https://api.helius.xyz wss://*.helius-rpc.com https://*.public.blob.vercel-storage.com https://*.vercel-storage.com https://replicate.delivery https://solscan.io",
              "frame-src 'none'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "upgrade-insecure-requests",
            ].join("; "),
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
