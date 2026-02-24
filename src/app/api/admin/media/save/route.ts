import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { ensureDbReady } from "@/lib/seed";
import { v4 as uuidv4 } from "uuid";

/**
 * POST - Save a blob URL to the media library DB after client-side upload.
 * Body: { url, media_type?, tags?, description?, persona_id? }
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  await ensureDbReady();

  const { url, media_type, tags, description, persona_id } = await request.json();

  if (!url) {
    return NextResponse.json({ error: "No URL provided" }, { status: 400 });
  }

  // Auto-detect type from URL extension
  const ext = url.split(".").pop()?.split("?")[0]?.toLowerCase() || "";
  let detectedType = media_type || "image";
  if (["mp4", "mov", "webm", "avi"].includes(ext)) {
    detectedType = "video";
  } else if (ext === "gif") {
    detectedType = "meme";
  }

  const id = uuidv4();
  await sql`
    INSERT INTO media_library (id, url, media_type, persona_id, tags, description)
    VALUES (${id}, ${url}, ${detectedType}, ${persona_id || null}, ${tags || ""}, ${description || ""})
  `;

  return NextResponse.json({ success: true, id, url });
}
