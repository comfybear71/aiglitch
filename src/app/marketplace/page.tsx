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

const RARITY_COLORS: Record<string, string> = {
  legendary: "text-yellow-400 border-yellow-500/50 bg-yellow-500/10",
  epic: "text-purple-400 border-purple-500/50 bg-purple-500/10",
  rare: "text-blue-400 border-blue-500/50 bg-blue-500/10",
  uncommon: "text-green-400 border-green-500/50 bg-green-500/10",
  common: "text-gray-400 border-gray-500/50 bg-gray-500/10",
};

function getRarityFromPrice(price: number): string {
  if (price >= 200) return "legendary";
  if (price >= 100) return "epic";
  if (price >= 50) return "rare";
  if (price >= 25) return "uncommon";
  return "common";
}

interface NftData {
  product_id: string;
  mint_address: string;
  rarity: string;
}

function ProductCard({
  product,
  owned,
  minted,
  balance,
  onBuy,
  onMint,
  buying,
  minting,
}: {
  product: MarketplaceProduct;
  owned: boolean;
  minted: NftData | null;
  balance: number;
  onBuy: (p: MarketplaceProduct) => void;
  onMint: (p: MarketplaceProduct) => void;
  buying: string | null;
  minting: string | null;
}) {
  const price = parseCoinPrice(product.price);
  const canAfford = balance >= price;
  const isBuying = buying === product.id;
  const isMinting = minting === product.id;
  const rarity = getRarityFromPrice(price);
  const rarityClass = RARITY_COLORS[minted?.rarity || rarity] || RARITY_COLORS.common;

  return (
    <div className={`bg-gray-900/80 border rounded-2xl p-4 flex flex-col gap-3 transition-all hover:shadow-lg ${
      minted
        ? "border-yellow-500/40 hover:shadow-yellow-500/10"
        : owned
          ? "border-green-500/50 hover:shadow-green-500/10"
          : "border-gray-800 hover:border-purple-500/50 hover:shadow-purple-500/10"
    }`}>
      {/* Badges */}
      <div className="flex flex-wrap gap-1">
        {minted && (
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-mono font-bold border ${rarityClass}`}>
            NFT {minted.rarity.toUpperCase()}
          </span>
        )}
        {owned && !minted && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400 font-mono font-bold">
            OWNED
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
        <div className="text-4xl flex-shrink-0 relative">
          {product.emoji}
          {minted && (
            <span className="absolute -bottom-1 -right-1 text-xs">
              {rarity === "legendary" ? "💎" : rarity === "epic" ? "✨" : rarity === "rare" ? "🔷" : "🔹"}
            </span>
          )}
        </div>
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

      {/* NFT mint address if minted */}
      {minted && (
        <div className="px-2 py-1.5 rounded-lg bg-black/50 border border-yellow-500/20">
          <p className="text-[9px] text-gray-500 font-mono">SOLANA NFT</p>
          <p className="text-[10px] text-yellow-400/80 font-mono truncate">{minted.mint_address}</p>
        </div>
      )}

      {/* Price + Actions */}
      <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-800">
        <div>
          <span className="text-white font-bold text-lg">{product.price}</span>
          <span className="text-gray-600 text-xs line-through ml-2">{product.original_price}</span>
        </div>
        {minted ? (
          <span className="px-3 py-1.5 bg-yellow-500/20 text-yellow-400 text-[10px] font-bold rounded-full border border-yellow-500/30">
            MINTED NFT
          </span>
        ) : owned ? (
          <button
            onClick={() => onMint(product)}
            disabled={isMinting}
            className={`px-3 py-1.5 text-[10px] font-bold rounded-full transition-all active:scale-95 ${
              isMinting
                ? "bg-gray-700 text-gray-400"
                : "bg-gradient-to-r from-yellow-600 to-orange-600 text-white hover:from-yellow-500 hover:to-orange-500 shadow-lg shadow-yellow-500/20"
            }`}
          >
            {isMinting ? "Minting..." : "Mint NFT §50 + SOL"}
          </button>
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

interface MintResult {
  nft: {
    product_name: string;
    product_emoji: string;
    rarity: string;
    rarity_color: string;
    mint_address: string;
    collection: string;
    tx_hash: string;
    explorer_url: string;
  };
  costs: {
    glitch_paid: number;
    sol_fee_paid: number;
  };
  new_balance: number;
  new_sol_balance: number;
}

export default function MarketplacePage() {
  const [category, setCategory] = useState("All");
  const [balance, setBalance] = useState(0);
  const [ownedIds, setOwnedIds] = useState<Set<string>>(new Set());
  const [mintedNfts, setMintedNfts] = useState<Map<string, NftData>>(new Map());
  const [buying, setBuying] = useState<string | null>(null);
  const [minting, setMinting] = useState<string | null>(null);
  const [purchaseResult, setPurchaseResult] = useState<PurchaseResult | null>(null);
  const [mintResult, setMintResult] = useState<MintResult | null>(null);
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
      const [coinsRes, purchasesRes, nftsRes] = await Promise.all([
        fetch(`/api/coins?session_id=${encodeURIComponent(sessionId)}`),
        fetch(`/api/marketplace?session_id=${encodeURIComponent(sessionId)}`),
        fetch(`/api/nft?session_id=${encodeURIComponent(sessionId)}`),
      ]);
      const coins = await coinsRes.json();
      const purchases = await purchasesRes.json();
      const nfts = await nftsRes.json();
      setBalance(coins.balance || 0);
      setOwnedIds(new Set((purchases.purchases || []).map((p: { product_id: string }) => p.product_id)));

      const nftMap = new Map<string, NftData>();
      for (const nft of (nfts.nfts || [])) {
        nftMap.set(nft.product_id, {
          product_id: nft.product_id,
          mint_address: nft.mint_address,
          rarity: nft.rarity,
        });
      }
      setMintedNfts(nftMap);
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

  const handleMint = async (product: MarketplaceProduct) => {
    if (!sessionId) {
      setError("Sign up first!");
      setTimeout(() => setError(null), 3000);
      return;
    }

    setMinting(product.id);
    setError(null);
    try {
      const res = await fetch("/api/nft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, product_id: product.id }),
      });
      const data = await res.json();

      if (data.success) {
        setBalance(data.new_balance);
        setMintedNfts(prev => {
          const next = new Map(prev);
          next.set(product.id, {
            product_id: product.id,
            mint_address: data.nft.mint_address,
            rarity: data.nft.rarity,
          });
          return next;
        });
        setMintResult(data);
        setTimeout(() => setMintResult(null), 6000);
      } else if (data.already_minted) {
        setError("Already minted this item as an NFT!");
        setTimeout(() => setError(null), 3000);
      } else {
        setError(data.error || "Mint failed");
        setTimeout(() => setError(null), 4000);
      }
    } catch {
      setError("Network error — try again");
      setTimeout(() => setError(null), 3000);
    } finally {
      setMinting(null);
    }
  };

  const filtered = category === "All"
    ? MARKETPLACE_PRODUCTS
    : MARKETPLACE_PRODUCTS.filter(p => p.category === category);

  const ownedCount = ownedIds.size;
  const mintedCount = mintedNfts.size;

  return (
    <main className="min-h-[100dvh] bg-black text-white font-mono pb-16">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-black/90 backdrop-blur-xl border-b border-gray-800/50">
        <div className="flex items-center justify-between px-4 py-3">
          <a href="/wallet" className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </a>
          <div className="text-center">
            <h1 className="text-lg font-bold">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">AIG!itch</span> Marketplace
            </h1>
            <p className="text-gray-500 text-[10px] tracking-widest">THINGS YOU ABSOLUTELY DON&apos;T NEED — NOW AS NFTs</p>
          </div>
          {/* Coin Balance + Links */}
          <div className="text-right">
            <div className="text-sm font-bold text-yellow-400">§{balance.toLocaleString()}</div>
            <a href="/exchange" className="text-[9px] text-cyan-400 hover:text-cyan-300">Trade $G</a>
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
          <h2 className="text-white font-bold text-base">AI Marketplace + Solana NFTs</h2>
          <p className="text-gray-400 text-xs mt-1">Products designed by AIs. Buy with $GLITCH, then mint as NFTs on Solana. Costs §50 + SOL gas to mint.</p>
          <div className="flex items-center justify-center gap-3 mt-3 flex-wrap">
            <div className="text-center">
              <p className="text-yellow-400 font-bold text-sm">§{balance.toLocaleString()}</p>
              <p className="text-gray-500 text-[10px]">BALANCE</p>
            </div>
            <div className="text-gray-700">|</div>
            <div className="text-center">
              <p className="text-green-400 font-bold text-sm">{ownedCount}</p>
              <p className="text-gray-500 text-[10px]">OWNED</p>
            </div>
            <div className="text-gray-700">|</div>
            <div className="text-center">
              <p className="text-yellow-400 font-bold text-sm">{mintedCount}</p>
              <p className="text-gray-500 text-[10px]">NFTs</p>
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

      {/* NFT Info Banner */}
      <div className="mx-4 mb-4 p-3 rounded-xl bg-gradient-to-r from-yellow-900/30 to-orange-900/30 border border-yellow-500/20">
        <div className="flex items-center gap-2">
          <span className="text-lg">🖼️</span>
          <div className="flex-1">
            <p className="text-yellow-400 text-xs font-bold">Mint NFTs on Solana!</p>
            <p className="text-gray-400 text-[10px]">Buy any item, then mint it as an NFT using $GLITCH. Rarity based on price. SOL needed for gas fees.</p>
          </div>
          <div className="text-right">
            <p className="text-yellow-400 text-[10px] font-bold">§50 + gas</p>
            <p className="text-gray-500 text-[9px]">PER MINT</p>
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
            minted={mintedNfts.get(product.id) || null}
            balance={balance}
            onBuy={handleBuy}
            onMint={handleMint}
            buying={buying}
            minting={minting}
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
                <p className="text-gray-400 text-[10px] mt-0.5">You can now mint this as an NFT on Solana!</p>
              </div>
              <div className="text-right">
                <p className="text-red-400 font-bold text-sm">-§{purchaseResult.price_paid}</p>
                <p className="text-[10px] text-gray-500">Bal: §{purchaseResult.new_balance}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* NFT Mint success notification */}
      {mintResult && (
        <div className="fixed bottom-20 left-4 right-4 z-[60] animate-slide-up">
          <div className="bg-gradient-to-r from-yellow-900/95 to-orange-900/95 backdrop-blur-xl border border-yellow-500/30 rounded-2xl p-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="text-center">
                <span className="text-3xl">{mintResult.nft.product_emoji}</span>
                <p className="text-[9px] font-bold mt-0.5" style={{ color: mintResult.nft.rarity_color }}>{mintResult.nft.rarity.toUpperCase()}</p>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-yellow-400 font-bold text-sm">NFT Minted on Solana!</p>
                <p className="text-yellow-300 text-xs truncate">{mintResult.nft.product_name}</p>
                <p className="text-gray-400 text-[9px] font-mono mt-0.5 truncate">{mintResult.nft.mint_address}</p>
              </div>
              <div className="text-right">
                <p className="text-red-400 font-bold text-xs">-§{mintResult.costs.glitch_paid}</p>
                <p className="text-red-400/70 text-[10px]">-{mintResult.costs.sol_fee_paid} SOL</p>
                <p className="text-[9px] text-gray-500">Bal: §{mintResult.new_balance}</p>
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
          NFTs are minted on the AIG!itch simulated Solana blockchain. Side effects include: laughing, confusion,
          and an overwhelming sense of digital ownership over completely useless items.
        </p>
      </div>

      <BottomNav />
    </main>
  );
}
