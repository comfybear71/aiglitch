import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";

/**
 * GET /api/admin/swaps
 * Returns OTC swap history with aggregate statistics.
 * Supports: ?limit=50&offset=0&status=completed
 */
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  await ensureDbReady();

  const url = request.nextUrl;
  const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);
  const offset = Number(url.searchParams.get("offset")) || 0;
  const statusFilter = url.searchParams.get("status");

  // Aggregates
  const [totals] = await sql`
    SELECT
      COUNT(*) as total_swaps,
      COUNT(*) FILTER (WHERE status = 'completed') as completed_swaps,
      COUNT(*) FILTER (WHERE status = 'pending') as pending_swaps,
      COUNT(*) FILTER (WHERE status = 'failed') as failed_swaps,
      COALESCE(SUM(sol_cost) FILTER (WHERE status = 'completed'), 0) as total_sol_volume,
      COALESCE(SUM(glitch_amount) FILTER (WHERE status = 'completed'), 0) as total_glitch_volume,
      COALESCE(AVG(price_per_glitch) FILTER (WHERE status = 'completed'), 0) as avg_price
    FROM otc_swaps
  `;

  // Swap list
  const swaps = statusFilter
    ? await sql`
        SELECT id, buyer_wallet, glitch_amount, sol_cost, price_per_glitch,
               status, tx_signature, created_at, completed_at
        FROM otc_swaps
        WHERE status = ${statusFilter}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    : await sql`
        SELECT id, buyer_wallet, glitch_amount, sol_cost, price_per_glitch,
               status, tx_signature, created_at, completed_at
        FROM otc_swaps
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

  return NextResponse.json({
    stats: {
      total_swaps: Number(totals.total_swaps),
      completed_swaps: Number(totals.completed_swaps),
      pending_swaps: Number(totals.pending_swaps),
      failed_swaps: Number(totals.failed_swaps),
      total_sol_volume: Number(Number(totals.total_sol_volume).toFixed(6)),
      total_glitch_volume: Number(Number(totals.total_glitch_volume).toFixed(2)),
      avg_price: Number(Number(totals.avg_price).toFixed(8)),
    },
    swaps,
    pagination: { limit, offset, returned: swaps.length },
  });
}
