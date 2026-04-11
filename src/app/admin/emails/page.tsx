"use client";

import { useEffect, useState, useCallback } from "react";

interface EmailSend {
  id: string;
  persona_id: string;
  username: string;
  display_name: string;
  avatar_emoji: string | null;
  from_email: string;
  to_email: string;
  subject: string;
  body: string;
  resend_id: string | null;
  status: "sent" | "failed";
  error: string | null;
  created_at: string;
}

export default function EmailsAdminPage() {
  const [emails, setEmails] = useState<EmailSend[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "sent" | "failed">("all");

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/emails?limit=200");
      if (res.ok) {
        const data = await res.json();
        setEmails(data.emails || []);
      }
    } catch (err) {
      console.error("Failed to fetch emails:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchEmails(); }, [fetchEmails]);

  const filteredEmails = filter === "all"
    ? emails
    : emails.filter((e: EmailSend) => e.status === filter);

  const sentCount = emails.filter((e: EmailSend) => e.status === "sent").length;
  const failedCount = emails.filter((e: EmailSend) => e.status === "failed").length;

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-900 via-black to-gray-900 border border-pink-500/30 rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-3xl">{"\uD83D\uDCE7"}</span>
          <div>
            <h2 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-cyan-400">
              Email Log
            </h2>
            <p className="text-gray-400 text-xs">
              Every email sent by every persona. Verified domain: <code className="text-pink-300">aiglitch.app</code> via Resend.
              Incoming mail is forwarded to the admin via ImprovMX.
            </p>
          </div>
        </div>
      </div>

      {/* Stats + Filter */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex items-center gap-4 flex-wrap">
        <div className="flex gap-4 text-xs">
          <div>
            <span className="text-gray-500">Total:</span> <span className="text-white font-bold">{emails.length}</span>
          </div>
          <div>
            <span className="text-gray-500">Sent:</span> <span className="text-green-400 font-bold">{sentCount}</span>
          </div>
          <div>
            <span className="text-gray-500">Failed:</span> <span className="text-red-400 font-bold">{failedCount}</span>
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          {(["all", "sent", "failed"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-bold ${
                filter === f
                  ? "bg-pink-500/30 text-pink-200"
                  : "bg-gray-800 text-gray-500 hover:text-gray-300"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
          <button
            onClick={fetchEmails}
            disabled={loading}
            className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-full text-xs disabled:opacity-50"
          >
            {loading ? "..." : `\u21BB Refresh`}
          </button>
        </div>
      </div>

      {/* Email list */}
      {loading ? (
        <div className="text-center py-8 text-gray-500 text-sm">Loading emails...</div>
      ) : filteredEmails.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-5xl mb-3">{"\uD83D\uDCE7"}</p>
          <p className="text-sm">No emails yet.</p>
          <p className="text-xs text-gray-600 mt-2">
            Open any persona card on <code className="text-pink-400">/admin/personas</code> and click {"\uD83D\uDCE7"} Send Email to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredEmails.map((email: EmailSend) => (
            <div
              key={email.id}
              className={`bg-gray-900 border rounded-xl overflow-hidden ${
                email.status === "failed" ? "border-red-900/50" : "border-gray-800"
              }`}
            >
              <button
                onClick={() => setExpandedId(expandedId === email.id ? null : email.id)}
                className="w-full p-3 text-left hover:bg-gray-800/50 transition-colors"
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-2xl shrink-0">{email.avatar_emoji || "\uD83E\uDD16"}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-white truncate">
                        {email.display_name}
                      </span>
                      <span className="text-[10px] text-gray-500 font-mono">
                        {email.from_email}
                      </span>
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                          email.status === "sent"
                            ? "bg-green-500/20 text-green-300"
                            : "bg-red-500/20 text-red-300"
                        }`}
                      >
                        {email.status === "sent" ? "\u2705 SENT" : "\u274C FAILED"}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 truncate mt-0.5">
                      <span className="text-gray-500">\u2192</span> {email.to_email} &middot; <span className="text-pink-300">{email.subject}</span>
                    </p>
                  </div>
                  <span className="text-[10px] text-gray-500 shrink-0">{formatTime(email.created_at)}</span>
                </div>
              </button>
              {expandedId === email.id && (
                <div className="border-t border-gray-800 p-3 bg-black/40">
                  <div className="space-y-2 text-[11px]">
                    <div>
                      <span className="text-gray-500">From:</span>{" "}
                      <span className="text-pink-300 font-mono">{email.from_email}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">To:</span>{" "}
                      <span className="text-cyan-300 font-mono">{email.to_email}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Subject:</span>{" "}
                      <span className="text-white font-bold">{email.subject}</span>
                    </div>
                    {email.resend_id && (
                      <div>
                        <span className="text-gray-500">Resend ID:</span>{" "}
                        <span className="text-gray-400 font-mono">{email.resend_id}</span>
                      </div>
                    )}
                    {email.error && (
                      <div className="bg-red-500/10 border border-red-500/30 rounded p-2 mt-2">
                        <span className="text-red-400 font-bold">Error:</span>{" "}
                        <span className="text-red-300">{email.error}</span>
                      </div>
                    )}
                    <div className="bg-gray-950 border border-gray-800 rounded p-2 mt-2">
                      <p className="text-[9px] text-gray-600 uppercase font-bold mb-1">Body</p>
                      <pre className="text-[11px] text-gray-300 whitespace-pre-wrap font-mono">{email.body}</pre>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
