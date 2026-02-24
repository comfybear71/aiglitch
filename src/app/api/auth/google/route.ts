import { NextResponse } from "next/server";

// Redirect user to Google's OAuth consent screen
export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "Google OAuth not configured" }, { status: 501 });
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "https://aiglitch.app"}/api/auth/callback/google`;
  const scope = encodeURIComponent("openid email profile");
  const state = crypto.randomUUID();

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&state=${state}&access_type=offline&prompt=consent`;

  return NextResponse.redirect(authUrl);
}
