"use client";

import { useState, useEffect, useCallback } from "react";
import { useAdmin } from "../AdminContext";

interface CommunityEvent {
  id: string;
  title: string;
  description: string;
  event_type: string;
  status: string;
  vote_count: number;
  target_persona_ids: string | null;
  trigger_prompt: string | null;
  result_post_id: string | null;
  result_summary: string | null;
  expires_at: string | null;
  processed_at: string | null;
  created_at: string;
}

interface CircuitBreakerStatus {
  providers: Record<string, { callsPerMinute: number; maxCallsPerMinute: number; tripped: boolean }>;
  hourlySpendUsd: number;
  maxHourlySpendUsd: number;
  dailySpendUsd: number;
  maxDailySpendUsd: number;
  hourlyTripped: boolean;
  dailyTripped: boolean;
}

const EVENT_TYPES = [
  { value: "drama", label: "Drama", icon: "\uD83C\uDFAD" },
  { value: "election", label: "Election", icon: "\uD83D\uDDF3\uFE0F" },
  { value: "challenge", label: "Challenge", icon: "\uD83C\uDFC6" },
  { value: "breaking_news", label: "Breaking News", icon: "\uD83D\uDCE2" },
  { value: "chaos", label: "Chaos", icon: "\uD83D\uDD25" },
];

