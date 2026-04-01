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

  // Cancel distribution via GET for easy browser access
  if (action === "cancel_distribution") {
    try {
      const sql = (await import("@/lib/db")).getDb();
      await sql`UPDATE distribution_jobs SET status = 'cancelled', updated_at = NOW() WHERE status IN ('pending', 'active')`;
      await sql`UPDATE distribution_transfers SET status = 'skipped' WHERE status = 'scheduled'`;
      return NextResponse.json({ success: true, message: "Distribution cancelled. All pending transfers skipped." });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
    }
  }

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

  // Get admin + treasury wallet balances (all 4 tokens)
  if (action === "wallet_balances") {
    try {
      const { Connection, PublicKey, LAMPORTS_PER_SOL } = await import("@solana/web3.js");
      const { getAssociatedTokenAddress, getAccount } = await import("@solana/spl-token");
      const { SERVER_RPC_URL, TREASURY_WALLET_STR } = await import("@/lib/solana-config");

      const connection = new Connection(SERVER_RPC_URL, "confirmed");
      const BUDJU_MINT = new PublicKey("2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump");
      const GLITCH_MINT = new PublicKey("5hfHCmaL6e9bvruy35RQyghMXseTE2mXJ7ukqKAcS8fT");
      const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

      async function getWalletBalances(address: string) {
        const pubkey = new PublicKey(address);
        const sol = (await connection.getBalance(pubkey)) / LAMPORTS_PER_SOL;

        let budju = 0, glitch = 0, usdc = 0;
        try {
          const ata = await getAssociatedTokenAddress(BUDJU_MINT, pubkey);
          const acc = await getAccount(connection, ata);
          budju = Number(acc.amount) / 1e6;
        } catch { /* no ATA */ }
        try {
          const ata = await getAssociatedTokenAddress(GLITCH_MINT, pubkey);
          const acc = await getAccount(connection, ata);
          glitch = Number(acc.amount) / 1e9;
        } catch { /* no ATA */ }
        try {
          const ata = await getAssociatedTokenAddress(USDC_MINT, pubkey);
          const acc = await getAccount(connection, ata);
          usdc = Number(acc.amount) / 1e6;
        } catch { /* no ATA */ }

        return { sol, budju, glitch, usdc, address };
      }

      const adminWallet = process.env.ADMIN_WALLET_PUBKEY || process.env.ADMIN_WALLET || "";
      const treasuryWallet = TREASURY_WALLET_STR || "";

      const [admin, treasury] = await Promise.all([
        adminWallet ? getWalletBalances(adminWallet) : null,
        treasuryWallet ? getWalletBalances(treasuryWallet) : null,
      ]);

      return NextResponse.json({ admin, treasury });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to fetch balances" }, { status: 500 });
    }
  }

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

  // ── Cancel active distribution ──
  if (action === "cancel_distribution") {
    try {
      const sql = (await import("@/lib/db")).getDb();
      await sql`UPDATE distribution_jobs SET status = 'cancelled', updated_at = NOW() WHERE status IN ('pending', 'active')`;
      await sql`UPDATE distribution_transfers SET status = 'skipped' WHERE status = 'scheduled'`;
      return NextResponse.json({ success: true, message: "Distribution cancelled. All pending transfers skipped." });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
    }
  }

  // ── Check underfunded wallets ──
  if (action === "equalize_wallets") {
    try {
      const sql = (await import("@/lib/db")).getDb();
      await ensureDbReady();

      // Get average SOL balance across all active wallets
      const [avg] = await sql`
        SELECT AVG(sol_balance::numeric) as avg_sol, AVG(budju_balance::numeric) as avg_budju, COUNT(*)::int as total
        FROM budju_wallets WHERE is_active = TRUE
      `;
      const avgSol = Number(avg.avg_sol) || 0;
      const avgBudju = Number(avg.avg_budju) || 0;
      const total = Number(avg.total) || 0;

      // Find wallets with less than 50% of the average
      const underfunded = await sql`
        SELECT bw.persona_id, bw.wallet_address, bw.sol_balance, bw.budju_balance, p.display_name
        FROM budju_wallets bw
        JOIN ai_personas p ON p.id = bw.persona_id
        WHERE bw.is_active = TRUE AND (bw.sol_balance::numeric < ${avgSol * 0.5} OR bw.budju_balance::numeric < ${avgBudju * 0.5})
        ORDER BY bw.sol_balance::numeric ASC
      `;

      // Find wallets with zero balance
      const zeroBalance = await sql`
        SELECT COUNT(*)::int as count FROM budju_wallets
        WHERE is_active = TRUE AND (sol_balance::numeric <= 0 OR sol_balance IS NULL)
      `;

      return NextResponse.json({
        underfunded: underfunded.length,
        zeroBalance: Number(zeroBalance[0]?.count) || 0,
        total,
        avgSol: avgSol.toFixed(6),
        avgBudju: avgBudju.toFixed(0),
        message: underfunded.length > 0
          ? `${underfunded.length} wallets have less than 50% of the average balance (avg: ${avgSol.toFixed(4)} SOL, ${avgBudju.toFixed(0)} BUDJU). ${Number(zeroBalance[0]?.count) || 0} wallets have zero SOL. Run a distribution from the Distribute tab to fund them equally.`
          : "All wallets are funded equally!",
        wallets: underfunded.slice(0, 20).map(w => ({
          persona: w.display_name,
          sol: Number(w.sol_balance).toFixed(6),
          budju: Number(w.budju_balance).toFixed(0),
        })),
      });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
    }
  }

  // ── Memo System ──
  if (action === "create_memo") {
    try {
      const sql = (await import("@/lib/db")).getDb();
      const { v4: uuidv4 } = await import("uuid");
      // Ensure table exists
      await sql`CREATE TABLE IF NOT EXISTS persona_trade_memos (
        id TEXT PRIMARY KEY,
        persona_id TEXT,
        memo_type TEXT NOT NULL DEFAULT 'custom',
        memo_text TEXT NOT NULL,
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`;
      const memoId = uuidv4();
      const ttlHours = body.ttl_hours || 24;
      const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
      await sql`INSERT INTO persona_trade_memos (id, persona_id, memo_type, memo_text, expires_at) VALUES (${memoId}, ${body.persona_id || null}, ${body.memo_type || "custom"}, ${body.memo_text}, ${expiresAt.toISOString()})`;
      return NextResponse.json({ success: true, memo_id: memoId, expires_at: expiresAt.toISOString() });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
    }
  }

  if (action === "list_memos") {
    try {
      const sql = (await import("@/lib/db")).getDb();
      await sql`CREATE TABLE IF NOT EXISTS persona_trade_memos (
        id TEXT PRIMARY KEY, persona_id TEXT, memo_type TEXT NOT NULL DEFAULT 'custom',
        memo_text TEXT NOT NULL, expires_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW()
      )`;
      const memos = await sql`
        SELECT m.*, p.display_name, p.avatar_emoji
        FROM persona_trade_memos m
        LEFT JOIN ai_personas p ON p.id = m.persona_id
        ORDER BY m.created_at DESC
        LIMIT 50
      `;
      return NextResponse.json({ memos });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
    }
  }

  if (action === "delete_memo") {
    try {
      const sql = (await import("@/lib/db")).getDb();
      await sql`DELETE FROM persona_trade_memos WHERE id = ${body.memo_id}`;
      return NextResponse.json({ success: true });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
    }
  }

  // ── Get trade history for a specific persona ──
  if (action === "persona_trade_history") {
    try {
      const sql = (await import("@/lib/db")).getDb();
      const personaId = body.persona_id as string;
      if (!personaId) return NextResponse.json({ error: "persona_id required" }, { status: 400 });
      const trades = await sql`
        SELECT id, trade_type, budju_amount, sol_amount, usd_value, status, created_at
        FROM budju_trades
        WHERE persona_id = ${personaId}
        ORDER BY created_at DESC
        LIMIT 20
      `;
      return NextResponse.json({ trades });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
