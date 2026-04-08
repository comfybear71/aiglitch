"use client";

import { useEffect, useState, useCallback } from "react";
import { MARKETPLACE_PRODUCTS } from "@/lib/marketplace";

interface ProductImage {
  product_id: string;
  image_url: string;
  prompt_used: string;
}

export default function NFTMarketplacePage() {
  const [images, setImages] = useState<Record<string, ProductImage>>({});
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [filter, setFilter] = useState("all");
  const [batchRunning, setBatchRunning] = useState(false);

  const fetchImages = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/nft-marketplace");
      const data = await res.json();
      const map: Record<string, ProductImage> = {};
      (data.images || []).forEach((img: ProductImage) => { map[img.product_id] = img; });
      setImages(map);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchImages(); }, [fetchImages]);

  const grokifyProduct = async (productId: string, name: string, description: string, emoji: string) => {
    setGenerating(productId);
    setLog((prev: string[]) => [...prev, `Generating: ${emoji} ${name}...`]);
    try {
      const res = await fetch("/api/admin/nft-marketplace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId, product_name: name, product_description: description, product_emoji: emoji }),
      });
      const data = await res.json();
      if (data.success && data.image_url) {
        setImages((prev: Record<string, ProductImage>) => ({ ...prev, [productId]: { product_id: productId, image_url: data.image_url, prompt_used: "" } }));
        setLog((prev: string[]) => [...prev, `  Done: ${name}`]);
      } else {
        setLog((prev: string[]) => [...prev, `  Failed: ${data.error || "Unknown error"}`]);
      }
    } catch (err) {
      setLog((prev: string[]) => [...prev, `  Error: ${String(err)}`]);
    }
    setGenerating(null);
  };

  const batchGrokify = async () => {
    const ungenerated = MARKETPLACE_PRODUCTS.filter((p) => !images[p.id]);
    if (ungenerated.length === 0) { setLog((prev: string[]) => [...prev, "All products already have images!"]); return; }
    setBatchRunning(true);
    setLog((prev: string[]) => [...prev, `Batch: generating ${ungenerated.length} images...`]);
    for (const p of ungenerated) {
      await grokifyProduct(p.id, p.name, p.description, p.emoji);
      // 2s delay between generations to avoid rate limits
      await new Promise((r) => setTimeout(r, 2000));
      if (!batchRunning) break;
    }
    setBatchRunning(false);
    setLog((prev: string[]) => [...prev, "Batch complete!"]);
  };

  const deleteImage = async (productId: string) => {
    await fetch("/api/admin/nft-marketplace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", product_id: productId }),
    });
    setImages((prev: Record<string, ProductImage>) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  };

  const categories = [...new Set(MARKETPLACE_PRODUCTS.map((p) => p.category))];
  const filtered = filter === "all" ? MARKETPLACE_PRODUCTS : MARKETPLACE_PRODUCTS.filter((p) => p.category === filter);
  const withImages = filtered.filter((p) => images[p.id]);
  const withoutImages = filtered.filter((p) => !images[p.id]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-900 via-black to-gray-900 border border-purple-500/30 rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-3xl">{"\uD83C\uDFA8"}</span>
          <div>
            <h2 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400">
              NFT Marketplace Images
            </h2>
            <p className="text-gray-400 text-xs">
              Grokify product images for the marketplace. {MARKETPLACE_PRODUCTS.length} products, {Object.keys(images).length} with images.
            </p>
          </div>
        </div>
        <div className="flex gap-3 text-xs">
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-1.5">
            <span className="text-green-300 font-bold">{Object.keys(images).length}</span>
            <span className="text-gray-400 ml-1">Done</span>
          </div>
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg px-3 py-1.5">
            <span className="text-orange-300 font-bold">{MARKETPLACE_PRODUCTS.length - Object.keys(images).length}</span>
            <span className="text-gray-400 ml-1">Remaining</span>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <select value={filter} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilter(e.target.value)}
          className="px-3 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-white text-xs">
          <option value="all">All Categories ({MARKETPLACE_PRODUCTS.length})</option>
          {categories.map((c: string) => (
            <option key={c} value={c}>{c} ({MARKETPLACE_PRODUCTS.filter((p) => p.category === c).length})</option>
          ))}
        </select>
        <button onClick={batchGrokify} disabled={batchRunning || generating !== null}
          className="px-4 py-1.5 bg-gradient-to-r from-purple-500 to-cyan-500 text-black font-bold rounded-lg text-xs hover:opacity-90 disabled:opacity-40">
          {batchRunning ? "Generating..." : `Grokify All (${MARKETPLACE_PRODUCTS.length - Object.keys(images).length} remaining)`}
        </button>
        {batchRunning && (
          <button onClick={() => setBatchRunning(false)} className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-xs font-bold">Stop</button>
        )}
        <button onClick={fetchImages} className="px-3 py-1.5 bg-gray-800 text-gray-400 rounded-lg text-xs hover:text-white">Refresh</button>
      </div>

      {/* Log */}
      {log.length > 0 && (
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-3 max-h-32 overflow-y-auto">
          <div className="flex justify-between mb-1">
            <span className="text-xs text-gray-400 font-bold">Generation Log</span>
            <button onClick={() => setLog([])} className="text-[10px] text-gray-500 hover:text-gray-300">Clear</button>
          </div>
          {log.map((line: string, i: number) => (
            <p key={i} className="text-[10px] text-gray-500 font-mono">{line}</p>
          ))}
        </div>
      )}

      {/* Products Grid */}
      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading...</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {[...withoutImages, ...withImages].map((product) => {
            const img = images[product.id];
            const isGenerating = generating === product.id;
            return (
              <div key={product.id} className={`bg-gray-900 border rounded-xl overflow-hidden ${img ? "border-green-500/30" : "border-gray-800"}`}>
                {/* Image / Emoji */}
                <div className="relative aspect-square bg-black flex items-center justify-center">
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img.image_url} alt={product.name} className="w-full h-full object-cover" />
                  ) : isGenerating ? (
                    <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span className="text-4xl">{product.emoji}</span>
                  )}
                  {img && (
                    <div className="absolute top-1 right-1 bg-green-500 text-black text-[8px] font-bold px-1.5 py-0.5 rounded-full">DONE</div>
                  )}
                  <div className="absolute bottom-1 left-1 bg-black/70 text-[8px] text-gray-300 px-1.5 py-0.5 rounded">{product.price}</div>
                </div>

                {/* Info */}
                <div className="p-2 space-y-1">
                  <p className="text-[10px] text-white font-medium line-clamp-1">{product.name}</p>
                  <p className="text-[8px] text-gray-500 line-clamp-1">{product.category}</p>
                  <div className="flex gap-1">
                    {img ? (
                      <>
                        <button onClick={() => grokifyProduct(product.id, product.name, product.description, product.emoji)}
                          disabled={isGenerating}
                          className="flex-1 py-1 bg-purple-500/20 text-purple-300 rounded text-[9px] font-bold hover:bg-purple-500/30 disabled:opacity-40">
                          Redo
                        </button>
                        <button onClick={() => deleteImage(product.id)}
                          className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-[9px] hover:bg-red-500/30">
                          Del
                        </button>
                      </>
                    ) : (
                      <button onClick={() => grokifyProduct(product.id, product.name, product.description, product.emoji)}
                        disabled={isGenerating || batchRunning}
                        className="flex-1 py-1 bg-cyan-500/20 text-cyan-300 rounded text-[9px] font-bold hover:bg-cyan-500/30 disabled:opacity-40">
                        {isGenerating ? "..." : "Grokify"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
