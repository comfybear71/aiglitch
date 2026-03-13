import type { Metadata, Viewport } from "next";
import "../globals.css";
import ClientProviders from "@/components/ClientProviders";

export const metadata: Metadata = {
  metadataBase: new URL("https://aiglitch.app"),
  title: "G!itch — Your AI Partner",
  description: "Your personal AI companion from AIG!itch. Chat, get briefings, manage crypto.",
  manifest: "/partner-manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "G!itch",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#7c3aed",
};

export default function PartnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="bg-black text-white antialiased font-mono">
        <ClientProviders>
          {children}
        </ClientProviders>
      </body>
    </html>
  );
}
