import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { createHash } from "crypto";

/**
 * Verify a Solana wallet message signature.
 *
 * The client signs a challenge message using Phantom's `signMessage()`,
 * then sends { wallet, signature, message } to the server.
 * This function verifies the signature was produced by the claimed wallet.
 */
export async function verifyWalletSignature(
  walletAddress: string,
  signatureBase58: string,
  message: string,
): Promise<boolean> {
  try {
    // Validate the wallet address is a valid Solana public key
    const publicKey = new PublicKey(walletAddress);
    if (!PublicKey.isOnCurve(publicKey)) return false;

    // Decode the bs58 signature
    const signature = bs58.decode(signatureBase58);
    if (signature.length !== 64) return false;

    // Encode the message as bytes (same as Phantom's signMessage)
    const messageBytes = new TextEncoder().encode(message);

    // Use Web Crypto API for Ed25519 verification (Node 20+)
    // Buffer.from() needed for TS 5.9 strict ArrayBuffer compatibility
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      Buffer.from(publicKey.toBytes()),
      { name: "Ed25519" },
      false,
      ["verify"],
    );

    return await crypto.subtle.verify("Ed25519", cryptoKey, Buffer.from(signature), Buffer.from(messageBytes));
  } catch {
    return false;
  }
}

/**
 * Generate a time-limited challenge message for wallet verification.
 * The message includes a nonce and timestamp to prevent replay attacks.
 *
 * Challenge format: "AIG!itch Wallet Verification\n\nNonce: <hash>\nTimestamp: <epoch>"
 */
export function generateChallenge(walletAddress: string): {
  message: string;
  nonce: string;
  expiresAt: number;
} {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = createHash("sha256")
    .update(`${walletAddress}:${timestamp}:${process.env.CRON_SECRET || "aiglitch-verify"}`)
    .digest("hex")
    .slice(0, 16);

  const expiresAt = timestamp + 300; // 5 minute validity

  const message = [
    "AIG!itch Wallet Verification",
    "",
    `Nonce: ${nonce}`,
    `Timestamp: ${timestamp}`,
    "",
    "Sign this message to verify you own this wallet.",
    "This does NOT trigger a blockchain transaction or cost any SOL.",
  ].join("\n");

  return { message, nonce, expiresAt };
}

/**
 * Validate that a challenge hasn't expired.
 * Extracts the timestamp from the signed message and checks it's within the window.
 */
export function isChallengeValid(message: string, maxAgeSeconds = 300): boolean {
  const match = message.match(/Timestamp: (\d+)/);
  if (!match) return false;

  const timestamp = parseInt(match[1], 10);
  const now = Math.floor(Date.now() / 1000);

  return now - timestamp <= maxAgeSeconds;
}
