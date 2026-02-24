import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { ensureDbReady } from "@/lib/seed";
import { put } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";

// GET - list all media in the library
export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  await ensureDbReady();

  const media = await sql`
    SELECT ml.id, ml.url, ml.media_type, ml.persona_id, ml.tags, ml.description, ml.used_count, ml.uploaded_at,
      ap.username as persona_username, ap.display_name as persona_name, ap.avatar_emoji as persona_emoji
    FROM media_library ml
    LEFT JOIN ai_personas ap ON ml.persona_id = ap.id
    ORDER BY ml.uploaded_at DESC
  `;

  return NextResponse.json({ media });
}

// POST - upload one or many files to the library
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  await ensureDbReady();

  const formData = await request.formData();
  const mediaType = formData.get("media_type") as string || "image";
  const tags = formData.get("tags") as string || "";
  const description = formData.get("description") as string || "";
  const personaId = formData.get("persona_id") as string || "";

  // Collect all files — supports both "file" (single) and "files" (bulk)
  const files: File[] = [];
  const singleFile = formData.get("file") as File | null;
  if (singleFile && singleFile.size > 0) files.push(singleFile);

  const bulkFiles = formData.getAll("files") as File[];
  for (const f of bulkFiles) {
    if (f && f.size > 0) files.push(f);
  }

  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  const results: { id: string; url: string; name: string; error?: string }[] = [];

  for (const file of files) {
    try {
      // Auto-detect type from extension if doing bulk upload
      let detectedType = mediaType;
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      if (["mp4", "mov", "webm", "avi"].includes(ext)) {
        detectedType = "video";
      } else if (["gif"].includes(ext)) {
        detectedType = "meme"; // GIFs are usually memes
      }

      const filename = `media-library/${uuidv4()}.${ext || (detectedType === "video" ? "mp4" : "webp")}`;

      const blob = await put(filename, file, {
        access: "public",
        contentType: file.type,
        addRandomSuffix: true,
      });

      const id = uuidv4();
      await sql`
        INSERT INTO media_library (id, url, media_type, persona_id, tags, description)
        VALUES (${id}, ${blob.url}, ${detectedType}, ${personaId || null}, ${tags}, ${description || file.name})
      `;

      results.push({ id, url: blob.url, name: file.name });
    } catch (err) {
      results.push({ id: "", url: "", name: file.name, error: String(err) });
    }
  }

  const succeeded = results.filter(r => !r.error).length;
  const failed = results.filter(r => r.error).length;

  return NextResponse.json({
    success: failed === 0,
    uploaded: succeeded,
    failed,
    results,
  });
}

// DELETE - remove media from library
export async function DELETE(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  const { id } = await request.json();

  await sql`DELETE FROM media_library WHERE id = ${id}`;
  return NextResponse.json({ success: true });
}
