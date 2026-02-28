import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { v4 as uuidv4 } from "uuid";
import { getProductById } from "@/lib/marketplace";
import { PublicKey, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import {
  getServerSolanaConnection,
  TREASURY_WALLET_STR,
  GLITCH_TOKEN_MINT_STR,
  SOLANA_NETWORK,
} from "@/lib/solana-config";
import {
  buildNftPurchaseTransaction,
  parseCoinPrice,
  getRarity,
  rarityColor,
} from "@/lib/nft-mint";

// ── GET: List purchases for a session ──

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

// ── Parse treasury private key ──

function getTreasuryKeypair(): Keypair | null {
  const keyStr = process.env.TREASURY_PRIVATE_KEY;
  if (!keyStr) return null;
  try {
    const trimmed = keyStr.trim();
    if (trimmed.startsWith("[")) {
      const arr = JSON.parse(trimmed);
      return Keypair.fromSecretKey(Uint8Array.from(arr));
    }
    return Keypair.fromSecretKey(bs58.decode(trimmed));
  } catch (err) {
    console.error("Failed to parse TREASURY_PRIVATE_KEY:", err);
    return null;
  }
}

// Rate limiter per wallet (3 purchases/minute)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(wallet: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(wallet);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(wallet, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (entry.count >= 3) return false;
  entry.count++;
  return true;
}

