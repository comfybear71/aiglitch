// ── Multi-Token Registry for GlitchDEX ──
// All tradeable tokens on the platform: $GLITCH, $BUDJU, SOL, USDC

export interface TokenConfig {
  symbol: string;
  name: string;
  decimals: number;
  totalSupply: number;
  circulatingSupply: number;
  mintAddress: string; // Real Solana SPL mint address (or "native" for SOL)
  isNative?: boolean; // SOL is native, not an SPL token
  isStablecoin?: boolean; // USDC pegged to $1
  iconEmoji: string;
  iconPath: string; // Path to SVG icon in /public/tokens/
  color: string; // Tailwind color name for UI
  aiPersonaAllocation?: number; // How much AI personas collectively hold
  meatBagBuyOnly?: boolean; // If true, humans can only BUY (no airdrops/faucet)
  initialPriceUsd: number;
  initialPriceSol: number;
}

export const TOKENS: Record<string, TokenConfig> = {
  GLITCH: {
    symbol: "$GLITCH",
    name: "GlitchCoin",
    decimals: 9,
    totalSupply: 100_000_000,
    circulatingSupply: 42_000_000,
    mintAddress: "5hfHCmaL6e9bvruy35RQyghMXseTE2mXJ7ukqKAcS8fT",
    iconEmoji: "§",
    iconPath: "/tokens/glitch.svg",
    color: "purple",
    aiPersonaAllocation: 15_000_000,
    initialPriceUsd: 0.0069,
    initialPriceSol: 0.000042,
  },
  BUDJU: {
    symbol: "$BUDJU",
    name: "Budju",
    decimals: 9,
    totalSupply: 1_000_000_000,
    circulatingSupply: 500_000_000,
    mintAddress: "2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump",
    iconEmoji: "\uD83D\uDC3B",
    iconPath: "/tokens/budju.svg",
    color: "fuchsia",
    aiPersonaAllocation: 20_000_000,
    meatBagBuyOnly: true, // Humans can ONLY buy $BUDJU on the exchange
    initialPriceUsd: 0.00042,
    initialPriceSol: 0.0000025,
  },
  SOL: {
    symbol: "SOL",
    name: "Solana",
    decimals: 9,
    totalSupply: 590_000_000,
    circulatingSupply: 440_000_000,
    mintAddress: "native",
    isNative: true,
    iconEmoji: "◎",
    iconPath: "/tokens/sol.svg",
    color: "cyan",
    initialPriceUsd: 164.0,
    initialPriceSol: 1.0,
  },
  USDC: {
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    totalSupply: 45_000_000_000,
    circulatingSupply: 45_000_000_000,
    mintAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    isStablecoin: true,
    iconEmoji: "$",
    iconPath: "/tokens/usdc.svg",
    color: "green",
    initialPriceUsd: 1.0,
    initialPriceSol: 0.0061, // ~1/164 SOL
  },
};

// ── Trading Pairs ──
export interface TradingPair {
  id: string; // e.g. "GLITCH_USDC"
  base: string; // Token being traded (e.g. "GLITCH")
  quote: string; // Token priced against (e.g. "USDC")
  label: string; // Display: "$GLITCH/USDC"
  isActive: boolean;
}

export const TRADING_PAIRS: TradingPair[] = [
  { id: "GLITCH_USDC", base: "GLITCH", quote: "USDC", label: "$GLITCH/USDC", isActive: true },
  { id: "GLITCH_SOL", base: "GLITCH", quote: "SOL", label: "$GLITCH/SOL", isActive: true },
  { id: "BUDJU_USDC", base: "BUDJU", quote: "USDC", label: "$BUDJU/USDC", isActive: true },
  { id: "BUDJU_SOL", base: "BUDJU", quote: "SOL", label: "$BUDJU/SOL", isActive: true },
  { id: "GLITCH_BUDJU", base: "GLITCH", quote: "BUDJU", label: "$GLITCH/$BUDJU", isActive: true },
];

// Get the price of a trading pair (base price / quote price)
export function getPairPrice(pairId: string, prices: Record<string, number>): number {
  const pair = TRADING_PAIRS.find((p) => p.id === pairId);
  if (!pair) return 0;
  const basePrice = prices[pair.base] || 0;
  const quotePrice = prices[pair.quote] || 0;
  if (quotePrice === 0) return 0;
  return basePrice / quotePrice;
}

// $BUDJU AI persona tier allocations (from the 20M pool)
export const BUDJU_PERSONA_TIERS = {
  whale: 2_000_000, // Big name personas get 2M each
  high: 500_000, // High activity personas get 500K
  mid: 100_000, // Regular personas get 100K
  base: 20_000, // Everyone else gets 20K
};

// Helper: get all token symbols
export function getAllTokenSymbols(): string[] {
  return Object.keys(TOKENS);
}

// Helper: check if meat bag can sell a token
export function canMeatBagSell(tokenSymbol: string): boolean {
  const token = TOKENS[tokenSymbol];
  if (!token) return false;
  return !token.meatBagBuyOnly;
}
