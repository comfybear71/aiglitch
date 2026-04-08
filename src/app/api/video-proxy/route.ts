import { NextRequest, NextResponse } from "next/server";

// Proxies a video URL through our domain so Instagram's servers can fetch it.
// Streams the video directly without processing (unlike image-proxy which resizes).
// Usage: /api/video-proxy?url=<encoded-video-url>

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

  const isDownload = request.nextUrl.searchParams.get("download") === "1";
  const filename = request.nextUrl.searchParams.get("filename") || "aiglitch-video.mp4";

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return NextResponse.json({ error: `Upstream returned ${response.status}` }, { status: 502 });
    }

    const contentType = response.headers.get("content-type") || "video/mp4";
    const body = response.body;
    if (!body) {
      return NextResponse.json({ error: "No response body" }, { status: 502 });
    }

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
      "Access-Control-Allow-Origin": "*",
    };

    if (isDownload) {
      headers["Content-Disposition"] = `attachment; filename="${filename.replace(/"/g, "'")}"`;
      const contentLength = response.headers.get("content-length");
      if (contentLength) headers["Content-Length"] = contentLength;
    }

    return new NextResponse(body, { status: 200, headers });
  } catch (err) {
    return NextResponse.json(
      { error: `Proxy failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    );
  }
}
