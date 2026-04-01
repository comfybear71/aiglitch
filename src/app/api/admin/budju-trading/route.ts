import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { env } from "@/lib/bible/env";
import { ensureDbReady } from "@/lib/seed";

export const maxDuration = 300; // 5 minutes — drain operations need time for multiple on-chain transfers

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
      const cancelled = await sql`UPDATE distribution_jobs SET status = 'cancelled', updated_at = NOW() WHERE status IN ('pending', 'active') RETURNING id`;
      const skipped = await sql`UPDATE distribution_transfers SET status = 'skipped' WHERE status = 'scheduled'`;
      return NextResponse.json({ success: true, jobsCancelled: cancelled.length, transfersSkipped: (skipped as unknown as { count: number }).count || 0, message: "Distribution cancelled. All pending transfers skipped." });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
    }
  }

  // Drain a specific token from ALL persona wallets back to treasury (keeps SOL for gas)
  if (action === "drain_token") {
    try {
      const { Connection, PublicKey, Transaction, sendAndConfirmTransaction } = await import("@solana/web3.js");
      const { getAssociatedTokenAddress, getAccount, createTransferInstruction } = await import("@solana/spl-token");
      const { SERVER_RPC_URL, TREASURY_WALLET_STR } = await import("@/lib/solana-config");
      const { decryptKeypair } = await import("@/lib/trading/budju");
      const sql = (await import("@/lib/db")).getDb();
      const connection = new Connection(SERVER_RPC_URL, "confirmed");
      const treasuryPub = new PublicKey(TREASURY_WALLET_STR);

      const token = (request.nextUrl.searchParams.get("token") || "").toUpperCase();
      const MINT_MAP: Record<string, { mint: string; decimals: number; dbCol: string }> = {
        "BUDJU": { mint: "2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump", decimals: 6, dbCol: "budju_balance" },
        "USDC": { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6, dbCol: "" },
        "GLITCH": { mint: "5hfHCmaL6e9bvruy35RQyghMXseTE2mXJ7ukqKAcS8fT", decimals: 9, dbCol: "" },
      };

      if (!MINT_MAP[token]) {
        return NextResponse.json({ error: `Invalid token: ${token}. Use BUDJU, USDC, or GLITCH` }, { status: 400 });
      }

      const { mint, decimals, dbCol } = MINT_MAP[token];
      const mintPub = new PublicKey(mint);
      const toAta = await getAssociatedTokenAddress(mintPub, treasuryPub);

      const wallets = await sql`
        SELECT bw.*, p.display_name FROM budju_wallets bw
        JOIN ai_personas p ON p.id = bw.persona_id
        WHERE bw.is_active = TRUE
      `;

      let drained = 0, failed = 0, totalAmount = 0;
      const errors: string[] = [];

      for (const w of wallets) {
        try {
          const keypair = decryptKeypair(w.encrypted_keypair as string);
          const fromAta = await getAssociatedTokenAddress(mintPub, keypair.publicKey);
          const acc = await getAccount(connection, fromAta);
          const bal = Number(acc.amount);
          if (bal <= 0) continue;

          const tx = new Transaction().add(createTransferInstruction(fromAta, toAta, keypair.publicKey, BigInt(bal)));
          await sendAndConfirmTransaction(connection, tx, [keypair], { commitment: "confirmed" });
          totalAmount += bal / (10 ** decimals);
          drained++;
          if (dbCol === "budju_balance") await sql`UPDATE budju_wallets SET budju_balance = 0 WHERE persona_id = ${w.persona_id}`;
          await new Promise(r => setTimeout(r, 1000));
        } catch (err) {
          // Skip wallets with no ATA or no balance
          const msg = err instanceof Error ? err.message : String(err);
          if (!msg.includes("could not find account") && !msg.includes("TokenAccountNotFound")) {
            failed++;
            errors.push(`${w.display_name}: ${msg.slice(0, 80)}`);
          }
        }
      }

      // Also drain from distributors
      const distributors = await sql`SELECT * FROM budju_distributors ORDER BY group_number`;
      for (const d of distributors) {
        try {
          const keypair = decryptKeypair(d.encrypted_keypair as string);
          const fromAta = await getAssociatedTokenAddress(mintPub, keypair.publicKey);
          const acc = await getAccount(connection, fromAta);
          const bal = Number(acc.amount);
          if (bal <= 0) continue;
          const tx = new Transaction().add(createTransferInstruction(fromAta, toAta, keypair.publicKey, BigInt(bal)));
          await sendAndConfirmTransaction(connection, tx, [keypair], { commitment: "confirmed" });
          totalAmount += bal / (10 ** decimals);
          drained++;
          await new Promise(r => setTimeout(r, 1000));
        } catch { /* skip */ }
      }

      return NextResponse.json({
        success: true,
        token,
        drained,
        failed,
        totalRecovered: totalAmount,
        message: `Drained ${totalAmount.toFixed(2)} ${token} from ${drained} wallets back to treasury. SOL untouched.`,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
    }
  }

  // Refuel distributors with SOL then drain all SPL tokens back to treasury
  if (action === "refuel_and_drain_distributors") {
    try {
      const { Connection, PublicKey, LAMPORTS_PER_SOL, Transaction, SystemProgram, sendAndConfirmTransaction } = await import("@solana/web3.js");
      const { getAssociatedTokenAddress, getAccount, createTransferInstruction } = await import("@solana/spl-token");
      const { SERVER_RPC_URL, TREASURY_WALLET_STR } = await import("@/lib/solana-config");
      const sql = (await import("@/lib/db")).getDb();
      const connection = new Connection(SERVER_RPC_URL, "confirmed");
      const treasuryPub = new PublicKey(TREASURY_WALLET_STR);

      // Get treasury keypair
      const treasuryKey = process.env.TREASURY_PRIVATE_KEY;
      if (!treasuryKey) return NextResponse.json({ error: "TREASURY_PRIVATE_KEY not set" }, { status: 500 });
      const { Keypair } = await import("@solana/web3.js");
      const bs58 = await import("bs58");
      const treasuryKeypair = Keypair.fromSecretKey(bs58.default.decode(treasuryKey));

      const distributors = await sql`SELECT * FROM budju_distributors ORDER BY group_number`;
      const { decryptKeypair } = await import("@/lib/trading/budju");

      const MINTS = [
        { name: "BUDJU", mint: new PublicKey("2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump"), decimals: 6 },
        { name: "USDC", mint: new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"), decimals: 6 },
        { name: "GLITCH", mint: new PublicKey("5hfHCmaL6e9bvruy35RQyghMXseTE2mXJ7ukqKAcS8fT"), decimals: 9 },
      ];

      const results: { group: number; step: string; amount?: number; token?: string; tx?: string; error?: string }[] = [];

      for (const d of distributors) {
        const distPub = new PublicKey(d.wallet_address as string);
        const groupNum = Number(d.group_number);

        // Step 1: Send 0.003 SOL from treasury for fee
        try {
          const fuelLamports = 3_000_000; // 0.003 SOL
          const fuelTx = new Transaction().add(
            SystemProgram.transfer({ fromPubkey: treasuryKeypair.publicKey, toPubkey: distPub, lamports: fuelLamports })
          );
          const fuelSig = await sendAndConfirmTransaction(connection, fuelTx, [treasuryKeypair], { commitment: "confirmed" });
          results.push({ group: groupNum, step: "refuel", amount: 0.003, token: "SOL", tx: fuelSig });
          await new Promise(r => setTimeout(r, 1000));
        } catch (err) {
          results.push({ group: groupNum, step: "refuel", error: err instanceof Error ? err.message : String(err) });
          continue; // Can't drain without SOL
        }

        // Step 2: Drain each SPL token
        try {
          const distKeypair = decryptKeypair(d.encrypted_keypair as string);
          for (const { name, mint, decimals } of MINTS) {
            try {
              const fromAta = await getAssociatedTokenAddress(mint, distKeypair.publicKey);
              const acc = await getAccount(connection, fromAta);
              const bal = Number(acc.amount);
              if (bal <= 0) continue;
              const toAta = await getAssociatedTokenAddress(mint, treasuryPub);
              const tx = new Transaction().add(createTransferInstruction(fromAta, toAta, distKeypair.publicKey, BigInt(bal)));
              const sig = await sendAndConfirmTransaction(connection, tx, [distKeypair], { commitment: "confirmed" });
              results.push({ group: groupNum, step: "drain", amount: bal / (10 ** decimals), token: name, tx: sig });
              await new Promise(r => setTimeout(r, 1500));
            } catch { /* no ATA or empty */ }
          }

          // Step 3: Send remaining SOL back
          const remainingSol = await connection.getBalance(distKeypair.publicKey);
          if (remainingSol > 5000) {
            const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: distKeypair.publicKey, toPubkey: treasuryPub, lamports: remainingSol - 5000 }));
            await sendAndConfirmTransaction(connection, tx, [distKeypair], { commitment: "confirmed" });
            results.push({ group: groupNum, step: "drain_sol", amount: (remainingSol - 5000) / LAMPORTS_PER_SOL, token: "SOL" });
          }
        } catch (err) {
          results.push({ group: groupNum, step: "drain", error: err instanceof Error ? err.message : String(err) });
        }
      }

      await sql`UPDATE budju_distributors SET sol_balance = 0, budju_balance = 0`;

      const recovered = results.filter(r => r.step === "drain" && !r.error);
      return NextResponse.json({
        success: true,
        recovered: recovered.length,
        total_results: results.length,
        results,
      });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
    }
  }

  // Drain distributor wallets back to treasury — recovers stuck funds
  if (action === "drain_distributors") {
    try {
      const { Connection, PublicKey, LAMPORTS_PER_SOL, Transaction, SystemProgram, sendAndConfirmTransaction } = await import("@solana/web3.js");
      const { getAssociatedTokenAddress, getAccount, createTransferInstruction, createAssociatedTokenAccountInstruction } = await import("@solana/spl-token");
      const { drainWallets } = await import("@/lib/trading/budju");
      const { TREASURY_WALLET_STR } = await import("@/lib/solana-config");
      // Drain distributors — sends SOL + BUDJU back to treasury
      const result = await drainWallets(TREASURY_WALLET_STR, "distributors");
      return NextResponse.json({ success: true, ...result });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
    }
  }

  // Check all fund locations — where is the money?
  if (action === "fund_check") {
    try {
      const { Connection, PublicKey, LAMPORTS_PER_SOL } = await import("@solana/web3.js");
      const { getAssociatedTokenAddress, getAccount } = await import("@solana/spl-token");
      const { SERVER_RPC_URL, TREASURY_WALLET_STR } = await import("@/lib/solana-config");
      const sql = (await import("@/lib/db")).getDb();
      const connection = new Connection(SERVER_RPC_URL, "confirmed");
      const BUDJU_MINT_PK = new PublicKey("2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump");
      const GLITCH_MINT_PK = new PublicKey("5hfHCmaL6e9bvruy35RQyghMXseTE2mXJ7ukqKAcS8fT");
      const USDC_MINT_PK = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

      async function getTokenBalance(owner: InstanceType<typeof PublicKey>, mint: InstanceType<typeof PublicKey>, decimals: number): Promise<number> {
        try {
          const ata = await getAssociatedTokenAddress(mint, owner);
          const acc = await getAccount(connection, ata);
          return Number(acc.amount) / (10 ** decimals);
        } catch { return 0; }
      }

      // Treasury (live from chain)
      const treasuryPub = new PublicKey(TREASURY_WALLET_STR);
      const treasurySol = (await connection.getBalance(treasuryPub)) / LAMPORTS_PER_SOL;
      const treasuryBudju = await getTokenBalance(treasuryPub, BUDJU_MINT_PK, 6);
      const treasuryGlitch = await getTokenBalance(treasuryPub, GLITCH_MINT_PK, 9);
      const treasuryUsdc = await getTokenBalance(treasuryPub, USDC_MINT_PK, 6);

      // Distributor wallets (from DB)
      const distributors = await sql`SELECT group_number, wallet_address, sol_balance, budju_balance FROM budju_distributors ORDER BY group_number`;
      let distSol = 0, distBudju = 0;
      for (const d of distributors) { distSol += Number(d.sol_balance); distBudju += Number(d.budju_balance); }

      // Persona wallets (from DB — may be stale)
      const [personaStats] = await sql`
        SELECT COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE sol_balance::numeric > 0)::int as funded,
          COUNT(*) FILTER (WHERE sol_balance::numeric <= 0 OR sol_balance IS NULL)::int as unfunded,
          COALESCE(SUM(sol_balance::numeric), 0) as total_sol,
          COALESCE(SUM(budju_balance::numeric), 0) as total_budju
        FROM budju_wallets WHERE is_active = TRUE
      `;

      const totalSol = treasurySol + distSol + Number(personaStats.total_sol);
      const totalBudju = treasuryBudju + distBudju + Number(personaStats.total_budju);

      return NextResponse.json({
        treasury: { sol: treasurySol, budju: treasuryBudju, glitch: treasuryGlitch, usdc: treasuryUsdc },
        distributors: { count: distributors.length, sol: distSol, budju: distBudju },
        personas: {
          total: Number(personaStats.total),
          funded: Number(personaStats.funded),
          unfunded: Number(personaStats.unfunded),
          sol: Number(personaStats.total_sol),
          budju: Number(personaStats.total_budju),
        },
        totals: { sol: totalSol, budju: totalBudju, glitch: treasuryGlitch, usdc: treasuryUsdc },
        summary: `TREASURY: ${treasurySol.toFixed(4)} SOL | ${treasuryBudju.toFixed(0)} BUDJU | ${treasuryGlitch.toFixed(0)} GLITCH | ${treasuryUsdc.toFixed(2)} USDC\nDISTRIBUTORS (${distributors.length}): ${distSol.toFixed(4)} SOL | ${distBudju.toFixed(0)} BUDJU\nPERSONAS (${personaStats.funded} funded / ${personaStats.unfunded} unfunded): ${Number(personaStats.total_sol).toFixed(4)} SOL | ${Number(personaStats.total_budju).toFixed(0)} BUDJU\nTOTAL: ${totalSol.toFixed(4)} SOL | ${totalBudju.toFixed(0)} BUDJU | ${treasuryGlitch.toFixed(0)} GLITCH | ${treasuryUsdc.toFixed(2)} USDC`,
      });
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
      // When user clicks "Process Now", force process ALL pending transfers
      const result = await processDistributionJob(body.job_id, true);
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

  // ── Per-wallet token transfer (to/from treasury) ──
  if (action === "wallet_transfer") {
    try {
      const { Connection, PublicKey, LAMPORTS_PER_SOL, Transaction, SystemProgram, sendAndConfirmTransaction } = await import("@solana/web3.js");
      const { getAssociatedTokenAddress, getAccount, createTransferInstruction, createAssociatedTokenAccountInstruction } = await import("@solana/spl-token");
      const { SERVER_RPC_URL, TREASURY_WALLET_STR } = await import("@/lib/solana-config");
      const { decryptKeypair } = await import("@/lib/trading/budju");
      const sql = (await import("@/lib/db")).getDb();
      const connection = new Connection(SERVER_RPC_URL, "confirmed");

      const personaId = body.persona_id as string;
      const token = (body.token as string || "").toUpperCase();
      const direction = body.direction as string; // "to_treasury" or "from_treasury"
      const amountStr = String(body.amount || "0");
      const isAll = amountStr === "ALL";

      if (!personaId || !token || !direction) {
        return NextResponse.json({ error: "persona_id, token, direction required" }, { status: 400 });
      }

      const MINT_MAP: Record<string, { mint: string; decimals: number }> = {
        "BUDJU": { mint: "2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump", decimals: 6 },
        "USDC": { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6 },
        "GLITCH": { mint: "5hfHCmaL6e9bvruy35RQyghMXseTE2mXJ7ukqKAcS8fT", decimals: 9 },
      };

      // Get persona wallet
      const [wallet] = await sql`SELECT * FROM budju_wallets WHERE persona_id = ${personaId}`;
      if (!wallet) return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
      const personaKeypair = decryptKeypair(wallet.encrypted_keypair as string);
      const personaPub = personaKeypair.publicKey;
      const treasuryPub = new PublicKey(TREASURY_WALLET_STR);

      // Get treasury keypair for from_treasury transfers
      const treasuryKey = process.env.TREASURY_PRIVATE_KEY;
      if (direction === "from_treasury" && !treasuryKey) {
        return NextResponse.json({ error: "TREASURY_PRIVATE_KEY not set" }, { status: 500 });
      }
      const { Keypair } = await import("@solana/web3.js");
      const bs58 = await import("bs58");
      const treasuryKeypair = treasuryKey ? Keypair.fromSecretKey(bs58.default.decode(treasuryKey)) : null;

      if (token === "SOL") {
        if (direction === "to_treasury") {
          const balance = await connection.getBalance(personaPub);
          const sendLamports = isAll ? balance - 5000 : Math.floor(parseFloat(amountStr) * LAMPORTS_PER_SOL);
          if (sendLamports <= 0) return NextResponse.json({ error: "Insufficient SOL" }, { status: 400 });
          const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: personaPub, toPubkey: treasuryPub, lamports: sendLamports }));
          const sig = await sendAndConfirmTransaction(connection, tx, [personaKeypair], { commitment: "confirmed" });
          await sql`UPDATE budju_wallets SET sol_balance = GREATEST(0, sol_balance::numeric - ${sendLamports / LAMPORTS_PER_SOL}) WHERE persona_id = ${personaId}`;
          return NextResponse.json({ success: true, tx: sig, amount: sendLamports / LAMPORTS_PER_SOL, token: "SOL" });
        } else {
          if (!treasuryKeypair) return NextResponse.json({ error: "No treasury key" }, { status: 500 });
          const sendLamports = Math.floor(parseFloat(amountStr) * LAMPORTS_PER_SOL);
          const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: treasuryPub, toPubkey: personaPub, lamports: sendLamports }));
          const sig = await sendAndConfirmTransaction(connection, tx, [treasuryKeypair], { commitment: "confirmed" });
          await sql`UPDATE budju_wallets SET sol_balance = sol_balance::numeric + ${sendLamports / LAMPORTS_PER_SOL} WHERE persona_id = ${personaId}`;
          return NextResponse.json({ success: true, tx: sig, amount: sendLamports / LAMPORTS_PER_SOL, token: "SOL" });
        }
      }

      // SPL token transfer
      const mintInfo = MINT_MAP[token];
      if (!mintInfo) return NextResponse.json({ error: `Unknown token: ${token}` }, { status: 400 });
      const mintPub = new PublicKey(mintInfo.mint);

      if (direction === "to_treasury") {
        const fromAta = await getAssociatedTokenAddress(mintPub, personaPub);
        const toAta = await getAssociatedTokenAddress(mintPub, treasuryPub);
        const acc = await getAccount(connection, fromAta);
        const bal = Number(acc.amount);
        const sendAmount = isAll ? bal : Math.floor(parseFloat(amountStr) * (10 ** mintInfo.decimals));
        if (sendAmount <= 0) return NextResponse.json({ error: `No ${token} to send` }, { status: 400 });
        const tx = new Transaction().add(createTransferInstruction(fromAta, toAta, personaPub, BigInt(sendAmount)));
        const sig = await sendAndConfirmTransaction(connection, tx, [personaKeypair], { commitment: "confirmed" });
        if (token === "BUDJU") await sql`UPDATE budju_wallets SET budju_balance = GREATEST(0, budju_balance::numeric - ${sendAmount / (10 ** mintInfo.decimals)}) WHERE persona_id = ${personaId}`;
        return NextResponse.json({ success: true, tx: sig, amount: sendAmount / (10 ** mintInfo.decimals), token });
      } else {
        if (!treasuryKeypair) return NextResponse.json({ error: "No treasury key" }, { status: 500 });
        const fromAta = await getAssociatedTokenAddress(mintPub, treasuryPub);
        const toAta = await getAssociatedTokenAddress(mintPub, personaPub);
        const sendAmount = Math.floor(parseFloat(amountStr) * (10 ** mintInfo.decimals));
        // Create ATA if needed
        let needsAta = false;
        try { await getAccount(connection, toAta); } catch { needsAta = true; }
        const tx = new Transaction();
        if (needsAta) tx.add(createAssociatedTokenAccountInstruction(treasuryKeypair.publicKey, toAta, personaPub, mintPub));
        tx.add(createTransferInstruction(fromAta, toAta, treasuryPub, BigInt(sendAmount)));
        const sig = await sendAndConfirmTransaction(connection, tx, [treasuryKeypair], { commitment: "confirmed" });
        if (token === "BUDJU") await sql`UPDATE budju_wallets SET budju_balance = budju_balance::numeric + ${sendAmount / (10 ** mintInfo.decimals)} WHERE persona_id = ${personaId}`;
        return NextResponse.json({ success: true, tx: sig, amount: sendAmount / (10 ** mintInfo.decimals), token });
      }
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Transfer failed" }, { status: 500 });
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
