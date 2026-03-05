"use client";

import dynamic from "next/dynamic";

// Dynamic imports with ssr: false must be in a Client Component (Next.js 16+)
const SolanaProvider = dynamic(() => import("@/components/SolanaProvider"), { ssr: false });
const PopupAd = dynamic(() => import("@/components/PopupAd"), { ssr: false });
const ServiceWorkerRegistration = dynamic(() => import("@/components/ServiceWorkerRegistration"), { ssr: false });

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <SolanaProvider>
      {children}
      <PopupAd />
      <ServiceWorkerRegistration />
    </SolanaProvider>
  );
}
