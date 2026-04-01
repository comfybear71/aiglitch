import { NextRequest, NextResponse } from "next/server";
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

    // Submit text-to-video (NOT image-to-video — that distorts/glitches the card)
    const apiKey = env.XAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "XAI_API_KEY not set" }, { status: 500 });
    }

    console.log(`[sponsor-clip] Submitting text-to-video for: ${sponsorNames.join(", ")}`);

    const createRes = await fetch("https://api.x.ai/v1/videos/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-imagine-video",
        prompt: `A professional, clean, static sponsor thank-you card. Dark navy/purple gradient background. In the center of the frame, large crisp white bold text reads: "${thanksLine}" on the first line. Below it in even larger white text: "${namesLine}". Below that, smaller purple glowing text: "AIG!itch" and below "aiglitch.app". Subtle neon purple and cyan accent lines at top and bottom edges. The card is STATIC — minimal movement, just a very subtle glow pulse on the text. Think TV end credits sponsor acknowledgment. The text MUST be the main focus, clearly readable, centered, and prominent against the dark background. Professional broadcast quality.`,
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

    return NextResponse.json({ requestId });
  } catch (err) {
    console.error("[sponsor-clip] Error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
