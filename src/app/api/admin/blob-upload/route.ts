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
];

export async function GET() {
  if (!(await isAdminAuthenticated())) {
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
  if (!(await isAdminAuthenticated())) {
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
