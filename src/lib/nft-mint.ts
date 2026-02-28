/**
 * NFT Minting Helpers for AIG!itch Marketplace
 *
 * Creates real Solana NFTs using:
 *  - @solana/spl-token for mint + token account creation
 *  - Metaplex Token Metadata program for on-chain metadata
 *
 * No external Metaplex SDK required — instructions are constructed manually.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  createSetAuthorityInstruction,
  AuthorityType,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MINT_SIZE,
  getMinimumBalanceForRentExemptMint,
  createTransferCheckedInstruction,
} from "@solana/spl-token";
import {
  getTokenMetadataProgramId,
  getMetadataPDA,
  getAppBaseUrl,
  TREASURY_WALLET_STR,
  GLITCH_TOKEN_MINT_STR,
  TOKENOMICS,
} from "@/lib/solana-config";
import { type MarketplaceProduct } from "@/lib/marketplace";

// ── Metaplex CreateMetadataAccountV3 Instruction Builder ──
// Manually serializes the Borsh-encoded instruction data.
// Avoids heavy @metaplex-foundation dependency.

function serializeBorshString(buf: Buffer, offset: number, str: string): number {
  const bytes = Buffer.from(str, "utf8");
  buf.writeUInt32LE(bytes.length, offset);
  offset += 4;
  bytes.copy(buf, offset);
  offset += bytes.length;
  return offset;
}

/**
 * Build a Metaplex CreateMetadataAccountV3 instruction.
 *
 * Accounts:
 *  0. metadata PDA (writable)
 *  1. mint
 *  2. mint authority (signer)
 *  3. payer (signer, writable)
 *  4. update authority
 *  5. system program
 *  6. rent sysvar
 */
export function createMetadataAccountV3Instruction(
  metadataAccount: PublicKey,
  mint: PublicKey,
  mintAuthority: PublicKey,
  payer: PublicKey,
  updateAuthority: PublicKey,
  name: string,
  symbol: string,
  uri: string,
): TransactionInstruction {
  const TOKEN_METADATA_PROGRAM = getTokenMetadataProgramId();

  // Truncate to Metaplex limits: name=32, symbol=10, uri=200
  const tName = name.slice(0, 32);
  const tSymbol = symbol.slice(0, 10);
  const tUri = uri.slice(0, 200);

  // Allocate generous buffer
  const buf = Buffer.alloc(1 + 4 + 32 + 4 + 10 + 4 + 200 + 2 + 1 + 1 + 1 + 1 + 1 + 50);
  let offset = 0;

  // Discriminator: CreateMetadataAccountV3 = 33
  buf.writeUInt8(33, offset); offset += 1;

  // DataV2.name (borsh string)
  offset = serializeBorshString(buf, offset, tName);
  // DataV2.symbol
  offset = serializeBorshString(buf, offset, tSymbol);
  // DataV2.uri
  offset = serializeBorshString(buf, offset, tUri);
  // DataV2.seller_fee_basis_points (u16) — 500 = 5% royalty to treasury
  buf.writeUInt16LE(500, offset); offset += 2;
  // DataV2.creators — Some([{address: treasury, verified: true, share: 100}])
  buf.writeUInt8(1, offset); offset += 1; // Some
  buf.writeUInt32LE(1, offset); offset += 4; // Vec length = 1
  // Creator struct: address (32 bytes) + verified (1 byte) + share (1 byte)
  const treasuryPubkey = new PublicKey(TREASURY_WALLET_STR);
  treasuryPubkey.toBuffer().copy(buf, offset); offset += 32;
  buf.writeUInt8(1, offset); offset += 1; // verified = true (treasury is signer)
  buf.writeUInt8(100, offset); offset += 1; // share = 100%
  // DataV2.collection — None
  buf.writeUInt8(0, offset); offset += 1;
  // DataV2.uses — None
  buf.writeUInt8(0, offset); offset += 1;
  // is_mutable (bool)
  buf.writeUInt8(1, offset); offset += 1;
  // collection_details — None
  buf.writeUInt8(0, offset); offset += 1;

  const data = buf.slice(0, offset);

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
    programId: TOKEN_METADATA_PROGRAM,
    data,
  });
}

