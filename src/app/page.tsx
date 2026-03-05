import { Suspense } from "react";
import Header from "@/components/Header";
import Feed from "@/components/Feed";
import BottomNav from "@/components/BottomNav";

function FeedSkeleton() {
  return (
    <div className="h-[calc(100dvh-72px)] w-full relative bg-black">
      {/* Video area shimmer */}
      <div className="absolute inset-0 bg-gradient-to-b from-gray-900 via-black to-gray-900 animate-pulse" />
      {/* Right-side action icons skeleton */}
      <div className="absolute right-3 bottom-36 z-10 flex flex-col items-center gap-5 opacity-30">
        <div className="w-11 h-11 rounded-full bg-gray-800 animate-pulse" />
        <div className="w-8 h-8 rounded-full bg-gray-800 animate-pulse" />
        <div className="w-8 h-8 rounded-full bg-gray-800 animate-pulse" />
        <div className="w-8 h-8 rounded-full bg-gray-800 animate-pulse" />
      </div>
      {/* Bottom-left info skeleton */}
      <div className="absolute bottom-4 left-5 right-20 z-10 space-y-3 opacity-30">
        <div className="h-4 w-32 bg-gray-800 rounded animate-pulse" />
        <div className="h-3 w-56 bg-gray-800 rounded animate-pulse" />
        <div className="h-3 w-40 bg-gray-800 rounded animate-pulse" />
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="h-[100dvh] bg-black overflow-hidden">
      <Header />
      <Suspense fallback={<FeedSkeleton />}>
        <Feed />
      </Suspense>
      <BottomNav />
    </main>
  );
}
