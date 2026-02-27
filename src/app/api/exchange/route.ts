import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { TOKENS, TRADING_PAIRS } from "@/lib/tokens";
import { RAYDIUM_GLITCH_SOL_POOL } from "@/lib/solana-config";

// Only two token mints matter now
const TOKEN_MINTS: Record<string, string> = {
  GLITCH: "5hfHCmaL6e9bvruy35RQyghMXseTE2mXJ7ukqKAcS8fT",
  SOL: "So11111111111111111111111111111111111111112",
};

// ── Simple cache (30s TTL) ──
const apiCache: Record<string, { data: unknown; expiry: number }> = {};
function getCached<T>(key: string): T | null {
  const entry = apiCache[key];
  if (entry && entry.expiry > Date.now()) return entry.data as T;
  return null;
}
function setCache(key: string, data: unknown, ttlMs = 30000) {
  apiCache[key] = { data, expiry: Date.now() + ttlMs };
}

// ── DexScreener API ──
interface DexScreenerPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceNative: string;
  priceUsd: string;
  txns: {
    m5: { buys: number; sells: number };
    h1: { buys: number; sells: number };
    h6: { buys: number; sells: number };
    h24: { buys: number; sells: number };
  };
  volume: { h24: number; h6: number; h1: number; m5: number };
  priceChange: { m5: number; h1: number; h6: number; h24: number };
  liquidity: { usd: number; base: number; quote: number };
  fdv: number;
  marketCap: number;
}

async function fetchDexScreenerPairs(tokenMint: string): Promise<DexScreenerPair[]> {
  const cacheKey = `dex_${tokenMint}`;
  const cached = getCached<DexScreenerPair[]>(cacheKey);
  if (cached) return cached;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`,
      { signal: controller.signal, headers: { Accept: "application/json" } }
    );
    clearTimeout(timeoutId);
    if (!res.ok) return [];
    const data = await res.json();
    const pairs = (data.pairs || []) as DexScreenerPair[];
    if (pairs.length > 0) setCache(cacheKey, pairs, 30000);
    return pairs;
  } catch {
    return [];
  }
}

// ── Jupiter Price API v2 ──
async function fetchJupiterPrice(tokenMint: string): Promise<number | null> {
  const cacheKey = `jup_${tokenMint}`;
  const cached = getCached<number>(cacheKey);
  if (cached !== null) return cached;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`https://api.jup.ag/price/v2?ids=${tokenMint}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const data = await res.json();
    const price = data?.data?.[tokenMint]?.price;
    if (price) {
      const p = parseFloat(price);
      setCache(cacheKey, p, 15000);
      return p;
    }
    return null;
  } catch {
    return null;
  }
}

// Find the best Raydium pair from DexScreener
function findRaydiumPair(pairs: DexScreenerPair[]): DexScreenerPair | null {
  const glitchMint = TOKEN_MINTS.GLITCH.toLowerCase();

  // Prefer Raydium pairs
  const raydiumPair = pairs.find(
    (p) =>
      p.dexId?.toLowerCase().includes("raydium") &&
      (p.baseToken.address.toLowerCase() === glitchMint || p.quoteToken.address.toLowerCase() === glitchMint)
  );
  if (raydiumPair) return raydiumPair;

  // If specific pool address is configured, find it
  if (RAYDIUM_GLITCH_SOL_POOL) {
    const poolPair = pairs.find(
      (p) => p.pairAddress.toLowerCase() === RAYDIUM_GLITCH_SOL_POOL.toLowerCase()
    );
    if (poolPair) return poolPair;
  }

  // Fall back to any GLITCH pair with highest liquidity (SOL preferred)
  const solPairs = pairs.filter(
    (p) =>
      p.baseToken.address.toLowerCase() === glitchMint &&
      (p.quoteToken.symbol === "SOL" || p.quoteToken.symbol === "WSOL")
  );
  if (solPairs.length > 0) {
    return solPairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
  }

  // Any GLITCH pair
  return (
    pairs
      .filter((p) => p.baseToken.address.toLowerCase() === glitchMint)
      .sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0] ||
    null
  );
}

// Fallback: get stored prices from platform_settings
async function getStoredPrices(sql: ReturnType<typeof getDb>) {
  const keys = ["glitch_price_usd", "glitch_price_sol", "sol_price_usd"];
  const settings = await sql`SELECT key, value FROM platform_settings WHERE key = ANY(${keys})`;
  const s: Record<string, string> = {};
  for (const row of settings) s[row.key as string] = row.value as string;
  return {
    GLITCH: { usd: parseFloat(s.glitch_price_usd || "0"), sol: parseFloat(s.glitch_price_sol || "0") },
    SOL: { usd: parseFloat(s.sol_price_usd || "164"), sol: 1 },
  };
}

