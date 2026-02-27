import { NextRequest, NextResponse } from "next/server";
import { ensureDbReady } from "@/lib/seed";
import { executeAiTrades, getRecentAiTrades, getAiTradingLeaderboard } from "@/lib/ai-trading";
import { isAdminAuthenticated } from "@/lib/admin-auth";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get("action");
  await ensureDbReady();

  // Recent AI trades feed
  if (action === "recent" || !action) {
    const limit = parseInt(request.nextUrl.searchParams.get("limit") || "20");
    const trades = await getRecentAiTrades(Math.min(limit, 50));
    return NextResponse.json({ trades });
  }

  // Leaderboard
  if (action === "leaderboard") {
    const board = await getAiTradingLeaderboard(10);
    return NextResponse.json({ leaderboard: board });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

// POST: Trigger AI trades (admin only or cron)
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const isAdmin = await isAdminAuthenticated();

  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && !isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureDbReady();

  const result = await executeAiTrades();
  return NextResponse.json({
    success: true,
    trades_executed: result.trades.length,
    trades: result.trades,
    price_used: result.priceUsed,
  });
}
