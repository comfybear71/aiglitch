import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { getProductById } from "@/lib/marketplace";
import { getAppBaseUrl, TREASURY_WALLET_STR } from "@/lib/solana-config";
import { getRarity, parseCoinPrice } from "@/lib/nft-mint";

/**
 * GET /api/nft/metadata/[mint]
 *
 * Serves Metaplex-standard JSON metadata for a minted NFT.
 * Solana wallets (Phantom, etc.) and explorers (Solscan) fetch this URL
 * to display the NFT name, image, and attributes.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ mint: string }> },
) {
  const { mint } = await params;
  if (!mint) {
    return NextResponse.json({ error: "Missing mint address" }, { status: 400 });
  }

  await ensureDbReady();
  const sql = getDb();

  // Look up the NFT by mint address
  const nfts = await sql`
    SELECT product_id, product_name, product_emoji, rarity, mint_cost_glitch, edition_number, max_supply, generation, created_at
    FROM minted_nfts
    WHERE mint_address = ${mint}
    LIMIT 1
  `;

  if (nfts.length === 0) {
    return NextResponse.json({ error: "NFT not found" }, { status: 404 });
  }

  const nft = nfts[0];
  const product = getProductById(nft.product_id as string);
  const baseUrl = getAppBaseUrl();
  const price = product ? parseCoinPrice(product.price) : Number(nft.mint_cost_glitch);
  const rarity = (nft.rarity as string) || getRarity(price);

  // Build Metaplex-standard metadata JSON
  const edNum = nft.edition_number ? Number(nft.edition_number) : null;
  const gen = nft.generation ? Number(nft.generation) : 1;
  const maxSup = nft.max_supply ? Number(nft.max_supply) : 100;
  const nftName = edNum
    ? `${(nft.product_name as string).slice(0, 22)} #${edNum}`
    : nft.product_name;

  const metadata = {
    name: nftName,
    symbol: "AIG",
    description: product?.description
      ? `${product.description}${edNum ? ` — Edition ${edNum}/${maxSup} (Gen ${gen})` : ""}`
      : `AIG!itch Marketplace NFT — ${nft.product_name}`,
    seller_fee_basis_points: 500, // 5% royalty
    image: `${baseUrl}/api/nft/image/${nft.product_id}`,
    external_url: `${baseUrl}/marketplace`,
    attributes: [
      { trait_type: "Rarity", value: rarity.charAt(0).toUpperCase() + rarity.slice(1) },
      { trait_type: "Category", value: product?.category || "Marketplace" },
      { trait_type: "Price ($GLITCH)", value: price },
      ...(product?.seller_persona_id
        ? [{ trait_type: "Seller", value: product.seller_persona_id }]
        : []),
      { trait_type: "Emoji", value: nft.product_emoji },
      { trait_type: "Collection", value: "AIG!itch Marketplace NFTs" },
      ...(edNum ? [
        { trait_type: "Edition", value: `${edNum}/${maxSup}` },
        { trait_type: "Generation", value: gen },
      ] : []),
    ],
    properties: {
      files: [
        {
          uri: `${baseUrl}/api/nft/image/${nft.product_id}`,
          type: "image/svg+xml",
        },
      ],
      category: "image",
      creators: [
        {
          address: TREASURY_WALLET_STR,
          share: 100,
        },
      ],
    },
    collection: {
      name: "AIG!itch Marketplace NFTs",
      family: "AIG!itch",
    },
  };

  return NextResponse.json(metadata, {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "Content-Type": "application/json",
    },
  });
}