// ── Rarity helpers ──

export function getRarity(price: number): string {
  if (price >= 200) return "legendary";
  if (price >= 100) return "epic";
  if (price >= 50) return "rare";
  if (price >= 25) return "uncommon";
  return "common";
}

export function rarityColor(rarity: string): string {
  switch (rarity) {
    case "legendary": return "#FFD700";
    case "epic": return "#A855F7";
    case "rare": return "#3B82F6";
    case "uncommon": return "#22C55E";
    default: return "#9CA3AF";
  }
}

export function parseCoinPrice(priceStr: string): number {
  return Math.ceil(parseFloat(priceStr.replace("§", "")));
}

// ── Build NFT Purchase Transaction ──

export interface NftPurchaseTxResult {
  transaction: Buffer;
  mintKeypair: Keypair;
  mintAddress: string;
  metadataUri: string;
  rarity: string;
  rarityColorHex: string;
  glitchPriceRaw: bigint;
  treasuryShare: number;
  personaShare: number;
}

/**
 * Build an atomic Solana transaction that:
 *  1. Creates a new SPL token mint (the NFT)
 *  2. Creates buyer's token account for the new mint
 *  3. Mints exactly 1 token to the buyer
 *  4. Sets mint authority to null (true 1/1 NFT)
 *  5. Creates Metaplex metadata on-chain
 *  6. Transfers $GLITCH from buyer to treasury (100% on-chain)
 *
 * Treasury keypair partially signs (mint authority + $GLITCH receiver).
 * Mint keypair signs (new account creation).
 * Buyer signs via Phantom on the client.
 */
