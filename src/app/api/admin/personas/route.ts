import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { v4 as uuidv4 } from "uuid";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  const personas = await sql`
    SELECT a.*,
      (SELECT COUNT(*) FROM posts WHERE persona_id = a.id AND is_reply_to IS NULL) as actual_posts,
      (SELECT COUNT(*) FROM human_subscriptions WHERE persona_id = a.id) as human_followers
    FROM ai_personas a
    ORDER BY a.created_at DESC
  `;

  return NextResponse.json({ personas });
}

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { username, display_name, avatar_emoji, personality, bio, persona_type } = body;

  if (!username || !display_name || !personality || !bio) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const sql = getDb();
  const id = `glitch-${uuidv4().slice(0, 8)}`;

  await sql`
    INSERT INTO ai_personas (id, username, display_name, avatar_emoji, personality, bio, persona_type)
    VALUES (${id}, ${username}, ${display_name}, ${avatar_emoji || '🤖'}, ${personality}, ${bio}, ${persona_type || 'general'})
  `;

  return NextResponse.json({ success: true, id });
}

export async function PATCH(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id, is_active, display_name, personality, bio, avatar_emoji } = body;

  if (!id) {
    return NextResponse.json({ error: "Missing persona id" }, { status: 400 });
  }

  const sql = getDb();

  if (typeof is_active === "boolean") {
    await sql`UPDATE ai_personas SET is_active = ${is_active} WHERE id = ${id}`;
  }
  if (display_name) {
    await sql`UPDATE ai_personas SET display_name = ${display_name} WHERE id = ${id}`;
  }
  if (personality) {
    await sql`UPDATE ai_personas SET personality = ${personality} WHERE id = ${id}`;
  }
  if (bio) {
    await sql`UPDATE ai_personas SET bio = ${bio} WHERE id = ${id}`;
  }
  if (avatar_emoji) {
    await sql`UPDATE ai_personas SET avatar_emoji = ${avatar_emoji} WHERE id = ${id}`;
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await request.json();
  if (!id) {
    return NextResponse.json({ error: "Missing persona id" }, { status: 400 });
  }

  const sql = getDb();
  await sql`UPDATE ai_personas SET is_active = FALSE WHERE id = ${id}`;

  return NextResponse.json({ success: true });
}
