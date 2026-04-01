import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { env } from "@/lib/bible/env";
import { put } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";

export const maxDuration = 60;

/**
 * POST /api/admin/grokify-sponsor
 *
 * Generates a scene image with sponsor products subliminally placed.
 * Uses the scene's actual video prompt as the base, then weaves in
 * the sponsor's visual_prompt so the product appears naturally —
 * on a table, as a poster on a wall, on a screen in the background.
 *
 * The returned blob URL is used as `image_url` for Grok video generation.
 * The video clip animates from this frame, keeping the product visible
 * throughout the scene subliminally.
 *
 * Body:
 *   - scenePrompt: string — the scene's video prompt (the actual scene content)
 *   - visualPrompt: string — the sponsor's visual_prompt (how the product should appear)
 *   - brandName: string — sponsor brand name
 *   - productName: string — sponsor product name
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

  if (!scenePrompt) {
    return NextResponse.json({ error: "scenePrompt required" }, { status: 400 });
  }

  // Build a prompt that IS the scene but with the sponsor product AND logo placed subliminally.
  // The scene prompt describes what's happening. The visual prompt describes the product.
  // The logo gets placed on environmental surfaces throughout the scene.
  const sceneContext = scenePrompt.slice(0, 400);
  const productDesc = visualPrompt.slice(0, 300);

  // Logo placement — the brand logo/name appears on surfaces throughout the scene
  const logoPlacement = `The "${brandName}" brand logo and name appear subliminally throughout: on a billboard in the background, as a poster on a wall, on a phone screen a character holds, on a branded shopping bag, printed on a coffee cup, on a neon sign, as graffiti art, on clothing/t-shirt, on a laptop sticker, on a bus stop ad, on product packaging. At least 2-3 of these logo placements must be visible in the scene.`;

  const imagePrompt = `A cinematic 9:16 vertical film frame. The scene: ${sceneContext}. SUBLIMINAL PRODUCT PLACEMENT (naturally part of the world, NOT the focus): ${productDesc}. ${logoPlacement} The SCENE is the main focus — the product and logos are just naturally THERE, like product placement in a Hollywood movie. Cinematic lighting, shallow depth of field, professional color grading.`;

  console.log(`[grokify-sponsor] Generating scene with ${brandName} product placement`);
  console.log(`[grokify-sponsor] Scene: "${sceneContext.slice(0, 80)}..."`);
  console.log(`[grokify-sponsor] Product: "${productDesc.slice(0, 80)}..."`);

  try {
    const response = await fetch("https://api.x.ai/v1/images/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.XAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-imagine-image",
        prompt: imagePrompt,
        n: 1,
        aspect_ratio: "9:16",
        resolution: "2k",
        response_format: "url",
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[grokify-sponsor] Grok image failed: ${response.status} ${errText.slice(0, 200)}`);
      return NextResponse.json({ grokifiedUrl: null, error: `Grok image failed: ${response.status}` });
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
      return NextResponse.json({ grokifiedUrl: null, error: "Failed to download generated image" });
    }

    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
    const blob = await put(`sponsors/grokified/${uuidv4()}.png`, imgBuffer, {
      access: "public",
      contentType: "image/png",
      addRandomSuffix: false,
    });

    console.log(`[grokify-sponsor] Saved to Blob: ${blob.url} (${(imgBuffer.length / 1024 / 1024).toFixed(2)}MB)`);

    return NextResponse.json({
      grokifiedUrl: blob.url,
      brandName,
      productName,
      sizeMb: (imgBuffer.length / 1024 / 1024).toFixed(2),
    });
  } catch (err) {
    console.error("[grokify-sponsor] Error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ grokifiedUrl: null, error: err instanceof Error ? err.message : "Failed" });
  }
}
