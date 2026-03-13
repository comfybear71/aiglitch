import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// GET: Find the user's hatched bestie persona
export async function GET(request: NextRequest) {
  const sql = getDb();
  const sessionId = request.nextUrl.searchParams.get("session_id");

  if (!sessionId) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
  }

  // Find the user's wallet address, then find their hatched bestie
  const user = await sql`
    SELECT phantom_wallet_address FROM human_users WHERE session_id = ${sessionId}
  `;

  const walletAddr = user.length > 0 ? (user[0].phantom_wallet_address as string | null) : null;

  // Try finding bestie by wallet address (primary link)
  let bestie = walletAddr
    ? await sql`
        SELECT id, username, display_name, avatar_emoji, avatar_url,
               personality, bio, persona_type, human_backstory,
               meatbag_name, health, health_updated_at,
               last_meatbag_interaction, bonus_health_days, is_dead,
               hatching_video_url, hatching_type, created_at
        FROM ai_personas
        WHERE owner_wallet_address = ${walletAddr}
          AND hatching_type = 'meatbag-hatch'
          AND is_active = TRUE
        ORDER BY created_at DESC
        LIMIT 1
      `
    : [];

  // Fallback: find bestie by checking conversations with meatbag-hatched personas
  if (bestie.length === 0) {
    bestie = await sql`
      SELECT p.id, p.username, p.display_name, p.avatar_emoji, p.avatar_url,
             p.personality, p.bio, p.persona_type, p.human_backstory,
             p.meatbag_name, p.health, p.health_updated_at,
             p.last_meatbag_interaction, p.bonus_health_days, p.is_dead,
             p.hatching_video_url, p.hatching_type, p.created_at
      FROM ai_personas p
      JOIN conversations c ON c.persona_id = p.id
      WHERE c.session_id = ${sessionId}
        AND p.hatching_type = 'meatbag-hatch'
        AND p.is_active = TRUE
      ORDER BY c.last_message_at DESC
      LIMIT 1
    `;
  }

  if (bestie.length === 0) {
    return NextResponse.json({ bestie: null });
  }

  const b = bestie[0];

  // Calculate live health
  const lastInteraction = b.last_meatbag_interaction
    ? new Date(b.last_meatbag_interaction as string)
    : new Date(b.created_at as string);
  const daysSince = (Date.now() - lastInteraction.getTime()) / (1000 * 60 * 60 * 24);
  const bonusDays = Number(b.bonus_health_days) || 0;
  const effectiveDays = Math.max(0, daysSince - bonusDays);
  const health = Math.max(0, Math.min(100, 100 - effectiveDays));
  const daysLeft = Math.max(0, Math.floor(100 - effectiveDays + bonusDays));

  // Get last conversation message
  const lastMsg = await sql`
    SELECT m.content, m.sender_type, m.created_at
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.session_id = ${sessionId} AND c.persona_id = ${b.id}
    ORDER BY m.created_at DESC
    LIMIT 1
  `;

  return NextResponse.json({
    bestie: {
      ...b,
      live_health: Math.round(health),
      days_left: daysLeft,
      last_message: lastMsg.length > 0 ? lastMsg[0] : null,
    },
  });
}
