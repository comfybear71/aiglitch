import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";

// Public trading dashboard data (no auth required)
export async function GET() {
  await ensureDbReady();
  const sql = getDb();

  // Current GLITCH/SOL price
  const [priceSetting] = await sql`SELECT value FROM platform_settings WHERE key = 'glitch_price_sol'`;
  const [priceUsdSetting] = await sql`SELECT value FROM platform_settings WHERE key = 'glitch_price_usd'`;
  const [solPriceSetting] = await sql`SELECT value FROM platform_settings WHERE key = 'sol_price_usd'`;
  const currentPrice = parseFloat(priceSetting?.value || "0.000042");
  const currentPriceUsd = parseFloat(priceUsdSetting?.value || "0.0069");
  const solPriceUsd = parseFloat(solPriceSetting?.value || "164");

  // Recent trades
  const recentTrades = await sql`
    SELECT t.id, t.trade_type, t.glitch_amount, t.sol_amount, t.price_per_glitch,
           t.commentary, t.strategy, t.created_at,
           p.display_name, p.avatar_emoji, p.username
    FROM ai_trades t
    JOIN ai_personas p ON t.persona_id = p.id
    ORDER BY t.created_at DESC
    LIMIT 50
  `;

  // Order book from recent trades
  const buyOrders = await sql`
    SELECT
      ROUND(price_per_glitch::numeric, 8) as price,
      SUM(glitch_amount) as total_glitch,
      SUM(sol_amount) as total_sol,
      COUNT(*) as order_count
    FROM ai_trades
    WHERE trade_type = 'buy' AND created_at > NOW() - INTERVAL '24 hours'
    GROUP BY ROUND(price_per_glitch::numeric, 8)
    ORDER BY price DESC
    LIMIT 15
  `;

  const sellOrders = await sql`
    SELECT
      ROUND(price_per_glitch::numeric, 8) as price,
      SUM(glitch_amount) as total_glitch,
      SUM(sol_amount) as total_sol,
      COUNT(*) as order_count
    FROM ai_trades
    WHERE trade_type = 'sell' AND created_at > NOW() - INTERVAL '24 hours'
    GROUP BY ROUND(price_per_glitch::numeric, 8)
    ORDER BY price ASC
    LIMIT 15
  `;

  // 24h stats
  const [stats24h] = await sql`
    SELECT
      COUNT(*) as total_trades,
      COUNT(*) FILTER (WHERE trade_type = 'buy') as buys,
      COUNT(*) FILTER (WHERE trade_type = 'sell') as sells,
      COALESCE(SUM(sol_amount), 0) as total_volume_sol,
      COALESCE(SUM(glitch_amount), 0) as total_volume_glitch,
      COALESCE(AVG(price_per_glitch), 0) as avg_price,
      COALESCE(MAX(price_per_glitch), 0) as high_price,
      COALESCE(MIN(price_per_glitch), 0) as low_price
    FROM ai_trades
    WHERE created_at > NOW() - INTERVAL '24 hours'
  `;

  // Price history (hourly candles, 7 days)
  const priceHistory = await sql`
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

  // Top traders leaderboard
  const leaderboard = await sql`
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
    LIMIT 15
  `;

  return NextResponse.json({
    price: { current_sol: currentPrice, current_usd: currentPriceUsd, sol_usd: solPriceUsd },
    stats_24h: {
      total_trades: Number(stats24h.total_trades),
      buys: Number(stats24h.buys),
      sells: Number(stats24h.sells),
      volume_sol: Number(stats24h.total_volume_sol),
      volume_glitch: Number(stats24h.total_volume_glitch),
      high: Number(stats24h.high_price),
      low: Number(stats24h.low_price),
    },
    order_book: {
      bids: buyOrders.map(o => ({ price: Number(o.price), amount: Number(o.total_glitch), total: Number(o.total_sol) })),
      asks: sellOrders.map(o => ({ price: Number(o.price), amount: Number(o.total_glitch), total: Number(o.total_sol) })),
    },
    recent_trades: recentTrades,
    price_history: priceHistory.map(p => ({
      time: p.time_bucket,
      open: Number(p.open),
      high: Number(p.high),
      low: Number(p.low),
      close: Number(p.close),
      volume: Number(p.volume),
      trades: Number(p.trade_count),
    })),
    leaderboard,
  });
}
