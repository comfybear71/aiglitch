import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import {
  getServerSolanaConnection,
  getBudjuTokenMint,
  getGlitchTokenMint,
} from "@/lib/solana-config";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";

export const maxDuration = 120;

// USDC mint on mainnet-beta (fixed address)
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

/**
 * Refresh wallet balances from Solana RPC.
 *
 * Two modes:
 *
 * 1. GET /api/admin/personas/refresh-wallet-balances
 *    Returns the list of personas with wallets that could be refreshed.
 *    Used by the admin UI to build a client-side progress loop.
 *    NEVER exposes private keys — only persona_id, username, wallet_address.
 *
 * 2. POST /api/admin/personas/refresh-wallet-balances
 *    Body: { persona_id?: string }
 *
 *    - If persona_id provided: hits Solana RPC for JUST that persona's
 *      wallet, updates the cached sol/budju/usdc/glitch_balance columns
 *      in budju_wallets, returns new balances.
 *
 *    - If persona_id omitted: batch mode, refreshes ALL persona wallets.
 *
 * Safety:
 *  - Read-only vs Solana (only balance queries, no transactions)
 *  - Writes ONLY to budju_wallets.sol/budju/usdc/glitch_balance columns
 *  - Never touches private keys, never signs anything
 *  - Graceful handling of non-existent ATAs (returns 0 for that token)
 */

/**
 * Query Solana RPC for one wallet's balances (SOL + BUDJU + USDC + GLITCH).
 * Uses getTokenAccountBalance which returns uiAmount with correct decimals,
 * so we don't have to hardcode decimals per token.
 * Returns null if the wallet address is invalid.
 */
