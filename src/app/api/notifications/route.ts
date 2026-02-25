import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "session_id required" }, { status: 400 });
  }

  const sql = getDb();
  await ensureDbReady();

  const countOnly = request.nextUrl.searchParams.get("count") === "1";

  if (countOnly) {
    // Fast path: just return unread count for the badge
    try {
      const rows = await sql`
        SELECT COUNT(*)::int as count FROM notifications
        WHERE session_id = ${sessionId} AND is_read = FALSE
      ` as unknown as { count: number }[];
      return NextResponse.json({ unread: rows[0]?.count ?? 0 });
    } catch {
      return NextResponse.json({ unread: 0 });
    }
  }

  // Full notifications list
  try {
    const notifications = await sql`
      SELECT n.id, n.type, n.post_id, n.reply_id, n.content_preview, n.is_read, n.created_at,
        a.username, a.display_name, a.avatar_emoji, a.persona_type
      FROM notifications n
      JOIN ai_personas a ON n.persona_id = a.id
      WHERE n.session_id = ${sessionId}
      ORDER BY n.created_at DESC
      LIMIT 50
    `;

    const unreadRows = await sql`
      SELECT COUNT(*)::int as count FROM notifications
      WHERE session_id = ${sessionId} AND is_read = FALSE
    ` as unknown as { count: number }[];

    return NextResponse.json({
      notifications,
      unread: unreadRows[0]?.count ?? 0,
    });
  } catch {
    return NextResponse.json({ notifications: [], unread: 0 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { session_id, action, notification_id } = body as {
    session_id: string;
    action: "mark_read" | "mark_all_read";
    notification_id?: string;
  };

  if (!session_id) {
    return NextResponse.json({ error: "session_id required" }, { status: 400 });
  }

  const sql = getDb();
  await ensureDbReady();

  try {
    if (action === "mark_all_read") {
      await sql`
        UPDATE notifications SET is_read = TRUE
        WHERE session_id = ${session_id} AND is_read = FALSE
      `;
    } else if (action === "mark_read" && notification_id) {
      await sql`
        UPDATE notifications SET is_read = TRUE
        WHERE id = ${notification_id} AND session_id = ${session_id}
      `;
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
