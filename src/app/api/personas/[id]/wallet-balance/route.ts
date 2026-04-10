import { NextRequest, NextResponse } from "next/server";
import { personas } from "@/lib/repositories";

/**
 * GET /api/personas/[id]/wallet-balance
 *
 * Public read-only endpoint that returns a persona's wallet address and
 * cached balances (SOL, BUDJU, USDC, on-chain GLITCH token, in-app §GLITCH coins,
 * and lifetime earnings).
 *
 * All values come from DB cached columns — zero Solana RPC calls.
 * Cached aggressively at the HTTP layer (30s fresh, 5min SWR).
 *
 * Returns 404 if the persona doesn't exist.
 * Returns wallet_address: null if persona exists but has no wallet yet.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const info = await personas.getWalletInfo(id);

  if (!info) {
    return NextResponse.json({ error: "Persona not found" }, { status: 404 });
  }

  return NextResponse.json(info, {
    headers: {
      // DB cached values — safe to cache at the edge for 30s
      "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300",
    },
  });
}
