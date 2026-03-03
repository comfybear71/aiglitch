import { NextRequest, NextResponse } from "next/server";
import { generateToken, ADMIN_COOKIE } from "@/lib/admin-auth";
import { env } from "@/lib/bible/env";

export async function POST(request: NextRequest) {
  const { password } = await request.json();

  if (password !== env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const token = generateToken(env.ADMIN_PASSWORD);
  const response = NextResponse.json({ success: true });
  response.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
  });

  return response;
}
