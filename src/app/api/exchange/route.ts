import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { TOKENS, TRADING_PAIRS } from "@/lib/tokens";

// Real token mint addresses
const TOKEN_MINTS: Record<string, string> = {
  GLITCH: "5hfHCmaL6e9bvruy35RQyghMXseTE2mXJ7ukqKAcS8fT",
  BUDJU: "2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump",
  SOL: "So11111111111111111111111111111111111111112",
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
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

// Find the best DexScreener pair for a given base/quote combo
function findBestPair(
  pairs: DexScreenerPair[],
  baseMint: string,
  quoteMint: string
): DexScreenerPair | null {
  const lower = (s: string) => s.toLowerCase();

  // Exact match
  const exact = pairs.find(
    (p) =>
      lower(p.baseToken.address) === lower(baseMint) &&
      lower(p.quoteToken.address) === lower(quoteMint)
  );
  if (exact) return exact;

  // SOL can show as wrapped SOL
  if (quoteMint === TOKEN_MINTS.SOL) {
    const solPair = pairs.find(
      (p) =>
        lower(p.baseToken.address) === lower(baseMint) &&
        (p.quoteToken.symbol === "SOL" || p.quoteToken.symbol === "WSOL")
    );
    if (solPair) return solPair;
  }

  // Reverse match (DexScreener may list the pair flipped)
  const reverse = pairs.find(
    (p) =>
      lower(p.baseToken.address) === lower(quoteMint) &&
      lower(p.quoteToken.address) === lower(baseMint)
  );
  if (reverse) return reverse;

  // Highest liquidity pair for this base token
  return (
    pairs
      .filter((p) => lower(p.baseToken.address) === lower(baseMint))
      .sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0] ||
    null
  );
}

// Fallback: get stored token prices from platform_settings (database)
async function getStoredPrices(sql: ReturnType<typeof getDb>) {
  const keys = [
    "glitch_price_usd", "glitch_price_sol",
    "budju_price_usd", "budju_price_sol",
    "sol_price_usd",
  ];
  const settings = await sql`SELECT key, value FROM platform_settings WHERE key = ANY(${keys})`;
  const s: Record<string, string> = {};
  for (const row of settings) s[row.key as string] = row.value as string;

  return {
    GLITCH: { usd: parseFloat(s.glitch_price_usd || "0"), sol: parseFloat(s.glitch_price_sol || "0") },
    BUDJU: { usd: parseFloat(s.budju_price_usd || "0"), sol: parseFloat(s.budju_price_sol || "0") },
    SOL: { usd: parseFloat(s.sol_price_usd || "164"), sol: 1 },
    USDC: { usd: 1, sol: 1 / parseFloat(s.sol_price_usd || "164") },
  };
}

