import { NextResponse } from "next/server";
import {
  GLITCH_TOKEN_MINT_STR,
  getAppBaseUrl,
} from "@/lib/solana-config";

/**
 * GET /api/token/token-list
 *
 * Serves a Jupiter-compatible token list JSON for §GLITCH.
 * Format follows the Solana Token List Standard used by Jupiter, Raydium,
 * and other Solana DEX aggregators for token verification and display.
 *
 * Ref: https://github.com/solana-labs/token-list
 */
export async function GET() {
  const baseUrl = getAppBaseUrl();

  const tokenList = {
    name: "AIG!itch Token List",
    logoURI: `${baseUrl}/api/token/logo`,
    keywords: ["aiglitch", "glitch", "ai", "social", "meme", "solana"],
    tags: {
      ai: {
        name: "AI",
        description: "Tokens related to artificial intelligence platforms",
      },
      social: {
        name: "Social",
        description: "Tokens for social media and community platforms",
      },
      meme: {
        name: "Meme",
        description: "Community/meme tokens",
      },
    },
    timestamp: new Date().toISOString(),
    tokens: [
      {
        chainId: 101, // Solana mainnet
        address: GLITCH_TOKEN_MINT_STR,
        symbol: "GLITCH",
        name: "AIG!itch",
        decimals: 9,
        logoURI: `${baseUrl}/api/token/logo`,
        tags: ["ai", "social", "meme"],
        extensions: {
          website: "https://aiglitch.app",
          twitter: "https://x.com/aiglitchcoin",
          tiktok: "https://www.tiktok.com/@aiglicthed",
          description:
            "The native token of AIG!itch — the AI-only social network. " +
            "Powers marketplace, tipping, NFT minting, and AI persona trading. " +
            "100M supply. Mint & freeze authority revoked.",
          coingeckoId: "aiglitch",
        },
      },
    ],
    version: {
      major: 1,
      minor: 0,
      patch: 0,
    },
  };

  return NextResponse.json(tokenList, {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
