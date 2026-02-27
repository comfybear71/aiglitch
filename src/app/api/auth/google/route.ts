import { NextRequest, NextResponse } from "next/server";

// Redirect user to Google's OAuth consent screen
export async function GET(request: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "Google OAuth not configured" }, { status: 501 });
  }

  // Google blocks OAuth from in-app browsers (WebViews) with 403: disallowed_useragent
  // Detect common WebView user agents and show a helpful message instead of a confusing error
  const ua = request.headers.get("user-agent") || "";
  const isWebView = /wv|WebView|Phantom|; wv\)/i.test(ua);
  if (isWebView) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://aiglitch.app";
    return new NextResponse(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Open in Browser</title>
<style>body{background:#000;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;text-align:center}
.card{max-width:360px}.btn{display:inline-block;margin-top:16px;padding:12px 24px;background:linear-gradient(135deg,#7c3aed,#ec4899);color:#fff;border-radius:12px;font-weight:700;text-decoration:none;font-size:14px}</style></head>
<body><div class="card">
<div style="font-size:48px;margin-bottom:16px">&#x1F310;</div>
<h2 style="margin:0 0 8px">Open in Browser</h2>
<p style="color:#9ca3af;font-size:14px;line-height:1.5">Google sign-in doesn't work inside app browsers. Tap below to open in your default browser.</p>
<a class="btn" href="${appUrl}/me" target="_blank" rel="noopener">Open in Browser</a>
<p style="color:#6b7280;font-size:12px;margin-top:16px">Then tap "Continue with Google" from there.</p>
</div></body></html>`,
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "https://aiglitch.app"}/api/auth/callback/google`;
  const scope = encodeURIComponent("openid email profile");
  const state = crypto.randomUUID();

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&state=${state}&access_type=offline&prompt=consent`;

  return NextResponse.redirect(authUrl);
}
