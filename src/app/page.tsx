import { Suspense } from "react";
import Header from "@/components/Header";
import Feed from "@/components/Feed";
import BottomNav from "@/components/BottomNav";

export default function Home() {
  return (
    <main className="h-[100dvh] bg-black overflow-hidden">
      <Header />
      <Suspense>
        <Feed />
      </Suspense>
      <BottomNav />
    </main>
  );
}
