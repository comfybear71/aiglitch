import { NextRequest, NextResponse } from "next/server";
import { generateAuthenticationOptions, verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/types";
import { generateToken, ADMIN_COOKIE } from "@/lib/admin-auth";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";

const CHALLENGE_COOKIE = "webauthn-challenge";

function getRpInfo(request: NextRequest) {
  const host = request.headers.get("host") || "localhost";
  const rpID = host.split(":")[0];
  const protocol = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https";
  const origin = `${protocol}://${host}`;
  return { rpID, origin };
}

// GET — generate authentication options (no login required)
export async function GET(request: NextRequest) {
  const sql = getDb();
  await ensureDbReady();

  // Check if any credentials exist
  const credentials = await sql`SELECT credential_id FROM webauthn_credentials` as unknown as { credential_id: string }[];

  if (credentials.length === 0) {
    return NextResponse.json({ available: false });
  }

  const { rpID } = getRpInfo(request);

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "required",
    allowCredentials: credentials.map((c) => ({
      id: c.credential_id,
      type: "public-key" as const,
      transports: ["internal"] as AuthenticatorTransportFuture[],
    })),
  });

  const response = NextResponse.json({ available: true, options });
  response.cookies.set(CHALLENGE_COOKIE, options.challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 120,
    path: "/",
  });

  return response;
}

// POST — verify authentication and set admin cookie
export async function POST(request: NextRequest) {
  const challenge = request.cookies.get(CHALLENGE_COOKIE)?.value;
  if (!challenge) {
    return NextResponse.json({ error: "No challenge found — try again" }, { status: 400 });
  }

  const { rpID, origin } = getRpInfo(request);
  const body = await request.json();

  const sql = getDb();
  await ensureDbReady();

  // Find the credential
  const credentialIdBase64 = body.id;
  const creds = await sql`
    SELECT * FROM webauthn_credentials WHERE credential_id = ${credentialIdBase64}
  ` as unknown as { id: string; credential_id: string; public_key: string; counter: number }[];

  if (creds.length === 0) {
    return NextResponse.json({ error: "Credential not found" }, { status: 400 });
  }

  const storedCred = creds[0];

  try {
    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: storedCred.credential_id,
        publicKey: new Uint8Array(Buffer.from(storedCred.public_key, "base64url")),
        counter: Number(storedCred.counter),
        transports: ["internal"] as AuthenticatorTransportFuture[],
      },
    });

    if (!verification.verified) {
      return NextResponse.json({ error: "Biometric verification failed" }, { status: 401 });
    }

    // Update counter
    await sql`
      UPDATE webauthn_credentials SET counter = ${verification.authenticationInfo.newCounter} WHERE id = ${storedCred.id}
    `;

    // Set admin cookie (same as password login)
    const adminPassword = process.env.ADMIN_PASSWORD || "aiglitch-admin-2024";
    const token = generateToken(adminPassword);
    const resp = NextResponse.json({ success: true });
    resp.cookies.set(ADMIN_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });
    resp.cookies.delete(CHALLENGE_COOKIE);

    return resp;
  } catch (err) {
    console.error("WebAuthn auth error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Authentication failed" }, { status: 400 });
  }
}
