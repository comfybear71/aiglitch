import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { buildOAuth1Header } from "@/lib/marketing/oauth1";

/**
 * OAuth 1.0a — Step 1: Obtain a request token and redirect user to X for authorization.
 * 3-legged flow: request_token → authorize → access_token
 */
export async function GET() {
  const consumerKey = (process.env.X_CONSUMER_KEY || "").trim();
  const consumerSecret = (process.env.X_CONSUMER_SECRET || "").trim();

  if (!consumerKey || !consumerSecret) {
    return NextResponse.json({ error: "X/Twitter OAuth not configured. Set X_CONSUMER_KEY and X_CONSUMER_SECRET." }, { status: 501 });
  }

  const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://aiglitch.app"}/api/auth/callback/twitter`;

  // Temporary debug: log key shapes to verify env vars are correct (no secrets exposed)
  console.log("OAuth debug:", {
    keyPrefix: consumerKey.slice(0, 4),
    keySuffix: consumerKey.slice(-4),
    keyLen: consumerKey.length,
    secretPrefix: consumerSecret.slice(0, 4),
    secretSuffix: consumerSecret.slice(-4),
    secretLen: consumerSecret.length,
    callbackUrl,
    keyHasWhitespace: consumerKey !== consumerKey.trim(),
    secretHasWhitespace: consumerSecret !== consumerSecret.trim(),
  });

  try {
    const requestTokenUrl = "https://api.twitter.com/oauth/request_token";
    const authHeader = buildOAuth1Header("POST", requestTokenUrl, {
      consumerKey,
      consumerSecret,
    }, {
      oauth_callback: callbackUrl,
    });

    const response = await fetch(requestTokenUrl, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("X request_token failed:", response.status, errBody);
      return NextResponse.json({ error: `X OAuth failed: ${response.status}` }, { status: 502 });
    }

    const body = await response.text();
    const params = new URLSearchParams(body);
    const oauthToken = params.get("oauth_token");
    const oauthTokenSecret = params.get("oauth_token_secret");

    if (!oauthToken || !oauthTokenSecret) {
      return NextResponse.json({ error: "X OAuth did not return request token" }, { status: 502 });
    }

    // Store the token secret in a cookie for the callback step
    const cookieStore = await cookies();
    cookieStore.set("twitter_oauth_token_secret", oauthTokenSecret, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 600, // 10 minutes
      path: "/",
    });

    // Redirect user to X authorization page
    const authUrl = `https://api.twitter.com/oauth/authorize?oauth_token=${oauthToken}`;
    return NextResponse.redirect(authUrl);
  } catch (err) {
    console.error("X OAuth initiation error:", err);
    return NextResponse.json({ error: "Failed to start X OAuth" }, { status: 500 });
  }
}
