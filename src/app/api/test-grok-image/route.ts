import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";

export const maxDuration = 60;

/**
 * Test Grok image generation — generates ONE image and returns the URL.
 * No blob persistence, no DB writes — pure API test.
 */
export async function POST(request: NextRequest) {
  const isAdmin = await isAdminAuthenticated();
  if (!isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 401 });
  }

  if (!process.env.XAI_API_KEY) {
    return NextResponse.json({ error: "XAI_API_KEY not set", hasKey: false }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const prompt = body.prompt || "A glowing neon cyberpunk city at night with flying cars, in Rick and Morty cartoon style, thick outlines, bright saturated colors";
  const pro = body.pro ?? false;
  const model = pro ? "grok-imagine-image-pro" : "grok-imagine-image";

  console.log(`[test-grok-image] Generating with ${model}: "${prompt.slice(0, 80)}..."`);

  try {
    const response = await fetch("https://api.x.ai/v1/images/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.XAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt,
        n: 1,
        response_format: "url",
      }),
    });

    const responseText = await response.text();

    if (!response.ok) {
      return NextResponse.json({
        success: false,
        error: `HTTP ${response.status}: ${responseText.slice(0, 500)}`,
        hasKey: true,
        model,
      });
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(responseText);
    } catch {
      return NextResponse.json({
        success: false,
        error: `Invalid JSON: ${responseText.slice(0, 300)}`,
        hasKey: true,
        model,
      });
    }

    const imageData = (data.data as Record<string, unknown>[])?.[0];
    if (!imageData) {
      return NextResponse.json({
        success: false,
        error: "No image data in response",
        raw: responseText.slice(0, 500),
        hasKey: true,
        model,
      });
    }

    const imageUrl = imageData.url as string || null;
    const b64 = imageData.b64_json as string || null;

    if (imageUrl) {
      return NextResponse.json({
        success: true,
        imageUrl,
        model,
        prompt: prompt.slice(0, 200),
      });
    }

    if (b64) {
      return NextResponse.json({
        success: true,
        imageUrl: `data:image/png;base64,${b64.slice(0, 100)}...`,
        model,
        prompt: prompt.slice(0, 200),
        note: "Base64 image returned (truncated in response)",
      });
    }

    return NextResponse.json({
      success: false,
      error: "Unexpected response format",
      raw: responseText.slice(0, 500),
      hasKey: true,
      model,
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
      hasKey: true,
      model,
    });
  }
}