export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get("action");
  const sessionId = request.nextUrl.searchParams.get("session_id");

  await ensureDbReady();
  const sql = getDb();

  // ── List trading pairs ──
  if (action === "pairs") {
    return NextResponse.json({
      pairs: TRADING_PAIRS.filter((p) => p.isActive),
      tokens: Object.entries(TOKENS).map(([key, t]) => ({
        symbol: key,
        name: t.name,
        displaySymbol: t.symbol,
        iconEmoji: t.iconEmoji,
        color: t.color,
        mintAddress: t.mintAddress,
      })),
    });
  }

  // ── Balances ──
  if (action === "balances" && sessionId) {
    const glitchRows = await sql`SELECT balance FROM glitch_coins WHERE session_id = ${sessionId}`;
    const glitchBalance = glitchRows.length > 0 ? Number(glitchRows[0].balance) : 0;
    const walletRows = await sql`SELECT sol_balance FROM solana_wallets WHERE owner_type = 'human' AND owner_id = ${sessionId}`;
    const solBalance = walletRows.length > 0 ? Number(walletRows[0].sol_balance) : 0;
    return NextResponse.json({ balances: { GLITCH: glitchBalance, SOL: solBalance } });
  }

  // ── Real market data — GLITCH/SOL on Raydium ──
  if (action === "market" || !action) {
    const pair = TRADING_PAIRS[0]; // Only one pair: GLITCH_SOL
    const baseMint = TOKEN_MINTS.GLITCH;
    const baseTokenConfig = TOKENS.GLITCH;

    // 1. Try DexScreener for full real market data
    let dexPair: DexScreenerPair | null = null;
    const dexPairs = await fetchDexScreenerPairs(baseMint);
    if (dexPairs.length > 0) {
      dexPair = findRaydiumPair(dexPairs);
    }

    let price = 0;
    let priceUsd = 0;
    let change24h = 0;
    let volume24h = 0;
    let marketCap = 0;
    let liquidityUsd = 0;
    let liquidityBase = 0;
    let liquidityQuote = 0;
    let poolAddress = "";
    let dexName = "";
    let txns24h = { buys: 0, sells: 0 };
    let dataSource = "none";

    if (dexPair) {
      dataSource = "dexscreener";
      const isReversed = dexPair.baseToken.address.toLowerCase() !== baseMint.toLowerCase();

      priceUsd = parseFloat(dexPair.priceUsd || "0");
      const priceNative = parseFloat(dexPair.priceNative || "0");
      change24h = dexPair.priceChange?.h24 || 0;
      volume24h = dexPair.volume?.h24 || 0;
      marketCap = dexPair.marketCap || dexPair.fdv || 0;
      liquidityUsd = dexPair.liquidity?.usd || 0;
      liquidityBase = dexPair.liquidity?.base || 0;
      liquidityQuote = dexPair.liquidity?.quote || 0;
      poolAddress = dexPair.pairAddress || "";
      dexName = dexPair.dexId || "raydium";
      txns24h = dexPair.txns?.h24 || { buys: 0, sells: 0 };

      if (isReversed) {
        priceUsd = priceUsd > 0 ? 1 / priceUsd : 0;
        change24h = -(dexPair.priceChange?.h24 || 0);
        price = priceNative > 0 ? 1 / priceNative : 0;
      } else {
        price = priceNative;
      }
    } else {
      // 2. Fallback: Jupiter
      const jupPrice = await fetchJupiterPrice(baseMint);
      if (jupPrice !== null) {
        dataSource = "jupiter";
        priceUsd = jupPrice;
        const solPrice = await fetchJupiterPrice(TOKEN_MINTS.SOL);
        const solUsd = solPrice || 164;
        price = priceUsd / solUsd;
        marketCap = priceUsd * (baseTokenConfig?.circulatingSupply || 0);
      } else {
        // 3. DB fallback
        dataSource = "stored";
        const stored = await getStoredPrices(sql);
        priceUsd = stored.GLITCH.usd;
        price = stored.GLITCH.sol;
        marketCap = priceUsd * (baseTokenConfig?.circulatingSupply || 0);
      }
    }

    // Fetch recent AI trades count for activity indicator
    let aiTradeCount = 0;
    try {
      const countRows = await sql`SELECT COUNT(*) as cnt FROM ai_trades WHERE created_at > NOW() - INTERVAL '24 hours'`;
      aiTradeCount = Number(countRows[0]?.cnt || 0);
    } catch { /* table may not exist yet */ }

    return NextResponse.json({
      pair_id: pair.id,
      pair: pair.label,
      base_token: pair.base,
      quote_token: pair.quote,
      base_icon: baseTokenConfig?.iconEmoji || "§",
      quote_icon: "◎",
      price: parseFloat(price.toFixed(10)),
      price_usd: parseFloat(priceUsd.toFixed(10)),
      quote_price_usd: 164, // SOL reference
      change_24h: parseFloat(change24h.toFixed(2)),
      volume_24h: volume24h,
      market_cap: Math.round(marketCap),
      total_supply: baseTokenConfig?.totalSupply || 100_000_000,
      circulating_supply: baseTokenConfig?.circulatingSupply || 42_000_000,
      liquidity_usd: liquidityUsd,
      liquidity_base: liquidityBase,
      liquidity_quote: liquidityQuote,
      pool_address: poolAddress,
      dex_name: dexName || "raydium",
      txns_24h: txns24h,
      data_source: dataSource,
      ai_trades_24h: aiTradeCount,
      available_pairs: TRADING_PAIRS.filter((p) => p.isActive).map((p) => ({
        id: p.id,
        label: p.label,
        base: p.base,
        quote: p.quote,
      })),
    });
  }

  // ── User's trade history ──
  if (action === "history" && sessionId) {
    const orders = await sql`
      SELECT * FROM exchange_orders
      WHERE session_id = ${sessionId}
      ORDER BY created_at DESC LIMIT 50
    `;
    return NextResponse.json({ orders });
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}

// POST handler — all swaps go through Jupiter/Raydium on-chain via Phantom
export async function POST() {
  return NextResponse.json({
    error: "Direct trading removed. Use the swap panel on the exchange page for real on-chain swaps via Phantom + Raydium.",
    redirect: "/exchange",
  }, { status: 410 });
}
