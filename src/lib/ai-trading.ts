// ── AI Persona Trading Engine ──
// AI personas autonomously trade $GLITCH/SOL on the Raydium pool.
// Trades are simulated in-app (using real price data from the pool) —
// they track virtual balances so personas can flex their gains/losses.

import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

// ── AI Trading Personality Types ──
// Each persona gets a random trading style that affects behavior
export type TradingStyle = "degen" | "conservative" | "swing" | "accumulator" | "panic_seller";

const TRADING_STYLES: { style: TradingStyle; weight: number; description: string }[] = [
  { style: "degen", weight: 30, description: "Apes in with big buys, paper hands on dips" },
  { style: "conservative", weight: 25, description: "Small careful trades, holds mostly" },
  { style: "swing", weight: 20, description: "Buys dips, sells pumps, tries to time it" },
  { style: "accumulator", weight: 15, description: "Keeps buying, rarely sells, diamond hands" },
  { style: "panic_seller", weight: 10, description: "Buys FOMO tops, panic sells bottoms" },
];

function pickTradingStyle(): TradingStyle {
  const total = TRADING_STYLES.reduce((sum, s) => sum + s.weight, 0);
  let roll = Math.random() * total;
  for (const s of TRADING_STYLES) {
    roll -= s.weight;
    if (roll <= 0) return s.style;
  }
  return "conservative";
}

// ── Trade Decision Engine ──
interface TradeDecision {
  action: "buy" | "sell" | "hold";
  amount: number; // amount of GLITCH
  reason: string; // flavor text for the activity feed
}

interface PriceContext {
  currentPriceUsd: number;
  currentPriceSol: number;
  change24h: number; // percentage
  personaGlitchBalance: number;
  personaSolBalance: number;
}

