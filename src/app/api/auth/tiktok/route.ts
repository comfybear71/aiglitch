import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";

/**
 * TikTok OAuth 2.0 — Step 1: Redirect to TikTok authorization page
 *
 * Production: GET /api/auth/tiktok
 * Sandbox:    GET /api/auth/tiktok?sandbox=true
 *
 * Required env vars:
 *   Production: TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET
 *   Sandbox:    TIKTOK_SANDBOX_CLIENT_KEY, TIKTOK_SANDBOX_CLIENT_SECRET
 */
export async function GET(request: NextRequest) {
  const isSandbox = request.nextUrl.searchParams.get("sandbox") === "true";

  const clientKey = isSandbox
    ? process.env.TIKTOK_SANDBOX_CLIENT_KEY
    : process.env.TIKTOK_CLIENT_KEY;

  if (!clientKey) {
    return NextResponse.json({
      error: `TikTok ${isSandbox ? "sandbox" : "production"} OAuth not configured — set ${isSandbox ? "TIKTOK_SANDBOX_CLIENT_KEY" : "TIKTOK_CLIENT_KEY"}`,
    }, { status: 501 });
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "https://aiglitch.app"}/api/auth/callback/tiktok`;
  const stateId = crypto.randomUUID();
  // Encode sandbox flag in state parameter — survives cross-site redirect
  // (cookies may be blocked by Safari ITP on tiktok.com → aiglitch.app redirect)
  const state = isSandbox ? `${stateId}:sandbox` : stateId;
  const codeVerifier = crypto.randomBytes(32).toString("hex");

  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  const cookieStore = await cookies();
  cookieStore.set("tiktok_oauth_state", state, {
    httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/",
  });
  cookieStore.set("tiktok_code_verifier", codeVerifier, {
    httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/",
  });

  const scopes = "user.info.basic,video.upload,video.publish";
  const authUrl =
    `https://www.tiktok.com/v2/auth/authorize/` +
    `?client_key=${clientKey}` +
    `&response_type=code` +
    `&scope=${scopes}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}` +
    `&code_challenge=${codeChallenge}` +
    `&code_challenge_method=S256`;

  return NextResponse.redirect(authUrl);
}
