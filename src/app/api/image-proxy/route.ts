import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

// Proxies an image URL through our domain so Instagram's servers can fetch it.
// Also resizes to 1080x1080 JPEG — Instagram requires specific aspect ratios.
// Usage: /api/image-proxy?url=<encoded-image-url>

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  // Block internal/private IPs
  try {
    const parsed = new URL(url);
    const blocked = ["localhost", "127.0.0.1", "0.0.0.0", "169.254.169.254"];
    if (blocked.some(d => parsed.hostname.includes(d))) {
      return NextResponse.json({ error: "Domain not allowed" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return NextResponse.json({ error: `Upstream returned ${response.status}` }, { status: 502 });
    }

    const inputBuffer = Buffer.from(await response.arrayBuffer());

    // Resize to 1080x1080 square JPEG — Instagram's preferred format
    // cover = crop to fill, ensuring no letterboxing
    const outputBuffer = await sharp(inputBuffer)
      .resize(1080, 1080, { fit: "cover", position: "centre" })
      .jpeg({ quality: 90 })
      .toBuffer();

    return new NextResponse(new Uint8Array(outputBuffer), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Proxy failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    );
  }
}
