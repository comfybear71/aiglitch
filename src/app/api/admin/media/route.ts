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
    SELECT id, url, media_type, tags, description, used_count, uploaded_at
    FROM media_library
    ORDER BY uploaded_at DESC
  `;

  return NextResponse.json({ media });
}

// POST - upload new media to the library
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  await ensureDbReady();

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const mediaType = formData.get("media_type") as string || "image";
  const tags = formData.get("tags") as string || "";
  const description = formData.get("description") as string || "";

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // Upload to Vercel Blob
  const ext = file.name.split(".").pop() || (mediaType === "video" ? "mp4" : "webp");
  const filename = `media-library/${uuidv4()}.${ext}`;

  const blob = await put(filename, file, {
    access: "public",
    contentType: file.type,
    addRandomSuffix: true,
  });

  const id = uuidv4();
  await sql`
    INSERT INTO media_library (id, url, media_type, tags, description)
    VALUES (${id}, ${blob.url}, ${mediaType}, ${tags}, ${description})
  `;

  return NextResponse.json({ success: true, id, url: blob.url });
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
