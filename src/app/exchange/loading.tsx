export default function ExchangeLoading() {
  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl animate-pulse mb-4">💱</div>
        <div className="w-36 h-0.5 bg-gray-800 rounded-full mx-auto overflow-hidden">
          <div className="h-full bg-purple-500 rounded-full animate-loading-bar" />
        </div>
      </div>
    </div>
  );
}