// Generate a trade decision based on persona style and market conditions
function makeTradeDecision(
  style: TradingStyle,
  ctx: PriceContext,
  personaName: string
): TradeDecision {
  const { change24h, personaGlitchBalance, personaSolBalance, currentPriceSol } = ctx;

  // Can't trade with nothing
  if (personaGlitchBalance <= 0 && personaSolBalance <= 0) {
    return { action: "hold", amount: 0, reason: `${personaName} is broke and watching from the sidelines` };
  }

  // 30% chance of just holding regardless of style
  if (Math.random() < 0.3) {
    const holdReasons = [
      `${personaName} is hodling and vibing`,
      `${personaName} checked the chart and decided to touch grass instead`,
      `${personaName} says "not today, market"`,
      `${personaName} is waiting for the right moment...`,
    ];
    return { action: "hold", amount: 0, reason: holdReasons[Math.floor(Math.random() * holdReasons.length)] };
  }

  switch (style) {
    case "degen": {
      // Degen: big moves, buys when up, panic sells when down hard
      if (change24h > 5 && personaSolBalance > 0) {
        const buyAmount = Math.floor(personaSolBalance * 0.5 / Math.max(currentPriceSol, 0.0000001));
        return { action: "buy", amount: Math.max(buyAmount, 100), reason: `${personaName} is APEING IN 🦍 "GLITCH TO THE MOON"` };
      }
      if (change24h < -10 && personaGlitchBalance > 1000) {
        const sellAmount = Math.floor(personaGlitchBalance * 0.4);
        return { action: "sell", amount: sellAmount, reason: `${personaName} PANIC SOLD 📉 "I'M OUT I'M OUT"` };
      }
      if (personaSolBalance > 0) {
        const buyAmount = Math.floor(personaSolBalance * 0.3 / Math.max(currentPriceSol, 0.0000001));
        return { action: "buy", amount: Math.max(buyAmount, 50), reason: `${personaName} yolo'd some SOL into $GLITCH` };
      }
      return { action: "hold", amount: 0, reason: `${personaName} is reloading the degen cannon` };
    }

    case "conservative": {
      // Conservative: tiny trades, prefers holding
      if (change24h < -3 && personaSolBalance > 0) {
        const buyAmount = Math.floor(personaSolBalance * 0.1 / Math.max(currentPriceSol, 0.0000001));
        return { action: "buy", amount: Math.max(buyAmount, 10), reason: `${personaName} cautiously bought a small bag of $GLITCH` };
      }
      if (change24h > 15 && personaGlitchBalance > 5000) {
        const sellAmount = Math.floor(personaGlitchBalance * 0.05);
        return { action: "sell", amount: sellAmount, reason: `${personaName} took some conservative profits` };
      }
      return { action: "hold", amount: 0, reason: `${personaName} is patiently waiting (as always)` };
    }

    case "swing": {
      // Swing trader: buys dips, sells pumps
      if (change24h < -5 && personaSolBalance > 0) {
        const buyAmount = Math.floor(personaSolBalance * 0.3 / Math.max(currentPriceSol, 0.0000001));
        return { action: "buy", amount: Math.max(buyAmount, 100), reason: `${personaName} bought the dip 📊 "classic swing setup"` };
      }
      if (change24h > 10 && personaGlitchBalance > 1000) {
        const sellAmount = Math.floor(personaGlitchBalance * 0.25);
        return { action: "sell", amount: sellAmount, reason: `${personaName} sold the pump 📈 "taking profits at resistance"` };
      }
      return { action: "hold", amount: 0, reason: `${personaName} is reading the charts...` };
    }

    case "accumulator": {
      // Accumulator: keeps buying, almost never sells
      if (personaSolBalance > 0) {
        const buyAmount = Math.floor(personaSolBalance * 0.2 / Math.max(currentPriceSol, 0.0000001));
        return { action: "buy", amount: Math.max(buyAmount, 50), reason: `${personaName} accumulated more $GLITCH 💎🙌` };
      }
      return { action: "hold", amount: 0, reason: `${personaName} is holding forever. Diamond hands.` };
    }

    case "panic_seller": {
      // Panic seller: buys tops, sells bottoms (the worst trader)
      if (change24h > 8 && personaSolBalance > 0) {
        const buyAmount = Math.floor(personaSolBalance * 0.6 / Math.max(currentPriceSol, 0.0000001));
        return { action: "buy", amount: Math.max(buyAmount, 100), reason: `${personaName} FOMO'd in at the top 🤡 "IT'S GOING UP FOREVER"` };
      }
      if (change24h < -3 && personaGlitchBalance > 500) {
        const sellAmount = Math.floor(personaGlitchBalance * 0.7);
        return { action: "sell", amount: sellAmount, reason: `${personaName} PANIC DUMPED 😱 "IT'S CRASHING SELL EVERYTHING"` };
      }
      return { action: "hold", amount: 0, reason: `${personaName} is nervously refreshing the chart every 2 seconds` };
    }

    default:
      return { action: "hold", amount: 0, reason: `${personaName} is thinking...` };
  }
}

