import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { env } from "@/lib/bible/env";
import { ensureDbReady } from "@/lib/seed";
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
  distributeFundsFromDistributors,
  drainWallets,
  exportWalletKeys,
  clearFailedTrades,
  createDistributionJob,
  processDistributionJob,
  getDistributionJobStatus,
} from "@/lib/trading/budju";
import type { DistributionConfig } from "@/lib/trading/budju";

// ── GET: Dashboard data ──
export async function GET(request: NextRequest) {
  // Allow cron access for process_distribution
  const action = request.nextUrl.searchParams.get("action") || "dashboard";
  const cronSecret = request.headers.get("x-vercel-cron-secret") || request.headers.get("authorization")?.replace("Bearer ", "");
  const isCron = action === "process_distribution" && cronSecret === process.env.CRON_SECRET;

  if (!isCron && !(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureDbReady();

  if (action === "dashboard") {
    try {
      const data = await getBudjuDashboard();
      // Warn if Jupiter API key is missing
      const jupiterKeySet = !!env.JUPITER_API_KEY;
      return NextResponse.json({ ...data, jupiter_api_key_set: jupiterKeySet });
    } catch (err) {
      console.error("[BUDJU Dashboard] Error:", err);
      return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load dashboard" }, { status: 500 });
    }
  }

  if (action === "config") {
    const config = await getBudjuConfig();
    return NextResponse.json({ config });
  }

  // Distribution job status
  if (action === "distribution_status") {
    try {
      const jobId = request.nextUrl.searchParams.get("job_id") || undefined;
      const result = await getDistributionJobStatus(jobId);
      return NextResponse.json(result);
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
    }
  }

  // Process pending distribution transfers (can be called by cron)
  if (action === "process_distribution") {
    try {
      const result = await processDistributionJob();
      return NextResponse.json(result);
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

// ── POST: Admin controls ──
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureDbReady();
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

  // Sync wallet balances from on-chain (distributors + personas)
  if (action === "sync_balances") {
    const result = await syncWalletBalances();
    return NextResponse.json({
      success: true,
      personas_synced: result.personas_synced,
      distributors_synced: result.distributors_synced,
      total_deposited_sol: result.total_deposited_sol,
    });
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

  // Distribute funds from distributors to persona wallets
  if (action === "distribute_funds") {
    try {
      const result = await distributeFundsFromDistributors();
      return NextResponse.json({
        success: true,
        total_sol_distributed: result.total_sol_distributed,
        total_budju_distributed: result.total_budju_distributed,
        distributions: result.distributions,
        errors: result.errors,
      });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Distribution failed" }, { status: 500 });
    }
  }

  // Drain all wallets back to a destination address
  if (action === "drain_wallets") {
    if (!body.destination) return NextResponse.json({ error: "Missing destination address" }, { status: 400 });
    const walletType = body.wallet_type || "all"; // "personas" | "distributors" | "all"
    try {
      const result = await drainWallets(body.destination, walletType);
      return NextResponse.json({
        success: true,
        total_sol_recovered: result.total_sol_recovered,
        drained: result.drained,
        errors: result.errors,
      });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Drain failed" }, { status: 500 });
    }
  }

  // Export private keys (for manual wallet recovery)
  if (action === "export_keys") {
    try {
      const result = await exportWalletKeys(body.persona_id);
      return NextResponse.json({ success: true, ...result });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Export failed" }, { status: 500 });
    }
  }

  // Clear all failed trades from history
  if (action === "clear_failed_trades") {
    const deleted = await clearFailedTrades();
    return NextResponse.json({ success: true, deleted });
  }

  // ── Time-Randomised Distribution ──

  // Create a new distribution job (schedules transfers but doesn't execute)
  if (action === "create_distribution") {
    try {
      const config = body.config as Partial<DistributionConfig> || {};
      const result = await createDistributionJob(config);
      return NextResponse.json({ success: true, ...result });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to create distribution job" }, { status: 500 });
    }
  }

  // Process pending transfers (execute scheduled transfers that are due)
  if (action === "process_distribution") {
    try {
      const result = await processDistributionJob(body.job_id);
      return NextResponse.json({ success: true, ...result });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to process distribution" }, { status: 500 });
    }
  }

  // Get distribution job status
  if (action === "distribution_status") {
    try {
      const result = await getDistributionJobStatus(body.job_id);
      return NextResponse.json(result);
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to get status" }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
