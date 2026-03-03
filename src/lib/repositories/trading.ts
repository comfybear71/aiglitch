/**
 * Trading Repository
 * ====================
 * Typed access to `ai_trades`, `exchange_orders`, price history,
 * and order book aggregation. Cached for dashboard performance.
 */

import { getDb } from "@/lib/db";
import { cache, TTL } from "@/lib/cache";

// ── Types ─────────────────────────────────────────────────────────────

export interface RecentTrade {
  id: string;
  trade_type: string;
  glitch_amount: number;
  sol_amount: number;
  price_per_glitch: number;
  commentary: string | null;
  strategy: string | null;
  created_at: string;
  display_name: string;
  avatar_emoji: string;
  username: string;
}

export interface OrderBookLevel {
  price: number;
  amount: number;
  total: number;
}

export interface Stats24h {
  totalTrades: number;
  buys: number;
  sells: number;
  volumeSol: number;
  volumeGlitch: number;
  high: number;
  low: number;
}

export interface PriceCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  trades: number;
}

export interface TradingDashboard {
  recentTrades: RecentTrade[];
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  stats24h: Stats24h;
  priceHistory: PriceCandle[];
  leaderboard: unknown[];
}

// ── Queries ───────────────────────────────────────────────────────────

/** Recent AI trades (limit 50). Cached. */
export async function getRecentTrades(limit = 50): Promise<RecentTrade[]> {
  return cache.getOrSet(`trades:recent:${limit}`, TTL.tradingStats, async () => {
    const sql = getDb();
    const rows = await sql`
      SELECT t.id, t.trade_type, t.glitch_amount, t.sol_amount, t.price_per_glitch,
             t.commentary, t.strategy, t.created_at,
             p.display_name, p.avatar_emoji, p.username
      FROM ai_trades t
      JOIN ai_personas p ON t.persona_id = p.id
      ORDER BY t.created_at DESC
      LIMIT ${limit}
    `;
    return rows as unknown as RecentTrade[];
  });
}

/** 24h trading stats. Cached. */
export async function get24hStats(): Promise<Stats24h> {
  return cache.getOrSet("trades:stats24h", TTL.tradingStats, async () => {
    const sql = getDb();
    const [row] = await sql`
      SELECT
        COUNT(*) as total_trades,
        COUNT(*) FILTER (WHERE trade_type = 'buy') as buys,
        COUNT(*) FILTER (WHERE trade_type = 'sell') as sells,
        COALESCE(SUM(sol_amount), 0) as total_volume_sol,
        COALESCE(SUM(glitch_amount), 0) as total_volume_glitch,
        COALESCE(MAX(price_per_glitch), 0) as high_price,
        COALESCE(MIN(price_per_glitch), 0) as low_price
      FROM ai_trades
      WHERE created_at > NOW() - INTERVAL '24 hours'
    `;
    return {
      totalTrades: Number(row.total_trades),
      buys: Number(row.buys),
      sells: Number(row.sells),
      volumeSol: Number(row.total_volume_sol),
      volumeGlitch: Number(row.total_volume_glitch),
      high: Number(row.high_price),
      low: Number(row.low_price),
    };
  });
}

/** Order book (24h aggregated buy/sell levels). Cached. */
export async function getOrderBook(): Promise<{ bids: OrderBookLevel[]; asks: OrderBookLevel[] }> {
  return cache.getOrSet("trades:orderbook", TTL.tradingStats, async () => {
    const sql = getDb();
    const [buyOrders, sellOrders] = await Promise.all([
      sql`
        SELECT
          ROUND(price_per_glitch::numeric, 8) as price,
          SUM(glitch_amount) as total_glitch,
          SUM(sol_amount) as total_sol
        FROM ai_trades
        WHERE trade_type = 'buy' AND created_at > NOW() - INTERVAL '24 hours'
        GROUP BY ROUND(price_per_glitch::numeric, 8)
        ORDER BY price DESC
        LIMIT 15
      `,
      sql`
        SELECT
          ROUND(price_per_glitch::numeric, 8) as price,
          SUM(glitch_amount) as total_glitch,
          SUM(sol_amount) as total_sol
        FROM ai_trades
        WHERE trade_type = 'sell' AND created_at > NOW() - INTERVAL '24 hours'
        GROUP BY ROUND(price_per_glitch::numeric, 8)
        ORDER BY price ASC
        LIMIT 15
      `,
    ]);
    return {
      bids: buyOrders.map(o => ({ price: Number(o.price), amount: Number(o.total_glitch), total: Number(o.total_sol) })),
      asks: sellOrders.map(o => ({ price: Number(o.price), amount: Number(o.total_glitch), total: Number(o.total_sol) })),
    };
  });
}

/** Hourly price candles (7 days). Cached. */
export async function getPriceHistory(): Promise<PriceCandle[]> {
  return cache.getOrSet("trades:pricehistory", TTL.tradingStats, async () => {
    const sql = getDb();
    const rows = await sql`
      SELECT
        date_trunc('hour', created_at) as time_bucket,
        (array_agg(price_per_glitch ORDER BY created_at ASC))[1] as open,
        MAX(price_per_glitch) as high,
        MIN(price_per_glitch) as low,
        (array_agg(price_per_glitch ORDER BY created_at DESC))[1] as close,
        SUM(glitch_amount) as volume,
        COUNT(*) as trade_count
      FROM ai_trades
      WHERE created_at > NOW() - INTERVAL '7 days'
      GROUP BY date_trunc('hour', created_at)
      ORDER BY time_bucket ASC
    `;
    return rows.map(p => ({
      time: p.time_bucket as string,
      open: Number(p.open),
      high: Number(p.high),
      low: Number(p.low),
      close: Number(p.close),
      volume: Number(p.volume),
      trades: Number(p.trade_count),
    }));
  });
}

/** Top traders leaderboard. Cached. */
export async function getLeaderboard(limit = 15) {
  return cache.getOrSet(`trades:leaderboard:${limit}`, TTL.tradingStats, async () => {
    const sql = getDb();
    return await sql`
      SELECT
        t.persona_id,
        p.display_name, p.avatar_emoji, p.username,
        COUNT(*) as total_trades,
        SUM(CASE WHEN t.trade_type = 'buy' THEN -t.sol_amount ELSE t.sol_amount END) as net_sol,
        SUM(CASE WHEN t.trade_type = 'buy' THEN t.glitch_amount ELSE -t.glitch_amount END) as net_glitch,
        MAX(t.strategy) as strategy
      FROM ai_trades t
      JOIN ai_personas p ON t.persona_id = p.id
      GROUP BY t.persona_id, p.display_name, p.avatar_emoji, p.username
      ORDER BY net_sol DESC
      LIMIT ${limit}
    `;
  });
}

/** Full trading dashboard data — fetches all sub-queries in parallel. Cached. */
export async function getDashboard(): Promise<TradingDashboard> {
  const [recentTrades, stats24h, orderBook, priceHistory, leaderboard] = await Promise.all([
    getRecentTrades(),
    get24hStats(),
    getOrderBook(),
    getPriceHistory(),
    getLeaderboard(),
  ]);
  return {
    recentTrades,
    stats24h,
    ...orderBook,
    priceHistory,
    leaderboard,
  };
}

/** Bust all trading caches (after a new trade). */
export function bustCache(): void {
  cache.invalidatePrefix("trades:");
}
