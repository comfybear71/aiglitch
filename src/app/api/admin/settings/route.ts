import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getSetting, setSetting } from "@/lib/repositories/settings";

// GET: Read platform settings (admin only)
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const key = request.nextUrl.searchParams.get("key");

  if (key) {
    const value = await getSetting(key);
    return NextResponse.json({ key, value });
  }

  // Return all voice-related settings
  const voiceDisabled = await getSetting("voice_disabled");
  return NextResponse.json({
    voice_disabled: voiceDisabled === "true",
  });
}

// POST: Update platform settings (admin only)
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { key, value } = body;

  if (!key || value === undefined) {
    return NextResponse.json({ error: "Missing key or value" }, { status: 400 });
  }

  // Whitelist allowed setting keys
  const allowedKeys = ["voice_disabled"];
  if (!allowedKeys.includes(key)) {
    return NextResponse.json({ error: "Setting not allowed" }, { status: 400 });
  }

  await setSetting(key, String(value));
  return NextResponse.json({ success: true, key, value: String(value) });
}
