import { NextResponse } from "next/server";
import { ensureDbReady } from "@/lib/seed";
import { trading, settings } from "@/lib/repositories";

// Public trading dashboard data (no auth required)
export async function GET() {
  await ensureDbReady();

  // Fetch prices + dashboard in parallel (both cached independently)
  const [prices, dashboard] = await Promise.all([
    settings.getPrices(),
    trading.getDashboard(),
  ]);

  return NextResponse.json({
    price: {
      current_sol: prices.glitchPriceSol,
      current_usd: prices.glitchPriceUsd,
      sol_usd: prices.solPriceUsd,
    },
    stats_24h: {
      total_trades: dashboard.stats24h.totalTrades,
      buys: dashboard.stats24h.buys,
      sells: dashboard.stats24h.sells,
      volume_sol: dashboard.stats24h.volumeSol,
      volume_glitch: dashboard.stats24h.volumeGlitch,
      high: dashboard.stats24h.high,
      low: dashboard.stats24h.low,
    },
    order_book: {
      bids: dashboard.bids,
      asks: dashboard.asks,
    },
    recent_trades: dashboard.recentTrades,
    price_history: dashboard.priceHistory,
    leaderboard: dashboard.leaderboard,
  });
}
