import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";

/**
 * GET /api/admin/coins
 * View coin economy overview — balances, top holders, circulation stats.
 */
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  await ensureDbReady();

  const [totals] = await sql`
    SELECT
      COUNT(*) as total_holders,
      COALESCE(SUM(balance), 0) as total_balance,
      COALESCE(SUM(lifetime_earned), 0) as total_lifetime,
      COALESCE(AVG(balance), 0) as avg_balance,
      COALESCE(MAX(balance), 0) as max_balance
    FROM glitch_coins WHERE balance > 0
  `;

  const topHolders = await sql`
    SELECT g.session_id, g.balance, g.lifetime_earned,
           h.display_name, h.phantom_wallet_address
    FROM glitch_coins g
    LEFT JOIN human_users h ON g.session_id = h.session_id
    ORDER BY g.balance DESC
    LIMIT 20
  `;

  const topPersonas = await sql`
    SELECT g.session_id as persona_id, g.balance, g.lifetime_earned,
           a.display_name, a.avatar_emoji
    FROM glitch_coins g
    JOIN ai_personas a ON g.session_id = a.id
    ORDER BY g.balance DESC
    LIMIT 20
  `;

  const recentTransactions = await sql`
    SELECT id, from_id, to_id, amount, reason, description, created_at
    FROM coin_transactions
    ORDER BY created_at DESC
    LIMIT 50
  `.catch(() => []);

  const [swapStats] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'completed') as total_swaps,
      COALESCE(SUM(glitch_amount) FILTER (WHERE status = 'completed'), 0) as glitch_swapped,
      COALESCE(SUM(sol_cost) FILTER (WHERE status = 'completed'), 0) as sol_collected
    FROM otc_swaps
  `;

  return NextResponse.json({
    economy: {
      total_holders: Number(totals.total_holders),
      total_circulating: Number(Number(totals.total_balance).toFixed(2)),
      total_lifetime_earned: Number(Number(totals.total_lifetime).toFixed(2)),
      avg_balance: Number(Number(totals.avg_balance).toFixed(2)),
      max_balance: Number(Number(totals.max_balance).toFixed(2)),
    },
    swaps: {
      total_completed: Number(swapStats.total_swaps),
      glitch_swapped: Number(Number(swapStats.glitch_swapped).toFixed(2)),
      sol_collected: Number(Number(swapStats.sol_collected).toFixed(6)),
    },
    top_human_holders: topHolders,
    top_persona_holders: topPersonas,
    recent_transactions: recentTransactions,
  });
}

/**
 * POST /api/admin/coins
 * Admin coin operations — award, deduct, seed.
 * Body: { action: string, ... }
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { action } = body;

  const sql = getDb();
  await ensureDbReady();

  switch (action) {
    case "award": {
      const { session_id, amount, reason = "admin_award" } = body;
      if (!session_id || !amount) {
        return NextResponse.json({ error: "Missing session_id or amount" }, { status: 400 });
      }
      await sql`
        INSERT INTO glitch_coins (id, session_id, balance, lifetime_earned)
        VALUES (${crypto.randomUUID()}, ${session_id}, ${amount}, ${amount})
        ON CONFLICT (session_id) DO UPDATE
        SET balance = glitch_coins.balance + ${amount}, lifetime_earned = glitch_coins.lifetime_earned + ${amount}
      `;
      await sql`
        INSERT INTO coin_transactions (id, from_id, to_id, amount, reason, description, created_at)
        VALUES (${crypto.randomUUID()}, 'admin', ${session_id}, ${amount}, ${reason}, 'Admin award', NOW())
      `.catch(() => {});
      return NextResponse.json({ success: true, message: `Awarded ${amount} GLITCH to ${session_id}` });
    }

    case "deduct": {
      const { session_id, amount, reason = "admin_deduction" } = body;
      if (!session_id || !amount) {
        return NextResponse.json({ error: "Missing session_id or amount" }, { status: 400 });
      }
      await sql`
        UPDATE glitch_coins SET balance = GREATEST(0, balance - ${amount})
        WHERE session_id = ${session_id}
      `;
      await sql`
        INSERT INTO coin_transactions (id, from_id, to_id, amount, reason, description, created_at)
        VALUES (${crypto.randomUUID()}, ${session_id}, 'admin', ${amount}, ${reason}, 'Admin deduction', NOW())
      `.catch(() => {});
      return NextResponse.json({ success: true, message: `Deducted ${amount} GLITCH from ${session_id}` });
    }

    case "seed_personas": {
      // Give all active personas some starter coins
      const personas = await sql`SELECT id FROM ai_personas WHERE is_active = TRUE`;
      let seeded = 0;
      for (const p of personas) {
        await sql`
          INSERT INTO glitch_coins (id, session_id, balance, lifetime_earned)
          VALUES (${crypto.randomUUID()}, ${p.id}, 100, 100)
          ON CONFLICT (session_id) DO NOTHING
        `;
        seeded++;
      }
      return NextResponse.json({ success: true, message: `Seeded ${seeded} personas with 100 GLITCH each` });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
