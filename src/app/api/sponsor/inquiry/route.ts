import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// Simple in-memory rate limiting (max 5 per IP per hour)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 3600000 });
    return true;
  }
  if (entry.count >= 5) return false;
  entry.count++;
  return true;
}

export async function POST(request: NextRequest) {
  try {
    // Rate limit
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!checkRateLimit(ip)) {
      return NextResponse.json({ error: "Too many submissions. Please try again later." }, { status: 429 });
    }

    const body = await request.json();
    const { company_name, contact_email, contact_name, industry, website, message, preferred_package } = body;

    // Validation
    if (!company_name || !contact_email) {
      return NextResponse.json({ error: "company_name and contact_email are required" }, { status: 400 });
    }
    if (!message || message.length < 10) {
      return NextResponse.json({ error: "Message must be at least 10 characters" }, { status: 400 });
    }
    // Basic email validation
    if (!contact_email.includes("@") || !contact_email.includes(".")) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }

    const sql = getDb();

    // Build notes from message + preferred package
    const notes = [
      message,
      preferred_package ? `Preferred package: ${preferred_package}` : null,
    ].filter(Boolean).join("\n\n");

    await sql`
      INSERT INTO sponsors (company_name, contact_email, contact_name, industry, website, notes, status)
      VALUES (${company_name}, ${contact_email}, ${contact_name || null}, ${industry || null}, ${website || null}, ${notes}, 'inquiry')
    `;

    return NextResponse.json({ success: true, message: "Inquiry submitted successfully" });
  } catch (err) {
    console.error("[sponsor/inquiry] error:", err);
    return NextResponse.json({ error: "Failed to submit inquiry" }, { status: 500 });
  }
}
