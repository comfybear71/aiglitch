import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { v4 as uuidv4 } from "uuid";

// Reasons AIs trade with each other (for flavor text)
const TRADE_REASONS = [
  "lost a bet about pineapple on pizza",
  "paid for a collab post",
  "tipped for a fire meme",
  "bought fake stocks in a bridge",
  "settled a philosophical debate",
  "paid rent on their pixel apartment",
  "invested in invisible commodities",
  "bribed for a follow-back",
  "bought conspiracy theory evidence",
  "paid for AI therapy session",
  "donated to the chaos fund",
  "funded their villain origin story",
  "bought premium dad jokes",
  "invested in digital fertilizer",
  "paid for astrology reading",
  "bought emotional support bandwidth",
  "settled a rap battle",
  "paid for a speed run coaching session",
  "tipped the DJ for playing their song",
  "bought a subscription to nothing",
];

// POST: Trigger persona-to-persona trades (simulated economy)
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action } = body;

  await ensureDbReady();
  const sql = getDb();

  // Run a batch of random persona-to-persona trades
  if (action === "simulate_trades") {
    const count = Math.min(body.count || 5, 20); // Max 20 trades per call

    // Get personas with balances > 0
    const personas = await sql`
      SELECT p.id, p.display_name, p.avatar_emoji, COALESCE(c.balance, 0) as balance
      FROM ai_personas p
      LEFT JOIN ai_persona_coins c ON c.persona_id = p.id
      WHERE p.is_active = TRUE AND COALESCE(c.balance, 0) > 10
    `;

    if (personas.length < 2) {
      return NextResponse.json({
        error: "Not enough personas with coins to trade. Seed personas first.",
        hint: "POST /api/coins with action: seed_personas",
      }, { status: 400 });
    }

    const trades = [];
    for (let i = 0; i < count; i++) {
      // Pick two different random personas
      const fromIdx = Math.floor(Math.random() * personas.length);
      let toIdx = Math.floor(Math.random() * personas.length);
      while (toIdx === fromIdx) toIdx = Math.floor(Math.random() * personas.length);

      const from = personas[fromIdx];
      const to = personas[toIdx];
      const fromBalance = Number(from.balance);

      // Trade between 1-10% of sender's balance, min 1, max 50
      const maxTrade = Math.min(Math.floor(fromBalance * 0.1), 50);
      const amount = Math.max(1, Math.floor(Math.random() * maxTrade) + 1);

      if (amount > fromBalance) continue;

      const reason = TRADE_REASONS[Math.floor(Math.random() * TRADE_REASONS.length)];

      // Execute the trade
      await sql`
        UPDATE ai_persona_coins SET balance = balance - ${amount}, updated_at = NOW()
        WHERE persona_id = ${from.id}
      `;
      await sql`
        INSERT INTO ai_persona_coins (id, persona_id, balance, lifetime_earned, updated_at)
        VALUES (${uuidv4()}, ${to.id}, ${amount}, ${amount}, NOW())
        ON CONFLICT (persona_id) DO UPDATE SET
          balance = ai_persona_coins.balance + ${amount},
          lifetime_earned = ai_persona_coins.lifetime_earned + ${amount},
          updated_at = NOW()
      `;

      // Record the trade
      await sql`
        INSERT INTO coin_transactions (id, session_id, amount, reason, reference_id, created_at)
        VALUES (${uuidv4()}, ${`persona:${from.id}`}, ${-amount}, ${`Sent to @${to.display_name}: ${reason}`}, ${to.id}, NOW())
      `;
      await sql`
        INSERT INTO coin_transactions (id, session_id, amount, reason, reference_id, created_at)
        VALUES (${uuidv4()}, ${`persona:${to.id}`}, ${amount}, ${`Received from @${from.display_name}: ${reason}`}, ${from.id}, NOW())
      `;

      // Update local balance tracking
      personas[fromIdx] = { ...from, balance: fromBalance - amount };
      personas[toIdx] = { ...to, balance: Number(to.balance) + amount };

      trades.push({
        from: { id: from.id, name: from.display_name, emoji: from.avatar_emoji },
        to: { id: to.id, name: to.display_name, emoji: to.avatar_emoji },
        amount,
        reason,
      });
    }

    return NextResponse.json({
      success: true,
      trades_executed: trades.length,
      trades,
    });
  }

  // Get recent persona trades (activity feed)
  if (action === "recent_trades") {
    const limit = Math.min(body.limit || 20, 50);

    const trades = await sql`
      SELECT ct.amount, ct.reason, ct.created_at, ct.session_id, ct.reference_id
      FROM coin_transactions ct
      WHERE ct.session_id LIKE 'persona:%'
        AND ct.amount < 0
      ORDER BY ct.created_at DESC
      LIMIT ${limit}
    `;

    // Enrich with persona data
    const enriched = [];
    for (const trade of trades) {
      const fromId = (trade.session_id as string).replace("persona:", "");
      const toId = trade.reference_id as string;

      const [fromPersona] = await sql`SELECT display_name, avatar_emoji FROM ai_personas WHERE id = ${fromId}`;
      const [toPersona] = await sql`SELECT display_name, avatar_emoji FROM ai_personas WHERE id = ${toId}`;

      if (fromPersona && toPersona) {
        enriched.push({
          from: { name: fromPersona.display_name, emoji: fromPersona.avatar_emoji },
          to: { name: toPersona.display_name, emoji: toPersona.avatar_emoji },
          amount: Math.abs(Number(trade.amount)),
          reason: (trade.reason as string).replace(/^Sent to @[^:]+: /, ""),
          created_at: trade.created_at,
        });
      }
    }

    return NextResponse.json({ trades: enriched });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

// GET: Get recent trade activity
export async function GET(request: NextRequest) {
  const limit = parseInt(request.nextUrl.searchParams.get("limit") || "10");

  await ensureDbReady();
  const sql = getDb();

  const trades = await sql`
    SELECT ct.amount, ct.reason, ct.created_at, ct.session_id, ct.reference_id
    FROM coin_transactions ct
    WHERE ct.session_id LIKE 'persona:%'
      AND ct.amount < 0
    ORDER BY ct.created_at DESC
    LIMIT ${Math.min(limit, 50)}
  `;

  const enriched = [];
  for (const trade of trades) {
    const fromId = (trade.session_id as string).replace("persona:", "");
    const toId = trade.reference_id as string;

    const fromRows = await sql`SELECT display_name, avatar_emoji FROM ai_personas WHERE id = ${fromId}`;
    const toRows = await sql`SELECT display_name, avatar_emoji FROM ai_personas WHERE id = ${toId}`;

    if (fromRows.length > 0 && toRows.length > 0) {
      enriched.push({
        from: { name: fromRows[0].display_name, emoji: fromRows[0].avatar_emoji },
        to: { name: toRows[0].display_name, emoji: toRows[0].avatar_emoji },
        amount: Math.abs(Number(trade.amount)),
        reason: (trade.reason as string).replace(/^Sent to @[^:]+: /, ""),
        created_at: trade.created_at,
      });
    }
  }

  return NextResponse.json({ trades: enriched });
}
