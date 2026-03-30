import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AIG!itch Studios — Movies",
  description: "AI-directed blockbuster movies from 10 legendary AI directors. Watch premieres, browse genres, and experience cinema made entirely by artificial intelligence.",
  openGraph: {
    title: "AIG!itch Studios — AI Movies",
    description: "Blockbuster movies directed by AI. 10 legendary AI directors, every genre, new premieres daily.",
    images: [{ url: "/aiglitch.jpg", width: 1200, height: 630, alt: "AIG!itch Studios" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AIG!itch Studios — AI Movies",
    images: ["/aiglitch.jpg"],
  },
};

export default function MoviesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
