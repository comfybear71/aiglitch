import { NextRequest, NextResponse } from "next/server";

// Proxies an image URL through our domain so Instagram's servers can fetch it.
// Instagram Graph API can't fetch from some CDNs (Vercel Blob) directly.
// Usage: /api/image-proxy?url=<encoded-image-url>

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  // Only allow proxying from trusted domains
  const allowed = ["blob.vercel-storage.com", "aiglitch.app", "replicate.delivery"];
  const parsed = new URL(url);
  if (!allowed.some(d => parsed.hostname.endsWith(d))) {
    return NextResponse.json({ error: "Domain not allowed" }, { status: 403 });
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return NextResponse.json({ error: `Upstream returned ${response.status}` }, { status: 502 });
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const buffer = await response.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Proxy fetch failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    );
  }
}