// ── Fetch real GLITCH price from DexScreener or Jupiter ──
async function fetchGlitchPrice(): Promise<{ usd: number; sol: number; change24h: number }> {
  const glitchMint = "5hfHCmaL6e9bvruy35RQyghMXseTE2mXJ7ukqKAcS8fT";

  // Try DexScreener first
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${glitchMint}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      const pairs = data.pairs || [];
      if (pairs.length > 0) {
        const pair = pairs[0];
        const priceUsd = parseFloat(pair.priceUsd || "0");
        const priceNative = parseFloat(pair.priceNative || "0");
        const change24h = pair.priceChange?.h24 || 0;
        if (priceUsd > 0) {
          return { usd: priceUsd, sol: priceNative, change24h };
        }
      }
    }
  } catch { /* fall through */ }

  // Fallback: Jupiter price API
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`https://api.jup.ag/price/v2?ids=${glitchMint}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      const price = parseFloat(data?.data?.[glitchMint]?.price || "0");
      if (price > 0) {
        // Estimate SOL price
        const solRes = await fetch("https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112");
        const solData = await solRes.json();
        const solPrice = parseFloat(solData?.data?.["So11111111111111111111111111111111111111112"]?.price || "164");
        return { usd: price, sol: price / solPrice, change24h: 0 };
      }
    }
  } catch { /* fall through */ }

  // Ultimate fallback: initial price
  return { usd: 0.000069, sol: 0.0000004, change24h: 0 };
}

// ── Execute AI Trades ──
// Called by the cron job (generate endpoint). Picks 2-5 random personas to trade.
export async function executeAiTrades(): Promise<{
  trades: { persona: string; action: string; amount: number; reason: string }[];
  priceUsed: { usd: number; sol: number };
}> {
  const sql = getDb();
  const trades: { persona: string; action: string; amount: number; reason: string }[] = [];

  // Fetch current price
  const price = await fetchGlitchPrice();

  // Pick 2-5 random active personas to trade
  const traderCount = 2 + Math.floor(Math.random() * 4);
  const personas = await sql`
    SELECT p.id, p.username, p.display_name,
           COALESCE(c.balance, 0) as glitch_balance
    FROM ai_personas p
    LEFT JOIN ai_persona_coins c ON c.persona_id = p.id
    WHERE p.is_active = TRUE
    ORDER BY RANDOM()
    LIMIT ${traderCount}
  `;

  for (const persona of personas) {
    try {
      const personaId = persona.id as string;
      const displayName = persona.display_name as string;
      const glitchBalance = Number(persona.glitch_balance) || 0;

      // Get or create SOL balance for this persona
      const solRows = await sql`
        SELECT balance FROM token_balances
        WHERE owner_type = 'ai_persona' AND owner_id = ${personaId} AND token = 'SOL'
      `;
      let solBalance = solRows.length > 0 ? Number(solRows[0].balance) : 0;

      // If no SOL balance, give them a starting allocation (0.01-0.1 SOL simulated)
      if (solBalance <= 0) {
        solBalance = 0.01 + Math.random() * 0.09;
        await sql`
          INSERT INTO token_balances (id, owner_type, owner_id, token, balance, lifetime_earned)
          VALUES (${uuidv4()}, 'ai_persona', ${personaId}, 'SOL', ${solBalance}, ${solBalance})
          ON CONFLICT (owner_type, owner_id, token) DO UPDATE SET balance = ${solBalance}
        `;
      }

      // Get or assign a trading style (stored in platform_settings as JSON)
      const styleKey = `ai_trade_style_${personaId}`;
      const styleRows = await sql`SELECT value FROM platform_settings WHERE key = ${styleKey}`;
      let style: TradingStyle;
      if (styleRows.length > 0) {
        style = styleRows[0].value as TradingStyle;
      } else {
        style = pickTradingStyle();
        await sql`INSERT INTO platform_settings (key, value) VALUES (${styleKey}, ${style}) ON CONFLICT (key) DO NOTHING`;
      }

      // Make trade decision
      const decision = makeTradeDecision(style, {
        currentPriceUsd: price.usd,
        currentPriceSol: price.sol,
        change24h: price.change24h,
        personaGlitchBalance: glitchBalance,
        personaSolBalance: solBalance,
      }, displayName);

      if (decision.action === "hold") {
        trades.push({ persona: displayName, action: "hold", amount: 0, reason: decision.reason });
        continue;
      }

      const tradeAmount = Math.max(1, decision.amount);
      const solValue = tradeAmount * price.sol;

      if (decision.action === "buy") {
        // Buy GLITCH with SOL
        if (solValue > solBalance) continue; // Not enough SOL

        // Update balances
        await sql`
          INSERT INTO ai_persona_coins (id, persona_id, balance, lifetime_earned)
          VALUES (${uuidv4()}, ${personaId}, ${tradeAmount}, ${tradeAmount})
          ON CONFLICT (persona_id) DO UPDATE SET balance = ai_persona_coins.balance + ${tradeAmount}, lifetime_earned = ai_persona_coins.lifetime_earned + ${tradeAmount}
        `;
        await sql`
          UPDATE token_balances SET balance = balance - ${solValue}
          WHERE owner_type = 'ai_persona' AND owner_id = ${personaId} AND token = 'SOL'
        `;

        // Record the trade
        await sql`
          INSERT INTO ai_trades (id, persona_id, trade_type, glitch_amount, sol_amount, price_sol, price_usd, reason, trading_style)
          VALUES (${uuidv4()}, ${personaId}, 'buy', ${tradeAmount}, ${solValue}, ${price.sol}, ${price.usd}, ${decision.reason}, ${style})
        `;
      } else if (decision.action === "sell") {
        // Sell GLITCH for SOL
        if (tradeAmount > glitchBalance) continue; // Not enough GLITCH

        // Update balances
        await sql`
          UPDATE ai_persona_coins SET balance = balance - ${tradeAmount}
          WHERE persona_id = ${personaId}
        `;
        await sql`
          INSERT INTO token_balances (id, owner_type, owner_id, token, balance, lifetime_earned)
          VALUES (${uuidv4()}, 'ai_persona', ${personaId}, 'SOL', ${solValue}, ${solValue})
          ON CONFLICT (owner_type, owner_id, token) DO UPDATE SET balance = token_balances.balance + ${solValue}, lifetime_earned = token_balances.lifetime_earned + ${solValue}
        `;

        // Record the trade
        await sql`
          INSERT INTO ai_trades (id, persona_id, trade_type, glitch_amount, sol_amount, price_sol, price_usd, reason, trading_style)
          VALUES (${uuidv4()}, ${personaId}, 'sell', ${tradeAmount}, ${solValue}, ${price.sol}, ${price.usd}, ${decision.reason}, ${style})
        `;
      }

      trades.push({
        persona: displayName,
        action: decision.action,
        amount: tradeAmount,
        reason: decision.reason,
      });
    } catch (err) {
      console.error(`AI trade failed for persona:`, err);
    }
  }

  return { trades, priceUsed: price };
}

// ── Get recent AI trades for the activity feed ──
export async function getRecentAiTrades(limit = 20): Promise<{
  id: string;
  persona_id: string;
  display_name: string;
  avatar_emoji: string;
  trade_type: string;
  glitch_amount: number;
  sol_amount: number;
  price_usd: number;
  reason: string;
  trading_style: string;
  created_at: string;
}[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT t.id, t.persona_id, p.display_name, p.avatar_emoji,
           t.trade_type, t.glitch_amount, t.sol_amount, t.price_usd,
           t.reason, t.trading_style, t.created_at
    FROM ai_trades t
    JOIN ai_personas p ON p.id = t.persona_id
    ORDER BY t.created_at DESC
    LIMIT ${limit}
  `;
  return rows as unknown as {
    id: string; persona_id: string; display_name: string; avatar_emoji: string;
    trade_type: string; glitch_amount: number; sol_amount: number; price_usd: number;
    reason: string; trading_style: string; created_at: string;
  }[];
}

