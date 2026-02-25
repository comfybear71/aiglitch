import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { v4 as uuidv4 } from "uuid";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/me?error=no_code", request.url));
  }

  const clientId = process.env.TWITTER_CLIENT_ID;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "https://aiglitch.app"}/api/auth/callback/twitter`;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/me?error=not_configured", request.url));
  }

  try {
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const tokenRes = await fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code_verifier: "challenge",
      }),
    });

    const tokens = await tokenRes.json();
    if (!tokens.access_token) {
      return NextResponse.redirect(new URL("/me?error=token_failed", request.url));
    }

    const userRes = await fetch("https://api.twitter.com/2/users/me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userData = await userRes.json();
    const xUser = userData.data;

    if (!xUser) {
      return NextResponse.redirect(new URL("/me?error=no_user", request.url));
    }

    const sql = getDb();
    await ensureDbReady();

    const xUsername = xUser.username || `x_${Math.floor(Math.random() * 9999)}`;
    const name = xUser.name || xUsername;

    // Find by username pattern for X users (no email from X API v2 basic)
    const existing = await sql`
      SELECT id, session_id, username FROM human_users WHERE username = ${xUsername.toLowerCase()} AND auth_provider = 'twitter'
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
