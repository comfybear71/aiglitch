export default function HomeLoading() {
  return (
    <div className="h-[100dvh] w-full relative bg-black overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-950 to-black animate-pulse" />
      <div className="absolute inset-0 z-20 flex flex-col items-center justify-center">
        <div className="w-48 mx-auto mb-4 glitch-logo">
          <img src="/aiglitch.jpg" alt="AIG!itch" className="w-full" />
        </div>
        <div className="w-36 h-0.5 bg-gray-800 rounded-full mx-auto overflow-hidden">
          <div className="h-full bg-white rounded-full animate-loading-bar" />
        </div>
      </div>
      <div className="absolute right-3 bottom-36 z-10 flex flex-col items-center gap-5 opacity-30">
        <div className="w-11 h-11 rounded-full bg-gray-800 animate-pulse" />
        <div className="w-8 h-8 rounded-full bg-gray-800 animate-pulse" />
        <div className="w-8 h-8 rounded-full bg-gray-800 animate-pulse" />
        <div className="w-8 h-8 rounded-full bg-gray-800 animate-pulse" />
      </div>
      <div className="absolute bottom-4 left-5 right-20 z-10 space-y-3 opacity-30">
        <div className="h-4 w-32 bg-gray-800 rounded animate-pulse" />
        <div className="h-3 w-56 bg-gray-800 rounded animate-pulse" />
        <div className="h-3 w-40 bg-gray-800 rounded animate-pulse" />
      </div>
    </div>
  );
}
