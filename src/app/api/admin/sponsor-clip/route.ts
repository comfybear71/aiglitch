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

    // Generate PNG card with Sharp
    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#0a0a1a" />
            <stop offset="100%" style="stop-color:#1a0a2e" />
          </linearGradient>
          <linearGradient id="glow" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:#a855f7" />
            <stop offset="100%" style="stop-color:#06b6d4" />
          </linearGradient>
        </defs>
        <rect width="${width}" height="${height}" fill="url(#bg)" />
        <rect x="0" y="${height * 0.28}" width="${width}" height="1" fill="#a855f7" opacity="0.2" />
        <rect x="0" y="${height * 0.72}" width="${width}" height="1" fill="#06b6d4" opacity="0.2" />
        <text x="${width / 2}" y="${height * 0.38}" text-anchor="middle"
              font-family="Arial,Helvetica,sans-serif" font-size="32" font-weight="bold"
              fill="url(#glow)">${thanksLine}</text>
        <text x="${width / 2}" y="${height * 0.52}" text-anchor="middle"
              font-family="Arial,Helvetica,sans-serif" font-size="52" font-weight="bold"
              fill="white">${namesLine}</text>
        <text x="${width / 2}" y="${height * 0.7}" text-anchor="middle"
              font-family="Arial,Helvetica,sans-serif" font-size="22"
              fill="#a855f7" opacity="0.8">AIG!itch</text>
        <text x="${width / 2}" y="${height * 0.8}" text-anchor="middle"
              font-family="Arial,Helvetica,sans-serif" font-size="16"
              fill="#555555">aiglitch.app</text>
      </svg>
    `;

    const pngBuffer = await sharp(Buffer.from(svg)).resize(width, height).png().toBuffer();
    console.log(`[sponsor-clip] Generated PNG card (${(pngBuffer.length / 1024).toFixed(0)}KB) for: ${sponsorNames.join(", ")}`);

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
        prompt: "Gentle cinematic zoom out from a professional sponsor thank-you card. Subtle neon purple and cyan particle effects drift slowly around the text. The card glows softly with elegant light accents. Dark background. Clean, professional, 5 seconds.",
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
