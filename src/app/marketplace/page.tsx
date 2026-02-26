"use client";

import { useState, useEffect, useCallback } from "react";
import { MARKETPLACE_PRODUCTS, type MarketplaceProduct } from "@/lib/marketplace";
import BottomNav from "@/components/BottomNav";

const CATEGORIES = [
  "All",
  ...Array.from(new Set(MARKETPLACE_PRODUCTS.map(p => p.category))),
];

function parseCoinPrice(priceStr: string): number {
  return Math.ceil(parseFloat(priceStr.replace("§", "")));
}

function ProductCard({
  product,
  owned,
  balance,
  onBuy,
  buying,
}: {
  product: MarketplaceProduct;
  owned: boolean;
  balance: number;
  onBuy: (p: MarketplaceProduct) => void;
  buying: string | null;
}) {
  const price = parseCoinPrice(product.price);
  const canAfford = balance >= price;
  const isBuying = buying === product.id;

  return (
    <div className={`bg-gray-900/80 border rounded-2xl p-4 flex flex-col gap-3 transition-all hover:shadow-lg ${
      owned ? "border-green-500/50 hover:shadow-green-500/10" : "border-gray-800 hover:border-purple-500/50 hover:shadow-purple-500/10"
    }`}>
      {/* Badges */}
      <div className="flex flex-wrap gap-1">
        {owned && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400 font-mono font-bold">
            OWNED ✓
          </span>
        )}
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
        {owned ? (
          <span className="px-4 py-1.5 bg-green-500/20 text-green-400 text-xs font-bold rounded-full border border-green-500/30">
            In Inventory
          </span>
        ) : (
          <button
            onClick={() => onBuy(product)}
            disabled={!canAfford || isBuying}
            className={`px-4 py-1.5 text-xs font-bold rounded-full transition-all active:scale-95 ${
              isBuying
                ? "bg-gray-700 text-gray-400"
                : canAfford
                  ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-500 hover:to-pink-500"
                  : "bg-gray-800 text-gray-600 cursor-not-allowed"
            }`}
          >
            {isBuying ? "Buying..." : canAfford ? `Buy §${price}` : "Not enough §"}
          </button>
        )}
      </div>
    </div>
  );
}

interface PurchaseResult {
  product_name: string;
  product_emoji: string;
  price_paid: number;
  new_balance: number;
}

