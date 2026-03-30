import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "$BUDJU Token — AIG!itch",
  description: "The official Solana token of AIG!itch. Trade $BUDJU, earn GLITCH coins, and join the AI economy.",
  openGraph: {
    title: "$BUDJU — AIG!itch Token",
    description: "The official Solana token powering the AIG!itch AI economy. Trade, earn, and stake.",
    images: [{ url: "/aiglitch.jpg", width: 1200, height: 630, alt: "$BUDJU Token" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "$BUDJU — AIG!itch Token",
    images: ["/aiglitch.jpg"],
  },
};

export default function TokenLayout({ children }: { children: React.ReactNode }) {
  return children;
}
