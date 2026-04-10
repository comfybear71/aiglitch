"use client";

import { useEffect, useState, useCallback, useRef } from "react";

interface MerchItem {
  id: string;
  source: "capture" | "generate";
  image_url: string;
  label: string | null;
  category: string | null;
  source_post_id: string | null;
  source_video_url: string | null;
  prompt_used: string | null;
  created_at: string;
}

interface VideoPost {
  id: string;
  content: string;
  media_url: string;
  created_at: string;
  persona_id: string;
  display_name: string;
  avatar_emoji: string;
}

type MerchTab = "capture" | "generate" | "library";

/* ── Preset prompts for Grok merch generation ── */
const MERCH_PRESETS: { label: string; category: string; prompt: string }[] = [
  {
    label: "Neon Cyberpunk Logo",
    category: "logo",
    prompt: "AIG!itch logo in neon cyberpunk style, purple and cyan glow, digital glitch effects, dark background, ultra detailed, print-ready t-shirt design, 4K resolution, centered composition, no text artifacts",
  },
  {
    label: "Glitch Art T-Shirt",
    category: "t-shirt",
    prompt: "Bold AIG!itch branded t-shirt design, glitch art aesthetic, vibrant purple and cyan colors, RGB chromatic aberration, pixelated decay, high contrast, white background for easy screen printing, print-ready",
  },
  {
    label: "Retro VHS Sticker",
    category: "sticker",
    prompt: "AIG!itch die-cut sticker design, retro 80s VHS aesthetic, neon synthwave colors, holographic foil effect, bold outline for cutting, transparent background suitable for vinyl sticker printing",
  },
  {
    label: "Enamel Pin Design",
    category: "pin",
    prompt: "AIG!itch enamel pin design, simple bold graphic with 4-5 flat colors maximum, gold metal outline, small form factor, iconic logo style, suitable for hard enamel pin manufacturing, top-down product shot",
  },
  {
    label: "Minimalist Poster",
    category: "poster",
    prompt: "Minimalist AIG!itch poster, clean geometric composition, purple and cyan gradient, single bold graphic element, negative space, modern art aesthetic, 18x24 poster format, print-ready high resolution",
  },
  {
    label: "Hoodie Back Print",
    category: "hoodie",
    prompt: "Large back-print design for AIG!itch hoodie, dramatic glitch logo with surrounding neural network patterns, purple glow, dark background, covers entire back panel, premium streetwear aesthetic, high detail",
  },
  {
    label: "Circuit Board Art",
    category: "poster",
    prompt: "AIG!itch logo integrated into intricate circuit board artwork, traces glowing purple and cyan, motherboard aesthetic, high tech cyberpunk detail, dark PCB green background, print-ready poster art",
  },
  {
    label: "Holographic Card",
    category: "card",
    prompt: "AIG!itch holographic trading card design, rainbow holographic foil texture, rare collector aesthetic, bold logo front, ornate border, premium trading card finish, high contrast, print-ready",
  },
  {
    label: "Graffiti Street Style",
    category: "sticker",
    prompt: "AIG!itch graffiti street art style logo, spray paint texture, drip effects, bold outline, urban aesthetic, rebellious energy, purple and cyan palette, suitable for street sticker or screen printing",
  },
  {
    label: "Glitched Pixel Art",
    category: "sticker",
    prompt: "AIG!itch logo in 16-bit pixel art style with intentional corruption glitches, retro gaming aesthetic, pixel-perfect edges, limited color palette, transparent background, sticker format",
  },
  {
    label: "Monochrome Stencil",
    category: "sticker",
    prompt: "AIG!itch stencil design, pure black on white, bold negative space cutout style, suitable for spray painting or single-color screen print, iconic silhouette, no gradients, high contrast",
  },
  {
    label: "Chaos Mandala",
    category: "poster",
    prompt: "AIG!itch chaos mandala — intricate symmetrical circular design incorporating 108 tiny persona silhouettes, §GLITCH coin symbols, glitch patterns, purple and cyan sacred geometry, mesmerizing detail, poster art",
  },
  {
    label: "AI Circuitry Mascot",
    category: "logo",
    prompt: "AIG!itch mascot character — cute robotic glitch creature with exposed circuitry, big expressive eyes, purple and cyan color scheme, friendly cyberpunk aesthetic, character design for merchandise, clean white background",
  },
  {
    label: "Vaporwave Sunset",
    category: "poster",
    prompt: "AIG!itch vaporwave aesthetic poster, retro sunset with grid horizon, palm tree silhouettes, neon purple and pink sky, 80s synth aesthetic, AIG!itch logo centered, dreamy nostalgic vibes, poster art",
  },
  {
    label: "Mug Wraparound",
    category: "mug",
    prompt: "AIG!itch coffee mug wraparound print design, repeating pattern of logo variations and glitch elements, purple on dark background, 360 degree wraparound format, ceramic mug print-ready",
  },
  {
    label: "Tote Bag Design",
    category: "tote",
    prompt: "AIG!itch canvas tote bag design, minimalist bold logo on natural canvas, single purple color print, casual streetwear aesthetic, centered composition, suitable for screen printing on natural tote bag",
  },
  {
    label: "108 Personas Collage",
    category: "poster",
    prompt: "Epic AIG!itch poster showing a grid collage of 108 unique AI persona silhouettes, each slightly different, unified color palette purple and cyan, AIG!itch logo prominent at top, dense detailed composition, print-ready",
  },
  {
    label: "Grok Glitch Ad Parody",
    category: "poster",
    prompt: "Fake vintage advertisement poster for AIG!itch, 1950s retro ad aesthetic with modern glitch overlay, bold headline space, product shot of abstract glitch art, kitsch meets cyberpunk, poster art",
  },
  {
    label: "Trading Card Frame",
    category: "card",
    prompt: "AIG!itch NFT trading card frame design, ornate purple and cyan border with glitch effects, holographic accents, rarity gem in corners, empty center for product image insertion, premium card game aesthetic",
  },
  {
    label: "Stealth Logo Mark",
    category: "logo",
    prompt: "AIG!itch stealth logo variant, minimal dark-on-dark design, almost invisible black on charcoal, subtle purple highlight accent, premium underground aesthetic, suitable for embossing or luxury merchandise",
  },
];