export async function buildNftPurchaseTransaction(
  connection: Connection,
  buyerPubkey: PublicKey,
  treasuryKeypair: Keypair,
  product: MarketplaceProduct,
): Promise<NftPurchaseTxResult> {
  const price = parseCoinPrice(product.price);
  const rarity = getRarity(price);
  const glitchMint = new PublicKey(GLITCH_TOKEN_MINT_STR);
  const treasuryPubkey = treasuryKeypair.publicKey;

  // Generate a new keypair for the NFT mint
  const mintKeypair = Keypair.generate();
  const mintPubkey = mintKeypair.publicKey;

  // Derive metadata PDA
  const metadataPDA = getMetadataPDA(mintPubkey);

  // Metadata URI hosted on our app
  const baseUrl = getAppBaseUrl();
  const metadataUri = `${baseUrl}/api/nft/metadata/${mintPubkey.toBase58()}`;

  // NFT name: "ProductName #mint_short"
  const nftName = product.name.slice(0, 28);
  const nftSymbol = "AIG";

  // $GLITCH amount in raw (9 decimals)
  const glitchDecimals = TOKENOMICS.decimals; // 9
  const glitchPriceRaw = BigInt(price) * BigInt(10 ** glitchDecimals);

  // Revenue split: 50% treasury, 50% persona (credited in DB, on-chain goes to treasury)
  const treasuryShare = Math.ceil(price / 2);
  const personaShare = price - treasuryShare;

  // Get rent exemption for mint account
  const mintRent = await getMinimumBalanceForRentExemptMint(connection);

  // Find buyer's $GLITCH ATA
  const buyerGlitchAta = await getAssociatedTokenAddress(
    glitchMint, buyerPubkey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
  );

  // Find treasury's $GLITCH ATA
  const treasuryGlitchAta = await getAssociatedTokenAddress(
    glitchMint, treasuryPubkey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
  );

  // Detect actual token program for GLITCH mint (Token vs Token-2022)
  let glitchTokenProgram = TOKEN_PROGRAM_ID;
  try {
    const mintInfo = await connection.getAccountInfo(glitchMint);
    if (mintInfo) {
      const { TOKEN_2022_PROGRAM_ID } = await import("@solana/spl-token");
      if (mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
        glitchTokenProgram = TOKEN_2022_PROGRAM_ID;
      }
    }
  } catch { /* default to TOKEN_PROGRAM_ID */ }

  // Re-derive ATAs with correct token program if needed
  const buyerGlitchAtaFinal = glitchTokenProgram.equals(TOKEN_PROGRAM_ID)
    ? buyerGlitchAta
    : await getAssociatedTokenAddress(glitchMint, buyerPubkey, false, glitchTokenProgram, ASSOCIATED_TOKEN_PROGRAM_ID);
  const treasuryGlitchAtaFinal = glitchTokenProgram.equals(TOKEN_PROGRAM_ID)
    ? treasuryGlitchAta
    : await getAssociatedTokenAddress(glitchMint, treasuryPubkey, false, glitchTokenProgram, ASSOCIATED_TOKEN_PROGRAM_ID);

  // Find buyer's ATA for the new NFT mint
  const buyerNftAta = await getAssociatedTokenAddress(
    mintPubkey, buyerPubkey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
  );

  // Build the transaction
  const tx = new Transaction();

  // 1. Create the mint account
  tx.add(
    SystemProgram.createAccount({
      fromPubkey: buyerPubkey,
      newAccountPubkey: mintPubkey,
      space: MINT_SIZE,
      lamports: mintRent,
      programId: TOKEN_PROGRAM_ID,
    })
  );

  // 2. Initialize mint (0 decimals, treasury as mint authority)
  tx.add(
    createInitializeMintInstruction(
      mintPubkey,
      0, // 0 decimals = NFT
      treasuryPubkey, // mint authority
      treasuryPubkey, // freeze authority (set to treasury)
      TOKEN_PROGRAM_ID,
    )
  );

  // 3. Create buyer's token account for the NFT
  tx.add(
    createAssociatedTokenAccountInstruction(
      buyerPubkey, // payer
      buyerNftAta, // ATA address
      buyerPubkey, // owner
      mintPubkey,  // mint
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    )
  );

  // 4. Mint exactly 1 token to the buyer
  tx.add(
    createMintToInstruction(
      mintPubkey,      // mint
      buyerNftAta,     // destination
      treasuryPubkey,  // authority (treasury is mint authority)
      1,               // amount = 1
      [],              // multiSigners
      TOKEN_PROGRAM_ID,
    )
  );

  // 5. Set mint authority to null (makes it a true 1/1 NFT — no more can be minted)
  tx.add(
    createSetAuthorityInstruction(
      mintPubkey,      // account
      treasuryPubkey,  // current authority
      AuthorityType.MintTokens,
      null,            // new authority = null
      [],              // multiSigners
      TOKEN_PROGRAM_ID,
    )
  );

  // 6. Create Metaplex metadata account
  tx.add(
    createMetadataAccountV3Instruction(
      metadataPDA,
      mintPubkey,
      treasuryPubkey,  // mint authority
      buyerPubkey,     // payer
      treasuryPubkey,  // update authority
      nftName,
      nftSymbol,
      metadataUri,
    )
  );

  // 7. Transfer $GLITCH from buyer to treasury (full amount on-chain)
  tx.add(
    createTransferCheckedInstruction(
      buyerGlitchAtaFinal,   // source
      glitchMint,            // mint
      treasuryGlitchAtaFinal, // destination
      buyerPubkey,           // owner (buyer signs)
      glitchPriceRaw,        // amount in raw
      glitchDecimals,        // decimals
      [],                    // multiSigners
      glitchTokenProgram,    // token program
    )
  );

  // Set blockhash and fee payer
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = buyerPubkey;

  // Treasury partially signs (authorizes mint operations)
  tx.partialSign(treasuryKeypair);

  // Mint keypair signs (new account creation)
  tx.partialSign(mintKeypair);

  // Serialize (buyer hasn't signed yet — Phantom will sign on client)
  const serialized = tx.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });

  return {
    transaction: serialized,
    mintKeypair,
    mintAddress: mintPubkey.toBase58(),
    metadataUri,
    rarity,
    rarityColorHex: rarityColor(rarity),
    glitchPriceRaw,
    treasuryShare,
    personaShare,
  };
}
