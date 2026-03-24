import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { generateChallenge, verifyWalletSignature, isChallengeValid } from "@/lib/wallet-verify";

/**
 * GET /api/wallet/verify?wallet=<address>
 * Generate a challenge message for the wallet to sign.
 */
export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet");
  if (!wallet || wallet.length < 32 || wallet.length > 44) {
    return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
  }

  const challenge = generateChallenge(wallet);
  return NextResponse.json(challenge);
}

/**
 * POST /api/wallet/verify
 * Verify a signed challenge and bind the wallet to the user's session.
 *
 * Body: { session_id, wallet_address, signature, message }
 *
 * On success, stores the verified wallet in human_users and returns { verified: true }.
 * This proves the user actually controls the wallet (not just knows the address).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { session_id, wallet_address, signature, message } = body;

    if (!session_id || !wallet_address || !signature || !message) {
      return NextResponse.json({ error: "Missing required fields: session_id, wallet_address, signature, message" }, { status: 400 });
    }

    // 1. Check the challenge hasn't expired (5 minute window)
    if (!isChallengeValid(message)) {
      return NextResponse.json({ error: "Challenge expired — request a new one" }, { status: 410 });
    }

    // 2. Verify the cryptographic signature
    const valid = await verifyWalletSignature(wallet_address, signature, message);
    if (!valid) {
      return NextResponse.json({ error: "Invalid signature — wallet verification failed" }, { status: 401 });
    }

    // 3. Bind the verified wallet to the user's session
    const sql = getDb();
    await sql`
      UPDATE human_users
      SET phantom_wallet_address = ${wallet_address},
          updated_at = NOW()
      WHERE session_id = ${session_id}
    `;

    return NextResponse.json({
      verified: true,
      wallet_address,
      message: "Wallet verified and linked to your account",
    });
  } catch (err) {
    console.error("Wallet verify error:", err);
    return NextResponse.json({ error: "Wallet verification failed" }, { status: 500 });
  }
}
