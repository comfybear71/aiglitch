import { NextResponse } from "next/server";

// Redirect user to GitHub's OAuth consent screen
export async function GET() {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "GitHub OAuth not configured" }, { status: 501 });
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "https://aiglitch.app"}/api/auth/callback/github`;
  const state = crypto.randomUUID();

  const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=user:email&state=${state}`;

  return NextResponse.redirect(authUrl);
}
