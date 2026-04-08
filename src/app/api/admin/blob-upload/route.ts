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

  const action = request.nextUrl.searchParams.get("action");

  // Share all grokified sponsor images as feed posts
  if (action === "share_grokified") {
    try {
      const result = await listBlobs({ prefix: "sponsors/grokified/", limit: 100 });
      const images = result.blobs.filter(b => b.pathname.endsWith(".png") || b.pathname.endsWith(".jpeg") || b.pathname.endsWith(".jpg"));

      const sql = (await import("@/lib/db")).getDb();
      const { v4: uuidv4 } = await import("uuid");

      // Find which URLs are already posted
      const existingPosts = await sql`SELECT media_url FROM posts WHERE media_source = 'grok-sponsor' AND media_url IS NOT NULL`;
      const existingUrls = new Set(existingPosts.map(p => p.media_url as string));

      const newImages = images.filter(img => !existingUrls.has(img.url));
      const posted: { url: string; postId: string; title: string }[] = [];

      for (const img of newImages) {
        // Parse brand + channel from filename: budju-paws-pixels-scene3-abc12345.png
        const filename = img.pathname.split("/").pop()?.replace(/\.(png|jpeg|jpg)$/, "") || "";
        const parts = filename.split("-");
        const brand = parts[0]?.toUpperCase() || "SPONSOR";
        const postId = uuidv4();
        const content = `Sponsored by ${brand} \u{1F91D}\n\n#AIGlitch #Sponsored #${brand}`;

        await sql`INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, media_url, media_type, media_source, created_at)
          VALUES (${postId}, ${"glitch-000"}, ${content}, ${"product_shill"}, ${`AIGlitch,Sponsored,${brand}`}, ${Math.floor(Math.random() * 200) + 50}, ${img.url}, ${"image"}, ${"grok-sponsor"}, NOW())`;
        await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = 'glitch-000'`;
        posted.push({ url: img.url, postId, title: content.split("\n")[0] });
      }

      return NextResponse.json({
        success: true,
        total: images.length,
        alreadyPosted: existingUrls.size,
        newlyPosted: posted.length,
        posts: posted,
      });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
    }
  }

  // One-click sponsor image organizer — visit this URL in your browser
  if (action === "organize_sponsors") {
    const copies = [
      { sourceUrl: "https://jug8pwv8lcpdrski.public.blob.vercel-storage.com/sponsors_images/IMG_0781.jpeg", destPath: "sponsors/frenchie/product-1.jpeg" },
      { sourceUrl: "https://jug8pwv8lcpdrski.public.blob.vercel-storage.com/campaigns/product-1774424949964-IMG_0680.jpeg", destPath: "sponsors/aiglitch-cigarettes/product-1.jpeg" },
      { sourceUrl: "https://jug8pwv8lcpdrski.public.blob.vercel-storage.com/campaigns/product-1774365978547-can.jpg", destPath: "sponsors/aiglitch-cola/product-1.jpeg" },
    ];
    const results: { destPath: string; url?: string; error?: string }[] = [];
    for (const { sourceUrl, destPath } of copies) {
      try {
        const res = await fetch(sourceUrl);
        if (!res.ok) { results.push({ destPath, error: `HTTP ${res.status}` }); continue; }
        const buffer = Buffer.from(await res.arrayBuffer());
        const blob = await put(destPath, buffer, { access: "public", contentType: "image/jpeg", addRandomSuffix: false });
        results.push({ destPath, url: blob.url });
      } catch (err) {
        results.push({ destPath, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return NextResponse.json({ success: results.every(r => !r.error), results });
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
