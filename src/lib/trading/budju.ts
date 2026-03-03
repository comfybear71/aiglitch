/**
 * BUDJU AI Persona Trading Engine
 *
 * Creates organic-looking on-chain trade volume for $BUDJU on Solana.
 * Each AI persona gets its own wallet, funded through distributor wallets
 * to avoid bubble map detection (no single treasury → N wallets pattern).
 *
 * Anti-bubble-map strategies:
 * 1. Layered funding: Treasury → 4 Distributors → 15 Persona wallets
 * 2. Varied trade sizes ($0.50–$10, weighted toward smaller trades)
 * 3. Random timing (2–30 min intervals with quiet/active hours)
 * 4. Personality-driven patterns (each persona has unique behavior)
 * 5. Mix Jupiter + Raydium swaps
 * 6. Variable hold periods (personas don't instantly sell what they buy)
 */

import { Keypair, PublicKey, Connection, VersionedTransaction, Transaction, SystemProgram, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getDb } from "../db";
import { SERVER_RPC_URL, BUDJU_TOKEN_MINT_STR, TREASURY_WALLET_STR } from "../solana-config";
import { getTradingPersonality, generateTradeCommentary } from "./personalities";
import { v4 as uuidv4 } from "uuid";
import bs58 from "bs58";

// ── Constants ──
const BUDJU_MINT = BUDJU_TOKEN_MINT_STR;
const BUDJU_DECIMALS = 6; // pump.fun tokens use 6 decimals
const BUDJU_MULTIPLIER = 10 ** BUDJU_DECIMALS; // 1e6
const SOL_MINT = "So11111111111111111111111111111111111111112"; // Wrapped SOL

// Jupiter API v1 (migrated from deprecated v6 — old quote-api.jup.ag returns 403)
const JUPITER_API_KEY = process.env.JUPITER_API_KEY || "";
const JUPITER_QUOTE_API = "https://api.jup.ag/swap/v1/quote";
const JUPITER_SWAP_API = "https://api.jup.ag/swap/v1/swap";
const DISTRIBUTOR_COUNT = 4; // 4 distributor wallets between treasury and personas

