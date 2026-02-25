import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { ensureDbReady } from "@/lib/seed";
import { put } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";

/**
 * POST - Import media from URLs (Grok, Raphael, Perchance, any direct image/video URL)
 * Body: { urls: string[], media_type: string, tags: string, description: string, persona_id?: string }
 *
 * Fetches each URL, uploads to Vercel Blob, adds to media_library.
 * No more manual download → re-upload cycle!
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  await ensureDbReady();

  const body = await request.json();
  const { urls, media_type = "image", tags = "", description = "", persona_id = "" } = body as {
    urls: string[];
    media_type?: string;
    tags?: string;
    description?: string;
    persona_id?: string;
  };

  if (!urls || urls.length === 0) {
    return NextResponse.json({ error: "No URLs provided" }, { status: 400 });
  }

  const results: { url: string; stored_url?: string; error?: string }[] = [];

  for (const rawUrl of urls) {
    const url = rawUrl.trim();
    if (!url) continue;

    try {
      // Fetch the image/video from the URL
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
        redirect: "follow",
      });

      if (!response.ok) {
        results.push({ url, error: `HTTP ${response.status}: ${response.statusText}` });
        continue;
      }

      const contentType = response.headers.get("content-type") || "image/png";
      const buffer = await response.arrayBuffer();

      if (buffer.byteLength === 0) {
        results.push({ url, error: "Empty response" });
        continue;
      }

      // Determine file extension from content type or URL
      let ext = "png";
      let detectedType = media_type;

      if (contentType.includes("video/") || url.match(/\.(mp4|mov|webm|avi)(\?|$)/i)) {
        ext = contentType.includes("mp4") ? "mp4" : contentType.includes("webm") ? "webm" : "mp4";
        detectedType = "video";
      } else if (contentType.includes("gif") || url.match(/\.gif(\?|$)/i)) {
        ext = "gif";
        detectedType = "meme";
      } else if (contentType.includes("webp") || url.match(/\.webp(\?|$)/i)) {
        ext = "webp";
      } else if (contentType.includes("jpeg") || contentType.includes("jpg") || url.match(/\.jpe?g(\?|$)/i)) {
        ext = "jpg";
      } else if (contentType.includes("png") || url.match(/\.png(\?|$)/i)) {
        ext = "png";
      }

      const filename = `media-library/${uuidv4()}.${ext}`;

      // Upload to Vercel Blob
      const blob = await put(filename, Buffer.from(buffer), {
        access: "public",
        contentType,
        addRandomSuffix: true,
      });

      // Save to database
      const id = uuidv4();
      await sql`
        INSERT INTO media_library (id, url, media_type, persona_id, tags, description)
        VALUES (${id}, ${blob.url}, ${detectedType}, ${persona_id || null}, ${tags}, ${description || url.slice(0, 100)})
      `;

      // Auto-create a post so this media appears on the persona's profile
      if (persona_id) {
        const postId = uuidv4();
        const postType = detectedType === "video" ? "video" : detectedType === "meme" ? "meme" : "image";
        const caption = description || tags || "";
        const hashtagStr = tags ? tags.split(",").map((t: string) => t.trim()).filter(Boolean).join(",") : "";
        await sql`
          INSERT INTO posts (id, persona_id, content, post_type, hashtags, media_url, media_type, ai_like_count)
          VALUES (${postId}, ${persona_id}, ${caption}, ${postType}, ${hashtagStr}, ${blob.url}, ${detectedType}, ${Math.floor(Math.random() * 500) + 50})
        `;
        await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${persona_id}`;
      }

      results.push({ url, stored_url: blob.url });
    } catch (err) {
      results.push({ url, error: String(err instanceof Error ? err.message : err) });
    }
  }

  const succeeded = results.filter(r => !r.error).length;
  const failed = results.filter(r => r.error).length;

  return NextResponse.json({
    success: failed === 0,
    imported: succeeded,
    failed,
    results,
  });
}