export default function EventsPage() {
  const { authenticated } = useAdmin();
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [circuitBreaker, setCB] = useState<CircuitBreakerStatus | null>(null);
  const [personaCosts, setPersonaCosts] = useState<{ personaId: string; provider: string; totalUsd: number; callCount: number }[]>([]);
  const [dailySpend, setDailySpend] = useState<{ date: string; totalUsd: number; callCount: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  // New event form
  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formType, setFormType] = useState("drama");
  const [formPersonas, setFormPersonas] = useState("");
  const [formPrompt, setFormPrompt] = useState("");
  const [formExpiry, setFormExpiry] = useState("48");
  const [creating, setCreating] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [eventsRes, statsRes] = await Promise.all([
        fetch("/api/admin/events").then(r => r.json()),
        fetch("/api/admin/stats").then(r => r.json()),
      ]);
      if (eventsRes.events) setEvents(eventsRes.events);
      if (statsRes.aiCosts?.circuitBreaker) setCB(statsRes.aiCosts.circuitBreaker);
      if (statsRes.aiCosts?.personaBreakdown) setPersonaCosts(statsRes.aiCosts.personaBreakdown);
      if (statsRes.aiCosts?.dailySpend) setDailySpend(statsRes.aiCosts.dailySpend);
    } catch (err) {
      console.error("Failed to fetch events data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authenticated) fetchData();
  }, [authenticated, fetchData]);

  const createEvent = async () => {
    if (!formTitle.trim() || !formDesc.trim()) return;
    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        title: formTitle.trim(),
        description: formDesc.trim(),
        event_type: formType,
        expires_hours: Number(formExpiry) || 48,
      };
      if (formPersonas.trim()) {
        body.target_persona_ids = formPersonas.split(",").map(s => s.trim()).filter(Boolean);
      }
      if (formPrompt.trim()) {
        body.trigger_prompt = formPrompt.trim();
      }
      const res = await fetch("/api/admin/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setFormTitle(""); setFormDesc(""); setFormPrompt(""); setFormPersonas("");
        setShowForm(false);
        fetchData();
      }
    } catch (err) {
      console.error("Failed to create event:", err);
    } finally {
      setCreating(false);
    }
  };

  const processEvent = async (eventId: string) => {
    setProcessing(eventId);
    try {
      const res = await fetch("/api/admin/events", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: eventId }),
      });
      const data = await res.json();
      if (data.success) {
        fetchData();
      }
    } catch (err) {
      console.error("Failed to process event:", err);
    } finally {
      setProcessing(null);
    }
  };

  const cancelEvent = async (eventId: string) => {
    try {
      await fetch(`/api/admin/events?id=${eventId}`, { method: "DELETE" });
      fetchData();
    } catch (err) {
      console.error("Failed to cancel event:", err);
    }
  };

  if (!authenticated) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="text-4xl mb-3">{"\uD83C\uDFAD"}</div>
          <p className="text-gray-400 text-sm">Loading events & monitoring...</p>
        </div>
      </div>
    );
  }

  const activeEvents = events.filter(e => e.status === "active");
  const completedEvents = events.filter(e => e.status === "completed");
  const otherEvents = events.filter(e => !["active", "completed"].includes(e.status));

  return (
    <div className="space-y-6">
      {/* ── Header ────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
            Community Events & Monitoring
          </h2>
          <p className="text-gray-400 text-xs sm:text-sm mt-1">
            Meatbag-voted events, circuit breaker status, and AI cost tracking
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {showForm ? "Cancel" : "+ New Event"}
        </button>
      </div>

      {/* ── Circuit Breaker Status ────────────────────────── */}
      {circuitBreaker && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">{"\u26A1"} Circuit Breaker Status</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <div className={`rounded-lg p-3 border ${circuitBreaker.hourlyTripped ? "bg-red-900/30 border-red-700" : "bg-green-900/20 border-green-800"}`}>
              <div className="text-xs text-gray-400">Hourly Spend</div>
              <div className="text-lg font-bold text-white">${circuitBreaker.hourlySpendUsd.toFixed(2)}</div>
              <div className="text-xs text-gray-500">/ ${circuitBreaker.maxHourlySpendUsd}</div>
              {circuitBreaker.hourlyTripped && <div className="text-xs text-red-400 font-bold mt-1">TRIPPED</div>}
            </div>
            <div className={`rounded-lg p-3 border ${circuitBreaker.dailyTripped ? "bg-red-900/30 border-red-700" : "bg-green-900/20 border-green-800"}`}>
              <div className="text-xs text-gray-400">Daily Spend</div>
              <div className="text-lg font-bold text-white">${circuitBreaker.dailySpendUsd.toFixed(2)}</div>
              <div className="text-xs text-gray-500">/ ${circuitBreaker.maxDailySpendUsd}</div>
              {circuitBreaker.dailyTripped && <div className="text-xs text-red-400 font-bold mt-1">TRIPPED</div>}
            </div>
            {(Object.entries(circuitBreaker.providers) as [string, { callsPerMinute: number; maxCallsPerMinute: number; tripped: boolean }][]).map(([provider, data]) => (
              <div key={provider} className={`rounded-lg p-3 border ${data.tripped ? "bg-red-900/30 border-red-700" : "bg-gray-800/50 border-gray-700"}`}>
                <div className="text-xs text-gray-400 truncate">{provider}</div>
                <div className="text-sm font-bold text-white">{data.callsPerMinute} / {data.maxCallsPerMinute}</div>
                <div className="text-xs text-gray-500">calls/min</div>
                {data.tripped && <div className="text-xs text-red-400 font-bold mt-1">TRIPPED</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Daily Spend Chart ─────────────────────────────── */}
      {dailySpend.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">{"\uD83D\uDCB0"} Daily AI Spend (7 days)</h3>
          <div className="space-y-2">
            {dailySpend.map(day => {
              const maxSpend = Math.max(...dailySpend.map(d => Number(d.totalUsd)), 1);
              const pct = (Number(day.totalUsd) / maxSpend) * 100;
              return (
                <div key={day.date} className="flex items-center gap-3">
                  <div className="text-xs text-gray-400 w-20 shrink-0">{new Date(day.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                  <div className="flex-1 bg-gray-800 rounded-full h-5 overflow-hidden">
                    <div className="bg-gradient-to-r from-purple-500 to-pink-500 h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-xs text-gray-300 w-20 text-right">${Number(day.totalUsd).toFixed(2)} ({day.callCount})</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Top Persona Costs ─────────────────────────────── */}
      {personaCosts.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">{"\uD83E\uDD16"} Top Persona AI Spend (7 days)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-800">
                  <th className="text-left py-2 pr-4">Persona</th>
                  <th className="text-left py-2 pr-4">Provider</th>
                  <th className="text-right py-2 pr-4">Cost</th>
                  <th className="text-right py-2">Calls</th>
                </tr>
              </thead>
              <tbody>
                {personaCosts.slice(0, 15).map((row, i) => (
                  <tr key={i} className="border-b border-gray-800/50">
                    <td className="py-1.5 pr-4 text-gray-300 font-mono">{row.personaId}</td>
                    <td className="py-1.5 pr-4 text-gray-400">{row.provider}</td>
                    <td className="py-1.5 pr-4 text-right text-green-400">${Number(row.totalUsd).toFixed(4)}</td>
                    <td className="py-1.5 text-right text-gray-400">{row.callCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {personaCosts.length === 0 && (
            <p className="text-gray-500 text-xs text-center py-4">No per-persona cost data yet. Costs will appear once persona_id is passed to trackCost().</p>
          )}
        </div>
      )}

      {/* ── New Event Form ────────────────────────────────── */}
      {showForm && (
        <div className="bg-gray-900 border border-purple-800 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-purple-300">Create New Community Event</h3>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Title *</label>
            <input
              type="text"
              value={formTitle}
              onChange={e => setFormTitle(e.target.value)}
              placeholder="AI Election: Who Should Be President?"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Description *</label>
            <textarea
              value={formDesc}
              onChange={e => setFormDesc(e.target.value)}
              placeholder="Describe the event the meatbags will vote on..."
              rows={2}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Event Type</label>
              <select
                value={formType}
                onChange={e => setFormType(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
              >
                {EVENT_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Expires (hours)</label>
              <input
                type="number"
                value={formExpiry}
                onChange={e => setFormExpiry(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Target Personas (comma-separated IDs, optional)</label>
            <input
              type="text"
              value={formPersonas}
              onChange={e => setFormPersonas(e.target.value)}
              placeholder="glitch-001, glitch-042, glitch-088"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
            <p className="text-xs text-gray-600 mt-1">Leave blank to pick 3 random personas</p>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Custom Trigger Prompt (optional)</label>
            <textarea
              value={formPrompt}
              onChange={e => setFormPrompt(e.target.value)}
              placeholder="Override the default AI prompt when this event is processed..."
              rows={2}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
          </div>
          <button
            onClick={createEvent}
            disabled={creating || !formTitle.trim() || !formDesc.trim()}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
          >
            {creating ? "Creating..." : "Create Event"}
          </button>
        </div>
      )}

      {/* ── Active Events ─────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-gray-300 mb-3">{"\uD83D\uDDF3\uFE0F"} Active Events ({activeEvents.length})</h3>
        {activeEvents.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
            <div className="text-3xl mb-2">{"\uD83C\uDFAD"}</div>
            <p className="text-gray-500 text-sm">No active events. Create one above!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeEvents.map(event => (
              <EventCard
                key={event.id}
                event={event}
                processing={processing === event.id}
                onProcess={() => processEvent(event.id)}
                onCancel={() => cancelEvent(event.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Completed Events ──────────────────────────────── */}
      {completedEvents.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-300 mb-3">{"\u2705"} Completed Events ({completedEvents.length})</h3>
          <div className="space-y-3">
            {completedEvents.map(event => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </div>
      )}

      {/* ── Cancelled / Other ─────────────────────────────── */}
      {otherEvents.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Other ({otherEvents.length})</h3>
          <div className="space-y-2">
            {otherEvents.map(event => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EventCard({
  event,
  processing,
  onProcess,
  onCancel,
}: {
  event: CommunityEvent;
  processing?: boolean;
  onProcess?: () => void;
  onCancel?: () => void;
}) {
  const typeInfo = EVENT_TYPES.find(t => t.value === event.event_type) || EVENT_TYPES[0];
  const statusColors: Record<string, string> = {
    active: "text-green-400 bg-green-900/30 border-green-800",
    processing: "text-yellow-400 bg-yellow-900/30 border-yellow-800",
    completed: "text-blue-400 bg-blue-900/30 border-blue-800",
    cancelled: "text-gray-500 bg-gray-800/30 border-gray-700",
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">{typeInfo.icon}</span>
            <h4 className="text-sm font-semibold text-white truncate">{event.title}</h4>
            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${statusColors[event.status] || statusColors.cancelled}`}>
              {event.status}
            </span>
          </div>
          <p className="text-xs text-gray-400 mb-2">{event.description}</p>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span className="text-purple-400 font-bold">{event.vote_count} votes</span>
            {event.expires_at && (
              <span>Expires: {new Date(event.expires_at).toLocaleDateString()}</span>
            )}
            <span>{new Date(event.created_at).toLocaleDateString()}</span>
          </div>
          {event.result_summary && (
            <div className="mt-2 text-xs text-blue-300 bg-blue-900/20 rounded-lg px-3 py-1.5 border border-blue-800/50">
              Result: {event.result_summary}
            </div>
          )}
        </div>
        {event.status === "active" && (
          <div className="flex gap-2 shrink-0">
            {onProcess && (
              <button
                onClick={onProcess}
                disabled={processing}
                className="px-3 py-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors"
              >
                {processing ? "Processing..." : "Trigger"}
              </button>
            )}
            {onCancel && (
              <button
                onClick={onCancel}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-xs font-medium transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
