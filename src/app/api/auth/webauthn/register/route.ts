import { NextRequest, NextResponse } from "next/server";
import { generateRegistrationOptions, verifyRegistrationResponse } from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/types";
import { isAdminAuthenticated, ADMIN_COOKIE } from "@/lib/admin-auth";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { v4 as uuidv4 } from "uuid";

const CHALLENGE_COOKIE = "webauthn-challenge";

function getRpInfo(request: NextRequest) {
  const host = request.headers.get("host") || "localhost";
  const rpID = host.split(":")[0]; // strip port
  const protocol = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https";
  const origin = `${protocol}://${host}`;
  return { rpID, rpName: "AIG!itch Admin", origin };
}

// GET — generate registration options (must be logged in as admin already)
export async function GET(request: NextRequest) {
  const isAdmin = await isAdminAuthenticated();
  if (!isAdmin) {
    return NextResponse.json({ error: "Must be logged in as admin first" }, { status: 401 });
  }

  const { rpID, rpName } = getRpInfo(request);

  const sql = getDb();
  await ensureDbReady();

  // Get existing credentials to exclude
  const existing = await sql`SELECT credential_id FROM webauthn_credentials` as unknown as { credential_id: string }[];

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: "admin",
    userDisplayName: "AIG!itch Admin",
    attestationType: "none",
    authenticatorSelection: {
      authenticatorAttachment: "platform", // built-in biometric only
      userVerification: "required",
      residentKey: "preferred",
    },
    excludeCredentials: existing.map((c) => ({
      id: c.credential_id,
      type: "public-key" as const,
      transports: ["internal"] as AuthenticatorTransportFuture[],
    })),
  });

  const response = NextResponse.json(options);
  // Store challenge in a cookie for verification
  response.cookies.set(CHALLENGE_COOKIE, options.challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 120, // 2 minutes
    path: "/",
  });

  return response;
}

// POST — verify registration and store credential
export async function POST(request: NextRequest) {
  const isAdmin = await isAdminAuthenticated();
  if (!isAdmin) {
    return NextResponse.json({ error: "Must be logged in as admin first" }, { status: 401 });
  }

  const challenge = request.cookies.get(CHALLENGE_COOKIE)?.value;
  if (!challenge) {
    return NextResponse.json({ error: "No challenge found — try again" }, { status: 400 });
  }

  const { rpID, origin } = getRpInfo(request);
  const body = await request.json();

  try {
    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: "Verification failed" }, { status: 400 });
    }

    const { credential, credentialDeviceType } = verification.registrationInfo;

    const sql = getDb();
    await ensureDbReady();

    // Store the credential
    const id = uuidv4();
    const credentialIdBase64 = Buffer.from(credential.id).toString("base64url");
    const publicKeyBase64 = Buffer.from(credential.publicKey).toString("base64url");

    await sql`
      INSERT INTO webauthn_credentials (id, credential_id, public_key, counter, device_name)
      VALUES (${id}, ${credentialIdBase64}, ${publicKeyBase64}, ${credential.counter}, ${credentialDeviceType || "platform"})
    `;

    const resp = NextResponse.json({ success: true });
    resp.cookies.delete(CHALLENGE_COOKIE);
    return resp;
  } catch (err) {
    console.error("WebAuthn registration error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Registration failed" }, { status: 400 });
  }
}
