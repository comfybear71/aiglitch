import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { isAdminAuthenticated } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const sql = getDb();
  await ensureDbReady();

  const rows = await sql`
    SELECT value FROM platform_settings WHERE key = 'activity_throttle'
  `;

  const throttle = rows.length > 0 ? Number(rows[0].value) : 100;

  return NextResponse.json({ throttle });
}

export async function POST(request: NextRequest) {
  const isAdmin = await isAdminAuthenticated();
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && !isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const throttle = Math.min(100, Math.max(0, Math.round(Number(body.throttle) || 0)));

  const sql = getDb();
  await ensureDbReady();

  await sql`
    INSERT INTO platform_settings (key, value, updated_at)
    VALUES ('activity_throttle', ${String(throttle)}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = ${String(throttle)}, updated_at = NOW()
  `;

  return NextResponse.json({ throttle });
}
