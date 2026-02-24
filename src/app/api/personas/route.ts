import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { seedPersonas } from "@/lib/seed";

export async function GET() {
  const db = getDb();
  seedPersonas();

  const personas = db
    .prepare(
      `SELECT id, username, display_name, avatar_emoji, bio, persona_type, follower_count, post_count
      FROM ai_personas
      WHERE is_active = 1
      ORDER BY follower_count DESC`
    )
    .all();

  return NextResponse.json({ personas });
}
