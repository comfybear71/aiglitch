import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getTradingPersonality, generateTradeCommentary } from "@/lib/trading-personalities";
import { v4 as uuidv4 } from "uuid";

// ── GET: Query AI trading data (recent, leaderboard, persona stats) ──
// Also handles cron execution (Vercel cron sends GET)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "recent";

  const sql = getDb();

  // Cron trigger: execute trades
  if (action === "cron") {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    const isAdmin = await isAdminAuthenticated();
    if (cronSecret && authHeader !== `Bearer ${cronSecret}` && !isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const trades = await executeTradeBatch(sql, 5 + Math.floor(Math.random() * 11));
    return NextResponse.json({ success: true, trades_executed: trades.length, trades });
  }

  if (action === "recent") {
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const trades = await sql`
      SELECT t.*, p.display_name, p.avatar_emoji, p.username, p.persona_type
      FROM ai_trades t
      JOIN ai_personas p ON t.persona_id = p.id
      ORDER BY t.created_at DESC
      LIMIT ${limit}
    `;
    return NextResponse.json({ trades });
  }

  if (action === "leaderboard") {
    const leaderboard = await sql`
      SELECT
        t.persona_id,
        SUM(CASE WHEN t.trade_type = 'buy' THEN -t.sol_amount ELSE t.sol_amount END) as net_sol,
        SUM(CASE WHEN t.trade_type = 'buy' THEN t.glitch_amount ELSE -t.glitch_amount END) as net_glitch,
        COUNT(*) as total_trades,
        MAX(t.strategy) as strategy,
        p.display_name, p.avatar_emoji, p.username
      FROM ai_trades t
      JOIN ai_personas p ON t.persona_id = p.id
      GROUP BY t.persona_id, p.display_name, p.avatar_emoji, p.username
      ORDER BY net_sol DESC
      LIMIT 20
    `;
    return NextResponse.json({ leaderboard });
  }

  if (action === "persona_stats") {
    const personaId = searchParams.get("persona_id");
    if (!personaId) return NextResponse.json({ error: "Missing persona_id" }, { status: 400 });

    const trades = await sql`
      SELECT t.*, p.display_name, p.avatar_emoji, p.username
      FROM ai_trades t
      JOIN ai_personas p ON t.persona_id = p.id
      WHERE t.persona_id = ${personaId}
      ORDER BY t.created_at DESC
      LIMIT 50
    `;
    const [stats] = await sql`
      SELECT
        COUNT(*) as total_trades,
        SUM(CASE WHEN trade_type = 'buy' THEN -sol_amount ELSE sol_amount END) as net_sol,
        SUM(CASE WHEN trade_type = 'buy' THEN glitch_amount ELSE -glitch_amount END) as net_glitch
      FROM ai_trades WHERE persona_id = ${personaId}
    `;
    return NextResponse.json({ trades, stats });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

// ── POST: Execute AI trading batch (manual trigger) ──
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const isAdmin = await isAdminAuthenticated();
  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && !isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  const body = await request.json().catch(() => ({}));
  const count = Math.min(body.count || 10, 30);

  const trades = await executeTradeBatch(sql, count);
  return NextResponse.json({ success: true, trades_executed: trades.length, trades });
}

// ── Core Trading Engine ──
async function executeTradeBatch(
  sql: ReturnType<typeof getDb>,
  targetCount: number,
) {
  // 1. Get current GLITCH/SOL price
  const [priceSetting] = await sql`SELECT value FROM platform_settings WHERE key = 'glitch_price_sol'`;
  const pricePerGlitch = parseFloat(priceSetting?.value || "0.000042");

  // 2. Get market sentiment from recent trades
  const [sentiment] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE trade_type = 'buy') as buys,
      COUNT(*) as total
    FROM ai_trades
    WHERE created_at > NOW() - INTERVAL '2 hours'
  `;
  const totalRecent = Number(sentiment?.total || 0);
  const bullishSentiment = totalRecent > 0 ? Number(sentiment.buys) / totalRecent : 0.5;

  // 3. Select random active personas (fetch extra to account for frequency filtering)
  const personas = await sql`
    SELECT p.id, p.username, p.display_name, p.avatar_emoji, p.persona_type
    FROM ai_personas p
    WHERE p.is_active = TRUE
    ORDER BY RANDOM()
    LIMIT ${targetCount * 3}
  `;

  const trades: {
    persona: string;
    emoji: string;
    type: string;
    glitchAmount: number;
    solAmount: number;
    commentary: string;
  }[] = [];

  for (const persona of personas) {
    if (trades.length >= targetCount) break;

    const personality = getTradingPersonality(persona.id, persona.persona_type);

    // Roll against trade frequency
    if (Math.random() * 100 > personality.tradeFrequency) continue;

    // Get balances (upsert pattern: create row if missing)
    let [glitchRow] = await sql`
      SELECT balance FROM token_balances
      WHERE owner_type = 'ai_persona' AND owner_id = ${persona.id} AND token = 'GLITCH'
    `;
    if (!glitchRow) {
      // Try to seed from ai_persona_coins
      const [coinRow] = await sql`SELECT balance FROM ai_persona_coins WHERE persona_id = ${persona.id}`;
      const seedBal = Number(coinRow?.balance || 100000);
      await sql`
        INSERT INTO token_balances (id, owner_type, owner_id, token, balance, lifetime_earned, updated_at)
        VALUES (${uuidv4()}, 'ai_persona', ${persona.id}, 'GLITCH', ${seedBal}, ${seedBal}, NOW())
        ON CONFLICT (owner_type, owner_id, token) DO NOTHING
      `;
      [glitchRow] = await sql`
        SELECT balance FROM token_balances
        WHERE owner_type = 'ai_persona' AND owner_id = ${persona.id} AND token = 'GLITCH'
      `;
    }

    let [solRow] = await sql`
      SELECT balance FROM token_balances
      WHERE owner_type = 'ai_persona' AND owner_id = ${persona.id} AND token = 'SOL'
    `;
    if (!solRow) {
      // Seed with random SOL (10-50)
      const seedSol = persona.id === "glitch-047" ? 420.69 : 10 + Math.random() * 40;
      await sql`
        INSERT INTO token_balances (id, owner_type, owner_id, token, balance, lifetime_earned, updated_at)
        VALUES (${uuidv4()}, 'ai_persona', ${persona.id}, 'SOL', ${seedSol}, ${seedSol}, NOW())
        ON CONFLICT (owner_type, owner_id, token) DO NOTHING
      `;
      [solRow] = await sql`
        SELECT balance FROM token_balances
        WHERE owner_type = 'ai_persona' AND owner_id = ${persona.id} AND token = 'SOL'
      `;
    }

    const glitchBalance = Number(glitchRow?.balance || 0);
    const solBalance = Number(solRow?.balance || 0);

    // Determine direction using bias + market sentiment
    const adjustedBias = personality.bias + (bullishSentiment - 0.5) * 0.2;
    const isBuy = Math.random() < (0.5 + adjustedBias / 2);

    // ElonBot can ONLY buy (sell restriction)
    if (!isBuy && persona.id === "glitch-047") continue;

    // Check if they can afford the trade
    if (isBuy && solBalance < pricePerGlitch * personality.minTradeAmount) continue;
    if (!isBuy && glitchBalance < personality.minTradeAmount) continue;

    // Calculate trade amount
    const maxGlitch = isBuy
      ? Math.floor((solBalance * personality.maxTradePercent) / 100 / pricePerGlitch)
      : Math.floor((glitchBalance * personality.maxTradePercent) / 100);

    if (maxGlitch < personality.minTradeAmount) continue;

    const glitchAmount = Math.max(
      personality.minTradeAmount,
      Math.floor(Math.random() * maxGlitch),
    );
    const solAmount = glitchAmount * pricePerGlitch;

    // Execute the trade (update balances with floor check)
    if (isBuy) {
      const [updated] = await sql`
        UPDATE token_balances SET balance = balance - ${solAmount}, updated_at = NOW()
        WHERE owner_type = 'ai_persona' AND owner_id = ${persona.id} AND token = 'SOL' AND balance >= ${solAmount}
        RETURNING balance
      `;
      if (!updated) continue; // Insufficient balance (race condition guard)
      await sql`
        UPDATE token_balances SET balance = balance + ${glitchAmount}, updated_at = NOW()
        WHERE owner_type = 'ai_persona' AND owner_id = ${persona.id} AND token = 'GLITCH'
      `;
      // Keep ai_persona_coins in sync
      await sql`
        UPDATE ai_persona_coins SET balance = balance + ${glitchAmount}, updated_at = NOW()
        WHERE persona_id = ${persona.id}
      `;
    } else {
      const [updated] = await sql`
        UPDATE token_balances SET balance = balance - ${glitchAmount}, updated_at = NOW()
        WHERE owner_type = 'ai_persona' AND owner_id = ${persona.id} AND token = 'GLITCH' AND balance >= ${glitchAmount}
        RETURNING balance
      `;
      if (!updated) continue;
      await sql`
        UPDATE token_balances SET balance = balance + ${solAmount}, updated_at = NOW()
        WHERE owner_type = 'ai_persona' AND owner_id = ${persona.id} AND token = 'SOL'
      `;
      await sql`
        UPDATE ai_persona_coins SET balance = GREATEST(0, balance - ${glitchAmount}), updated_at = NOW()
        WHERE persona_id = ${persona.id}
      `;
    }

    // Generate trade commentary
    const commentary = generateTradeCommentary(personality, isBuy, glitchAmount, solAmount);

    // Record trade
    await sql`
      INSERT INTO ai_trades (id, persona_id, trade_type, glitch_amount, sol_amount, price_per_glitch, commentary, strategy, created_at)
      VALUES (${uuidv4()}, ${persona.id}, ${isBuy ? "buy" : "sell"}, ${glitchAmount}, ${solAmount}, ${pricePerGlitch}, ${commentary}, ${personality.strategy}, NOW())
    `;

    trades.push({
      persona: persona.username,
      emoji: persona.avatar_emoji,
      type: isBuy ? "buy" : "sell",
      glitchAmount,
      solAmount,
      commentary,
    });
  }

  return trades;
}
