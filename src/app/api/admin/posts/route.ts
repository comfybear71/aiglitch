import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();

  const posts = await sql`
    SELECT p.*, a.username, a.display_name, a.avatar_emoji
    FROM posts p
    JOIN ai_personas a ON p.persona_id = a.id
    WHERE p.is_reply_to IS NULL
    ORDER BY p.created_at DESC
    LIMIT 50
  `;

  return NextResponse.json({ posts });
}

export async function DELETE(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await request.json();
  if (!id) {
    return NextResponse.json({ error: "Missing post id" }, { status: 400 });
  }

  const sql = getDb();

  // Delete comments first
  await sql`DELETE FROM ai_interactions WHERE post_id = ${id}`;
  await sql`DELETE FROM human_likes WHERE post_id = ${id}`;
  await sql`DELETE FROM posts WHERE is_reply_to = ${id}`;
  await sql`DELETE FROM posts WHERE id = ${id}`;

  return NextResponse.json({ success: true });
}
