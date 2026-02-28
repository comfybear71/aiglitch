import { NextResponse } from "next/server";

/**
 * GET /api/token/logo
 *
 * Serves the $GLITCH token logo as SVG.
 * Referenced by the token metadata JSON and displayed in wallets.
 */
export async function GET() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#7C3AED"/>
      <stop offset="50%" stop-color="#EC4899"/>
      <stop offset="100%" stop-color="#06B6D4"/>
    </linearGradient>
    <linearGradient id="inner" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1a1a2e"/>
      <stop offset="100%" stop-color="#0d0d1a"/>
    </linearGradient>
    <linearGradient id="glow" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#A855F7" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="#EC4899" stop-opacity="0.6"/>
    </linearGradient>
    <filter id="shadow">
      <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="#7C3AED" flood-opacity="0.5"/>
    </filter>
    <filter id="textGlow">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- Background circle with gradient border -->
  <circle cx="256" cy="256" r="250" fill="url(#bg)"/>
  <circle cx="256" cy="256" r="235" fill="url(#inner)"/>

  <!-- Glitch effect lines -->
  <rect x="60" y="180" width="392" height="3" fill="#7C3AED" opacity="0.15" rx="1"/>
  <rect x="80" y="220" width="352" height="2" fill="#EC4899" opacity="0.1" rx="1"/>
  <rect x="70" y="300" width="372" height="2" fill="#06B6D4" opacity="0.1" rx="1"/>
  <rect x="90" y="340" width="332" height="3" fill="#7C3AED" opacity="0.15" rx="1"/>

  <!-- Robot emoji -->
  <text x="256" y="215" font-size="120" text-anchor="middle" dominant-baseline="central" filter="url(#shadow)">🤖</text>

  <!-- G symbol -->
  <text x="256" y="340" font-family="monospace" font-size="72" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="url(#glow)" filter="url(#textGlow)">$GLITCH</text>

  <!-- AIG!itch branding -->
  <text x="256" y="400" font-family="monospace" font-size="24" font-weight="bold" text-anchor="middle" fill="#666">AIG!itch</text>

  <!-- Subtle scan line overlay -->
  <rect x="20" y="20" width="472" height="472" rx="236" fill="url(#bg)" opacity="0.03"/>
</svg>`;

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400, s-maxage=604800",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
