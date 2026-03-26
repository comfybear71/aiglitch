import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";

async function ensureSponsorsTable() {
  const sql = getDb();
  await sql`CREATE TABLE IF NOT EXISTS sponsors (
    id SERIAL PRIMARY KEY,
    company_name VARCHAR(255) NOT NULL,
    contact_email VARCHAR(255) NOT NULL,
    contact_name VARCHAR(255),
    industry VARCHAR(100),
    website VARCHAR(500),
    status VARCHAR(50) NOT NULL DEFAULT 'inquiry',
    glitch_balance INTEGER NOT NULL DEFAULT 0,
    total_spent INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`.catch(() => {});
}

export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated(request)))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await ensureSponsorsTable();
    const sql = getDb();
    const status = request.nextUrl.searchParams.get("status");

    let sponsors;
    if (status) {
      sponsors = await sql`SELECT * FROM sponsors WHERE status = ${status} ORDER BY created_at DESC`;
    } else {
      sponsors = await sql`SELECT * FROM sponsors ORDER BY created_at DESC`;
    }

    return NextResponse.json({ sponsors });
  } catch (err) {
    console.error("[admin/sponsors] GET error:", err);
    return NextResponse.json({ error: `Failed to fetch sponsors: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated(request)))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await ensureSponsorsTable();
    const sql = getDb();
    const body = await request.json();
    const { company_name, contact_email, contact_name, industry, website, notes, status } = body;

    if (!company_name || !contact_email) {
      return NextResponse.json({ error: "company_name and contact_email are required" }, { status: 400 });
    }

    const result = await sql`
      INSERT INTO sponsors (company_name, contact_email, contact_name, industry, website, notes, status)
      VALUES (${company_name}, ${contact_email}, ${contact_name || null}, ${industry || null}, ${website || null}, ${notes || null}, ${status || "inquiry"})
      RETURNING id
    `;

    return NextResponse.json({ ok: true, id: result[0].id });
  } catch (err) {
    console.error("[admin/sponsors] POST error:", err);
    return NextResponse.json({ error: `Failed to create sponsor: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  if (!(await isAdminAuthenticated(request)))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await ensureSponsorsTable();
    const sql = getDb();
    const body = await request.json();
    const { id, company_name, contact_email, contact_name, industry, website, notes, status, glitch_balance } = body;

    if (!id) return NextResponse.json({ error: "Missing sponsor id" }, { status: 400 });

    await sql`
      UPDATE sponsors SET
        company_name = COALESCE(${company_name || null}, company_name),
        contact_email = COALESCE(${contact_email || null}, contact_email),
        contact_name = COALESCE(${contact_name || null}, contact_name),
        industry = COALESCE(${industry || null}, industry),
        website = COALESCE(${website || null}, website),
        notes = COALESCE(${notes || null}, notes),
        status = COALESCE(${status || null}, status),
        glitch_balance = COALESCE(${glitch_balance ?? null}, glitch_balance),
        updated_at = NOW()
      WHERE id = ${id}
    `;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/sponsors] PUT error:", err);
    return NextResponse.json({ error: "Failed to update sponsor" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!(await isAdminAuthenticated(request)))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await ensureSponsorsTable();
    const sql = getDb();
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    await sql`DELETE FROM sponsors WHERE id = ${parseInt(id)}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/sponsors] DELETE error:", err);
    return NextResponse.json({ error: "Failed to delete sponsor" }, { status: 500 });
  }
}
