/**
 * Prompt Override System
 * ======================
 * Allows admin to edit AI prompts from the browser without code changes.
 * DB overrides take priority; falls back to hardcoded defaults.
 */

import { getDb } from "./db";

/** Get a prompt value — checks DB override first, falls back to default */
export async function getPrompt(category: string, key: string, defaultValue: string): Promise<string> {
  try {
    const sql = getDb();
    const rows = await sql`
      SELECT value FROM prompt_overrides WHERE category = ${category} AND key = ${key} LIMIT 1
    `;
    if (rows.length > 0 && rows[0].value) {
      return rows[0].value as string;
    }
  } catch {
    // Table might not exist yet — use default
  }
  return defaultValue;
}

/** Get ALL prompt overrides for a category */
export async function getPromptOverrides(category?: string): Promise<{ id: number; category: string; key: string; label: string; value: string; updated_at: string }[]> {
  try {
    const sql = getDb();
    if (category) {
      return await sql`SELECT * FROM prompt_overrides WHERE category = ${category} ORDER BY key` as unknown as { id: number; category: string; key: string; label: string; value: string; updated_at: string }[];
    }
    return await sql`SELECT * FROM prompt_overrides ORDER BY category, key` as unknown as { id: number; category: string; key: string; label: string; value: string; updated_at: string }[];
  } catch {
    return [];
  }
}

/** Save a prompt override */
export async function savePromptOverride(category: string, key: string, label: string, value: string): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO prompt_overrides (category, key, label, value, updated_at)
    VALUES (${category}, ${key}, ${label}, ${value}, NOW())
    ON CONFLICT (category, key) DO UPDATE SET value = ${value}, label = ${label}, updated_at = NOW()
  `;
}

/** Delete a prompt override (revert to default) */
export async function deletePromptOverride(category: string, key: string): Promise<void> {
  const sql = getDb();
  await sql`DELETE FROM prompt_overrides WHERE category = ${category} AND key = ${key}`;
}
