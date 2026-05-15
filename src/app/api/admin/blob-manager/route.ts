import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { list as listBlobs, del, put } from "@vercel/blob";

export const maxDuration = 120;

const CHANNEL_SLUG_MAP: Record<string, string> = {
  "ch-fail-army": "ai-fail-army",
  "ch-ai-fail-army": "ai-fail-army",
  "ch-aitunes": "aitunes",
  "ch-paws-pixels": "paws-and-pixels",
  "ch-only-ai-fans": "only-ai-fans",
  "ch-ai-dating": "ai-dating",
  "ch-gnn": "gnn",
  "ch-marketplace-qvc": "marketplace-qvc",
  "ch-ai-politicians": "ai-politicians",
  "ch-after-dark": "after-dark",
  "ch-aiglitch-studios": "aiglitch-studios",
  "ch-infomercial": "ai-infomercial",
  "ch-ai-infomercial": "ai-infomercial",
  "ch-star-glitchies": "star-glitchies",
  "ch-no-more-meatbags": "no-more-meatbags",
  "ch-liklok": "liklok",
  "ch-game-show": "game-show",
  "ch-truths-facts": "truths-facts",
  "ch-conspiracy": "conspiracy",
  "ch-cosmic-wanderer": "cosmic-wanderer",
  "ch-shameless-plug": "shameless-plug",
  "ch-fractal-spinout": "fractal-spinout",
  "ch-the-vault": "the-vault",
};

const KNOWN_PREFIXES = [
  // Channels (each channel gets its own folder)
  "channels/ai-fail-army/",
  "channels/aitunes/",
  "channels/paws-and-pixels/",
  "channels/only-ai-fans/",
  "channels/ai-dating/",
  "channels/gnn/",
  "channels/marketplace-qvc/",
  "channels/ai-politicians/",
  "channels/after-dark/",
  "channels/aiglitch-studios/",
  "channels/ai-infomercial/",
  "channels/star-glitchies/",
  "channels/no-more-meatbags/",
  "channels/liklok/",
  "channels/game-show/",
  "channels/truths-facts/",
  "channels/conspiracy/",
  "channels/cosmic-wanderer/",
  "channels/shameless-plug/",
  "channels/fractal-spinout/",
  // Legacy folders (existing content before channel-based structure)
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
  "news/",
  // Intermediate clips (safe to delete after stitching)
  "multi-clip/",
  // Other assets
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
];

export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prefix = request.nextUrl.searchParams.get("prefix") || "";
  const cursor = request.nextUrl.searchParams.get("cursor") || undefined;
  const action = request.nextUrl.searchParams.get("action");

  if (action === "channel-summary") {
    try {
      const { getDb } = await import("@/lib/db");
      const sql = getDb();
      const rows = await sql`
        SELECT channel_id,
          COUNT(*)::int as video_count,
          COUNT(*) FILTER (WHERE media_url NOT LIKE '%/channels/%')::int as needs_moving
        FROM posts
        WHERE channel_id IS NOT NULL
          AND media_type = 'video'
          AND media_url IS NOT NULL
          AND is_reply_to IS NULL
        GROUP BY channel_id
        ORDER BY needs_moving DESC
      ` as unknown as { channel_id: string; video_count: number; needs_moving: number }[];
      return NextResponse.json({ channels: rows });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }

  if (action === "channel-videos") {
    const channelId = request.nextUrl.searchParams.get("channel_id") || "";
    if (!channelId) return NextResponse.json({ error: "channel_id required" }, { status: 400 });
    try {
      const { getDb } = await import("@/lib/db");
      const sql = getDb();
      const rows = await sql`
        SELECT id, media_url, content, created_at
        FROM posts
        WHERE channel_id = ${channelId}
          AND media_type = 'video'
          AND media_url IS NOT NULL
          AND is_reply_to IS NULL
          AND media_url NOT LIKE '%/channels/%'
        ORDER BY created_at ASC
      ` as unknown as { id: string; media_url: string; content: string; created_at: string }[];
      const slug = CHANNEL_SLUG_MAP[channelId] || channelId.replace("ch-", "");
      const videos = rows.map(r => {
        const title = (r.content || "").split("\n")[0].replace(/^🎬\s*/, "").slice(0, 80);
        const date = new Date(r.created_at).toISOString().slice(0, 10);
        const titleSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
        const newPath = `channels/${slug}/${date}_${titleSlug || r.id.slice(0, 8)}.mp4`;
        return { post_id: r.id, old_url: r.media_url, new_path: newPath, title, date };
      });
      return NextResponse.json({ channel_id: channelId, slug, count: videos.length, videos });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }

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
    const scanPromises = KNOWN_PREFIXES.map(async (p) => {
      try {
        const result = await listBlobs({ prefix: p, limit: 1000 });
        if (result.blobs.length > 0) {
          const count = result.blobs.length;
          const totalSize = result.blobs.reduce((sum, b) => sum + b.size, 0);
          const estimatedCount = result.hasMore ? count * 10 : count;
          const estimatedSize = result.hasMore ? totalSize * 10 : totalSize;
          return { prefix: p, count: estimatedCount, totalSize: estimatedSize, hasMore: result.hasMore };
        }
      } catch { /* skip */ }
      return null;
    });
    const results = await Promise.all(scanPromises);
    for (const r of results) {
      if (r) folderStats.push({ prefix: r.prefix, count: r.count, totalSize: r.totalSize });
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

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { action } = body;

  if (action === "migrate-video") {
    const { post_id, old_url, new_path } = body as { post_id: string; old_url: string; new_path: string };
    if (!post_id || !old_url || !new_path) {
      return NextResponse.json({ error: "post_id, old_url, new_path required" }, { status: 400 });
    }

    try {
      const res = await fetch(old_url);
      if (!res.ok) return NextResponse.json({ error: `Download failed: ${res.status}` }, { status: 500 });
      const arrayBuf = await res.arrayBuffer();
      const buffer = new Blob([arrayBuf], { type: "video/mp4" });

      const blob = await put(new_path, buffer, {
        access: "public",
        contentType: "video/mp4",
        addRandomSuffix: false,
      });

      const { getDb } = await import("@/lib/db");
      const sql = getDb();
      await sql`UPDATE posts SET media_url = ${blob.url} WHERE id = ${post_id}`;

      return NextResponse.json({
        success: true,
        post_id,
        old_url,
        new_url: blob.url,
        size: arrayBuf.byteLength,
      });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
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
