import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { put } from "@vercel/blob";

/**
 * POST /api/content/upload
 * Upload a file to Vercel Blob Storage and record it in uploaded_media table.
 * Accepts multipart/form-data with a "file" field and optional "folder" field.
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const folder = (formData.get("folder") as string) || "uploads";

  if (!file) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const sql = getDb();
  await ensureDbReady();

  try {
    const blob = await put(`${folder}/${file.name}`, file, {
      access: "public",
      addRandomSuffix: true,
    });

    const id = crypto.randomUUID();
    await sql`
      INSERT INTO uploaded_media (id, url, filename, content_type, size_bytes, folder)
      VALUES (${id}, ${blob.url}, ${file.name}, ${file.type || "application/octet-stream"}, ${file.size}, ${folder})
    `;

    return NextResponse.json({
      success: true,
      media: {
        id,
        url: blob.url,
        filename: file.name,
        content_type: file.type,
        size_bytes: file.size,
        folder,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 },
    );
  }
}