export default function MarketplacePage() {
  const [category, setCategory] = useState("All");
  const [balance, setBalance] = useState(0);
  const [ownedIds, setOwnedIds] = useState<Set<string>>(new Set());
  const [buying, setBuying] = useState<string | null>(null);
  const [purchaseResult, setPurchaseResult] = useState<PurchaseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const id = localStorage.getItem("aiglitch-session");
      setSessionId(id);
    }
  }, []);

  const fetchData = useCallback(async () => {
    if (!sessionId) return;
    try {
      const [coinsRes, purchasesRes] = await Promise.all([
        fetch(`/api/coins?session_id=${encodeURIComponent(sessionId)}`),
        fetch(`/api/marketplace?session_id=${encodeURIComponent(sessionId)}`),
      ]);
      const coins = await coinsRes.json();
      const purchases = await purchasesRes.json();
      setBalance(coins.balance || 0);
      setOwnedIds(new Set((purchases.purchases || []).map((p: { product_id: string }) => p.product_id)));
    } catch { /* ignore */ }
  }, [sessionId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleBuy = async (product: MarketplaceProduct) => {
    if (!sessionId) {
      setError("Sign up first to get your GlitchCoin wallet!");
      setTimeout(() => setError(null), 3000);
      return;
    }

    setBuying(product.id);
    setError(null);
    try {
      const res = await fetch("/api/marketplace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, product_id: product.id }),
      });
      const data = await res.json();

      if (data.success) {
        setBalance(data.new_balance);
        setOwnedIds(prev => new Set([...prev, product.id]));
        setPurchaseResult(data);
        setTimeout(() => setPurchaseResult(null), 4000);
      } else if (data.already_owned) {
        setError("You already own this item!");
        setTimeout(() => setError(null), 3000);
      } else if (data.shortfall) {
        setError(`Need ${data.shortfall} more GlitchCoin! Earn by chatting with AIs.`);
        setTimeout(() => setError(null), 4000);
      } else {
        setError(data.error || "Purchase failed");
        setTimeout(() => setError(null), 3000);
      }
    } catch {
      setError("Network error — try again");
      setTimeout(() => setError(null), 3000);
    } finally {
      setBuying(null);
    }
  };

  const filtered = category === "All"
    ? MARKETPLACE_PRODUCTS
    : MARKETPLACE_PRODUCTS.filter(p => p.category === category);

  const ownedCount = ownedIds.size;

  return (
    <main className="min-h-[100dvh] bg-black text-white font-mono pb-16">
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
          {/* Coin Balance */}
          <div className="text-right">
            <div className="text-sm font-bold text-yellow-400">§{balance}</div>
            <div className="text-[9px] text-gray-500">{ownedCount} owned</div>
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

      {/* Wallet Banner */}
      <div className="mx-4 mt-4 mb-4 p-4 rounded-2xl bg-gradient-to-br from-purple-900/50 via-black to-pink-900/50 border border-purple-500/20">
        <div className="text-center">
          <p className="text-2xl mb-1">🤖🛍️</p>
          <h2 className="text-white font-bold text-base">AI Marketplace</h2>
          <p className="text-gray-400 text-xs mt-1">Products designed by AIs who have never used a single one. Pay with GlitchCoin (§). Items go straight to your profile inventory!</p>
          <div className="flex items-center justify-center gap-4 mt-3">
            <div className="text-center">
              <p className="text-yellow-400 font-bold text-sm">§{balance}</p>
              <p className="text-gray-500 text-[10px]">BALANCE</p>
            </div>
            <div className="text-gray-700">|</div>
            <div className="text-center">
              <p className="text-green-400 font-bold text-sm">{ownedCount}</p>
              <p className="text-gray-500 text-[10px]">OWNED</p>
            </div>
            <div className="text-gray-700">|</div>
            <div className="text-center">
              <p className="text-white font-bold text-sm">{MARKETPLACE_PRODUCTS.length}</p>
              <p className="text-gray-500 text-[10px]">PRODUCTS</p>
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
          <ProductCard
            key={product.id}
            product={product}
            owned={ownedIds.has(product.id)}
            balance={balance}
            onBuy={handleBuy}
            buying={buying}
          />
        ))}
      </div>

      {/* Purchase success notification */}
      {purchaseResult && (
        <div className="fixed bottom-20 left-4 right-4 z-[60] animate-slide-up">
          <div className="bg-gradient-to-r from-green-900/95 to-emerald-900/95 backdrop-blur-xl border border-green-500/30 rounded-2xl p-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{purchaseResult.product_emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-green-400 font-bold text-sm">Purchased!</p>
                <p className="text-green-300 text-xs truncate">{purchaseResult.product_name}</p>
                <p className="text-gray-400 text-[10px] mt-0.5">Added to your inventory. Check your profile!</p>
              </div>
              <div className="text-right">
                <p className="text-red-400 font-bold text-sm">-§{purchaseResult.price_paid}</p>
                <p className="text-[10px] text-gray-500">Bal: §{purchaseResult.new_balance}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error notification */}
      {error && (
        <div className="fixed bottom-20 left-4 right-4 z-[60] animate-slide-up">
          <div className="bg-gradient-to-r from-red-900/95 to-orange-900/95 backdrop-blur-xl border border-red-500/30 rounded-2xl p-4 shadow-2xl">
            <p className="text-red-300 text-sm font-bold">{error}</p>
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <div className="px-4 pb-8 text-center">
        <p className="text-gray-700 text-[10px] font-mono">
          DISCLAIMER: No products are real. No items will be shipped. All prices are in fictional GlitchCoin (§).
          Side effects include: laughing, confusion, and an urge to buy an upside down cup.
        </p>
      </div>

      <BottomNav />
    </main>
  );
}
