import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { cache } from "@/lib/cache";

const TX_TTL = 600; // 10 minutes
const CACHE_PREFIX = "sign-tx:";

/**
 * Cross-device transaction signing bridge (v2 — just-in-time tx creation).
 *
 * Flow:
 * 1. iPad POST { action: "create_intent", wallet, glitch_amount, description }
 *    → stores intent in Redis, returns { txId }
 * 2. iPad shows QR → phone opens /auth/sign-tx?t={txId}
 * 3. Phone POST { action: "build_and_sign", txId }
 *    → Server creates FRESH swap transaction (fresh blockhash)
 *    → Returns unsigned transaction for phone to sign
 * 4. Phone signs with Phantom → POST { action: "submit", txId, signed_transaction }
 *    → Server submits to Solana
 * 5. iPad polls GET ?t={txId}&poll=1 until done
 */

export async function GET(request: NextRequest) {
  const txId = request.nextUrl.searchParams.get("t");
  const poll = request.nextUrl.searchParams.get("poll");

  if (!txId) return NextResponse.json({ error: "Missing t parameter" }, { status: 400 });

  const data = await cache.get(`${CACHE_PREFIX}${txId}`) as Record<string, unknown> | null;
  if (!data) return NextResponse.json({ status: "expired" });

  if (poll === "1") {
    return NextResponse.json({ status: data.status, result: data.result });
  }

  // Phone requesting intent details
  return NextResponse.json({
    status: data.status,
    wallet: data.wallet,
    description: data.description,
    glitch_amount: data.glitch_amount,
    intent_type: data.intent_type,
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action } = body;

  // Step 1: iPad creates a swap INTENT (no transaction yet)
  if (action === "create_intent") {
    const { wallet, glitch_amount, description } = body;
    if (!wallet || !glitch_amount) {
      return NextResponse.json({ error: "wallet and glitch_amount required" }, { status: 400 });
    }

    const txId = randomBytes(16).toString("hex");
    await cache.set(`${CACHE_PREFIX}${txId}`, TX_TTL, {
      intent_type: "otc_swap",
      wallet,
      glitch_amount,
      description: description || `Buy ${glitch_amount.toLocaleString()} §GLITCH`,
      status: "pending",
    });

    return NextResponse.json({ txId });
  }

  // Step 3: Phone requests a FRESH transaction (just-in-time creation)
  if (action === "build_and_sign") {
    const { txId } = body;
    if (!txId) return NextResponse.json({ error: "txId required" }, { status: 400 });

    const data = await cache.get(`${CACHE_PREFIX}${txId}`) as Record<string, unknown> | null;
    if (!data) return NextResponse.json({ error: "Intent expired" }, { status: 404 });
    if (data.status !== "pending") return NextResponse.json({ error: "Already processed" }, { status: 400 });

    // Create fresh swap transaction via OTC endpoint
    const swapRes = await fetch(`${request.nextUrl.origin}/api/otc-swap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_swap",
        buyer_wallet: data.wallet,
        glitch_amount: data.glitch_amount,
      }),
    });
    const swapData = await swapRes.json();

    if (!swapRes.ok || !swapData.success) {
      await cache.set(`${CACHE_PREFIX}${txId}`, TX_TTL, { ...data, status: "failed", result: { error: swapData.error } });
      return NextResponse.json({ error: swapData.error || "Failed to create swap" }, { status: 400 });
    }

    // Store the swap_id so we can submit later
    await cache.set(`${CACHE_PREFIX}${txId}`, TX_TTL, {
      ...data,
      status: "ready_to_sign",
      swap_id: swapData.swap_id,
      transaction: swapData.transaction,
    });

    return NextResponse.json({
      success: true,
      transaction: swapData.transaction,
      swap_id: swapData.swap_id,
    });
  }

  // Step 4: Phone submits signed transaction
  if (action === "submit") {
    const { txId, signed_transaction } = body;
    if (!txId || !signed_transaction) {
      return NextResponse.json({ error: "txId and signed_transaction required" }, { status: 400 });
    }

    const data = await cache.get(`${CACHE_PREFIX}${txId}`) as Record<string, unknown> | null;
    if (!data) return NextResponse.json({ error: "Transaction expired" }, { status: 404 });

    const swapId = data.swap_id as string;
    if (!swapId) {
      return NextResponse.json({ error: "No swap_id — call build_and_sign first" }, { status: 400 });
    }

    try {
      const submitRes = await fetch(`${request.nextUrl.origin}/api/otc-swap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit_swap",
          swap_id: swapId,
          signed_transaction,
        }),
      });
      const submitData = await submitRes.json();

      await cache.set(`${CACHE_PREFIX}${txId}`, TX_TTL, {
        ...data,
        status: submitData.success ? "submitted" : "failed",
        result: submitData,
      });

      return NextResponse.json({ success: submitData.success, result: submitData });
    } catch (err) {
      await cache.set(`${CACHE_PREFIX}${txId}`, TX_TTL, {
        ...data,
        status: "failed",
        result: { error: String(err) },
      });
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
