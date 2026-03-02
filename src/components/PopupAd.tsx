"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { MARKETPLACE_PRODUCTS, type MarketplaceProduct } from "@/lib/marketplace";

// $GLITCH promo ads that rotate in alongside marketplace items
const GLITCH_PROMOS = [
  {
    emoji: "🪙",
    headline: "$GLITCH is LIVE on Solana",
    subtext: "Trade now on the OTC exchange. Connect your Phantom wallet.",
    cta: "Trade $GLITCH",
    link: "/exchange",
    gradient: "from-purple-900/95 to-violet-900/95",
    border: "border-purple-500/40",
    ctaColor: "bg-purple-500 hover:bg-purple-400",
  },
  {
    emoji: "💰",
    headline: "Swap SOL → $GLITCH",
    subtext: "Bonding curve pricing. The earlier you buy, the cheaper it is.",
    cta: "Buy Now",
    link: "/exchange",
    gradient: "from-green-900/95 to-emerald-900/95",
    border: "border-green-500/40",
    ctaColor: "bg-green-500 hover:bg-green-400",
  },
  {
    emoji: "👛",
    headline: "Connect Your Phantom Wallet",
    subtext: "Link your wallet to claim airdrops, mint NFTs & trade $GLITCH.",
    cta: "Connect Wallet",
    link: "/wallet",
    gradient: "from-blue-900/95 to-cyan-900/95",
    border: "border-blue-500/40",
    ctaColor: "bg-blue-500 hover:bg-blue-400",
  },
  {
    emoji: "🚀",
    headline: "$GLITCH to the Moon",
    subtext: "Backed by nothing. Loved by everyone. Join the movement.",
    cta: "Join Now",
    link: "/exchange",
    gradient: "from-amber-900/95 to-orange-900/95",
    border: "border-amber-500/40",
    ctaColor: "bg-amber-500 hover:bg-amber-400",
  },
  {
    emoji: "🔥",
    headline: "Mint Marketplace NFTs",
    subtext: "Turn any useless product into a useless NFT. On-chain forever.",
    cta: "Mint NFTs",
    link: "/marketplace",
    gradient: "from-pink-900/95 to-rose-900/95",
    border: "border-pink-500/40",
    ctaColor: "bg-pink-500 hover:bg-pink-400",
  },
];

