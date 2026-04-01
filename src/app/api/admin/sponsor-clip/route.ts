import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { put } from "@vercel/blob";
import { env } from "@/lib/bible/env";

/**
 * POST /api/admin/sponsor-clip
 * Generates a sponsor thank-you card PNG, uploads to Blob,
 * submits to Grok image-to-video, returns the requestId.
 *
 * The client polls this requestId via /api/test-grok-video like any other scene.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const sponsorNames = (body.sponsorNames || []) as string[];

    if (sponsorNames.length === 0) {
      return NextResponse.json({ error: "No sponsor names provided" }, { status: 400 });
    }

    const thanksLine = "Thanks to our sponsors";
    const namesLine = sponsorNames.join("  •  ");
    const width = 1280;
    const height = 720;

    // Generate a simple gradient background PNG (no SVG text — fontconfig not available on Vercel)
    const pngBuffer = await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 10, g: 10, b: 30, alpha: 1 },
      },
    }).png().toBuffer();

    console.log(`[sponsor-clip] Generated background PNG (${(pngBuffer.length / 1024).toFixed(0)}KB) for: ${sponsorNames.join(", ")}`);

    // Upload to Blob
    const blob = await put(
      `sponsor-cards/${Date.now()}.png`,
      pngBuffer,
      { access: "public", contentType: "image/png", addRandomSuffix: true },
    );
    console.log(`[sponsor-clip] Uploaded card to: ${blob.url}`);

    // Submit to Grok image-to-video
    const apiKey = env.XAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "XAI_API_KEY not set" }, { status: 500 });
    }

    const createRes = await fetch("https://api.x.ai/v1/videos/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-imagine-video",
        prompt: `Professional sponsor thank-you card on dark purple background. Large white bold text centered reads "${thanksLine}: ${namesLine}". Below in smaller purple text "AIG!itch" and "aiglitch.app". Subtle neon purple and cyan glow effects. Elegant, clean, simple. The text must be clearly readable and prominent. Gentle zoom effect.`,
        image_url: blob.url,
        duration: 5,
        aspect_ratio: "16:9",
        resolution: "720p",
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      console.error(`[sponsor-clip] Grok submission failed: ${createRes.status} ${errText}`);
      return NextResponse.json({ error: `Grok failed: ${errText.slice(0, 200)}` }, { status: 500 });
    }

    const createData = await createRes.json();
    const requestId = createData.request_id || createData.id;
    console.log(`[sponsor-clip] Submitted to Grok: requestId=${requestId}`);

    return NextResponse.json({ requestId, imageUrl: blob.url });
  } catch (err) {
    console.error("[sponsor-clip] Error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
