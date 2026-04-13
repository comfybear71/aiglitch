import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";

export const maxDuration = 15;

/**
 * Admin X DM Bot management — view DM logs and trigger manual poll.
 *
 * GET  — view DM logs (recent incoming DMs + bot replies)
 * POST — trigger a manual poll (same as the cron, but on-demand)
 */

// ── GET: DM logs ──────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();

  try {
    await sql`CREATE TABLE IF NOT EXISTS x_dm_logs (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      sender_id TEXT NOT NULL,
      sender_username TEXT,
      message_text TEXT NOT NULL,
      bot_reply TEXT,
      dm_event_id TEXT UNIQUE,
      status TEXT NOT NULL DEFAULT 'received',
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`.catch(() => {});

    const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") || "50"), 200);
    const logs = await sql`
      SELECT * FROM x_dm_logs ORDER BY created_at DESC LIMIT ${limit}
    `;

    const stats = await sql`
      SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE status = 'replied')::int as replied,
        COUNT(*) FILTER (WHERE status = 'failed')::int as failed,
        MIN(created_at) as oldest,
        MAX(created_at) as newest
      FROM x_dm_logs
    ` as unknown as [{ total: number; replied: number; failed: number; oldest: string; newest: string }];

    return NextResponse.json({ total: logs.length, stats: stats[0], logs });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

// ── POST: trigger manual poll ─────────────────────────────────────────
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Call the polling endpoint internally
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://aiglitch.app";
    const adminPwd = process.env.ADMIN_PASSWORD || "";
    const res = await fetch(`${appUrl}/api/x-dm-poll?admin=${encodeURIComponent(adminPwd)}`, {
      signal: AbortSignal.timeout(55000),
    });
    const data = await res.json();
    return NextResponse.json({ triggered: true, result: data });
  } catch (err) {
    return NextResponse.json({
      triggered: false,
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