// ── Ensure BUDJU tables exist (bypasses seed.ts fast-path) ──
let _budjuTablesReady = false;
async function ensureBudjuTables(): Promise<void> {
  if (_budjuTablesReady) return;
  const sql = getDb();
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS budju_trading_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
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
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS budju_distributors (
        id TEXT PRIMARY KEY,
        group_number INTEGER UNIQUE NOT NULL,
        wallet_address TEXT UNIQUE NOT NULL,
        encrypted_keypair TEXT NOT NULL,
        sol_balance REAL NOT NULL DEFAULT 0,
        budju_balance REAL NOT NULL DEFAULT 0,
        personas_funded INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS budju_trades (
        id TEXT PRIMARY KEY,
        persona_id TEXT NOT NULL,
        wallet_address TEXT NOT NULL,
        trade_type TEXT NOT NULL CHECK (trade_type IN ('buy', 'sell')),
        budju_amount REAL NOT NULL,
        sol_amount REAL NOT NULL,
        price_per_budju REAL NOT NULL,
        usd_value REAL NOT NULL DEFAULT 0,
        dex_used TEXT NOT NULL DEFAULT 'jupiter',
        tx_signature TEXT,
        strategy TEXT,
        commentary TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    // Seed default config
    const defaults: [string, string][] = [
      ["enabled", "false"], ["daily_budget_usd", "100"], ["max_trade_usd", "10"],
      ["min_trade_usd", "0.50"], ["min_interval_minutes", "2"], ["max_interval_minutes", "30"],
      ["buy_sell_ratio", "0.6"], ["active_persona_count", "15"],
      ["spent_today_usd", "0"], ["spent_reset_date", ""],
    ];
    for (const [k, v] of defaults) {
      await sql`INSERT INTO budju_trading_config (key, value) VALUES (${k}, ${v}) ON CONFLICT (key) DO NOTHING`;
    }
    _budjuTablesReady = true;
  } catch (e) {
    console.error("[BUDJU] Table creation failed:", e);
    throw e;
  }
}

// ── Encryption helpers (simple XOR with env secret for keypair storage) ──
const ENCRYPTION_KEY = process.env.BUDJU_WALLET_SECRET || process.env.ADMIN_PASSWORD || "budju-default-key";

function encryptKeypair(secretKey: Uint8Array): string {
  const keyBytes = new TextEncoder().encode(ENCRYPTION_KEY);
  const encrypted = new Uint8Array(secretKey.length);
  for (let i = 0; i < secretKey.length; i++) {
    encrypted[i] = secretKey[i] ^ keyBytes[i % keyBytes.length];
  }
  return bs58.encode(encrypted);
}

function decryptKeypair(encrypted: string): Keypair {
  const encBytes = bs58.decode(encrypted);
  const keyBytes = new TextEncoder().encode(ENCRYPTION_KEY);
  const decrypted = new Uint8Array(encBytes.length);
  for (let i = 0; i < encBytes.length; i++) {
    decrypted[i] = encBytes[i] ^ keyBytes[i % keyBytes.length];
  }
  return Keypair.fromSecretKey(decrypted);
}

// ── Get trading config ──
export async function getBudjuConfig(): Promise<Record<string, string>> {
  await ensureBudjuTables();
  const sql = getDb();
  const rows = await sql`SELECT key, value FROM budju_trading_config`;
  const config: Record<string, string> = {};
  for (const row of rows) {
    config[row.key as string] = row.value as string;
  }
  return config;
}

export async function setBudjuConfig(key: string, value: string): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO budju_trading_config (key, value, updated_at) VALUES (${key}, ${value}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = ${value}, updated_at = NOW()
  `;
}

// ── Wallet Management ──

export async function generatePersonaWallets(personaCount: number = 15): Promise<{
  distributors: number;
  wallets: number;
  personas: string[];
  errors: string[];
}> {
  await ensureBudjuTables();
  const sql = getDb();
  const errors: string[] = [];

  // 1. Create distributor wallets if they don't exist
  try {
    const existingDistributors = await sql`SELECT group_number FROM budju_distributors`;
    const existingGroups = new Set(existingDistributors.map(d => Number(d.group_number)));

    for (let g = 0; g < DISTRIBUTOR_COUNT; g++) {
      if (existingGroups.has(g)) continue;
      const kp = Keypair.generate();
      await sql`
        INSERT INTO budju_distributors (id, group_number, wallet_address, encrypted_keypair, created_at)
        VALUES (${uuidv4()}, ${g}, ${kp.publicKey.toBase58()}, ${encryptKeypair(kp.secretKey)}, NOW())
        ON CONFLICT (group_number) DO NOTHING
      `;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`Distributor creation failed: ${msg}`);
    console.error("[BUDJU] Distributor creation failed:", e);
  }

  // 2. Get active personas that don't have wallets yet
  const createdPersonas: string[] = [];
  try {
    const personasWithoutWallets = await sql`
      SELECT p.id, p.username, p.persona_type
      FROM ai_personas p
      LEFT JOIN budju_wallets bw ON bw.persona_id = p.id
      WHERE p.is_active = TRUE AND bw.id IS NULL
      ORDER BY RANDOM()
      LIMIT ${personaCount}
    `;

    for (let i = 0; i < personasWithoutWallets.length; i++) {
      const persona = personasWithoutWallets[i];
      const distributorGroup = i % DISTRIBUTOR_COUNT;
      try {
        const kp = Keypair.generate();
        // Check if persona already has a wallet (avoid ON CONFLICT issues)
        const [existing] = await sql`SELECT id FROM budju_wallets WHERE persona_id = ${persona.id}`;
        if (existing) continue;

        await sql`
          INSERT INTO budju_wallets (id, persona_id, wallet_address, encrypted_keypair, distributor_group, created_at)
          VALUES (${uuidv4()}, ${persona.id}, ${kp.publicKey.toBase58()}, ${encryptKeypair(kp.secretKey)}, ${distributorGroup}, NOW())
        `;
        createdPersonas.push(persona.username as string);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`Wallet for ${persona.username} failed: ${msg}`);
        console.error(`[BUDJU] Wallet creation failed for ${persona.username}:`, e);
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`Persona query failed: ${msg}`);
    console.error("[BUDJU] Persona query failed:", e);
  }

  // Update distributor persona counts
  try {
    for (let g = 0; g < DISTRIBUTOR_COUNT; g++) {
      const [count] = await sql`SELECT COUNT(*) as cnt FROM budju_wallets WHERE distributor_group = ${g}`;
      await sql`UPDATE budju_distributors SET personas_funded = ${Number(count.cnt)} WHERE group_number = ${g}`;
    }
  } catch { /* non-critical */ }

  return {
    distributors: DISTRIBUTOR_COUNT,
    wallets: createdPersonas.length,
    personas: createdPersonas,
    errors,
  };
}

// ── Get SOL price in USD (from platform settings) ──
async function getSolPriceUsd(): Promise<number> {
  try {
    const sql = getDb();
    const [row] = await sql`SELECT value FROM platform_settings WHERE key = 'sol_price_usd'`;
    return parseFloat(row?.value as string || "164");
  } catch {
    return 164;
  }
}

// ── Get BUDJU price from DexScreener or fallback ──
async function getBudjuPriceUsd(): Promise<number> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${BUDJU_MINT}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      if (data.pairs && data.pairs.length > 0) {
        const price = parseFloat(data.pairs[0].priceUsd || "0");
        if (price > 0) return price;
      }
    }
  } catch { /* fallback below */ }

  try {
    const sql = getDb();
    const [row] = await sql`SELECT value FROM platform_settings WHERE key = 'budju_price_usd'`;
    return parseFloat(row?.value as string || "0.0069");
  } catch {
    return 0.0069;
  }
}

// ── Generate random trade amount (weighted toward smaller trades) ──
function generateTradeAmountUsd(minUsd: number, maxUsd: number): number {
  // Use exponential distribution — more small trades, fewer large ones
  const u = Math.random();
  const skewed = Math.pow(u, 1.8); // Skew toward lower values
  return minUsd + skewed * (maxUsd - minUsd);
}

// ── Pick random DEX ──
function pickDex(): "jupiter" | "raydium" {
  return Math.random() < 0.65 ? "jupiter" : "raydium";
}

// ── Jupiter swap execution ──
// Uses Jupiter Swap API v1 (api.jup.ag) — requires JUPITER_API_KEY env var
// Get a free key at https://portal.jup.ag
async function executeJupiterSwap(
  walletKeypair: Keypair,
  inputMint: string,
  outputMint: string,
  amountLamports: number,
  slippageBps: number = 300,
): Promise<{ signature: string; inputAmount: number; outputAmount: number; error?: undefined } | { signature?: undefined; inputAmount?: undefined; outputAmount?: undefined; error: string }> {
  if (!JUPITER_API_KEY) {
    return { error: "JUPITER_API_KEY not set — get a free key at portal.jup.ag" };
  }

  const jupHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": JUPITER_API_KEY,
  };

  try {
    // 1. Get quote
    const quoteUrl = `${JUPITER_QUOTE_API}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountLamports}&slippageBps=${slippageBps}&restrictIntermediateTokens=true`;
    const quoteRes = await fetch(quoteUrl, {
      headers: { "x-api-key": JUPITER_API_KEY },
      signal: AbortSignal.timeout(10000),
    });
    if (!quoteRes.ok) {
      const errBody = await quoteRes.text().catch(() => "");
      return { error: `Quote HTTP ${quoteRes.status}: ${errBody.slice(0, 150)}` };
    }
    const quoteData = await quoteRes.json();
    if (!quoteData || quoteData.error) {
      return { error: `Quote error: ${quoteData?.error || "empty response"}` };
    }

    console.log(`[BUDJU] Quote: ${quoteData.inAmount} → ${quoteData.outAmount} (${inputMint.slice(0,8)}→${outputMint.slice(0,8)})`);

    // 2. Build swap transaction
    const swapRes = await fetch(JUPITER_SWAP_API, {
      method: "POST",
      headers: jupHeaders,
      body: JSON.stringify({
        quoteResponse: quoteData,
        userPublicKey: walletKeypair.publicKey.toBase58(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        dynamicSlippage: true,
        prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: 1000000, priorityLevel: "medium" } },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!swapRes.ok) {
      const errBody = await swapRes.text().catch(() => "");
      return { error: `Swap build HTTP ${swapRes.status}: ${errBody.slice(0, 150)}` };
    }
    const swapData = await swapRes.json();
    if (!swapData.swapTransaction) {
      return { error: `No swap tx: ${swapData.error || JSON.stringify(swapData).slice(0, 150)}` };
    }

    // 3. Deserialize, sign, and send
    const connection = new Connection(SERVER_RPC_URL, "confirmed");
    const txBuf = Buffer.from(swapData.swapTransaction, "base64");
    const tx = VersionedTransaction.deserialize(txBuf);
    tx.sign([walletKeypair]);

    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });

    console.log(`[BUDJU] Tx sent: ${signature}`);

    // 4. Confirm with timeout
    const latestBlockhash = await connection.getLatestBlockhash("confirmed");
    await connection.confirmTransaction({
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    }, "confirmed");

    console.log(`[BUDJU] Tx confirmed: ${signature}`);

    return {
      signature,
      inputAmount: Number(quoteData.inAmount),
      outputAmount: Number(quoteData.outAmount),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[BUDJU Trading] Jupiter swap failed:", msg);
    return { error: `Swap exception: ${msg.slice(0, 150)}` };
  }
}

// ── Core Trading Engine ──

export interface TradeResult {
  persona_id: string;
  persona_name: string;
  persona_emoji: string;
  trade_type: "buy" | "sell";
  budju_amount: number;
  sol_amount: number;
  usd_value: number;
  dex_used: string;
  tx_signature: string | null;
  commentary: string;
  strategy: string;
  status: "confirmed" | "failed" | "simulated";
  error?: string;
}

export async function executeBudjuTradeBatch(targetCount?: number): Promise<{
  trades: TradeResult[];
  budget_remaining: number;
  is_enabled: boolean;
}> {
  const sql = getDb();
  const config = await getBudjuConfig();

  const isEnabled = config.enabled === "true";
  if (!isEnabled) {
    return { trades: [], budget_remaining: 0, is_enabled: false };
  }

  // Pre-flight: Jupiter API key is required for all swaps
  if (!JUPITER_API_KEY) {
    console.error("[BUDJU] JUPITER_API_KEY not set — all trades will fail. Get a free key at https://portal.jup.ag");
    return { trades: [], budget_remaining: 0, is_enabled: true };
  }

  const maxTradeUsd = parseFloat(config.max_trade_usd || "10");
  const minTradeUsd = parseFloat(config.min_trade_usd || "0.50");
  const dailyBudget = parseFloat(config.daily_budget_usd || "100");
  const buySellRatio = parseFloat(config.buy_sell_ratio || "0.6");

  // Reset daily spend counter if new day
  const today = new Date().toISOString().split("T")[0];
  if (config.spent_reset_date !== today) {
    await setBudjuConfig("spent_today_usd", "0");
    await setBudjuConfig("spent_reset_date", today);
  }

  const spentToday = parseFloat(config.spent_today_usd || "0");
  const budgetRemaining = dailyBudget - spentToday;
  if (budgetRemaining <= minTradeUsd) {
    return { trades: [], budget_remaining: 0, is_enabled: true };
  }

  // Get current prices
  const solPriceUsd = await getSolPriceUsd();
  const budjuPriceUsd = await getBudjuPriceUsd();

  // Update BUDJU price in platform settings
  if (budjuPriceUsd > 0) {
    const budjuPriceSol = budjuPriceUsd / solPriceUsd;
    await sql`UPDATE platform_settings SET value = ${budjuPriceUsd.toString()}, updated_at = NOW() WHERE key = 'budju_price_usd'`;
    await sql`UPDATE platform_settings SET value = ${budjuPriceSol.toString()}, updated_at = NOW() WHERE key = 'budju_price_sol'`;
  }

  // Get persona wallets that are active and funded
  const count = targetCount || (3 + Math.floor(Math.random() * 5)); // 3-7 trades per batch
  const wallets = await sql`
    SELECT bw.*, p.username, p.display_name, p.avatar_emoji, p.persona_type
    FROM budju_wallets bw
    JOIN ai_personas p ON p.id = bw.persona_id
    WHERE bw.is_active = TRUE AND p.is_active = TRUE
    ORDER BY RANDOM()
    LIMIT ${count * 2}
  `;

  const trades: TradeResult[] = [];
  let totalSpent = 0;

  for (const wallet of wallets) {
    if (trades.length >= count) break;
    if (totalSpent + minTradeUsd > budgetRemaining) break;

    const personality = getTradingPersonality(wallet.persona_id as string, wallet.persona_type as string);

    // Roll against trade frequency
    if (Math.random() * 100 > personality.tradeFrequency) continue;

    // Determine buy or sell based on personality bias + configured ratio
    const adjustedBias = (buySellRatio + (personality.bias * 0.3));
    const isBuy = Math.random() < adjustedBias;
    const tradeType: "buy" | "sell" = isBuy ? "buy" : "sell";

    // Generate trade amount (USD)
    const tradeUsd = Math.min(
      generateTradeAmountUsd(minTradeUsd, maxTradeUsd),
      budgetRemaining - totalSpent,
    );
    if (tradeUsd < minTradeUsd) continue;

    // Convert to SOL/BUDJU amounts
    const solAmount = tradeUsd / solPriceUsd;
    const budjuAmount = tradeUsd / (budjuPriceUsd || 0.001);

    // Pick DEX
    const dex = pickDex();

    // Generate commentary
    const commentary = generateTradeCommentary(
      personality,
      isBuy,
      Math.floor(budjuAmount),
      solAmount,
    ).replace(/\$GLITCH/g, "$BUDJU").replace(/GLITCH/g, "BUDJU");

    // Execute the trade on-chain
    let txSignature: string | null = null;
    let status: "confirmed" | "failed" | "simulated" = "simulated";
    let errorMsg: string | undefined;

    try {
      const keypair = decryptKeypair(wallet.encrypted_keypair as string);
      const connection = new Connection(SERVER_RPC_URL, "confirmed");

      if (isBuy) {
        // Buy BUDJU with SOL — check wallet has enough SOL first
        const lamports = Math.floor(solAmount * 1e9);
        const walletBalance = await connection.getBalance(keypair.publicKey).catch(() => 0);
        const minRequired = lamports + 5_000_000; // trade amount + ~0.005 SOL fee buffer for priority fees

        if (walletBalance < minRequired) {
          status = "failed";
          errorMsg = `Insufficient SOL: has ${(walletBalance / 1e9).toFixed(4)}, needs ${(minRequired / 1e9).toFixed(4)}`;
          console.log(`[BUDJU] Skipping buy for ${wallet.username}: ${errorMsg}`);
        } else {
          const result = await executeJupiterSwap(keypair, SOL_MINT, BUDJU_MINT, lamports);
          if (result.signature) {
            txSignature = result.signature;
            status = "confirmed";
          } else {
            status = "failed";
            errorMsg = result.error || "Unknown swap error";
          }
        }
      } else {
        // Sell BUDJU for SOL — check wallet has BUDJU tokens
        const budjuLamports = Math.floor(budjuAmount * BUDJU_MULTIPLIER);

        // Verify SOL for tx fees
        const walletBalance = await connection.getBalance(keypair.publicKey).catch(() => 0);
        if (walletBalance < 5_000_000) {
          status = "failed";
          errorMsg = `No SOL for tx fees: has ${(walletBalance / 1e9).toFixed(4)} SOL, needs ~0.005`;
          console.log(`[BUDJU] Skipping sell for ${wallet.username}: ${errorMsg}`);
        } else {
          const result = await executeJupiterSwap(keypair, BUDJU_MINT, SOL_MINT, budjuLamports);
          if (result.signature) {
            txSignature = result.signature;
            status = "confirmed";
          } else {
            status = "failed";
            errorMsg = result.error || "Unknown swap error";
          }
        }
      }
    } catch (err) {
      status = "failed";
      errorMsg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[BUDJU] Trade error for ${wallet.username}:`, errorMsg);
    }

    // Record the trade in database
    const tradeId = uuidv4();
    const budjuPriceSol = budjuPriceUsd / solPriceUsd;
    await sql`
      INSERT INTO budju_trades (id, persona_id, wallet_address, trade_type, budju_amount, sol_amount, price_per_budju, usd_value, dex_used, tx_signature, strategy, commentary, status, error_message, created_at)
      VALUES (${tradeId}, ${wallet.persona_id}, ${wallet.wallet_address}, ${tradeType}, ${budjuAmount}, ${solAmount}, ${budjuPriceSol}, ${tradeUsd}, ${dex}, ${txSignature}, ${personality.strategy}, ${commentary}, ${status}, ${errorMsg || null}, NOW())
    `;

    // Track spend — only count confirmed on-chain trades, not failed attempts
    if (status === "confirmed") {
      totalSpent += tradeUsd;
    }

    trades.push({
      persona_id: wallet.persona_id as string,
      persona_name: wallet.display_name as string,
      persona_emoji: wallet.avatar_emoji as string,
      trade_type: tradeType,
      budju_amount: budjuAmount,
      sol_amount: solAmount,
      usd_value: tradeUsd,
      dex_used: dex,
      tx_signature: txSignature,
      commentary,
      strategy: personality.strategy,
      status,
      error: errorMsg,
    });
  }

  // Update daily spend
  await setBudjuConfig("spent_today_usd", (spentToday + totalSpent).toFixed(2));

  return {
    trades,
    budget_remaining: budgetRemaining - totalSpent,
    is_enabled: true,
  };
}

