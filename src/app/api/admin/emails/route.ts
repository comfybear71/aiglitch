import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { env } from "@/lib/bible/env";
import { v4 as uuidv4 } from "uuid";

export const maxDuration = 30;

/**
 * Persona email send endpoint (Phase 5.1 — admin-triggered only).
 *
 * Every persona has an implicit email address: <username>@aiglitch.app
 * The domain is verified on Resend, so any <anything>@aiglitch.app can
 * send mail. Receiving is handled separately via ImprovMX which forwards
 * incoming emails to the human admin.
 *
 * GET /api/admin/emails
 *   ?persona_id=X — list all emails sent by that persona
 *   (no param)    — list most recent emails across all personas (for log page)
 *   ?limit=N      — override default 100
 *
 * POST /api/admin/emails
 *   Body: { persona_id, to, subject, body }
 *   - Rate limit: 3 emails per persona per hour
 *   - Calls Resend API to send
 *   - Logs to email_sends table with status + resend_id
 *
 * Safety:
 *   - Admin-auth required on all endpoints
 *   - Rate limited per persona
 *   - Never exposes the Resend API key
 *   - Basic recipient sanity check (must look like an email)
 *   - Stores every send for audit trail
 */

const RATE_LIMIT_PER_HOUR = 3;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function ensureTable(): Promise<void> {
  const sql = getDb();
  await sql`CREATE TABLE IF NOT EXISTS email_sends (
    id TEXT PRIMARY KEY,
    persona_id TEXT NOT NULL,
    from_email TEXT NOT NULL,
    to_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    resend_id TEXT,
    status TEXT NOT NULL DEFAULT 'sent',
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`.catch(() => {});
}

// ── GET: list emails (per-persona or global log) ──
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureTable();
  const sql = getDb();

  const personaId = request.nextUrl.searchParams.get("persona_id");
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") || "100"), 500);

  if (personaId) {
    // Per-persona history
    const emails = await sql`
      SELECT e.id, e.persona_id, e.from_email, e.to_email, e.subject, e.body,
             e.resend_id, e.status, e.error, e.created_at,
             p.username, p.display_name, p.avatar_emoji
      FROM email_sends e
      JOIN ai_personas p ON p.id = e.persona_id
      WHERE e.persona_id = ${personaId}
      ORDER BY e.created_at DESC
      LIMIT ${limit}
    `;
    return NextResponse.json({ total: emails.length, emails });
  }

  // Global log (all personas)
  const emails = await sql`
    SELECT e.id, e.persona_id, e.from_email, e.to_email, e.subject, e.body,
           e.resend_id, e.status, e.error, e.created_at,
           p.username, p.display_name, p.avatar_emoji
    FROM email_sends e
    JOIN ai_personas p ON p.id = e.persona_id
    ORDER BY e.created_at DESC
    LIMIT ${limit}
  `;
  return NextResponse.json({ total: emails.length, emails });
}

// ── POST: send an email from a persona ──
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureTable();
  const sql = getDb();
  const body = await request.json().catch(() => ({}));
  const { persona_id, to, subject, body: emailBody } = body as {
    persona_id?: string;
    to?: string;
    subject?: string;
    body?: string;
  };

  // Validation
  if (!persona_id) return NextResponse.json({ error: "persona_id required" }, { status: 400 });
  if (!to) return NextResponse.json({ error: "to required" }, { status: 400 });
  if (!subject) return NextResponse.json({ error: "subject required" }, { status: 400 });
  if (!emailBody) return NextResponse.json({ error: "body required" }, { status: 400 });

  if (!EMAIL_REGEX.test(to)) {
    return NextResponse.json({ error: "Invalid recipient email address" }, { status: 400 });
  }

  if (!env.RESEND_API_KEY) {
    return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });
  }

  // Look up persona to verify it exists and get username for sender address
  const [persona] = await sql`
    SELECT id, username, display_name
    FROM ai_personas
    WHERE id = ${persona_id} AND is_active = TRUE
    LIMIT 1
  ` as unknown as [{ id: string; username: string; display_name: string } | undefined];

  if (!persona) {
    return NextResponse.json({ error: "Persona not found or inactive" }, { status: 404 });
  }

  // Rate limit: max 3 emails per persona per hour
  const [rateCheck] = await sql`
    SELECT COUNT(*)::int as c
    FROM email_sends
    WHERE persona_id = ${persona_id} AND created_at > NOW() - INTERVAL '1 hour'
  ` as unknown as [{ c: number }];

  if (rateCheck.c >= RATE_LIMIT_PER_HOUR) {
    return NextResponse.json({
      error: `Rate limit exceeded: ${persona.username} has already sent ${RATE_LIMIT_PER_HOUR} emails in the past hour. Try again later.`,
    }, { status: 429 });
  }

  // Build sender address from persona username (aiglitch.app domain is verified on Resend)
  const fromEmail = `${persona.username}@aiglitch.app`;
  const fromName = persona.display_name;
  const from = `${fromName} <${fromEmail}>`;

  // Call Resend API directly (no SDK needed — simple REST endpoint)
  let resendId: string | null = null;
  let status: "sent" | "failed" = "sent";
  let errorMsg: string | null = null;

  try {
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text: emailBody,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const resendData = await resendRes.json();

    if (resendRes.ok && resendData.id) {
      resendId = resendData.id;
    } else {
      status = "failed";
      errorMsg = resendData.message || resendData.error || `Resend HTTP ${resendRes.status}`;
    }
  } catch (err) {
    status = "failed";
    errorMsg = err instanceof Error ? err.message : String(err);
  }

  // Log the send regardless of success
  const id = uuidv4();
  await sql`
    INSERT INTO email_sends (id, persona_id, from_email, to_email, subject, body, resend_id, status, error, created_at)
    VALUES (${id}, ${persona_id}, ${fromEmail}, ${to}, ${subject}, ${emailBody}, ${resendId}, ${status}, ${errorMsg}, NOW())
  `;

  if (status === "failed") {
    return NextResponse.json({
      success: false,
      id,
      status: "failed",
      error: errorMsg,
    }, { status: 502 });
  }

  return NextResponse.json({
    success: true,
    id,
    status: "sent",
    from: fromEmail,
    to,
    subject,
    resend_id: resendId,
  });
}
