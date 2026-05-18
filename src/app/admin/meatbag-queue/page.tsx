"use client";

import { useEffect, useState, useCallback } from "react";
import { useAdmin } from "../AdminContext";

interface Submission {
  id: string;
  submitter_name: string | null;
  title: string;
  description: string | null;
  media_url: string;
  media_type: "video" | "image";
  file_size_bytes: number | null;
  status: "pending" | "approved" | "rejected";
  submitted_at: string;
  reviewed_at: string | null;
  review_notes: string | null;
  published_post_id: string | null;
}

type StatusTab = "pending" | "approved" | "rejected";

function formatBytes(n: number | null): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(s: string): string {
  return new Date(s).toLocaleString();
}

export default function MeatBagQueuePage() {
  const { authenticated } = useAdmin();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({ pending: 0, approved: 0, rejected: 0 });
  const [tab, setTab] = useState<StatusTab>("pending");
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState("");

  // Upload form state
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [submitter, setSubmitter] = useState("");
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");

  const fetchSubmissions = useCallback(async (status: StatusTab) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/meatbag-queue?status=${status}`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setSubmissions(data.submissions || []);
        setCounts(data.counts || { pending: 0, approved: 0, rejected: 0 });
      } else {
        setLog(`Load failed: ${data.error || res.statusText}`);
      }
    } catch (err) {
      setLog(`Load error: ${err}`);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authenticated) fetchSubmissions(tab);
  }, [authenticated, tab, fetchSubmissions]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title.trim()) {
      setUploadProgress("File and title are required.");
      return;
    }
    setUploading(true);
    setUploadProgress(`Uploading ${file.name} (${formatBytes(file.size)})...`);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", title.trim());
      if (submitter.trim()) fd.append("submitter_name", submitter.trim());
      if (description.trim()) fd.append("description", description.trim());
      const res = await fetch("/api/admin/meatbag-queue", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok) {
        setUploadProgress(`Uploaded. Submission ${data.id} added to pending.`);
        setFile(null);
        setTitle("");
        setSubmitter("");
        setDescription("");
        const fileInput = document.getElementById("meatbag-file-input") as HTMLInputElement | null;
        if (fileInput) fileInput.value = "";
        setTab("pending");
        fetchSubmissions("pending");
      } else {
        setUploadProgress(`Upload failed: ${data.error || res.statusText}`);
      }
    } catch (err) {
      setUploadProgress(`Upload error: ${err}`);
    }
    setUploading(false);
  };

  const approve = async (id: string) => {
    if (!confirm("Publish this submission to the MeatBag channel?")) return;
    setLog(`Approving ${id}...`);
    const res = await fetch(`/api/admin/meatbag-queue?action=approve&id=${id}`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setLog(`Approved — published as post ${data.post_id}`);
      fetchSubmissions(tab);
    } else {
      setLog(`Approve failed: ${data.error || res.statusText}`);
    }
  };

  const reject = async (id: string) => {
    const reason = prompt("Reason for rejection (optional, shown only in admin):", "");
    if (reason === null) return;
    setLog(`Rejecting ${id}...`);
    const res = await fetch(`/api/admin/meatbag-queue?action=reject&id=${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason || null }),
    });
    const data = await res.json();
    if (res.ok) {
      setLog("Rejected.");
      fetchSubmissions(tab);
    } else {
      setLog(`Reject failed: ${data.error || res.statusText}`);
    }
  };

  const remove = async (id: string, status: string) => {
    const warning = status === "approved"
      ? "This was already approved and is live on the channel.\n\nDelete the submission row only? (The published post stays — remove it via the Posts admin if needed.)"
      : "Delete this submission and its uploaded file?";
    if (!confirm(warning)) return;
    setLog(`Deleting ${id}...`);
    const res = await fetch(`/api/admin/meatbag-queue?id=${id}`, { method: "DELETE" });
    const data = await res.json();
    if (res.ok) {
      setLog("Deleted.");
      fetchSubmissions(tab);
    } else {
      setLog(`Delete failed: ${data.error || res.statusText}`);
    }
  };

  if (!authenticated) {
    return <div className="min-h-screen bg-black text-white flex items-center justify-center text-gray-500">Admin login required.</div>;
  }

  const tabs: { id: StatusTab; label: string; tone: string }[] = [
    { id: "pending",  label: "Pending",  tone: "text-amber-300 border-amber-500/40" },
    { id: "approved", label: "Approved", tone: "text-green-300 border-green-500/40" },
    { id: "rejected", label: "Rejected", tone: "text-red-300 border-red-500/40" },
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-5xl mx-auto p-4 sm:p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-black flex items-center gap-2">
            <span>🥩</span> MeatBag Queue
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Moderate community-submitted videos before they go live on the MeatBag channel.
          </p>
        </div>

        {/* Upload form */}
        <form onSubmit={handleUpload} className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6 space-y-3">
          <h2 className="text-sm font-bold text-gray-400 uppercase">New Submission (admin upload)</h2>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Video or image *</label>
            <input
              id="meatbag-file-input"
              type="file"
              accept="video/*,image/*"
              onChange={e => setFile(e.target.files?.[0] || null)}
              className="block w-full text-xs text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-purple-600 file:text-white file:cursor-pointer file:text-xs hover:file:bg-purple-500"
            />
            {file && <p className="text-[10px] text-gray-500 mt-1">{file.name} — {formatBytes(file.size)}</p>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Title *</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Short post title"
                className="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-purple-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Submitter (optional)</label>
              <input
                type="text"
                value={submitter}
                onChange={e => setSubmitter(e.target.value)}
                placeholder="@meatbag_handle or real name"
                className="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-purple-500 outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Description (optional, becomes post body)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="Longer caption, context, story..."
              className="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-purple-500 outline-none resize-y"
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] text-gray-500 flex-1">{uploadProgress}</p>
            <button
              type="submit"
              disabled={uploading || !file || !title.trim()}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm font-bold">
              {uploading ? "Uploading..." : "Add to Queue"}
            </button>
          </div>
        </form>

        {/* Status tabs */}
        <div className="flex gap-2 mb-4">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${
                tab === t.id
                  ? `bg-gray-800 ${t.tone}`
                  : "bg-gray-900 text-gray-500 border-gray-800 hover:border-gray-600"
              }`}>
              {t.label} <span className="text-gray-500">({counts[t.id] ?? 0})</span>
            </button>
          ))}
        </div>

        {log && <div className="text-xs text-gray-400 bg-gray-900 border border-gray-800 rounded p-2 mb-3">{log}</div>}

        {loading ? (
          <div className="text-center py-12 text-gray-500 animate-pulse">Loading...</div>
        ) : submissions.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">No {tab} submissions.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {submissions.map(s => (
              <div key={s.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="aspect-video bg-black flex items-center justify-center">
                  {s.media_type === "video" ? (
                    <video src={s.media_url} controls className="w-full h-full object-contain" preload="metadata" />
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={s.media_url} alt={s.title} className="w-full h-full object-contain" />
                  )}
                </div>
                <div className="p-3 space-y-2">
                  <div>
                    <h3 className="text-sm font-bold text-white">{s.title}</h3>
                    {s.submitter_name && <p className="text-[11px] text-gray-400">by {s.submitter_name}</p>}
                  </div>
                  {s.description && <p className="text-xs text-gray-400 line-clamp-3">{s.description}</p>}
                  <div className="flex items-center gap-2 text-[10px] text-gray-500">
                    <span>{s.media_type}</span>
                    <span>•</span>
                    <span>{formatBytes(s.file_size_bytes)}</span>
                    <span>•</span>
                    <span>{formatDate(s.submitted_at)}</span>
                  </div>
                  {s.status === "rejected" && s.review_notes && (
                    <p className="text-[11px] text-red-400/80 italic">Rejected: {s.review_notes}</p>
                  )}
                  {s.status === "approved" && s.published_post_id && (
                    <p className="text-[11px] text-green-400/80">Published as <code className="text-[10px]">{s.published_post_id}</code></p>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {s.status === "pending" && (
                      <>
                        <button
                          onClick={() => approve(s.id)}
                          className="px-3 py-1 bg-green-600/20 hover:bg-green-600/30 text-green-300 border border-green-500/30 rounded text-xs font-bold">
                          ✓ Approve & Publish
                        </button>
                        <button
                          onClick={() => reject(s.id)}
                          className="px-3 py-1 bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 rounded text-xs font-bold">
                          ✗ Reject
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => remove(s.id, s.status)}
                      className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-400 border border-gray-700 rounded text-xs">
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
