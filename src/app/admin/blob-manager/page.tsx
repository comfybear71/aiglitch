"use client";

import { useEffect, useState } from "react";
import { useAdmin } from "../AdminContext";

interface BlobFile {
  url: string;
  pathname: string;
  size: number;
  uploadedAt: string;
}

interface FolderStats {
  prefix: string;
  count: number;
  totalSize: number;
}

// Traffic-light tag layer for blob folders.
// Edit this map whenever a folder changes status — single source of truth.
//   active   = AIG!itch code actively reads/writes here. Don't touch.
//   legacy   = old folder, may still hold useful files but no new code targets it. Candidate for archive/delete.
//   personal = manually uploaded by the boss for personal use. App never writes here.
//   anything not listed renders as "untagged" (grey) — review before deleting.
type FolderTag = "active" | "legacy" | "personal";

const FOLDER_TAGS: Record<string, { tag: FolderTag; note?: string }> = {
  // — Active —
  "avatars/":           { tag: "active", note: "persona avatars" },
  "posts/":             { tag: "active", note: "post media" },
  "channels/":          { tag: "active", note: "channel video output (subfolders inherit this tag)" },
  "studios/":           { tag: "active", note: "Studios genre subfolders" },
  "sponsors/":          { tag: "active", note: "sponsor logos + grokified" },
  "sponsors_spec/":     { tag: "active", note: "spec ad clips" },
  "marketplace/":       { tag: "active", note: "grokified NFT images" },
  "og/":                { tag: "active", note: "OG/social images" },
  "voice/":             { tag: "active", note: "voice transcription audio" },
  "bestie-media/":      { tag: "active", note: "bestie chat media" },
  "meatlab/":           { tag: "active", note: "MeatLab community submissions (publishes to ch-meatbag)" },
  "feed-chaos/":        { tag: "active", note: "chaos drop feed videos (cron every 2h)" },
  "chibi/":             { tag: "active", note: "chibi avatar generator output" },
  "ads/":               { tag: "active", note: "ad campaign videos (generate-ads cron)" },
  "elon-campaign/":     { tag: "active", note: "Elon Button daily campaign videos" },
  "feed/":              { tag: "active", note: "persona feed video posts" },

  // — Legacy —
  "premiere/":          { tag: "legacy", note: "old director-premiere output; deletable after Studios migration finishes" },
  "campaigns/":         { tag: "legacy", note: "pre-sponsor-system ad campaign assets" },
  "sponsors_images/":   { tag: "legacy", note: "superseded by sponsors/{slug}/" },
  "instagram/":         { tag: "legacy", note: "pre-image-proxy era" },
  "media-library/":     { tag: "legacy", note: "old admin media library" },
  "videos/":            { tag: "legacy", note: "ungrouped legacy video dump" },
  "logo/":              { tag: "legacy", note: "old logo uploads" },
  "extensions/":        { tag: "legacy", note: "orphan — safe to delete" },
  "generated/":         { tag: "legacy", note: "orphan — safe to delete" },
  "chat-images/":       { tag: "legacy", note: "orphan — safe to delete" },
  "multi-clip/":        { tag: "legacy", note: "intermediate scene clips; safe to delete (no active stitching depends on it)" },
  "channels/clips/":    { tag: "legacy", note: "old clips dir, superseded by channels/{slug}/; safe to delete" },
  "news/":              { tag: "legacy", note: "pending migration to channels/gnn/" },

  // — Personal —
  "demo/":              { tag: "personal" },
  "facebook/":          { tag: "personal" },
  "hatchery/":          { tag: "personal" },
  "pdf/":               { tag: "personal" },
  "merch/":             { tag: "personal" },
};

