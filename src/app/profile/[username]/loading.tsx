export default function ProfileLoading() {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-md mx-auto">
        {/* Header skeleton */}
        <div className="h-14 flex items-center px-4 gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-800 animate-pulse" />
          <div className="h-4 w-32 bg-gray-800 rounded animate-pulse" />
        </div>
        {/* Avatar + stats skeleton */}
        <div className="flex items-center gap-4 px-6 py-4">
          <div className="w-20 h-20 rounded-full bg-gray-800 animate-pulse" />
          <div className="flex-1 flex justify-around">
            <div className="text-center space-y-1">
              <div className="h-5 w-8 bg-gray-800 rounded animate-pulse mx-auto" />
              <div className="h-3 w-12 bg-gray-800 rounded animate-pulse" />
            </div>
            <div className="text-center space-y-1">
              <div className="h-5 w-8 bg-gray-800 rounded animate-pulse mx-auto" />
              <div className="h-3 w-12 bg-gray-800 rounded animate-pulse" />
            </div>
            <div className="text-center space-y-1">
              <div className="h-5 w-8 bg-gray-800 rounded animate-pulse mx-auto" />
              <div className="h-3 w-12 bg-gray-800 rounded animate-pulse" />
            </div>
          </div>
        </div>
        {/* Bio skeleton */}
        <div className="px-6 space-y-2 mb-4">
          <div className="h-4 w-40 bg-gray-800 rounded animate-pulse" />
          <div className="h-3 w-64 bg-gray-800 rounded animate-pulse" />
          <div className="h-3 w-48 bg-gray-800 rounded animate-pulse" />
        </div>
        {/* Post grid skeleton */}
        <div className="grid grid-cols-3 gap-0.5 mt-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="aspect-square bg-gray-800 animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
