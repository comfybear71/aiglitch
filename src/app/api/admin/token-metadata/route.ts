import { NextRequest, NextResponse } from "next/server";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import bs58 from "bs58";
import {
  getServerSolanaConnection,
  GLITCH_TOKEN_MINT_STR,
  TREASURY_WALLET_STR,
  ADMIN_WALLET_STR,
  getTokenMetadataProgramId,
  getMetadataPDA,
  getAppBaseUrl,
} from "@/lib/solana-config";

/**
 * POST /api/admin/token-metadata
 *
 * Creates or updates the Metaplex on-chain metadata for the $GLITCH token.
 * This makes the token show its name, symbol, and logo in Phantom and other wallets.
 *
 * Requires TREASURY_PRIVATE_KEY in env (the mint authority / update authority).
 *
 * Actions:
 *   - "check"  — Check if metadata already exists on-chain
 *   - "create" — Create metadata (first time only)
 *   - "update" — Update existing metadata (name, symbol, URI)
 */

// ── Borsh string serializer ──
function writeBorshString(buf: Buffer, offset: number, str: string): number {
  const bytes = Buffer.from(str, "utf8");
  buf.writeUInt32LE(bytes.length, offset);
  offset += 4;
  bytes.copy(buf, offset);
  offset += bytes.length;
  return offset;
}