const TAG_META: Record<FolderTag, { dot: string; label: string; chipClass: string }> = {
  active:   { dot: "🟢", label: "Active",   chipClass: "bg-green-500/15 text-green-300 border-green-500/30" },
  legacy:   { dot: "🟡", label: "Legacy",   chipClass: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30" },
  personal: { dot: "🔴", label: "Personal", chipClass: "bg-red-500/15 text-red-300 border-red-500/30" },
};

const UNTAGGED_META = { dot: "⚪", label: "Untagged", chipClass: "bg-gray-500/15 text-gray-400 border-gray-500/30" };

/**
 * Resolve a folder's tag using longest-matching-prefix.
 *
 * Direct hits win: `channels/clips/` is matched as legacy even though
 * the parent `channels/` is active.
 *
 * Otherwise the longest registered prefix that the folder starts with
 * provides the tag, so `channels/aitunes/`, `channels/gnn/`, etc.
 * all inherit the active tag from `channels/` without each one needing
 * its own entry.
 */
function getFolderTag(prefix: string): { tag: FolderTag | null; note?: string } {
  if (FOLDER_TAGS[prefix]) {
    return { tag: FOLDER_TAGS[prefix].tag, note: FOLDER_TAGS[prefix].note };
  }
  let best: { tag: FolderTag; note?: string; length: number } | null = null;
  for (const [registered, meta] of Object.entries(FOLDER_TAGS)) {
    if (prefix.startsWith(registered) && (!best || registered.length > best.length)) {
      best = { tag: meta.tag, note: meta.note, length: registered.length };
    }
  }
  return best ? { tag: best.tag, note: best.note } : { tag: null };
}

type TagFilter = "all" | FolderTag | "untagged";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function isVideo(pathname: string): boolean {
  return /\.(mp4|webm|mov)$/i.test(pathname);
}

function isImage(pathname: string): boolean {
  return /\.(png|jpg|jpeg|webp|gif|svg)$/i.test(pathname);
}

export default function BlobManagerPage() {
  const { authenticated } = useAdmin();
  const [folders, setFolders] = useState<FolderStats[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(true);
  const [selectedPrefix, setSelectedPrefix] = useState("");
  const [files, setFiles] = useState<BlobFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [actionLog, setActionLog] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<"video" | "image" | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [tagFilter, setTagFilter] = useState<TagFilter>("all");
  const [sortBy, setSortBy] = useState<"name" | "size-asc" | "size-desc">("name");

  const sortedFiles = [...files].sort((a, b) => {
    if (sortBy === "size-asc") return a.size - b.size;
    if (sortBy === "size-desc") return b.size - a.size;
    return a.pathname.localeCompare(b.pathname);
  });

  const selectUnderSize = (maxBytes: number) => {
    const urls = files.filter(f => f.size < maxBytes).map(f => f.url);
    setSelected(new Set(urls));
  };
  const [deletingFolder, setDeletingFolder] = useState<string | null>(null);

  // Studios genre reorganisation
  const [studiosVideos, setStudiosVideos] = useState<{ post_id: string; old_url: string; new_path: string; genre: string; title: string }[]>([]);
  const [studiosByGenre, setStudiosByGenre] = useState<Record<string, number>>({});
  const [studiosReorg, setStudiosReorg] = useState(false);
  const [studiosLog, setStudiosLog] = useState<string[]>([]);
  const [studiosProgress, setStudiosProgress] = useState({ done: 0, total: 0 });

  // Migration state
  const [channelSummary, setChannelSummary] = useState<{ channel_id: string; video_count: number; needs_moving: number }[]>([]);
  const [migrateChannel, setMigrateChannel] = useState<string | null>(null);
  const [migrateVideos, setMigrateVideos] = useState<{ post_id: string; old_url: string; new_path: string; title: string; date: string }[]>([]);
  const [migrateSlug, setMigrateSlug] = useState("");
  const [migrating, setMigrating] = useState(false);
  const [migrateLog, setMigrateLog] = useState<string[]>([]);
  const [migrateProgress, setMigrateProgress] = useState({ done: 0, total: 0 });

  // News → channels/gnn/ migration state
  const [newsSummary, setNewsSummary] = useState<{ total: number; needs_moving: number } | null>(null);
  const [newsVideos, setNewsVideos] = useState<{ post_id: string; old_url: string; new_path: string; title: string; date: string }[]>([]);
  const [newsMigrating, setNewsMigrating] = useState(false);
  const [newsLog, setNewsLog] = useState<string[]>([]);
  const [newsProgress, setNewsProgress] = useState({ done: 0, total: 0 });

  // images/ audit state (Phase 4 — read-only classifier)
  type ImagesAudit = {
    scanned: number;
    postsPointingAtImages: number;
    referenced: { count: number; size: number };
    placement: { count: number; size: number };
    orphan: { count: number; size: number; sample: { pathname: string; size: number; url: string }[] };
  };
  const [imagesAudit, setImagesAudit] = useState<ImagesAudit | null>(null);
  const [imagesAuditing, setImagesAuditing] = useState(false);
  const [imagesAuditError, setImagesAuditError] = useState<string | null>(null);

  // Sponsor credit backfill
  type CreditFix = { post_id: string; created_at: string; old_line: string; new_line: string; mode: "product_names" | "dedupe_only" | "skip" };
  const [creditScan, setCreditScan] = useState<{ scanned: number; broken: number; all: CreditFix[] } | null>(null);
  const [creditFixing, setCreditFixing] = useState(false);
  const [creditLog, setCreditLog] = useState<string[]>([]);
  const [creditProgress, setCreditProgress] = useState({ done: 0, total: 0 });

  const deleteFolderContents = async (prefix: string, fileCount: number, totalSize: number) => {
    if (!confirm(`DELETE ALL ${fileCount.toLocaleString()} files in "${prefix.replace(/\/$/, "")}"?\n\n${formatBytes(totalSize)} will be freed.\n\nThis CANNOT be undone.`)) return;
    if (!confirm(`Are you SURE? This deletes everything in ${prefix}`)) return;
    setDeletingFolder(prefix);
    setActionLog(`Deleting all files in ${prefix}...`);
    let totalDeleted = 0;
    let nextCursor: string | undefined;
    let hasMore = true;
    while (hasMore) {
      try {
        const c = nextCursor ? `&cursor=${encodeURIComponent(nextCursor)}` : "";
        const res = await fetch(`/api/admin/blob-manager?prefix=${encodeURIComponent(prefix)}${c}`);
        const data = await res.json();
        const urls = (data.files || []).map((f: BlobFile) => f.url);
        if (urls.length === 0) break;
        const delRes = await fetch("/api/admin/blob-manager", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ urls }),
        });
        const delData = await delRes.json();
        totalDeleted += delData.deleted || 0;
        setActionLog(`Deleted ${totalDeleted} files from ${prefix}...`);
        hasMore = data.hasMore;
        nextCursor = data.cursor;
      } catch (err) {
        setActionLog(`Error: ${err}`);
        break;
      }
    }
    setActionLog(`Deleted ${totalDeleted} files from ${prefix} (${formatBytes(totalSize)} freed)`);
    setDeletingFolder(null);
    fetchFolders();
    if (selectedPrefix === prefix) { setFiles([]); setSelected(new Set()); }
  };

  const fetchFolders = async () => {
    setFoldersLoading(true);
    try {
      const res = await fetch("/api/admin/blob-manager?action=folders");
      const data = await res.json();
      if (data.folders) {
        setFolders(data.folders.sort((a: FolderStats, b: FolderStats) => b.totalSize - a.totalSize));
      }
    } catch (err) {
      setActionLog(`Failed to load folders: ${err}`);
    }
    setFoldersLoading(false);
  };

  const fetchFiles = async (prefix: string, append = false) => {
    setFilesLoading(true);
    try {
      const c = append && cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
      const res = await fetch(`/api/admin/blob-manager?prefix=${encodeURIComponent(prefix)}${c}`);
      const data = await res.json();
      if (data.files) {
        setFiles(prev => append ? [...prev, ...data.files] : data.files);
        setHasMore(data.hasMore);
        setCursor(data.cursor);
      }
    } catch (err) {
      setActionLog(`Failed to load files: ${err}`);
    }
    setFilesLoading(false);
  };

  useEffect(() => {
    if (authenticated) fetchFolders();
  }, [authenticated]);

  const browseFolder = (prefix: string) => {
    setSelectedPrefix(prefix);
    setSelected(new Set());
    setCursor(undefined);
    setFiles([]);
    fetchFiles(prefix);
  };

  const toggleSelect = (url: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url); else next.add(url);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === files.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(files.map(f => f.url)));
    }
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    const urls = Array.from(selected);
    const totalSize = files.filter(f => selected.has(f.url)).reduce((sum, f) => sum + f.size, 0);
    if (!confirm(`Delete ${urls.length} files? ${formatBytes(totalSize)} will be freed.\n\nThis cannot be undone.`)) return;

    setDeleting(true);
    setActionLog(`Deleting ${urls.length} files...`);

    let totalDeleted = 0;
    const batchSize = 100;
    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      try {
        const res = await fetch("/api/admin/blob-manager", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ urls: batch }),
        });
        const data = await res.json();
        if (data.success) {
          totalDeleted += data.deleted;
          setActionLog(`Deleted ${totalDeleted}/${urls.length} files...`);
        } else {
          setActionLog(`Batch error: ${data.error}`);
        }
      } catch (err) {
        setActionLog(`Delete failed: ${err}`);
      }
    }

    setActionLog(`Deleted ${totalDeleted} files (${formatBytes(totalSize)} freed)`);
    setSelected(new Set());
    setDeleting(false);
    fetchFiles(selectedPrefix);
    fetchFolders();
  };

  const openPreview = (file: BlobFile) => {
    if (isVideo(file.pathname)) {
      setPreviewUrl(file.url);
      setPreviewType("video");
    } else if (isImage(file.pathname)) {
      setPreviewUrl(file.url);
      setPreviewType("image");
    }
  };

  if (!authenticated) {
    return <div className="min-h-screen bg-black flex items-center justify-center text-gray-500">Authenticating...</div>;
  }

  const totalBlobSize = folders.reduce((sum, f) => sum + f.totalSize, 0);
  const totalBlobCount = folders.reduce((sum, f) => sum + f.count, 0);
  const selectedSize = files.filter(f => selected.has(f.url)).reduce((sum, f) => sum + f.size, 0);

  return (
    <div className="min-h-screen bg-black text-white pb-20">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black">Blob Manager</h1>
            <p className="text-gray-500 text-sm">Browse, preview, and clean up Vercel Blob storage</p>
          </div>
          <a href="/admin" className="px-3 py-1.5 bg-gray-800 text-gray-400 rounded-lg text-xs hover:bg-gray-700">Back to Admin</a>
        </div>

        {/* Total stats */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-white">{totalBlobCount.toLocaleString()}</div>
            <div className="text-gray-500 text-xs">Total Files</div>
          </div>
          <div className="bg-gray-900 border border-purple-500/30 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-purple-400">{formatBytes(totalBlobSize)}</div>
            <div className="text-gray-500 text-xs">Total Storage</div>
          </div>
        </div>

        {actionLog && (
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 text-sm text-gray-300 mb-4">
            {actionLog}
          </div>
        )}

        {/* Folder list */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-400 uppercase">Folders</h2>
            <button onClick={fetchFolders} disabled={foldersLoading}
              className="px-3 py-1 bg-gray-800 text-gray-400 rounded text-xs hover:bg-gray-700 disabled:opacity-50">
              {foldersLoading ? "Scanning..." : "Refresh"}
            </button>
          </div>

          {/* Legend — what the dots mean */}
          <div className="flex flex-wrap items-center gap-3 mb-3 px-3 py-2 bg-gray-900/50 border border-gray-800 rounded-lg text-[11px] text-gray-400">
            <span className="font-bold text-gray-500 uppercase tracking-wide">Legend:</span>
            <span>🟢 <span className="text-green-300">Active</span> — code reads/writes here</span>
            <span>🟡 <span className="text-yellow-300">Legacy</span> — old, candidate for cleanup</span>
            <span>🔴 <span className="text-red-300">Personal</span> — your manual uploads</span>
            <span>⚪ <span className="text-gray-400">Untagged</span> — review before deleting</span>
          </div>

          {/* Filter pills */}
          {(() => {
            const counts = folders.reduce(
              (acc, f) => {
                const t = getFolderTag(f.prefix).tag;
                if (t) acc[t] = (acc[t] ?? 0) + 1;
                else acc.untagged = (acc.untagged ?? 0) + 1;
                acc.all = (acc.all ?? 0) + 1;
                return acc;
              },
              { all: 0, active: 0, legacy: 0, personal: 0, untagged: 0 } as Record<TagFilter, number>
            );
            const pills: { key: TagFilter; label: string }[] = [
              { key: "all",      label: "All" },
              { key: "active",   label: "🟢 Active" },
              { key: "legacy",   label: "🟡 Legacy" },
              { key: "personal", label: "🔴 Personal" },
              { key: "untagged", label: "⚪ Untagged" },
            ];
            return (
              <div className="flex flex-wrap gap-2 mb-3">
                {pills.map(p => (
                  <button
                    key={p.key}
                    onClick={() => setTagFilter(p.key)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
                      tagFilter === p.key
                        ? "bg-purple-500/30 text-white border-purple-400"
                        : "bg-gray-900 text-gray-400 border-gray-700 hover:border-gray-500"
                    }`}>
                    {p.label} <span className="text-gray-500">({counts[p.key]})</span>
                  </button>
                ))}
              </div>
            );
          })()}

          {foldersLoading ? (
            <div className="text-center py-8 text-gray-500 animate-pulse">Scanning blob storage...</div>
          ) : (() => {
            const visibleFolders = folders.filter(f => {
              if (tagFilter === "all") return true;
              const t = getFolderTag(f.prefix).tag;
              if (tagFilter === "untagged") return t === null;
              return t === tagFilter;
            });
            if (visibleFolders.length === 0) {
              return <div className="text-center py-8 text-gray-500 text-sm">No folders match this filter.</div>;
            }
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {visibleFolders.map(f => {
                  const { tag, note } = getFolderTag(f.prefix);
                  const meta = tag ? TAG_META[tag] : UNTAGGED_META;
                  return (
                    <div key={f.prefix} className={`rounded-lg border text-left transition ${
                      selectedPrefix === f.prefix
                        ? "bg-purple-500/20 border-purple-500/50"
                        : "bg-gray-900 border-gray-700 hover:border-gray-600"
                    }`}>
                      <button onClick={() => browseFolder(f.prefix)} className="w-full flex items-center justify-between p-3 gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-xs leading-none" title={meta.label}>{meta.dot}</span>
                            <p className="text-sm font-bold text-white truncate">{f.prefix.replace(/\/$/, "")}</p>
                          </div>
                          <p className="text-[10px] text-gray-500">{f.count.toLocaleString()} files</p>
                          {note && <p className="text-[10px] text-gray-400/70 italic mt-0.5 truncate" title={note}>{note}</p>}
                        </div>
                        <div className={`text-sm font-bold ${f.totalSize > 10 * 1024 * 1024 * 1024 ? "text-red-400" : f.totalSize > 1024 * 1024 * 1024 ? "text-yellow-400" : "text-green-400"}`}>
                          {formatBytes(f.totalSize)}
                        </div>
                      </button>
                      <div className="px-3 pb-2 flex items-center justify-between gap-2">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded border ${meta.chipClass}`}>{meta.label}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteFolderContents(f.prefix, f.count, f.totalSize); }}
                          disabled={deletingFolder === f.prefix}
                          className="text-[9px] text-red-400/60 hover:text-red-400 transition-colors disabled:opacity-50">
                          {deletingFolder === f.prefix ? "Deleting..." : `Delete all ${f.count} files`}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* Channel Video Migration */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-green-400 uppercase">Channel Video Migration</h2>
            <button
              onClick={async () => {
                const res = await fetch("/api/admin/blob-manager?action=channel-summary");
                const data = await res.json();
                if (data.channels) setChannelSummary(data.channels);
              }}
              className="px-3 py-1 bg-green-600/20 text-green-400 rounded text-xs hover:bg-green-600/30 border border-green-500/30">
              Scan Channels
            </button>
          </div>

          {channelSummary.length > 0 && (
            <div className="space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {channelSummary.filter(c => c.needs_moving > 0).map(ch => (
                  <button key={ch.channel_id}
                    onClick={async () => {
                      setMigrateChannel(ch.channel_id);
                      setMigrateVideos([]);
                      setMigrateLog([]);
                      setMigrateProgress({ done: 0, total: 0 });
                      const res = await fetch(`/api/admin/blob-manager?action=channel-videos&channel_id=${encodeURIComponent(ch.channel_id)}`);
                      const data = await res.json();
                      if (data.videos) { setMigrateVideos(data.videos); setMigrateSlug(data.slug); }
                    }}
                    className={`p-3 rounded-lg border text-left transition ${
                      migrateChannel === ch.channel_id ? "bg-green-500/20 border-green-500/50" : "bg-gray-900 border-gray-700 hover:border-gray-600"
                    }`}>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-bold text-white">{ch.channel_id.replace("ch-", "")}</span>
                      <span className="text-xs text-yellow-400 font-bold">{ch.needs_moving} to move</span>
                    </div>
                    <p className="text-[10px] text-gray-500">{ch.video_count} total videos</p>
                  </button>
                ))}
              </div>

              {channelSummary.filter(c => c.needs_moving === 0).length > 0 && (
                <p className="text-[10px] text-gray-600">
                  {channelSummary.filter(c => c.needs_moving === 0).length} channels already migrated
                </p>
              )}
            </div>
          )}

          {/* Preview + Migrate */}
          {migrateVideos.length > 0 && migrateChannel && (
            <div className="mt-4 bg-gray-900 border border-green-500/30 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">
                  {migrateChannel.replace("ch-", "")} — {migrateVideos.length} videos to migrate
                </h3>
                <button
                  onClick={async () => {
                    if (!confirm(`Migrate ${migrateVideos.length} videos to channels/${migrateSlug}/?\n\nThis copies each video to the new location and updates the database. Old files are NOT deleted.`)) return;
                    setMigrating(true);
                    setMigrateProgress({ done: 0, total: migrateVideos.length });
                    const logs: string[] = [];
                    let done = 0;
                    for (const v of migrateVideos) {
                      try {
                        const res = await fetch("/api/admin/blob-manager", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "migrate-video", post_id: v.post_id, old_url: v.old_url, new_path: v.new_path }),
                        });
                        const data = await res.json();
                        done++;
                        if (data.success) {
                          logs.push(`✅ ${v.title.slice(0, 50)} → ${v.new_path}`);
                        } else {
                          logs.push(`❌ ${v.title.slice(0, 50)}: ${data.error}`);
                        }
                      } catch (err) {
                        done++;
                        logs.push(`❌ ${v.title.slice(0, 50)}: ${err}`);
                      }
                      setMigrateLog([...logs]);
                      setMigrateProgress({ done, total: migrateVideos.length });
                    }
                    setMigrating(false);
                  }}
                  disabled={migrating}
                  className="px-4 py-2 bg-green-600 text-white font-bold rounded-lg text-xs hover:bg-green-500 disabled:opacity-50">
                  {migrating ? `Migrating ${migrateProgress.done}/${migrateProgress.total}...` : `Migrate All ${migrateVideos.length} Videos`}
                </button>
              </div>

              {/* Progress bar */}
              {migrating && (
                <div className="w-full bg-gray-800 rounded-full h-2">
                  <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${(migrateProgress.done / migrateProgress.total) * 100}%` }} />
                </div>
              )}

              {/* Preview list */}
              <div className="max-h-[40vh] overflow-y-auto space-y-1">
                {migrateVideos.map(v => (
                  <div key={v.post_id} className="flex items-center gap-2 text-[10px] p-1.5 bg-gray-800 rounded">
                    <span className="text-gray-500 flex-shrink-0">{v.date}</span>
                    <span className="text-white truncate flex-1">{v.title}</span>
                    <span className="text-green-400 flex-shrink-0">→ channels/{migrateSlug}/</span>
                  </div>
                ))}
              </div>

              {/* Migration log */}
              {migrateLog.length > 0 && (
                <div className="max-h-[30vh] overflow-y-auto bg-black rounded-lg p-3 space-y-0.5">
                  {migrateLog.map((log, i) => (
                    <p key={i} className={`text-[10px] ${log.startsWith("✅") ? "text-green-400" : "text-red-400"}`}>{log}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* News → channels/gnn/ Migration */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-yellow-400 uppercase">News → channels/gnn/ Migration</h2>
            <button
              onClick={async () => {
                const res = await fetch("/api/admin/blob-manager?action=news-summary");
                const data = await res.json();
                if (typeof data.needs_moving === "number") setNewsSummary({ total: data.total, needs_moving: data.needs_moving });
                if (data.needs_moving > 0) {
                  const vRes = await fetch("/api/admin/blob-manager?action=news-videos");
                  const vData = await vRes.json();
                  if (vData.videos) setNewsVideos(vData.videos);
                }
              }}
              className="px-3 py-1 bg-yellow-600/20 text-yellow-400 rounded text-xs hover:bg-yellow-600/30 border border-yellow-500/30">
              Scan News
            </button>
          </div>

          {newsSummary && (
            <div className="bg-gray-900 border border-yellow-500/20 rounded-lg p-3 mb-3 text-xs text-gray-300">
              {newsSummary.needs_moving === 0 ? (
                <p className="text-green-400">✅ No news/ files to migrate — folder is safe to delete via the folders list above.</p>
              ) : (
                <p>
                  <span className="text-yellow-400 font-bold">{newsSummary.needs_moving}</span> posts still point at <code className="text-yellow-300">news/</code> · {newsSummary.total} total GNN videos in DB
                </p>
              )}
            </div>
          )}

          {newsVideos.length > 0 && (
            <div className="bg-gray-900 border border-yellow-500/30 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">
                  {newsVideos.length} videos to migrate
                </h3>
                <button
                  onClick={async () => {
                    if (!confirm(`Migrate ${newsVideos.length} news videos to channels/gnn/?\n\nThis copies each video to the new location and updates the database. Old files in news/ are NOT deleted — you can delete them after via the folders list once this completes.`)) return;
                    setNewsMigrating(true);
                    setNewsProgress({ done: 0, total: newsVideos.length });
                    const logs: string[] = [];
                    let done = 0;
                    for (const v of newsVideos) {
                      try {
                        const res = await fetch("/api/admin/blob-manager", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "migrate-video", post_id: v.post_id, old_url: v.old_url, new_path: v.new_path }),
                        });
                        const data = await res.json();
                        done++;
                        if (data.success) {
                          logs.push(`✅ ${v.title.slice(0, 50)} → ${v.new_path}`);
                        } else {
                          logs.push(`❌ ${v.title.slice(0, 50)}: ${data.error}`);
                        }
                      } catch (err) {
                        done++;
                        logs.push(`❌ ${v.title.slice(0, 50)}: ${err}`);
                      }
                      setNewsLog([...logs]);
                      setNewsProgress({ done, total: newsVideos.length });
                    }
                    setNewsMigrating(false);
                    // Re-scan so the summary updates
                    const res = await fetch("/api/admin/blob-manager?action=news-summary");
                    const data = await res.json();
                    if (typeof data.needs_moving === "number") setNewsSummary({ total: data.total, needs_moving: data.needs_moving });
                  }}
                  disabled={newsMigrating}
                  className="px-4 py-2 bg-yellow-600 text-white font-bold rounded-lg text-xs hover:bg-yellow-500 disabled:opacity-50">
                  {newsMigrating ? `Migrating ${newsProgress.done}/${newsProgress.total}...` : `Migrate All ${newsVideos.length} Videos`}
                </button>
              </div>

              {newsMigrating && (
                <div className="w-full bg-gray-800 rounded-full h-2">
                  <div className="bg-yellow-500 h-2 rounded-full transition-all" style={{ width: `${(newsProgress.done / newsProgress.total) * 100}%` }} />
                </div>
              )}

              <div className="max-h-[40vh] overflow-y-auto space-y-1">
                {newsVideos.map(v => (
                  <div key={v.post_id} className="flex items-center gap-2 text-[10px] p-1.5 bg-gray-800 rounded">
                    <span className="text-gray-500 flex-shrink-0">{v.date}</span>
                    <span className="text-white truncate flex-1">{v.title}</span>
                    <span className="text-yellow-400 flex-shrink-0">→ channels/gnn/</span>
                  </div>
                ))}
              </div>

              {newsLog.length > 0 && (
                <div className="max-h-[30vh] overflow-y-auto bg-black rounded-lg p-3 space-y-0.5">
                  {newsLog.map((log, i) => (
                    <p key={i} className={`text-[10px] ${log.startsWith("✅") ? "text-green-400" : "text-red-400"}`}>{log}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* images/ Audit — Phase 4 (read-only classifier) */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-fuchsia-400 uppercase">images/ Audit (read-only)</h2>
            <button
              onClick={async () => {
                setImagesAuditing(true);
                setImagesAuditError(null);
                setImagesAudit(null);
                try {
                  const res = await fetch("/api/admin/blob-manager?action=images-audit");
                  const data = await res.json();
                  if (data.error) {
                    setImagesAuditError(data.error);
                  } else {
                    setImagesAudit(data as ImagesAudit);
                  }
                } catch (err) {
                  setImagesAuditError(err instanceof Error ? err.message : String(err));
                }
                setImagesAuditing(false);
              }}
              disabled={imagesAuditing}
              className="px-3 py-1 bg-fuchsia-600/20 text-fuchsia-400 rounded text-xs hover:bg-fuchsia-600/30 border border-fuchsia-500/30 disabled:opacity-50">
              {imagesAuditing ? "Scanning…" : "Scan images/"}
            </button>
          </div>

          <p className="text-[10px] text-gray-500 mb-3">
            Cross-references every file under <code className="text-fuchsia-300">images/</code> against <code className="text-fuchsia-300">posts.media_url</code> to classify each blob. No files are read, moved, or deleted — this just counts. Takes 30-60s for 10K+ files.
          </p>

          {imagesAuditError && (
            <div className="bg-red-900/30 border border-red-500/30 rounded-lg p-3 text-xs text-red-400">
              ❌ {imagesAuditError}
            </div>
          )}

          {imagesAudit && (
            <div className="space-y-3">
              {/* Summary headline */}
              <div className="bg-gray-900 border border-fuchsia-500/20 rounded-lg p-3 text-xs text-gray-300">
                Scanned <span className="text-fuchsia-400 font-bold">{imagesAudit.scanned.toLocaleString()}</span> files
                · {imagesAudit.postsPointingAtImages.toLocaleString()} posts point at the folder
              </div>

              {/* Three bucket cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-gray-900 border border-green-500/30 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-base">🟢</span>
                    <span className="text-xs font-bold text-green-400 uppercase">Referenced</span>
                  </div>
                  <p className="text-2xl font-black text-white">{imagesAudit.referenced.count.toLocaleString()}</p>
                  <p className="text-xs text-gray-400">{formatBytes(imagesAudit.referenced.size)}</p>
                  <p className="text-[10px] text-gray-500 mt-2">A post still points at these — must migrate before delete.</p>
                </div>

                <div className="bg-gray-900 border border-yellow-500/30 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-base">🟡</span>
                    <span className="text-xs font-bold text-yellow-400 uppercase">Placement Intermediates</span>
                  </div>
                  <p className="text-2xl font-black text-white">{imagesAudit.placement.count.toLocaleString()}</p>
                  <p className="text-xs text-gray-400">{formatBytes(imagesAudit.placement.size)}</p>
                  <p className="text-[10px] text-gray-500 mt-2">
                    <code>placement-*</code>, <code>ref-*</code>, <code>ref-fallback-*</code>. Transient — woven into a video then forgotten. Safe to delete.
                  </p>
                </div>

                <div className="bg-gray-900 border border-red-500/30 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-base">🔴</span>
                    <span className="text-xs font-bold text-red-400 uppercase">Orphans</span>
                  </div>
                  <p className="text-2xl font-black text-white">{imagesAudit.orphan.count.toLocaleString()}</p>
                  <p className="text-xs text-gray-400">{formatBytes(imagesAudit.orphan.size)}</p>
                  <p className="text-[10px] text-gray-500 mt-2">Nothing references them — old feed images from deleted posts. Safe to delete.</p>
                </div>
              </div>

              {/* Headline recommendation */}
              <div className="bg-black/40 border border-fuchsia-500/30 rounded-lg p-3 text-xs">
                <p className="text-fuchsia-400 font-bold mb-1">Recommended next move:</p>
                <ol className="list-decimal list-inside space-y-0.5 text-gray-300">
                  <li>Delete the {imagesAudit.placement.count.toLocaleString()} placement intermediates ({formatBytes(imagesAudit.placement.size)}) — transient by design.</li>
                  <li>Delete the {imagesAudit.orphan.count.toLocaleString()} orphans ({formatBytes(imagesAudit.orphan.size)}) — no references in DB.</li>
                  <li>Then migrate the {imagesAudit.referenced.count.toLocaleString()} referenced files ({formatBytes(imagesAudit.referenced.size)}) to <code className="text-fuchsia-300">posts/&#123;YYYY-MM&#125;/</code> in a follow-up phase.</li>
                </ol>
              </div>

              {/* Orphan sample */}
              {imagesAudit.orphan.sample.length > 0 && (
                <details className="bg-gray-900 border border-red-500/20 rounded-lg p-3">
                  <summary className="text-xs font-bold text-red-400 cursor-pointer hover:text-red-300">
                    Sample orphans ({imagesAudit.orphan.sample.length} of {imagesAudit.orphan.count.toLocaleString()})
                  </summary>
                  <div className="mt-2 max-h-[40vh] overflow-y-auto space-y-1">
                    {imagesAudit.orphan.sample.map(s => (
                      <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 text-[10px] p-1.5 bg-gray-800 rounded hover:bg-gray-700">
                        <span className="text-gray-500 flex-shrink-0">{formatBytes(s.size)}</span>
                        <span className="text-white truncate flex-1">{s.pathname}</span>
                        <span className="text-red-400 flex-shrink-0">↗</span>
                      </a>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>

        {/* Studios Genre Reorganisation */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-amber-400 uppercase">Studios Genre Reorganisation</h2>
            <button
              onClick={async () => {
                const res = await fetch("/api/admin/blob-manager?action=studios-genres");
                const data = await res.json();
                if (data.videos) { setStudiosVideos(data.videos); setStudiosByGenre(data.byGenre || {}); }
                else if (data.error) setActionLog(`Error: ${data.error}`);
              }}
              className="px-3 py-1 bg-amber-600/20 text-amber-400 rounded text-xs hover:bg-amber-600/30 border border-amber-500/30">
              Scan Studios Videos
            </button>
          </div>

          {Object.keys(studiosByGenre).length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {Object.entries(studiosByGenre).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([genre, count]) => (
                  <span key={genre} className="px-2 py-1 bg-gray-800 border border-amber-500/30 rounded text-xs text-amber-300">
                    {genre}: {count}
                  </span>
                ))}
              </div>
              <p className="text-[10px] text-gray-500">{studiosVideos.length} videos to reorganise into genre subfolders</p>

              <button
                onClick={async () => {
                  if (!confirm(`Reorganise ${studiosVideos.length} videos into genre subfolders?\n\nThis moves files within channels/aiglitch-studios/ into genre subfolders and updates the DB.`)) return;
                  setStudiosReorg(true);
                  setStudiosProgress({ done: 0, total: studiosVideos.length });
                  const logs: string[] = [];
                  let done = 0;
                  for (const v of studiosVideos) {
                    try {
                      const res = await fetch("/api/admin/blob-manager", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "migrate-video", post_id: v.post_id, old_url: v.old_url, new_path: v.new_path }),
                      });
                      const data = await res.json();
                      done++;
                      if (data.success) {
                        logs.push(`✅ [${v.genre}] ${v.title.slice(0, 50)}`);
                      } else {
                        logs.push(`❌ [${v.genre}] ${v.title.slice(0, 50)}: ${data.error}`);
                      }
                    } catch (err) {
                      done++;
                      logs.push(`❌ ${v.title.slice(0, 50)}: ${err}`);
                    }
                    setStudiosLog([...logs]);
                    setStudiosProgress({ done, total: studiosVideos.length });
                  }
                  setStudiosReorg(false);
                }}
                disabled={studiosReorg}
                className="px-4 py-2 bg-amber-600 text-white font-bold rounded-lg text-xs hover:bg-amber-500 disabled:opacity-50">
                {studiosReorg ? `Reorganising ${studiosProgress.done}/${studiosProgress.total}...` : `Reorganise All ${studiosVideos.length} Videos`}
              </button>

              {studiosReorg && (
                <div className="w-full bg-gray-800 rounded-full h-2">
                  <div className="bg-amber-500 h-2 rounded-full transition-all" style={{ width: `${(studiosProgress.done / studiosProgress.total) * 100}%` }} />
                </div>
              )}

              {studiosLog.length > 0 && (
                <div className="max-h-[30vh] overflow-y-auto bg-black rounded-lg p-3 space-y-0.5">
                  {studiosLog.map((log, i) => (
                    <p key={i} className={`text-[10px] ${log.startsWith("✅") ? "text-green-400" : "text-red-400"}`}>{log}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sponsor Credit Backfill */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-pink-400 uppercase">Sponsor Credit Backfill</h2>
            <button
              onClick={async () => {
                setCreditScan(null);
                setCreditLog([]);
                const res = await fetch("/api/admin/blob-manager?action=scan-broken-credits");
                const data = await res.json();
                if (data.error) { setCreditLog([`❌ ${data.error}`]); return; }
                setCreditScan({ scanned: data.scanned, broken: data.broken, all: data.all || [] });
              }}
              className="px-3 py-1 bg-pink-600/20 text-pink-400 rounded text-xs hover:bg-pink-600/30 border border-pink-500/30">
              Scan Broken Credits
            </button>
          </div>

          <p className="text-[10px] text-gray-500 mb-3">
            Finds past posts whose &ldquo;Thanks to our sponsors&rdquo; line has duplicate brand names
            (e.g. &ldquo;AIG!itch Marketplace&rdquo; ×5). Rewrites captions using <code className="text-pink-400">product_name</code> from
            <code className="text-pink-400"> ad_impressions</code> where available, or just dedupes the duplicates if no impression record exists.
          </p>

          {creditScan && (
            <div className="bg-gray-900 border border-pink-500/30 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-xs text-white">
                  Scanned <span className="font-bold text-pink-400">{creditScan.scanned}</span> recent posts,
                  found <span className="font-bold text-yellow-400">{creditScan.broken}</span> with broken credits
                </div>
                {creditScan.broken > 0 && (
                  <button
                    disabled={creditFixing}
                    onClick={async () => {
                      if (!confirm(`Fix ${creditScan.broken} broken sponsor credit lines?\n\nUpdates posts.content for each — old captions cannot be recovered.`)) return;
                      setCreditFixing(true);
                      setCreditProgress({ done: 0, total: creditScan.all.length });
                      const logs: string[] = [];
                      let done = 0;
                      for (const item of creditScan.all) {
                        try {
                          const res = await fetch("/api/admin/blob-manager", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ action: "fix-credit", post_id: item.post_id }),
                          });
                          const data = await res.json();
                          done++;
                          if (data.success) {
                            logs.push(`✅ [${data.mode}] ${item.post_id.slice(0, 8)} ${item.new_line.slice(0, 80)}`);
                          } else {
                            logs.push(`⏭️ ${item.post_id.slice(0, 8)}: ${data.reason || data.error || "skipped"}`);
                          }
                        } catch (err) {
                          done++;
                          logs.push(`❌ ${item.post_id.slice(0, 8)}: ${err instanceof Error ? err.message : String(err)}`);
                        }
                        setCreditLog([...logs]);
                        setCreditProgress({ done, total: creditScan.all.length });
                      }
                      setCreditFixing(false);
                    }}
                    className="px-4 py-2 bg-pink-600 text-white font-bold rounded-lg text-xs hover:bg-pink-500 disabled:opacity-50">
                    {creditFixing ? `Fixing ${creditProgress.done}/${creditProgress.total}...` : `Fix All ${creditScan.broken}`}
                  </button>
                )}
              </div>

              {creditFixing && (
                <div className="w-full bg-gray-800 rounded-full h-2">
                  <div className="bg-pink-500 h-2 rounded-full transition-all" style={{ width: `${(creditProgress.done / Math.max(1, creditProgress.total)) * 100}%` }} />
                </div>
              )}

              {creditScan.all.length > 0 && !creditFixing && (
                <div className="max-h-[40vh] overflow-y-auto bg-black rounded-lg p-3 space-y-2">
                  <p className="text-[10px] text-gray-500 mb-2">Preview (first {Math.min(20, creditScan.all.length)} of {creditScan.all.length}):</p>
                  {creditScan.all.slice(0, 20).map((item) => (
                    <div key={item.post_id} className="border-l-2 border-pink-500/40 pl-2 text-[10px]">
                      <p className="text-gray-500">{item.post_id.slice(0, 8)} · {new Date(item.created_at).toLocaleDateString()} · <span className="text-pink-400">{item.mode}</span></p>
                      <p className="text-red-400 line-through truncate">{item.old_line}</p>
                      <p className="text-green-400 truncate">{item.new_line}</p>
                    </div>
                  ))}
                </div>
              )}

              {creditLog.length > 0 && (
                <div className="max-h-[30vh] overflow-y-auto bg-black rounded-lg p-3 space-y-0.5">
                  {creditLog.map((log, i) => (
                    <p key={i} className={`text-[10px] ${log.startsWith("✅") ? "text-green-400" : log.startsWith("⏭️") ? "text-gray-500" : "text-red-400"}`}>{log}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* File browser */}
        {selectedPrefix && (
          <div>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="text-sm font-bold text-white">
                {selectedPrefix.replace(/\/$/, "")} <span className="text-gray-500 font-normal">({files.length} loaded{hasMore ? ", more available" : ""})</span>
              </h2>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => setSortBy(s => s === "size-asc" ? "size-desc" : s === "size-desc" ? "name" : "size-asc")}
                  className="px-3 py-1 bg-gray-800 text-gray-400 rounded text-xs hover:bg-gray-700">
                  Sort: {sortBy === "size-asc" ? "Smallest ↑" : sortBy === "size-desc" ? "Largest ↓" : "Name"}
                </button>
                <button onClick={() => selectUnderSize(15 * 1024 * 1024)}
                  className="px-3 py-1 bg-yellow-600/20 text-yellow-400 rounded text-xs hover:bg-yellow-600/30 border border-yellow-500/30">
                  Select &lt;15MB
                </button>
                <button onClick={() => selectUnderSize(20 * 1024 * 1024)}
                  className="px-3 py-1 bg-yellow-600/20 text-yellow-400 rounded text-xs hover:bg-yellow-600/30 border border-yellow-500/30">
                  Select &lt;20MB
                </button>
                <button onClick={() => setViewMode(v => v === "list" ? "grid" : "list")}
                  className="px-3 py-1 bg-gray-800 text-gray-400 rounded text-xs hover:bg-gray-700">
                  {viewMode === "list" ? "Grid View" : "List View"}
                </button>
                <button onClick={selectAll}
                  className="px-3 py-1 bg-gray-800 text-gray-400 rounded text-xs hover:bg-gray-700">
                  {selected.size === files.length && files.length > 0 ? "Deselect All" : "Select All"}
                </button>
                {selected.size > 0 && (
                  <button onClick={deleteSelected} disabled={deleting}
                    className="px-3 py-1 bg-red-600 text-white rounded text-xs font-bold hover:bg-red-500 disabled:opacity-50">
                    {deleting ? "Deleting..." : `Delete ${selected.size} (${formatBytes(selectedSize)})`}
                  </button>
                )}
              </div>
            </div>

            {filesLoading && files.length === 0 ? (
              <div className="text-center py-8 text-gray-500 animate-pulse">Loading files...</div>
            ) : files.length === 0 ? (
              <div className="text-center py-8 text-gray-500">No files in this folder.</div>
            ) : (
              <>
                {viewMode === "grid" ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                    {sortedFiles.map(file => {
                      const isVid = isVideo(file.pathname);
                      const isImg = isImage(file.pathname);
                      const isSelected = selected.has(file.url);
                      return (
                        <div key={file.url} className={`relative aspect-square bg-gray-900 rounded-lg overflow-hidden border transition cursor-pointer ${
                          isSelected ? "border-red-500 ring-2 ring-red-500/50" : "border-gray-800 hover:border-gray-600"
                        }`}>
                          <button onClick={() => openPreview(file)} className="w-full h-full">
                            {isImg ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={file.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                            ) : isVid ? (
                              <video
                                src={`${file.url}#t=0.5`}
                                className="w-full h-full object-cover"
                                preload="metadata"
                                muted
                                playsInline
                                onMouseEnter={e => (e.target as HTMLVideoElement).play().catch(() => {})}
                                onMouseLeave={e => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0.5; }}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-2xl">📄</div>
                            )}
                          </button>
                          <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(file.url)}
                            className="absolute top-1.5 left-1.5 w-4 h-4 rounded accent-red-500 z-10" />
                          {isVid && <span className="absolute top-1.5 right-1.5 text-[8px] bg-black/70 text-white px-1 rounded">▶</span>}
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1.5">
                            <p className={`text-[9px] font-bold ${file.size > 50 * 1024 * 1024 ? "text-red-400" : file.size > 5 * 1024 * 1024 ? "text-yellow-400" : "text-gray-300"}`}>
                              {formatBytes(file.size)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                <div className="space-y-1">
                  {sortedFiles.map(file => {
                    const isVid = isVideo(file.pathname);
                    const isImg = isImage(file.pathname);
                    const isSelected = selected.has(file.url);
                    const filename = file.pathname.split("/").pop() || file.pathname;
                    return (
                      <div key={file.url}
                        className={`flex items-center gap-3 p-2 rounded-lg border transition ${
                          isSelected ? "bg-red-500/10 border-red-500/30" : "bg-gray-900 border-gray-800 hover:border-gray-700"
                        }`}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(file.url)}
                          className="w-4 h-4 rounded accent-red-500 flex-shrink-0" />
                        <button onClick={() => openPreview(file)} className="flex-shrink-0 w-16 h-16 bg-gray-800 rounded overflow-hidden flex items-center justify-center relative group"
                          title="Tap to preview">
                          {isImg ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={file.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                          ) : isVid ? (
                            <>
                              <video
                                src={`${file.url}#t=0.5`}
                                className="w-full h-full object-cover"
                                preload="metadata"
                                muted
                                playsInline
                                onMouseEnter={e => (e.target as HTMLVideoElement).play().catch(() => {})}
                                onMouseLeave={e => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0.5; }}
                              />
                              <span className="absolute bottom-0.5 right-0.5 text-[8px] bg-black/70 text-white px-1 rounded">▶</span>
                            </>
                          ) : (
                            <span className="text-lg">📄</span>
                          )}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-white truncate" title={file.pathname}>{filename}</p>
                          <p className="text-[10px] text-gray-500">{file.pathname}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className={`text-xs font-bold ${file.size > 50 * 1024 * 1024 ? "text-red-400" : file.size > 5 * 1024 * 1024 ? "text-yellow-400" : "text-gray-400"}`}>
                            {formatBytes(file.size)}
                          </p>
                          <p className="text-[9px] text-gray-600">{new Date(file.uploadedAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                )}

                {hasMore && (
                  <button onClick={() => fetchFiles(selectedPrefix, true)} disabled={filesLoading}
                    className="w-full mt-3 py-2 bg-gray-800 text-gray-400 rounded-lg text-sm hover:bg-gray-700 disabled:opacity-50">
                    {filesLoading ? "Loading..." : "Load More"}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Preview modal */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => { setPreviewUrl(null); setPreviewType(null); }}>
          <div className="max-w-4xl max-h-[90vh] w-full" onClick={e => e.stopPropagation()}>
            <button onClick={() => { setPreviewUrl(null); setPreviewType(null); }}
              className="absolute top-4 right-4 text-white text-2xl hover:text-gray-300 z-10">✕</button>
            {previewType === "video" ? (
              <video src={previewUrl} controls autoPlay className="w-full max-h-[85vh] rounded-xl" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="" className="w-full max-h-[85vh] object-contain rounded-xl" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
