/**
 * Grok Video Health Check
 * =======================
 * GET /api/health/grok-video
 *
 * Tests whether the xAI API key is configured and has valid auth.
 * Uses the /v1/models endpoint (free, no video generated) to verify credentials.
 *
 * Response:
 *   { ok: true, keyConfigured: true, maskedKey: "xai-...XXXX" }
 *   { ok: false, status: 401, error: "Unauthorized", keyConfigured: true }
 *   { ok: false, error: "XAI_API_KEY not set", keyConfigured: false }
 */

import { NextResponse } from "next/server";
import { checkGrokVideoAuth } from "@/lib/xai";

export async function GET() {
  const result = await checkGrokVideoAuth();

  return NextResponse.json(result, {
    status: result.ok ? 200 : result.keyConfigured ? 502 : 500,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
