import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { v4 as uuidv4 } from "uuid";

export const maxDuration = 60;

/**
 * Bulk wallet generation for personas missing a budju_wallets row.
 *
 * Two modes:
 *
 * 1. GET /api/admin/personas/generate-missing-wallets
 *    Returns the list of active personas WITHOUT a budju_wallets row.
 *    Used by the admin UI to build a client-side progress loop so the user
 *    sees each wallet created in real time.
 *    NEVER exposes private keys — only persona_id, username, display_name.
 *
 * 2. POST /api/admin/personas/generate-missing-wallets
 *    Body: { persona_id?: string }
 *
 *    - If persona_id is provided: creates a wallet for JUST that persona
 *      (if they don't already have one). Returns { success, persona_id,
 *      wallet_address, status, message? }
 *
 *    - If persona_id is omitted: creates wallets for ALL active personas
 *      missing one (legacy batch mode).
 *
 * Safety:
 *  - READ-ONLY on existing wallets (never touches or exposes private keys)
 *  - Uses exact same XOR+bs58 encryption as budju.ts for interoperability
 *  - Does NOT fund wallets with SOL/BUDJU/USDC — zero balance, inert
 *  - Does NOT touch trading logic or treasury
 *  - Works for ALL active personas (glitch-* and meatbag-* alike)
 */

const DISTRIBUTOR_COUNT = 16;

// ── Wallet encryption (MUST match budju.ts + init-persona exactly) ──
const ENCRYPTION_KEY = process.env.BUDJU_WALLET_SECRET || process.env.ADMIN_PASSWORD || "budju-default-key";

function encryptKeypair(secretKey: Uint8Array): string {
  const keyBytes = new TextEncoder().encode(ENCRYPTION_KEY);
  const encrypted = new Uint8Array(secretKey.length);
  for (let i = 0; i < secretKey.length; i++) {
    encrypted[i] = secretKey[i] ^ keyBytes[i % keyBytes.length];
  }
  return bs58.encode(encrypted);
}

async function ensureBudjuWalletsTable(): Promise<void> {
  const sql = getDb();
  await sql`
    CREATE TABLE IF NOT EXISTS budju_wallets (
      id TEXT PRIMARY KEY,
      persona_id TEXT NOT NULL,
      wallet_address TEXT UNIQUE NOT NULL,
      encrypted_keypair TEXT NOT NULL,
      distributor_group INTEGER NOT NULL DEFAULT 0,
      sol_balance REAL NOT NULL DEFAULT 0,
      budju_balance REAL NOT NULL DEFAULT 0,
      total_funded_sol REAL NOT NULL DEFAULT 0,
      total_funded_budju REAL NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.catch(() => {});
}

// ── GET: list personas missing a wallet ──
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureBudjuWalletsTable();
  const sql = getDb();

  const personas = await sql`
    SELECT p.id, p.username, p.display_name, p.avatar_emoji
    FROM ai_personas p
    LEFT JOIN budju_wallets bw ON bw.persona_id = p.id AND bw.is_active = TRUE
    WHERE p.is_active = TRUE AND bw.id IS NULL
    ORDER BY p.id
  ` as unknown as {
    id: string;
    username: string;
    display_name: string;
    avatar_emoji: string | null;
  }[];

  return NextResponse.json({ total: personas.length, personas });
}

// ── POST: create wallet(s) ──
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureBudjuWalletsTable();
  const sql = getDb();

  const body = await request.json().catch(() => ({}));
  const targetPersonaId = body.persona_id as string | undefined;

  // ── Mode 1: single persona (preferred — used by new progress UI) ──
  if (targetPersonaId) {
    // Verify persona exists and is active
    const [persona] = await sql`
      SELECT id, username, display_name
      FROM ai_personas
      WHERE id = ${targetPersonaId} AND is_active = TRUE
      LIMIT 1
    ` as unknown as [{ id: string; username: string; display_name: string } | undefined];

    if (!persona) {
      return NextResponse.json({
        success: false,
        persona_id: targetPersonaId,
        status: "not_found",
        message: "Persona not found or inactive",
      }, { status: 404 });
    }

    // Check if wallet already exists
    const [existing] = await sql`
      SELECT id, wallet_address FROM budju_wallets WHERE persona_id = ${targetPersonaId}
    ` as unknown as [{ id: string; wallet_address: string } | undefined];

    if (existing) {
      return NextResponse.json({
        success: true,
        persona_id: targetPersonaId,
        username: persona.username,
        wallet_address: existing.wallet_address,
        status: "already_exists",
      });
    }

    // Create a new wallet
    try {
      // Round-robin distributor group assignment based on existing wallet count
      const [walletCountRow] = await sql`SELECT COUNT(*) as cnt FROM budju_wallets`;
      const walletCount = Number(walletCountRow?.cnt || 0);
      const distributorGroup = walletCount % DISTRIBUTOR_COUNT;

      const kp = Keypair.generate();
      const walletAddress = kp.publicKey.toBase58();

      await sql`
        INSERT INTO budju_wallets (
          id, persona_id, wallet_address, encrypted_keypair,
          distributor_group, created_at, updated_at
        )
        VALUES (
          ${uuidv4()}, ${targetPersonaId}, ${walletAddress},
          ${encryptKeypair(kp.secretKey)}, ${distributorGroup},
          NOW(), NOW()
        )
      `;

      return NextResponse.json({
        success: true,
        persona_id: targetPersonaId,
        username: persona.username,
        wallet_address: walletAddress,
        status: "created",
      });
    } catch (err) {
      return NextResponse.json({
        success: false,
        persona_id: targetPersonaId,
        username: persona.username,
        status: "failed",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── Mode 2: batch all missing wallets (legacy) ──
  const personasMissingWallets = await sql`
    SELECT p.id, p.username
    FROM ai_personas p
    LEFT JOIN budju_wallets bw ON bw.persona_id = p.id AND bw.is_active = TRUE
    WHERE p.is_active = TRUE AND bw.id IS NULL
    ORDER BY p.id
  ` as unknown as { id: string; username: string }[];

  const [walletCountRow] = await sql`SELECT COUNT(*) as cnt FROM budju_wallets`;
  let walletCount = Number(walletCountRow?.cnt || 0);

  const created: { persona_id: string; username: string; wallet_address: string }[] = [];
  const errors: { persona_id: string; error: string }[] = [];

  for (const persona of personasMissingWallets) {
    try {
      const kp = Keypair.generate();
      const walletAddress = kp.publicKey.toBase58();
      const distributorGroup = walletCount % DISTRIBUTOR_COUNT;

      await sql`
        INSERT INTO budju_wallets (
          id, persona_id, wallet_address, encrypted_keypair,
          distributor_group, created_at, updated_at
        )
        VALUES (
          ${uuidv4()}, ${persona.id}, ${walletAddress},
          ${encryptKeypair(kp.secretKey)}, ${distributorGroup},
          NOW(), NOW()
        )
      `;

      created.push({ persona_id: persona.id, username: persona.username, wallet_address: walletAddress });
      walletCount++;
    } catch (err) {
      errors.push({
        persona_id: persona.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    success: true,
    total: personasMissingWallets.length,
    created: created.length,
    errors: errors.length,
    details: { created, errors },
  });
}
