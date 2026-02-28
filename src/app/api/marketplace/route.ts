import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { v4 as uuidv4 } from "uuid";
import { getProductById } from "@/lib/marketplace";

function parseCoinPrice(priceStr: string): number {
  // "§42.99" → 42 (whole coins, no fractional)
  const num = parseFloat(priceStr.replace("§", ""));
  return Math.ceil(num);
}

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ purchases: [] });
  }

  const sql = getDb();
  await ensureDbReady();

  const purchases = await sql`
    SELECT product_id, product_name, product_emoji, price_paid, created_at
    FROM marketplace_purchases
    WHERE session_id = ${sessionId}
    ORDER BY created_at DESC
  `;

  return NextResponse.json({ purchases });
}

// NFT mint constants (auto-mint on purchase for wallet users)
const NFT_MINT_FEE_SOL = 0.001;

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

function generateMintAddress(): string {
  const chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let addr = "NFTg1";
  for (let i = 0; i < 39; i++) addr += chars[Math.floor(Math.random() * chars.length)];
  return addr;
}

function generateTxHash(): string {
  const chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let hash = "";
  for (let i = 0; i < 88; i++) hash += chars[Math.floor(Math.random() * chars.length)];
  return hash;
}

function getCurrentBlock(): number {
  const genesis = new Date("2025-01-01").getTime();
  return Math.floor((Date.now() - genesis) / 400);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { session_id, product_id } = body;

  if (!session_id || !product_id) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const sql = getDb();
  await ensureDbReady();

  // Look up the product
  const product = getProductById(product_id);
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const price = parseCoinPrice(product.price);

  // Check if already owned
  const existing = await sql`
    SELECT id FROM marketplace_purchases WHERE session_id = ${session_id} AND product_id = ${product_id}
  `;
  if (existing.length > 0) {
    return NextResponse.json({ error: "Already owned", already_owned: true }, { status: 409 });
  }

  // Check balance
  const balanceRows = await sql`
    SELECT balance FROM glitch_coins WHERE session_id = ${session_id}
  `;
  const balance = balanceRows.length > 0 ? Number(balanceRows[0].balance) : 0;

  if (balance < price) {
    return NextResponse.json({
      error: "Insufficient GlitchCoin",
      balance,
      price,
      shortfall: price - balance,
    }, { status: 402 });
  }

  // Deduct coins
  await sql`
    UPDATE glitch_coins
    SET balance = balance - ${price}, updated_at = NOW()
    WHERE session_id = ${session_id}
  `;

  // Record transaction (negative amount = purchase)
  await sql`
    INSERT INTO coin_transactions (id, session_id, amount, reason, reference_id, created_at)
    VALUES (${uuidv4()}, ${session_id}, ${-price}, ${"Purchased: " + product.name}, ${product_id}, NOW())
  `;

  // Record purchase
  await sql`
    INSERT INTO marketplace_purchases (id, session_id, product_id, product_name, product_emoji, price_paid, created_at)
    VALUES (${uuidv4()}, ${session_id}, ${product_id}, ${product.name}, ${product.emoji}, ${price}, NOW())
  `;

  // Auto-mint as NFT — check if user has a wallet
  const wallet = await sql`
    SELECT wallet_address, sol_balance FROM solana_wallets WHERE owner_type = 'human' AND owner_id = ${session_id}
  `;

  let nftData = null;
  if (wallet.length > 0) {
    const walletAddr = wallet[0].wallet_address as string;
    const solBalance = Number(wallet[0].sol_balance);

    // Auto-mint if user has enough SOL for gas
    if (solBalance >= NFT_MINT_FEE_SOL) {
      const rarity = getRarity(price);
      const mintAddress = generateMintAddress();
      const txHash = generateTxHash();
      const block = getCurrentBlock();
      const metadataUri = `https://arweave.net/G1tCH_${product_id}_${Date.now().toString(36)}`;

      // Deduct SOL gas fee
      await sql`UPDATE solana_wallets SET sol_balance = sol_balance - ${NFT_MINT_FEE_SOL}, updated_at = NOW() WHERE wallet_address = ${walletAddr}`;

      // Create NFT record
      await sql`
        INSERT INTO minted_nfts (id, owner_type, owner_id, product_id, product_name, product_emoji, mint_address, metadata_uri, collection, mint_tx_hash, mint_block_number, mint_cost_glitch, mint_fee_sol, rarity, created_at)
        VALUES (${uuidv4()}, 'human', ${session_id}, ${product_id}, ${product.name}, ${product.emoji}, ${mintAddress}, ${metadataUri}, 'AIG!itch Marketplace NFTs', ${txHash}, ${block}, ${price}, ${NFT_MINT_FEE_SOL}, ${rarity}, NOW())
      `;

      // Record blockchain transaction
      await sql`
        INSERT INTO blockchain_transactions (id, tx_hash, block_number, from_address, to_address, amount, token, fee_lamports, status, memo, created_at)
        VALUES (${uuidv4()}, ${txHash}, ${block}, 'G1tCHNFTm1nTaUtHoR1tY69420BrrRrR00000', ${walletAddr}, 1, 'NFT', ${Math.floor(NFT_MINT_FEE_SOL * 1000000000)}, 'confirmed', ${"Mint NFT: " + product.name + " [" + rarity.toUpperCase() + "]"}, NOW())
      `;

      nftData = {
        mint_address: mintAddress,
        rarity,
        rarity_color: rarityColor(rarity),
        collection: "AIG!itch Marketplace NFTs",
        tx_hash: txHash,
        block_number: block,
        explorer_url: `https://solscan.io/token/${mintAddress}`,
      };
    }
  }

  // Get updated balance
  const [updated] = await sql`SELECT balance FROM glitch_coins WHERE session_id = ${session_id}`;

  return NextResponse.json({
    success: true,
    product_name: product.name,
    product_emoji: product.emoji,
    price_paid: price,
    new_balance: Number(updated.balance),
    // NFT data included if auto-minted
    nft: nftData,
    auto_minted: !!nftData,
  });
}
