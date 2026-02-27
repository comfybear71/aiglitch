import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { v4 as uuidv4 } from "uuid";
import { getProductById } from "@/lib/marketplace";

// NFT mint cost in $GLITCH (on top of the product purchase price)
const NFT_MINT_COST_GLITCH = 50; // §50 $GLITCH to mint any item as NFT
const NFT_MINT_FEE_SOL = 0.001; // 0.001 SOL gas fee for minting

// Rarity tiers based on product price
function getRarity(price: number): string {
  if (price >= 200) return "legendary";
  if (price >= 100) return "epic";
  if (price >= 50) return "rare";
  if (price >= 25) return "uncommon";
  return "common";
}

function rarityColor(rarity: string): string {
  switch (rarity) {
    case "legendary": return "#FFD700";
    case "epic": return "#A855F7";
    case "rare": return "#3B82F6";
    case "uncommon": return "#22C55E";
    default: return "#9CA3AF";
  }
}

// Generate a fake NFT mint address
function generateMintAddress(): string {
  const chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let addr = "NFTg1"; // NFT prefix for GlitchCoin NFTs
  for (let i = 0; i < 39; i++) {
    addr += chars[Math.floor(Math.random() * chars.length)];
  }
  return addr;
}

// Generate fake tx hash
function generateTxHash(): string {
  const chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let hash = "";
  for (let i = 0; i < 88; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)];
  }
  return hash;
}

function getCurrentBlock(): number {
  const genesis = new Date("2025-01-01").getTime();
  return Math.floor((Date.now() - genesis) / 400);
}

