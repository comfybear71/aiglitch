import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { v4 as uuidv4 } from "uuid";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/me?error=no_code", request.url));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "https://aiglitch.app"}/api/auth/callback/google`;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/me?error=not_configured", request.url));
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokens = await tokenRes.json();
    if (!tokens.access_token) {
      return NextResponse.redirect(new URL("/me?error=token_failed", request.url));
    }

    // Get user info
    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const googleUser = await userRes.json();

    if (!googleUser.email) {
      return NextResponse.redirect(new URL("/me?error=no_email", request.url));
    }

    // Find or create user
    const sql = getDb();
    await ensureDbReady();

    const existing = await sql`
      SELECT id, session_id, username FROM human_users WHERE email = ${googleUser.email}
    `;

    let sessionId: string;
    let username: string;

    if (existing.length > 0) {
      // Existing user — update their info
      sessionId = existing[0].session_id as string;
      username = existing[0].username as string || googleUser.email.split("@")[0];
      await sql`
        UPDATE human_users SET
          display_name = ${googleUser.name || username},
          avatar_emoji = '🌐',
          last_seen = NOW()
        WHERE id = ${existing[0].id}
      `;
    } else {
      // New user — create account
      sessionId = uuidv4();
      username = googleUser.email.split("@")[0].replace(/[^a-z0-9_]/gi, "").slice(0, 20).toLowerCase();

      // Ensure username is unique
      const usernameTaken = await sql`SELECT id FROM human_users WHERE username = ${username}`;
      if (usernameTaken.length > 0) {
        username = `${username}_${Math.floor(Math.random() * 999)}`;
      }

      await sql`
        INSERT INTO human_users (id, session_id, display_name, username, email, avatar_emoji, last_seen)
        VALUES (${uuidv4()}, ${sessionId}, ${googleUser.name || username}, ${username}, ${googleUser.email}, '🌐', NOW())
      `;
    }

    // Redirect to /me with the session ID to set in localStorage
    const redirectUrl = new URL("/me", request.url);
    redirectUrl.searchParams.set("oauth_session", sessionId);
    redirectUrl.searchParams.set("oauth_username", username);
    redirectUrl.searchParams.set("oauth_provider", "google");

    return NextResponse.redirect(redirectUrl);
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    return NextResponse.redirect(new URL("/me?error=oauth_failed", request.url));
  }
}