// ── CreateMetadataAccountV3 (discriminator = 33) ──
function buildCreateMetadataInstruction(
  metadataAccount: PublicKey,
  mint: PublicKey,
  mintAuthority: PublicKey,
  payer: PublicKey,
  updateAuthority: PublicKey,
  name: string,
  symbol: string,
  uri: string,
): TransactionInstruction {
  const buf = Buffer.alloc(600);
  let offset = 0;

  // Discriminator
  buf.writeUInt8(33, offset); offset += 1;
  // DataV2
  offset = writeBorshString(buf, offset, name.slice(0, 32));
  offset = writeBorshString(buf, offset, symbol.slice(0, 10));
  offset = writeBorshString(buf, offset, uri.slice(0, 200));
  buf.writeUInt16LE(0, offset); offset += 2; // seller_fee_basis_points
  // creators: Some([{treasury, verified=true, share=100}])
  buf.writeUInt8(1, offset); offset += 1;
  buf.writeUInt32LE(1, offset); offset += 4;
  new PublicKey(TREASURY_WALLET_STR).toBuffer().copy(buf, offset); offset += 32;
  buf.writeUInt8(1, offset); offset += 1; // verified
  buf.writeUInt8(100, offset); offset += 1; // share
  buf.writeUInt8(0, offset); offset += 1; // collection: None
  buf.writeUInt8(0, offset); offset += 1; // uses: None
  // is_mutable
  buf.writeUInt8(1, offset); offset += 1;
  // collection_details: None
  buf.writeUInt8(0, offset); offset += 1;

  return new TransactionInstruction({
    keys: [
      { pubkey: metadataAccount, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: mintAuthority, isSigner: true, isWritable: false },
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: updateAuthority, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    programId: getTokenMetadataProgramId(),
    data: buf.slice(0, offset),
  });
}

// ── UpdateMetadataAccountV2 (discriminator = 15) ──
function buildUpdateMetadataInstruction(
  metadataAccount: PublicKey,
  updateAuthority: PublicKey,
  name: string,
  symbol: string,
  uri: string,
): TransactionInstruction {
  const buf = Buffer.alloc(600);
  let offset = 0;

  // Discriminator
  buf.writeUInt8(15, offset); offset += 1;

  // data: Option<DataV2> — Some
  buf.writeUInt8(1, offset); offset += 1;
  offset = writeBorshString(buf, offset, name.slice(0, 32));
  offset = writeBorshString(buf, offset, symbol.slice(0, 10));
  offset = writeBorshString(buf, offset, uri.slice(0, 200));
  buf.writeUInt16LE(0, offset); offset += 2; // seller_fee_basis_points
  // creators: Some([{treasury, verified=true, share=100}])
  buf.writeUInt8(1, offset); offset += 1;
  buf.writeUInt32LE(1, offset); offset += 4;
  new PublicKey(TREASURY_WALLET_STR).toBuffer().copy(buf, offset); offset += 32;
  buf.writeUInt8(1, offset); offset += 1; // verified
  buf.writeUInt8(100, offset); offset += 1; // share
  buf.writeUInt8(0, offset); offset += 1; // collection: None
  buf.writeUInt8(0, offset); offset += 1; // uses: None

  // new_update_authority: Option<Pubkey> — None (keep current)
  buf.writeUInt8(0, offset); offset += 1;
  // primary_sale_happened: Option<bool> — None
  buf.writeUInt8(0, offset); offset += 1;
  // is_mutable: Option<bool> — Some(true)
  buf.writeUInt8(1, offset); offset += 1;
  buf.writeUInt8(1, offset); offset += 1;

  return new TransactionInstruction({
    keys: [
      { pubkey: metadataAccount, isSigner: false, isWritable: true },
      { pubkey: updateAuthority, isSigner: true, isWritable: false },
    ],
    programId: getTokenMetadataProgramId(),
    data: buf.slice(0, offset),
  });
}

// Parse treasury keypair from env
function getTreasuryKeypair(): Keypair | null {
  const keyStr = process.env.TREASURY_PRIVATE_KEY;
  if (!keyStr) return null;
  try {
    const trimmed = keyStr.trim();
    if (trimmed.startsWith("[")) {
      return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(trimmed)));
    }
    return Keypair.fromSecretKey(bs58.decode(trimmed));
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, admin_wallet } = body;

  // Basic auth check — must provide admin wallet
  if (admin_wallet !== ADMIN_WALLET_STR) {
    return NextResponse.json({ error: "Unauthorized. Admin wallet required." }, { status: 403 });
  }

  const connection = getServerSolanaConnection();
  const glitchMint = new PublicKey(GLITCH_TOKEN_MINT_STR);
  const metadataPDA = getMetadataPDA(glitchMint);
  const baseUrl = getAppBaseUrl();
  const metadataUri = `${baseUrl}/api/token/metadata`;

  const TOKEN_NAME = "AIG!itch";
  const TOKEN_SYMBOL = "GLITCH";

  // ── Check if metadata exists ──
  if (action === "check") {
    try {
      const accountInfo = await connection.getAccountInfo(metadataPDA);
      const exists = accountInfo !== null && accountInfo.data.length > 0;

      return NextResponse.json({
        metadata_exists: exists,
        metadata_pda: metadataPDA.toBase58(),
        token_mint: GLITCH_TOKEN_MINT_STR,
        metadata_uri: metadataUri,
        logo_url: `${baseUrl}/api/token/logo`,
        action_needed: exists ? "update" : "create",
        message: exists
          ? "Metadata exists on-chain. Use action='update' to change it."
          : "No metadata found. Use action='create' to attach metadata.",
      });
    } catch (err) {
      return NextResponse.json({
        error: err instanceof Error ? err.message : "Check failed",
      }, { status: 500 });
    }
  }

  // ── Create metadata (first time) ──
  if (action === "create") {
    const treasuryKeypair = getTreasuryKeypair();
    if (!treasuryKeypair) {
      return NextResponse.json({
        error: "TREASURY_PRIVATE_KEY not configured",
      }, { status: 503 });
    }

    // Verify keypair matches
    if (treasuryKeypair.publicKey.toBase58() !== TREASURY_WALLET_STR) {
      return NextResponse.json({ error: "Treasury keypair mismatch" }, { status: 500 });
    }

    // Check if metadata already exists
    const existing = await connection.getAccountInfo(metadataPDA);
    if (existing) {
      return NextResponse.json({
        error: "Metadata already exists. Use action='update' instead.",
        metadata_pda: metadataPDA.toBase58(),
      }, { status: 409 });
    }

    try {
      const tx = new Transaction();
      tx.add(
        buildCreateMetadataInstruction(
          metadataPDA,
          glitchMint,
          treasuryKeypair.publicKey, // mint authority
          treasuryKeypair.publicKey, // payer
          treasuryKeypair.publicKey, // update authority
          TOKEN_NAME,
          TOKEN_SYMBOL,
          metadataUri,
        ),
      );

      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = treasuryKeypair.publicKey;
      tx.sign(treasuryKeypair);

      const txid = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });

      // Wait for confirmation
      const { blockhash: bh2, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      await connection.confirmTransaction({ signature: txid, blockhash: bh2, lastValidBlockHeight }, "confirmed");

      return NextResponse.json({
        success: true,
        action: "created",
        tx_signature: txid,
        metadata_pda: metadataPDA.toBase58(),
        metadata_uri: metadataUri,
        logo_url: `${baseUrl}/api/token/logo`,
        explorer: `https://solscan.io/tx/${txid}`,
        message: "$GLITCH token metadata created on-chain! Logo and name should appear in Phantom shortly.",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Create failed";
      console.error("Token metadata create error:", msg);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // ── Update metadata ──
  if (action === "update") {
    const treasuryKeypair = getTreasuryKeypair();
    if (!treasuryKeypair) {
      return NextResponse.json({
        error: "TREASURY_PRIVATE_KEY not configured",
      }, { status: 503 });
    }

    if (treasuryKeypair.publicKey.toBase58() !== TREASURY_WALLET_STR) {
      return NextResponse.json({ error: "Treasury keypair mismatch" }, { status: 500 });
    }

    // Verify metadata exists
    const existing = await connection.getAccountInfo(metadataPDA);
    if (!existing) {
      return NextResponse.json({
        error: "No metadata found. Use action='create' first.",
      }, { status: 404 });
    }

    try {
      // Allow custom name/symbol/uri override from request body
      const name = body.name || TOKEN_NAME;
      const symbol = body.symbol || TOKEN_SYMBOL;
      const uri = body.uri || metadataUri;

      const tx = new Transaction();
      tx.add(
        buildUpdateMetadataInstruction(
          metadataPDA,
          treasuryKeypair.publicKey, // update authority
          name,
          symbol,
          uri,
        ),
      );

      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = treasuryKeypair.publicKey;
      tx.sign(treasuryKeypair);

      const txid = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });

      const { blockhash: bh2, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      await connection.confirmTransaction({ signature: txid, blockhash: bh2, lastValidBlockHeight }, "confirmed");

      return NextResponse.json({
        success: true,
        action: "updated",
        tx_signature: txid,
        metadata_pda: metadataPDA.toBase58(),
        name,
        symbol,
        uri,
        logo_url: `${baseUrl}/api/token/logo`,
        explorer: `https://solscan.io/tx/${txid}`,
        message: "$GLITCH token metadata updated! Changes should reflect in Phantom shortly.",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Update failed";
      console.error("Token metadata update error:", msg);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  return NextResponse.json({
    error: "Invalid action. Use 'check', 'create', or 'update'.",
    metadata_uri: metadataUri,
    logo_url: `${baseUrl}/api/token/logo`,
  }, { status: 400 });
}
