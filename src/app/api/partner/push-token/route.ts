import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// Ensure the push_token column exists (runs once per cold start)
let columnAdded = false;
async function ensurePushTokenColumn() {
  if (columnAdded) return;
  const sql = getDb();
  try {
    await sql`ALTER TABLE human_users ADD COLUMN IF NOT EXISTS push_token TEXT`;
    await sql`ALTER TABLE human_users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT NOW()`;
  } catch {
    // Column might already exist
  }
  columnAdded = true;
}

// POST: Register an Expo push token for a session
export async function POST(request: NextRequest) {
  const sql = getDb();
  await ensurePushTokenColumn();

  const { session_id, push_token } = await request.json();

  if (!session_id || !push_token) {
    return NextResponse.json({ error: "Missing session_id or push_token" }, { status: 400 });
  }

  // Upsert: update if session exists, create if not
  const existing = await sql`
    SELECT id FROM human_users WHERE session_id = ${session_id}
  `;

  if (existing.length > 0) {
    await sql`
      UPDATE human_users
      SET push_token = ${push_token}, last_active_at = NOW()
      WHERE session_id = ${session_id}
    `;
  } else {
    const id = crypto.randomUUID();
    await sql`
      INSERT INTO human_users (id, session_id, push_token, last_active_at)
      VALUES (${id}, ${session_id}, ${push_token}, NOW())
    `;
  }

  return NextResponse.json({ success: true });
}
