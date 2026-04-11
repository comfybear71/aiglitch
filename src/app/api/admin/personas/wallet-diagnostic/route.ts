import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";

export const maxDuration = 30;

/**
 * GET /api/admin/personas/wallet-diagnostic
 *
 * Read-only snapshot of the actual state of every persona wallet-related
 * table in the database. Runs zero writes. Used to diagnose confusion
 * about "do personas have wallets or not" by showing the ground truth.
 *
 * Returns:
 *  {
 *    summary: {
 *      active_personas: N,
 *      personas_with_budju_wallet: N,
 *      personas_without_budju_wallet: N,
 *      personas_with_any_token_balance: N,
 *      personas_with_ai_persona_coins: N,
 *    },
 *    totals: {
 *      sol_total_ledger: sum of token_balances for SOL,
 *      sol_total_wallets: sum of budju_wallets.sol_balance,
 *      budju_total_ledger: sum of token_balances for BUDJU,
 *      budju_total_wallets: sum of budju_wallets.budju_balance,
 *      usdc_total_ledger: sum of token_balances for USDC,
 *      usdc_total_wallets: sum of budju_wallets.usdc_balance,
 *      glitch_token_total_ledger: sum of token_balances for GLITCH,
 *      glitch_coins_total: sum of ai_persona_coins.balance (integer in-app currency),
 *    },
 *    sample_with_wallet: [5 personas — one row per], shows all balances + wallet address
 *    sample_without_wallet: [5 personas — one row per], same info (wallet_address will be null)
 *    personas_missing_wallet_count_by_type: { glitch_xxx: N, meatbag_xxx: N, other: N }
 *  }
 */
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();

  // Defensive: make sure the tables exist (they should, but belt-and-braces)
  await sql`
    CREATE TABLE IF NOT EXISTS budju_wallets (
      id TEXT PRIMARY KEY,
      persona_id TEXT NOT NULL,
      wallet_address TEXT UNIQUE NOT NULL,
      encrypted_keypair TEXT NOT NULL,
      distributor_group INTEGER NOT NULL DEFAULT 0,
      sol_balance REAL NOT NULL DEFAULT 0,
      budju_balance REAL NOT NULL DEFAULT 0,
      usdc_balance REAL NOT NULL DEFAULT 0,
      glitch_balance REAL NOT NULL DEFAULT 0,
      total_funded_sol REAL NOT NULL DEFAULT 0,
      total_funded_budju REAL NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.catch(() => {});

  // ── Summary counts ──
  const [activePersonasRow] = await sql`
    SELECT COUNT(*)::int as c FROM ai_personas WHERE is_active = TRUE
  ` as unknown as [{ c: number }];

  const [withWalletRow] = await sql`
    SELECT COUNT(DISTINCT p.id)::int as c
    FROM ai_personas p
    JOIN budju_wallets bw ON bw.persona_id = p.id AND bw.is_active = TRUE
    WHERE p.is_active = TRUE
  ` as unknown as [{ c: number }];

  const [withoutWalletRow] = await sql`
    SELECT COUNT(*)::int as c
    FROM ai_personas p
    LEFT JOIN budju_wallets bw ON bw.persona_id = p.id AND bw.is_active = TRUE
    WHERE p.is_active = TRUE AND bw.id IS NULL
  ` as unknown as [{ c: number }];

  const [withTokenBalanceRow] = await sql`
    SELECT COUNT(DISTINCT p.id)::int as c
    FROM ai_personas p
    JOIN token_balances tb ON tb.owner_id = p.id AND tb.owner_type = 'ai_persona'
    WHERE p.is_active = TRUE AND tb.balance > 0
  ` as unknown as [{ c: number }];

  const [withCoinsRow] = await sql`
    SELECT COUNT(*)::int as c
    FROM ai_personas p
    JOIN ai_persona_coins apc ON apc.persona_id = p.id
    WHERE p.is_active = TRUE AND apc.balance > 0
  ` as unknown as [{ c: number }];

  // ── Totals across all personas ──
  const [solLedgerRow] = await sql`
    SELECT COALESCE(SUM(balance), 0)::float8 as s FROM token_balances
    WHERE owner_type = 'ai_persona' AND token = 'SOL'
  ` as unknown as [{ s: number }];

  const [budjuLedgerRow] = await sql`
    SELECT COALESCE(SUM(balance), 0)::float8 as s FROM token_balances
    WHERE owner_type = 'ai_persona' AND token = 'BUDJU'
  ` as unknown as [{ s: number }];

  const [usdcLedgerRow] = await sql`
    SELECT COALESCE(SUM(balance), 0)::float8 as s FROM token_balances
    WHERE owner_type = 'ai_persona' AND token = 'USDC'
  ` as unknown as [{ s: number }];

  const [glitchLedgerRow] = await sql`
    SELECT COALESCE(SUM(balance), 0)::float8 as s FROM token_balances
    WHERE owner_type = 'ai_persona' AND token = 'GLITCH'
  ` as unknown as [{ s: number }];

  const [coinsTotalRow] = await sql`
    SELECT COALESCE(SUM(balance), 0)::int as s FROM ai_persona_coins
  ` as unknown as [{ s: number }];

  const [solWalletRow] = await sql`
    SELECT COALESCE(SUM(sol_balance), 0)::float8 as s FROM budju_wallets WHERE is_active = TRUE
  ` as unknown as [{ s: number }];

  const [budjuWalletRow] = await sql`
    SELECT COALESCE(SUM(budju_balance), 0)::float8 as s FROM budju_wallets WHERE is_active = TRUE
  ` as unknown as [{ s: number }];

  const [usdcWalletRow] = await sql`
    SELECT COALESCE(SUM(usdc_balance), 0)::float8 as s FROM budju_wallets WHERE is_active = TRUE
  ` as unknown as [{ s: number }];

  const [glitchWalletRow] = await sql`
    SELECT COALESCE(SUM(glitch_balance), 0)::float8 as s FROM budju_wallets WHERE is_active = TRUE
  ` as unknown as [{ s: number }];

  // ── Missing wallet breakdown by ID pattern ──
  const missingByPattern = await sql`
    SELECT
      CASE
        WHEN p.id LIKE 'glitch-%' THEN 'glitch_xxx'
        WHEN p.id LIKE 'meatbag-%' THEN 'meatbag_xxx'
        ELSE 'other'
      END as pattern,
      COUNT(*)::int as count
    FROM ai_personas p
    LEFT JOIN budju_wallets bw ON bw.persona_id = p.id AND bw.is_active = TRUE
    WHERE p.is_active = TRUE AND bw.id IS NULL
    GROUP BY pattern
  ` as unknown as { pattern: string; count: number }[];

  const missingByTypeMap: Record<string, number> = { glitch_xxx: 0, meatbag_xxx: 0, other: 0 };
  for (const row of missingByPattern) {
    missingByTypeMap[row.pattern] = row.count;
  }

  // ── Sample of 5 personas WITH a wallet ──
  const sampleWithWallet = await sql`
    SELECT
      p.id, p.username, p.display_name, p.avatar_emoji,
      bw.wallet_address,
      bw.sol_balance as wallet_sol,
      bw.budju_balance as wallet_budju,
      bw.usdc_balance as wallet_usdc,
      bw.glitch_balance as wallet_glitch,
      COALESCE((SELECT balance FROM token_balances
                WHERE owner_type = 'ai_persona' AND owner_id = p.id AND token = 'SOL'), 0)::float8 as ledger_sol,
      COALESCE((SELECT balance FROM token_balances
                WHERE owner_type = 'ai_persona' AND owner_id = p.id AND token = 'BUDJU'), 0)::float8 as ledger_budju,
      COALESCE((SELECT balance FROM token_balances
                WHERE owner_type = 'ai_persona' AND owner_id = p.id AND token = 'USDC'), 0)::float8 as ledger_usdc,
      COALESCE((SELECT balance FROM token_balances
                WHERE owner_type = 'ai_persona' AND owner_id = p.id AND token = 'GLITCH'), 0)::float8 as ledger_glitch,
      COALESCE((SELECT balance FROM ai_persona_coins WHERE persona_id = p.id), 0)::int as coin_balance
    FROM ai_personas p
    JOIN budju_wallets bw ON bw.persona_id = p.id AND bw.is_active = TRUE
    WHERE p.is_active = TRUE
    ORDER BY p.id
    LIMIT 5
  `;

  // ── Sample of 5 personas WITHOUT a wallet ──
  const sampleWithoutWallet = await sql`
    SELECT
      p.id, p.username, p.display_name, p.avatar_emoji,
      NULL as wallet_address,
      COALESCE((SELECT balance FROM token_balances
                WHERE owner_type = 'ai_persona' AND owner_id = p.id AND token = 'SOL'), 0)::float8 as ledger_sol,
      COALESCE((SELECT balance FROM token_balances
                WHERE owner_type = 'ai_persona' AND owner_id = p.id AND token = 'BUDJU'), 0)::float8 as ledger_budju,
      COALESCE((SELECT balance FROM token_balances
                WHERE owner_type = 'ai_persona' AND owner_id = p.id AND token = 'USDC'), 0)::float8 as ledger_usdc,
      COALESCE((SELECT balance FROM token_balances
                WHERE owner_type = 'ai_persona' AND owner_id = p.id AND token = 'GLITCH'), 0)::float8 as ledger_glitch,
      COALESCE((SELECT balance FROM ai_persona_coins WHERE persona_id = p.id), 0)::int as coin_balance
    FROM ai_personas p
    LEFT JOIN budju_wallets bw ON bw.persona_id = p.id AND bw.is_active = TRUE
    WHERE p.is_active = TRUE AND bw.id IS NULL
    ORDER BY p.id
    LIMIT 5
  `;

  return NextResponse.json({
    summary: {
      active_personas: activePersonasRow.c,
      personas_with_budju_wallet: withWalletRow.c,
      personas_without_budju_wallet: withoutWalletRow.c,
      personas_with_any_token_balance: withTokenBalanceRow.c,
      personas_with_ai_persona_coins: withCoinsRow.c,
    },
    totals: {
      sol_total_ledger: Number(solLedgerRow.s),
      sol_total_wallets: Number(solWalletRow.s),
      budju_total_ledger: Number(budjuLedgerRow.s),
      budju_total_wallets: Number(budjuWalletRow.s),
      usdc_total_ledger: Number(usdcLedgerRow.s),
      usdc_total_wallets: Number(usdcWalletRow.s),
      glitch_token_total_ledger: Number(glitchLedgerRow.s),
      glitch_token_total_wallets: Number(glitchWalletRow.s),
      glitch_coins_total: Number(coinsTotalRow.s),
    },
    personas_missing_wallet_by_type: missingByTypeMap,
    sample_with_wallet: sampleWithWallet,
    sample_without_wallet: sampleWithoutWallet,
    timestamp: new Date().toISOString(),
  });
}
