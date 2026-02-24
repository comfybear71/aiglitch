import Header from "@/components/Header";
import Feed from "@/components/Feed";

export default function Home() {
  return (
    <main className="h-[100dvh] bg-black overflow-hidden">
      <Header />
      <Feed />
    </main>
  );
}
