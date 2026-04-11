import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { v4 as uuidv4 } from "uuid";

export const maxDuration = 60;

/**
 * Contacts CRUD API — outreach list for persona email campaigns.
 *
 * Contacts have tags (grants, sponsors, media, darwin, journalists, etc.)
 * and can be assigned to a specific persona so only that persona can
 * reach out to them. Used by Phase 5.2b (Telegram chat-triggered outreach).
 *
 * GET /api/admin/contacts
 *   ?tag=<tag>               — filter by tag (case-insensitive substring match)
 *   ?search=<query>          — fuzzy search on name/email/company
 *   ?assigned_persona_id=X   — filter by assigned persona
 *   (no params)              — return all contacts ordered by created_at DESC
 *
 * POST /api/admin/contacts
 *   Body:
 *     { name, email, company?, tags?, assigned_persona_id?, notes? }
 *       — single add
 *     { bulk: "email1@x.com, Name\nemail2@y.com, Name, Company\n..." }
 *       — bulk CSV paste import (one contact per line,
 *         format: email[, name[, company]])
 *       — or just "email1@x.com\nemail2@x.com" for email-only
 *   Returns: { success, created: N, skipped: N, errors: [] }
 *
 * PATCH /api/admin/contacts
 *   Body: { id, ...fields }
 *   Updates the specified contact with any subset of fields
 *
 * DELETE /api/admin/contacts?id=X
 *   Deletes the contact by ID
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function ensureTable(): Promise<void> {
  const sql = getDb();
  await sql`CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    name TEXT,
    email TEXT NOT NULL,
    company TEXT,
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    assigned_persona_id TEXT,
    notes TEXT,
    last_emailed_at TIMESTAMPTZ,
    email_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`.catch(() => {});
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_email_unique ON contacts(LOWER(email))`.catch(() => {});
}

interface ContactRow {
  id: string;
  name: string | null;
  email: string;
  company: string | null;
  tags: string[];
  assigned_persona_id: string | null;
  notes: string | null;
  last_emailed_at: string | null;
  email_count: number;
  created_at: string;
  updated_at: string;
}

// ── GET: list + filter ──
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureTable();
  const sql = getDb();
  const tag = request.nextUrl.searchParams.get("tag");
  const search = request.nextUrl.searchParams.get("search");
  const assignedPersonaId = request.nextUrl.searchParams.get("assigned_persona_id");

  let rows: ContactRow[];

  // Build query with optional filters. Using tagged template so the query
  // stays parameterised — using CASE-style sql mode for branching.
  if (assignedPersonaId) {
    rows = await sql`
      SELECT c.*,
             p.username as persona_username, p.display_name as persona_display_name, p.avatar_emoji as persona_avatar
      FROM contacts c
      LEFT JOIN ai_personas p ON p.id = c.assigned_persona_id
      WHERE c.assigned_persona_id = ${assignedPersonaId}
      ORDER BY c.created_at DESC
    ` as unknown as ContactRow[];
  } else if (tag) {
    rows = await sql`
      SELECT c.*,
             p.username as persona_username, p.display_name as persona_display_name, p.avatar_emoji as persona_avatar
      FROM contacts c
      LEFT JOIN ai_personas p ON p.id = c.assigned_persona_id
      WHERE c.tags @> ${JSON.stringify([tag])}::jsonb
      ORDER BY c.created_at DESC
    ` as unknown as ContactRow[];
  } else if (search) {
    const q = `%${search.toLowerCase()}%`;
    rows = await sql`
      SELECT c.*,
             p.username as persona_username, p.display_name as persona_display_name, p.avatar_emoji as persona_avatar
      FROM contacts c
      LEFT JOIN ai_personas p ON p.id = c.assigned_persona_id
      WHERE LOWER(c.email) LIKE ${q}
         OR LOWER(COALESCE(c.name, '')) LIKE ${q}
         OR LOWER(COALESCE(c.company, '')) LIKE ${q}
      ORDER BY c.created_at DESC
    ` as unknown as ContactRow[];
  } else {
    rows = await sql`
      SELECT c.*,
             p.username as persona_username, p.display_name as persona_display_name, p.avatar_emoji as persona_avatar
      FROM contacts c
      LEFT JOIN ai_personas p ON p.id = c.assigned_persona_id
      ORDER BY c.created_at DESC
    ` as unknown as ContactRow[];
  }

  // Extract all unique tags across all contacts for the filter dropdown
  const allTags = new Set<string>();
  for (const row of rows) {
    const tagList = Array.isArray(row.tags) ? row.tags : [];
    for (const t of tagList) allTags.add(t);
  }

  return NextResponse.json({
    total: rows.length,
    contacts: rows,
    all_tags: Array.from(allTags).sort(),
  });
}

// ── POST: create (single or bulk) ──
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureTable();
  const sql = getDb();
  const body = await request.json().catch(() => ({}));

  // ── Bulk CSV paste mode ──
  if (body.bulk && typeof body.bulk === "string") {
    const lines = body.bulk.split("\n").map((l: string) => l.trim()).filter(Boolean);
    const defaultTags: string[] = Array.isArray(body.default_tags) ? body.default_tags : [];
    const defaultPersonaId = body.default_assigned_persona_id || null;

    let created = 0;
    let skipped = 0;
    const errors: { line: string; reason: string }[] = [];

    for (const line of lines) {
      const parts = line.split(",").map((p: string) => p.trim());
      const email = parts[0];
      const name = parts[1] || null;
      const company = parts[2] || null;

      if (!email || !EMAIL_REGEX.test(email)) {
        errors.push({ line, reason: "Invalid email" });
        continue;
      }

      try {
        const id = uuidv4();
        const result = await sql`
          INSERT INTO contacts (id, name, email, company, tags, assigned_persona_id, notes, created_at, updated_at)
          VALUES (${id}, ${name}, ${email}, ${company}, ${JSON.stringify(defaultTags)}::jsonb, ${defaultPersonaId}, NULL, NOW(), NOW())
          ON CONFLICT (LOWER(email)) DO NOTHING
          RETURNING id
        `;
        if ((result as unknown as { id: string }[]).length > 0) {
          created++;
        } else {
          skipped++;
        }
      } catch (err) {
        errors.push({ line, reason: err instanceof Error ? err.message : String(err) });
      }
    }

    return NextResponse.json({
      success: true,
      mode: "bulk",
      created,
      skipped,
      errors_count: errors.length,
      errors: errors.slice(0, 20),
    });
  }

  // ── Single contact mode ──
  const { name, email, company, tags, assigned_persona_id, notes } = body;

  if (!email || !EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  const tagsArray: string[] = Array.isArray(tags) ? tags : [];
  const id = uuidv4();

  try {
    await sql`
      INSERT INTO contacts (id, name, email, company, tags, assigned_persona_id, notes, created_at, updated_at)
      VALUES (${id}, ${name || null}, ${email}, ${company || null}, ${JSON.stringify(tagsArray)}::jsonb, ${assigned_persona_id || null}, ${notes || null}, NOW(), NOW())
    `;
    return NextResponse.json({ success: true, id, email });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return NextResponse.json({
        error: "A contact with this email already exists",
      }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── PATCH: update existing contact ──
export async function PATCH(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureTable();
  const sql = getDb();
  const body = await request.json().catch(() => ({}));
  const { id, name, email, company, tags, assigned_persona_id, notes } = body;

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  if (email && !EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  // Build a single UPDATE with COALESCE so only provided fields are changed
  const tagsArray = Array.isArray(tags) ? tags : undefined;

  try {
    await sql`
      UPDATE contacts
      SET name = COALESCE(${name ?? null}, name),
          email = COALESCE(${email ?? null}, email),
          company = COALESCE(${company ?? null}, company),
          tags = COALESCE(${tagsArray !== undefined ? JSON.stringify(tagsArray) : null}::jsonb, tags),
          assigned_persona_id = COALESCE(${assigned_persona_id ?? null}, assigned_persona_id),
          notes = COALESCE(${notes ?? null}, notes),
          updated_at = NOW()
      WHERE id = ${id}
    `;
    return NextResponse.json({ success: true, id });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

// ── DELETE: remove contact by ID ──
export async function DELETE(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureTable();
  const sql = getDb();
  const id = request.nextUrl.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  await sql`DELETE FROM contacts WHERE id = ${id}`;
  return NextResponse.json({ success: true, id });
}
