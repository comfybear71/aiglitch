import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import {
  getBudjuDashboard,
  getBudjuConfig,
  setBudjuConfig,
  generatePersonaWallets,
  deactivatePersonaWallet,
  activatePersonaWallet,
  deletePersonaWallet,
  syncWalletBalances,
  executeBudjuTradeBatch,
} from "@/lib/budju-trading";

// ── GET: Dashboard data ──
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const action = request.nextUrl.searchParams.get("action") || "dashboard";

  if (action === "dashboard") {
    const data = await getBudjuDashboard();
    return NextResponse.json(data);
  }

  if (action === "config") {
    const config = await getBudjuConfig();
    return NextResponse.json({ config });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

// ── POST: Admin controls ──
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const action = body.action;

  // Start/Stop trading bot
  if (action === "toggle") {
    const config = await getBudjuConfig();
    const newState = config.enabled === "true" ? "false" : "true";
    await setBudjuConfig("enabled", newState);
    return NextResponse.json({ success: true, enabled: newState === "true" });
  }

  // Enable trading
  if (action === "start") {
    await setBudjuConfig("enabled", "true");
    return NextResponse.json({ success: true, enabled: true });
  }

  // Disable trading
  if (action === "stop") {
    await setBudjuConfig("enabled", "false");
    return NextResponse.json({ success: true, enabled: false });
  }

  // Update config values
  if (action === "update_config") {
    const updates: Record<string, string> = body.updates || {};
    const allowedKeys = [
      "daily_budget_usd", "max_trade_usd", "min_trade_usd",
      "min_interval_minutes", "max_interval_minutes",
      "buy_sell_ratio", "active_persona_count",
    ];
    for (const [key, value] of Object.entries(updates)) {
      if (allowedKeys.includes(key)) {
        await setBudjuConfig(key, String(value));
      }
    }
    return NextResponse.json({ success: true, updated: Object.keys(updates) });
  }

  // Generate wallets for personas
  if (action === "generate_wallets") {
    const count = Math.min(body.count || 15, 30);
    const result = await generatePersonaWallets(count);
    return NextResponse.json({ success: true, ...result });
  }

  // Trigger a manual trade batch
  if (action === "trigger_trades") {
    const count = Math.min(body.count || 5, 20);
    // Temporarily enable if not already
    const config = await getBudjuConfig();
    const wasEnabled = config.enabled === "true";
    if (!wasEnabled) {
      await setBudjuConfig("enabled", "true");
    }

    const result = await executeBudjuTradeBatch(count);

    if (!wasEnabled) {
      await setBudjuConfig("enabled", "false");
    }

    return NextResponse.json({
      success: true,
      trades_executed: result.trades.length,
      budget_remaining: result.budget_remaining,
      trades: result.trades,
    });
  }

  // Sync wallet balances from on-chain
  if (action === "sync_balances") {
    const count = await syncWalletBalances();
    return NextResponse.json({ success: true, wallets_updated: count });
  }

  // Deactivate a persona's trading wallet
  if (action === "deactivate_wallet") {
    if (!body.persona_id) return NextResponse.json({ error: "Missing persona_id" }, { status: 400 });
    const ok = await deactivatePersonaWallet(body.persona_id);
    return NextResponse.json({ success: ok });
  }

  // Activate a persona's trading wallet
  if (action === "activate_wallet") {
    if (!body.persona_id) return NextResponse.json({ error: "Missing persona_id" }, { status: 400 });
    const ok = await activatePersonaWallet(body.persona_id);
    return NextResponse.json({ success: ok });
  }

  // Delete a persona's trading wallet (and all their trade history)
  if (action === "delete_wallet") {
    if (!body.persona_id) return NextResponse.json({ error: "Missing persona_id" }, { status: 400 });
    const ok = await deletePersonaWallet(body.persona_id);
    return NextResponse.json({ success: ok });
  }

  // Reset daily budget counter
  if (action === "reset_budget") {
    await setBudjuConfig("spent_today_usd", "0");
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
