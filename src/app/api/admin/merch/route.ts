import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { env } from "@/lib/bible/env";
import { put, del } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";

export const maxDuration = 60;

/**
 * Merch Studio API
 * ================
 * Two sources of merch designs:
 *  1. Frame capture — extract frames from existing videos (client sends PNG dataURL)
 *  2. Grok generation — generate new print-ready merch designs via Grok image API
 *
 * All items stored in merch_library table + Vercel Blob at merch/
 */

async function ensureTable() {
  const sql = getDb();
  await sql`CREATE TABLE IF NOT EXISTS merch_library (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    image_url TEXT NOT NULL,
    label TEXT,
    category TEXT,
    source_post_id TEXT,
    source_video_url TEXT,
    prompt_used TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_merch_library_created ON merch_library(created_at DESC)`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_merch_library_source ON merch_library(source)`.catch(() => {});
}

/**
 * GET /api/admin/merch — list merch library + list of videos to capture from
 * ?action=list — return all saved merch items
 * ?action=videos — return recent videos from posts for capture UI
 */
export async function GET(request: NextRequest) {
  if (!await isAdminAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureTable();
  const sql = getDb();
  const action = request.nextUrl.searchParams.get("action") || "list";

  if (action === "videos") {
    // Fetch recent video posts for the capture tab
    const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") || "60"), 200);
    const videos = await sql`
      SELECT p.id, p.content, p.media_url, p.created_at, p.persona_id,
             a.display_name, a.avatar_emoji
      FROM posts p
      LEFT JOIN ai_personas a ON p.persona_id = a.id
      WHERE p.media_type = 'video'
        AND p.media_url IS NOT NULL
        AND p.media_url != ''
      ORDER BY p.created_at DESC
      LIMIT ${limit}
    `;
    return NextResponse.json({ videos });
  }

  // Default: list all saved merch items
  const items = await sql`
    SELECT id, source, image_url, label, category, source_post_id, source_video_url, prompt_used, created_at
    FROM merch_library
    ORDER BY created_at DESC
    LIMIT 500
  `;
  return NextResponse.json({ items });
}

/**
 * POST /api/admin/merch — capture / generate / update / delete
 */
export async function POST(request: NextRequest) {
  if (!await isAdminAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureTable();
  const sql = getDb();
  const body = await request.json();
  const { action } = body;

  // ── Capture: save a frame extracted client-side from a video ──
  if (action === "capture") {
    const { image_data, label, source_post_id, source_video_url } = body;
    if (!image_data) {
      return NextResponse.json({ error: "image_data required" }, { status: 400 });
    }

    // image_data is a data URL: "data:image/png;base64,..."
    const match = /^data:(image\/[a-z]+);base64,(.+)$/.exec(image_data);
    if (!match) {
      return NextResponse.json({ error: "Invalid image_data format (expected data URL)" }, { status: 400 });
    }
    const contentType = match[1];
    const base64 = match[2];
    const buffer = Buffer.from(base64, "base64");

    const id = uuidv4();
    const ext = contentType.split("/")[1] || "png";
    const blobPath = `merch/captures/${id}.${ext}`;
    const blob = await put(blobPath, buffer, { access: "public", contentType, addRandomSuffix: false });

    await sql`
      INSERT INTO merch_library (id, source, image_url, label, category, source_post_id, source_video_url, prompt_used)
      VALUES (${id}, 'capture', ${blob.url}, ${label || null}, 'video-frame', ${source_post_id || null}, ${source_video_url || null}, NULL)
    `;

    return NextResponse.json({ success: true, id, image_url: blob.url });
  }

  // ── Generate: call Grok to create a new merch design ──
  if (action === "generate") {
    const { prompt, label, category, aspect_ratio } = body;
    if (!prompt) {
      return NextResponse.json({ error: "prompt required" }, { status: 400 });
    }
    if (!env.XAI_API_KEY) {
      return NextResponse.json({ error: "XAI_API_KEY not set" }, { status: 500 });
    }

    try {
      const res = await fetch("https://api.x.ai/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.XAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "grok-imagine-image",
          prompt,
          n: 1,
        }),
      });

      const data = await res.json();
      const imageUrl = data.data?.[0]?.url;

      if (!imageUrl) {
        return NextResponse.json({ error: "No image URL in response", raw: JSON.stringify(data).slice(0, 300) }, { status: 500 });
      }

      // Download and persist (Grok URLs are ephemeral)
      const imgRes = await fetch(imageUrl);
      const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
      const id = uuidv4();
      const blobPath = `merch/designs/${id}.png`;
      const blob = await put(blobPath, imgBuffer, { access: "public", contentType: "image/png", addRandomSuffix: false });

      await sql`
        INSERT INTO merch_library (id, source, image_url, label, category, source_post_id, source_video_url, prompt_used)
        VALUES (${id}, 'generate', ${blob.url}, ${label || null}, ${category || "design"}, NULL, NULL, ${prompt})
      `;

      return NextResponse.json({ success: true, id, image_url: blob.url });
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }
  }

  // ── Update label/category on existing merch item ──
  if (action === "update") {
    const { id, label, category } = body;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await sql`
      UPDATE merch_library
      SET label = ${label || null}, category = ${category || null}
      WHERE id = ${id}
    `;
    return NextResponse.json({ success: true });
  }

  // ── Delete a merch item (removes from DB + Blob) ──
  if (action === "delete") {
    const { id } = body;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const [item] = await sql`SELECT image_url FROM merch_library WHERE id = ${id}`;
    if (item?.image_url) {
      try { await del(item.image_url as string); } catch { /* non-fatal */ }
    }
    await sql`DELETE FROM merch_library WHERE id = ${id}`;
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