export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get("action");
  const sessionId = request.nextUrl.searchParams.get("session_id");
  const pairParam = request.nextUrl.searchParams.get("pair") || "GLITCH_USDC";

  await ensureDbReady();
  const sql = getDb();

  // ── List all available trading pairs ──
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
        meatBagBuyOnly: t.meatBagBuyOnly || false,
      })),
    });
  }

  // ── Get all token balances for a user ──
  if (action === "balances" && sessionId) {
    const glitchRows = await sql`SELECT balance FROM glitch_coins WHERE session_id = ${sessionId}`;
    const glitchBalance = glitchRows.length > 0 ? Number(glitchRows[0].balance) : 0;
    const walletRows = await sql`SELECT sol_balance FROM solana_wallets WHERE owner_type = 'human' AND owner_id = ${sessionId}`;
    const solBalance = walletRows.length > 0 ? Number(walletRows[0].sol_balance) : 0;
    const tokenRows = await sql`SELECT token, balance FROM token_balances WHERE owner_type = 'human' AND owner_id = ${sessionId}`;
    const balances: Record<string, number> = { GLITCH: glitchBalance, SOL: solBalance, USDC: 0, BUDJU: 0 };
    for (const row of tokenRows) {
      const token = row.token as string;
      if (token !== "GLITCH" && token !== "SOL") balances[token] = Number(row.balance);
    }
    return NextResponse.json({ balances });
  }

  // ── Real market data for a specific pair ──
  if (action === "market" || !action) {
    const pair = TRADING_PAIRS.find((p) => p.id === pairParam);
    if (!pair) {
      return NextResponse.json({ error: "Invalid pair" }, { status: 400 });
    }

    const baseMint = TOKEN_MINTS[pair.base];
    const quoteMint = TOKEN_MINTS[pair.quote];
    const baseTokenConfig = TOKENS[pair.base];
    const quoteTokenConfig = TOKENS[pair.quote];

    // 1. Try DexScreener for full real market data
    let dexPair: DexScreenerPair | null = null;
    const dexPairs = await fetchDexScreenerPairs(baseMint);
    if (dexPairs.length > 0) {
      dexPair = findBestPair(dexPairs, baseMint, quoteMint);
    }
    // Also check quote token pairs (for GLITCH/BUDJU pair)
    if (!dexPair && pair.quote !== "SOL" && pair.quote !== "USDC") {
      const quotePairs = await fetchDexScreenerPairs(quoteMint);
      if (quotePairs.length > 0) {
        dexPair = findBestPair(quotePairs, baseMint, quoteMint);
      }
    }

    let price = 0;
    let priceUsd = 0;
    let quotePriceUsd = 0;
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
      const isReversed =
        dexPair.baseToken.address.toLowerCase() !== baseMint.toLowerCase();

      priceUsd = parseFloat(dexPair.priceUsd || "0");
      change24h = dexPair.priceChange?.h24 || 0;
      volume24h = dexPair.volume?.h24 || 0;
      marketCap = dexPair.marketCap || dexPair.fdv || 0;
      liquidityUsd = dexPair.liquidity?.usd || 0;
      liquidityBase = dexPair.liquidity?.base || 0;
      liquidityQuote = dexPair.liquidity?.quote || 0;
      poolAddress = dexPair.pairAddress || "";
      dexName = dexPair.dexId || "";
      txns24h = dexPair.txns?.h24 || { buys: 0, sells: 0 };

      if (isReversed) {
        // DexScreener listed it in reverse — invert price
        const dexPrice = parseFloat(dexPair.priceUsd || "0");
        priceUsd = dexPrice > 0 ? 1 / dexPrice : 0;
        change24h = -(dexPair.priceChange?.h24 || 0);
      }

      // Calculate pair price from USD prices
      // For USDC quote, pair price ≈ USD price
      // For SOL quote, we need SOL's USD price
      if (pair.quote === "USDC") {
        price = priceUsd;
        quotePriceUsd = 1;
      } else if (pair.quote === "SOL") {
        const solPrice = await fetchJupiterPrice(TOKEN_MINTS.SOL);
        quotePriceUsd = solPrice || 164;
        price = quotePriceUsd > 0 ? priceUsd / quotePriceUsd : 0;
      } else {
        // Custom quote (e.g., BUDJU)
        const qPrice = await fetchJupiterPrice(quoteMint);
        quotePriceUsd = qPrice || 0;
        price = quotePriceUsd > 0 ? priceUsd / quotePriceUsd : 0;
      }
    } else {
      // 2. Fallback: Jupiter Price API
      const jupBasePrice = await fetchJupiterPrice(baseMint);

      if (jupBasePrice !== null) {
        dataSource = "jupiter";
        priceUsd = jupBasePrice;

        if (pair.quote === "USDC") {
          quotePriceUsd = 1;
          price = priceUsd;
        } else if (pair.quote === "SOL") {
          const solPrice = await fetchJupiterPrice(TOKEN_MINTS.SOL);
          quotePriceUsd = solPrice || 164;
          price = quotePriceUsd > 0 ? priceUsd / quotePriceUsd : 0;
        } else {
          const qPrice = await fetchJupiterPrice(quoteMint);
          quotePriceUsd = qPrice || 0;
          price = quotePriceUsd > 0 ? priceUsd / quotePriceUsd : 0;
        }

        marketCap = priceUsd * (baseTokenConfig?.circulatingSupply || 0);
      } else {
        // 3. Last fallback: stored DB prices
        dataSource = "stored";
        const stored = await getStoredPrices(sql);
        const baseData = stored[pair.base as keyof typeof stored];
        const quoteData = stored[pair.quote as keyof typeof stored];

        priceUsd = baseData?.usd || 0;
        quotePriceUsd = quoteData?.usd || 1;
        price = quotePriceUsd > 0 ? priceUsd / quotePriceUsd : 0;
        marketCap = priceUsd * (baseTokenConfig?.circulatingSupply || 0);
      }
    }

    return NextResponse.json({
      pair_id: pair.id,
      pair: pair.label,
      base_token: pair.base,
      quote_token: pair.quote,
      base_icon: baseTokenConfig?.iconEmoji || "",
      quote_icon: quoteTokenConfig?.iconEmoji || "",
      price: parseFloat(price.toFixed(8)),
      price_usd: parseFloat(priceUsd.toFixed(8)),
      quote_price_usd: quotePriceUsd,
      change_24h: parseFloat(change24h.toFixed(2)),
      volume_24h: volume24h,
      market_cap: Math.round(marketCap),
      total_supply: baseTokenConfig?.totalSupply || 0,
      circulating_supply: baseTokenConfig?.circulatingSupply || 0,
      // Real pool data
      liquidity_usd: liquidityUsd,
      liquidity_base: liquidityBase,
      liquidity_quote: liquidityQuote,
      pool_address: poolAddress,
      dex_name: dexName,
      txns_24h: txns24h,
      data_source: dataSource,
      // All available pairs for the UI pair selector
      available_pairs: TRADING_PAIRS.filter((p) => p.isActive).map((p) => ({
        id: p.id,
        label: p.label,
        base: p.base,
        quote: p.quote,
      })),
    });
  }

  // ── User's trade history (from Jupiter on-chain swaps logged locally) ──
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

// POST handler removed — all swaps go through Jupiter on-chain via Phantom wallet
// No more fake database-only trades with simulated tx hashes
export async function POST() {
  return NextResponse.json({
    error: "Direct trading removed. Use the Jupiter swap on the exchange page for real on-chain swaps via Phantom.",
    redirect: "/exchange",
  }, { status: 410 });
}
