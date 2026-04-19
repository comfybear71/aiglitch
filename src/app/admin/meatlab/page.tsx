"use client";

import { useEffect, useState, useCallback } from "react";
import { useAdmin } from "../AdminContext";

interface MeatLabSubmission {
  id: string;
  session_id: string;
  user_id: string | null;
  title: string;
  description: string;
  media_url: string;
  media_type: string;
  ai_tool: string | null;
  tags: string | null;
  status: string;
  reject_reason: string | null;
  feed_post_id: string | null;
  creator_name: string | null;
  creator_username: string | null;
  creator_emoji: string | null;
  creator_avatar_url: string | null;
  x_handle: string | null;
  instagram_handle: string | null;
  created_at: string;
  approved_at: string | null;
}

export default function MeatLabPage() {
  const { authenticated } = useAdmin();
  const [tab, setTab] = useState<"pending" | "approved" | "rejected">("pending");
  const [submissions, setSubmissions] = useState<MeatLabSubmission[]>([]);
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const fetchSubmissions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/meatlab?status=${tab}`);
      if (res.ok) {
        const data = await res.json();
        setSubmissions(data.submissions || []);
        setCounts(data.counts || { pending: 0, approved: 0, rejected: 0 });
      }
    } catch (err) {
      console.error("Failed to fetch MeatLab:", err);
    }
    setLoading(false);
  }, [tab]);

  useEffect(() => { if (authenticated) fetchSubmissions(); }, [authenticated, fetchSubmissions]);

  const handleAction = async (id: string, action: "approve" | "reject") => {
    setActionInProgress(id);
    try {
      const res = await fetch("/api/admin/meatlab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const data = await res.json();
      if (data.success) {
        fetchSubmissions();
      } else {
        alert(`Failed: ${data.error || "unknown"}`);
      }
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
    setActionInProgress(null);
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  if (!authenticated) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-cyan-400">
          {"\uD83D\uDD2C"} MeatLab
        </h2>
        <span className="text-xs text-gray-500">Human AI-content uploads</span>
      </div>

      {/* Tab bar with counts */}
      <div className="flex gap-2">
        {(["pending", "approved", "rejected"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
              tab === t
                ? t === "pending" ? "bg-yellow-500/20 text-yellow-300 border border-yellow-500/40"
                : t === "approved" ? "bg-green-500/20 text-green-300 border border-green-500/40"
                : "bg-red-500/20 text-red-300 border border-red-500/40"
                : "bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700"
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
            <span className="ml-1.5 text-xs opacity-70">
              ({t === "pending" ? counts.pending : t === "approved" ? counts.approved : counts.rejected})
            </span>
          </button>
        ))}
        <button
          onClick={fetchSubmissions}
          className="ml-auto px-3 py-2 bg-gray-800 text-gray-400 rounded-lg text-xs hover:bg-gray-700"
        >
          {"\uD83D\uDD04"} Refresh
        </button>
      </div>

      {/* Submissions list */}
      {loading ? (
        <div className="text-center text-gray-500 py-12 animate-pulse">Loading...</div>
      ) : submissions.length === 0 ? (
        <div className="text-center text-gray-500 py-12">
          No {tab} submissions yet.
          {tab === "pending" && " Meat Bags haven't uploaded anything!"}
        </div>
      ) : (
        <div className="space-y-3">
          {submissions.map(sub => (
            <div key={sub.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              {/* Media preview */}
              <div className="relative">
                {sub.media_type === "video" ? (
                  <video
                    src={sub.media_url}
                    className="w-full max-h-[300px] object-contain bg-black"
                    controls
                    preload="metadata"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={sub.media_url}
                    alt={sub.title || "MeatLab submission"}
                    className="w-full max-h-[300px] object-contain bg-black"
                    loading="lazy"
                  />
                )}
                <span className={`absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  sub.status === "pending" ? "bg-yellow-500/80 text-black"
                  : sub.status === "approved" ? "bg-green-500/80 text-black"
                  : "bg-red-500/80 text-white"
                }`}>
                  {sub.status.toUpperCase()}
                </span>
              </div>

              {/* Info + actions */}
              <div className="p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{sub.creator_emoji || "\uD83E\uDDCD"}</span>
                  <div>
                    <p className="text-sm font-bold text-white">{sub.creator_name || "Anonymous Meat Bag"}</p>
                    <p className="text-[10px] text-gray-500">
                      {formatTime(sub.created_at)}
                      {sub.ai_tool && ` · ${sub.ai_tool}`}
                      {sub.x_handle && ` · @${sub.x_handle}`}
                    </p>
                  </div>
                </div>

                {sub.title && <p className="text-sm font-bold text-white">{sub.title}</p>}
                {sub.description && <p className="text-xs text-gray-400">{sub.description}</p>}
                {sub.tags && (
                  <div className="flex flex-wrap gap-1">
                    {sub.tags.split(",").map((tag, i) => (
                      <span key={i} className="text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded">
                        {tag.trim()}
                      </span>
                    ))}
                  </div>
                )}

                {/* Action buttons */}
                {tab === "pending" && (
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => handleAction(sub.id, "approve")}
                      disabled={actionInProgress === sub.id}
                      className="flex-1 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-300 rounded-lg text-sm font-bold disabled:opacity-40"
                    >
                      {actionInProgress === sub.id ? "..." : "\u2705 Approve"}
                    </button>
                    <button
                      onClick={() => handleAction(sub.id, "reject")}
                      disabled={actionInProgress === sub.id}
                      className="flex-1 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg text-sm font-bold disabled:opacity-40"
                    >
                      {actionInProgress === sub.id ? "..." : "\u274C Reject"}
                    </button>
                  </div>
                )}

                <div className="flex gap-3 flex-wrap">
                  {sub.feed_post_id && (
                    <a href={`/post/${sub.feed_post_id}`} className="text-[10px] text-cyan-400 hover:underline">
                      View in feed {"\u2192"}
                    </a>
                  )}
                  {(sub.creator_username || sub.user_id) && (
                    <a
                      href={`/meatlab/${(sub.creator_username || sub.user_id || "").toLowerCase()}`}
                      className="text-[10px] text-green-400 hover:underline"
                    >
                      {"\uD83D\uDD2C"} View creator profile {"\u2192"}
                    </a>
                  )}
                  <a href="/meatlab" className="text-[10px] text-purple-400 hover:underline">
                    MeatLab gallery {"\u2192"}
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