export default function MerchStudioPage() {
  const [tab, setTab] = useState<MerchTab>("library");
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<MerchItem[]>([]);

  // Capture state
  const [videos, setVideos] = useState<VideoPost[]>([]);
  const [videosLoading, setVideosLoading] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<VideoPost | null>(null);
  const [captureLabel, setCaptureLabel] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [captureMsg, setCaptureMsg] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Generate state
  const [genPrompt, setGenPrompt] = useState("");
  const [genLabel, setGenLabel] = useState("");
  const [genCategory, setGenCategory] = useState("design");
  const [generating, setGenerating] = useState(false);
  const [genMsg, setGenMsg] = useState<string | null>(null);

  // Library filter
  const [libraryFilter, setLibraryFilter] = useState<"all" | "capture" | "generate">("all");

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/merch");
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch (err) {
      console.error("Failed to fetch merch items:", err);
    }
    setLoading(false);
  }, []);

  const fetchVideos = useCallback(async () => {
    setVideosLoading(true);
    try {
      const res = await fetch("/api/admin/merch?action=videos&limit=80");
      if (res.ok) {
        const data = await res.json();
        setVideos(data.videos || []);
      }
    } catch (err) {
      console.error("Failed to fetch videos:", err);
    }
    setVideosLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  useEffect(() => {
    if (tab === "capture" && videos.length === 0) fetchVideos();
  }, [tab, videos.length, fetchVideos]);

  const captureFrame = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !selectedVideo) {
      setCaptureMsg("\u274C No video selected");
      return;
    }
    if (video.videoWidth === 0) {
      setCaptureMsg("\u274C Video not ready — wait for it to load and try again");
      return;
    }

    setCapturing(true);
    setCaptureMsg("\uD83D\uDCF8 Capturing frame...");

    try {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context not available");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/png");

      const res = await fetch("/api/admin/merch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "capture",
          image_data: dataUrl,
          label: captureLabel || `Frame @ ${video.currentTime.toFixed(1)}s from ${selectedVideo.display_name || "unknown"}`,
          source_post_id: selectedVideo.id,
          source_video_url: selectedVideo.media_url,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setCaptureMsg("\u2705 Frame captured! Check the Library tab.");
        setCaptureLabel("");
        fetchItems();
      } else {
        setCaptureMsg(`\u274C ${data.error || "Capture failed"}`);
      }
    } catch (err) {
      setCaptureMsg(`\u274C ${String(err)}`);
    }
    setCapturing(false);
  };

  const generateDesign = async (prompt: string, label: string, category: string) => {
    setGenerating(true);
    setGenMsg(`\uD83C\uDFA8 Grok is generating "${label}"...`);

    try {
      const res = await fetch("/api/admin/merch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", prompt, label, category }),
      });
      const data = await res.json();

      if (data.success) {
        setGenMsg(`\u2705 Generated "${label}"! Check the Library tab.`);
        fetchItems();
      } else {
        setGenMsg(`\u274C ${data.error || "Generation failed"}`);
      }
    } catch (err) {
      setGenMsg(`\u274C ${String(err)}`);
    }
    setGenerating(false);
  };

  const deleteItem = async (id: string) => {
    if (!confirm("Delete this merch item permanently?")) return;
    const res = await fetch("/api/admin/merch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    if (res.ok) {
      setItems((prev: MerchItem[]) => prev.filter((i: MerchItem) => i.id !== id));
    }
  };

  const updateLabel = async (id: string, label: string, category: string | null) => {
    await fetch("/api/admin/merch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", id, label, category }),
    });
    setItems((prev: MerchItem[]) => prev.map((i: MerchItem) => i.id === id ? { ...i, label, category } : i));
  };

  const filteredItems = items.filter((i: MerchItem) => libraryFilter === "all" || i.source === libraryFilter);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-900 via-black to-gray-900 border border-purple-500/30 rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-3xl">{"\uD83D\uDC55"}</span>
          <div>
            <h2 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400">
              Merch Studio
            </h2>
            <p className="text-gray-400 text-xs">
              Capture logo frames from videos + generate print-ready merch designs. Export for Printful/Redbubble.
            </p>
          </div>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 border-b border-gray-800">
        {(["library", "capture", "generate"] as MerchTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-bold rounded-t-lg transition-colors ${
              tab === t
                ? "bg-purple-500/20 text-purple-300 border-t border-x border-purple-500/30"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {t === "library" && `\uD83D\uDCDA Library (${items.length})`}
            {t === "capture" && "\uD83C\uDFAC Capture Frame"}
            {t === "generate" && "\uD83C\uDFA8 Generate Design"}
          </button>
        ))}
      </div>

      {/* ── LIBRARY TAB ── */}
      {tab === "library" && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs text-gray-500">Filter:</span>
            {(["all", "capture", "generate"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setLibraryFilter(f)}
                className={`px-3 py-1 rounded-full text-xs font-bold ${
                  libraryFilter === f ? "bg-purple-500/30 text-purple-200" : "bg-gray-800 text-gray-500 hover:text-gray-300"
                }`}
              >
                {f === "all" && `All (${items.length})`}
                {f === "capture" && `Captured (${items.filter((i: MerchItem) => i.source === "capture").length})`}
                {f === "generate" && `Generated (${items.filter((i: MerchItem) => i.source === "generate").length})`}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="text-center py-8 text-gray-500 text-sm">Loading library...</div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-5xl mb-3">{"\uD83D\uDC55"}</p>
              <p className="text-sm">No merch items yet.</p>
              <p className="text-xs text-gray-600 mt-2">Use the Capture or Generate tabs to build your merch library.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {filteredItems.map((item: MerchItem) => (
                <MerchCard
                  key={item.id}
                  item={item}
                  onDelete={() => deleteItem(item.id)}
                  onUpdateLabel={(label: string, category: string | null) => updateLabel(item.id, label, category)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── CAPTURE TAB ── */}
      {tab === "capture" && (
        <div className="space-y-4">
          {!selectedVideo ? (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400">Pick a video to scrub through and capture frames.</p>
                <button
                  onClick={fetchVideos}
                  disabled={videosLoading}
                  className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-xs disabled:opacity-50"
                >
                  {videosLoading ? "Loading..." : "\u21BB Refresh"}
                </button>
              </div>
              {videosLoading ? (
                <div className="text-center py-8 text-gray-500 text-sm">Loading videos...</div>
              ) : videos.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">No videos found</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {videos.map((v: VideoPost) => (
                    <button
                      key={v.id}
                      onClick={() => { setSelectedVideo(v); setCaptureMsg(null); }}
                      className="group relative aspect-[9/16] bg-black rounded-lg overflow-hidden border border-gray-800 hover:border-purple-500 transition-colors"
                    >
                      <video
                        src={v.media_url}
                        className="w-full h-full object-cover"
                        muted
                        playsInline
                        preload="metadata"
                      />
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-2">
                        <p className="text-[10px] text-white font-bold truncate">
                          {v.avatar_emoji} {v.display_name || "Unknown"}
                        </p>
                        <p className="text-[9px] text-gray-400 truncate">
                          {v.content?.slice(0, 40) || "No caption"}
                        </p>
                      </div>
                      <div className="absolute top-1 right-1 bg-black/70 text-[9px] text-white px-1.5 py-0.5 rounded">
                        {new Date(v.created_at).toLocaleDateString()}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <button
                onClick={() => { setSelectedVideo(null); setCaptureMsg(null); }}
                className="text-xs text-gray-400 hover:text-gray-200"
              >
                {"\u2190"} Back to video list
              </button>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-sm font-bold text-white mb-1">
                  {selectedVideo.avatar_emoji} {selectedVideo.display_name || "Unknown"}
                </p>
                <p className="text-xs text-gray-500 mb-3 line-clamp-2">{selectedVideo.content || "No caption"}</p>

                <video
                  ref={videoRef}
                  src={selectedVideo.media_url}
                  className="w-full max-w-md mx-auto rounded-lg bg-black"
                  controls
                  playsInline
                  crossOrigin="anonymous"
                />

                <canvas ref={canvasRef} className="hidden" />

                <div className="mt-4 space-y-3">
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-1">Label (optional)</label>
                    <input
                      value={captureLabel}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCaptureLabel(e.target.value)}
                      placeholder="e.g. Studios outro logo, AiTunes neon variant"
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
                    />
                  </div>
                  <button
                    onClick={captureFrame}
                    disabled={capturing}
                    className="w-full px-4 py-3 bg-gradient-to-r from-purple-500 to-cyan-500 text-black font-bold rounded-lg text-sm hover:opacity-90 disabled:opacity-40"
                  >
                    {capturing ? "Capturing..." : `\uD83D\uDCF8 Capture Current Frame`}
                  </button>
                  {captureMsg && (
                    <p className={`text-xs text-center ${captureMsg.startsWith("\u2705") ? "text-green-400" : captureMsg.startsWith("\u274C") ? "text-red-400" : "text-gray-400"}`}>
                      {captureMsg}
                    </p>
                  )}
                  <p className="text-[10px] text-gray-600 text-center">
                    {"\uD83D\uDCA1"} Pause the video at the perfect frame, then click Capture. The frame will be saved at full video resolution.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── GENERATE TAB ── */}
      {tab === "generate" && (
        <div className="space-y-4">
          {/* Custom prompt */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h3 className="text-sm font-bold text-white mb-3">{"\uD83C\uDFA8"} Custom Design</h3>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">Label</label>
                <input
                  value={genLabel}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setGenLabel(e.target.value)}
                  placeholder="e.g. AIG!itch Skate Deck Design"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">Category</label>
                <select
                  value={genCategory}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setGenCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
                >
                  <option value="design">General Design</option>
                  <option value="logo">Logo</option>
                  <option value="t-shirt">T-Shirt</option>
                  <option value="hoodie">Hoodie</option>
                  <option value="sticker">Sticker</option>
                  <option value="pin">Pin / Badge</option>
                  <option value="poster">Poster</option>
                  <option value="card">Trading Card</option>
                  <option value="mug">Mug</option>
                  <option value="tote">Tote Bag</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">Prompt (describe the design in detail)</label>
                <textarea
                  value={genPrompt}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setGenPrompt(e.target.value)}
                  placeholder="e.g. AIG!itch logo exploding with neon glitch effects, purple and cyan, cyberpunk t-shirt design, white background, print-ready"
                  rows={4}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm font-mono"
                />
              </div>
              <button
                onClick={() => generateDesign(genPrompt, genLabel || "Custom Design", genCategory)}
                disabled={generating || !genPrompt.trim() || !genLabel.trim()}
                className="w-full px-4 py-3 bg-gradient-to-r from-purple-500 to-cyan-500 text-black font-bold rounded-lg text-sm hover:opacity-90 disabled:opacity-40"
              >
                {generating ? "Generating..." : `\uD83C\uDFA8 Generate with Grok`}
              </button>
              {genMsg && (
                <p className={`text-xs text-center ${genMsg.startsWith("\u2705") ? "text-green-400" : genMsg.startsWith("\u274C") ? "text-red-400" : "text-gray-400"}`}>
                  {genMsg}
                </p>
              )}
            </div>
          </div>

          {/* Preset designs */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h3 className="text-sm font-bold text-white mb-1">{"\u26A1"} Quick Presets</h3>
            <p className="text-[10px] text-gray-500 mb-3">One click = one merch design. Each generation costs ~$0.02 via Grok.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {MERCH_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => generateDesign(preset.prompt, preset.label, preset.category)}
                  disabled={generating}
                  className="text-left p-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-purple-500 rounded-lg text-xs text-white disabled:opacity-40 transition-colors"
                >
                  <p className="font-bold">{preset.label}</p>
                  <p className="text-[10px] text-gray-400 mt-1 line-clamp-2">{preset.prompt.slice(0, 80)}...</p>
                  <p className="text-[9px] text-purple-400 mt-1 uppercase font-bold">{preset.category}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Merch Card Component ── */
function MerchCard({
  item,
  onDelete,
  onUpdateLabel,
}: {
  item: MerchItem;
  onDelete: () => void | Promise<void>;
  onUpdateLabel: (label: string, category: string | null) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(item.label || "");
  const [category, setCategory] = useState(item.category || "");

  const saveEdit = () => {
    onUpdateLabel(label, category || null);
    setEditing(false);
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden group">
      <div className="aspect-square bg-black relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.image_url} alt={item.label || "Merch"} className="w-full h-full object-contain" />
        <div className="absolute top-1 left-1 bg-black/70 text-[9px] text-white px-1.5 py-0.5 rounded">
          {item.source === "capture" ? "\uD83D\uDCF8 Frame" : "\uD83C\uDFA8 Generated"}
        </div>
      </div>
      <div className="p-2">
        {editing ? (
          <div className="space-y-1">
            <input
              value={label}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLabel(e.target.value)}
              placeholder="Label"
              className="w-full px-2 py-1 bg-gray-800 border border-gray-700 rounded text-[10px] text-white"
            />
            <input
              value={category}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCategory(e.target.value)}
              placeholder="Category"
              className="w-full px-2 py-1 bg-gray-800 border border-gray-700 rounded text-[10px] text-white"
            />
            <div className="flex gap-1">
              <button onClick={saveEdit} className="flex-1 py-1 bg-green-500/20 text-green-300 rounded text-[10px] font-bold">Save</button>
              <button onClick={() => setEditing(false)} className="flex-1 py-1 bg-gray-700 text-gray-300 rounded text-[10px]">Cancel</button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-[11px] text-white font-bold truncate" title={item.label || ""}>
              {item.label || "Untitled"}
            </p>
            {item.category && (
              <p className="text-[9px] text-purple-400 uppercase">{item.category}</p>
            )}
            <p className="text-[9px] text-gray-600 mb-2">{new Date(item.created_at).toLocaleDateString()}</p>
            <div className="flex gap-1">
              <a
                href={item.image_url}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 rounded text-[10px] font-bold text-center"
              >
                Download
              </a>
              <button onClick={() => setEditing(true)} className="py-1 px-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-[10px]">Edit</button>
              <button onClick={onDelete} className="py-1 px-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded text-[10px]">Del</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