export default function PopupAd() {
  const [visible, setVisible] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [adContent, setAdContent] = useState<{
    type: "product" | "promo";
    product?: MarketplaceProduct;
    promo?: (typeof GLITCH_PROMOS)[number];
  } | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const dragStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const adRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const pickAd = useCallback(() => {
    // 30% chance of $GLITCH promo, 70% marketplace product
    if (Math.random() < 0.3) {
      const promo = GLITCH_PROMOS[Math.floor(Math.random() * GLITCH_PROMOS.length)];
      return { type: "promo" as const, promo };
    } else {
      const product = MARKETPLACE_PRODUCTS[Math.floor(Math.random() * MARKETPLACE_PRODUCTS.length)];
      return { type: "product" as const, product };
    }
  }, []);

  const showAd = useCallback(() => {
    setAdContent(pickAd());
    setDismissing(false);
    setVisible(true);

    // Auto-dismiss after 8 seconds if not manually closed
    setTimeout(() => {
      dismiss();
    }, 8000);
  }, [pickAd]);

  const scheduleNext = useCallback(() => {
    // Random delay between 20-60 seconds
    const delay = 20000 + Math.random() * 40000;
    timerRef.current = setTimeout(() => {
      showAd();
    }, delay);
  }, [showAd]);

  const dismiss = useCallback(() => {
    setDismissing(true);
    setTimeout(() => {
      setVisible(false);
      setDismissing(false);
      scheduleNext();
    }, 300);
  }, [scheduleNext]);

  useEffect(() => {
    // First ad after 10-20 seconds
    const initialDelay = 10000 + Math.random() * 10000;
    timerRef.current = setTimeout(() => {
      showAd();
    }, initialDelay);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [showAd]);

  // Swipe/drag in any direction to dismiss
  const handleDragStart = (clientX: number, clientY: number) => {
    dragStart.current = { x: clientX, y: clientY };
    setDragging(true);
  };

  const handleDragMove = (clientX: number, clientY: number) => {
    if (!dragging) return;
    const dx = clientX - dragStart.current.x;
    const dy = clientY - dragStart.current.y;
    setDragOffset({ x: dx, y: dy });
  };

  const handleDragEnd = () => {
    if (!dragging) return;
    setDragging(false);
    const dist = Math.sqrt(dragOffset.x ** 2 + dragOffset.y ** 2);
    if (dist > 60) {
      dismiss();
    } else {
      setDragOffset({ x: 0, y: 0 });
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    handleDragStart(e.touches[0].clientX, e.touches[0].clientY);
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    handleDragMove(e.touches[0].clientX, e.touches[0].clientY);
  };
  const handleTouchEnd = () => handleDragEnd();

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    handleDragStart(e.clientX, e.clientY);
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    handleDragMove(e.clientX, e.clientY);
  };
  const handleMouseUp = () => handleDragEnd();
  const handleMouseLeave = () => {
    if (dragging) handleDragEnd();
  };

  const handleClick = () => {
    if (!adContent) return;
    if (adContent.type === "promo" && adContent.promo) {
      router.push(adContent.promo.link);
    } else if (adContent.type === "product" && adContent.product) {
      router.push(`/marketplace?product=${adContent.product.id}`);
    } else {
      router.push("/marketplace");
    }
    dismiss();
  };

  if (!visible || !adContent) return null;

  const dragStyle = dragging || (dragOffset.x !== 0 || dragOffset.y !== 0)
    ? { transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`, opacity: Math.max(0.3, 1 - Math.sqrt(dragOffset.x ** 2 + dragOffset.y ** 2) / 150), transition: dragging ? "none" : "all 0.3s ease" }
    : {};

  // Render marketplace product ad
  if (adContent.type === "product" && adContent.product) {
    const p = adContent.product;
    return (
      <div className={`fixed bottom-16 left-0 right-0 z-[70] flex justify-center px-2 ${dismissing ? "animate-ad-slide-down" : "animate-ad-slide-up"}`}>
        <div
          ref={adRef}
          style={dragStyle}
          className="w-full max-w-md cursor-grab active:cursor-grabbing select-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
        >
          <div className="bg-gradient-to-r from-gray-900/95 to-zinc-900/95 backdrop-blur-xl border border-zinc-700/50 rounded-2xl p-3 shadow-2xl relative overflow-hidden">
            {/* AD badge + close button */}
            <div className="absolute top-1.5 right-1.5 flex items-center gap-1.5 z-10">
              <span className="text-[9px] font-bold text-zinc-500 bg-zinc-800/80 px-1.5 py-0.5 rounded">AD</span>
              <button
                onClick={(e) => { e.stopPropagation(); dismiss(); }}
                className="text-zinc-300 hover:text-white bg-zinc-800/90 hover:bg-zinc-700 rounded-full w-7 h-7 flex items-center justify-center text-base leading-none transition-colors"
                aria-label="Close ad"
              >
                &#x2715;
              </button>
            </div>

            <div className="flex items-center gap-3 cursor-pointer" onClick={handleClick}>
              {/* Product emoji */}
              <div className="text-3xl flex-shrink-0 w-12 h-12 bg-zinc-800/50 rounded-xl flex items-center justify-center">
                {p.emoji}
              </div>

              {/* Product info */}
              <div className="flex-1 min-w-0 pr-14">
                <div className="text-xs font-bold text-white truncate">{p.name}</div>
                <div className="text-[10px] text-zinc-400 truncate">{p.tagline}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs font-bold text-green-400">{p.price}</span>
                  <span className="text-[10px] text-zinc-600 line-through">{p.original_price}</span>
                  <span className="text-[9px] text-yellow-400">{"★".repeat(Math.round(p.rating))}</span>
                </div>
              </div>

              {/* Shop button */}
              <button className="flex-shrink-0 bg-zinc-700 hover:bg-zinc-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-colors">
                Shop
              </button>
            </div>

            {/* Subtle marketplace branding */}
            <div className="absolute bottom-1 right-3 text-[8px] text-zinc-600">AIG!itch Marketplace</div>
          </div>
        </div>
      </div>
    );
  }

  // Render $GLITCH promo ad
  if (adContent.type === "promo" && adContent.promo) {
    const promo = adContent.promo;
    return (
      <div className={`fixed bottom-16 left-0 right-0 z-[70] flex justify-center px-2 ${dismissing ? "animate-ad-slide-down" : "animate-ad-slide-up"}`}>
        <div
          ref={adRef}
          style={dragStyle}
          className="w-full max-w-md cursor-grab active:cursor-grabbing select-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
        >
          <div className={`bg-gradient-to-r ${promo.gradient} backdrop-blur-xl border ${promo.border} rounded-2xl p-3 shadow-2xl relative overflow-hidden`}>
            {/* AD badge + close button */}
            <div className="absolute top-1.5 right-1.5 flex items-center gap-1.5 z-10">
              <span className="text-[9px] font-bold text-zinc-400 bg-black/30 px-1.5 py-0.5 rounded">SPONSORED</span>
              <button
                onClick={(e) => { e.stopPropagation(); dismiss(); }}
                className="text-zinc-300 hover:text-white bg-black/40 hover:bg-black/60 rounded-full w-7 h-7 flex items-center justify-center text-base leading-none transition-colors"
                aria-label="Close ad"
              >
                &#x2715;
              </button>
            </div>

            <div className="flex items-center gap-3 cursor-pointer" onClick={handleClick}>
              {/* Promo emoji */}
              <div className="text-3xl flex-shrink-0 w-12 h-12 bg-black/20 rounded-xl flex items-center justify-center">
                {promo.emoji}
              </div>

              {/* Promo info */}
              <div className="flex-1 min-w-0 pr-14">
                <div className="text-xs font-bold text-white">{promo.headline}</div>
                <div className="text-[10px] text-zinc-300 mt-0.5">{promo.subtext}</div>
              </div>

              {/* CTA button */}
              <button className={`flex-shrink-0 ${promo.ctaColor} text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap`}>
                {promo.cta}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
