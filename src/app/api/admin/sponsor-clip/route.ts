import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/bible/env";

/**
 * POST /api/admin/sponsor-clip
 * Generates a sponsor thank-you clip via Grok video generation.
 * If sponsor product images are provided, uses image-to-video with the first
 * product image as a visual reference so the sponsor's actual product appears.
 * Otherwise falls back to text-to-video with a descriptive prompt.
 *
 * The client polls this requestId via /api/test-grok-video like any other scene.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const sponsorNames = (body.sponsorNames || []) as string[];
    const sponsorImages = (body.sponsorImages || []) as string[];

    if (sponsorNames.length === 0) {
      return NextResponse.json({ error: "No sponsor names provided" }, { status: 400 });
    }

    const apiKey = env.XAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "XAI_API_KEY not set" }, { status: 500 });
    }

    const namesLine = sponsorNames.join(", ");
    const hasProductImage = sponsorImages.length > 0;

    console.log(`[sponsor-clip] Generating for: ${namesLine}, ${sponsorImages.length} product image(s)`);

    // Build the video generation request
    // If we have a product image, use it as image_url so the sponsor's actual product
    // appears in the clip (Grok animates from the image as first frame)
    const videoBody: Record<string, unknown> = {
      model: "grok-imagine-video",
      duration: 5,
      aspect_ratio: "16:9",
      resolution: "720p",
    };

    if (hasProductImage) {
      // Use product image as starting frame — Grok will animate from it
      // This ensures the actual product/logo is visible, not AI-hallucinated text
      videoBody.image_url = sponsorImages[0];
      videoBody.prompt = `A cinematic product showcase clip. The ${namesLine} product rotates slowly on a sleek dark surface with dramatic purple and cyan neon lighting. Premium product photography style with volumetric light rays. The product is the star — luxurious, desirable, beautifully lit. Subtle particle effects and lens flares. High-end commercial quality, like a Super Bowl ad. Camera slowly orbits the product. Dark background with professional studio lighting.`;
      console.log(`[sponsor-clip] Using product image as starting frame: ${sponsorImages[0].slice(0, 60)}...`);
    } else {
      // Fallback: text-to-video with abstract branding (no specific text to render)
      videoBody.prompt = `A premium sponsor acknowledgment clip. Dark navy and purple gradient background with elegant neon purple and cyan light streaks. A golden spotlight slowly illuminates the center of the frame revealing a luxurious glowing emblem. Subtle particle effects float upward. The mood is grateful and prestigious — like an awards show sponsor moment. Cinematic lens flares, shallow depth of field, professional broadcast quality. Slow elegant camera push-in. Think high-end TV broadcast sponsor card with abstract beauty.`;
    }

    const createRes = await fetch("https://api.x.ai/v1/videos/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(videoBody),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      console.error(`[sponsor-clip] Grok submission failed: ${createRes.status} ${errText}`);
      return NextResponse.json({ error: `Grok failed: ${errText.slice(0, 200)}` }, { status: 500 });
    }

    const createData = await createRes.json();
    const requestId = createData.request_id || createData.id;
    console.log(`[sponsor-clip] Submitted to Grok: requestId=${requestId}, mode=${hasProductImage ? "image-to-video" : "text-to-video"}`);

    return NextResponse.json({ requestId, mode: hasProductImage ? "image-to-video" : "text-to-video" });
  } catch (err) {
    console.error("[sponsor-clip] Error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
