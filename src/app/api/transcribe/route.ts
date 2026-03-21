import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/bible/env";

/**
 * POST /api/transcribe
 * Accepts audio as base64 and returns transcribed text.
 * Uses xAI's OpenAI-compatible transcription endpoint, with Groq Whisper fallback.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { audio_base64, mime_type = "audio/m4a" } = body;

    if (!audio_base64) {
      return NextResponse.json({ error: "Missing audio_base64" }, { status: 400 });
    }

    // Convert base64 to buffer
    const audioBuffer = Buffer.from(audio_base64, "base64");

    // Determine file extension from mime type
    const ext = mime_type.includes("wav") ? "wav" : mime_type.includes("webm") ? "webm" : "m4a";

    // Try xAI transcription first (primary — OpenAI-compatible endpoint)
    const xaiKey = env.XAI_API_KEY;
    let xaiError: string | null = null;
    let groqError: string | null = null;

    if (xaiKey) {
      try {
        const transcript = await transcribeWithOpenAICompat(
          "https://api.x.ai/v1/audio/transcriptions",
          xaiKey,
          audioBuffer,
          ext,
          "grok-2-vision-latest" // xAI's model for audio transcription
        );
        if (transcript) {
          return NextResponse.json({ text: transcript, source: "xai" });
        }
        xaiError = "Empty transcript returned";
      } catch (e) {
        xaiError = e instanceof Error ? e.message : String(e);
        console.warn("xAI transcription failed, trying fallback:", xaiError);
      }
    }

    // Fallback: Groq free Whisper endpoint
    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey) {
      try {
        const transcript = await transcribeWithOpenAICompat(
          "https://api.groq.com/openai/v1/audio/transcriptions",
          groqKey,
          audioBuffer,
          ext,
          "whisper-large-v3"
        );
        if (transcript) {
          return NextResponse.json({ text: transcript, source: "groq" });
        }
        groqError = "Empty transcript returned";
      } catch (e) {
        groqError = e instanceof Error ? e.message : String(e);
        console.warn("Groq transcription failed:", groqError);
      }
    }

    // Return diagnostic info so we can see what actually failed
    return NextResponse.json(
      {
        error: "Transcription failed",
        debug: {
          xai_key_set: !!xaiKey,
          groq_key_set: !!groqKey,
          xai_error: xaiError,
          groq_error: groqError,
        },
      },
      { status: 503 }
    );
  } catch (error) {
    console.error("Transcription error:", error);
    return NextResponse.json({ error: "Transcription failed" }, { status: 500 });
  }
}

async function transcribeWithOpenAICompat(
  url: string,
  apiKey: string,
  audioBuffer: Buffer,
  ext: string,
  model: string
): Promise<string | null> {
  // Build multipart form data manually for Node.js
  const boundary = "----TranscribeBoundary" + Date.now();
  const parts: Buffer[] = [];

  // Model field
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${model}\r\n`
  ));

  // Language field (optional, helps accuracy)
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\nen\r\n`
  ));

  // Audio file field
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

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body: bodyBuffer,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Transcription API ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return data.text?.trim() || null;
}