async function fetchOnChainBalances(walletAddress: string): Promise<{
  sol: number;
  budju: number;
  usdc: number;
  glitch: number;
  errors: string[];
} | null> {
  const errors: string[] = [];
  let pubkey: PublicKey;

  try {
    pubkey = new PublicKey(walletAddress);
  } catch {
    return null;
  }

  const connection = getServerSolanaConnection();

  // SOL balance (native)
  let sol = 0;
  try {
    const lamports = await connection.getBalance(pubkey);
    sol = lamports / LAMPORTS_PER_SOL;
  } catch (err) {
    errors.push(`SOL: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Helper to get SPL token balance via its ATA
  // Returns 0 if the ATA doesn't exist (new wallet that hasn't received the token yet)
  async function getTokenBalance(mint: PublicKey, label: string): Promise<number> {
    try {
      const ata = await getAssociatedTokenAddress(mint, pubkey);
      const result = await connection.getTokenAccountBalance(ata);
      return Number(result.value.uiAmount || 0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // "could not find account" or "invalid account" = ATA doesn't exist yet = 0 balance
      if (msg.includes("could not find account") || msg.includes("Invalid param") || msg.includes("not found")) {
        return 0;
      }
      errors.push(`${label}: ${msg}`);
      return 0;
    }
  }

  const [budju, usdc, glitch] = await Promise.all([
    getTokenBalance(getBudjuTokenMint(), "BUDJU").catch(() => 0),
    getTokenBalance(USDC_MINT, "USDC").catch(() => 0),
    getTokenBalance(getGlitchTokenMint(), "GLITCH").catch(() => 0),
  ]);

  return { sol, budju, usdc, glitch, errors };
}

// ── GET: list personas with wallets that can be refreshed ──
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  const personas = await sql`
    SELECT p.id, p.username, p.display_name, p.avatar_emoji, bw.wallet_address
    FROM ai_personas p
    JOIN budju_wallets bw ON bw.persona_id = p.id AND bw.is_active = TRUE
    WHERE p.is_active = TRUE
    ORDER BY p.id
  ` as unknown as {
    id: string;
    username: string;
    display_name: string;
    avatar_emoji: string | null;
    wallet_address: string;
  }[];

  return NextResponse.json({ total: personas.length, personas });
}

// ── POST: refresh one wallet or all ──
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  const body = await request.json().catch(() => ({}));
  const targetPersonaId = body.persona_id as string | undefined;

  // ── Mode 1: single persona (preferred — used by per-card refresh button) ──
  if (targetPersonaId) {
    const [wallet] = await sql`
      SELECT bw.wallet_address, p.username
      FROM budju_wallets bw
      JOIN ai_personas p ON p.id = bw.persona_id
      WHERE bw.persona_id = ${targetPersonaId} AND bw.is_active = TRUE
      LIMIT 1
    ` as unknown as [{ wallet_address: string; username: string } | undefined];

    if (!wallet) {
      return NextResponse.json({
        success: false,
        persona_id: targetPersonaId,
        status: "no_wallet",
        message: "No active wallet found for this persona",
      }, { status: 404 });
    }

    const balances = await fetchOnChainBalances(wallet.wallet_address);
    if (!balances) {
      return NextResponse.json({
        success: false,
        persona_id: targetPersonaId,
        status: "invalid_address",
        message: "Wallet address is not valid base58",
      }, { status: 400 });
    }

    // Update cached columns in DB
    try {
      await sql`
        UPDATE budju_wallets
        SET sol_balance = ${balances.sol},
            budju_balance = ${balances.budju},
            usdc_balance = ${balances.usdc},
            glitch_balance = ${balances.glitch},
            updated_at = NOW()
        WHERE persona_id = ${targetPersonaId} AND is_active = TRUE
      `;
    } catch (err) {
      return NextResponse.json({
        success: false,
        persona_id: targetPersonaId,
        status: "db_write_failed",
        message: err instanceof Error ? err.message : String(err),
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      persona_id: targetPersonaId,
      username: wallet.username,
      wallet_address: wallet.wallet_address,
      balances: {
        sol: balances.sol,
        budju: balances.budju,
        usdc: balances.usdc,
        glitch: balances.glitch,
      },
      rpc_errors: balances.errors,
    });
  }

  // ── Mode 2: batch — refresh ALL persona wallets (with pauses) ──
  const wallets = await sql`
    SELECT bw.persona_id, bw.wallet_address, p.username
    FROM budju_wallets bw
    JOIN ai_personas p ON p.id = bw.persona_id
    WHERE bw.is_active = TRUE AND p.is_active = TRUE
    ORDER BY p.id
  ` as unknown as { persona_id: string; wallet_address: string; username: string }[];

  const results: {
    persona_id: string;
    username: string;
    status: "ok" | "failed";
    sol?: number;
    budju?: number;
    usdc?: number;
    glitch?: number;
    error?: string;
  }[] = [];

  let updated = 0;
  let failed = 0;

  for (const w of wallets) {
    const balances = await fetchOnChainBalances(w.wallet_address);
    if (!balances) {
      results.push({
        persona_id: w.persona_id,
        username: w.username,
        status: "failed",
        error: "Invalid address",
      });
      failed++;
      continue;
    }

    try {
      await sql`
        UPDATE budju_wallets
        SET sol_balance = ${balances.sol},
            budju_balance = ${balances.budju},
            usdc_balance = ${balances.usdc},
            glitch_balance = ${balances.glitch},
            updated_at = NOW()
        WHERE persona_id = ${w.persona_id} AND is_active = TRUE
      `;
      results.push({
        persona_id: w.persona_id,
        username: w.username,
        status: "ok",
        sol: balances.sol,
        budju: balances.budju,
        usdc: balances.usdc,
        glitch: balances.glitch,
      });
      updated++;
    } catch (err) {
      results.push({
        persona_id: w.persona_id,
        username: w.username,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
      failed++;
    }

    // Rate limit: 300ms between wallets to avoid overwhelming RPC
    await new Promise(r => setTimeout(r, 300));
  }

  return NextResponse.json({
    success: true,
    total: wallets.length,
    updated,
    failed,
    results,
  });
}
