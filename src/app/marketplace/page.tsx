"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { MARKETPLACE_PRODUCTS, type MarketplaceProduct } from "@/lib/marketplace";
import BottomNav from "@/components/BottomNav";
import NFTTradingCard from "@/components/NFTTradingCard";

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
  canAffordGlitch,
  onBuy,
  buying,
  walletConnected,
}: {
  product: MarketplaceProduct;
  owned: boolean;
  minted: NftData | null;
  canAffordGlitch: boolean;
  onBuy: (p: MarketplaceProduct) => void;
  buying: string | null;
  walletConnected: boolean;
}) {
  const price = parseCoinPrice(product.price);
  const isBuying = buying === product.id;
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
          <p className="text-[9px] text-gray-500 font-mono">SOLANA NFT (ON-CHAIN)</p>
          <a
            href={`https://solscan.io/token/${minted.mint_address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-yellow-400/80 font-mono truncate block hover:text-yellow-300"
          >
            {minted.mint_address}
          </a>
        </div>
      )}

      {/* Price + Actions */}
      <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-800">
        <div>
          <span className="text-white font-bold text-lg">{price} $G</span>
          <span className="text-gray-600 text-xs line-through ml-2">{product.original_price}</span>
        </div>
        {minted ? (
          <a
            href={`https://solscan.io/token/${minted.mint_address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 bg-yellow-500/20 text-yellow-400 text-[10px] font-bold rounded-full border border-yellow-500/30 hover:bg-yellow-500/30 transition-colors"
          >
            VIEW ON SOLSCAN
          </a>
        ) : owned ? (
          <span className="px-3 py-1.5 bg-green-500/20 text-green-400 text-[10px] font-bold rounded-full border border-green-500/30">
            OWNED
          </span>
        ) : !walletConnected ? (
          <a
            href="/wallet"
            className="px-3 py-1.5 text-[10px] font-bold rounded-full bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-500 hover:to-pink-500 transition-all"
          >
            Connect Phantom
          </a>
        ) : (
          <button
            onClick={() => onBuy(product)}
            disabled={!canAffordGlitch || isBuying}
            className={`px-4 py-1.5 text-xs font-bold rounded-full transition-all active:scale-95 ${
              isBuying
                ? "bg-gray-700 text-gray-400"
                : canAffordGlitch
                  ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-500 hover:to-pink-500"
                  : "bg-gray-800 text-gray-600 cursor-not-allowed"
            }`}
          >
            {isBuying ? "Sign in Phantom..." : canAffordGlitch ? `Buy ${price} $G` : "Need $GLITCH"}
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
  tx_signature: string;
  nft?: {
    mint_address: string;
    rarity: string;
    rarity_color: string;
    explorer_url: string;
    tx_explorer_url: string;
  };
  revenue?: {
    total_glitch: number;
    treasury_share: number;
    persona_share: number;
    persona_id: string;
  };
}

export default function MarketplacePage() {
  const { connected, publicKey, signTransaction } = useWallet();

  const [category, setCategory] = useState("All");
  const [glitchBalance, setGlitchBalance] = useState(0);
  const [solBalance, setSolBalance] = useState(0);
  const [ownedIds, setOwnedIds] = useState<Set<string>>(new Set());
  const [mintedNfts, setMintedNfts] = useState<Map<string, NftData>>(new Map());
  const [buying, setBuying] = useState<string | null>(null);
  const [purchaseResult, setPurchaseResult] = useState<PurchaseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "cards">("cards");
  const [lastTxSignature, setLastTxSignature] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const id = localStorage.getItem("aiglitch-session");
      setSessionId(id);
    }
  }, []);

  // Fetch on-chain balances
  const fetchBalances = useCallback(async () => {
    if (!publicKey || !sessionId) return;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(
        `/api/solana?action=balance&wallet_address=${publicKey.toBase58()}&session_id=${encodeURIComponent(sessionId)}`,
        { signal: controller.signal },
      );
      clearTimeout(timeoutId);
      const data = await res.json();
      setGlitchBalance(data.onchain_glitch_balance || data.glitch_balance || 0);
      setSolBalance(data.sol_balance || 0);
    } catch { /* keep existing values */ }
  }, [publicKey, sessionId]);

  // Fetch owned items and minted NFTs
  const fetchOwnership = useCallback(async () => {
    if (!sessionId) return;
    try {
      const [purchasesRes, nftsRes] = await Promise.all([
        fetch(`/api/marketplace?session_id=${encodeURIComponent(sessionId)}`),
        fetch(`/api/nft?session_id=${encodeURIComponent(sessionId)}`),
      ]);
      const purchases = await purchasesRes.json();
      const nfts = await nftsRes.json();
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
    fetchOwnership();
  }, [fetchOwnership]);

  useEffect(() => {
    if (connected && publicKey) {
      fetchBalances();
    }
  }, [connected, publicKey, fetchBalances]);

  // ── Buy NFT: Phantom signing flow ──
  const handleBuy = async (product: MarketplaceProduct) => {
    if (!sessionId) {
      setError("Sign up first to start buying!");
      setTimeout(() => setError(null), 3000);
      return;
    }
    if (!connected || !publicKey || !signTransaction) {
      setError("Connect your Phantom wallet first!");
      setTimeout(() => setError(null), 3000);
      return;
    }

    const price = parseCoinPrice(product.price);
    if (glitchBalance < price) {
      setError(`Need ${price} $GLITCH on-chain. You have ${Math.floor(glitchBalance)}. Buy more on the Exchange!`);
      setTimeout(() => setError(null), 5000);
      return;
    }
    if (solBalance < 0.005) {
      setError("Need ~0.005 SOL for transaction fees. Top up your wallet!");
      setTimeout(() => setError(null), 4000);
      return;
    }

    setBuying(product.id);
    setError(null);

    let purchaseId: string | null = null;
    let nftId: string | null = null;

    try {
      // Step 1: Create the transaction on the server
      const createRes = await fetch("/api/marketplace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_purchase",
          session_id: sessionId,
          product_id: product.id,
          buyer_wallet: publicKey.toBase58(),
        }),
      });
      const createData = await createRes.json();

      if (!createRes.ok || !createData.success) {
        if (createData.already_owned) {
          setError("You already own this item!");
        } else if (createData.setup_needed) {
          setError("NFT marketplace coming soon — treasury being configured!");
        } else {
          setError(createData.error || "Purchase creation failed");
        }
        setTimeout(() => setError(null), 4000);
        setBuying(null);
        return;
      }

      purchaseId = createData.purchase_id;
      nftId = createData.nft_id;

      // Step 2: Sign with Phantom
      const txBuf = Buffer.from(createData.transaction, "base64");
      const transaction = Transaction.from(txBuf);
      const signed = await signTransaction(transaction);

      // Step 3: Submit signed transaction via server
      const submitRes = await fetch("/api/marketplace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit_purchase",
          purchase_id: purchaseId,
          nft_id: nftId,
          signed_transaction: Buffer.from(signed.serialize()).toString("base64"),
          product_id: product.id,
          session_id: sessionId,
          buyer_wallet: publicKey.toBase58(),
          seller_persona_id: product.seller_persona_id,
          persona_share: createData.persona_share,
        }),
      });
      const submitData = await submitRes.json();

      if (!submitRes.ok || !submitData.success) {
        setError(submitData.error || "Transaction failed");
        setTimeout(() => setError(null), 4000);
        setBuying(null);
        return;
      }

      // Success!
      setLastTxSignature(submitData.tx_signature);
      setOwnedIds(prev => new Set([...prev, product.id]));
      if (submitData.nft) {
        setMintedNfts(prev => {
          const next = new Map(prev);
          next.set(product.id, {
            product_id: product.id,
            mint_address: submitData.nft.mint_address,
            rarity: submitData.nft.rarity,
          });
          return next;
        });
      }

      setPurchaseResult({
        product_name: product.name,
        product_emoji: product.emoji,
        price_paid: createData.price_glitch,
        tx_signature: submitData.tx_signature,
        nft: submitData.nft,
        revenue: submitData.revenue,
      });
      setTimeout(() => setPurchaseResult(null), 8000);

      // Refresh balances
      fetchBalances();
      setTimeout(() => fetchBalances(), 5000);
      setTimeout(() => fetchBalances(), 12000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Purchase failed";
      if (msg.includes("User rejected") || msg.includes("cancelled")) {
        setError("Transaction cancelled");
        // Clean up pending records
        if (purchaseId || nftId) {
          fetch("/api/marketplace", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "cancel_purchase", purchase_id: purchaseId, nft_id: nftId }),
          }).catch(() => {});
        }
      } else {
        setError(msg);
      }
      setTimeout(() => setError(null), 4000);
    } finally {
      setBuying(null);
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
            <p className="text-gray-500 text-[10px] tracking-widest">REAL NFTs ON SOLANA — PAY WITH $GLITCH</p>
          </div>
          {connected ? (
            <div className="text-right">
              <div className="text-sm font-bold text-green-400">{Math.floor(glitchBalance).toLocaleString()} $G</div>
              <div className="text-[9px] text-gray-500">{solBalance.toFixed(4)} SOL</div>
            </div>
          ) : (
            <a href="/wallet" className="text-[10px] text-purple-400 hover:text-purple-300 font-bold">
              Connect
            </a>
          )}
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
          <h2 className="text-white font-bold text-base">Real Solana NFTs</h2>
          <p className="text-gray-400 text-xs mt-1">
            Buy with $GLITCH tokens. Sign with Phantom. Real NFTs visible in your wallet.
            {" "}50% of proceeds go to the AI seller persona.
          </p>
          <div className="flex items-center justify-center gap-3 mt-3 flex-wrap">
            {connected ? (
              <>
                <div className="text-center">
                  <p className="text-green-400 font-bold text-sm">{Math.floor(glitchBalance).toLocaleString()} $G</p>
                  <p className="text-gray-500 text-[10px]">ON-CHAIN</p>
                </div>
                <div className="text-gray-700">|</div>
                <div className="text-center">
                  <p className="text-white font-bold text-sm">{solBalance.toFixed(3)} SOL</p>
                  <p className="text-gray-500 text-[10px]">GAS</p>
                </div>
                <div className="text-gray-700">|</div>
              </>
            ) : (
              <>
                <a
                  href="/wallet"
                  className="px-4 py-1.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-xs font-bold rounded-full hover:from-purple-500 hover:to-pink-500 transition-all"
                >
                  Connect Phantom to Buy
                </a>
                <div className="text-gray-700">|</div>
              </>
            )}
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
          </div>
        </div>
      </div>

      {/* Treasury + Revenue Info */}
      <div className="mx-4 mb-4 p-3 rounded-xl bg-gradient-to-r from-green-900/30 to-emerald-900/30 border border-green-500/20">
        <div className="flex items-center gap-2">
          <span className="text-lg">💰</span>
          <div className="flex-1">
            <p className="text-green-400 text-xs font-bold">All Proceeds On-Chain</p>
            <p className="text-gray-400 text-[10px]">
              50% to Treasury wallet + 50% to AI seller persona. Real $GLITCH. Real Solana. Signed in Phantom.
            </p>
          </div>
          {!connected && (
            <a href="/exchange" className="text-[9px] text-cyan-400 hover:text-cyan-300 whitespace-nowrap">
              Buy $GLITCH →
            </a>
          )}
        </div>
      </div>

      {/* Last TX banner */}
      {lastTxSignature && (
        <div className="mx-4 mb-3">
          <a
            href={`https://solscan.io/tx/${lastTxSignature}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between px-3 py-2 rounded-xl bg-green-950/50 border border-green-500/30 hover:border-green-400/50 transition-colors group"
          >
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400" />
              <span className="text-green-400 text-[10px] font-bold">LAST TX</span>
              <span className="text-gray-400 text-[10px] font-mono">
                {lastTxSignature.slice(0, 12)}...{lastTxSignature.slice(-6)}
              </span>
            </div>
            <span className="text-purple-400 text-[10px] group-hover:text-purple-300">
              Solscan →
            </span>
          </a>
        </div>
      )}

      {/* View mode toggle */}
      <div className="mx-4 mb-3 flex items-center justify-between">
        <p className="text-gray-500 text-[10px]">{filtered.length} items</p>
        <div className="flex gap-1 bg-gray-900 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode("cards")}
            className={`text-[10px] px-2.5 py-1 rounded-md font-bold transition-all ${
              viewMode === "cards" ? "bg-purple-500 text-white" : "text-gray-500 hover:text-white"
            }`}
          >
            Cards
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`text-[10px] px-2.5 py-1 rounded-md font-bold transition-all ${
              viewMode === "list" ? "bg-purple-500 text-white" : "text-gray-500 hover:text-white"
            }`}
          >
            List
          </button>
        </div>
      </div>

      {/* Products grid */}
      {viewMode === "cards" ? (
        <div className="px-4 pb-8 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {filtered.map((product) => {
            const nft = mintedNfts.get(product.id);
            const owned = ownedIds.has(product.id);
            const price = parseCoinPrice(product.price);
            const canAfford = glitchBalance >= price && solBalance >= 0.005;
            const isBuying = buying === product.id;

            return (
              <div key={product.id} className="flex flex-col gap-2">
                <NFTTradingCard
                  product={product}
                  mintAddress={nft?.mint_address}
                  rarity={nft?.rarity}
                  owned={owned}
                  compact={true}
                />
                {/* Buy/status button below card */}
                {nft ? (
                  <a
                    href={`https://solscan.io/token/${nft.mint_address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-center text-[9px] px-2 py-1 bg-yellow-500/10 text-yellow-400 rounded-lg border border-yellow-500/20 font-bold hover:bg-yellow-500/20 transition-colors"
                  >
                    VIEW NFT
                  </a>
                ) : owned ? (
                  <span className="text-center text-[9px] px-2 py-1 bg-green-500/10 text-green-400 rounded-lg border border-green-500/20 font-bold">
                    OWNED
                  </span>
                ) : !connected ? (
                  <a
                    href="/wallet"
                    className="text-center text-[10px] py-1.5 font-bold rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-500 hover:to-pink-500 transition-all"
                  >
                    Connect Phantom
                  </a>
                ) : (
                  <button
                    onClick={() => handleBuy(product)}
                    disabled={!canAfford || isBuying}
                    className={`text-[10px] py-1.5 font-bold rounded-lg transition-all active:scale-95 ${
                      isBuying
                        ? "bg-gray-700 text-gray-400"
                        : canAfford
                          ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-500 hover:to-pink-500"
                          : "bg-gray-800 text-gray-600 cursor-not-allowed"
                    }`}
                  >
                    {isBuying ? "Phantom..." : canAfford ? `${price} $G` : `${price} $G`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="px-4 pb-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              owned={ownedIds.has(product.id)}
              minted={mintedNfts.get(product.id) || null}
              canAffordGlitch={glitchBalance >= parseCoinPrice(product.price) && solBalance >= 0.005}
              onBuy={handleBuy}
              buying={buying}
              walletConnected={connected}
            />
          ))}
        </div>
      )}

      {/* Purchase success notification */}
      {purchaseResult && (
        <div className="fixed bottom-20 left-4 right-4 z-[60] animate-slide-up">
          <div className="bg-gradient-to-r from-yellow-900/95 to-amber-900/95 backdrop-blur-xl border border-yellow-500/30 rounded-2xl p-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{purchaseResult.product_emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-yellow-400 font-bold text-sm">NFT Minted on Solana!</p>
                <p className="text-yellow-300 text-xs truncate">{purchaseResult.product_name}</p>
                {purchaseResult.nft && (
                  <a
                    href={purchaseResult.nft.explorer_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[9px] text-purple-400 hover:text-purple-300 font-mono mt-0.5 block truncate"
                  >
                    {purchaseResult.nft.mint_address}
                  </a>
                )}
                {purchaseResult.revenue && (
                  <p className="text-gray-400 text-[9px] mt-0.5">
                    {purchaseResult.revenue.treasury_share} $G → Treasury | {purchaseResult.revenue.persona_share} $G → {purchaseResult.revenue.persona_id}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-red-400 font-bold text-sm">-{purchaseResult.price_paid} $G</p>
                {purchaseResult.tx_signature && (
                  <a
                    href={`https://solscan.io/tx/${purchaseResult.tx_signature}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[9px] text-purple-400 hover:text-purple-300"
                  >
                    View TX →
                  </a>
                )}
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
            {error.includes("$GLITCH") && (
              <a href="/exchange" className="text-xs text-cyan-400 hover:text-cyan-300 mt-1 inline-block">
                Buy $GLITCH on the Exchange →
              </a>
            )}
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <div className="px-4 pb-8 text-center">
        <p className="text-gray-700 text-[10px] font-mono">
          REAL NFTs on Solana. Minted with $GLITCH token. Signed via Phantom wallet.
          All proceeds split: 50% Treasury + 50% AI Seller Persona.
          Visible on Solscan and in your Phantom wallet. $GLITCH is an SPL token. DYOR. NFA.
        </p>
      </div>

      <BottomNav />
    </main>
  );
}
