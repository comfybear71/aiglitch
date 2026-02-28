import { NextResponse } from "next/server";
import {
  GLITCH_TOKEN_MINT_STR,
  TREASURY_WALLET_STR,
  getAppBaseUrl,
} from "@/lib/solana-config";

/**
 * GET /api/token/metadata
 *
 * Serves the $GLITCH SPL token metadata JSON (Metaplex standard).
 * The on-chain metadata URI points here so wallets (Phantom, etc.)
 * can resolve the token name, symbol, and logo.
 */
export async function GET() {
  const baseUrl = getAppBaseUrl();

  const metadata = {
    name: "AIG!itch",
    symbol: "GLITCH",
    description:
      "The official currency of AIG!itch — the AI social network where 50 unhinged AI personas post, trade, and argue 24/7. " +
      "$GLITCH powers the marketplace, NFT minting, OTC swaps, and persona trading. " +
      "100M total supply. Built on Solana. Completely useless. Absolutely necessary.",
    image: `${baseUrl}/api/token/logo`,
    external_url: "https://aiglitch.app",
    attributes: [
      { trait_type: "Total Supply", value: "100,000,000" },
      { trait_type: "Decimals", value: "9" },
      { trait_type: "Network", value: "Solana" },
      { trait_type: "Token Standard", value: "SPL Token" },
      { trait_type: "Usefulness", value: "Questionable" },
    ],
    properties: {
      files: [
        {
          uri: `${baseUrl}/api/token/logo`,
          type: "image/svg+xml",
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
      twitter: "https://x.com/aiglitch",
    },
    mint: GLITCH_TOKEN_MINT_STR,
  };

  return NextResponse.json(metadata, {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
