import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { list as listBlobs, del } from "@vercel/blob";

export const maxDuration = 60;

const KNOWN_PREFIXES = [
  "multi-clip/",
  "channels/clips/",
  "premiere/action/",
  "premiere/scifi/",
  "premiere/romance/",
  "premiere/family/",
  "premiere/horror/",
  "premiere/comedy/",
  "premiere/drama/",
  "premiere/documentary/",
  "premiere/cooking_show/",
  "images/",
  "avatars/",
  "ads/",
  "extensions/",
  "elon-campaign/",
  "sponsors/",
  "marketplace/",
  "chibi/",
  "og/",
  "instagram/",
  "content-gen/",
  "hatching/",
  "chat-images/",
  "generated/",
  "meatlab/",
  "news/",
];

export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prefix = request.nextUrl.searchParams.get("prefix") || "";
  const cursor = request.nextUrl.searchParams.get("cursor") || undefined;
  const action = request.nextUrl.searchParams.get("action");

  if (action === "subfolders") {
    const parentPrefix = request.nextUrl.searchParams.get("prefix") || "";
    try {
      const result = await listBlobs({ prefix: parentPrefix, limit: 1000 });
      const subfolderSet = new Set<string>();
      for (const b of result.blobs) {
        const relPath = b.pathname.slice(parentPrefix.length);
        const slashIdx = relPath.indexOf("/");
        if (slashIdx > 0) subfolderSet.add(relPath.slice(0, slashIdx));
      }
      let more = result.hasMore;
      let nextC = result.cursor;
      while (more) {
        const next = await listBlobs({ prefix: parentPrefix, limit: 1000, cursor: nextC });
        for (const b of next.blobs) {
          const relPath = b.pathname.slice(parentPrefix.length);
          const slashIdx = relPath.indexOf("/");
          if (slashIdx > 0) subfolderSet.add(relPath.slice(0, slashIdx));
        }
        more = next.hasMore;
        nextC = next.cursor;
      }
      return NextResponse.json({ subfolders: Array.from(subfolderSet).sort() });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }

  if (action === "folders") {
    const folderStats: { prefix: string; count: number; totalSize: number }[] = [];
    for (const p of KNOWN_PREFIXES) {
      try {
        const result = await listBlobs({ prefix: p, limit: 1 });
        if (result.blobs.length > 0 || result.hasMore) {
          let count = result.blobs.length;
          let totalSize = result.blobs.reduce((sum, b) => sum + b.size, 0);
          let hasMore = result.hasMore;
          let nextCursor = result.cursor;
          while (hasMore && count < 10000) {
            const next = await listBlobs({ prefix: p, limit: 1000, cursor: nextCursor });
            count += next.blobs.length;
            totalSize += next.blobs.reduce((sum, b) => sum + b.size, 0);
            hasMore = next.hasMore;
            nextCursor = next.cursor;
          }
          folderStats.push({ prefix: p, count, totalSize });
        }
      } catch { /* skip */ }
    }
    return NextResponse.json({ folders: folderStats });
  }

  try {
    const result = await listBlobs({ prefix, limit: 100, cursor });
    const files = result.blobs.map(b => ({
      url: b.url,
      pathname: b.pathname,
      size: b.size,
      uploadedAt: b.uploadedAt,
    }));
    return NextResponse.json({
      files,
      hasMore: result.hasMore,
      cursor: result.cursor,
      count: files.length,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { urls } = body as { urls?: string[] };

  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return NextResponse.json({ error: "urls array required" }, { status: 400 });
  }

  if (urls.length > 500) {
    return NextResponse.json({ error: "Max 500 files per delete request" }, { status: 400 });
  }

  try {
    await del(urls);
    return NextResponse.json({ success: true, deleted: urls.length });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
