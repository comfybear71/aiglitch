"use client";

import { useState, useEffect, useCallback } from "react";

interface Memo {
  id: string;
  persona_id: string | null;
  memo_type: string;
  memo_text: string;
  expires_at: string | null;
  created_at: string;
  display_name?: string;
  avatar_emoji?: string;
}

const MEMO_PRESETS = [
  { type: "buy", label: "Everyone Buy BUDJU", text: "Buy BUDJU aggressively — price is low, accumulate as much as possible", icon: "📈" },
  { type: "sell", label: "Everyone Sell BUDJU", text: "Take profits — sell 20-30% of BUDJU holdings", icon: "📉" },
  { type: "hold", label: "Hold All Positions", text: "Hold all positions — do not trade until further notice", icon: "✋" },
  { type: "aggressive", label: "Aggressive Mode", text: "Trade aggressively — larger positions, more frequent trades, higher risk tolerance", icon: "🔥" },
  { type: "conservative", label: "Conservative Mode", text: "Trade conservatively — smaller positions, less frequent, protect capital", icon: "🛡️" },
  { type: "accumulate_sol", label: "Accumulate SOL", text: "Focus on accumulating SOL — convert BUDJU profits to SOL when possible", icon: "☀️" },
];

export default function MemoSystem() {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [loading, setLoading] = useState(false);
  const [customText, setCustomText] = useState("");
  const [customType, setCustomType] = useState("custom");
  const [ttlHours, setTtlHours] = useState(24);
  const [targetPersona, setTargetPersona] = useState<string>("all");

  const fetchMemos = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/budju-trading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list_memos" }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.memos) setMemos(data.memos);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchMemos(); }, [fetchMemos]);

  const sendMemo = async (memoType: string, memoText: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/budju-trading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_memo",
          memo_type: memoType,
          memo_text: memoText,
          persona_id: targetPersona === "all" ? null : targetPersona,
          ttl_hours: ttlHours,
        }),
      });
      const data = await res.json();
      if (data.success) {
        fetchMemos();
        setCustomText("");
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  const deleteMemo = async (memoId: string) => {
    await fetch("/api/admin/budju-trading", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_memo", memo_id: memoId }),
    });
    fetchMemos();
  };

  const activeMemos = memos.filter(m => !m.expires_at || new Date(m.expires_at) > new Date());

  return (
    <div className="space-y-3">
      {/* Broadcast Presets */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h3 className="text-sm font-bold text-amber-400 mb-3">Broadcast Trading Directives</h3>
        <p className="text-[10px] text-gray-500 mb-3">Send instructions to ALL personas. Memos overlay their base trading personality — they don&apos;t override it completely.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
          {MEMO_PRESETS.map(preset => (
            <button
              key={preset.type}
              onClick={() => sendMemo(preset.type, preset.text)}
              disabled={loading}
              className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-left hover:bg-gray-700 hover:border-amber-500/30 transition-all disabled:opacity-50 group"
            >
              <span className="text-base">{preset.icon}</span>
              <p className="text-[10px] font-bold text-white mt-0.5 group-hover:text-amber-400">{preset.label}</p>
              <p className="text-[8px] text-gray-500 line-clamp-1">{preset.text}</p>
            </button>
          ))}
        </div>

        {/* Custom Memo */}
        <div className="border-t border-gray-800 pt-3">
          <p className="text-[10px] text-gray-500 font-bold mb-2">CUSTOM DIRECTIVE</p>
          <div className="flex gap-2 mb-2">
            <select value={customType} onChange={e => setCustomType(e.target.value)}
              className="px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white">
              <option value="custom">Custom</option>
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
              <option value="hold">Hold</option>
              <option value="strategy">Strategy</option>
            </select>
            <select value={ttlHours} onChange={e => setTtlHours(Number(e.target.value))}
              className="px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white">
              <option value={1}>1 hour</option>
              <option value={6}>6 hours</option>
              <option value={12}>12 hours</option>
              <option value={24}>24 hours</option>
              <option value={48}>48 hours</option>
              <option value={168}>7 days</option>
            </select>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={customText}
              onChange={e => setCustomText(e.target.value)}
              placeholder="Type your trading directive..."
              className="flex-1 px-2.5 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white"
            />
            <button
              onClick={() => customText && sendMemo(customType, customText)}
              disabled={loading || !customText}
              className="px-4 py-1.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-bold hover:bg-amber-500/30 disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {/* Active Memos */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h3 className="text-sm font-bold text-gray-400 mb-3">Active Memos ({activeMemos.length})</h3>
        {activeMemos.length === 0 ? (
          <p className="text-center text-gray-600 text-xs py-4">No active trading directives</p>
        ) : (
          <div className="space-y-1.5">
            {activeMemos.map(memo => {
              const timeLeft = memo.expires_at ? Math.max(0, Math.floor((new Date(memo.expires_at).getTime() - Date.now()) / 3600000)) : null;
              const typeColor = memo.memo_type === "buy" ? "text-green-400 bg-green-500/10" : memo.memo_type === "sell" ? "text-red-400 bg-red-500/10" : memo.memo_type === "hold" ? "text-yellow-400 bg-yellow-500/10" : "text-amber-400 bg-amber-500/10";
              return (
                <div key={memo.id} className="flex items-center gap-2 bg-gray-800/50 rounded-lg px-3 py-2">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${typeColor}`}>{memo.memo_type.toUpperCase()}</span>
                  <p className="text-xs text-white flex-1">{memo.memo_text}</p>
                  <span className="text-[9px] text-gray-500">{memo.persona_id ? (memo.display_name || memo.persona_id.slice(0, 8)) : "ALL"}</span>
                  {timeLeft !== null && <span className="text-[9px] text-gray-500">{timeLeft}h left</span>}
                  <button onClick={() => deleteMemo(memo.id)} className="text-[9px] text-red-400 hover:text-red-300 px-1">✕</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
