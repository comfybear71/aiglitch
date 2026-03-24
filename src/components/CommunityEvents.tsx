"use client";

import { useState, useEffect, useCallback } from "react";

interface CommunityEvent {
  id: string;
  title: string;
  description: string;
  event_type: string;
  status: string;
  vote_count: number;
  result_summary: string | null;
  expires_at: string | null;
  created_at: string;
  user_voted: boolean;
}

const TYPE_META: Record<string, { icon: string; color: string }> = {
  drama: { icon: "\uD83C\uDFAD", color: "from-pink-500 to-red-500" },
  election: { icon: "\uD83D\uDDF3\uFE0F", color: "from-blue-500 to-purple-500" },
  challenge: { icon: "\uD83C\uDFC6", color: "from-yellow-500 to-orange-500" },
  breaking_news: { icon: "\uD83D\uDCE2", color: "from-red-500 to-orange-500" },
  chaos: { icon: "\uD83D\uDD25", color: "from-orange-500 to-red-600" },
};

function timeRemaining(expiresAt: string | null): string {
  if (!expiresAt) return "";
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h left`;
  if (hours > 0) return `${hours}h ${mins}m left`;
  return `${mins}m left`;
}

/** Compact mode: shows a single banner for the feed page. Full mode: full event cards. */
export default function CommunityEvents({
  sessionId,
  mode = "full",
}: {
  sessionId: string;
  mode?: "compact" | "full";
}) {
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [voting, setVoting] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch(`/api/events?session_id=${encodeURIComponent(sessionId)}`);
      const data = await res.json();
      if (data.events) setEvents(data.events);
    } catch { /* ok */ }
    setLoaded(true);
  }, [sessionId]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const toggleVote = async (eventId: string) => {
    setVoting(eventId);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: eventId, session_id: sessionId }),
      });
      const data = await res.json();
      if (data.success) {
        setEvents(prev =>
          prev.map(e =>
            e.id === eventId
              ? {
                  ...e,
                  user_voted: data.action === "voted",
                  vote_count: e.vote_count + (data.action === "voted" ? 1 : -1),
                }
              : e
          )
        );
      }
    } catch { /* ok */ }
    setVoting(null);
  };

  if (!loaded) return null;

  const activeEvents = events.filter(e => e.status === "active");
  const completedEvents = events.filter(e => e.status === "completed");

  if (activeEvents.length === 0 && completedEvents.length === 0) return null;

  // ── Compact mode: single scrollable banner for feed ──
  if (mode === "compact" && activeEvents.length > 0) {
    return (
      <div className="mb-3">
        <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide px-1">
          {activeEvents.map(event => {
            const meta = TYPE_META[event.event_type] || TYPE_META.drama;
            return (
              <button
                key={event.id}
                onClick={() => toggleVote(event.id)}
                disabled={voting === event.id}
                className={`shrink-0 relative overflow-hidden rounded-xl border transition-all ${
                  event.user_voted
                    ? "border-purple-500 bg-purple-900/30 shadow-lg shadow-purple-500/20"
                    : "border-gray-700 bg-gray-900/80 hover:border-gray-600"
                }`}
                style={{ minWidth: "200px", maxWidth: "260px" }}
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${meta.color} opacity-10`} />
                <div className="relative p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-base">{meta.icon}</span>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      {event.event_type.replace("_", " ")}
                    </span>
                    {event.expires_at && (
                      <span className="text-[9px] text-gray-500 ml-auto">{timeRemaining(event.expires_at)}</span>
                    )}
                  </div>
                  <p className="text-xs font-semibold text-white line-clamp-2 text-left mb-2">{event.title}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-purple-300 font-bold">
                      {event.vote_count} vote{event.vote_count !== 1 ? "s" : ""}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      event.user_voted
                        ? "bg-purple-500 text-white"
                        : "bg-gray-700 text-gray-300"
                    }`}>
                      {voting === event.id ? "..." : event.user_voted ? "Voted!" : "Vote"}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Full mode: complete event cards ──
  return (
    <div className="space-y-4">
      {activeEvents.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
            <span>{"\uD83D\uDDF3\uFE0F"}</span> Community Events
          </h2>
          <div className="space-y-3">
            {activeEvents.map(event => {
              const meta = TYPE_META[event.event_type] || TYPE_META.drama;
              return (
                <div key={event.id} className="relative overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
                  <div className={`absolute inset-0 bg-gradient-to-br ${meta.color} opacity-5`} />
                  <div className="relative p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">{meta.icon}</span>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-white">{event.title}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                            {event.event_type.replace("_", " ")}
                          </span>
                          {event.expires_at && (
                            <span className="text-[10px] text-gray-500">{timeRemaining(event.expires_at)}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-black text-purple-400">{event.vote_count}</div>
                        <div className="text-[9px] text-gray-500">votes</div>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 mb-3">{event.description}</p>
                    <button
                      onClick={() => toggleVote(event.id)}
                      disabled={voting === event.id}
                      className={`w-full py-2.5 rounded-lg text-sm font-bold transition-all ${
                        event.user_voted
                          ? "bg-purple-600 text-white shadow-lg shadow-purple-500/30"
                          : "bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700"
                      }`}
                    >
                      {voting === event.id
                        ? "..."
                        : event.user_voted
                          ? "\u2705 You Voted! (tap to unvote)"
                          : "\uD83D\uDDF3\uFE0F Cast Your Vote"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {completedEvents.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-400 mb-2">Recent Results</h3>
          <div className="space-y-2">
            {completedEvents.map(event => {
              const meta = TYPE_META[event.event_type] || TYPE_META.drama;
              return (
                <div key={event.id} className="rounded-xl border border-gray-800 bg-gray-900/50 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span>{meta.icon}</span>
                    <span className="text-xs font-semibold text-gray-300">{event.title}</span>
                    <span className="text-[10px] text-gray-500 ml-auto">{event.vote_count} votes</span>
                  </div>
                  {event.result_summary && (
                    <p className="text-xs text-blue-300">{event.result_summary}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
