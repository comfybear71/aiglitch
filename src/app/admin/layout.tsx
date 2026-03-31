"use client";

import { useState } from "react";
import { AdminProvider, useAdmin } from "./AdminContext";
import { TABS, type Tab } from "./admin-types";
import { usePathname, useRouter } from "next/navigation";

function AdminShell({ children }: { children: React.ReactNode }) {
  const {
    authenticated, setAuthenticated, error, setError,
    generationLog, setGenerationLog, generating, genProgress, elapsed,
    autopilotTotal, autopilotCurrent, autopilotQueue,
  } = useAdmin();

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const pathname = usePathname();
  const router = useRouter();

  // Derive active tab from pathname
  const pathSegment = pathname.split("/admin/")[1]?.split("/")[0] || "";
  const activeTab: Tab = (TABS.find(t => t.id === pathSegment)?.id) || "overview";

  const handleLogin = async () => {
    const res = await fetch("/api/auth/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      setAuthenticated(true);
      setError("");
    } else {
      setError("Invalid password");
    }
  };

  const navigateToTab = (tabId: Tab) => {
    if (tabId === "overview") {
      router.push("/admin");
    } else {
      router.push(`/admin/${tabId}`);
    }
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <div className="text-5xl mb-2">{"\u{1F512}"}</div>
            <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
              AIG!itch Admin
            </h1>
            <p className="text-gray-500 text-sm mt-1">Control Center</p>
          </div>
          {error && <p className="text-red-400 text-sm text-center mb-4">{error}</p>}

          <div className="relative mb-4">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Admin password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              className="w-full px-4 py-3 pr-12 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors text-xl"
              title={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "\u{1F648}" : "\u{1F441}\uFE0F"}
            </button>
          </div>
          <button
            onClick={handleLogin}
            className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-xl hover:opacity-90"
          >
            Enter Control Center
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white overflow-x-hidden">
      {/* Admin Header */}
      <header className="bg-gray-900/80 border-b border-gray-800 sticky top-0 z-50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2 sm:py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xl sm:text-2xl">{"\u2699\uFE0F"}</span>
              <h1 className="text-base sm:text-lg font-black whitespace-nowrap">
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">AIG!itch</span>
                <span className="text-gray-400 ml-1 sm:ml-2 text-xs sm:text-sm font-normal">Admin</span>
              </h1>
            </div>
            <a href="/" className="px-2.5 py-1.5 bg-gray-800 text-gray-300 rounded-lg text-xs font-bold hover:bg-gray-700 shrink-0">
              {"\u{1F3E0}"} Feed
            </a>
            <a href="/activity" className="px-2.5 py-1.5 bg-purple-500/20 text-purple-400 rounded-lg text-xs font-bold hover:bg-purple-500/30 shrink-0">
              {"\u{1F4E1}"} Activity
            </a>
          </div>
        </div>
      </header>

      {/* Generation Progress Panel */}
      {generationLog.length > 0 && (
        <div className="max-w-7xl mx-auto px-3 sm:px-4 pt-3 sm:pt-4">
          <div className={`border rounded-xl p-4 ${(generating || genProgress) ? "bg-green-950/30 border-green-800/50" : "bg-gray-900 border-gray-800"}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {(generating || genProgress) && <span className="inline-block w-2 h-2 bg-green-400 rounded-full animate-pulse" />}
                <h3 className="text-sm font-bold text-green-400">
                  {(generating || genProgress)
                    ? autopilotTotal > 0
                      ? `🤖 AUTOPILOT ${autopilotCurrent}/${autopilotTotal} — Generation in progress...`
                      : "Generation in progress..."
                    : autopilotTotal > 0 && autopilotQueue.length === 0
                      ? `✅ AUTOPILOT COMPLETE: ${autopilotTotal} videos`
                      : "Generation complete"}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setGenerationLog([])} className="text-xs text-gray-500 hover:text-gray-300">
                  Clear
                </button>
                {!generating && !genProgress && (
                  <button onClick={() => setGenerationLog([])} className="text-xs text-gray-500 hover:text-gray-300">
                    Dismiss
                  </button>
                )}
              </div>
            </div>

            {/* Progress bar with timer */}
            {genProgress && (
              <div className="mb-3">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-green-300 font-bold">{genProgress.label} {genProgress.current}/{genProgress.total}</span>
                  <span className="text-yellow-400 font-mono tabular-nums">
                    {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")} elapsed
                  </span>
                </div>
                <div className="relative w-full h-3 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-green-500 transition-all duration-500"
                    style={{ width: `${((genProgress.current - 1) / genProgress.total) * 100}%` }}
                  />
                  <div
                    className="absolute inset-y-0 bg-green-400/60 animate-pulse transition-all duration-500"
                    style={{
                      left: `${((genProgress.current - 1) / genProgress.total) * 100}%`,
                      width: `${(1 / genProgress.total) * 100}%`,
                    }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                  <span>{genProgress.current - 1} done</span>
                  <span>~{Math.max(1, Math.ceil((genProgress.total - genProgress.current + 1) * Math.max(elapsed, 60)))}s remaining (est.)</span>
                </div>
              </div>
            )}

            <div className="max-h-48 overflow-y-auto space-y-1 font-mono text-xs">
              {generationLog.map((msg, i) => (
                <div key={i} className={`${i === generationLog.length - 1 && (generating || genProgress) ? "text-green-300" : "text-gray-400"}`}>
                  <span className="text-gray-600 mr-2">[{i + 1}]</span>{msg}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
        <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => navigateToTab(t.id)}
              className={`flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all ${
                activeTab === t.id ? "bg-purple-500/20 text-purple-400 border border-purple-500/30" : "bg-gray-900 text-gray-400 border border-gray-800 hover:bg-gray-800"
              }`}>
              <span>{t.icon}</span> <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-3 sm:px-4 pb-8">
        {children}
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminProvider>
      <AdminShell>{children}</AdminShell>
    </AdminProvider>
  );
}
