import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { cache } from "@/lib/cache";

const CHALLENGE_TTL = 600; // 10 minutes
const CACHE_PREFIX = "public-wallet-auth:";

/**
 * Public Wallet QR Auth — for any user (not admin-only)
 *
 * GET — Generate challenge or poll status
 *   No params → generate new challenge
 *   ?c={id} → poll challenge status
 *
 * POST — Submit signed challenge from phone
 *   { challengeId, signature, publicKey }
 *   On success, returns wallet address for client to call wallet_login
 */
export async function GET(request: NextRequest) {
  const challengeId = request.nextUrl.searchParams.get("c");

  // Poll challenge status
  if (challengeId) {
    const challenge = await cache.get(`${CACHE_PREFIX}${challengeId}`) as {
      message: string;
      status: "pending" | "approved";
      wallet?: string;
    } | null;

    if (!challenge) {
      return NextResponse.json({ status: "expired" });
    }

    if (challenge.status === "approved" && challenge.wallet) {
      return NextResponse.json({ status: "approved", wallet: challenge.wallet });
    }

    // Return message so phone can sign the SAME challenge
    return NextResponse.json({ status: "pending", message: challenge.message });
  }

  // Generate new challenge
  const id = randomBytes(16).toString("hex");
  const nonce = randomBytes(32).toString("hex");
  const message = `Welcome to AIG!itch\n\nSign this message to connect your wallet.\n\nChallenge: ${nonce}\nTimestamp: ${new Date().toISOString()}`;

  await cache.set(`${CACHE_PREFIX}${id}`, CHALLENGE_TTL, {
    message,
    nonce,
    status: "pending",
    created: Date.now(),
  });

  return NextResponse.json({ challengeId: id, message });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { challengeId, signature, publicKey, action, originalChallengeId, wallet } = body;

    // Approve the original challenge (called from phone after fresh challenge is verified)
    if (action === "approve_original" && originalChallengeId && wallet) {
      const original = await cache.get(`${CACHE_PREFIX}${originalChallengeId}`) as Record<string, unknown> | null;
      if (original) {
        await cache.set(`${CACHE_PREFIX}${originalChallengeId}`, CHALLENGE_TTL, {
          ...original,
          status: "approved",
          wallet,
        });
      }
      return NextResponse.json({ success: true });
    }

    if (!challengeId || !signature || !publicKey) {
      return NextResponse.json({ error: "Missing challengeId, signature, or publicKey" }, { status: 400 });
    }

    const challenge = await cache.get(`${CACHE_PREFIX}${challengeId}`) as {
      message: string;
      nonce: string;
      status: string;
    } | null;

    if (!challenge) {
      return NextResponse.json({ error: "Challenge expired" }, { status: 404 });
    }

    if (challenge.status !== "pending") {
      return NextResponse.json({ error: "Challenge already used" }, { status: 400 });
    }

    // Verify Ed25519 signature
    const { PublicKey } = await import("@solana/web3.js");
    const crypto = await import("crypto");

    const pubKeyBytes = new PublicKey(publicKey).toBytes();
    const messageBytes = new TextEncoder().encode(challenge.message);
    const sigBytes = Buffer.from(signature, "base64");

    // DER-wrap the Ed25519 public key for Node.js crypto
    const derPrefix = Buffer.from("302a300506032b6570032100", "hex");
    const derKey = Buffer.concat([derPrefix, pubKeyBytes]);
    const keyObj = crypto.createPublicKey({ key: derKey, format: "der", type: "spki" });

    const isValid = crypto.verify(null, messageBytes, keyObj, sigBytes);

    if (!isValid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // Mark challenge as approved with wallet address
    await cache.set(`${CACHE_PREFIX}${challengeId}`, CHALLENGE_TTL, {
      ...challenge,
      status: "approved",
      wallet: publicKey,
    });

    return NextResponse.json({ success: true, wallet: publicKey });
  } catch (err) {
    console.error("[wallet-qr] Verification error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
