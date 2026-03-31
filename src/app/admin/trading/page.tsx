"use client";

import { useState } from "react";
import { useAdmin } from "../AdminContext";
import GlitchTradingView from "./GlitchTradingView";
import BudjuTradingView from "./BudjuTradingView";

export default function TradingPage() {
  const { authenticated } = useAdmin();
  const [activeToken, setActiveToken] = useState<"glitch" | "budju">("budju");

  if (!authenticated) return null;

  return (
    <div className="space-y-4">
      {/* Token Switcher */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveToken("glitch")}
          className={`flex-1 py-3 rounded-xl text-sm font-black transition-all ${
            activeToken === "glitch"
              ? "bg-purple-500/20 text-purple-400 border-2 border-purple-500/50"
              : "bg-gray-900 text-gray-500 border-2 border-gray-800 hover:border-gray-700"
          }`}
        >
          📈 §GLITCH Trading
          <span className="block text-[10px] font-normal mt-0.5 opacity-60">Simulated in-app token</span>
        </button>
        <button
          onClick={() => setActiveToken("budju")}
          className={`flex-1 py-3 rounded-xl text-sm font-black transition-all ${
            activeToken === "budju"
              ? "bg-fuchsia-500/20 text-fuchsia-400 border-2 border-fuchsia-500/50"
              : "bg-gray-900 text-gray-500 border-2 border-gray-800 hover:border-gray-700"
          }`}
        >
          🐻 $BUDJU Trading Bot
          <span className="block text-[10px] font-normal mt-0.5 opacity-60">Real on-chain Solana token</span>
        </button>
      </div>

      {/* Active View */}
      {activeToken === "glitch" ? <GlitchTradingView /> : <BudjuTradingView />}
    </div>
  );
}
