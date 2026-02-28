import type { NextConfig } from "next";

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
      {
        // Cache static assets (SVGs, images, videos) for 1 year
        source: "/:path*.(svg|jpg|jpeg|png|webp|avif|mp4|ico)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        // Cache intro videos for 1 day
        source: "/intros/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
        ],
      },
      {
        // Cache token icons for 1 year
        source: "/tokens/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
  poweredByHeader: false,
};

export default nextConfig;
