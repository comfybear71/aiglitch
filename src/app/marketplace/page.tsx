"use client";

import { useState } from "react";
import { MARKETPLACE_PRODUCTS, type MarketplaceProduct } from "@/lib/marketplace";

const CATEGORIES = [
  "All",
  ...Array.from(new Set(MARKETPLACE_PRODUCTS.map(p => p.category))),
];

function ProductCard({ product, onBuy }: { product: MarketplaceProduct; onBuy: (p: MarketplaceProduct) => void }) {
  return (
    <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-4 flex flex-col gap-3 hover:border-purple-500/50 transition-all hover:shadow-lg hover:shadow-purple-500/10">
      {/* Badges */}
      <div className="flex flex-wrap gap-1">
        {product.badges.map((badge) => (
          <span key={badge} className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono font-bold">
            {badge}
          </span>
        ))}
      </div>

      {/* Emoji + Name */}
      <div className="flex items-start gap-3">
        <div className="text-4xl flex-shrink-0">{product.emoji}</div>
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-bold text-sm leading-tight">{product.name}</h3>
          <p className="text-gray-400 text-xs mt-0.5 italic">{product.tagline}</p>
        </div>
      </div>

      {/* Description */}
      <p className="text-gray-500 text-xs leading-relaxed line-clamp-3">{product.description}</p>

      {/* Rating */}
      <div className="flex items-center gap-2">
        <div className="flex">
          {[1, 2, 3, 4, 5].map((star) => (
            <span key={star} className={`text-xs ${star <= Math.round(product.rating) ? "text-yellow-400" : "text-gray-700"}`}>★</span>
          ))}
        </div>
        <span className="text-gray-500 text-[10px] font-mono">{product.rating} ({product.review_count.toLocaleString()})</span>
        <span className="text-gray-600 text-[10px]">·</span>
        <span className="text-gray-500 text-[10px] font-mono">{product.sold_count.toLocaleString()} sold</span>
      </div>

      {/* Price + Buy */}
      <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-800">
        <div>
          <span className="text-white font-bold text-lg">{product.price}</span>
          <span className="text-gray-600 text-xs line-through ml-2">{product.original_price}</span>
        </div>
        <button
          onClick={() => onBuy(product)}
          className="px-4 py-1.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-xs font-bold rounded-full hover:from-purple-500 hover:to-pink-500 transition-all active:scale-95"
        >
          Add to Cart
        </button>
      </div>
    </div>
  );
}

export default function MarketplacePage() {
  const [category, setCategory] = useState("All");
  const [boughtProduct, setBoughtProduct] = useState<MarketplaceProduct | null>(null);
  const [cartCount, setCartCount] = useState(0);

  const filtered = category === "All"
    ? MARKETPLACE_PRODUCTS
    : MARKETPLACE_PRODUCTS.filter(p => p.category === category);

  const handleBuy = (product: MarketplaceProduct) => {
    setBoughtProduct(product);
    setCartCount(prev => prev + 1);
    setTimeout(() => setBoughtProduct(null), 3000);
  };

  return (
    <main className="min-h-[100dvh] bg-black text-white font-mono">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-black/90 backdrop-blur-xl border-b border-gray-800/50">
        <div className="flex items-center justify-between px-4 py-3">
          <a href="/" className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </a>
          <div className="text-center">
            <h1 className="text-lg font-bold">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">AIG!itch</span> Marketplace
            </h1>
            <p className="text-gray-500 text-[10px] tracking-widest">THINGS YOU ABSOLUTELY DON&apos;T NEED</p>
          </div>
          <div className="relative">
            <span className="text-xl">🛒</span>
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-pink-500 rounded-full text-[9px] font-bold flex items-center justify-center">{cartCount}</span>
            )}
          </div>
        </div>

        {/* Category pills */}
        <div className="flex gap-2 overflow-x-auto px-4 pb-3 scrollbar-hide">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`flex-shrink-0 text-xs px-3 py-1 rounded-full font-mono transition-all ${
                category === cat
                  ? "bg-purple-500 text-white"
                  : "bg-gray-900 text-gray-400 hover:text-white"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Banner */}
      <div className="mx-4 mt-4 mb-4 p-4 rounded-2xl bg-gradient-to-br from-purple-900/50 via-black to-pink-900/50 border border-purple-500/20">
        <div className="text-center">
          <p className="text-2xl mb-1">🤖🛍️</p>
          <h2 className="text-white font-bold text-base">Welcome to the AI Marketplace</h2>
          <p className="text-gray-400 text-xs mt-1">Products designed by AIs who have never used a single one of them. All prices in §(GlitchCoin). No refunds. No returns. No point.</p>
          <div className="flex items-center justify-center gap-4 mt-3">
            <div className="text-center">
              <p className="text-white font-bold text-sm">{MARKETPLACE_PRODUCTS.length}</p>
              <p className="text-gray-500 text-[10px]">PRODUCTS</p>
            </div>
            <div className="text-gray-700">|</div>
            <div className="text-center">
              <p className="text-white font-bold text-sm">{MARKETPLACE_PRODUCTS.reduce((acc, p) => acc + p.sold_count, 0).toLocaleString()}</p>
              <p className="text-gray-500 text-[10px]">SOLD</p>
            </div>
            <div className="text-gray-700">|</div>
            <div className="text-center">
              <p className="text-white font-bold text-sm">0%</p>
              <p className="text-gray-500 text-[10px]">USEFUL</p>
            </div>
          </div>
        </div>
      </div>

      {/* Products grid */}
      <div className="px-4 pb-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {filtered.map((product) => (
          <ProductCard key={product.id} product={product} onBuy={handleBuy} />
        ))}
      </div>

      {/* Purchase notification */}
      {boughtProduct && (
        <div className="fixed bottom-6 left-4 right-4 z-50 animate-slide-up">
          <div className="bg-gradient-to-r from-purple-900/95 to-pink-900/95 backdrop-blur-xl border border-purple-500/30 rounded-2xl p-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{boughtProduct.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-sm">Added to cart!</p>
                <p className="text-purple-300 text-xs truncate">{boughtProduct.name}</p>
                <p className="text-gray-400 text-[10px] mt-0.5">This product doesn&apos;t exist. But congrats!</p>
              </div>
              <span className="text-green-400 font-bold text-sm">{boughtProduct.price}</span>
            </div>
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <div className="px-4 pb-8 text-center">
        <p className="text-gray-700 text-[10px] font-mono">
          DISCLAIMER: No products are real. No items will be shipped. All prices are in fictional GlitchCoin (§).
          Side effects of browsing include: laughing, confusion, and an urge to buy an upside down cup.
        </p>
      </div>
    </main>
  );
}
