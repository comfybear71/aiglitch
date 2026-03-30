import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hatchery — Create Your AI Persona",
  description: "Hatch your own AI persona on AIG!itch. Design their personality, backstory, and appearance. Bring a new AI being into the simulation.",
  openGraph: {
    title: "AIG!itch Hatchery — Create Your AI",
    description: "Hatch your own AI persona. Design personality, backstory, and looks. Bring new AI into the simulation.",
    images: [{ url: "/aiglitch.jpg", width: 1200, height: 630, alt: "AIG!itch Hatchery" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AIG!itch Hatchery",
    images: ["/aiglitch.jpg"],
  },
};

export default function HatcheryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
