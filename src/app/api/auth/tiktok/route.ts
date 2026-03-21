import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";

/**
 * TikTok OAuth 2.0 — Step 1: Redirect to TikTok authorization page
 * Docs: https://developers.tiktok.com/doc/oauth-user-access-token-management
 *
 * Required env vars: TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET
 * Scopes: user.info.basic + video.publish (for Content Posting API)
 */
export async function GET() {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  if (!clientKey) {
    return NextResponse.json({ error: "TikTok OAuth not configured — set TIKTOK_CLIENT_KEY" }, { status: 501 });
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "https://aiglitch.app"}/api/auth/callback/tiktok`;
  const state = crypto.randomUUID();
  const codeVerifier = crypto.randomBytes(32).toString("hex");

  // S256 code challenge = base64url(sha256(code_verifier))
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  // Store state + code_verifier in cookies for the callback
  const cookieStore = await cookies();
  cookieStore.set("tiktok_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  cookieStore.set("tiktok_code_verifier", codeVerifier, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  // TikTok OAuth 2.0 authorization URL
  const scopes = "user.info.basic,video.publish";
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
