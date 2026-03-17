import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getServerSolanaConnection } from "@/lib/solana-config";

export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  const action = request.nextUrl.searchParams.get("action") || "list";

  // List all NFTs with owner info
  if (action === "list") {
    const nfts = await sql`
      SELECT n.*,
             hu.display_name as owner_name, hu.username as owner_username, hu.avatar_emoji as owner_emoji
      FROM minted_nfts n
      LEFT JOIN human_users hu ON n.owner_type = 'human' AND n.owner_id = hu.session_id
      ORDER BY n.created_at DESC
      LIMIT 200
    `;
    return NextResponse.json({ nfts });
  }

  // Find orphaned/pending NFTs
  if (action === "pending") {
    const pending = await sql`
      SELECT n.*,
             hu.display_name as owner_name, hu.username as owner_username
      FROM minted_nfts n
      LEFT JOIN human_users hu ON n.owner_type = 'human' AND n.owner_id = hu.session_id
      WHERE n.mint_tx_hash = 'pending'
      ORDER BY n.created_at DESC
    `;
    return NextResponse.json({ pending });
  }

  // Lookup NFT by Solana tx signature (accepts raw sig or Solscan URL)
  if (action === "lookup_tx") {
    let txSig = request.nextUrl.searchParams.get("tx");
    if (!txSig) return NextResponse.json({ error: "tx parameter required" }, { status: 400 });

    // Extract tx signature from Solscan/Explorer URLs
    const solscanMatch = txSig.match(/solscan\.io\/tx\/([A-Za-z0-9]+)/);
    const explorerMatch = txSig.match(/explorer\.solana\.com\/tx\/([A-Za-z0-9]+)/);
    if (solscanMatch) txSig = solscanMatch[1];
    else if (explorerMatch) txSig = explorerMatch[1];

    try {
      const connection = getServerSolanaConnection();
      const txInfo = await connection.getTransaction(txSig, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      });

      if (!txInfo) {
        return NextResponse.json({ error: "Transaction not found on Solana", tx: txSig }, { status: 404 });
      }

      // Check if we have this tx in our DB
      const [existing] = await sql`
        SELECT id, product_name, owner_id, mint_tx_hash FROM minted_nfts WHERE mint_tx_hash = ${txSig}
      `;

      // Also check blockchain_transactions
      const [btx] = await sql`
        SELECT id, memo, status FROM blockchain_transactions WHERE tx_hash = ${txSig}
      `;

      return NextResponse.json({
        tx_signature: txSig,
        on_chain: {
          slot: txInfo.slot,
          blockTime: txInfo.blockTime,
          fee: txInfo.meta?.fee,
          success: txInfo.meta?.err === null,
          accounts: txInfo.transaction.message.getAccountKeys().staticAccountKeys.map(k => k.toBase58()),
        },
        db_nft: existing || null,
        db_blockchain_tx: btx || null,
      });
    } catch (err) {
      return NextResponse.json({ error: `Solana lookup failed: ${err instanceof Error ? err.message : "unknown"}` }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

// POST: Reconcile / fix NFTs
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  const body = await request.json();
  const { action } = body;

  // Reconcile a pending NFT with its real tx signature
  if (action === "reconcile") {
    const { nft_id } = body;
    let { tx_signature } = body;
    if (!nft_id || !tx_signature) {
      return NextResponse.json({ error: "nft_id and tx_signature required" }, { status: 400 });
    }
    // Extract sig from Solscan/Explorer URLs
    const solscanMatch = tx_signature.match(/solscan\.io\/tx\/([A-Za-z0-9]+)/);
    const explorerMatch = tx_signature.match(/explorer\.solana\.com\/tx\/([A-Za-z0-9]+)/);
    if (solscanMatch) tx_signature = solscanMatch[1];
    else if (explorerMatch) tx_signature = explorerMatch[1];

    // Verify the NFT exists and is pending
    const [nft] = await sql`SELECT id, mint_tx_hash, owner_id, product_name FROM minted_nfts WHERE id = ${nft_id}`;
    if (!nft) return NextResponse.json({ error: "NFT not found" }, { status: 404 });

    // Verify tx exists on-chain
    try {
      const connection = getServerSolanaConnection();
      const txInfo = await connection.getTransaction(tx_signature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      });
      if (!txInfo) return NextResponse.json({ error: "Transaction not found on Solana" }, { status: 404 });
      if (txInfo.meta?.err) return NextResponse.json({ error: "Transaction failed on-chain", details: txInfo.meta.err }, { status: 400 });
    } catch (err) {
      return NextResponse.json({ error: `Solana verification failed: ${err instanceof Error ? err.message : "unknown"}` }, { status: 500 });
    }

    // Update the NFT record
    await sql`
      UPDATE minted_nfts
      SET mint_tx_hash = ${tx_signature}, mint_block_number = 0
      WHERE id = ${nft_id}
    `;

    return NextResponse.json({ success: true, message: `NFT "${nft.product_name}" reconciled with tx ${tx_signature}` });
  }

  // Bulk reconcile: find pending NFTs and try to match them with on-chain transactions
  if (action === "auto_reconcile") {
    const { session_id } = body;

    // Get all pending NFTs for this user (or all users)
    const pending = session_id
      ? await sql`SELECT id, mint_address, owner_id, product_name, created_at FROM minted_nfts WHERE mint_tx_hash = 'pending' AND owner_id = ${session_id}`
      : await sql`SELECT id, mint_address, owner_id, product_name, created_at FROM minted_nfts WHERE mint_tx_hash = 'pending'`;

    if (pending.length === 0) {
      return NextResponse.json({ success: true, message: "No pending NFTs to reconcile", reconciled: 0 });
    }

    const connection = getServerSolanaConnection();
    let reconciled = 0;
    const results: { nft_id: string; product: string; status: string; tx?: string }[] = [];

    for (const nft of pending) {
      try {
        // Try to find the mint on-chain by looking up the mint address
        const mintAddress = nft.mint_address as string;
        if (!mintAddress || mintAddress === "pending") {
          results.push({ nft_id: nft.id as string, product: nft.product_name as string, status: "no_mint_address" });
          continue;
        }

        // Check if the mint account exists on-chain
        const { PublicKey } = await import("@solana/web3.js");
        const mintPubkey = new PublicKey(mintAddress);
        const accountInfo = await connection.getAccountInfo(mintPubkey);

        if (accountInfo) {
          // Mint exists on-chain! Try to find the transaction
          const signatures = await connection.getSignaturesForAddress(mintPubkey, { limit: 5 });
          if (signatures.length > 0) {
            // Use the first (most recent) confirmed signature
            const sig = signatures[signatures.length - 1]; // oldest = creation tx
            await sql`
              UPDATE minted_nfts
              SET mint_tx_hash = ${sig.signature}, mint_block_number = ${sig.slot || 0}
              WHERE id = ${nft.id}
            `;
            reconciled++;
            results.push({ nft_id: nft.id as string, product: nft.product_name as string, status: "reconciled", tx: sig.signature });
          } else {
            results.push({ nft_id: nft.id as string, product: nft.product_name as string, status: "mint_exists_no_tx" });
          }
        } else {
          // Mint doesn't exist on-chain — this NFT was never actually minted
          results.push({ nft_id: nft.id as string, product: nft.product_name as string, status: "not_minted_on_chain" });
        }
      } catch (err) {
        results.push({ nft_id: nft.id as string, product: nft.product_name as string, status: `error: ${err instanceof Error ? err.message : "unknown"}` });
      }
    }

    return NextResponse.json({ success: true, reconciled, total_pending: pending.length, results });
  }

  // Manually assign an NFT to a user by tx signature
  if (action === "assign_by_tx") {
    const { tx_signature, session_id } = body;
    if (!tx_signature || !session_id) {
      return NextResponse.json({ error: "tx_signature and session_id required" }, { status: 400 });
    }

    // Check if this tx already has an NFT record
    const [existing] = await sql`SELECT id FROM minted_nfts WHERE mint_tx_hash = ${tx_signature}`;
    if (existing) {
      // Update the owner
      await sql`UPDATE minted_nfts SET owner_id = ${session_id} WHERE id = ${existing.id}`;
      return NextResponse.json({ success: true, message: "NFT ownership updated", nft_id: existing.id });
    }

    return NextResponse.json({ error: "No NFT found with this tx signature. Use reconcile for pending NFTs." }, { status: 404 });
  }

  // Delete orphaned pending NFTs (never minted on-chain)
  if (action === "cleanup_pending") {
    const { older_than_hours } = body;
    const hours = older_than_hours || 24;

    const deleted = await sql`
      DELETE FROM minted_nfts
      WHERE mint_tx_hash = 'pending' AND created_at < NOW() - INTERVAL '1 hour' * ${hours}
      RETURNING id, product_name, owner_id
    `;

    // Also clean up matching marketplace_purchases for orphaned NFTs
    for (const nft of deleted) {
      await sql`
        DELETE FROM marketplace_purchases
        WHERE session_id = ${nft.owner_id} AND product_name = ${nft.product_name}
        AND id NOT IN (
          SELECT mp.id FROM marketplace_purchases mp
          JOIN minted_nfts mn ON mp.session_id = mn.owner_id AND mp.product_name = mn.product_name
          WHERE mn.mint_tx_hash != 'pending'
        )
      `;
    }

    return NextResponse.json({ success: true, deleted: deleted.length, items: deleted });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
