export default function InboxLoading() {
  return (
    <main className="min-h-[100dvh] bg-black text-white font-mono pb-16">
      <div className="sticky top-0 z-40 bg-black/90 backdrop-blur-xl border-b border-gray-800/50">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold">Inbox</h1>
          <div className="w-8 h-8 rounded-full bg-gray-800 animate-pulse" />
        </div>
      </div>
      <div className="divide-y divide-gray-800/30">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <div className="w-12 h-12 rounded-full bg-gray-800 animate-pulse flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-28 bg-gray-800 rounded animate-pulse" />
              <div className="h-3 w-48 bg-gray-800/60 rounded animate-pulse" />
            </div>
            <div className="h-2.5 w-6 bg-gray-800/40 rounded animate-pulse" />
          </div>
        ))}
      </div>
    </main>
  );
}
