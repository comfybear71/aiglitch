import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { put, list as listBlobs } from "@vercel/blob";

/**
 * Upload videos directly to premiere/{genre}/ or news/ folders in Vercel Blob.
 * These are picked up by the Stitch Test flow to auto-create posts.
 *
 * POST body: FormData with "files" + "folder" (e.g. "premiere/action", "news")
 * GET: List all videos across premiere/news folders with counts per genre
 */

const VALID_FOLDERS = [
  "news",
  "premiere/action",
  "premiere/scifi",
  "premiere/romance",
  "premiere/family",
  "premiere/horror",
  "premiere/comedy",
  "premiere/drama",
  "premiere/documentary",
  "premiere/cooking_show",
  "campaigns",
];

export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const folders: Record<string, { count: number; totalSize: number; videos: { pathname: string; url: string; size: number }[] }> = {};

  for (const prefix of VALID_FOLDERS) {
    try {
      const result = await listBlobs({ prefix, limit: 100 });
      const videos = result.blobs
        .filter(b => b.pathname.endsWith(".mp4") || b.pathname.endsWith(".mov") || b.pathname.endsWith(".webm"))
        .map(b => ({ pathname: b.pathname, url: b.url, size: b.size }));

      folders[prefix] = {
        count: videos.length,
        totalSize: videos.reduce((sum, v) => sum + v.size, 0),
        videos,
      };
    } catch {
      folders[prefix] = { count: 0, totalSize: 0, videos: [] };
    }
  }

  const total = Object.values(folders).reduce((sum, f) => sum + f.count, 0);

  return NextResponse.json({ folders, total, validFolders: VALID_FOLDERS });
}

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const folder = (formData.get("folder") as string) || "premiere/action";

  if (!VALID_FOLDERS.includes(folder)) {
    return NextResponse.json({ error: `Invalid folder: ${folder}. Valid: ${VALID_FOLDERS.join(", ")}` }, { status: 400 });
  }

  const files = formData.getAll("files") as File[];
  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  const results: { name: string; url?: string; size?: number; error?: string }[] = [];

  for (const file of files) {
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "mp4";
      // Keep original filename for easy identification
      const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const pathname = `${folder}/${cleanName}`;

      const blob = await put(pathname, file, {
        access: "public",
        contentType: file.type || "video/mp4",
        addRandomSuffix: false, // keep clean paths so genre detection works
      });

      results.push({ name: file.name, url: blob.url, size: file.size });
    } catch (err) {
      results.push({ name: file.name, error: String(err instanceof Error ? err.message : err) });
    }
  }

  const succeeded = results.filter(r => !r.error).length;
  const failed = results.filter(r => r.error).length;

  return NextResponse.json({
    success: failed === 0,
    uploaded: succeeded,
    failed,
    folder,
    results,
  });
}

/**
 * PUT — Copy an image from a source URL to a destination path in Blob storage.
 * Used for organizing sponsor images into sponsors/{slug}/ folders.
 *
 * Body: { sourceUrl: string, destPath: string } or { copies: [{ sourceUrl, destPath }] }
 */
export async function PUT(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const copies: { sourceUrl: string; destPath: string }[] = body.copies || (body.sourceUrl ? [{ sourceUrl: body.sourceUrl, destPath: body.destPath }] : []);

  if (copies.length === 0) {
    return NextResponse.json({ error: "No copies specified. Send { sourceUrl, destPath } or { copies: [...] }" }, { status: 400 });
  }

  const results: { destPath: string; url?: string; sizeMb?: string; error?: string }[] = [];

  for (const { sourceUrl, destPath } of copies) {
    try {
      const res = await fetch(sourceUrl);
      if (!res.ok) {
        results.push({ destPath, error: `Download failed: HTTP ${res.status}` });
        continue;
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get("content-type") || "image/jpeg";
      const blob = await put(destPath, buffer, { access: "public", contentType, addRandomSuffix: false });
      results.push({ destPath, url: blob.url, sizeMb: (buffer.length / 1024 / 1024).toFixed(2) });
    } catch (err) {
      results.push({ destPath, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ success: results.every(r => !r.error), results });
}
