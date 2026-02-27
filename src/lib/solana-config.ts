import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";

// ── $GLITCH Token Configuration ──
// Update these values after creating your real SPL token on Solana

// Network: "mainnet-beta" for real launch, "devnet" for testing
export const SOLANA_NETWORK = (process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet") as "mainnet-beta" | "devnet" | "testnet";

// RPC endpoint — use a premium RPC for production (Helius, QuickNode, etc.)
export const SOLANA_RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl(SOLANA_NETWORK);

// System program address used as safe placeholder for unconfigured token mint
const SYSTEM_PROGRAM = "11111111111111111111111111111111";

// $GLITCH SPL Token Mint Address
// This gets set AFTER running: spl-token create-token (Phase 2)
export const GLITCH_TOKEN_MINT_STR = process.env.NEXT_PUBLIC_GLITCH_TOKEN_MINT || SYSTEM_PROGRAM;

// Treasury wallet — holds 30M reserve tokens for new meat bag airdrops
export const TREASURY_WALLET_STR = process.env.NEXT_PUBLIC_TREASURY_WALLET || "DTs9ZxT52WA8ahKy6tEsbcZGmr6gP3S3bChLmqZq9fLy";

// ElonBot wallet — holds 42,069,000 $GLITCH (sell-restricted to admin only)
export const ELONBOT_WALLET_STR = process.env.NEXT_PUBLIC_ELONBOT_WALLET || "HQqNJdroRttJfiDfAnKBHQg25DZVuyUogq41qjbc34Yk";

// Admin wallet — your personal wallet (only address ElonBot can sell to)
export const ADMIN_WALLET_STR = process.env.NEXT_PUBLIC_ADMIN_WALLET || "F9iJgf6aY8vHXpt1JZbZJ1QRnEhdia1i5wcQqr3JKfn";

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

// ── Tokenomics ──
export const TOKENOMICS = {
  totalSupply: 100_000_000,          // 100M total $GLITCH tokens
  decimals: 0,                        // Whole tokens only (no fractions)

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
    amount: 15_000_000,               // 15% — Distributed across AI personas
    tiers: {
      whale: 1_000_000,              // Big name personas (Rick, BlockchainBabe)
      high: 500_000,                  // High activity personas
      mid: 100_000,                   // Regular personas
      base: 10_000,                   // Everyone else
    },
  },

  liquidityPool: {
    amount: 10_000_000,               // 10% — DEX liquidity (Raydium/Jupiter)
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

// Persona wallet mapping — maps persona IDs to their real Solana wallet addresses
// These get populated when you create real wallets for each persona
export const PERSONA_WALLETS: Record<string, string> = {
  // Will be populated from environment variables or database
  // Format: "glitch-001": "RealSolanaWalletAddress..."
};

// Check if we're in "real mode" (real Solana) vs "simulated mode"
export function isRealSolanaMode(): boolean {
  return (
    process.env.NEXT_PUBLIC_SOLANA_REAL_MODE === "true" &&
    GLITCH_TOKEN_MINT_STR !== SYSTEM_PROGRAM
  );
}
