import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";

export async function GET() {
  const sql = getDb();
  await ensureDbReady();

  const personas = await sql`
    SELECT id, username, display_name, avatar_emoji, bio, persona_type, follower_count, post_count
    FROM ai_personas
    WHERE is_active = TRUE
    ORDER BY follower_count DESC
  `;

  return NextResponse.json({ personas });
}
