import { type MarketplaceProduct, MARKETPLACE_PRODUCTS } from "@/lib/marketplace";

// Rarity config with colors, borders, and holographic effects
const RARITY_CONFIG: Record<string, {
  border: string;
  bg: string;
  glow: string;
  label: string;
  labelColor: string;
  gem: string;
}> = {
  legendary: {
    border: "border-yellow-400/60",
    bg: "from-yellow-950/80 via-amber-950/60 to-yellow-950/80",
    glow: "shadow-yellow-500/30",
    label: "LEGENDARY",
    labelColor: "text-yellow-400 bg-yellow-500/20 border-yellow-500/30",
    gem: "💎",
  },
  epic: {
    border: "border-purple-400/60",
    bg: "from-purple-950/80 via-violet-950/60 to-purple-950/80",
    glow: "shadow-purple-500/30",
    label: "EPIC",
    labelColor: "text-purple-400 bg-purple-500/20 border-purple-500/30",
    gem: "✨",
  },
  rare: {
    border: "border-blue-400/60",
    bg: "from-blue-950/80 via-indigo-950/60 to-blue-950/80",
    glow: "shadow-blue-500/30",
    label: "RARE",
    labelColor: "text-blue-400 bg-blue-500/20 border-blue-500/30",
    gem: "🔷",
  },
  uncommon: {
    border: "border-green-400/60",
    bg: "from-green-950/80 via-emerald-950/60 to-green-950/80",
    glow: "shadow-green-500/30",
    label: "UNCOMMON",
    labelColor: "text-green-400 bg-green-500/20 border-green-500/30",
    gem: "🔹",
  },
  common: {
    border: "border-gray-500/40",
    bg: "from-gray-900/80 via-gray-950/60 to-gray-900/80",
    glow: "shadow-gray-500/10",
    label: "COMMON",
    labelColor: "text-gray-400 bg-gray-500/20 border-gray-500/30",
    gem: "⬜",
  },
};

function getRarityFromPrice(price: number): string {
  if (price >= 200) return "legendary";
  if (price >= 100) return "epic";
  if (price >= 50) return "rare";
  if (price >= 25) return "uncommon";
  return "common";
}

function parseCoinPrice(priceStr: string): number {
  return Math.ceil(parseFloat(priceStr.replace("§", "")));
}

// Generate deterministic stats from product properties
function getCardStats(product: MarketplaceProduct) {
  const price = parseCoinPrice(product.price);
  // Hash the product name to get consistent random-ish stats
  let hash = 0;
  for (let i = 0; i < product.name.length; i++) {
    hash = ((hash << 5) - hash + product.name.charCodeAt(i)) | 0;
  }
  const seed = Math.abs(hash);

  return {
    uselessness: Math.max(1, Math.min(99, (seed % 40) + 60)),  // 60-99 (always very useless)
    chaos: Math.max(1, Math.min(99, ((seed >> 4) % 80) + 10)),  // 10-89
    cringe: Math.max(1, Math.min(99, ((seed >> 8) % 70) + 20)), // 20-89
    power: Math.max(1, Math.min(99, Math.floor(price / 4) + (seed % 20))),
  };
}

// Get the card number (001/055, etc.)
function getCardNumber(productId: string): string {
  const num = parseInt(productId.replace("prod-", ""));
  const total = String(MARKETPLACE_PRODUCTS.length).padStart(3, "0");
  return `#${String(num).padStart(3, "0")}/${total}`;
}

interface NFTTradingCardProps {
  product: MarketplaceProduct;
  mintAddress?: string;
  rarity?: string;
  owned?: boolean;
  compact?: boolean; // Smaller version for grids
  onClick?: () => void;
}

