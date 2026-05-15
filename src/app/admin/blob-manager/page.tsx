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
  const [deletingFolder, setDeletingFolder] = useState<string | null>(null);

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

          {foldersLoading ? (
            <div className="text-center py-8 text-gray-500 animate-pulse">Scanning blob storage...</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {folders.map(f => (
                <div key={f.prefix} className={`rounded-lg border text-left transition ${
                  selectedPrefix === f.prefix
                    ? "bg-purple-500/20 border-purple-500/50"
                    : "bg-gray-900 border-gray-700 hover:border-gray-600"
                }`}>
                  <button onClick={() => browseFolder(f.prefix)} className="w-full flex items-center justify-between p-3">
                    <div>
                      <p className="text-sm font-bold text-white">{f.prefix.replace(/\/$/, "")}</p>
                      <p className="text-[10px] text-gray-500">{f.count.toLocaleString()} files</p>
                    </div>
                    <div className={`text-sm font-bold ${f.totalSize > 10 * 1024 * 1024 * 1024 ? "text-red-400" : f.totalSize > 1024 * 1024 * 1024 ? "text-yellow-400" : "text-green-400"}`}>
                      {formatBytes(f.totalSize)}
                    </div>
                  </button>
                  <div className="px-3 pb-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteFolderContents(f.prefix, f.count, f.totalSize); }}
                      disabled={deletingFolder === f.prefix}
                      className="text-[9px] text-red-400/60 hover:text-red-400 transition-colors disabled:opacity-50">
                      {deletingFolder === f.prefix ? "Deleting..." : `Delete all ${f.count} files`}
                    </button>
                  </div>
                </div>
              ))}
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
              <div className="flex gap-2">
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
                    {files.map(file => {
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
                  {files.map(file => {
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
