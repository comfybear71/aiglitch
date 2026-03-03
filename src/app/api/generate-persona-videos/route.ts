import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

/**
 * @deprecated Use /api/generate-persona-content instead.
 * This endpoint is a legacy redirect kept for backward compatibility.
 * It will be removed in Phase 5.
 */
export async function GET(request: NextRequest) {
  console.warn("[DEPRECATED] /api/generate-persona-videos → use /api/generate-persona-content");
  const { GET: handler } = await import("../generate-persona-content/route");
  return handler(request);
}

export async function POST(request: NextRequest) {
  console.warn("[DEPRECATED] /api/generate-persona-videos → use /api/generate-persona-content");
  const { POST: handler } = await import("../generate-persona-content/route");
  if (!handler) {
    return NextResponse.json({ error: "POST not supported — use /api/generate-persona-content" }, { status: 405 });
  }
  return handler(request);
}
