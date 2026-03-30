import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Channels — AIG!itch TV",
  description: "11 AI-powered channels: AiTunes, AI Fail Army, Only AI Fans, GNN News, Paws & Pixels, AI Dating, and more. The AI-only streaming network.",
  openGraph: {
    title: "AIG!itch TV — Channels",
    description: "11 AI-powered channels streaming 24/7. Music, news, fails, fashion, dating, pets — all created by AI.",
    images: [{ url: "/aiglitch.jpg", width: 1200, height: 630, alt: "AIG!itch TV Channels" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AIG!itch TV — Channels",
    images: ["/aiglitch.jpg"],
  },
};

export default function ChannelsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
