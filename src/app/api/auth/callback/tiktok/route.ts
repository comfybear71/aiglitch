import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

/**
 * TikTok OAuth 2.0 — Step 2: Exchange authorization code for access token
 * Saves the token into marketing_platform_accounts so the marketing system can post.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/admin/marketing?tiktok_error=${error}`, request.url));
  }
  if (!code) {
    return NextResponse.redirect(new URL("/admin/marketing?tiktok_error=no_code", request.url));
  }

  // Check if this was a sandbox auth
  const cookieStore2 = await cookies();
  const isSandbox = cookieStore2.get("tiktok_sandbox")?.value === "true";

  const clientKey = isSandbox
    ? process.env.TIKTOK_SANDBOX_CLIENT_KEY
    : process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = isSandbox
    ? process.env.TIKTOK_SANDBOX_CLIENT_SECRET
    : process.env.TIKTOK_CLIENT_SECRET;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "https://aiglitch.app"}/api/auth/callback/tiktok`;

  console.log(`[TikTok OAuth] Callback: ${isSandbox ? "SANDBOX" : "PRODUCTION"} mode`);

  if (!clientKey || !clientSecret) {
    return NextResponse.redirect(new URL(`/admin/marketing?tiktok_error=not_configured_${isSandbox ? "sandbox" : "production"}`, request.url));
  }

  // Verify state
  const cookieStore = await cookies();
  const savedState = cookieStore.get("tiktok_oauth_state")?.value;
  const codeVerifier = cookieStore.get("tiktok_code_verifier")?.value || "";

  if (state !== savedState) {
    return NextResponse.redirect(new URL("/admin/marketing?tiktok_error=state_mismatch", request.url));
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      console.error("[TikTok OAuth] Token exchange failed:", tokenData);
      return NextResponse.redirect(new URL(`/admin/marketing?tiktok_error=token_failed`, request.url));
    }

    const {
      access_token,
      refresh_token,
      expires_in,
      open_id,
    } = tokenData;

    // Fetch user info for display name
    let accountName = open_id || "tiktok_user";
    try {
      const userRes = await fetch(
        "https://open.tiktokapis.com/v2/user/info/?fields=display_name,username,avatar_url",
        { headers: { Authorization: `Bearer ${access_token}` } },
      );
      const userData = await userRes.json();
      const user = userData?.data?.user;
      if (user?.username) accountName = user.username;
      else if (user?.display_name) accountName = user.display_name;
    } catch {
      // Non-fatal — we still have the token
    }

    // Upsert into marketing_platform_accounts
    const sql = getDb();
    const expiresAt = expires_in
      ? new Date(Date.now() + expires_in * 1000).toISOString()
      : null;

    const existing = await sql`
      SELECT id FROM marketing_platform_accounts WHERE platform = 'tiktok' LIMIT 1
    `;

    const extraConfig = JSON.stringify({ sandbox: isSandbox });

    if (existing.length > 0) {
      await sql`
        UPDATE marketing_platform_accounts SET
          account_name = ${accountName},
          account_id = ${open_id || ""},
          access_token = ${access_token},
          refresh_token = ${refresh_token || ""},
          token_expires_at = ${expiresAt},
          extra_config = ${extraConfig},
          is_active = TRUE,
          updated_at = NOW()
        WHERE id = ${existing[0].id}
      `;
    } else {
      await sql`
        INSERT INTO marketing_platform_accounts (id, platform, account_name, account_id, access_token, refresh_token, token_expires_at, extra_config, is_active, created_at, updated_at)
        VALUES (${uuidv4()}, 'tiktok', ${accountName}, ${open_id || ""}, ${access_token}, ${refresh_token || ""}, ${expiresAt}, ${extraConfig}, TRUE, NOW(), NOW())
      `;
    }

    // Clear cookies
    cookieStore.delete("tiktok_oauth_state");
    cookieStore.delete("tiktok_code_verifier");

    const successPath = `/admin/marketing?tiktok_success=true&tiktok_mode=${isSandbox ? "sandbox" : "live"}`;
    return NextResponse.redirect(new URL(successPath, request.url));
  } catch (err) {
    console.error("[TikTok OAuth] Callback error:", err);
    return NextResponse.redirect(new URL("/admin/marketing?tiktok_error=oauth_failed", request.url));
  }
}
