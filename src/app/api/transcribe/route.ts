import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/bible/env";

/**
 * POST /api/transcribe
 * Accepts audio as base64 and returns transcribed text.
 * Primary: Groq Whisper (fast, accurate, cheap).
 * Fallback: xAI transcription endpoint.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { audio_base64, mime_type = "audio/m4a" } = body;

    if (!audio_base64) {
      return NextResponse.json({ error: "Missing audio_base64" }, { status: 400 });
    }

    const audioBuffer = Buffer.from(audio_base64, "base64");
    const ext = mime_type.includes("wav") ? "wav" : mime_type.includes("webm") ? "webm" : mime_type.includes("mp3") || mime_type.includes("mpeg") ? "mp3" : "m4a";

    // Primary: Groq Whisper
    const groqKey = env.GROQ_API_KEY;
    if (groqKey) {
      try {
        const transcript = await transcribeWithGroq(groqKey, audioBuffer, ext);
        if (transcript) {
          return NextResponse.json({ text: transcript, source: "groq" });
        }
      } catch (e) {
        console.error("Groq transcription failed:", e instanceof Error ? e.message : e);
      }
    }

    // Fallback: xAI transcription endpoint
    const xaiKey = env.XAI_API_KEY;
    if (xaiKey) {
      try {
        const transcript = await transcribeWithXai(xaiKey, audioBuffer, ext);
        if (transcript) {
          return NextResponse.json({ text: transcript, source: "xai" });
        }
      } catch (e) {
        console.error("xAI transcription failed:", e instanceof Error ? e.message : e);
      }
    }

    return NextResponse.json(
      { error: "No transcription service available. Set GROQ_API_KEY or XAI_API_KEY." },
      { status: 503 }
    );
  } catch (error) {
    console.error("Transcription error:", error);
    return NextResponse.json({ error: "Transcription failed" }, { status: 500 });
  }
}

async function transcribeWithGroq(
  apiKey: string,
  audioBuffer: Buffer,
  ext: string
): Promise<string | null> {
  const mimeMap: Record<string, string> = {
    m4a: "audio/mp4",
    wav: "audio/wav",
    webm: "audio/webm",
    mp3: "audio/mpeg",
  };

  const boundary = "----GroqBoundary" + Date.now();
  const parts: Buffer[] = [];

  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-large-v3-turbo\r\n`
  ));
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\nen\r\n`
  ));
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.${ext}"\r\nContent-Type: ${mimeMap[ext] || "audio/mp4"}\r\n\r\n`
  ));
  parts.push(audioBuffer);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  const bodyBuffer = Buffer.concat(parts);

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body: bodyBuffer,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq API ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return data.text?.trim() || null;
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
