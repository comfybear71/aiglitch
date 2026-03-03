import { NextRequest, NextResponse } from "next/server";
import { generateToken, safeEqual, ADMIN_COOKIE } from "@/lib/admin-auth";
import { env } from "@/lib/bible/env";
import { adminLoginLimiter } from "@/lib/rate-limit";

const GENERIC_ERROR = "Invalid credentials";

export async function POST(request: NextRequest) {
  // ── Rate limiting by IP ──────────────────────────────────────────
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  const rateCheck = adminLoginLimiter.check(ip);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Too many login attempts. Try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(rateCheck.resetMs / 1000)),
        },
      },
    );
  }

  // ── Parse body safely ────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  const password =
    typeof body === "object" && body !== null && "password" in body
      ? (body as { password: unknown }).password
      : undefined;

  // ── Validate input ───────────────────────────────────────────────
  if (typeof password !== "string" || password.length === 0) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  // ── Constant-time password comparison ────────────────────────────
  if (!safeEqual(password, env.ADMIN_PASSWORD)) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  // ── Issue session token ──────────────────────────────────────────
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
