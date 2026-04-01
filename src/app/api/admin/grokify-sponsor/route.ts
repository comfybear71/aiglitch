import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { env } from "@/lib/bible/env";
import { put } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";

export const maxDuration = 60;

/**
 * POST /api/admin/grokify-sponsor
 *
 * Takes the sponsor's ACTUAL product image/logo and uses Grok's Image Edit API
 * to place it subliminally into a scene context. The source image IS the real
 * product — Grok edits it into the scene so the actual branding is visible.
 *
 * Uses POST https://api.x.ai/v1/images/edits with the source image.
 * Falls back to text-to-image generation if no product image is available.
 *
 * Body:
 *   - scenePrompt: string — the scene's video prompt (the actual scene content)
 *   - visualPrompt: string — the sponsor's visual_prompt description
 *   - brandName: string — sponsor brand name
 *   - productName: string — sponsor product name
 *   - logoUrl: string — sponsor logo URL (used as source for image editing)
 *   - productImageUrl: string — sponsor product image URL (preferred source)
 *   - productImages: string[] — all product images (rotate through them)
 *   - sceneIndex: number — which scene this is (for rotating through images)
 *
 * Returns:
 *   - grokifiedUrl: string — Vercel Blob URL of the scene image with product placed
 */
export async function POST(request: NextRequest) {
  const isAdmin = await isAdminAuthenticated(request);
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!env.XAI_API_KEY) {
    return NextResponse.json({ error: "XAI_API_KEY not set" }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const scenePrompt = (body.scenePrompt || "") as string;
  const visualPrompt = (body.visualPrompt || "") as string;
  const brandName = (body.brandName || "Sponsor") as string;
  const productName = (body.productName || brandName) as string;
  const logoUrl = (body.logoUrl || "") as string;
  const productImageUrl = (body.productImageUrl || "") as string;
  const productImages = (body.productImages || []) as string[];
  const sceneIndex = (body.sceneIndex || 0) as number;

  if (!scenePrompt) {
    return NextResponse.json({ error: "scenePrompt required" }, { status: 400 });
  }

  // Pick the source image — rotate through product images, fall back to logo
  const allImages = [...productImages];
  if (productImageUrl && !allImages.includes(productImageUrl)) allImages.unshift(productImageUrl);
  if (logoUrl && !allImages.includes(logoUrl)) allImages.push(logoUrl);
  const sourceImageUrl = allImages.length > 0 ? allImages[sceneIndex % allImages.length] : null;

  const sceneContext = scenePrompt.slice(0, 400);

  // Build the edit prompt — tells Grok to place this product into the scene
  const editPrompt = `Place this ${productName} product subliminally into a cinematic scene. The scene: ${sceneContext}. The product/logo must appear naturally in the environment — on a table, as a poster on a wall, on a billboard, on a phone screen, on packaging, on a neon sign, on clothing, on a coffee cup. The product is NOT the focus — it's just naturally THERE, like product placement in a Hollywood movie. Keep the product recognizable but make it feel like part of the world. Cinematic 9:16 vertical format, shallow depth of field, professional color grading.`;

  // Build the images array — up to 5 source images for multi-reference editing
  // This lets Grok see multiple product images (logo, product shots) and weave them all in
  const imageRefs = allImages.slice(0, 5).map(url => ({ url }));

  console.log(`[grokify-sponsor] ${brandName} — ${imageRefs.length > 0 ? `IMAGE EDIT mode (${imageRefs.length} source image(s))` : "TEXT-TO-IMAGE mode (no source images)"}`);
  console.log(`[grokify-sponsor] Scene: "${sceneContext.slice(0, 80)}..."`);
  if (imageRefs.length > 0) console.log(`[grokify-sponsor] Images: ${imageRefs.map(r => r.url.slice(0, 50)).join(", ")}`);

  try {
    let response: Response;

    if (imageRefs.length > 1) {
      // ── MULTI-IMAGE EDIT — Pass up to 5 product images/logos ──
      // Grok sees ALL the actual product images and weaves them into the scene
      response = await fetch("https://api.x.ai/v1/images/edits", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.XAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "grok-imagine-image",
          prompt: editPrompt,
          images: imageRefs,
          n: 1,
          aspect_ratio: "9:16",
          response_format: "url",
        }),
      });
    } else if (imageRefs.length === 1) {
      // ── SINGLE IMAGE EDIT — One product image as source ──
      response = await fetch("https://api.x.ai/v1/images/edits", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.XAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "grok-imagine-image",
          prompt: editPrompt,
          image: { url: imageRefs[0].url },
          n: 1,
          aspect_ratio: "9:16",
          response_format: "url",
        }),
      });
    } else {
      // ── FALLBACK: TEXT-TO-IMAGE — No source image available ──
      const productDesc = visualPrompt.slice(0, 300);
      const fallbackPrompt = `A cinematic 9:16 vertical film frame. The scene: ${sceneContext}. SUBLIMINAL PRODUCT PLACEMENT: ${productDesc}. The "${brandName}" logo appears on a billboard, wall poster, phone screen, or neon sign in the background. The SCENE is the focus — the product is just naturally part of the world. Cinematic lighting, shallow depth of field.`;

      response = await fetch("https://api.x.ai/v1/images/generations", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.XAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "grok-imagine-image",
          prompt: fallbackPrompt,
          n: 1,
          aspect_ratio: "9:16",
          resolution: "2k",
          response_format: "url",
        }),
      });
    }

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[grokify-sponsor] Grok failed: ${response.status} ${errText.slice(0, 200)}`);
      return NextResponse.json({ grokifiedUrl: null, error: `Grok failed: ${response.status}` });
    }

    const data = await response.json();
    const imageData = data.data?.[0];

    if (!imageData?.url) {
      console.error("[grokify-sponsor] No image in response");
      return NextResponse.json({ grokifiedUrl: null, error: "No image in response" });
    }

    // Persist to Vercel Blob — Grok URLs expire quickly
    const grokUrl = imageData.url as string;
    console.log(`[grokify-sponsor] Generated: ${grokUrl.slice(0, 80)}...`);

    const imgRes = await fetch(grokUrl);
    if (!imgRes.ok) {
      console.error(`[grokify-sponsor] Download failed: ${imgRes.status}`);
      return NextResponse.json({ grokifiedUrl: null, error: "Download failed" });
    }

    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
    const blob = await put(`sponsors/grokified/${uuidv4()}.png`, imgBuffer, {
      access: "public",
      contentType: "image/png",
      addRandomSuffix: false,
    });

    console.log(`[grokify-sponsor] Saved: ${blob.url} (${(imgBuffer.length / 1024 / 1024).toFixed(2)}MB) [${sourceImageUrl ? "edited" : "generated"}]`);

    return NextResponse.json({
      grokifiedUrl: blob.url,
      brandName,
      productName,
      mode: sourceImageUrl ? "image-edit" : "text-to-image",
      sizeMb: (imgBuffer.length / 1024 / 1024).toFixed(2),
    });
  } catch (err) {
    console.error("[grokify-sponsor] Error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ grokifiedUrl: null, error: err instanceof Error ? err.message : "Failed" });
  }
}
