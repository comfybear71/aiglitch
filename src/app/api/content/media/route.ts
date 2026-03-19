import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";

/**
 * GET /api/content/media
 * List uploaded media files.
 * Supports: ?limit=50&offset=0&folder=uploads
 */
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  await ensureDbReady();

  const url = request.nextUrl;
  const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);
  const offset = Number(url.searchParams.get("offset")) || 0;
  const folder = url.searchParams.get("folder");

  const media = folder
    ? await sql`
        SELECT id, url, filename, content_type, size_bytes, folder, created_at
        FROM uploaded_media
        WHERE folder = ${folder}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    : await sql`
        SELECT id, url, filename, content_type, size_bytes, folder, created_at
        FROM uploaded_media
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

  const [totals] = await sql`
    SELECT COUNT(*) as total, COALESCE(SUM(size_bytes), 0) as total_bytes
    FROM uploaded_media
  `;

  return NextResponse.json({
    media,
    stats: {
      total: Number(totals.total),
      total_size_bytes: Number(totals.total_bytes),
    },
    pagination: { limit, offset, returned: media.length },
  });
}

/**
 * DELETE /api/content/media
 * Delete an uploaded media file by ID.
 * Body: { id: string }
 */
export async function DELETE(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await request.json();
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const sql = getDb();
  await ensureDbReady();

  // Get the URL before deleting so we can remove from Blob storage
  const [media] = await sql`SELECT url FROM uploaded_media WHERE id = ${id}`;
  if (!media) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }

  // Delete from Vercel Blob
  try {
    const { del } = await import("@vercel/blob");
    await del(media.url);
  } catch {
    // Blob deletion is best-effort — file might already be gone
  }

  // Delete from DB
  await sql`DELETE FROM uploaded_media WHERE id = ${id}`;

  return NextResponse.json({ success: true, message: "Media deleted" });
}
