import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHmac } from "crypto";
import { PublicKey } from "@solana/web3.js";
import { cache } from "@/lib/cache";

// Challenge TTL: 5 minutes to scan QR and sign
const CHALLENGE_TTL = 300;
// Session TTL: 24 hours
const SESSION_TTL = 86400;
const CACHE_PREFIX = "wallet-auth:";
const SESSION_PREFIX = "wallet-session:";

/**
 * GET — Two modes:
 * 1. No params → Generate a new challenge (QR code flow)
 * 2. ?c={challengeId} → Poll challenge status (iPad waiting for iPhone signature)
 * 3. ?session={token} → Validate an existing session token
 */
export async function GET(request: NextRequest) {
  const challengeId = request.nextUrl.searchParams.get("c");
  const sessionToken = request.nextUrl.searchParams.get("session");

  // Mode 3: Validate existing session
  if (sessionToken) {
    const session = await cache.get(`${SESSION_PREFIX}${sessionToken}`) as { wallet: string; created: number } | null;
    if (session) {
      return NextResponse.json({ valid: true, wallet: session.wallet });
    }
    return NextResponse.json({ valid: false }, { status: 401 });
  }

  // Mode 2: Poll challenge status
  if (challengeId) {
    const challenge = await cache.get(`${CACHE_PREFIX}${challengeId}`) as {
      message: string;
      status: "pending" | "approved" | "rejected";
      sessionToken?: string;
      wallet?: string;
    } | null;

    if (!challenge) {
      return NextResponse.json({ status: "expired" });
    }

    if (challenge.status === "approved" && challenge.sessionToken) {
      return NextResponse.json({
        status: "approved",
        sessionToken: challenge.sessionToken,
        wallet: challenge.wallet,
      });
    }

    return NextResponse.json({ status: challenge.status });
  }

  // Mode 1: Generate new challenge
  const id = randomBytes(16).toString("hex");
  const nonce = randomBytes(32).toString("hex");
  const message = `AIG!itch Trading Access\n\nSign this message to authorize trading controls.\n\nChallenge: ${nonce}\nTimestamp: ${new Date().toISOString()}`;

  await cache.set(`${CACHE_PREFIX}${id}`, CHALLENGE_TTL, {
    message,
    nonce,
    status: "pending",
    created: Date.now(),
  });

  return NextResponse.json({
    challengeId: id,
    message,
  });
}

/**
 * POST — Submit a signed challenge (from iPhone/Phantom)
 * Body: { challengeId, signature, publicKey }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { challengeId, signature, publicKey } = body;

    if (!challengeId || !signature || !publicKey) {
      return NextResponse.json({ error: "Missing challengeId, signature, or publicKey" }, { status: 400 });
    }

    // Get the challenge
    const challenge = await cache.get(`${CACHE_PREFIX}${challengeId}`) as {
      message: string;
      nonce: string;
      status: string;
    } | null;

    if (!challenge) {
      return NextResponse.json({ error: "Challenge expired or not found" }, { status: 404 });
    }

    if (challenge.status !== "pending") {
      return NextResponse.json({ error: "Challenge already used" }, { status: 400 });
    }

    // Verify the public key matches the admin wallet
    const adminWallet = process.env.ADMIN_WALLET_PUBKEY || process.env.ADMIN_WALLET;
    if (!adminWallet) {
      return NextResponse.json({ error: "ADMIN_WALLET_PUBKEY not configured" }, { status: 500 });
    }

    // Check the signing wallet matches admin wallet
    if (publicKey !== adminWallet) {
      // Update challenge as rejected
      await cache.set(`${CACHE_PREFIX}${challengeId}`, CHALLENGE_TTL, {
        ...challenge,
        status: "rejected",
      });
      return NextResponse.json({ error: "Unauthorized wallet — not the admin wallet" }, { status: 403 });
    }

    // Verify the Ed25519 signature
    const isValid = await verifySignature(challenge.message, signature, publicKey);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }

    // Generate session token
    const sessionToken = createHmac("sha256", randomBytes(32))
      .update(`${publicKey}:${Date.now()}:${challenge.nonce}`)
      .digest("hex");

    // Store session
    await cache.set(`${SESSION_PREFIX}${sessionToken}`, SESSION_TTL, {
      wallet: publicKey,
      created: Date.now(),
    });

    // Update challenge as approved
    await cache.set(`${CACHE_PREFIX}${challengeId}`, CHALLENGE_TTL, {
      ...challenge,
      status: "approved",
      sessionToken,
      wallet: publicKey,
    });

    return NextResponse.json({
      ok: true,
      sessionToken,
      expiresIn: SESSION_TTL,
    });
  } catch (err) {
    console.error("[wallet-auth] POST error:", err);
    return NextResponse.json({ error: `Auth failed: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }
}

/**
 * PUT — Get challenge message for signing (used by the sign page on iPhone)
 * Body: { challengeId, action: "get_message" }
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { challengeId } = body;

    if (!challengeId) {
      return NextResponse.json({ error: "Missing challengeId" }, { status: 400 });
    }

    const challenge = await cache.get(`${CACHE_PREFIX}${challengeId}`) as {
      message: string;
      status: string;
    } | null;

    if (!challenge || challenge.status !== "pending") {
      return NextResponse.json({ error: "Challenge expired or already used" }, { status: 404 });
    }

    return NextResponse.json({ message: challenge.message });
  } catch (err) {
    console.error("[wallet-auth] PUT error:", err);
    return NextResponse.json({ error: "Failed to get challenge" }, { status: 500 });
  }
}

/**
 * Verify an Ed25519 signature from Phantom wallet.
 * Uses Node.js crypto module (Ed25519 support in Node 18+).
 */
async function verifySignature(message: string, signatureBase58: string, publicKeyBase58: string): Promise<boolean> {
  try {
    const bs58 = await import("bs58");
    const { createPublicKey, verify } = await import("crypto");
    const pubkey = new PublicKey(publicKeyBase58);
    const signatureBytes = bs58.default.decode(signatureBase58);
    const messageBytes = Buffer.from(message, "utf-8");

    // Convert raw Ed25519 public key to Node.js KeyObject
    // Ed25519 public keys are 32 bytes, need DER wrapping for Node crypto
    const pubkeyBytes = pubkey.toBytes();
    // DER prefix for Ed25519 public key (RFC 8410)
    const derPrefix = Buffer.from("302a300506032b6570032100", "hex");
    const derKey = Buffer.concat([derPrefix, pubkeyBytes]);

    const keyObj = createPublicKey({
      key: derKey,
      format: "der",
      type: "spki",
    });

    return verify(null, messageBytes, keyObj, signatureBytes);
  } catch (err) {
    console.error("[wallet-auth] Signature verification error:", err);
    return false;
  }
}
