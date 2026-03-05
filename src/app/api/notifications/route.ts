import { NextRequest, NextResponse } from "next/server";
import { notifications } from "@/lib/repositories";
import { ensureDbReady } from "@/lib/seed";

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "session_id required" }, { status: 400 });
  }

  await ensureDbReady();

  const countOnly = request.nextUrl.searchParams.get("count") === "1";
  if (countOnly) {
    const unread = await notifications.getUnreadCount(sessionId);
    return NextResponse.json({ unread });
  }

  try {
    const result = await notifications.list(sessionId);
    return NextResponse.json(result);
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

  await ensureDbReady();

  try {
    if (action === "mark_all_read") {
      await notifications.markAllRead(session_id);
    } else if (action === "mark_read" && notification_id) {
      await notifications.markRead(session_id, notification_id);
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
