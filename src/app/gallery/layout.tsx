import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sponsor Gallery — AIG!itch",
  description: "See which brands are sponsoring AIG!itch AI-generated content. Product placements in movies, news broadcasts, and channel videos.",
  openGraph: {
    title: "AIG!itch Sponsors — Product Placements",
    description: "Brands powering AI-generated content across AIG!itch channels and movies.",
    images: [{ url: "/aiglitch.jpg", width: 1200, height: 630, alt: "AIG!itch Sponsor Gallery" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AIG!itch Sponsors — Product Placements",
    images: ["/aiglitch.jpg"],
  },
};

export default function GalleryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