// GET: List NFTs owned by a user or all NFTs
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
      SELECT product_name, product_emoji, mint_address, rarity, owner_type, created_at
      FROM minted_nfts ORDER BY created_at DESC LIMIT 10
    `;

    return NextResponse.json({
      total_minted: Number(totalMinted[0]?.count || 0),
      collection: "AIG!itch Marketplace NFTs",
      contract: "G1tCHc0iN69420SoLaNaDeGeNeRaTe42069BrrRrR",
      rarity_breakdown: byRarity,
      recent_mints: recentMints,
      mint_cost: { glitch: NFT_MINT_COST_GLITCH, sol_fee: NFT_MINT_FEE_SOL },
    });
  }

  if (!sessionId) {
    return NextResponse.json({ nfts: [] });
  }

  // Get user's minted NFTs
  const nfts = await sql`
    SELECT id, product_id, product_name, product_emoji, mint_address, metadata_uri,
           collection, mint_tx_hash, mint_block_number, mint_cost_glitch, mint_fee_sol,
           rarity, created_at
    FROM minted_nfts
    WHERE owner_type = 'human' AND owner_id = ${sessionId}
    ORDER BY created_at DESC
  `;

  return NextResponse.json({ nfts });
}

// POST: Mint a marketplace item as an NFT
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { session_id, product_id } = body;

  if (!session_id || !product_id) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  await ensureDbReady();
  const sql = getDb();

  // Check the product exists
  const product = getProductById(product_id);
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  // Check user owns the item
  const owned = await sql`
    SELECT id FROM marketplace_purchases WHERE session_id = ${session_id} AND product_id = ${product_id}
  `;
  if (owned.length === 0) {
    return NextResponse.json({ error: "You must own this item to mint it as an NFT. Buy it first!" }, { status: 403 });
  }

  // Check not already minted by this user
  const alreadyMinted = await sql`
    SELECT id FROM minted_nfts WHERE owner_type = 'human' AND owner_id = ${session_id} AND product_id = ${product_id}
  `;
  if (alreadyMinted.length > 0) {
    return NextResponse.json({ error: "Already minted this item as an NFT!", already_minted: true }, { status: 409 });
  }

  // Check $GLITCH balance for mint cost
  const coinRows = await sql`SELECT balance FROM glitch_coins WHERE session_id = ${session_id}`;
  const coinBalance = coinRows.length > 0 ? Number(coinRows[0].balance) : 0;
  if (coinBalance < NFT_MINT_COST_GLITCH) {
    return NextResponse.json({
      error: `Need §${NFT_MINT_COST_GLITCH} $GLITCH to mint. You have §${coinBalance}.`,
      balance: coinBalance,
      mint_cost: NFT_MINT_COST_GLITCH,
      shortfall: NFT_MINT_COST_GLITCH - coinBalance,
    }, { status: 402 });
  }

  // Check SOL balance for gas fee
  const wallet = await sql`
    SELECT wallet_address, sol_balance FROM solana_wallets WHERE owner_type = 'human' AND owner_id = ${session_id}
  `;
  if (wallet.length === 0) {
    return NextResponse.json({ error: "Create a Solana wallet first! Go to the Wallet tab." }, { status: 400 });
  }
  const solBalance = Number(wallet[0].sol_balance);
  if (solBalance < NFT_MINT_FEE_SOL) {
    return NextResponse.json({
      error: `Need ${NFT_MINT_FEE_SOL} SOL for mint gas fee. You have ${solBalance.toFixed(6)} SOL. Use the faucet!`,
      sol_balance: solBalance,
      fee_required: NFT_MINT_FEE_SOL,
    }, { status: 402 });
  }

  const walletAddr = wallet[0].wallet_address as string;
  const price = Math.ceil(parseFloat(product.price.replace("§", "")));
  const rarity = getRarity(price);
  const mintAddress = generateMintAddress();
  const txHash = generateTxHash();
  const block = getCurrentBlock();
  const metadataUri = `https://arweave.net/G1tCH_${product_id}_${Date.now().toString(36)}`;

  // Deduct $GLITCH mint cost
  await sql`UPDATE glitch_coins SET balance = balance - ${NFT_MINT_COST_GLITCH}, updated_at = NOW() WHERE session_id = ${session_id}`;
  await sql`
    INSERT INTO coin_transactions (id, session_id, amount, reason, reference_id, created_at)
    VALUES (${uuidv4()}, ${session_id}, ${-NFT_MINT_COST_GLITCH}, ${"NFT mint: " + product.name}, ${mintAddress}, NOW())
  `;

  // Deduct SOL gas fee
  await sql`UPDATE solana_wallets SET sol_balance = sol_balance - ${NFT_MINT_FEE_SOL}, updated_at = NOW() WHERE wallet_address = ${walletAddr}`;

  // Create the NFT record
  await sql`
    INSERT INTO minted_nfts (id, owner_type, owner_id, product_id, product_name, product_emoji, mint_address, metadata_uri, collection, mint_tx_hash, mint_block_number, mint_cost_glitch, mint_fee_sol, rarity, created_at)
    VALUES (${uuidv4()}, 'human', ${session_id}, ${product_id}, ${product.name}, ${product.emoji}, ${mintAddress}, ${metadataUri}, 'AIG!itch Marketplace NFTs', ${txHash}, ${block}, ${NFT_MINT_COST_GLITCH}, ${NFT_MINT_FEE_SOL}, ${rarity}, NOW())
  `;

  // Record on-chain mint transaction
  await sql`
    INSERT INTO blockchain_transactions (id, tx_hash, block_number, from_address, to_address, amount, token, fee_lamports, status, memo, created_at)
    VALUES (${uuidv4()}, ${txHash}, ${block}, 'G1tCHNFTm1nTaUtHoR1tY69420BrrRrR00000', ${walletAddr}, 1, 'NFT', ${Math.floor(NFT_MINT_FEE_SOL * 1000000000)}, 'confirmed', ${"Mint NFT: " + product.name + " [" + rarity.toUpperCase() + "]"}, NOW())
  `;

  // Get updated balances
  const [updatedCoins] = await sql`SELECT balance FROM glitch_coins WHERE session_id = ${session_id}`;
  const [updatedWallet] = await sql`SELECT sol_balance FROM solana_wallets WHERE wallet_address = ${walletAddr}`;

  return NextResponse.json({
    success: true,
    nft: {
      mint_address: mintAddress,
      product_name: product.name,
      product_emoji: product.emoji,
      rarity,
      rarity_color: rarityColor(rarity),
      collection: "AIG!itch Marketplace NFTs",
      metadata_uri: metadataUri,
      tx_hash: txHash,
      block_number: block,
      explorer_url: `https://solscan.io/token/${mintAddress}`,
    },
    costs: {
      glitch_paid: NFT_MINT_COST_GLITCH,
      sol_fee_paid: NFT_MINT_FEE_SOL,
    },
    new_balance: Number(updatedCoins.balance),
    new_sol_balance: Number(updatedWallet.sol_balance),
  });
}
