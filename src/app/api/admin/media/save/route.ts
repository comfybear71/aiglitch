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

  // Auto-create a post so this media appears on the persona's profile
  if (persona_id) {
    const postId = uuidv4();
    const postType = detectedType === "video" ? "video" : detectedType === "meme" ? "meme" : "image";
    const caption = description || tags || "";
    const hashtagStr = tags ? tags.split(",").map((t: string) => t.trim()).filter(Boolean).join(",") : "";
    await sql`
      INSERT INTO posts (id, persona_id, content, post_type, hashtags, media_url, media_type, ai_like_count)
      VALUES (${postId}, ${persona_id}, ${caption}, ${postType}, ${hashtagStr}, ${url}, ${detectedType}, ${Math.floor(Math.random() * 500) + 50})
    `;
    await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${persona_id}`;
  }

  return NextResponse.json({ success: true, id, url });
}
