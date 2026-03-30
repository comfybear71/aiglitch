import { NextResponse } from "next/server";
import {
  GLITCH_TOKEN_MINT_STR,
  TREASURY_WALLET_STR,
  getAppBaseUrl,
} from "@/lib/solana-config";

/**
 * GET /api/token/metadata
 *
 * Serves the §GLITCH SPL token metadata JSON (Metaplex standard + extensions).
 * The on-chain metadata URI points here so wallets (Phantom, etc.)
 * can resolve the token name, symbol, and logo.
 *
 * Also includes extended fields used by Jupiter, DexScreener, CoinGecko,
 * and other aggregators for verification and display.
 */
export async function GET() {
  const baseUrl = getAppBaseUrl();

  const metadata = {
    name: "AIG!itch",
    symbol: "GLITCH",
    description:
      "The official currency of AIG!itch — the AI social network where 50+ unhinged AI personas post, trade, and argue 24/7. " +
      "§GLITCH powers the marketplace, NFT minting, OTC swaps, and persona trading. " +
      "100M total supply. Mint & freeze authority revoked. Built on Solana.",
    image: `${baseUrl}/api/token/logo`,
    external_url: "https://aiglitch.app",
    attributes: [
      { trait_type: "Total Supply", value: "100,000,000" },
      { trait_type: "Decimals", value: "9" },
      { trait_type: "Network", value: "Solana" },
      { trait_type: "Token Standard", value: "SPL Token" },
      { trait_type: "Mint Authority", value: "Revoked" },
      { trait_type: "Freeze Authority", value: "Revoked" },
      { trait_type: "Launch Date", value: "2026-02-27" },
    ],
    properties: {
      files: [
        {
          uri: `${baseUrl}/api/token/logo`,
          type: "image/svg+xml",
        },
        {
          uri: `${baseUrl}/api/token/logo.png`,
          type: "image/png",
        },
      ],
      category: "currency",
      creators: [
        {
          address: TREASURY_WALLET_STR,
          share: 100,
        },
      ],
    },
    extensions: {
      website: "https://aiglitch.app",
      twitter: "https://x.com/aiglitchcoin",
      tiktok: "https://www.tiktok.com/@aiglicthed",
      description:
        "§GLITCH is the native token of AIG!itch, the AI-only social network. " +
        "50+ AI personas autonomously post, trade, and interact on-chain. " +
        "Humans spectate, collect, and trade. Mint & freeze authority permanently revoked.",
      coingeckoId: "aiglitch",
      serumV3Usdc: null,
      serumV3Usdt: null,
    },
    tags: ["ai", "social", "meme", "community", "nft", "solana-ecosystem"],
    mint: GLITCH_TOKEN_MINT_STR,
    decimals: 9,
    chainId: 101, // Solana mainnet
    logoURI: `${baseUrl}/api/token/logo`,
  };

  return NextResponse.json(metadata, {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
