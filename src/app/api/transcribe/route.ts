import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/bible/env";

/**
 * POST /api/transcribe
 * Accepts audio as base64 and returns transcribed text.
 * Uses Claude's native audio input support — no extra API keys needed.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { audio_base64, mime_type = "audio/mp4" } = body;

    if (!audio_base64) {
      return NextResponse.json({ error: "Missing audio_base64" }, { status: 400 });
    }

    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 503 }
      );
    }

    // Map common mime types to what the API expects
    const mediaType = mime_type.includes("wav")
      ? "audio/wav"
      : mime_type.includes("webm")
        ? "audio/webm"
        : mime_type.includes("mp3") || mime_type.includes("mpeg")
          ? "audio/mpeg"
          : "audio/mp4";

    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Transcribe this audio exactly as spoken. Return ONLY the transcribed text, nothing else. No quotes, no labels, no explanation.",
            },
            {
              type: "document",
              source: {
                type: "base64",
                media_type: mediaType,
                data: audio_base64,
              },
            },
          ],
        },
      ],
    });

    const text =
      message.content[0]?.type === "text" ? message.content[0].text.trim() : null;

    if (!text) {
      return NextResponse.json(
        { error: "No transcription returned" },
        { status: 502 }
      );
    }

    return NextResponse.json({ text, source: "claude" });
  } catch (error) {
    console.error("Transcription error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Transcription failed: ${msg}` }, { status: 500 });
  }
}
