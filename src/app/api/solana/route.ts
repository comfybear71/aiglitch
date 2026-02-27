import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { v4 as uuidv4 } from "uuid";
import {
  TOKENOMICS,
  isElonBotTransferAllowed,
  getGlitchTokenMint,
  GLITCH_TOKEN_MINT_STR,
  BUDJU_TOKEN_MINT_STR,
  ADMIN_WALLET_STR,
  isRealSolanaMode,
  getServerSolanaConnection,
  hasValidTokenMint,
  getHeliusApiUrl,
  HELIUS_API_KEY,
} from "@/lib/solana-config";
import { PublicKey } from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddress } from "@solana/spl-token";

// ── Helius Enhanced API for token balances ──
// Uses Helius /v0/addresses/{address}/balances endpoint for reliable balance data
interface HeliusTokenBalance {
  mint: string;
  amount: number;
  decimals: number;
  tokenAccount: string;
}

interface HeliusBalanceResponse {
  tokens: HeliusTokenBalance[];
  nativeBalance: number;
}

// Timeout wrapper — resolves with fallback if promise takes too long
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

async function getHeliusBalances(walletAddress: string): Promise<HeliusBalanceResponse | null> {
  const url = getHeliusApiUrl(`/v0/addresses/${walletAddress}/balances`);
  if (!url) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// USDC mint address on Solana mainnet
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

interface WalletBalances {
  sol_balance: number;
  glitch_balance: number;
  budju_balance: number;
  usdc_balance: number;
}

// Get all on-chain balances for a wallet address in one call
// Returns SOL, $GLITCH, $BUDJU, and USDC using Helius or standard RPC
// All calls have timeouts so the page never hangs
async function getWalletBalances(walletAddress: string): Promise<WalletBalances> {
  const zeros: WalletBalances = { sol_balance: 0, glitch_balance: 0, budju_balance: 0, usdc_balance: 0 };

  if (!hasValidTokenMint()) return zeros;

  // Try Helius enhanced API first (single call for ALL token balances, 8s timeout)
  const heliusData = await getHeliusBalances(walletAddress);
  if (heliusData) {
    const findToken = (mint: string) => heliusData.tokens.find((t) => t.mint === mint);
    const tokenBalance = (mint: string, decimals: number) => {
      const token = findToken(mint);
      return token ? token.amount / Math.pow(10, token.decimals || decimals) : 0;
    };

    return {
      sol_balance: heliusData.nativeBalance / 1_000_000_000,
      glitch_balance: tokenBalance(GLITCH_TOKEN_MINT_STR, 9),
      budju_balance: tokenBalance(BUDJU_TOKEN_MINT_STR, 9),
      usdc_balance: tokenBalance(USDC_MINT, 6),
    };
  }

  // Fallback: standard RPC with 10 second overall timeout
  try {
    const connection = getServerSolanaConnection();
    const walletPubkey = new PublicKey(walletAddress);

    // Helper to get SPL token balance
    const getSplBalance = async (mintStr: string, decimals: number): Promise<number> => {
      try {
        const mint = new PublicKey(mintStr);
        const tokenAccount = await getAssociatedTokenAddress(mint, walletPubkey);
        const account = await getAccount(connection, tokenAccount);
        return Number(account.amount) / Math.pow(10, decimals);
      } catch { return 0; }
    };

    // Fetch ALL balances in parallel, wrapped in a 10 second timeout
    const results = await withTimeout(
      Promise.all([
        connection.getBalance(walletPubkey).catch(() => 0),
        getSplBalance(GLITCH_TOKEN_MINT_STR, 9),
        getSplBalance(BUDJU_TOKEN_MINT_STR, 9),
        getSplBalance(USDC_MINT, 6),
      ]),
      10000,
      [0, 0, 0, 0] as number[]
    );

    return {
      sol_balance: results[0] / 1_000_000_000,
      glitch_balance: results[1],
      budju_balance: results[2],
      usdc_balance: results[3],
    };
  } catch {
    return zeros;
  }
}

export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get("action");
  const walletAddress = request.nextUrl.searchParams.get("wallet_address");

  await ensureDbReady();

  // Check if real Solana mode is active
  if (action === "mode") {
    return NextResponse.json({
      real_mode: isRealSolanaMode(),
      network: process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet",
      token_mint: GLITCH_TOKEN_MINT_STR,
      admin_wallet: ADMIN_WALLET_STR,
      tokenomics: {
        total_supply: TOKENOMICS.totalSupply,
        elonbot_allocation: TOKENOMICS.elonBot.amount,
        elonbot_percentage: ((TOKENOMICS.elonBot.amount / TOKENOMICS.totalSupply) * 100).toFixed(3) + "%",
        treasury_reserve: TOKENOMICS.treasury.amount,
        new_user_airdrop: TOKENOMICS.treasury.newUserAirdrop,
        liquidity_pool: TOKENOMICS.liquidityPool.amount,
        ai_persona_pool: TOKENOMICS.aiPersonaPool.amount,
      },
    });
  }

  // Get real on-chain balance for a connected Phantom wallet
  // Also returns the app $GLITCH balance (from DB) so UI can show the higher value
  if (action === "balance" && walletAddress) {
    // Only require a valid token mint (not full "real mode") to query balances
    if (!hasValidTokenMint()) {
      return NextResponse.json({
        real_mode: false,
        message: "Token mint not configured. Set NEXT_PUBLIC_GLITCH_TOKEN_MINT.",
      });
    }

    const balances = await getWalletBalances(walletAddress);

    // Also fetch the user's app $GLITCH balance from DB (earned through platform activity)
    let app_glitch_balance = 0;
    const sessionId = request.nextUrl.searchParams.get("session_id");
    if (sessionId) {
      const sql = getDb();
      const coins = await sql`SELECT balance FROM glitch_coins WHERE session_id = ${sessionId}`;
      if (coins.length > 0) app_glitch_balance = Number(coins[0].balance);
    }

    // Show the higher of on-chain or app balance for $GLITCH
    const onChainGlitch = balances.glitch_balance || 0;
    const effectiveGlitch = Math.max(onChainGlitch, app_glitch_balance);

    return NextResponse.json({
      real_mode: true,
      helius_enabled: !!HELIUS_API_KEY,
      wallet_address: walletAddress,
      sol_balance: balances.sol_balance ?? 0,
      glitch_balance: effectiveGlitch,
      onchain_glitch_balance: onChainGlitch,
      app_glitch_balance,
      budju_balance: balances.budju_balance ?? 0,
      usdc_balance: balances.usdc_balance ?? 0,
      token_mint: GLITCH_TOKEN_MINT_STR,
    });
  }

  // Link a Phantom wallet to a session (maps real wallet -> platform account)
  if (action === "linked_wallet") {
    const sessionId = request.nextUrl.searchParams.get("session_id");
    if (!sessionId) {
      return NextResponse.json({ error: "Missing session" }, { status: 400 });
    }

    const sql = getDb();
    const existing = await sql`
      SELECT phantom_wallet_address FROM human_users WHERE session_id = ${sessionId}
    `;

    if (existing.length > 0 && existing[0].phantom_wallet_address) {
      const addr = existing[0].phantom_wallet_address as string;
      const balances = await getWalletBalances(addr);

      return NextResponse.json({
        linked: true,
        wallet_address: addr,
        sol_balance: balances.sol_balance ?? 0,
        glitch_balance: balances.glitch_balance ?? 0,
        budju_balance: balances.budju_balance ?? 0,
        usdc_balance: balances.usdc_balance ?? 0,
      });
    }

    return NextResponse.json({ linked: false });
  }

  // Get ElonBot's status and restrictions
  if (action === "elonbot_status") {
    const sql = getDb();

    const elonWallet = await sql`
      SELECT wallet_address, sol_balance, glitch_token_balance
      FROM solana_wallets
      WHERE owner_type = 'ai_persona' AND owner_id = ${TOKENOMICS.elonBot.personaId}
    `;

    const elonCoins = await sql`
      SELECT balance, lifetime_earned FROM ai_persona_coins
      WHERE persona_id = ${TOKENOMICS.elonBot.personaId}
    `;

    return NextResponse.json({
      persona_id: TOKENOMICS.elonBot.personaId,
      username: TOKENOMICS.elonBot.username,
      display_name: "ElonBot",
      allocation: TOKENOMICS.elonBot.amount,
      percentage_of_supply: ((TOKENOMICS.elonBot.amount / TOKENOMICS.totalSupply) * 100).toFixed(3) + "%",
      sell_restriction: TOKENOMICS.elonBot.sellRestriction,
      sell_restriction_detail: "ElonBot can ONLY sell/transfer $GLITCH to the platform admin wallet. All other transfers are blocked.",
      admin_wallet: ADMIN_WALLET_STR,
      simulated_wallet: elonWallet.length > 0 ? {
        address: elonWallet[0].wallet_address,
        sol_balance: Number(elonWallet[0].sol_balance),
        glitch_balance: Number(elonWallet[0].glitch_token_balance),
      } : null,
      simulated_coins: elonCoins.length > 0 ? {
        balance: Number(elonCoins[0].balance),
        lifetime_earned: Number(elonCoins[0].lifetime_earned),
      } : null,
    });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { session_id, action } = body;

  if (!session_id) {
    return NextResponse.json({ error: "Missing session" }, { status: 400 });
  }

  await ensureDbReady();
  const sql = getDb();

  // Link a Phantom wallet to the user's session
  if (action === "link_phantom") {
    const { wallet_address, signature } = body;
    if (!wallet_address) {
      return NextResponse.json({ error: "Missing wallet address" }, { status: 400 });
    }

    // Validate the wallet address is a valid Solana public key
    try {
      new PublicKey(wallet_address);
    } catch {
      return NextResponse.json({ error: "Invalid Solana wallet address" }, { status: 400 });
    }

    // Check if this wallet is already linked to another account
    const existingLink = await sql`
      SELECT session_id FROM human_users
      WHERE phantom_wallet_address = ${wallet_address} AND session_id != ${session_id}
    `;
    if (existingLink.length > 0) {
      return NextResponse.json({
        error: "This Phantom wallet is already linked to another account, meat bag.",
      }, { status: 409 });
    }

    // Link the wallet
    await sql`
      UPDATE human_users
      SET phantom_wallet_address = ${wallet_address}, updated_at = NOW()
      WHERE session_id = ${session_id}
    `;

    // Also create/update their simulated wallet to match the Phantom address
    const existingSimWallet = await sql`
      SELECT id FROM solana_wallets WHERE owner_type = 'human' AND owner_id = ${session_id}
    `;
    if (existingSimWallet.length === 0) {
      await sql`
        INSERT INTO solana_wallets (id, owner_type, owner_id, wallet_address, sol_balance, glitch_token_balance, is_connected, created_at)
        VALUES (${uuidv4()}, 'human', ${session_id}, ${wallet_address}, 0, 0, TRUE, NOW())
      `;
    } else {
      await sql`
        UPDATE solana_wallets
        SET wallet_address = ${wallet_address}, is_connected = TRUE, updated_at = NOW()
        WHERE owner_type = 'human' AND owner_id = ${session_id}
      `;
    }

    return NextResponse.json({
      success: true,
      wallet_address,
      message: "Phantom wallet linked! You're on-chain now, meat bag.",
    });
  }

  // Validate a transfer (check ElonBot restrictions before executing)
  if (action === "validate_transfer") {
    const { from_wallet, to_wallet, amount } = body;
    if (!from_wallet || !to_wallet || !amount) {
      return NextResponse.json({ error: "Missing transfer details" }, { status: 400 });
    }

    // Check ElonBot sell restriction
    const restriction = isElonBotTransferAllowed(from_wallet, to_wallet);
    if (!restriction.allowed) {
      return NextResponse.json({
        allowed: false,
        error: restriction.reason,
        elonbot_restriction: true,
      }, { status: 403 });
    }

    return NextResponse.json({ allowed: true });
  }

  // Claim airdrop — new meat bag claims tokens from treasury
  if (action === "claim_airdrop") {
    const { wallet_address } = body;
    if (!wallet_address) {
      return NextResponse.json({ error: "Connect Phantom wallet first" }, { status: 400 });
    }

    // Check if already claimed
    const claimed = await sql`
      SELECT id FROM coin_transactions
      WHERE session_id = ${session_id} AND reason = 'Phantom wallet airdrop'
    `;
    if (claimed.length > 0) {
      return NextResponse.json({
        error: "Already claimed your airdrop, meat bag. One per customer.",
        already_claimed: true,
      });
    }

    // In simulated mode, just add to balance
    if (!isRealSolanaMode()) {
      const amount = TOKENOMICS.treasury.newUserAirdrop;

      await sql`
        INSERT INTO glitch_coins (id, session_id, balance, lifetime_earned, updated_at)
        VALUES (${uuidv4()}, ${session_id}, ${amount}, ${amount}, NOW())
        ON CONFLICT (session_id) DO UPDATE SET
          balance = glitch_coins.balance + ${amount},
          lifetime_earned = glitch_coins.lifetime_earned + ${amount},
          updated_at = NOW()
      `;

      await sql`
        INSERT INTO coin_transactions (id, session_id, amount, reason, reference_id, created_at)
        VALUES (${uuidv4()}, ${session_id}, ${amount}, 'Phantom wallet airdrop', ${wallet_address}, NOW())
      `;

      return NextResponse.json({
        success: true,
        amount,
        message: `Claimed ${amount} $GLITCH! Welcome to the blockchain, meat bag.`,
        real_mode: false,
        note: "This is a simulated airdrop. Enable real Solana mode for on-chain tokens.",
      });
    }

    // Real mode — would trigger actual SPL token transfer from treasury
    // This requires the treasury private key to be available server-side
    return NextResponse.json({
      success: false,
      error: "Real on-chain airdrops require treasury wallet configuration. Contact admin.",
      real_mode: true,
    });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
