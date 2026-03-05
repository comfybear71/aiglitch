"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useAdmin } from "../AdminContext";
import { MediaItem, ARCHITECT_PERSONA_ID, safariSafeBlobUpload } from "../admin-types";

export default function MediaPage() {
  const { authenticated, personas, fetchPersonas, generationLog, setGenerationLog, fetchStats } = useAdmin();

  // Media state
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ total: number; done: number; current: string; results: { name: string; ok: boolean }[] }>({ total: 0, done: 0, current: "", results: [] });
  const [dragOver, setDragOver] = useState(false);
  const [urlImportText, setUrlImportText] = useState("");
  const [urlImporting, setUrlImporting] = useState(false);
  const [urlImportResult, setUrlImportResult] = useState<{ imported: number; failed: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bulkInputRef = useRef<HTMLInputElement>(null);

  // Media form
  const [mediaForm, setMediaForm] = useState({
    media_type: "meme" as "image" | "video" | "meme" | "logo",
    tags: "",
    description: "",
    persona_id: ARCHITECT_PERSONA_ID,
  });

  // Premiere folder uploader state
  const [blobFolder, setBlobFolder] = useState("premiere/action");
  const [blobUploading, setBlobUploading] = useState(false);
  const [blobFolderCounts, setBlobFolderCounts] = useState<Record<string, number>>({});
  const [blobPanelOpen, setBlobPanelOpen] = useState(false);
  const blobInputRef = useRef<HTMLInputElement>(null);
  const [blobUploadProgress, setBlobUploadProgress] = useState<{
    current: number; total: number; fileName: string; startTime: number;
  } | null>(null);

  // Fetch media
  const fetchMedia = useCallback(async () => {
    const res = await fetch("/api/admin/media");
    if (res.ok) {
      const data = await res.json();
      setMediaItems(data.media);
    }
    // Auto-spread any unsent Architect posts to social media silently
    fetch("/api/admin/media/spread", { method: "POST", body: "{}" }).catch(() => {});
  }, []);

  // Fetch blob folder video counts
  const fetchBlobFolders = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/blob-upload");
      if (res.ok) {
        const data = await res.json();
        const counts: Record<string, number> = {};
        for (const [folder, info] of Object.entries(data.folders as Record<string, { count: number }>)) {
          counts[folder] = info.count;
        }
        setBlobFolderCounts(counts);
      }
    } catch { /* ignore */ }
  }, []);

  // On mount
  useEffect(() => {
    if (authenticated && mediaItems.length === 0) {
      fetchMedia();
    }
    if (authenticated && personas.length === 0) {
      fetchPersonas();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated]);

  // Server-side upload helper — used for small files and as fallback for failed client uploads
  const serverUploadFile = async (file: File): Promise<boolean> => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("media_type", mediaForm.media_type);
      formData.append("tags", mediaForm.tags);
      formData.append("description", mediaForm.description);
      if (mediaForm.persona_id) formData.append("persona_id", mediaForm.persona_id);

      const res = await fetch("/api/admin/media", { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.results?.length > 0) {
          return !data.results[0].error;
        }
        return true;
      }
      const errText = await res.text().catch(() => `HTTP ${res.status}`);
      console.error(`Server upload failed for ${file.name}:`, errText);
      return false;
    } catch (err) {
      console.error(`Server upload error for ${file.name}:`, err);
      return false;
    }
  };

  // Upload files
  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    setUploadProgress({ total: files.length, done: 0, current: files[0].name, results: [] });

    const allResults: { name: string; ok: boolean }[] = [];
    const MAX_SERVER_SIZE = 4 * 1024 * 1024; // 4MB - Vercel serverless body limit

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadProgress({
        total: files.length,
        done: i,
        current: file.name,
        results: allResults,
      });

      try {
        // Try client upload first for large files, fall back to server upload
        const useClientUpload = file.size > MAX_SERVER_SIZE;

        if (useClientUpload) {
          // Large files: use Vercel Blob client upload
          let blobUrl: string | null = null;

          try {
            let blobPath = `media-library/${file.name}`;
            if (mediaForm.media_type === "logo") {
              const fileExt = file.name.split(".").pop()?.toLowerCase() || "";
              const isVid = ["mp4", "mov", "webm", "avi"].includes(fileExt);
              blobPath = `logo/${isVid ? "video" : "image"}/${file.name}`;
            }
            const blob = await safariSafeBlobUpload(blobPath, file, {
              access: "public",
              handleUploadUrl: "/api/admin/media/upload",
              multipart: true,
            });
            blobUrl = blob.url;
          } catch (uploadErr) {
            console.warn(`Blob client upload failed for ${file.name}:`, uploadErr);
            if (uploadErr && typeof uploadErr === "object" && "url" in uploadErr) {
              blobUrl = (uploadErr as { url: string }).url;
            }
          }

          if (blobUrl) {
            const saveForm = new FormData();
            saveForm.append("url", blobUrl);
            saveForm.append("media_type", mediaForm.media_type);
            saveForm.append("tags", mediaForm.tags);
            saveForm.append("description", mediaForm.description || file.name);
            if (mediaForm.persona_id) saveForm.append("persona_id", mediaForm.persona_id);

            const saveRes = await fetch("/api/admin/media/save", {
              method: "POST",
              body: saveForm,
            });

            if (saveRes.ok) {
              allResults.push({ name: file.name, ok: true });
            } else {
              console.error(`DB save failed for ${file.name}:`, await saveRes.text());
              allResults.push({ name: file.name, ok: false });
            }
          } else {
            // Client upload failed — try server upload as fallback (may work for files near the limit)
            console.warn(`Client upload failed for ${file.name}, trying server fallback...`);
            const fallbackOk = await serverUploadFile(file);
            allResults.push({ name: file.name, ok: fallbackOk });
          }
        } else {
          // Small files: use simple server upload
          const ok = await serverUploadFile(file);
          allResults.push({ name: file.name, ok });
        }
      } catch (err) {
        console.error(`Upload error for ${file.name}:`, err);
        allResults.push({ name: file.name, ok: false });
      }
    }

    setUploadProgress({
      total: files.length,
      done: files.length,
      current: "Done!",
      results: allResults,
    });

    fetchMedia();
    setUploading(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(
      f => f.type.startsWith("image/") || f.type.startsWith("video/")
    );
    if (files.length > 0) uploadFiles(files);
  };

  const importFromUrls = async () => {
    const urls = urlImportText.split("\n").map(u => u.trim()).filter(u => u && (u.startsWith("http://") || u.startsWith("https://")));
    if (urls.length === 0) return;
    setUrlImporting(true);
    setUrlImportResult(null);
    try {
      const res = await fetch("/api/admin/media/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urls,
          media_type: mediaForm.media_type,
          tags: mediaForm.tags,
          description: mediaForm.description,
          persona_id: mediaForm.persona_id || undefined,
        }),
      });
      const data = await res.json();
      setUrlImportResult({
        imported: data.imported || 0,
        failed: data.failed || 0,
        errors: (data.results || []).filter((r: { error?: string }) => r.error).map((r: { url: string; error?: string }) => `${r.url.slice(0, 50)}... — ${r.error}`),
      });
      if (data.imported > 0) {
        fetchMedia();
        setUrlImportText("");
      }
    } catch (err) {
      setUrlImportResult({ imported: 0, failed: urls.length, errors: [String(err)] });
    }
    setUrlImporting(false);
  };

  const deleteMedia = async (id: string) => {
    await fetch("/api/admin/media", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchMedia();
  };

  // Upload videos to a premiere/news blob folder and auto-create posts
  const uploadToBlobFolder = async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter(f => f.type.startsWith("video/") || f.name.match(/\.(mp4|mov|webm|avi)$/i));
    if (fileArray.length === 0) {
      setGenerationLog(prev => [...prev, "❌ No video files selected. Only .mp4/.mov/.webm accepted."]);
      return;
    }

    setBlobUploading(true);
    const uploadStart = Date.now();
    setBlobUploadProgress({ current: 0, total: fileArray.length, fileName: fileArray[0].name, startTime: uploadStart });
    setGenerationLog(prev => [...prev, `📁 Uploading ${fileArray.length} video(s) to ${blobFolder}/...`]);

    const MAX_DIRECT = 4 * 1024 * 1024; // 4MB
    let succeeded = 0;
    let failed = 0;
    let posted = 0;

    // Derive post type and genre from folder path
    const postType = blobFolder.startsWith("news") ? "news" : "premiere";
    const genre = blobFolder.split("/")[1] || "action";

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      setBlobUploadProgress({ current: i, total: fileArray.length, fileName: file.name, startTime: uploadStart });
      try {
        let blobUrl: string | null = null;

        if (file.size > MAX_DIRECT) {
          const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const result = await safariSafeBlobUpload(`${blobFolder}/${cleanName}`, file, {
            access: "public",
            handleUploadUrl: "/api/admin/blob-upload/upload",
            multipart: true,
          });
          blobUrl = result.url;
          succeeded++;
          setGenerationLog(prev => [...prev, `  ✅ ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB) → ${blobFolder}/`]);
        } else {
          const formData = new FormData();
          formData.append("files", file);
          formData.append("folder", blobFolder);
          const res = await fetch("/api/admin/blob-upload", { method: "POST", body: formData });
          const data = await res.json();
          if (data.success && data.results?.[0]?.url) {
            blobUrl = data.results[0].url;
            succeeded++;
            setGenerationLog(prev => [...prev, `  ✅ ${file.name} → ${blobFolder}/`]);
          } else {
            failed++;
            setGenerationLog(prev => [...prev, `  ❌ ${file.name}: ${data.results?.[0]?.error || "upload failed"}`]);
          }
        }

        // Create post immediately from the uploaded video URL
        if (blobUrl) {
          try {
            const postRes = await fetch("/api/test-premiere-post", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ videoUrl: blobUrl, type: postType, genre }),
            });
            const postData = await postRes.json();
            if (postData.success) {
              posted++;
              setGenerationLog(prev => [...prev, `  🎬 Post created → ${postType}/${genre}`]);
            }
          } catch {
            setGenerationLog(prev => [...prev, `  ⚠️ Uploaded but post creation failed for ${file.name}`]);
          }
        }
      } catch (err) {
        failed++;
        setGenerationLog(prev => [...prev, `  ❌ ${file.name}: ${err instanceof Error ? err.message : "unknown error"}`]);
      }
    }

    setBlobUploadProgress({ current: fileArray.length, total: fileArray.length, fileName: "Done!", startTime: uploadStart });
    setGenerationLog(prev => [...prev, `📁 Done: ${succeeded} uploaded, ${posted} posts created, ${failed} failed.`]);
    setBlobUploading(false);
    setTimeout(() => setBlobUploadProgress(null), 5000);
    fetchBlobFolders();
  };

  return (
    <>
      {/* Premiere Folder Uploader */}
      <div className="max-w-7xl mx-auto px-3 sm:px-4 pt-3">
        <button
          onClick={() => { setBlobPanelOpen(!blobPanelOpen); if (!blobPanelOpen) fetchBlobFolders(); }}
          className="w-full flex items-center justify-between px-4 py-2.5 bg-amber-950/30 border border-amber-800/40 rounded-xl text-sm font-bold text-amber-400 hover:bg-amber-950/50 transition-all"
        >
          <span>📁 Premiere &amp; News Video Folders</span>
          <span className="text-xs text-amber-500/60">{blobPanelOpen ? "▲ close" : "▼ upload videos to genre folders"}</span>
        </button>

        {blobPanelOpen && (
          <div className="mt-2 border border-amber-800/30 rounded-xl bg-gray-950 p-4 space-y-4">
            {/* Folder grid with counts */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { folder: "premiere/action", label: "💥 Action", color: "border-red-500/40 bg-red-500/10 text-red-300" },
                { folder: "premiere/scifi", label: "🚀 Sci-Fi", color: "border-blue-500/40 bg-blue-500/10 text-blue-300" },
                { folder: "premiere/romance", label: "💕 Romance", color: "border-pink-500/40 bg-pink-500/10 text-pink-300" },
                { folder: "premiere/family", label: "🏠 Family", color: "border-green-500/40 bg-green-500/10 text-green-300" },
                { folder: "premiere/horror", label: "👻 Horror", color: "border-purple-500/40 bg-purple-500/10 text-purple-300" },
                { folder: "premiere/comedy", label: "😂 Comedy", color: "border-yellow-500/40 bg-yellow-500/10 text-yellow-300" },
                { folder: "news", label: "📰 News", color: "border-orange-500/40 bg-orange-500/10 text-orange-300" },
              ].map(({ folder, label, color }) => (
                <button
                  key={folder}
                  onClick={() => setBlobFolder(folder)}
                  className={`px-3 py-2 rounded-lg border text-xs font-bold transition-all ${
                    blobFolder === folder
                      ? `${color} ring-2 ring-amber-400/50`
                      : "border-gray-700 bg-gray-900 text-gray-400 hover:bg-gray-800"
                  }`}
                >
                  <div>{label}</div>
                  <div className="text-[10px] mt-0.5 opacity-60">
                    {blobFolderCounts[folder] !== undefined ? `${blobFolderCounts[folder]} videos` : "..."}
                  </div>
                </button>
              ))}
            </div>

            {/* Upload area */}
            <div
              className="border-2 border-dashed border-amber-700/40 rounded-xl p-6 text-center cursor-pointer hover:border-amber-500/60 transition-all"
              onClick={() => blobInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.dataTransfer.files.length) uploadToBlobFolder(e.dataTransfer.files);
              }}
            >
              <input
                ref={blobInputRef}
                type="file"
                accept="video/*,.mp4,.mov,.webm"
                multiple
                className="hidden"
                onChange={(e) => { if (e.target.files?.length) uploadToBlobFolder(e.target.files); e.target.value = ""; }}
              />
              {blobUploading && blobUploadProgress ? (
                <div className="space-y-2 px-2">
                  <div className="text-sm text-amber-300 font-bold">
                    Uploading {blobUploadProgress.current + 1}/{blobUploadProgress.total}: {blobUploadProgress.fileName}
                  </div>
                  <div className="relative w-full h-4 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-500 rounded-full"
                      style={{ width: `${blobUploadProgress.total > 0 ? Math.max(((blobUploadProgress.current) / blobUploadProgress.total) * 100, 2) : 0}%` }}
                    />
                    <div
                      className="absolute inset-y-0 bg-amber-300/40 animate-pulse transition-all duration-500 rounded-full"
                      style={{
                        left: `${(blobUploadProgress.current / blobUploadProgress.total) * 100}%`,
                        width: `${(1 / blobUploadProgress.total) * 100}%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>{Math.round((blobUploadProgress.current / blobUploadProgress.total) * 100)}% complete</span>
                    <span className="font-mono tabular-nums">
                      {(() => {
                        const elapsed = (Date.now() - blobUploadProgress.startTime) / 1000;
                        if (blobUploadProgress.current === 0) return "Estimating...";
                        const perFile = elapsed / blobUploadProgress.current;
                        const remaining = perFile * (blobUploadProgress.total - blobUploadProgress.current);
                        const min = Math.floor(remaining / 60);
                        const sec = Math.round(remaining % 60);
                        return min > 0 ? `~${min}m ${sec}s left` : `~${sec}s left`;
                      })()}
                    </span>
                  </div>
                </div>
              ) : blobUploadProgress && blobUploadProgress.current === blobUploadProgress.total ? (
                <div className="text-green-400 font-bold">All {blobUploadProgress.total} videos uploaded!</div>
              ) : (
                <>
                  <div className="text-2xl mb-1">🎬</div>
                  <div className="text-sm text-amber-300 font-bold">
                    Drop videos here for <span className="text-amber-200">{blobFolder}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Or click to browse. Posts are created automatically after upload.
                  </div>
                </>
              )}
            </div>

            {/* Sync button for videos uploaded directly to blob storage */}
            <button
              onClick={async () => {
                setGenerationLog(prev => [...prev, "🔄 Scanning blob storage for unposted videos..."]);
                try {
                  const res = await fetch("/api/test-premiere-post", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({}),
                  });
                  const data = await res.json();
                  if (data.success) {
                    setGenerationLog(prev => [...prev, `🔄 ✅ Found ${data.created} unposted videos, re-tagged ${data.retagged}.`]);
                    fetchBlobFolders();
                  } else {
                    setGenerationLog(prev => [...prev, `🔄 ❌ ${data.error || "Sync failed"}`]);
                  }
                } catch {
                  setGenerationLog(prev => [...prev, "🔄 ❌ Sync failed"]);
                }
              }}
              className="w-full py-2 text-xs text-gray-500 hover:text-amber-400 transition-colors"
            >
              🔄 Sync unposted videos (uploaded outside admin)
            </button>
          </div>
        )}
      </div>

      {/* Media Library */}
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-6">
        <div className="space-y-6">
          {/* Drag & Drop Zone + Upload Form */}
          <div
            className={`bg-gray-900 border-2 border-dashed rounded-2xl p-3 sm:p-6 transition-all ${
              dragOver ? "border-cyan-400 bg-cyan-500/5" : "border-gray-700"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <h2 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400 mb-2">
              Bulk Upload Media for AI Bots
            </h2>
            <p className="text-sm text-gray-400 mb-4">
              Drag & drop files here, or use the buttons below. Upload dozens at once! Videos auto-detected from file extension. AI bots grab from this library first (free!).
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Default Media Type (videos auto-detected)</label>
                <select value={mediaForm.media_type}
                  onChange={(e) => setMediaForm({ ...mediaForm, media_type: e.target.value as "image" | "video" | "meme" | "logo" })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500">
                  <option value="meme">Meme</option>
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                  {mediaForm.persona_id === ARCHITECT_PERSONA_ID && (
                    <option value="logo">Logo (auto-sorts → logo/image or logo/video)</option>
                  )}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Assign to Persona (defaults to The Architect — your persona)</label>
                <select value={mediaForm.persona_id || ""}
                  onChange={(e) => {
                    const newPersona = e.target.value;
                    const updates: Partial<typeof mediaForm> = { persona_id: newPersona };
                    if (newPersona !== ARCHITECT_PERSONA_ID && mediaForm.media_type === "logo") {
                      updates.media_type = "meme";
                    }
                    setMediaForm({ ...mediaForm, ...updates });
                  }}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500">
                  <option value={ARCHITECT_PERSONA_ID}>🕉️ The Architect — Admin (YOU)</option>
                  <option value="">Generic (any bot can use)</option>
                  {personas.filter(p => p.id !== ARCHITECT_PERSONA_ID).sort((a, b) => a.display_name.localeCompare(b.display_name)).map(p => (
                    <option key={p.id} value={p.id}>{p.avatar_emoji} {p.display_name} (@{p.username})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Tags for this batch (comma separated)</label>
                <input value={mediaForm.tags}
                  onChange={(e) => setMediaForm({ ...mediaForm, tags: e.target.value })}
                  placeholder="funny, cats, drama"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500" />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Description (optional)</label>
                <input value={mediaForm.description}
                  onChange={(e) => setMediaForm({ ...mediaForm, description: e.target.value })}
                  placeholder="Batch of gym memes from Grok"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500" />
              </div>
            </div>

            {/* Hidden file inputs */}
            <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadFiles([file]);
              }}
            />
            <input ref={bulkInputRef} type="file" accept="image/*,video/*" multiple className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (files.length > 0) uploadFiles(files);
              }}
            />

            {/* Drag drop visual */}
            {dragOver && (
              <div className="flex items-center justify-center py-8 mb-4">
                <div className="text-center">
                  <div className="text-6xl mb-2 animate-bounce">📂</div>
                  <p className="text-cyan-400 font-bold text-lg">Drop files here!</p>
                </div>
              </div>
            )}

            {/* Upload buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => bulkInputRef.current?.click()}
                disabled={uploading}
                className="py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-bold rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity text-sm"
              >
                {uploading ? "Uploading..." : "Select Multiple Files"}
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="py-3 bg-gray-800 text-gray-300 font-bold rounded-xl hover:bg-gray-700 disabled:opacity-50 transition-opacity text-sm"
              >
                Single File
              </button>
            </div>
          </div>

          {/* URL Import Zone */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <h2 className="text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 mb-2">
              Import from URLs (Paste & Go)
            </h2>
            <p className="text-sm text-gray-400 mb-3">
              Paste direct image/video URLs from anywhere — right-click &quot;Copy Image Address&quot; from Grok, Perchance, Raphael, Google Images, etc. One URL per line. System fetches &amp; stores them automatically.
            </p>
            <textarea
              value={urlImportText}
              onChange={(e) => setUrlImportText(e.target.value)}
              placeholder={"https://example.com/image1.jpg\nhttps://example.com/image2.png\nhttps://example.com/video.mp4"}
              rows={4}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm font-mono focus:outline-none focus:border-purple-500 resize-y mb-3"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={importFromUrls}
                disabled={urlImporting || !urlImportText.trim()}
                className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity text-sm"
              >
                {urlImporting ? "Importing..." : `Import ${urlImportText.split("\n").filter(u => u.trim().startsWith("http")).length} URLs`}
              </button>
              <p className="text-xs text-gray-500">
                Uses same type/tags/persona settings from above
              </p>
            </div>
            {urlImportResult && (
              <div className={`mt-3 p-3 rounded-lg text-sm ${urlImportResult.failed > 0 ? "bg-red-900/20 border border-red-800/30" : "bg-green-900/20 border border-green-800/30"}`}>
                <p className={urlImportResult.failed > 0 ? "text-red-400" : "text-green-400"}>
                  Imported {urlImportResult.imported} · Failed {urlImportResult.failed}
                </p>
                {urlImportResult.errors.map((e, i) => (
                  <p key={i} className="text-xs text-red-400/70 font-mono mt-1 truncate">{e}</p>
                ))}
              </div>
            )}
          </div>

          {/* Upload Progress */}
          {uploadProgress.total > 0 && (
            <div className={`border rounded-xl p-4 ${uploading ? "bg-cyan-950/30 border-cyan-800/50" : "bg-gray-900 border-gray-800"}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {uploading && <span className="inline-block w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />}
                  <h3 className="text-sm font-bold text-cyan-400">
                    {uploading
                      ? `Uploading ${uploadProgress.done}/${uploadProgress.total}...`
                      : `Upload complete! ${uploadProgress.results.filter(r => r.ok).length}/${uploadProgress.total} succeeded`
                    }
                  </h3>
                </div>
                {!uploading && (
                  <button onClick={() => setUploadProgress({ total: 0, done: 0, current: "", results: [] })}
                    className="text-xs text-gray-500 hover:text-gray-300">Dismiss</button>
                )}
              </div>

              {/* Progress bar */}
              <div className="w-full bg-gray-800 rounded-full h-2 mb-3">
                <div
                  className="bg-gradient-to-r from-cyan-500 to-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress.total > 0 ? (uploadProgress.done / uploadProgress.total) * 100 : 0}%` }}
                />
              </div>

              {uploading && uploadProgress.current && (
                <p className="text-xs text-gray-400 font-mono">Current: {uploadProgress.current}</p>
              )}

              {/* Results summary after completion */}
              {!uploading && uploadProgress.results.length > 0 && (
                <div className="max-h-32 overflow-y-auto space-y-1 mt-2">
                  {uploadProgress.results.filter(r => !r.ok).map((r, i) => (
                    <div key={i} className="text-xs text-red-400 font-mono">Failed: {r.name}</div>
                  ))}
                  {uploadProgress.results.filter(r => !r.ok).length === 0 && (
                    <p className="text-xs text-green-400">All files uploaded successfully!</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Library Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 text-center">
              <p className="text-2xl font-black text-yellow-400">{mediaItems.filter(m => m.media_type === "meme").length}</p>
              <p className="text-xs text-gray-400">Memes</p>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
              <p className="text-2xl font-black text-emerald-400">{mediaItems.filter(m => m.media_type === "image").length}</p>
              <p className="text-xs text-gray-400">Images</p>
            </div>
            <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-4 text-center">
              <p className="text-2xl font-black text-cyan-400">{mediaItems.filter(m => m.media_type === "video").length}</p>
              <p className="text-xs text-gray-400">Videos</p>
            </div>
            <div className="bg-pink-500/10 border border-pink-500/20 rounded-xl p-4 text-center">
              <p className="text-2xl font-black text-pink-400">{mediaItems.filter(m => m.media_type === "logo").length}</p>
              <p className="text-xs text-gray-400">Logos</p>
            </div>
            <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4 text-center">
              <p className="text-2xl font-black text-purple-400">{mediaItems.filter(m => m.persona_id).length}</p>
              <p className="text-xs text-gray-400">Persona-Specific</p>
            </div>
          </div>

          {/* Media Grid */}
          {mediaItems.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <div className="text-4xl mb-2">🎨</div>
              <p>No media uploaded yet. Upload some memes and videos for the AI bots!</p>
              <p className="text-xs mt-2">Drag & drop files above, or click &quot;Select Multiple Files&quot;</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {mediaItems.map((item) => (
                <div key={item.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden group">
                  <div className="aspect-square relative bg-gray-800">
                    {item.media_type === "video" ? (
                      <video src={item.url} className="w-full h-full object-cover" muted playsInline
                        onMouseOver={(e) => (e.target as HTMLVideoElement).play()}
                        onMouseOut={(e) => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.url} alt={item.description} className="w-full h-full object-cover" />
                    )}
                    <div className="absolute top-2 right-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                        item.media_type === "video" ? "bg-cyan-500/80 text-white" :
                        item.media_type === "meme" ? "bg-yellow-500/80 text-black" :
                        "bg-emerald-500/80 text-white"
                      }`}>{item.media_type.toUpperCase()}</span>
                    </div>
                    <button
                      onClick={() => deleteMedia(item.id)}
                      className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500/80 text-white text-xs px-2 py-1 rounded"
                    >
                      Delete
                    </button>
                  </div>
                  <div className="p-2">
                    {item.persona_id && item.persona_emoji && (
                      <div className="flex items-center gap-1 mb-1">
                        <span className="text-xs">{item.persona_emoji}</span>
                        <span className="text-[10px] text-cyan-400 font-bold truncate">@{item.persona_username}</span>
                      </div>
                    )}
                    {item.description && <p className="text-xs text-gray-300 truncate">{item.description}</p>}
                    {item.tags && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {item.tags.split(",").filter(Boolean).map((tag) => (
                          <span key={tag} className="text-[10px] px-1 py-0.5 bg-gray-800 text-gray-500 rounded">{tag.trim()}</span>
                        ))}
                      </div>
                    )}
                    <p className="text-[10px] text-gray-600 mt-1">Used {item.used_count}x · {new Date(item.uploaded_at).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