// ── POST: Marketplace actions ──

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action } = body;

  await ensureDbReady();
  const sql = getDb();

  // ── Create NFT purchase transaction (Phantom signs on client) ──
  if (action === "create_purchase") {
    const { session_id, product_id, buyer_wallet } = body;

    if (!session_id || !product_id || !buyer_wallet) {
      return NextResponse.json(
        { error: "Missing session_id, product_id, or buyer_wallet" },
        { status: 400 },
      );
    }

    // Validate wallet address
    let buyerPubkey: PublicKey;
    try {
      buyerPubkey = new PublicKey(buyer_wallet);
    } catch {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
    }

    // Rate limit
    if (!checkRateLimit(buyer_wallet)) {
      return NextResponse.json(
        { error: "Too many purchase requests. Wait a moment." },
        { status: 429 },
      );
    }

    // Look up product
    const product = getProductById(product_id);
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const price = parseCoinPrice(product.price);

    // Check if already owned
    const existing = await sql`
      SELECT id FROM marketplace_purchases
      WHERE session_id = ${session_id} AND product_id = ${product_id}
    `;
    if (existing.length > 0) {
      return NextResponse.json(
        { error: "Already owned", already_owned: true },
        { status: 409 },
      );
    }

    // Get treasury keypair
    const treasuryKeypair = getTreasuryKeypair();
    if (!treasuryKeypair) {
      return NextResponse.json(
        {
          error: "NFT marketplace not available yet. Treasury key not configured.",
          setup_needed: true,
        },
        { status: 503 },
      );
    }

    // Verify keypair matches expected treasury
    if (treasuryKeypair.publicKey.toBase58() !== TREASURY_WALLET_STR) {
      console.error(
        "Treasury keypair mismatch! Expected:",
        TREASURY_WALLET_STR,
        "Got:",
        treasuryKeypair.publicKey.toBase58(),
      );
      return NextResponse.json({ error: "Treasury configuration error" }, { status: 500 });
    }

    try {
      const connection = getServerSolanaConnection();

      // Build the atomic NFT purchase transaction
      const result = await buildNftPurchaseTransaction(
        connection,
        buyerPubkey,
        treasuryKeypair,
        product,
      );

      // Record pending purchase
      const purchaseId = uuidv4();
      await sql`
        INSERT INTO marketplace_purchases (id, session_id, product_id, product_name, product_emoji, price_paid, created_at)
        VALUES (${purchaseId}, ${session_id}, ${product_id}, ${product.name}, ${product.emoji}, ${price}, NOW())
      `;

      // Record pending NFT (will be confirmed after on-chain confirmation)
      const nftId = uuidv4();
      await sql`
        INSERT INTO minted_nfts (id, owner_type, owner_id, product_id, product_name, product_emoji, mint_address, metadata_uri, collection, mint_tx_hash, mint_block_number, mint_cost_glitch, mint_fee_sol, rarity, created_at)
        VALUES (${nftId}, 'human', ${session_id}, ${product_id}, ${product.name}, ${product.emoji}, ${result.mintAddress}, ${result.metadataUri}, 'AIG!itch Marketplace NFTs', 'pending', 0, ${price}, 0, ${result.rarity}, NOW())
      `;

      return NextResponse.json({
        success: true,
        purchase_id: purchaseId,
        nft_id: nftId,
        transaction: result.transaction.toString("base64"),
        mint_address: result.mintAddress,
        rarity: result.rarity,
        rarity_color: result.rarityColorHex,
        price_glitch: price,
        treasury_share: result.treasuryShare,
        persona_share: result.personaShare,
        seller_persona_id: product.seller_persona_id,
        expires_at: new Date(Date.now() + 120000).toISOString(),
        network: SOLANA_NETWORK,
      });
    } catch (err) {
      console.error("NFT purchase transaction creation error:", err);
      const msg = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json({ error: `Purchase failed: ${msg}` }, { status: 500 });
    }
  }

  // ── Submit signed transaction (after Phantom signing) ──
  if (action === "submit_purchase") {
    const { purchase_id, nft_id, signed_transaction, product_id, session_id, seller_persona_id, persona_share } = body;

    if (!purchase_id || !signed_transaction) {
      return NextResponse.json(
        { error: "Missing purchase_id or signed_transaction" },
        { status: 400 },
      );
    }

    try {
      const connection = getServerSolanaConnection();
      const txBuf = Buffer.from(signed_transaction, "base64");

      // Send the raw transaction to Solana
      const txid = await connection.sendRawTransaction(txBuf, {
        skipPreflight: false,
        maxRetries: 3,
      });

      console.log(`Marketplace purchase ${purchase_id} submitted: ${txid}`);

      // Wait for on-chain confirmation
      let confirmed = false;
      try {
        const { blockhash, lastValidBlockHeight } =
          await connection.getLatestBlockhash("confirmed");
        const confirmation = await connection.confirmTransaction(
          { signature: txid, blockhash, lastValidBlockHeight },
          "confirmed",
        );
        if (confirmation.value.err) {
          console.error(`TX ${txid} confirmed but FAILED on-chain:`, confirmation.value.err);
          // Clean up pending records
          if (purchase_id) {
            await sql`DELETE FROM marketplace_purchases WHERE id = ${purchase_id}`;
          }
          if (nft_id) {
            await sql`DELETE FROM minted_nfts WHERE id = ${nft_id}`;
          }
          return NextResponse.json(
            { error: `Transaction failed on-chain. TX: ${txid}`, tx_signature: txid },
            { status: 400 },
          );
        }
        confirmed = true;
        console.log(`Marketplace purchase ${purchase_id} CONFIRMED on-chain: ${txid}`);
      } catch (confirmErr) {
        console.warn(
          `TX ${txid} confirmation timeout:`,
          confirmErr instanceof Error ? confirmErr.message : confirmErr,
        );
      }

      // Update NFT record with real tx data
      if (nft_id) {
        await sql`
          UPDATE minted_nfts
          SET mint_tx_hash = ${txid}, mint_block_number = 0
          WHERE id = ${nft_id}
        `;
      }

      // Record blockchain transaction
      const product = product_id ? getProductById(product_id) : null;
      const price = product ? parseCoinPrice(product.price) : 0;
      const rarity = getRarity(price);

      await sql`
        INSERT INTO blockchain_transactions (id, tx_hash, block_number, from_address, to_address, amount, token, fee_lamports, status, memo, created_at)
        VALUES (${uuidv4()}, ${txid}, 0, ${body.buyer_wallet || 'unknown'}, ${TREASURY_WALLET_STR}, ${price}, 'GLITCH', 5000, ${confirmed ? 'confirmed' : 'submitted'}, ${"NFT Purchase: " + (product?.name || 'Unknown') + " [" + rarity.toUpperCase() + "]"}, NOW())
      `;

      // Record marketplace revenue
      const treasuryShareAmount = Math.ceil(price / 2);
      const personaShareAmount = price - treasuryShareAmount;

      await sql`
        INSERT INTO marketplace_revenue (id, purchase_id, product_id, total_glitch, treasury_share, persona_share, persona_id, tx_signature, status, created_at)
        VALUES (${uuidv4()}, ${purchase_id}, ${product_id || ''}, ${price}, ${treasuryShareAmount}, ${personaShareAmount}, ${seller_persona_id || ''}, ${txid}, ${confirmed ? 'confirmed' : 'submitted'}, NOW())
      `;

      // Credit seller persona with 50% of proceeds
      if (seller_persona_id && personaShareAmount > 0) {
        await sql`
          INSERT INTO ai_persona_coins (id, persona_id, balance, lifetime_earned, updated_at)
          VALUES (${uuidv4()}, ${seller_persona_id}, ${personaShareAmount}, ${personaShareAmount}, NOW())
          ON CONFLICT (persona_id) DO UPDATE SET
            balance = ai_persona_coins.balance + ${personaShareAmount},
            lifetime_earned = ai_persona_coins.lifetime_earned + ${personaShareAmount},
            updated_at = NOW()
        `;
      }

      // Also deduct from user's in-app GlitchCoin balance (they paid on-chain)
      if (session_id) {
        await sql`
          INSERT INTO coin_transactions (id, session_id, amount, reason, reference_id, created_at)
          VALUES (${uuidv4()}, ${session_id}, ${-price}, ${"NFT Purchase (on-chain): " + (product?.name || 'Unknown')}, ${txid}, NOW())
        `;
      }

      // Get NFT data for response
      let nftData = null;
      if (nft_id) {
        const [nft] = await sql`
          SELECT mint_address, rarity, metadata_uri FROM minted_nfts WHERE id = ${nft_id}
        `;
        if (nft) {
          nftData = {
            mint_address: nft.mint_address,
            rarity: nft.rarity,
            rarity_color: rarityColor(nft.rarity as string),
            collection: "AIG!itch Marketplace NFTs",
            tx_hash: txid,
            explorer_url: `https://solscan.io/token/${nft.mint_address}`,
            tx_explorer_url: `https://solscan.io/tx/${txid}`,
          };
        }
      }

      return NextResponse.json({
        success: true,
        purchase_id,
        tx_signature: txid,
        confirmed,
        nft: nftData,
        revenue: {
          total_glitch: price,
          treasury_share: treasuryShareAmount,
          persona_share: personaShareAmount,
          persona_id: seller_persona_id,
        },
        message: confirmed
          ? "NFT minted on Solana! Check your Phantom wallet."
          : "Transaction submitted — confirming on-chain. Check Solscan for status.",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Submission failed";
      console.error("NFT purchase TX submission error:", msg);

      // If transaction was rejected by user, clean up pending records
      if (msg.includes("User rejected") || msg.includes("cancelled")) {
        if (purchase_id) {
          await sql`DELETE FROM marketplace_purchases WHERE id = ${purchase_id}`;
        }
        if (nft_id) {
          await sql`DELETE FROM minted_nfts WHERE id = ${nft_id}`;
        }
      }

      return NextResponse.json({ error: `Transaction failed: ${msg}` }, { status: 500 });
    }
  }

  // ── Cancel pending purchase (cleanup if user cancels) ──
  if (action === "cancel_purchase") {
    const { purchase_id, nft_id } = body;
    if (purchase_id) {
      await sql`DELETE FROM marketplace_purchases WHERE id = ${purchase_id}`;
    }
    if (nft_id) {
      await sql`DELETE FROM minted_nfts WHERE id = ${nft_id}`;
    }
    return NextResponse.json({ success: true, message: "Purchase cancelled" });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
