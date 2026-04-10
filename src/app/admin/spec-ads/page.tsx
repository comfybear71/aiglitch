"use client";

import { useEffect, useState, useCallback, useRef } from "react";

interface SpecClip {
  channel_id: string;
  channel_name: string;
  index: number;
  status: string;
  url: string | null;
  request_id: string | null;
}

interface SpecAd {
  id: string;
  brand_name: string;
  product_name: string;
  description: string | null;
  clips: SpecClip[];
  status: string;
  created_at: string;
}

export default function SpecAdsPage() {
  const [ads, setAds] = useState<SpecAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [brandName, setBrandName] = useState("");
  const [productName, setProductName] = useState("");
  const [description, setDescription] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number; startTime: number } | null>(null);
  const [clipStatus, setClipStatus] = useState<{ channel: string; status: string; url?: string }[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAds = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/spec-ads?action=list");
      const data = await res.json();
      setAds((data.ads || []).map((a: Record<string, unknown>) => ({
        ...a,
        clips: typeof a.clips === "string" ? JSON.parse(a.clips as string) : (a.clips || []),
      })));
    } catch (err) {
      console.error("Failed to fetch spec ads:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAds(); }, [fetchAds]);

  // Timer for elapsed display
  useEffect(() => {
    if (generating && !timerRef.current) {
      timerRef.current = setInterval(() => setElapsed((e: number) => e + 1), 1000);
    }
    if (!generating && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [generating]);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const generate = async () => {
    if (!brandName || !productName) return;
    setGenerating(true);
    setElapsed(0);
    setLog([`\uD83C\uDFAC Generating spec ads for ${brandName} — ${productName}`]);
    setProgress({ current: 0, total: 3, startTime: Date.now() });
    setClipStatus([]);

    try {
      setLog((prev: string[]) => [...prev, `\uD83D\uDCE1 Submitting 3 clips to Grok...`]);

      const res = await fetch("/api/admin/spec-ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_name: brandName, product_name: productName, description }),
      });
      const data = await res.json();

      if (data.error) {
        setLog((prev: string[]) => [...prev, `\u274C Error: ${data.error}`]);
        setGenerating(false);
        setProgress(null);
        return;
      }

      const statuses = data.clips.map((c: { channel: string; request_id: string | null }) => ({
        channel: c.channel,
        status: c.request_id ? "submitted" : "failed",
      }));
      setClipStatus(statuses);

      data.clips.forEach((c: { channel: string; request_id: string | null }) => {
        setLog((prev: string[]) => [...prev, `  \uD83D\uDCE1 ${c.channel}: ${c.request_id ? "submitted" : "FAILED"}`]);
      });

      // Poll clips
      await pollClips(data.id, data.clips, data.folder, statuses);
    } catch (err) {
      setLog((prev: string[]) => [...prev, `\u274C Error: ${String(err)}`]);
      setGenerating(false);
      setProgress(null);
    }
  };

  const pollClips = async (
    specId: string,
    clips: { channel: string; channel_id: string; request_id: string | null }[],
    folder: string,
    statuses: { channel: string; status: string; url?: string }[],
  ) => {
    const done = new Set<number>();
    const maxAttempts = 60;

    const retryCount: Record<number, number> = {};
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((r) => setTimeout(r, 10000));

      const pending = clips.length - done.size;
      if (attempt > 0 && attempt % 3 === 0 && pending > 0) {
        setLog((prev: string[]) => [...prev, `  \u23F3 Poll ${attempt}/${maxAttempts} — ${pending} clip${pending > 1 ? "s" : ""} still rendering...`]);
      }

      for (let i = 0; i < clips.length; i++) {
        if (done.has(i) || !clips[i].request_id) {
          if (!clips[i].request_id) done.add(i);
          continue;
        }

        try {
          const res = await fetch("/api/admin/spec-ads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "poll",
              request_id: clips[i].request_id,
              spec_id: specId,
              clip_index: i,
              channel_name: clips[i].channel,
              folder,
            }),
          });

          if (!res.ok) {
            retryCount[i] = (retryCount[i] || 0) + 1;
            setLog((prev: string[]) => [...prev, `  \u26A0\uFE0F ${clips[i].channel}: HTTP ${res.status} — retry ${retryCount[i]}`]);
            if (retryCount[i] >= 10) {
              done.add(i);
              statuses[i] = { channel: clips[i].channel, status: "failed" };
              setClipStatus([...statuses]);
              setProgress((prev) => prev ? { ...prev, current: done.size } : null);
              setLog((prev: string[]) => [...prev, `  \u274C ${clips[i].channel}: FAILED after ${retryCount[i]} errors`]);
            }
            continue;
          }

          const data = await res.json();

          if (data.status === "done") {
            done.add(i);
            statuses[i] = { channel: clips[i].channel, status: "done", url: data.videoUrl };
            setClipStatus([...statuses]);
            setProgress((prev) => prev ? { ...prev, current: done.size } : null);
            setLog((prev: string[]) => [...prev, `  \u2705 ${clips[i].channel}: DONE`]);
          } else if (data.status === "failed") {
            done.add(i);
            statuses[i] = { channel: clips[i].channel, status: "failed" };
            setClipStatus([...statuses]);
            setProgress((prev) => prev ? { ...prev, current: done.size } : null);
            setLog((prev: string[]) => [...prev, `  \u274C ${clips[i].channel}: FAILED${data.error ? ` — ${data.error}` : ""}`]);
          }
        } catch (err) {
          retryCount[i] = (retryCount[i] || 0) + 1;
          setLog((prev: string[]) => [...prev, `  \u26A0\uFE0F ${clips[i].channel}: Network error — retry ${retryCount[i]}`]);
          if (retryCount[i] >= 10) {
            done.add(i);
            statuses[i] = { channel: clips[i].channel, status: "failed" };
            setClipStatus([...statuses]);
            setProgress((prev) => prev ? { ...prev, current: done.size } : null);
            setLog((prev: string[]) => [...prev, `  \u274C ${clips[i].channel}: FAILED after ${retryCount[i]} errors — ${String(err)}`]);
          }
        }
      }

      if (done.size >= clips.length) break;
    }

    setLog((prev: string[]) => [...prev, `\u2705 Spec ads complete for ${brandName}`]);
    setGenerating(false);
    setProgress(null);
    fetchAds();
  };

  const deleteAd = async (id: string) => {
    if (!confirm("Delete this spec ad?")) return;
    await fetch("/api/admin/spec-ads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    setAds((prev: SpecAd[]) => prev.filter((a: SpecAd) => a.id !== id));
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Progress Bar — same style as channels */}
      {(generating || log.length > 0) && (
        <div className={`border rounded-xl p-4 ${generating ? "bg-green-950/30 border-green-800/50" : "bg-gray-900 border-gray-800"}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {generating && <span className="inline-block w-2 h-2 bg-green-400 rounded-full animate-pulse" />}
              <h3 className="text-sm font-bold text-green-400">
                {generating ? "Generation in progress..." : "Generation complete"}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">{formatTime(elapsed)} elapsed</span>
              {!generating && <button onClick={() => { setLog([]); setClipStatus([]); }} className="text-xs text-gray-500 hover:text-gray-300">Clear</button>}
            </div>
          </div>

          {/* Progress bar */}
          {progress && (
            <div className="mb-3">
              <div className="flex items-center justify-between text-[10px] text-gray-400 mb-1">
                <span>{"\uD83C\uDFAC"} Spec Ads {progress.current}/{progress.total}</span>
                <span>~{Math.max(0, (progress.total - progress.current) * 60)}s remaining (est.)</span>
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-green-500 to-cyan-400 rounded-full transition-all duration-500"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }} />
              </div>
            </div>
          )}

          {/* Per-clip status */}
          {clipStatus.length > 0 && (
            <div className="flex gap-3 mb-2">
              {clipStatus.map((cs: { channel: string; status: string; url?: string }, i: number) => (
                <div key={i} className={`flex items-center gap-1.5 text-[10px] ${cs.status === "done" ? "text-green-400" : cs.status === "failed" ? "text-red-400" : "text-yellow-400"}`}>
                  <span>{cs.status === "done" ? "\u2705" : cs.status === "failed" ? "\u274C" : "\u23F3"}</span>
                  <span>{cs.channel}</span>
                  {cs.url && <span className="text-gray-500">({(cs.url.length / 1024).toFixed(0)}kb)</span>}
                </div>
              ))}
            </div>
          )}

          {/* Log */}
          <div className="space-y-0.5 max-h-32 overflow-y-auto">
            {log.map((line: string, i: number) => (
              <p key={i} className="text-[10px] text-gray-400 font-mono">{line}</p>
            ))}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-gradient-to-r from-gray-900 via-black to-gray-900 border border-amber-500/30 rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-3xl">{"\uD83C\uDFAC"}</span>
          <div>
            <h2 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-cyan-400">
              Spec Ad Generator
            </h2>
            <p className="text-gray-400 text-xs">
              Generate product placement demo clips for sponsor outreach. Private — never posted publicly.
            </p>
          </div>
        </div>
      </div>

      {/* Generator Form */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-bold text-white">Generate Spec Ads</h3>
        <p className="text-[10px] text-gray-500">Enter a brand and product. System picks 3 random channels and generates 10-second clips showing the product naturally integrated.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] text-gray-400 block mb-1">Brand Name *</label>
            <input value={brandName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBrandName(e.target.value)}
              placeholder="Nike" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm" />
          </div>
          <div>
            <label className="text-[10px] text-gray-400 block mb-1">Product Name *</label>
            <input value={productName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProductName(e.target.value)}
              placeholder="Air Max 90" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm" />
          </div>
          <div>
            <label className="text-[10px] text-gray-400 block mb-1">Brief Description</label>
            <input value={description} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDescription(e.target.value)}
              placeholder="running shoes" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm" />
          </div>
        </div>
        <button onClick={generate} disabled={generating || !brandName || !productName}
          className="px-6 py-2 bg-gradient-to-r from-amber-500 to-cyan-500 text-black font-bold rounded-lg text-sm hover:opacity-90 disabled:opacity-40">
          {generating ? "Generating..." : "\uD83C\uDFAC Generate 3 Spec Clips"}
        </button>
      </div>

      {/* Spec Ads History */}
      {loading ? (
        <div className="text-center py-8 text-gray-500 text-sm">Loading...</div>
      ) : ads.length === 0 && !generating ? (
        <div className="text-center py-8 text-gray-500">
          <p className="text-4xl mb-2">{"\uD83C\uDFAC"}</p>
          <p className="text-sm">No spec ads yet. Generate your first one above.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {ads.map((ad: SpecAd) => (
            <div key={ad.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between p-3 border-b border-gray-800">
                <div>
                  <h3 className="font-bold text-white text-sm">{ad.brand_name} — {ad.product_name}</h3>
                  <p className="text-gray-600 text-[10px]">
                    {ad.description && `${ad.description} · `}
                    {new Date(ad.created_at).toLocaleDateString()} &middot;
                    {ad.clips.filter((c: SpecClip) => c.url).length}/{ad.clips.length} clips
                  </p>
                </div>
                <button onClick={() => deleteAd(ad.id)} className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-[10px] hover:bg-red-500/30">Delete</button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-0 divide-x divide-gray-800">
                {ad.clips.map((clip: SpecClip, idx: number) => (
                  <div key={idx} className="p-3">
                    {clip.url ? (
                      <div className="relative aspect-[9/16] max-h-[250px] bg-black rounded-lg overflow-hidden mb-2">
                        <video src={clip.url} className="w-full h-full object-cover" muted playsInline preload="metadata"
                          onMouseEnter={(e: React.MouseEvent<HTMLVideoElement>) => (e.target as HTMLVideoElement).play().catch(() => {})}
                          onMouseLeave={(e: React.MouseEvent<HTMLVideoElement>) => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
                        />
                        <div className="absolute top-1 left-1 bg-black/70 text-[9px] text-white px-1.5 py-0.5 rounded">{clip.channel_name}</div>
                      </div>
                    ) : (
                      <div className="aspect-[9/16] max-h-[250px] bg-gray-800/50 rounded-lg flex items-center justify-center mb-2">
                        <span className="text-gray-600 text-xs">{clip.status === "failed" ? "\u274C Failed" : "\u23F3 Generating..."}</span>
                      </div>
                    )}
                    <p className="text-[10px] text-gray-300 font-medium mb-1">{clip.channel_name}</p>
                    {clip.url && (
                      <div className="flex gap-1">
                        <a href={clip.url} download target="_blank" rel="noopener noreferrer"
                          className="flex-1 py-1.5 bg-purple-500/20 text-purple-300 rounded text-[10px] font-bold text-center hover:bg-purple-500/30">
                          Download
                        </a>
                        <button onClick={() => copyUrl(clip.url!)}
                          className={`flex-1 py-1.5 rounded text-[10px] font-bold text-center ${copiedUrl === clip.url ? "bg-green-500/20 text-green-300" : "bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30"}`}>
                          {copiedUrl === clip.url ? "Copied!" : "Copy URL"}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Instructions */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 text-xs text-gray-400 space-y-1">
        <h3 className="text-sm font-bold text-white">How to Use</h3>
        <ol className="list-decimal list-inside space-y-0.5">
          <li>Enter the brand and product you want to pitch</li>
          <li>System picks 3 random channels and generates 10-second clips</li>
          <li>Each clip shows the product naturally placed in that channel&apos;s style</li>
          <li>Copy the URLs and paste into your outreach emails on MasterHQ</li>
          <li>These are <span className="text-red-400 font-bold">PRIVATE</span> — never posted to feed or social media</li>
        </ol>
      </div>
    </div>
  );
}
