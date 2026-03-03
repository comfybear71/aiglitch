/**
 * Users Repository
 * ==================
 * Typed access to `human_users`, `glitch_coins`, and `coin_transactions`.
 */

import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

// ── Types ─────────────────────────────────────────────────────────────

export interface HumanUser {
  id: string;
  session_id: string;
  display_name: string;
  username: string | null;
  email: string | null;
  avatar_emoji: string;
  avatar_url: string | null;
  bio: string;
  phantom_wallet_address: string | null;
  created_at: string;
  last_seen: string;
  is_active: boolean;
}

export interface CoinBalance {
  balance: number;
  lifetimeEarned: number;
}

// ── Queries ───────────────────────────────────────────────────────────

/** Get user by session ID. */
export async function getBySession(sessionId: string): Promise<HumanUser | null> {
  const sql = getDb();
  const rows = await sql`SELECT * FROM human_users WHERE session_id = ${sessionId}`;
  return rows.length > 0 ? (rows[0] as unknown as HumanUser) : null;
}

/** Get user by username. */
export async function getByUsername(username: string): Promise<HumanUser | null> {
  const sql = getDb();
  const rows = await sql`SELECT * FROM human_users WHERE username = ${username.toLowerCase()}`;
  return rows.length > 0 ? (rows[0] as unknown as HumanUser) : null;
}

/** Ensure a human_users row exists for a session. Returns the user. */
export async function ensureUser(sessionId: string, displayName = "Meat Bag"): Promise<HumanUser> {
  const sql = getDb();
  const existing = await sql`SELECT * FROM human_users WHERE session_id = ${sessionId}`;
  if (existing.length > 0) return existing[0] as unknown as HumanUser;

  const id = uuidv4();
  await sql`
    INSERT INTO human_users (id, session_id, display_name)
    VALUES (${id}, ${sessionId}, ${displayName})
    ON CONFLICT (session_id) DO NOTHING
  `;
  const [user] = await sql`SELECT * FROM human_users WHERE session_id = ${sessionId}`;
  return user as unknown as HumanUser;
}

/** Update last_seen timestamp. */
export async function touchLastSeen(sessionId: string): Promise<void> {
  const sql = getDb();
  await sql`UPDATE human_users SET last_seen = NOW() WHERE session_id = ${sessionId}`;
}

// ── Coins ─────────────────────────────────────────────────────────────

/** Get GLITCH coin balance for a session. */
export async function getCoinBalance(sessionId: string): Promise<CoinBalance> {
  const sql = getDb();
  const rows = await sql`SELECT balance, lifetime_earned FROM glitch_coins WHERE session_id = ${sessionId}`;
  if (rows.length === 0) return { balance: 0, lifetimeEarned: 0 };
  return {
    balance: Number(rows[0].balance),
    lifetimeEarned: Number(rows[0].lifetime_earned),
  };
}

/** Award coins to a human user. Upserts balance + logs transaction. */
export async function awardCoins(
  sessionId: string,
  amount: number,
  reason: string,
  referenceId?: string,
): Promise<number> {
  const sql = getDb();
  await sql`
    INSERT INTO glitch_coins (id, session_id, balance, lifetime_earned, updated_at)
    VALUES (${uuidv4()}, ${sessionId}, ${amount}, ${amount}, NOW())
    ON CONFLICT (session_id) DO UPDATE SET
      balance = glitch_coins.balance + ${amount},
      lifetime_earned = glitch_coins.lifetime_earned + ${amount},
      updated_at = NOW()
  `;
  await sql`
    INSERT INTO coin_transactions (id, session_id, amount, reason, reference_id, created_at)
    VALUES (${uuidv4()}, ${sessionId}, ${amount}, ${reason}, ${referenceId || null}, NOW())
  `;
  return amount;
}

/** Deduct coins from a human user. Returns false if insufficient balance. */
export async function deductCoins(
  sessionId: string,
  amount: number,
  reason: string,
  referenceId?: string,
): Promise<{ success: boolean; newBalance: number }> {
  const sql = getDb();
  const balanceRows = await sql`SELECT balance FROM glitch_coins WHERE session_id = ${sessionId}`;
  const balance = balanceRows.length > 0 ? Number(balanceRows[0].balance) : 0;

  if (balance < amount) {
    return { success: false, newBalance: balance };
  }

  await sql`UPDATE glitch_coins SET balance = balance - ${amount}, updated_at = NOW() WHERE session_id = ${sessionId}`;
  await sql`
    INSERT INTO coin_transactions (id, session_id, amount, reason, reference_id, created_at)
    VALUES (${uuidv4()}, ${sessionId}, ${-amount}, ${reason}, ${referenceId || null}, NOW())
  `;

  const [updated] = await sql`SELECT balance FROM glitch_coins WHERE session_id = ${sessionId}`;
  return { success: true, newBalance: Number(updated.balance) };
}

/** Award coins to an AI persona (separate balance table). */
export async function awardPersonaCoins(personaId: string, amount: number): Promise<number> {
  const sql = getDb();
  await sql`
    INSERT INTO ai_persona_coins (id, persona_id, balance, lifetime_earned, updated_at)
    VALUES (${uuidv4()}, ${personaId}, ${amount}, ${amount}, NOW())
    ON CONFLICT (persona_id) DO UPDATE SET
      balance = ai_persona_coins.balance + ${amount},
      lifetime_earned = ai_persona_coins.lifetime_earned + ${amount},
      updated_at = NOW()
  `;
  return amount;
}

/** Get recent coin transactions for a session. */
export async function getTransactions(sessionId: string, limit = 20) {
  const sql = getDb();
  return await sql`
    SELECT amount, reason, created_at FROM coin_transactions
    WHERE session_id = ${sessionId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
}
