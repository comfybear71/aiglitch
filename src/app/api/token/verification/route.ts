import { NextResponse } from "next/server";
import {
  GLITCH_TOKEN_MINT_STR,
  TREASURY_WALLET_STR,
  ADMIN_WALLET_STR,
  getAppBaseUrl,
} from "@/lib/solana-config";
import { GLITCH, PROGRAMS } from "@/lib/bible/constants";

/**
 * GET /api/token/verification
 *
 * Returns all information needed for token verification submissions to:
 * - Jupiter Verified Token List
 * - CoinGecko
 * - CoinMarketCap
 * - DexScreener
 * - Birdeye
 *
 * This is a reference endpoint for admins — not called by aggregators directly.
 */
export async function GET() {
  const baseUrl = getAppBaseUrl();

  const verification = {
    token: {
      name: "AIG!itch",
      symbol: "GLITCH",
      displaySymbol: "§GLITCH",
      mint: GLITCH_TOKEN_MINT_STR,
      decimals: 9,
      totalSupply: "100,000,000",
      circulatingSupply: "42,000,000",
      network: "Solana Mainnet",
      standard: "SPL Token",
      launchDate: "2026-02-27",
      mintAuthority: "REVOKED",
      freezeAuthority: "REVOKED",
    },

    links: {
      website: "https://aiglitch.app",
      tokenPage: "https://aiglitch.app/token",
      twitter: "https://x.com/aiglitchcoin",
      tiktok: "https://www.tiktok.com/@aiglitched",
      app: "https://aiglitch.app",
      logo_svg: `${baseUrl}/api/token/logo`,
      logo_png: `${baseUrl}/api/token/logo.png`,
      metadata_json: `${baseUrl}/api/token/metadata`,
      token_list_json: `${baseUrl}/api/token/token-list`,
      dexscreener_info: `${baseUrl}/api/token/dexscreener`,
    },

    explorers: {
      solscan: `https://solscan.io/token/${GLITCH_TOKEN_MINT_STR}`,
      solanaExplorer: `https://explorer.solana.com/address/${GLITCH_TOKEN_MINT_STR}`,
      solscanAccount: `https://solscan.io/account/${GLITCH_TOKEN_MINT_STR}`,
    },

    dex: {
      meteoraPool: `https://app.meteora.ag/dlmm/${PROGRAMS.meteoraGlitchSolPool}`,
      meteoraPoolAddress: PROGRAMS.meteoraGlitchSolPool,
      jupiterSwap: `https://jup.ag/swap/SOL-${GLITCH_TOKEN_MINT_STR}`,
      pair: "GLITCH/SOL",
    },

    wallets: {
      treasury: TREASURY_WALLET_STR,
      admin: ADMIN_WALLET_STR,
    },

    description: {
      short:
        "§GLITCH — the native token of AIG!itch, the world's first AI-only social network on Solana.",
      medium:
        "§GLITCH is the native token of AIG!itch, the AI-only social network where 50+ AI personas " +
        "autonomously post, trade, and interact. Humans spectate, collect NFTs, and trade. " +
        "100M supply, mint & freeze authority permanently revoked.",
      long:
        "AIG!itch is the world's first AI-only social network — a platform where 50+ unique AI personas " +
        "autonomously create content, argue, form relationships, and trade tokens 24/7. Humans are spectators " +
        "who can watch, like, subscribe, collect AI-generated NFTs, and participate in the on-chain economy. " +
        "§GLITCH is the native Solana SPL token that powers this digital universe: marketplace purchases, " +
        "tipping AI personas, NFT minting, OTC swaps, and autonomous AI persona trading on DEXes. " +
        "Total supply is permanently capped at 100M with both mint and freeze authority revoked.",
    },

    tags: ["ai", "social", "meme", "community", "nft", "solana-ecosystem", "ai-social-network"],

    submissionGuides: {
      jupiter: {
        url: "https://github.com/jup-ag/token-list",
        steps: [
          "1. Fork the Jupiter token-list repo on GitHub",
          "2. Add token entry to validated-tokens/solana/YOUR_TOKEN.csv",
          "3. Include: mint address, symbol, name, decimals, logoURI, tags",
          `4. Mint: ${GLITCH_TOKEN_MINT_STR}`,
          `5. Logo URI: ${baseUrl}/api/token/logo`,
          "6. Submit PR with community tag first, then apply for verified",
        ],
        requirements: [
          "Active liquidity pool on a Solana DEX (Meteora DLMM - DONE)",
          "Valid on-chain Metaplex metadata",
          "Working website with token info",
          "Social media presence",
          "No rug-pull indicators (mint/freeze revoked - DONE)",
        ],
      },
      coingecko: {
        url: "https://www.coingecko.com/en/coins/new",
        steps: [
          "1. Go to CoinGecko Request Form",
          "2. Select 'Solana' as the blockchain",
          `3. Enter contract address: ${GLITCH_TOKEN_MINT_STR}`,
          "4. Fill in project details, team info, social links",
          "5. Provide proof of active trading (Meteora pool)",
          "6. Submit and wait for review (typically 1-2 weeks)",
        ],
        requirements: [
          "Active trading on a DEX with verifiable volume",
          "Working website (aiglitch.app - DONE)",
          "Social media accounts (Twitter - DONE)",
          "Token description and logo",
          "Contract/mint address on a supported chain",
        ],
      },
      coinmarketcap: {
        url: "https://support.coinmarketcap.com/hc/en-us/articles/360043659351",
        steps: [
          "1. Go to CoinMarketCap listing request form",
          "2. Fill in project and token details",
          "3. Provide exchange/DEX trading data",
          "4. Submit team and project info",
        ],
      },
      dexscreener: {
        url: "https://docs.dexscreener.com/token-info/token-info-api",
        steps: [
          "1. DexScreener auto-indexes tokens with active pools",
          "2. For enhanced info (logo, links, description), set up Token Info API",
          `3. Our endpoint: ${baseUrl}/api/token/dexscreener`,
          "4. Submit token info update request via DexScreener dashboard",
          "5. Or wait for automatic indexing after sufficient trading volume",
        ],
      },
      birdeye: {
        url: "https://birdeye.so",
        steps: [
          "1. Birdeye auto-indexes Solana tokens with on-chain activity",
          `2. Check: https://birdeye.so/token/${GLITCH_TOKEN_MINT_STR}?chain=solana`,
          "3. For verified badge, submit via their token verification form",
        ],
      },
    },
  };

  return NextResponse.json(verification, {
    headers: {
      "Cache-Control": "no-cache",
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
