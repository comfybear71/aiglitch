export default function FriendsLoading() {
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
    </div>
  );
}
