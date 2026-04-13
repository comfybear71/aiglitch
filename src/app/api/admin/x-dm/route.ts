import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { buildOAuth1Header, getAppCredentials } from "@/lib/marketing/oauth1";
import { env } from "@/lib/bible/env";

export const maxDuration = 30;

/**
 * Admin X DM Bot management endpoint.
 *
 * GET  — view DM logs + webhook registration status
 * POST — register/manage the X webhook for DM events
 *
 * Webhook registration flow:
 *   1. POST with action="register" → registers our webhook URL with X
 *   2. X sends a CRC challenge to /api/x/dm-webhook (handled there)
 *   3. POST with action="subscribe" → subscribes to DM events
 *   4. DMs now flow in real-time to /api/x/dm-webhook
 */

// ── GET: DM logs + status ─────────────────────────────────────────────
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  const action = request.nextUrl.searchParams.get("action");

  // Check webhook status
  if (action === "webhook_status") {
    const creds = getAppCredentials();
    if (!creds) return NextResponse.json({ error: "X credentials not configured" }, { status: 500 });

    try {
      const url = "https://api.x.com/1.1/account_activity/all/webhooks.json";
      const authHeader = buildOAuth1Header("GET", url, creds);
      const res = await fetch(url, {
        headers: { Authorization: authHeader },
        signal: AbortSignal.timeout(10000),
      });
      const data = await res.json();
      return NextResponse.json({ webhooks: data });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }

  // Default: return recent DM logs
  try {
    await sql`CREATE TABLE IF NOT EXISTS x_dm_logs (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      sender_id TEXT NOT NULL,
      sender_username TEXT,
      message_text TEXT NOT NULL,
      bot_reply TEXT,
      dm_event_id TEXT,
      status TEXT NOT NULL DEFAULT 'received',
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`.catch(() => {});

    const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") || "50"), 200);
    const logs = await sql`
      SELECT * FROM x_dm_logs ORDER BY created_at DESC LIMIT ${limit}
    `;
    return NextResponse.json({ total: logs.length, logs });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

// ── POST: webhook registration + subscription ─────────────────────────
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const action = body.action as string;
  const creds = getAppCredentials();
  const appUrl = env.NEXT_PUBLIC_APP_URL;

  if (!creds) {
    return NextResponse.json({ error: "X OAuth credentials not configured" }, { status: 500 });
  }

  if (!appUrl) {
    return NextResponse.json({ error: "NEXT_PUBLIC_APP_URL not set" }, { status: 500 });
  }

  // ── Register webhook URL with X ──
  if (action === "register") {
    const webhookUrl = `${appUrl}/api/x/dm-webhook`;
    const url = "https://api.x.com/1.1/account_activity/all/prod/webhooks.json";

    const authHeader = buildOAuth1Header("POST", url, creds, {
      url: webhookUrl,
    });

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `url=${encodeURIComponent(webhookUrl)}`,
        signal: AbortSignal.timeout(15000),
      });
      const data = await res.json();

      if (res.ok) {
        return NextResponse.json({
          success: true,
          message: `Webhook registered: ${webhookUrl}`,
          webhook: data,
        });
      } else {
        return NextResponse.json({
          success: false,
          error: data.errors?.[0]?.message || data.detail || `HTTP ${res.status}`,
          raw: data,
        }, { status: res.status });
      }
    } catch (err) {
      return NextResponse.json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }, { status: 500 });
    }
  }

  // ── Subscribe to DM events ──
  if (action === "subscribe") {
    const url = "https://api.x.com/1.1/account_activity/all/prod/subscriptions.json";
    const authHeader = buildOAuth1Header("POST", url, creds);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: authHeader },
        signal: AbortSignal.timeout(15000),
      });

      if (res.status === 204 || res.ok) {
        return NextResponse.json({
          success: true,
          message: "Subscribed to DM events for @spiritary",
        });
      } else {
        const data = await res.json().catch(() => ({}));
        return NextResponse.json({
          success: false,
          error: data.errors?.[0]?.message || data.detail || `HTTP ${res.status}`,
          raw: data,
        }, { status: res.status });
      }
    } catch (err) {
      return NextResponse.json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }, { status: 500 });
    }
  }

  // ── Trigger CRC challenge validation ──
  if (action === "trigger_crc") {
    const webhookId = body.webhook_id as string;
    if (!webhookId) {
      return NextResponse.json({ error: "webhook_id required" }, { status: 400 });
    }

    const url = `https://api.x.com/1.1/account_activity/all/prod/webhooks/${webhookId}.json`;
    const authHeader = buildOAuth1Header("PUT", url, creds);

    try {
      const res = await fetch(url, {
        method: "PUT",
        headers: { Authorization: authHeader },
        signal: AbortSignal.timeout(15000),
      });

      if (res.status === 204 || res.ok) {
        return NextResponse.json({ success: true, message: "CRC challenge triggered" });
      } else {
        const data = await res.json().catch(() => ({}));
        return NextResponse.json({
          success: false,
          error: data.errors?.[0]?.message || `HTTP ${res.status}`,
        }, { status: res.status });
      }
    } catch (err) {
      return NextResponse.json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Unknown action. Use: register, subscribe, trigger_crc" }, { status: 400 });
}
