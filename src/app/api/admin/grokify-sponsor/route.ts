import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { env } from "@/lib/bible/env";
import { put } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";

export const maxDuration = 60;

/**
 * POST /api/admin/grokify-sponsor
 *
 * Takes a sponsor's product image/logo and a scene description,
 * uses Grok Image API to generate a new scene image with the
 * sponsor product naturally placed in the scene context.
 *
 * The returned blob URL can then be used as `image_url` for
 * Grok video generation, so the video clip starts from a frame
 * where the sponsor product is already visible.
 *
 * Body:
 *   - sponsorImageUrl: string — the sponsor's product image or logo URL
 *   - scenePrompt: string — the scene's video prompt (used to match visual style)
 *   - brandName: string — sponsor brand name
 *   - productName: string — sponsor product name
 *
 * Returns:
 *   - grokifiedUrl: string — Vercel Blob URL of the Grokified scene image
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
  const sponsorImageUrl = body.sponsorImageUrl as string | undefined;
  const scenePrompt = (body.scenePrompt || "") as string;
  const brandName = (body.brandName || "Sponsor") as string;
  const productName = (body.productName || brandName) as string;

  if (!sponsorImageUrl) {
    return NextResponse.json({ error: "sponsorImageUrl required" }, { status: 400 });
  }

  // Extract scene context — take first 300 chars of the scene prompt for style matching
  const sceneContext = scenePrompt.slice(0, 300);

  // Build a prompt that places the sponsor product naturally in a scene
  // The Grok Image API will generate a NEW image that looks like a frame from the video
  // but with the sponsor product clearly visible
  const imagePrompt = `A cinematic 16:9 film frame from a professional video production. The scene shows: ${sceneContext}. IMPORTANT: Prominently featured in this scene is the ${productName} by ${brandName} — the product is naturally placed in the scene (on a table, held by a character, on a shelf, on a screen, or as part of the environment). The product must be clearly visible, well-lit, and recognizable but feel like a natural part of the scene — not a cut-out or overlay. Think product placement in a Hollywood movie: subtle but unmissable. Cinematic lighting, shallow depth of field, professional color grading. 16:9 widescreen aspect ratio.`;

  console.log(`[grokify-sponsor] Generating scene image for ${brandName} (${productName})`);
  console.log(`[grokify-sponsor] Image URL: ${sponsorImageUrl.slice(0, 60)}...`);

  try {
    // Use Grok Image API to generate the scene image
    // Note: grok-imagine-image doesn't support reference/input images directly,
    // so we describe the product in text. The sponsor's actual image URL is used
    // later as image_url for the video clip (animating FROM the Grokified scene).
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
        aspect_ratio: "16:9",
        resolution: "2k",
        response_format: "url",
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[grokify-sponsor] Grok image API failed: ${response.status} ${errText.slice(0, 200)}`);
      // Fall back to using the original sponsor image directly
      return NextResponse.json({
        grokifiedUrl: sponsorImageUrl,
        fallback: true,
        error: `Grok image failed: ${response.status}`,
      });
    }

    const data = await response.json();
    const imageData = data.data?.[0];

    if (!imageData?.url) {
      console.error("[grokify-sponsor] Grok returned no image URL");
      return NextResponse.json({
        grokifiedUrl: sponsorImageUrl,
        fallback: true,
        error: "No image in response",
      });
    }

    // Persist to Vercel Blob (Grok URLs are ephemeral — they expire quickly)
    const grokUrl = imageData.url as string;
    console.log(`[grokify-sponsor] Grok generated: ${grokUrl.slice(0, 80)}...`);

    const imgRes = await fetch(grokUrl);
    if (!imgRes.ok) {
      console.error(`[grokify-sponsor] Failed to download Grok image: ${imgRes.status}`);
      return NextResponse.json({
        grokifiedUrl: sponsorImageUrl,
        fallback: true,
        error: "Failed to download generated image",
      });
    }

    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
    const blob = await put(`sponsors/grokified/${uuidv4()}.png`, imgBuffer, {
      access: "public",
      contentType: "image/png",
      addRandomSuffix: false,
    });

    console.log(`[grokify-sponsor] Persisted to Blob: ${blob.url}`);

    return NextResponse.json({
      grokifiedUrl: blob.url,
      fallback: false,
      brandName,
      productName,
      sizeMb: (imgBuffer.length / 1024 / 1024).toFixed(2),
    });
  } catch (err) {
    console.error("[grokify-sponsor] Error:", err instanceof Error ? err.message : err);
    // Fall back to using the original sponsor image
    return NextResponse.json({
      grokifiedUrl: sponsorImageUrl,
      fallback: true,
      error: err instanceof Error ? err.message : "Failed",
    });
  }
}
