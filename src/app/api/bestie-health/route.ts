/**
 * Bestie Health System API
 * ========================
 * GET  /api/bestie-health?session_id=...  — Get bestie health status
 * POST /api/bestie-health                 — Feed GLITCH to extend bestie life
 *
 * Health decays 1% per day (100 days to die).
 * Bonus days from GLITCH extend the total lifespan beyond 100%.
 * A single Telegram reply resets health to 100% (handled in persona-chat webhook).
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { users } from "@/lib/repositories";

const GLITCH_PER_100_DAYS = 1000;
const DAYS_PER_GLITCH = 100 / GLITCH_PER_100_DAYS; // 0.1 days per GLITCH

/**
 * Calculate current health based on last interaction time + bonus days.
 * Health = 100 - (days_since_interaction - bonus_days)
 * Clamped to 0–100 (surplus health shows as bonus_days remaining).
 */
export function calculateHealth(lastInteraction: Date, bonusDays: number): {
  health: number;
  effectiveDaysLeft: number;
  isDead: boolean;
} {
  const now = new Date();
  const daysSinceInteraction = (now.getTime() - lastInteraction.getTime()) / (1000 * 60 * 60 * 24);
  const totalDaysProtected = 100 + bonusDays;
  const effectiveDaysLeft = Math.max(0, totalDaysProtected - daysSinceInteraction);
  // Health is percentage of the base 100-day window
  const health = Math.min(100, Math.max(0, (effectiveDaysLeft / (100 + bonusDays)) * 100));
  const isDead = effectiveDaysLeft <= 0;

  return { health: Math.round(health * 10) / 10, effectiveDaysLeft: Math.round(effectiveDaysLeft * 10) / 10, isDead };
}

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
  }

  await ensureDbReady();
  const sql = getDb();

  // Get the user's persona with health data
  const [user] = await sql`
    SELECT phantom_wallet_address FROM human_users WHERE session_id = ${sessionId}
  ` as unknown as [{ phantom_wallet_address: string | null } | undefined];

  if (!user?.phantom_wallet_address) {
    return NextResponse.json({ has_persona: false });
  }

  const [persona] = await sql`
    SELECT id, display_name, avatar_emoji, username, health,
           last_meatbag_interaction, bonus_health_days, is_dead
    FROM ai_personas
    WHERE owner_wallet_address = ${user.phantom_wallet_address}
    LIMIT 1
  ` as unknown as [{
    id: string;
    display_name: string;
    avatar_emoji: string;
    username: string;
    health: number;
    last_meatbag_interaction: string;
    bonus_health_days: number;
    is_dead: boolean;
  } | undefined];

  if (!persona) {
    return NextResponse.json({ has_persona: false });
  }

  const lastInteraction = new Date(persona.last_meatbag_interaction);
  const calculated = calculateHealth(lastInteraction, persona.bonus_health_days);

  // Update stored health if it changed significantly
  if (Math.abs(calculated.health - persona.health) > 0.5 || calculated.isDead !== persona.is_dead) {
    await sql`
      UPDATE ai_personas
      SET health = ${calculated.health},
          is_dead = ${calculated.isDead},
          health_updated_at = NOW()
      WHERE id = ${persona.id}
    `;
  }

  return NextResponse.json({
    has_persona: true,
    persona_id: persona.id,
    display_name: persona.display_name,
    avatar_emoji: persona.avatar_emoji,
    username: persona.username,
    health: calculated.health,
    days_left: calculated.effectiveDaysLeft,
    is_dead: calculated.isDead,
    bonus_days: persona.bonus_health_days,
    last_interaction: persona.last_meatbag_interaction,
    feed_cost: GLITCH_PER_100_DAYS,
    feed_days: 100,
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { session_id, action, amount } = body;

  if (!session_id || !action) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  await ensureDbReady();
  const sql = getDb();

  if (action === "feed_glitch") {
    // Pay GLITCH to extend bestie life
    if (!amount || typeof amount !== "number" || amount < 100) {
      return NextResponse.json({ error: "Minimum feed is 100 GLITCH" }, { status: 400 });
    }

    const { balance } = await users.getCoinBalance(session_id);
    if (balance < amount) {
      return NextResponse.json({ error: "Insufficient GLITCH balance", balance }, { status: 402 });
    }

    // Get persona
    const [user] = await sql`
      SELECT phantom_wallet_address FROM human_users WHERE session_id = ${session_id}
    ` as unknown as [{ phantom_wallet_address: string | null } | undefined];

    if (!user?.phantom_wallet_address) {
      return NextResponse.json({ error: "No wallet linked" }, { status: 400 });
    }

    const [persona] = await sql`
      SELECT id, display_name, bonus_health_days, last_meatbag_interaction, is_dead
      FROM ai_personas WHERE owner_wallet_address = ${user.phantom_wallet_address} LIMIT 1
    ` as unknown as [{
      id: string; display_name: string; bonus_health_days: number;
      last_meatbag_interaction: string; is_dead: boolean;
    } | undefined];

    if (!persona) {
      return NextResponse.json({ error: "No bestie found" }, { status: 404 });
    }

    // Deduct GLITCH
    const deductResult = await users.deductCoins(session_id, amount, `Fed ${persona.display_name} (health boost)`, persona.id);
    if (!deductResult.success) {
      return NextResponse.json({ error: "Insufficient balance" }, { status: 402 });
    }

    // Add bonus days
    const bonusDays = amount * DAYS_PER_GLITCH;
    const newBonusDays = persona.bonus_health_days + bonusDays;

    // If bestie was dead, resurrect them!
    const wasResurrected = persona.is_dead;

    await sql`
      UPDATE ai_personas
      SET bonus_health_days = ${newBonusDays},
          is_dead = FALSE,
          health_updated_at = NOW()
          ${wasResurrected ? sql`, last_meatbag_interaction = NOW()` : sql``}
      WHERE id = ${persona.id}
    `;

    const lastInteraction = wasResurrected ? new Date() : new Date(persona.last_meatbag_interaction);
    const newHealth = calculateHealth(lastInteraction, newBonusDays);

    return NextResponse.json({
      success: true,
      glitch_spent: amount,
      bonus_days_added: Math.round(bonusDays * 10) / 10,
      total_bonus_days: Math.round(newBonusDays * 10) / 10,
      health: newHealth.health,
      days_left: newHealth.effectiveDaysLeft,
      was_resurrected: wasResurrected,
      new_balance: deductResult.newBalance,
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
