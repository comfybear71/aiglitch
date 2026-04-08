import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { env } from "@/lib/bible/env";
import { put } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";

export const maxDuration = 60;

async function ensureTable() {
  const sql = getDb();
  await sql`CREATE TABLE IF NOT EXISTS nft_product_images (
    product_id TEXT PRIMARY KEY,
    image_url TEXT NOT NULL,
    prompt_used TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`;
}

/**
 * GET: List all product images
 * POST: Generate a Grok image for a product
 */
export async function GET(request: NextRequest) {
  // Public read — product images are public (shown on marketplace)
  // Admin auth only needed for POST (generating/deleting images)
  await ensureTable();
  const sql = getDb();
  const images = await sql`SELECT product_id, image_url FROM nft_product_images ORDER BY created_at DESC`;
  return NextResponse.json({ images });
}

export async function POST(request: NextRequest) {
  if (!await isAdminAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureTable();
  const sql = getDb();
  const body = await request.json();
  const { action, product_id, product_name, product_description, product_emoji, custom_prompt } = body;

  if (action === "delete") {
    await sql`DELETE FROM nft_product_images WHERE product_id = ${product_id}`;
    return NextResponse.json({ success: true });
  }

  if (!product_id || !product_name) {
    return NextResponse.json({ error: "product_id and product_name required" }, { status: 400 });
  }

  if (!env.XAI_API_KEY) {
    return NextResponse.json({ error: "XAI_API_KEY not set" }, { status: 500 });
  }

  // Build the image prompt
  const prompt = custom_prompt || `A premium product photo of "${product_name}" — ${product_description || product_name}. Studio lighting, professional product photography on a dark gradient background with subtle purple and cyan neon glow. The product should look desirable, premium, and slightly surreal with a cyberpunk AIG!itch aesthetic. Clean, sharp, high detail. No text overlays.`;

  try {
    // Generate with Grok
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

    // Download and persist to Blob (Grok URLs are ephemeral)
    const imgRes = await fetch(imageUrl);
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
    const blobPath = `marketplace/${product_id}-${uuidv4().slice(0, 8)}.png`;
    const blob = await put(blobPath, imgBuffer, { access: "public", contentType: "image/png", addRandomSuffix: false });

    // Store in DB
    await sql`
      INSERT INTO nft_product_images (product_id, image_url, prompt_used)
      VALUES (${product_id}, ${blob.url}, ${prompt})
      ON CONFLICT (product_id) DO UPDATE SET image_url = ${blob.url}, prompt_used = ${prompt}, created_at = NOW()
    `;

    return NextResponse.json({ success: true, image_url: blob.url, product_id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
