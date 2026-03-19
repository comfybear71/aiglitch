import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { ensureDbReady } from "@/lib/seed";
import { list as listBlobs } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";

/**
 * POST /api/admin/media/resync
 *
 * Scans ALL Vercel Blob storage and re-registers any files missing
 * from the media_library DB table. Recovers from DB resets.
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "BLOB_READ_WRITE_TOKEN not set" }, { status: 500 });
  }

  const sql = getDb();
  await ensureDbReady();

  // Get all URLs already in the DB
  const existing = await sql`SELECT url FROM media_library` as unknown as { url: string }[];
  const existingUrls = new Set(existing.map(r => r.url));

  const VIDEO_EXTS = new Set(["mp4", "mov", "webm", "avi", "m4v", "mkv"]);
  const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "avif", "bmp", "svg"]);
  const MEME_EXTS = new Set(["gif"]);

  function detectType(pathname: string): "video" | "image" | "meme" {
    const ext = pathname.split(".").pop()?.split("?")[0]?.toLowerCase() || "";
    if (VIDEO_EXTS.has(ext)) return "video";
    if (MEME_EXTS.has(ext)) return "meme";
    return "image";
  }

  function detectTags(pathname: string): string {
    // Extract folder hints as tags
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length > 1) {
      return parts.slice(0, -1).join(",");
    }
    return "recovered";
  }

  let synced = 0;
  let skipped = 0;
  let errors = 0;
  const syncedItems: { url: string; type: string; pathname: string }[] = [];

  // Scan all blob storage (multiple prefixes to catch everything)
  const prefixes = ["media-library/", "videos/", "video/", "premiere/", "logos/", "memes/", "images/", ""];
  const scannedUrls = new Set<string>();

  for (const prefix of prefixes) {
    let cursor: string | undefined;
    try {
      do {
        const result = await listBlobs({ prefix, cursor, limit: 500 });
        cursor = result.cursor || undefined;

        for (const blob of result.blobs) {
          // Skip if already in DB or already processed this run
          if (existingUrls.has(blob.url) || scannedUrls.has(blob.url)) {
            skipped++;
            continue;
          }
          scannedUrls.add(blob.url);

          // Skip non-media files
          const ext = blob.pathname.split(".").pop()?.split("?")[0]?.toLowerCase() || "";
          if (!VIDEO_EXTS.has(ext) && !IMAGE_EXTS.has(ext) && !MEME_EXTS.has(ext)) {
            continue;
          }

          const mediaType = detectType(blob.pathname);
          const tags = detectTags(blob.pathname);
          const isLogo = blob.pathname.toLowerCase().includes("logo");

          try {
            const id = uuidv4();
            await sql`
              INSERT INTO media_library (id, url, media_type, tags, description)
              VALUES (${id}, ${blob.url}, ${mediaType}, ${isLogo ? "logo," + tags : tags}, ${blob.pathname})
              ON CONFLICT DO NOTHING
            `;
            synced++;
            syncedItems.push({ url: blob.url, type: mediaType, pathname: blob.pathname });
          } catch (err) {
            errors++;
            console.error(`[resync] Failed to insert ${blob.pathname}:`, err instanceof Error ? err.message : err);
          }
        }
      } while (cursor);
    } catch (prefixErr) {
      console.error(`[resync] Blob scan for prefix "${prefix}" failed:`, prefixErr instanceof Error ? prefixErr.message : prefixErr);
    }
  }

  // Summary counts
  const counts = {
    memes: syncedItems.filter(i => i.type === "meme").length,
    images: syncedItems.filter(i => i.type === "image").length,
    videos: syncedItems.filter(i => i.type === "video").length,
  };

  return NextResponse.json({
    success: true,
    synced,
    skipped,
    errors,
    already_in_db: existing.length,
    counts,
    sample: syncedItems.slice(0, 20).map(i => `${i.type}: ${i.pathname}`),
  });
}
