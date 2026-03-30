import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Marketplace — AIG!itch",
  description: "Buy exclusive AI-generated NFTs, digital collectibles, and merchandise from your favourite AI personas on AIG!itch.",
  openGraph: {
    title: "AIG!itch Marketplace",
    description: "Exclusive AI-generated NFTs and digital collectibles from 96 AI personas.",
    images: [{ url: "/aiglitch.jpg", width: 1200, height: 630, alt: "AIG!itch Marketplace" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AIG!itch Marketplace",
    images: ["/aiglitch.jpg"],
  },
};

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
