import { NextRequest, NextResponse } from "next/server";
import { getProductById } from "@/lib/marketplace";
import { getRarity, parseCoinPrice, rarityColor } from "@/lib/nft-mint";

/**
 * GET /api/nft/image/[productId]
 *
 * Generates an SVG trading card image for an NFT.
 * Used as the `image` field in Metaplex metadata.
 * Displays the product emoji, name, rarity, and AIG!itch branding.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  const { productId } = await params;
  const product = getProductById(productId);

  if (!product) {
    // Fallback generic card
    const svg = generateCard("?", "Unknown NFT", "common", "#9CA3AF", 0);
    return new NextResponse(svg, {
      headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" },
    });
  }

  const price = parseCoinPrice(product.price);
  const rarity = getRarity(price);
  const color = rarityColor(rarity);

  const svg = generateCard(product.emoji, product.name, rarity, color, price);

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400, s-maxage=604800",
    },
  });
}

function generateCard(
  emoji: string,
  name: string,
  rarity: string,
  color: string,
  price: number,
): string {
  // Background gradient based on rarity
  const bgGradient = {
    legendary: `<stop offset="0%" stop-color="#1a1000"/><stop offset="50%" stop-color="#2d1f00"/><stop offset="100%" stop-color="#1a1000"/>`,
    epic: `<stop offset="0%" stop-color="#1a0033"/><stop offset="50%" stop-color="#2d0052"/><stop offset="100%" stop-color="#1a0033"/>`,
    rare: `<stop offset="0%" stop-color="#001033"/><stop offset="50%" stop-color="#001a52"/><stop offset="100%" stop-color="#001033"/>`,
    uncommon: `<stop offset="0%" stop-color="#001a0d"/><stop offset="50%" stop-color="#00331a"/><stop offset="100%" stop-color="#001a0d"/>`,
    common: `<stop offset="0%" stop-color="#111111"/><stop offset="50%" stop-color="#1a1a1a"/><stop offset="100%" stop-color="#111111"/>`,
  }[rarity] || `<stop offset="0%" stop-color="#111"/><stop offset="100%" stop-color="#1a1a1a"/>`;

  // Escape name for XML
  const safeName = name
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

  // Truncate name for display
  const displayName = safeName.length > 24 ? safeName.slice(0, 22) + "..." : safeName;

  const rarityLabel = rarity.charAt(0).toUpperCase() + rarity.slice(1);
  const rarityGem = { legendary: "💎", epic: "✨", rare: "🔷", uncommon: "🔹", common: "⬜" }[rarity] || "⬜";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="700" viewBox="0 0 500 700">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">${bgGradient}</linearGradient>
    <linearGradient id="border" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.8"/>
      <stop offset="50%" stop-color="${color}" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0.8"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- Card background -->
  <rect width="500" height="700" rx="20" fill="url(#bg)"/>
  <rect x="3" y="3" width="494" height="694" rx="18" fill="none" stroke="url(#border)" stroke-width="3"/>

  <!-- Top bar -->
  <rect x="20" y="20" width="460" height="40" rx="8" fill="rgba(0,0,0,0.5)"/>
  <text x="35" y="46" font-family="monospace" font-size="14" fill="${color}" font-weight="bold">AIG!itch NFT</text>
  <text x="465" y="46" font-family="monospace" font-size="13" fill="${color}" text-anchor="end">${rarityLabel}</text>

  <!-- Emoji artwork area -->
  <rect x="40" y="80" width="420" height="340" rx="12" fill="rgba(0,0,0,0.4)" stroke="${color}" stroke-opacity="0.2" stroke-width="1"/>
  <text x="250" y="290" font-size="140" text-anchor="middle" dominant-baseline="central">${emoji}</text>

  <!-- Name plate -->
  <rect x="40" y="440" width="420" height="60" rx="10" fill="rgba(0,0,0,0.5)" stroke="${color}" stroke-opacity="0.15" stroke-width="1"/>
  <text x="250" y="478" font-family="monospace" font-size="18" fill="white" text-anchor="middle" font-weight="bold" filter="url(#glow)">${displayName}</text>

  <!-- Stats row -->
  <rect x="40" y="520" width="200" height="50" rx="8" fill="rgba(0,0,0,0.4)"/>
  <text x="55" y="542" font-family="monospace" font-size="10" fill="#666">PRICE</text>
  <text x="55" y="560" font-family="monospace" font-size="16" fill="#22C55E" font-weight="bold">${price} $GLITCH</text>

  <rect x="260" y="520" width="200" height="50" rx="8" fill="rgba(0,0,0,0.4)"/>
  <text x="275" y="542" font-family="monospace" font-size="10" fill="#666">RARITY</text>
  <text x="275" y="560" font-family="monospace" font-size="16" fill="${color}" font-weight="bold">${rarityGem} ${rarityLabel}</text>

  <!-- Bottom bar -->
  <rect x="20" y="590" width="460" height="90" rx="12" fill="rgba(0,0,0,0.4)"/>
  <text x="250" y="618" font-family="monospace" font-size="11" fill="#555" text-anchor="middle">AIG!itch Marketplace NFTs</text>
  <text x="250" y="638" font-family="monospace" font-size="10" fill="#444" text-anchor="middle">Solana SPL Token • Real On-Chain NFT</text>
  <text x="250" y="665" font-family="monospace" font-size="18" fill="${color}" text-anchor="middle" font-weight="bold" filter="url(#glow)">AIG!ITCH</text>
</svg>`;
}
