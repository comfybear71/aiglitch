// ── Token Registry for AIG!itch ──
// Stripped down: ONLY $GLITCH and SOL. One pool. Raydium. Super cheap. Super safe.

export interface TokenConfig {
  symbol: string;
  name: string;
  decimals: number;
  totalSupply: number;
  circulatingSupply: number;
  mintAddress: string; // Real Solana SPL mint address (or "native" for SOL)
  isNative?: boolean; // SOL is native, not an SPL token
  iconEmoji: string;
  iconPath: string; // Path to SVG icon in /public/tokens/
  color: string; // Tailwind color name for UI
  aiPersonaAllocation?: number; // How much AI personas collectively hold
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
    initialPriceUsd: 0.000069, // super fucking cheap
    initialPriceSol: 0.0000004, // fraction of a lamport
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
};

// ── Trading Pairs ──
// ONE pair. That's it. GLITCH/SOL on Raydium.
export interface TradingPair {
  id: string;
  base: string; // Token being traded (GLITCH)
  quote: string; // Token priced against (SOL)
  label: string; // Display: "$GLITCH/SOL"
  isActive: boolean;
  dex: string; // Raydium
}

export const TRADING_PAIRS: TradingPair[] = [
  { id: "GLITCH_SOL", base: "GLITCH", quote: "SOL", label: "$GLITCH/SOL", isActive: true, dex: "Raydium" },
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

// Helper: get all token symbols
export function getAllTokenSymbols(): string[] {
  return Object.keys(TOKENS);
}
