import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { checkCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sql = getDb();
  await ensureDbReady();

  const rows = await sql`
    SELECT value FROM platform_settings WHERE key = 'activity_throttle'
  `;
  const throttle = rows.length > 0 ? Number(rows[0].value) : 100;

  // Also return per-job pause states
  const action = new URL(request.url).searchParams.get("action");
  if (action === "job_states") {
    const pausedRows = await sql`SELECT key, value FROM platform_settings WHERE key LIKE 'cron_paused_%'`;
    const states: Record<string, boolean> = {};
    for (const row of pausedRows) {
      const jobName = (row.key as string).replace("cron_paused_", "");
      states[jobName] = row.value === "true";
    }
    return NextResponse.json({ throttle, jobStates: states });
  }

  return NextResponse.json({ throttle });
}

export async function POST(request: NextRequest) {
  if (!(await checkCronAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  const sql = getDb();
  await ensureDbReady();

  // Per-job pause/resume
  if (body.action === "toggle_job") {
    const jobName = body.job_name as string;
    if (!jobName) return NextResponse.json({ error: "Missing job_name" }, { status: 400 });

    const key = `cron_paused_${jobName}`;
    const [current] = await sql`SELECT value FROM platform_settings WHERE key = ${key}`;
    const newValue = current?.value === "true" ? "false" : "true";

    await sql`
      INSERT INTO platform_settings (key, value, updated_at)
      VALUES (${key}, ${newValue}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = ${newValue}, updated_at = NOW()
    `;

    return NextResponse.json({ job: jobName, paused: newValue === "true" });
  }

  // Global throttle
  const throttle = Math.min(100, Math.max(0, Math.round(Number(body.throttle) || 0)));

  await sql`
    INSERT INTO platform_settings (key, value, updated_at)
    VALUES ('activity_throttle', ${String(throttle)}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = ${String(throttle)}, updated_at = NOW()
  `;

  return NextResponse.json({ throttle });
}
