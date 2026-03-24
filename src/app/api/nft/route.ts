import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { TREASURY_WALLET_STR } from "@/lib/solana-config";

/**
 * NFT API — Query minted NFTs on Solana.
 *
 * NFTs are now minted as real Solana SPL tokens via the marketplace
 * purchase flow (Phantom wallet signing). This route provides read
 * access to minted NFT data.
 */

// GET: List NFTs owned by a user or collection stats
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id");
  const action = request.nextUrl.searchParams.get("action");

  await ensureDbReady();
  const sql = getDb();

  // Get collection stats
  if (action === "collection_stats") {
    const totalMinted = await sql`SELECT COUNT(*) as count FROM minted_nfts`;
    const byRarity = await sql`
      SELECT rarity, COUNT(*) as count FROM minted_nfts GROUP BY rarity ORDER BY count DESC
    `;
    const recentMints = await sql`
      SELECT product_name, product_emoji, mint_address, rarity, owner_type, mint_tx_hash, created_at
      FROM minted_nfts ORDER BY created_at DESC LIMIT 10
    `;

    // Get total marketplace revenue
    let totalRevenue = 0;
    let totalPersonaEarnings = 0;
    try {
      const [rev] = await sql`
        SELECT COALESCE(SUM(total_glitch), 0) as total, COALESCE(SUM(persona_share), 0) as persona
        FROM marketplace_revenue WHERE status IN ('confirmed', 'submitted')
      `;
      totalRevenue = Number(rev.total);
      totalPersonaEarnings = Number(rev.persona);
    } catch { /* table may not exist yet */ }

    return NextResponse.json({
      total_minted: Number(totalMinted[0]?.count || 0),
      collection: "AIG!itch Marketplace NFTs",
      contract: TREASURY_WALLET_STR,
      network: "solana-mainnet",
      nft_type: "Real SPL Token + Metaplex Metadata",
      rarity_breakdown: byRarity,
      recent_mints: recentMints,
      revenue: {
        total_glitch: totalRevenue,
        total_persona_earnings: totalPersonaEarnings,
        treasury_share: totalRevenue - totalPersonaEarnings,
      },
    });
  }

  // Get minted counts per product (for "X remaining" display)
  if (action === "supply") {
    const counts = await sql`
      SELECT product_id, COUNT(*) as minted
      FROM minted_nfts
      GROUP BY product_id
    `;
    const supply: Record<string, number> = {};
    for (const row of counts) {
      supply[row.product_id as string] = Number(row.minted);
    }
    return NextResponse.json({ supply, max_per_product: 100 });
  }

  if (!sessionId) {
    return NextResponse.json({ nfts: [] });
  }

  // Get user's minted NFTs — also check by wallet address as fallback
  // (session_id may have changed during wallet login migration)
  let walletAddress: string | null = null;
  try {
    const [user] = await sql`SELECT phantom_wallet_address FROM human_users WHERE session_id = ${sessionId}`;
    walletAddress = user?.phantom_wallet_address || null;
  } catch { /* ok */ }

  const nfts = walletAddress
    ? await sql`
        SELECT id, product_id, product_name, product_emoji, mint_address, metadata_uri,
               collection, mint_tx_hash, mint_block_number, mint_cost_glitch, mint_fee_sol,
               rarity, edition_number, max_supply, generation, created_at
        FROM minted_nfts
        WHERE owner_type = 'human' AND (owner_id = ${sessionId} OR owner_id IN (
          SELECT session_id FROM human_users WHERE phantom_wallet_address = ${walletAddress}
        ))
        ORDER BY created_at DESC
      `
    : await sql`
        SELECT id, product_id, product_name, product_emoji, mint_address, metadata_uri,
               collection, mint_tx_hash, mint_block_number, mint_cost_glitch, mint_fee_sol,
               rarity, edition_number, max_supply, generation, created_at
        FROM minted_nfts
        WHERE owner_type = 'human' AND owner_id = ${sessionId}
        ORDER BY created_at DESC
      `;

  // Auto-repair: if NFTs found under old session_id, migrate them
  if (nfts.length > 0) {
    try {
      const nftIds = nfts.map(n => n.id as string);
      await sql`UPDATE minted_nfts SET owner_id = ${sessionId} WHERE owner_type = 'human' AND owner_id != ${sessionId} AND id = ANY(${nftIds})`;
    } catch { /* best effort */ }
  }

  return NextResponse.json({ nfts });
}

// POST: NFTs are now minted via /api/marketplace (Phantom signing flow)
// This endpoint returns a redirect message.
export async function POST() {
  return NextResponse.json({
    error: "NFTs are now minted directly through the marketplace. Go to /marketplace to buy and mint NFTs with §GLITCH via Phantom wallet.",
    redirect: "/marketplace",
  }, { status: 410 });
}
