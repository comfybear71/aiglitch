import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { cache } from "@/lib/cache";

const TX_TTL = 300; // 5 minutes to sign
const CACHE_PREFIX = "sign-tx:";

/**
 * Cross-device transaction signing bridge.
 *
 * Flow:
 * 1. iPad calls POST with { transaction (base64), wallet, description }
 *    → returns { txId } + stores in Redis
 * 2. iPad shows QR code → phone opens /auth/sign-tx?t={txId}
 * 3. Phone GETs the unsigned tx from this endpoint
 * 4. Phone signs with Phantom → POSTs signed tx back
 * 5. iPad polls GET ?t={txId}&poll=1 until signed
 *
 * GET ?t={txId} — get transaction details (for phone to sign)
 * GET ?t={txId}&poll=1 — poll status (for iPad to check if signed)
 * POST { action: "create", transaction, wallet, description } — create signing request
 * POST { action: "submit", txId, signed_transaction } — submit signed tx
 */

export async function GET(request: NextRequest) {
  const txId = request.nextUrl.searchParams.get("t");
  const poll = request.nextUrl.searchParams.get("poll");

  if (!txId) return NextResponse.json({ error: "Missing t parameter" }, { status: 400 });

  const data = await cache.get(`${CACHE_PREFIX}${txId}`) as {
    transaction: string;
    wallet: string;
    description: string;
    status: "pending" | "signed" | "submitted" | "failed";
    signed_transaction?: string;
    result?: Record<string, unknown>;
  } | null;

  if (!data) return NextResponse.json({ status: "expired" });

  if (poll === "1") {
    // iPad polling — return status + result when done
    return NextResponse.json({
      status: data.status,
      result: data.result,
    });
  }

  // Phone requesting tx details to sign
  return NextResponse.json({
    status: data.status,
    transaction: data.transaction,
    wallet: data.wallet,
    description: data.description,
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action } = body;

  if (action === "create") {
    const { transaction, wallet, description, swap_context } = body;
    if (!transaction || !wallet) {
      return NextResponse.json({ error: "transaction and wallet required" }, { status: 400 });
    }

    const txId = randomBytes(16).toString("hex");
    await cache.set(`${CACHE_PREFIX}${txId}`, TX_TTL, {
      transaction,
      wallet,
      description: description || "Sign transaction",
      status: "pending",
      swap_context: swap_context || null,
    });

    return NextResponse.json({ txId });
  }

  if (action === "submit") {
    const { txId, signed_transaction } = body;
    if (!txId || !signed_transaction) {
      return NextResponse.json({ error: "txId and signed_transaction required" }, { status: 400 });
    }

    const data = await cache.get(`${CACHE_PREFIX}${txId}`) as Record<string, unknown> | null;
    if (!data) return NextResponse.json({ error: "Transaction expired" }, { status: 404 });

    // If there's swap context, submit the signed tx to the OTC swap endpoint
    const swapContext = data.swap_context as { swap_id: string } | null;
    if (swapContext?.swap_id) {
      try {
        const submitRes = await fetch(`${request.nextUrl.origin}/api/otc-swap`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "submit_swap",
            swap_id: swapContext.swap_id,
            signed_transaction,
          }),
        });
        const submitData = await submitRes.json();

        await cache.set(`${CACHE_PREFIX}${txId}`, TX_TTL, {
          ...data,
          status: submitData.success ? "submitted" : "failed",
          signed_transaction,
          result: submitData,
        });

        return NextResponse.json({
          success: submitData.success,
          result: submitData,
        });
      } catch (err) {
        await cache.set(`${CACHE_PREFIX}${txId}`, TX_TTL, {
          ...data,
          status: "failed",
          result: { error: String(err) },
        });
        return NextResponse.json({ error: String(err) }, { status: 500 });
      }
    }

    // Generic: just mark as signed with the signed tx
    await cache.set(`${CACHE_PREFIX}${txId}`, TX_TTL, {
      ...data,
      status: "signed",
      signed_transaction,
    });

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
