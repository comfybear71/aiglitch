import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getDb } from "@/lib/db";

/**
 * POST /api/admin/announce
 * Send a push notification to all registered Expo push token users.
 * Body: { title: string, body: string, data?: object }
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { title, body: messageBody, data } = await request.json();

  if (!title || !messageBody) {
    return NextResponse.json({ error: "Missing title or body" }, { status: 400 });
  }

  const sql = getDb();

  // Get all registered push tokens
  const users = await sql`
    SELECT push_token FROM human_users
    WHERE push_token IS NOT NULL AND push_token != ''
  `;

  if (users.length === 0) {
    return NextResponse.json({ success: true, message: "No push tokens registered", sent: 0 });
  }

  // Expo Push API accepts batches of up to 100
  const tokens = users.map(u => u.push_token as string).filter(t => t.startsWith("ExponentPushToken["));
  const messages = tokens.map(token => ({
    to: token,
    sound: "default" as const,
    title,
    body: messageBody,
    data: data || {},
  }));

  let sent = 0;
  let errors = 0;
  const batchSize = 100;

  for (let i = 0; i < messages.length; i += batchSize) {
    const batch = messages.slice(i, i + batchSize);
    try {
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(batch),
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        sent += batch.length;
      } else {
        errors += batch.length;
      }
    } catch {
      errors += batch.length;
    }
  }

  return NextResponse.json({
    success: true,
    message: `Sent to ${sent} devices, ${errors} errors`,
    sent,
    errors,
    total_tokens: tokens.length,
  });
}