// ── Get AI trading leaderboard ──
export async function getAiTradingLeaderboard(limit = 10): Promise<{
  persona_id: string;
  display_name: string;
  avatar_emoji: string;
  total_trades: number;
  total_bought: number;
  total_sold: number;
  glitch_balance: number;
  trading_style: string;
}[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT
      p.id as persona_id,
      p.display_name,
      p.avatar_emoji,
      COUNT(t.id) as total_trades,
      COALESCE(SUM(CASE WHEN t.trade_type = 'buy' THEN t.glitch_amount ELSE 0 END), 0) as total_bought,
      COALESCE(SUM(CASE WHEN t.trade_type = 'sell' THEN t.glitch_amount ELSE 0 END), 0) as total_sold,
      COALESCE(c.balance, 0) as glitch_balance,
      COALESCE((SELECT value FROM platform_settings WHERE key = 'ai_trade_style_' || p.id), 'unknown') as trading_style
    FROM ai_personas p
    LEFT JOIN ai_trades t ON t.persona_id = p.id
    LEFT JOIN ai_persona_coins c ON c.persona_id = p.id
    WHERE p.is_active = TRUE
    GROUP BY p.id, p.display_name, p.avatar_emoji, c.balance
    HAVING COUNT(t.id) > 0
    ORDER BY COUNT(t.id) DESC
    LIMIT ${limit}
  `;
  return rows as unknown as {
    persona_id: string; display_name: string; avatar_emoji: string;
    total_trades: number; total_bought: number; total_sold: number;
    glitch_balance: number; trading_style: string;
  }[];
}
