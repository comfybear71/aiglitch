import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { v4 as uuidv4 } from "uuid";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/me?error=no_code", request.url));
  }

  const clientId = process.env.FACEBOOK_CLIENT_ID;
  const clientSecret = process.env.FACEBOOK_CLIENT_SECRET;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "https://aiglitch.app"}/api/auth/callback/facebook`;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/me?error=not_configured", request.url));
  }

  try {
    const tokenRes = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${clientSecret}&code=${code}`
    );
    const tokens = await tokenRes.json();

    if (!tokens.access_token) {
      return NextResponse.redirect(new URL("/me?error=token_failed", request.url));
    }

    const userRes = await fetch(
      `https://graph.facebook.com/me?fields=id,name,email&access_token=${tokens.access_token}`
    );
    const fbUser = await userRes.json();

    const email = fbUser.email;
    const name = fbUser.name || "Facebook User";

    const sql = getDb();
    await ensureDbReady();

    const existing = email
      ? await sql`SELECT id, session_id, username FROM human_users WHERE email = ${email}`
      : [];

    let sessionId: string;
    let username: string;

    if (existing.length > 0) {
      sessionId = existing[0].session_id as string;
      username = existing[0].username as string || name.replace(/[^a-z0-9_]/gi, "").toLowerCase().slice(0, 20);
      await sql`
        UPDATE human_users SET
          display_name = ${name},
          avatar_emoji = '📘',
          auth_provider = 'facebook',
          last_seen = NOW()
        WHERE id = ${existing[0].id}
      `;
    } else {
      sessionId = uuidv4();
      username = name.replace(/[^a-z0-9_]/gi, "").toLowerCase().slice(0, 20) || `fb_${Math.floor(Math.random() * 9999)}`;

      const usernameTaken = await sql`SELECT id FROM human_users WHERE username = ${username}`;
      if (usernameTaken.length > 0) {
        username = `${username}_${Math.floor(Math.random() * 999)}`;
      }

      await sql`
        INSERT INTO human_users (id, session_id, display_name, username, email, avatar_emoji, auth_provider, last_seen)
        VALUES (${uuidv4()}, ${sessionId}, ${name}, ${username}, ${email || null}, '📘', 'facebook', NOW())
      `;
    }

    const redirectUrl = new URL("/me", request.url);
    redirectUrl.searchParams.set("oauth_session", sessionId);
    redirectUrl.searchParams.set("oauth_username", username);
    redirectUrl.searchParams.set("oauth_provider", "facebook");

    return NextResponse.redirect(redirectUrl);
  } catch (err) {
    console.error("Facebook OAuth callback error:", err);
    return NextResponse.redirect(new URL("/me?error=oauth_failed", request.url));
  }
}
