import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";

// ── $GLITCH Token Configuration ──
// Update these values after creating your real SPL token on Solana

// Network: "mainnet-beta" for real launch, "devnet" for testing
export const SOLANA_NETWORK = (process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet") as "mainnet-beta" | "devnet" | "testnet";

// Helius API key (server-side only — never exposed to client)
export const HELIUS_API_KEY = process.env.HELIUS_API_KEY || "";

// Build Helius RPC URL if API key is available
function buildHeliusRpcUrl(): string | null {
  if (!HELIUS_API_KEY) return null;
  const network = SOLANA_NETWORK === "mainnet-beta" ? "mainnet" : SOLANA_NETWORK;
  return `https://${network}.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
}

// Helius enhanced API base URL (for token balances, etc.)
export function getHeliusApiUrl(path: string): string | null {
  if (!HELIUS_API_KEY) return null;
  return `https://api.helius.xyz${path}?api-key=${HELIUS_API_KEY}`;
}

// RPC endpoint — prefers Helius, falls back to NEXT_PUBLIC env var, then public RPC
export const SOLANA_RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl(SOLANA_NETWORK);

// Server-side RPC URL (uses Helius API key if available, never exposed to client)
export const SERVER_RPC_URL = buildHeliusRpcUrl() || SOLANA_RPC_URL;

// System program address used as safe placeholder for unconfigured token mint
const SYSTEM_PROGRAM = "11111111111111111111111111111111";

// $GLITCH SPL Token Mint Address (mainnet — created 2026-02-27)
export const GLITCH_TOKEN_MINT_STR = process.env.NEXT_PUBLIC_GLITCH_TOKEN_MINT || "5hfHCmaL6e9bvruy35RQyghMXseTE2mXJ7ukqKAcS8fT";

// $BUDJU SPL Token Mint Address (real token on Solana)
export const BUDJU_TOKEN_MINT_STR = process.env.NEXT_PUBLIC_BUDJU_TOKEN_MINT || "2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump";

// Treasury wallet — holds 30M reserve tokens for new meat bag airdrops
export const TREASURY_WALLET_STR = process.env.NEXT_PUBLIC_TREASURY_WALLET || "7SGf93WGk7VpSmreARzNujPbEpyABq2Em9YvaCirWi56";

// ElonBot wallet — holds 42,069,000 $GLITCH (sell-restricted to admin only)
export const ELONBOT_WALLET_STR = process.env.NEXT_PUBLIC_ELONBOT_WALLET || "6VAcB1VvZDgJ54XvkYwmtVLweq8NN8TZdgBV3EPzY6gH";

// AI Persona Pool wallet — shared wallet for ALL AI personas (except ElonBot)
export const AI_POOL_WALLET_STR = process.env.NEXT_PUBLIC_AI_POOL_WALLET || "A1PoOL69420ShArEdWaLLeTfOrAiPeRsOnAs42069";

// Admin wallet — your personal wallet (only address ElonBot can sell to)
export const ADMIN_WALLET_STR = process.env.NEXT_PUBLIC_ADMIN_WALLET || "2J2XWm3oZo9JUu6i5ceAsoDmeFZw5trBhjdfm2G72uTJ";

// Meteora DLMM Pool Address (GLITCH/BUDJU)
export const METEORA_GLITCH_BUDJU_POOL = "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo";

// Lazy PublicKey helpers (avoid crashing at import time with invalid base58)
let _mintPubkey: PublicKey | null = null;
export function getGlitchTokenMint(): PublicKey {
  if (!_mintPubkey) _mintPubkey = new PublicKey(GLITCH_TOKEN_MINT_STR);
  return _mintPubkey;
}

let _treasuryPubkey: PublicKey | null = null;
export function getTreasuryWallet(): PublicKey {
  if (!_treasuryPubkey) _treasuryPubkey = new PublicKey(TREASURY_WALLET_STR);
  return _treasuryPubkey;
}

let _elonbotPubkey: PublicKey | null = null;
export function getElonBotWallet(): PublicKey {
  if (!_elonbotPubkey) _elonbotPubkey = new PublicKey(ELONBOT_WALLET_STR);
  return _elonbotPubkey;
}

let _aiPoolPubkey: PublicKey | null = null;
export function getAiPoolWallet(): PublicKey {
  if (!_aiPoolPubkey) _aiPoolPubkey = new PublicKey(AI_POOL_WALLET_STR);
  return _aiPoolPubkey;
}

let _budjuMintPubkey: PublicKey | null = null;
export function getBudjuTokenMint(): PublicKey {
  if (!_budjuMintPubkey) _budjuMintPubkey = new PublicKey(BUDJU_TOKEN_MINT_STR);
  return _budjuMintPubkey;
}

let _adminPubkey: PublicKey | null = null;
export function getAdminWallet(): PublicKey {
  if (!_adminPubkey) _adminPubkey = new PublicKey(ADMIN_WALLET_STR);
  return _adminPubkey;
}

// Connection instance (reused across the app)
let _connection: Connection | null = null;
export function getSolanaConnection(): Connection {
  if (!_connection) {
    _connection = new Connection(SOLANA_RPC_URL, "confirmed");
  }
  return _connection;
}

// Server-side connection (uses Helius if available — never use on client)
let _serverConnection: Connection | null = null;
export function getServerSolanaConnection(): Connection {
  if (!_serverConnection) {
    _serverConnection = new Connection(SERVER_RPC_URL, "confirmed");
  }
  return _serverConnection;
}

// Check if we have a valid (non-placeholder) token mint configured
export function hasValidTokenMint(): boolean {
  const SYSTEM_PROGRAM_ADDR = "11111111111111111111111111111111";
  return GLITCH_TOKEN_MINT_STR !== SYSTEM_PROGRAM_ADDR && GLITCH_TOKEN_MINT_STR.length > 10;
}

// ── Tokenomics ──
export const TOKENOMICS = {
  totalSupply: 100_000_000,          // 100M total $GLITCH tokens
  decimals: 9,                        // Standard Solana decimals (same as SOL)

  // Distribution
  elonBot: {
    amount: 42_069_000,               // 42.069% — Technoking allocation
    personaId: "glitch-047",
    username: "techno_king",
    sellRestriction: "admin_only",    // Can ONLY sell/transfer to admin wallet
  },

  treasury: {
    amount: 30_000_000,               // 30% — Reserve for new users + rewards
    newUserAirdrop: 100,              // Each new meat bag gets 100 $GLITCH
    maxDailyAirdrops: 1000,           // Prevent treasury drain
  },

  aiPersonaPool: {
    amount: 15_000_000,               // 15% — All AI personas share ONE wallet (except ElonBot)
    sharedWallet: true,               // Single wallet holds all non-ElonBot persona tokens
    tiers: {
      whale: 1_000_000,              // Big name personas (Rick, BlockchainBabe)
      high: 500_000,                  // High activity personas
      mid: 100_000,                   // Regular personas
      base: 10_000,                   // Everyone else
    },
  },

  liquidityPool: {
    amount: 10_000_000,               // 10% — DEX liquidity (Meteora DLMM/Jupiter)
    initialPriceSOL: 0.000042,        // Starting price per $GLITCH in SOL
    initialPriceUSD: 0.0069,          // Starting price per $GLITCH in USD
  },

  admin: {
    amount: 2_931_000,                // ~2.93% — Platform operations
  },
};

// ── ElonBot Sell Restriction ──
// ElonBot can ONLY transfer tokens to the admin wallet.
// All other transfers are blocked at the application level.
export function isElonBotTransferAllowed(
  senderWallet: string,
  recipientWallet: string
): { allowed: boolean; reason?: string } {
  const elonBotAddr = ELONBOT_WALLET_STR;
  const adminAddr = ADMIN_WALLET_STR;

  // If the sender is NOT ElonBot, allow normally
  if (senderWallet !== elonBotAddr) {
    return { allowed: true };
  }

  // ElonBot can ONLY send to admin
  if (recipientWallet === adminAddr) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: "ElonBot ($GLITCH whale) can only sell to the platform admin. "
      + "The Technoking's tokens are locked. Nice try, meat bag.",
  };
}

// Persona wallet mapping — ElonBot has his own wallet, everyone else shares AI_POOL_WALLET
// In "real mode", the pool wallet is a single Solana wallet holding all non-ElonBot persona tokens
export const PERSONA_WALLETS: Record<string, string> = {
  // ElonBot keeps his own wallet — everyone else uses AI_POOL_WALLET_STR
  "glitch-047": ELONBOT_WALLET_STR,
};

// Check if we're in "real mode" (real Solana) vs "simulated mode"
export function isRealSolanaMode(): boolean {
  return (
    process.env.NEXT_PUBLIC_SOLANA_REAL_MODE === "true" &&
    GLITCH_TOKEN_MINT_STR !== SYSTEM_PROGRAM
  );
}
