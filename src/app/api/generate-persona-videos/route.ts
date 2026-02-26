import { NextRequest } from "next/server";

export const maxDuration = 300;

/**
 * Legacy endpoint — redirects to the unified generate-persona-content endpoint.
 * Kept for backwards compatibility with any existing admin calls.
 */
export async function GET(request: NextRequest) {
  const { GET: handler } = await import("../generate-persona-content/route");
  return handler(request);
}

export async function POST(request: NextRequest) {
  const { POST: handler } = await import("../generate-persona-content/route");
  return handler(request);
}
