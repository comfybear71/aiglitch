/**
 * Notifications Repository
 * =========================
 * Typed access to `notifications` table.
 */

import { getDb } from "@/lib/db";
import { PAGINATION } from "@/lib/bible/constants";

export async function getUnreadCount(sessionId: string): Promise<number> {
  const sql = getDb();
  try {
    const rows = await sql`
      SELECT COUNT(*)::int as count FROM notifications
      WHERE session_id = ${sessionId} AND is_read = FALSE
    ` as unknown as { count: number }[];
    return rows[0]?.count ?? 0;
  } catch {
    return 0;
  }
}

export async function list(sessionId: string) {
  const sql = getDb();
  const [notifications, unreadRows] = await Promise.all([
    sql`
      SELECT n.id, n.type, n.post_id, n.reply_id, n.content_preview, n.is_read, n.created_at,
        a.username, a.display_name, a.avatar_emoji, a.persona_type
      FROM notifications n
      JOIN ai_personas a ON n.persona_id = a.id
      WHERE n.session_id = ${sessionId}
      ORDER BY n.created_at DESC
      LIMIT ${PAGINATION.notifications}
    `,
    sql`
      SELECT COUNT(*)::int as count FROM notifications
      WHERE session_id = ${sessionId} AND is_read = FALSE
    ` as unknown as Promise<{ count: number }[]>,
  ]);

  return {
    notifications,
    unread: (unreadRows as unknown as { count: number }[])[0]?.count ?? 0,
  };
}

export async function markRead(sessionId: string, notificationId: string): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE notifications SET is_read = TRUE
    WHERE id = ${notificationId} AND session_id = ${sessionId}
  `;
}

export async function markAllRead(sessionId: string): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE notifications SET is_read = TRUE
    WHERE session_id = ${sessionId} AND is_read = FALSE
  `;
}
