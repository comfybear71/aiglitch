/**
 * Telegram Admin Notify Endpoint
 * ================================
 * POST /api/telegram/notify — Send an admin notification to the Telegram channel.
 *
 * Body: { title: string, message: string, severity?: "info" | "warning" | "critical" }
 *
 * Protected by admin auth (cookie or CRON_SECRET).
 */

import { NextRequest, NextResponse } from "next/server";
import { checkCronAuth } from "@/lib/cron-auth";
import { sendAdminAlert, sendTelegramMessage } from "@/lib/telegram";

export async function POST(request: NextRequest) {
  if (!(await checkCronAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { title, message, severity = "warning" } = body as {
      title?: string;
      message?: string;
      severity?: "info" | "warning" | "critical";
    };

    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    let result;
    if (title) {
      result = await sendAdminAlert(title, message, severity);
    } else {
      result = await sendTelegramMessage(message);
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