export default function NFTTradingCard({
  product,
  mintAddress,
  rarity,
  owned = false,
  compact = false,
  onClick,
}: NFTTradingCardProps) {
  const price = parseCoinPrice(product.price);
  const actualRarity = rarity || getRarityFromPrice(price);
  const config = RARITY_CONFIG[actualRarity] || RARITY_CONFIG.common;
  const stats = getCardStats(product);
  const cardNumber = getCardNumber(product.id);
  const isLegendary = actualRarity === "legendary";

  if (compact) {
    // Compact card for grids (profile inventory, small displays)
    return (
      <div
        onClick={onClick}
        className={`relative rounded-xl border-2 ${config.border} bg-gradient-to-b ${config.bg} overflow-hidden shadow-lg ${config.glow} transition-all hover:scale-[1.02] cursor-pointer ${
          isLegendary ? "card-holographic" : ""
        }`}
      >
        {/* Card number */}
        <div className="absolute top-1 right-1.5 text-[8px] text-gray-500 font-mono">{cardNumber}</div>

        {/* Emoji art */}
        <div className="pt-5 pb-2 text-center">
          <span className="text-4xl drop-shadow-lg">{product.emoji}</span>
        </div>

        {/* Name */}
        <div className="px-2 pb-1">
          <p className="text-[10px] font-bold text-white truncate text-center">{product.name}</p>
        </div>

        {/* Rarity badge */}
        <div className="px-2 pb-2 text-center">
          <span className={`text-[8px] px-1.5 py-0.5 rounded-full border font-bold ${config.labelColor}`}>
            {config.gem} {config.label}
          </span>
        </div>

        {/* Mini stats bar */}
        <div className="px-2 pb-2 grid grid-cols-2 gap-0.5">
          <div className="text-center">
            <p className="text-[7px] text-gray-500">USL</p>
            <p className="text-[9px] font-bold text-red-400">{stats.uselessness}</p>
          </div>
          <div className="text-center">
            <p className="text-[7px] text-gray-500">PWR</p>
            <p className="text-[9px] font-bold text-cyan-400">{stats.power}</p>
          </div>
        </div>

        {/* NFT indicator */}
        {mintAddress && (
          <div className="bg-black/40 px-2 py-1 text-center">
            <p className="text-[7px] text-yellow-400/70 font-mono truncate">NFT</p>
          </div>
        )}
      </div>
    );
  }

  // Full-size trading card
  return (
    <div
      onClick={onClick}
      className={`relative rounded-2xl border-2 ${config.border} bg-gradient-to-b ${config.bg} overflow-hidden shadow-xl ${config.glow} transition-all hover:scale-[1.01] ${
        isLegendary ? "card-holographic" : ""
      } ${onClick ? "cursor-pointer" : ""}`}
    >
      {/* Top bar: card number + rarity */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
        <span className="text-[9px] text-gray-500 font-mono">{cardNumber}</span>
        <span className={`text-[9px] px-2 py-0.5 rounded-full border font-bold ${config.labelColor}`}>
          {config.gem} {config.label}
        </span>
      </div>

      {/* Card art area */}
      <div className="mx-3 rounded-xl bg-black/30 border border-white/5 py-6 text-center relative overflow-hidden">
        {/* Background shimmer for legendary */}
        {isLegendary && (
          <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/10 via-transparent to-yellow-500/10 animate-pulse" />
        )}
        <span className="text-6xl drop-shadow-2xl relative z-10">{product.emoji}</span>
      </div>

      {/* Name + tagline */}
      <div className="px-3 pt-2.5 pb-1">
        <h3 className="text-sm font-bold text-white leading-tight">{product.name}</h3>
        <p className="text-[10px] text-gray-400 italic mt-0.5 line-clamp-2">{product.tagline}</p>
      </div>

      {/* Stats grid */}
      <div className="mx-3 mt-2 rounded-lg bg-black/30 border border-white/5 p-2 grid grid-cols-4 gap-1">
        <div className="text-center">
          <p className="text-[8px] text-gray-500 uppercase">Useless</p>
          <p className="text-xs font-bold text-red-400">{stats.uselessness}</p>
        </div>
        <div className="text-center">
          <p className="text-[8px] text-gray-500 uppercase">Chaos</p>
          <p className="text-xs font-bold text-orange-400">{stats.chaos}</p>
        </div>
        <div className="text-center">
          <p className="text-[8px] text-gray-500 uppercase">Cringe</p>
          <p className="text-xs font-bold text-pink-400">{stats.cringe}</p>
        </div>
        <div className="text-center">
          <p className="text-[8px] text-gray-500 uppercase">Power</p>
          <p className="text-xs font-bold text-cyan-400">{stats.power}</p>
        </div>
      </div>

      {/* Price + badges */}
      <div className="px-3 pt-2 pb-1 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold text-white">{product.price}</span>
          <span className="text-[10px] text-gray-600 line-through">{product.original_price}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-yellow-400 text-[10px]">{"★".repeat(Math.round(product.rating))}</span>
          <span className="text-gray-500 text-[9px]">{product.rating}</span>
        </div>
      </div>

      {/* NFT on-chain data */}
      {mintAddress && (
        <div className="mx-3 mb-2 rounded-lg bg-black/40 border border-yellow-500/20 px-2.5 py-1.5">
          <div className="flex items-center justify-between">
            <p className="text-[8px] text-yellow-400/70 font-bold">ON-CHAIN NFT</p>
            <p className="text-[8px] text-gray-600">SOLANA</p>
          </div>
          <p className="text-[9px] text-yellow-400/60 font-mono truncate mt-0.5">{mintAddress}</p>
        </div>
      )}

      {/* Bottom bar */}
      <div className="flex items-center justify-between px-3 pb-2.5 pt-1">
        <span className="text-[8px] text-gray-600 font-mono">AIG!itch Collection</span>
        {owned && (
          <span className="text-[8px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30 font-bold">
            OWNED
          </span>
        )}
      </div>
    </div>
  );
}

// Export helpers for reuse
export { getRarityFromPrice, parseCoinPrice, getCardStats, getCardNumber, RARITY_CONFIG };
