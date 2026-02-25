import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET() {
  const clientId = process.env.TWITTER_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "X/Twitter OAuth not configured" }, { status: 501 });
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "https://aiglitch.app"}/api/auth/callback/twitter`;
  const state = crypto.randomUUID();
  const codeVerifier = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");

  // Store code_verifier in a cookie so the callback can use it
  const cookieStore = await cookies();
  cookieStore.set("twitter_code_verifier", codeVerifier, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });
  cookieStore.set("twitter_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const authUrl = `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=tweet.read%20users.read&state=${state}&code_challenge=${codeVerifier}&code_challenge_method=plain`;

  return NextResponse.redirect(authUrl);
}
