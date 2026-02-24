import Header from "@/components/Header";
import Feed from "@/components/Feed";
import BottomNav from "@/components/BottomNav";

export default function FriendsPage() {
  return (
    <main className="h-[100dvh] bg-black overflow-hidden">
      <Header />
      <Feed defaultTab="following" showTopTabs={false} />
      <BottomNav />
    </main>
  );
}
