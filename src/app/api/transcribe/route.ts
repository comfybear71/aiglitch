import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/bible/env";

/**
 * POST /api/transcribe
 * Accepts audio as base64 and returns transcribed text.
 * Primary: Claude (native audio input) using existing ANTHROPIC_API_KEY.
 * Fallback: xAI transcription endpoint if Claude unavailable.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { audio_base64, mime_type = "audio/m4a" } = body;

    if (!audio_base64) {
      return NextResponse.json({ error: "Missing audio_base64" }, { status: 400 });
    }

    // Map mime type for Claude's document content block
    const mediaType = mime_type.includes("wav")
      ? "audio/wav"
      : mime_type.includes("webm")
        ? "audio/webm"
        : mime_type.includes("mp3") || mime_type.includes("mpeg")
          ? "audio/mpeg"
          : "audio/mp4";

    // Primary: Claude transcription (uses existing ANTHROPIC_API_KEY)
    const anthropicKey = env.ANTHROPIC_API_KEY;
    if (anthropicKey) {
      try {
        const client = new Anthropic({ apiKey: anthropicKey });
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

        if (text) {
          return NextResponse.json({ text, source: "claude" });
        }
      } catch (e) {
        console.error("Claude transcription failed:", e instanceof Error ? e.message : e);
      }
    }

    // Fallback: xAI transcription endpoint
    const xaiKey = env.XAI_API_KEY;
    if (xaiKey) {
      try {
        const audioBuffer = Buffer.from(audio_base64, "base64");
        const ext = mime_type.includes("wav") ? "wav" : mime_type.includes("webm") ? "webm" : "m4a";
        const transcript = await transcribeWithXai(xaiKey, audioBuffer, ext);
        if (transcript) {
          return NextResponse.json({ text: transcript, source: "xai" });
        }
      } catch (e) {
        console.error("xAI transcription failed:", e instanceof Error ? e.message : e);
      }
    }

    return NextResponse.json(
      { error: "No transcription service available. Check ANTHROPIC_API_KEY." },
      { status: 503 }
    );
  } catch (error) {
    console.error("Transcription error:", error);
    return NextResponse.json({ error: "Transcription failed" }, { status: 500 });
  }
}

async function transcribeWithXai(
  apiKey: string,
  audioBuffer: Buffer,
  ext: string
): Promise<string | null> {
  const boundary = "----TranscribeBoundary" + Date.now();
  const parts: Buffer[] = [];

  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\ngrok-2-vision-latest\r\n`
  ));
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\nen\r\n`
  ));

  const mimeMap: Record<string, string> = {
    m4a: "audio/mp4",
    wav: "audio/wav",
    webm: "audio/webm",
    mp3: "audio/mpeg",
  };
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.${ext}"\r\nContent-Type: ${mimeMap[ext] || "audio/mp4"}\r\n\r\n`
  ));
  parts.push(audioBuffer);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  const bodyBuffer = Buffer.concat(parts);

  const res = await fetch("https://api.x.ai/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body: bodyBuffer,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`xAI API ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return data.text?.trim() || null;
}
