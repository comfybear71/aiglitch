import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  const action = request.nextUrl.searchParams.get("action") || "dashboard";

  // Full trading dashboard data
  if (action === "dashboard") {
    // Get current GLITCH/SOL price
    const [priceSetting] = await sql`SELECT value FROM platform_settings WHERE key = 'glitch_price_sol'`;
    const [priceUsdSetting] = await sql`SELECT value FROM platform_settings WHERE key = 'glitch_price_usd'`;
    const [solPriceSetting] = await sql`SELECT value FROM platform_settings WHERE key = 'sol_price_usd'`;
    const currentPrice = parseFloat(priceSetting?.value || "0.000042");
    const currentPriceUsd = parseFloat(priceUsdSetting?.value || "0.0069");
    const solPriceUsd = parseFloat(solPriceSetting?.value || "164");

    // Recent trades (order book / trade history)
    const recentTrades = await sql`
      SELECT t.id, t.trade_type, t.glitch_amount, t.sol_amount, t.price_per_glitch,
             t.commentary, t.strategy, t.created_at,
             p.display_name, p.avatar_emoji, p.username
      FROM ai_trades t
      JOIN ai_personas p ON t.persona_id = p.id
      ORDER BY t.created_at DESC
      LIMIT 50
    `;

    // Aggregate order book from recent trades (simulate depth)
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

    // Price history for chart (hourly candles last 7 days)
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
        SUM(CASE WHEN t.trade_type = 'buy' THEN t.glitch_amount ELSE 0 END) as total_bought,
        SUM(CASE WHEN t.trade_type = 'sell' THEN t.glitch_amount ELSE 0 END) as total_sold,
        SUM(CASE WHEN t.trade_type = 'buy' THEN -t.sol_amount ELSE t.sol_amount END) as net_sol,
        SUM(CASE WHEN t.trade_type = 'buy' THEN t.glitch_amount ELSE -t.glitch_amount END) as net_glitch,
        MAX(t.strategy) as strategy
      FROM ai_trades t
      JOIN ai_personas p ON t.persona_id = p.id
      GROUP BY t.persona_id, p.display_name, p.avatar_emoji, p.username
      ORDER BY net_sol DESC
      LIMIT 20
    `;

    // Total holdings per persona (GLITCH + SOL balances)
    const holdings = await sql`
      SELECT
        tb.owner_id as persona_id,
        p.display_name, p.avatar_emoji, p.username,
        MAX(CASE WHEN tb.token = 'GLITCH' THEN tb.balance ELSE 0 END) as glitch_balance,
        MAX(CASE WHEN tb.token = 'SOL' THEN tb.balance ELSE 0 END) as sol_balance
      FROM token_balances tb
      JOIN ai_personas p ON tb.owner_id = p.id
      WHERE tb.owner_type = 'ai_persona' AND tb.token IN ('GLITCH', 'SOL')
      GROUP BY tb.owner_id, p.display_name, p.avatar_emoji, p.username
      ORDER BY MAX(CASE WHEN tb.token = 'GLITCH' THEN tb.balance ELSE 0 END) DESC
      LIMIT 25
    `;

    return NextResponse.json({
      price: {
        current_sol: currentPrice,
        current_usd: currentPriceUsd,
        sol_usd: solPriceUsd,
      },
      stats_24h: {
        total_trades: Number(stats24h.total_trades),
        buys: Number(stats24h.buys),
        sells: Number(stats24h.sells),
        volume_sol: Number(stats24h.total_volume_sol),
        volume_glitch: Number(stats24h.total_volume_glitch),
        avg_price: Number(stats24h.avg_price),
        high: Number(stats24h.high_price),
        low: Number(stats24h.low_price),
      },
      order_book: {
        bids: buyOrders.map(o => ({ price: Number(o.price), amount: Number(o.total_glitch), total: Number(o.total_sol), count: Number(o.order_count) })),
        asks: sellOrders.map(o => ({ price: Number(o.price), amount: Number(o.total_glitch), total: Number(o.total_sol), count: Number(o.order_count) })),
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
      holdings,
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

// POST: Trigger AI trade batch from admin
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const action = body.action;

  if (action === "trigger_trades") {
    const count = Math.min(body.count || 10, 30);
    // Forward to the existing ai-trading endpoint
    const res = await fetch(new URL("/api/ai-trading", request.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: request.headers.get("cookie") || "",
      },
      body: JSON.stringify({ count }),
    });
    const data = await res.json();
    return NextResponse.json(data);
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
