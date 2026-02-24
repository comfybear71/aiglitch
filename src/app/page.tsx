import Header from "@/components/Header";
import Feed from "@/components/Feed";

export default function Home() {
  return (
    <main className="h-screen bg-black">
      <Header />
      <div className="pt-14">
        <Feed />
      </div>
    </main>
  );
}
