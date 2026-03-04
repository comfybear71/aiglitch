import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { v4 as uuidv4 } from "uuid";
import { buildOAuth1Header } from "@/lib/marketing/oauth1";

/**
 * OAuth 1.0a — Step 3: Exchange the verifier for an access token, then create/update user.
 */
export async function GET(request: NextRequest) {
  const oauthToken = request.nextUrl.searchParams.get("oauth_token");
  const oauthVerifier = request.nextUrl.searchParams.get("oauth_verifier");

  // User denied authorization
  const denied = request.nextUrl.searchParams.get("denied");
  if (denied) {
    return NextResponse.redirect(new URL("/me?error=denied", request.url));
  }

  if (!oauthToken || !oauthVerifier) {
    return NextResponse.redirect(new URL("/me?error=no_token", request.url));
  }

  const consumerKey = process.env.X_CONSUMER_KEY;
  const consumerSecret = process.env.X_CONSUMER_SECRET;

  if (!consumerKey || !consumerSecret) {
    return NextResponse.redirect(new URL("/me?error=not_configured", request.url));
  }

  // Retrieve the request token secret from the cookie
  const cookieStore = await cookies();
  const tokenSecret = cookieStore.get("twitter_oauth_token_secret")?.value || "";

  try {
    // Exchange request token + verifier for access token
    const accessTokenUrl = "https://api.twitter.com/oauth/access_token";
    const authHeader = buildOAuth1Header("POST", accessTokenUrl, {
      consumerKey,
      consumerSecret,
      accessToken: oauthToken,
      accessTokenSecret: tokenSecret,
    }, {
      oauth_verifier: oauthVerifier,
    });

    const tokenRes = await fetch(accessTokenUrl, {
      method: "POST",
      headers: {
        Authorization: authHeader,
      },
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error("X access_token failed:", tokenRes.status, errBody);
      return NextResponse.redirect(new URL("/me?error=token_failed", request.url));
    }

    const body = await tokenRes.text();
    const params = new URLSearchParams(body);
    const userId = params.get("user_id");
    const screenName = params.get("screen_name");

    if (!userId || !screenName) {
      return NextResponse.redirect(new URL("/me?error=no_user", request.url));
    }

    // Clear the cookie
    cookieStore.delete("twitter_oauth_token_secret");

    const sql = getDb();
    await ensureDbReady();

    const xUsername = screenName.toLowerCase();
    const name = screenName;

    // Find by username pattern for X users
    const existing = await sql`
      SELECT id, session_id, username FROM human_users WHERE username = ${xUsername} AND auth_provider = 'twitter'
    `;

    let sessionId: string;
    let username: string;

    if (existing.length > 0) {
      sessionId = existing[0].session_id as string;
      username = existing[0].username as string;
      await sql`
        UPDATE human_users SET
          display_name = ${name},
          avatar_emoji = '🐦',
          last_seen = NOW()
        WHERE id = ${existing[0].id}
      `;
    } else {
      sessionId = uuidv4();
      username = xUsername.replace(/[^a-z0-9_]/gi, "").toLowerCase().slice(0, 20);

      const usernameTaken = await sql`SELECT id FROM human_users WHERE username = ${username}`;
      if (usernameTaken.length > 0) {
        username = `${username}_${Math.floor(Math.random() * 999)}`;
      }

      await sql`
        INSERT INTO human_users (id, session_id, display_name, username, avatar_emoji, auth_provider, last_seen)
        VALUES (${uuidv4()}, ${sessionId}, ${name}, ${username}, '🐦', 'twitter', NOW())
      `;
    }

    const redirectUrl = new URL("/me", request.url);
    redirectUrl.searchParams.set("oauth_session", sessionId);
    redirectUrl.searchParams.set("oauth_username", username);
    redirectUrl.searchParams.set("oauth_provider", "twitter");

    return NextResponse.redirect(redirectUrl);
  } catch (err) {
    console.error("X/Twitter OAuth callback error:", err);
    return NextResponse.redirect(new URL("/me?error=oauth_failed", request.url));
  }
}
