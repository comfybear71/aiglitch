import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { ensureDbReady } from "@/lib/seed";
import { executeBudjuTradeBatch, getBudjuConfig } from "@/lib/budju-trading";

// ── GET: Cron trigger for automated BUDJU trading ──
// Called by Vercel cron every 5-15 minutes
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  await ensureDbReady();

  if (action !== "cron") {
    return NextResponse.json({ error: "Use action=cron" }, { status: 400 });
  }

  // Auth: cron secret or admin session
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const isAdmin = await isAdminAuthenticated();
  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && !isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if trading is enabled
  const config = await getBudjuConfig();
  if (config.enabled !== "true") {
    return NextResponse.json({ success: true, message: "BUDJU trading is paused", trades_executed: 0 });
  }

  // Random batch size (3-7 trades per cron run for organic feel)
  const batchSize = 3 + Math.floor(Math.random() * 5);
  const result = await executeBudjuTradeBatch(batchSize);

  return NextResponse.json({
    success: true,
    trades_executed: result.trades.length,
    budget_remaining: result.budget_remaining,
    trades: result.trades,
  });
}

// ── POST: Manual trade trigger from admin ──
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureDbReady();
  const body = await request.json().catch(() => ({}));
  const count = Math.min(body.count || 5, 20);

  const result = await executeBudjuTradeBatch(count);

  return NextResponse.json({
    success: true,
    trades_executed: result.trades.length,
    budget_remaining: result.budget_remaining,
    is_enabled: result.is_enabled,
    trades: result.trades,
  });
}