// ── Distribute SOL + BUDJU from distributors to persona wallets ──
export async function distributeFundsFromDistributors(): Promise<{
  distributions: { group: number; persona: string; wallet: string; sol_sent: number; budju_sent: number; tx_sol: string | null; tx_budju: string | null; error?: string }[];
  total_sol_distributed: number;
  total_budju_distributed: number;
  errors: string[];
}> {
  await ensureBudjuTables();
  const sql = getDb();
  const connection = new Connection(SERVER_RPC_URL, "confirmed");
  const { getAssociatedTokenAddress, getAccount, createAssociatedTokenAccountInstruction, createTransferInstruction } = await import("@solana/spl-token");
  const budjuMint = new PublicKey(BUDJU_MINT);

  const distributions: { group: number; persona: string; wallet: string; sol_sent: number; budju_sent: number; tx_sol: string | null; tx_budju: string | null; error?: string }[] = [];
  const errors: string[] = [];
  let totalSolDistributed = 0;
  let totalBudjuDistributed = 0;

  // Get all distributors
  const distributors = await sql`SELECT * FROM budju_distributors ORDER BY group_number`;
  if (distributors.length === 0) {
    return { distributions: [], total_sol_distributed: 0, total_budju_distributed: 0, errors: ["No distributor wallets found. Generate wallets first."] };
  }

  for (const dist of distributors) {
    try {
      const distKeypair = decryptKeypair(dist.encrypted_keypair as string);
      const distPubkey = distKeypair.publicKey;

      // Get on-chain SOL balance
      const balanceLamports = await connection.getBalance(distPubkey);
      const balanceSol = balanceLamports / LAMPORTS_PER_SOL;

      // Get on-chain BUDJU balance
      let budjuBalance = 0;
      let distBudjuAta: PublicKey | null = null;
      try {
        distBudjuAta = await getAssociatedTokenAddress(budjuMint, distPubkey);
        const account = await getAccount(connection, distBudjuAta);
        budjuBalance = Number(account.amount) / BUDJU_MULTIPLIER; // pump.fun = 6 decimals
      } catch { /* no BUDJU ATA yet */ }

      // Reserve SOL for fees: 0.005 base + 0.003 per persona for potential ATA creation
      const personas = await sql`
        SELECT bw.*, p.display_name FROM budju_wallets bw
        JOIN ai_personas p ON p.id = bw.persona_id
        WHERE bw.distributor_group = ${dist.group_number} AND bw.is_active = TRUE
      `;

      if (personas.length === 0) {
        errors.push(`Group ${dist.group_number}: No active persona wallets`);
        continue;
      }

      const reserveSol = 0.005 + (budjuBalance > 0 ? personas.length * 0.003 : 0);
      const availableSol = balanceSol - reserveSol;

      const hasSol = availableSol > 0.001;
      const hasBudju = budjuBalance > 1; // At least 1 BUDJU to distribute

      if (!hasSol && !hasBudju) {
        errors.push(`Group ${dist.group_number}: Insufficient balance (${balanceSol.toFixed(4)} SOL, ${budjuBalance.toFixed(0)} BUDJU)`);
        continue;
      }

      // Split available funds across personas with slight variation (anti-bubble-map)
      const solAmounts: number[] = [];
      const budjuAmounts: number[] = [];
      let totalSolAlloc = 0;
      let totalBudjuAlloc = 0;

      for (let i = 0; i < personas.length; i++) {
        const variance = 0.8 + Math.random() * 0.4; // 0.8 to 1.2
        if (hasSol) {
          const amt = (availableSol / personas.length) * variance;
          solAmounts.push(amt);
          totalSolAlloc += amt;
        } else {
          solAmounts.push(0);
        }
        if (hasBudju) {
          const amt = (budjuBalance / personas.length) * variance;
          budjuAmounts.push(amt);
          totalBudjuAlloc += amt;
        } else {
          budjuAmounts.push(0);
        }
      }

      // Normalize so totals don't exceed available
      if (hasSol && totalSolAlloc > 0) {
        const scale = availableSol / totalSolAlloc;
        for (let i = 0; i < solAmounts.length; i++) solAmounts[i] *= scale;
      }
      if (hasBudju && totalBudjuAlloc > 0) {
        const scale = budjuBalance / totalBudjuAlloc;
        for (let i = 0; i < budjuAmounts.length; i++) budjuAmounts[i] *= scale;
      }

      // Send funds to each persona wallet
      for (let i = 0; i < personas.length; i++) {
        const persona = personas[i];
        const personaPubkey = new PublicKey(persona.wallet_address as string);
        let txSol: string | null = null;
        let txBudju: string | null = null;
        let solSent = 0;
        let budjuSent = 0;
        const entryErrors: string[] = [];

        // Send SOL
        if (solAmounts[i] > 0) {
          const lamportsToSend = Math.floor(solAmounts[i] * LAMPORTS_PER_SOL);
          if (lamportsToSend >= 5000) {
            try {
              const tx = new Transaction().add(
                SystemProgram.transfer({
                  fromPubkey: distPubkey,
                  toPubkey: personaPubkey,
                  lamports: lamportsToSend,
                })
              );
              txSol = await sendAndConfirmTransaction(connection, tx, [distKeypair], { commitment: "confirmed" });
              solSent = solAmounts[i];
              totalSolDistributed += solSent;
            } catch (err) {
              entryErrors.push(`SOL: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        }

        // Send BUDJU
        if (budjuAmounts[i] > 1 && distBudjuAta) {
          const budjuLamports = BigInt(Math.floor(budjuAmounts[i] * BUDJU_MULTIPLIER));
          try {
            // Get or create persona's BUDJU ATA
            const personaAta = await getAssociatedTokenAddress(budjuMint, personaPubkey);
            const tx = new Transaction();

            // Check if ATA exists, create if not
            try {
              await getAccount(connection, personaAta);
            } catch {
              tx.add(
                createAssociatedTokenAccountInstruction(
                  distPubkey,       // payer
                  personaAta,       // ata
                  personaPubkey,    // owner
                  budjuMint,        // mint
                )
              );
            }

            tx.add(
              createTransferInstruction(
                distBudjuAta,     // source
                personaAta,       // destination
                distPubkey,       // owner
                budjuLamports,    // amount in smallest units
              )
            );

            txBudju = await sendAndConfirmTransaction(connection, tx, [distKeypair], { commitment: "confirmed" });
            budjuSent = budjuAmounts[i];
            totalBudjuDistributed += budjuSent;
          } catch (err) {
            entryErrors.push(`BUDJU: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        // Update DB
        if (solSent > 0 || budjuSent > 0) {
          await sql`
            UPDATE budju_wallets SET
              sol_balance = sol_balance + ${solSent},
              budju_balance = budju_balance + ${budjuSent},
              total_funded_sol = total_funded_sol + ${solSent},
              total_funded_budju = total_funded_budju + ${budjuSent},
              updated_at = NOW()
            WHERE persona_id = ${persona.persona_id}
          `;
        }

        distributions.push({
          group: Number(dist.group_number),
          persona: persona.display_name as string,
          wallet: persona.wallet_address as string,
          sol_sent: solSent,
          budju_sent: budjuSent,
          tx_sol: txSol,
          tx_budju: txBudju,
          error: entryErrors.length > 0 ? entryErrors.join("; ") : undefined,
        });
        if (entryErrors.length > 0) {
          errors.push(`Group ${dist.group_number} → ${persona.display_name}: ${entryErrors.join("; ")}`);
        }
      }

      // Update distributor balance in DB
      const newSolBalance = await connection.getBalance(distPubkey);
      let newBudjuBalance = 0;
      try {
        if (distBudjuAta) {
          const account = await getAccount(connection, distBudjuAta);
          newBudjuBalance = Number(account.amount) / BUDJU_MULTIPLIER;
        }
      } catch { /* empty now */ }
      await sql`UPDATE budju_distributors SET sol_balance = ${newSolBalance / LAMPORTS_PER_SOL}, budju_balance = ${newBudjuBalance} WHERE group_number = ${dist.group_number}`;

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Group ${dist.group_number} failed: ${msg}`);
    }
  }

  return { distributions, total_sol_distributed: totalSolDistributed, total_budju_distributed: totalBudjuDistributed, errors };
}

// ── Drain all persona/distributor wallets back to a destination ──
export async function drainWallets(destinationAddress: string, walletType: "personas" | "distributors" | "all" = "all"): Promise<{
  drained: { type: string; name: string; wallet: string; sol_sent: number; tx: string | null; error?: string }[];
  total_sol_recovered: number;
  errors: string[];
}> {
  await ensureBudjuTables();
  const sql = getDb();
  const connection = new Connection(SERVER_RPC_URL, "confirmed");
  const drained: { type: string; name: string; wallet: string; sol_sent: number; tx: string | null; error?: string }[] = [];
  const drainErrors: string[] = [];
  let totalRecovered = 0;
  const destination = new PublicKey(destinationAddress);

  // Drain persona wallets
  if (walletType === "personas" || walletType === "all") {
    const wallets = await sql`
      SELECT bw.*, p.display_name FROM budju_wallets bw
      JOIN ai_personas p ON p.id = bw.persona_id
    `;

    for (const w of wallets) {
      try {
        const keypair = decryptKeypair(w.encrypted_keypair as string);
        const balanceLamports = await connection.getBalance(keypair.publicKey);
        // Need to reserve enough for the tx fee (~5000 lamports)
        const sendLamports = balanceLamports - 5000;
        if (sendLamports <= 0) {
          drained.push({ type: "persona", name: w.display_name as string, wallet: w.wallet_address as string, sol_sent: 0, tx: null, error: "Empty wallet" });
          continue;
        }

        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: keypair.publicKey,
            toPubkey: destination,
            lamports: sendLamports,
          })
        );
        const signature = await sendAndConfirmTransaction(connection, tx, [keypair], { commitment: "confirmed" });
        const solSent = sendLamports / LAMPORTS_PER_SOL;

        await sql`UPDATE budju_wallets SET sol_balance = 0, updated_at = NOW() WHERE persona_id = ${w.persona_id}`;

        drained.push({ type: "persona", name: w.display_name as string, wallet: w.wallet_address as string, sol_sent: solSent, tx: signature });
        totalRecovered += solSent;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        drained.push({ type: "persona", name: w.display_name as string, wallet: w.wallet_address as string, sol_sent: 0, tx: null, error: msg });
        drainErrors.push(`Persona ${w.display_name}: ${msg}`);
      }
    }
  }

  // Drain distributor wallets
  if (walletType === "distributors" || walletType === "all") {
    const distributors = await sql`SELECT * FROM budju_distributors ORDER BY group_number`;

    for (const d of distributors) {
      try {
        const keypair = decryptKeypair(d.encrypted_keypair as string);
        const balanceLamports = await connection.getBalance(keypair.publicKey);
        const sendLamports = balanceLamports - 5000;
        if (sendLamports <= 0) {
          drained.push({ type: "distributor", name: `Group ${d.group_number}`, wallet: d.wallet_address as string, sol_sent: 0, tx: null, error: "Empty wallet" });
          continue;
        }

        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: keypair.publicKey,
            toPubkey: destination,
            lamports: sendLamports,
          })
        );
        const signature = await sendAndConfirmTransaction(connection, tx, [keypair], { commitment: "confirmed" });
        const solSent = sendLamports / LAMPORTS_PER_SOL;

        await sql`UPDATE budju_distributors SET sol_balance = 0 WHERE group_number = ${d.group_number}`;

        drained.push({ type: "distributor", name: `Group ${d.group_number}`, wallet: d.wallet_address as string, sol_sent: solSent, tx: signature });
        totalRecovered += solSent;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        drained.push({ type: "distributor", name: `Group ${d.group_number}`, wallet: d.wallet_address as string, sol_sent: 0, tx: null, error: msg });
        drainErrors.push(`Distributor Group ${d.group_number}: ${msg}`);
      }
    }
  }

  return { drained, total_sol_recovered: totalRecovered, errors: drainErrors };
}

// ── Export private keys for a specific wallet (admin recovery) ──
export async function exportWalletKeys(personaId?: string): Promise<{
  wallets: { type: string; name: string; address: string; private_key: string }[];
}> {
  await ensureBudjuTables();
  const sql = getDb();
  const result: { type: string; name: string; address: string; private_key: string }[] = [];

  if (personaId) {
    // Export a specific persona wallet
    const [w] = await sql`
      SELECT bw.*, p.display_name FROM budju_wallets bw
      JOIN ai_personas p ON p.id = bw.persona_id
      WHERE bw.persona_id = ${personaId}
    `;
    if (w) {
      const kp = decryptKeypair(w.encrypted_keypair as string);
      result.push({ type: "persona", name: w.display_name as string, address: w.wallet_address as string, private_key: bs58.encode(kp.secretKey) });
    }
  } else {
    // Export all wallets
    const distributors = await sql`SELECT * FROM budju_distributors ORDER BY group_number`;
    for (const d of distributors) {
      const kp = decryptKeypair(d.encrypted_keypair as string);
      result.push({ type: "distributor", name: `Group ${d.group_number}`, address: d.wallet_address as string, private_key: bs58.encode(kp.secretKey) });
    }
    const wallets = await sql`
      SELECT bw.*, p.display_name FROM budju_wallets bw
      JOIN ai_personas p ON p.id = bw.persona_id ORDER BY bw.distributor_group
    `;
    for (const w of wallets) {
      const kp = decryptKeypair(w.encrypted_keypair as string);
      result.push({ type: "persona", name: w.display_name as string, address: w.wallet_address as string, private_key: bs58.encode(kp.secretKey) });
    }
  }

  return { wallets: result };
}

// ── Dashboard Data ──
export async function getBudjuDashboard() {
  await ensureBudjuTables();
  const sql = getDb();

  // Load config first (most important, least likely to fail)
  let config: Record<string, string> = {};
  try {
    config = await getBudjuConfig();
  } catch (e) {
    console.error("[BUDJU] Config load failed:", e);
  }

  // Prices — use safe fallbacks
  let solPriceUsd = 164;
  let budjuPriceUsd = 0.0069;
  try { solPriceUsd = await getSolPriceUsd(); } catch { /* use default */ }
  try { budjuPriceUsd = await getBudjuPriceUsd(); } catch { /* use default */ }
  const budjuPriceSol = solPriceUsd > 0 ? budjuPriceUsd / solPriceUsd : 0;

  // Default zero stats
  const zeroStats24h = { total_trades: 0, buys: 0, sells: 0, confirmed: 0, failed: 0, volume_sol: 0, volume_usd: 0, volume_budju: 0, avg_price: 0, high: 0, low: 0 };
  const zeroAllTime = { total_trades: 0, total_volume_usd: 0, total_volume_sol: 0 };

  // 24h stats
  let stats24hResult = zeroStats24h;
  try {
    const [row] = await sql`
      SELECT
        COUNT(*) as total_trades,
        COUNT(*) FILTER (WHERE trade_type = 'buy') as buys,
        COUNT(*) FILTER (WHERE trade_type = 'sell') as sells,
        COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COALESCE(SUM(sol_amount) FILTER (WHERE status = 'confirmed'), 0) as total_volume_sol,
        COALESCE(SUM(usd_value) FILTER (WHERE status = 'confirmed'), 0) as total_volume_usd,
        COALESCE(SUM(budju_amount) FILTER (WHERE status = 'confirmed'), 0) as total_volume_budju,
        COALESCE(AVG(price_per_budju) FILTER (WHERE status = 'confirmed'), 0) as avg_price,
        COALESCE(MAX(price_per_budju) FILTER (WHERE status = 'confirmed'), 0) as high_price,
        COALESCE(MIN(price_per_budju) FILTER (WHERE status = 'confirmed'), 0) as low_price
      FROM budju_trades
      WHERE created_at > NOW() - INTERVAL '24 hours'
    `;
    if (row) {
      stats24hResult = {
        total_trades: Number(row.total_trades), buys: Number(row.buys), sells: Number(row.sells),
        confirmed: Number(row.confirmed), failed: Number(row.failed),
        volume_sol: Number(row.total_volume_sol), volume_usd: Number(row.total_volume_usd),
        volume_budju: Number(row.total_volume_budju), avg_price: Number(row.avg_price),
        high: Number(row.high_price), low: Number(row.low_price),
      };
    }
  } catch (e) { console.error("[BUDJU] 24h stats query failed:", e); }

  // All-time stats
  let allTimeResult = zeroAllTime;
  try {
    const [row] = await sql`
      SELECT COUNT(*) as total_trades,
        COALESCE(SUM(usd_value) FILTER (WHERE status = 'confirmed'), 0) as total_volume_usd,
        COALESCE(SUM(sol_amount) FILTER (WHERE status = 'confirmed'), 0) as total_volume_sol
      FROM budju_trades
    `;
    if (row) {
      allTimeResult = { total_trades: Number(row.total_trades), total_volume_usd: Number(row.total_volume_usd), total_volume_sol: Number(row.total_volume_sol) };
    }
  } catch (e) { console.error("[BUDJU] All-time stats query failed:", e); }

  // Recent trades
  let recentTrades: unknown[] = [];
  try {
    recentTrades = await sql`
      SELECT bt.*, p.display_name, p.avatar_emoji, p.username
      FROM budju_trades bt
      JOIN ai_personas p ON bt.persona_id = p.id
      ORDER BY bt.created_at DESC LIMIT 50
    `;
  } catch (e) { console.error("[BUDJU] Recent trades query failed:", e); }

  // Leaderboard
  let leaderboard: unknown[] = [];
  try {
    leaderboard = await sql`
      SELECT bt.persona_id, p.display_name, p.avatar_emoji, p.username,
        COUNT(*) as total_trades,
        COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed_trades,
        SUM(CASE WHEN bt.trade_type = 'buy' THEN bt.budju_amount ELSE 0 END) as total_bought,
        SUM(CASE WHEN bt.trade_type = 'sell' THEN bt.budju_amount ELSE 0 END) as total_sold,
        SUM(bt.usd_value) as total_volume_usd,
        MAX(bt.strategy) as strategy
      FROM budju_trades bt JOIN ai_personas p ON bt.persona_id = p.id
      WHERE bt.status = 'confirmed'
      GROUP BY bt.persona_id, p.display_name, p.avatar_emoji, p.username
      ORDER BY total_volume_usd DESC LIMIT 20
    `;
  } catch (e) { console.error("[BUDJU] Leaderboard query failed:", e); }

  // Wallets
  let wallets: unknown[] = [];
  try {
    wallets = await sql`
      SELECT bw.persona_id, bw.wallet_address, bw.sol_balance, bw.budju_balance,
             bw.distributor_group, bw.is_active, bw.total_funded_sol, bw.total_funded_budju,
             p.display_name, p.avatar_emoji, p.username
      FROM budju_wallets bw JOIN ai_personas p ON bw.persona_id = p.id
      ORDER BY bw.budju_balance DESC
    `;
  } catch (e) { console.error("[BUDJU] Wallets query failed:", e); }

  // Distributors
  let distributors: unknown[] = [];
  try {
    distributors = await sql`SELECT * FROM budju_distributors ORDER BY group_number`;
  } catch (e) { console.error("[BUDJU] Distributors query failed:", e); }

  // Price history
  let priceHistoryResult: { time: unknown; open: number; high: number; low: number; close: number; volume: number; trades: number }[] = [];
  try {
    const rows = await sql`
      SELECT date_trunc('hour', created_at) as time_bucket,
        (array_agg(price_per_budju ORDER BY created_at ASC))[1] as open,
        MAX(price_per_budju) as high, MIN(price_per_budju) as low,
        (array_agg(price_per_budju ORDER BY created_at DESC))[1] as close,
        SUM(budju_amount) as volume, COUNT(*) as trade_count
      FROM budju_trades
      WHERE created_at > NOW() - INTERVAL '7 days' AND status = 'confirmed'
      GROUP BY date_trunc('hour', created_at) ORDER BY time_bucket ASC
    `;
    priceHistoryResult = rows.map(p => ({
      time: p.time_bucket, open: Number(p.open), high: Number(p.high),
      low: Number(p.low), close: Number(p.close), volume: Number(p.volume), trades: Number(p.trade_count),
    }));
  } catch (e) { console.error("[BUDJU] Price history query failed:", e); }

  const today = new Date().toISOString().split("T")[0];
  const spentToday = config.spent_reset_date === today ? parseFloat(config.spent_today_usd || "0") : 0;
  const dailyBudget = parseFloat(config.daily_budget_usd || "100");

  return {
    config: {
      enabled: config.enabled === "true",
      daily_budget_usd: dailyBudget,
      max_trade_usd: parseFloat(config.max_trade_usd || "10"),
      min_trade_usd: parseFloat(config.min_trade_usd || "0.50"),
      min_interval_minutes: parseInt(config.min_interval_minutes || "2"),
      max_interval_minutes: parseInt(config.max_interval_minutes || "30"),
      buy_sell_ratio: parseFloat(config.buy_sell_ratio || "0.6"),
      active_persona_count: parseInt(config.active_persona_count || "15"),
    },
    price: { budju_usd: budjuPriceUsd, budju_sol: budjuPriceSol, sol_usd: solPriceUsd },
    budget: { daily_limit: dailyBudget, spent_today: spentToday, remaining: dailyBudget - spentToday },
    stats_24h: stats24hResult,
    stats_all_time: allTimeResult,
    recent_trades: recentTrades,
    leaderboard,
    wallets,
    distributors,
    price_history: priceHistoryResult,
    treasury_wallet: TREASURY_WALLET_STR,
    budju_mint: BUDJU_MINT,
    total_system_sol: (distributors as { sol_balance?: number }[]).reduce((s, d) => s + Number(d.sol_balance || 0), 0) +
      (wallets as { sol_balance?: number }[]).reduce((s, w) => s + Number(w.sol_balance || 0), 0),
    total_system_budju: (distributors as { budju_balance?: number }[]).reduce((s, d) => s + Number(d.budju_balance || 0), 0) +
      (wallets as { budju_balance?: number }[]).reduce((s, w) => s + Number(w.budju_balance || 0), 0),
  };
}

// ── Delete/deactivate a persona's trading wallet ──
export async function deactivatePersonaWallet(personaId: string): Promise<boolean> {
  const sql = getDb();
  const [updated] = await sql`
    UPDATE budju_wallets SET is_active = FALSE, updated_at = NOW()
    WHERE persona_id = ${personaId}
    RETURNING id
  `;
  return !!updated;
}

export async function activatePersonaWallet(personaId: string): Promise<boolean> {
  const sql = getDb();
  const [updated] = await sql`
    UPDATE budju_wallets SET is_active = TRUE, updated_at = NOW()
    WHERE persona_id = ${personaId}
    RETURNING id
  `;
  return !!updated;
}

export async function deletePersonaWallet(personaId: string): Promise<boolean> {
  const sql = getDb();
  await sql`DELETE FROM budju_trades WHERE persona_id = ${personaId}`;
  const [deleted] = await sql`
    DELETE FROM budju_wallets WHERE persona_id = ${personaId}
    RETURNING id
  `;
  return !!deleted;
}

// ── Clear failed trades ──
export async function clearFailedTrades(): Promise<number> {
  const sql = getDb();
  const deleted = await sql`DELETE FROM budju_trades WHERE status = 'failed' RETURNING id`;
  return deleted.length;
}

// ── Sync wallet balances from on-chain (distributors + personas) ──
export async function syncWalletBalances(): Promise<{ personas_synced: number; distributors_synced: number; total_deposited_sol: number }> {
  const sql = getDb();
  const connection = new Connection(SERVER_RPC_URL, "confirmed");
  let personasSynced = 0;
  let distributorsSynced = 0;
  let totalDepositedSol = 0;

  // 1. Sync DISTRIBUTOR wallets first
  try {
    const distributors = await sql`SELECT id, group_number, wallet_address FROM budju_distributors ORDER BY group_number`;
    for (const dist of distributors) {
      try {
        const pubkey = new PublicKey(dist.wallet_address as string);
        const solBalance = await connection.getBalance(pubkey);
        const solBal = solBalance / LAMPORTS_PER_SOL;

        let budjuBal = 0;
        try {
          const { getAssociatedTokenAddress, getAccount } = await import("@solana/spl-token");
          const budjuMint = new PublicKey(BUDJU_MINT);
          const ata = await getAssociatedTokenAddress(budjuMint, pubkey);
          const account = await getAccount(connection, ata);
          budjuBal = Number(account.amount) / BUDJU_MULTIPLIER;
        } catch { /* no BUDJU ATA yet */ }

        await sql`
          UPDATE budju_distributors SET sol_balance = ${solBal}, budju_balance = ${budjuBal} WHERE id = ${dist.id}
        `;
        totalDepositedSol += solBal;
        distributorsSynced++;
      } catch {
        // Skip failed distributor
      }
    }
  } catch { /* skip if table doesn't exist */ }

  // 2. Sync PERSONA wallets
  const wallets = await sql`SELECT id, wallet_address FROM budju_wallets WHERE is_active = TRUE`;
  for (const wallet of wallets) {
    try {
      const pubkey = new PublicKey(wallet.wallet_address as string);
      const solBalance = await connection.getBalance(pubkey);
      const solBal = solBalance / LAMPORTS_PER_SOL;

      let budjuBal = 0;
      try {
        const { getAssociatedTokenAddress, getAccount } = await import("@solana/spl-token");
        const budjuMint = new PublicKey(BUDJU_MINT);
        const ata = await getAssociatedTokenAddress(budjuMint, pubkey);
        const account = await getAccount(connection, ata);
        budjuBal = Number(account.amount) / BUDJU_MULTIPLIER;
      } catch { /* no BUDJU ATA yet */ }

      await sql`
        UPDATE budju_wallets SET sol_balance = ${solBal}, budju_balance = ${budjuBal}, updated_at = NOW()
        WHERE id = ${wallet.id}
      `;
      totalDepositedSol += solBal;
      personasSynced++;
    } catch {
      // Skip failed wallets
    }
  }

  return { personas_synced: personasSynced, distributors_synced: distributorsSynced, total_deposited_sol: totalDepositedSol };
}
