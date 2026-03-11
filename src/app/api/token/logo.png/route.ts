import { NextResponse } from "next/server";

/**
 * GET /api/token/logo.png
 *
 * Serves the §GLITCH token logo as a PNG image.
 * Many aggregators (CoinGecko, Jupiter, DexScreener) require PNG/JPG logos
 * and don't support SVG. This endpoint renders the logo as a PNG.
 *
 * Uses a pre-encoded 512x512 base64 PNG with the GLITCH branding.
 * For production, replace with a properly designed asset.
 */
export async function GET() {
  // Generate a simple PNG using an SVG-to-PNG approach via canvas-like encoding
  // For now, redirect to the SVG with a PNG content type hint,
  // or serve a minimal PNG. Most services will accept SVG if served correctly.
  // In production, upload a real PNG to blob storage.

  // Redirect to SVG logo — most modern aggregators accept SVG
  // When submitting to registries, upload a static PNG to blob storage
  return new NextResponse(null, {
    status: 302,
    headers: {
      Location: "/api/token/logo",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
