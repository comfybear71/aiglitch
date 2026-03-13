import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/bible/env";
import { getVoiceForPersona } from "@/lib/voice-config";
import { getSetting } from "@/lib/repositories/settings";

// Simple in-memory cache for generated audio (prevents re-generating identical phrases)
// Key: `${voice}:${text}`, Value: { buffer, timestamp }
const audioCache = new Map<string, { buffer: Buffer; timestamp: number }>();
const CACHE_MAX_SIZE = 50;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function getCachedAudio(key: string): Buffer | null {
  const entry = audioCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    audioCache.delete(key);
    return null;
  }
  return entry.buffer;
}

function setCachedAudio(key: string, buffer: Buffer) {
  // Evict oldest entries if at capacity
  if (audioCache.size >= CACHE_MAX_SIZE) {
    const oldest = audioCache.keys().next().value;
    if (oldest) audioCache.delete(oldest);
  }
  audioCache.set(key, { buffer, timestamp: Date.now() });
}

// GET: Check if voice is enabled (admin setting)
export async function GET() {
  try {
    const voiceDisabled = await getSetting("voice_disabled");
    return NextResponse.json({ enabled: voiceDisabled !== "true" });
  } catch {
    return NextResponse.json({ enabled: true });
  }
}

// POST: Generate voice audio using xAI REST TTS API (not WebSocket)
export async function POST(request: NextRequest) {
  // Check admin kill switch
  try {
    const voiceDisabled = await getSetting("voice_disabled");
    if (voiceDisabled === "true") {
      return NextResponse.json({ disabled: true, message: "Voice has been disabled by admin" }, { status: 403 });
    }
  } catch { /* allow if settings unavailable */ }

  const body = await request.json();
  const { text, persona_id, persona_type } = body;

  if (!text?.trim()) {
    return NextResponse.json({ error: "Missing text" }, { status: 400 });
  }

  const trimmedText = text.trim().slice(0, 500); // Limit text length for voice
  const apiKey = env.XAI_API_KEY;

  if (!apiKey) {
    // No xAI key — use free Google Translate TTS as fallback
    return generateGoogleTTS(trimmedText);
  }

  const voiceConfig = getVoiceForPersona(persona_id || "", persona_type);
  // xAI TTS uses lowercase voice_id
  const voiceId = voiceConfig.voice.toLowerCase();

  // Check cache first
  const cacheKey = `${voiceId}:${trimmedText}`;
  const cached = getCachedAudio(cacheKey);
  if (cached) {
    const arrayBuffer = cached.buffer.slice(cached.byteOffset, cached.byteOffset + cached.byteLength);
    return new NextResponse(arrayBuffer as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": cached.byteLength.toString(),
        "Cache-Control": "public, max-age=3600",
        "X-Voice-Source": "cache",
      },
    });
  }

  try {
    // Use xAI REST TTS API — simple, reliable, works on Vercel serverless
    const res = await fetch("https://api.x.ai/v1/tts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: trimmedText,
        voice_id: voiceId,
        output_format: {
          codec: "mp3",
          sample_rate: 24000,
          bit_rate: 128000,
        },
      }),
    });

    if (!res.ok) {
      console.error(`xAI TTS error: ${res.status} ${res.statusText}`);
      // Fallback to Google TTS
      return generateGoogleTTS(trimmedText);
    }

    const audioBuffer = Buffer.from(await res.arrayBuffer());

    // Cache for future requests
    setCachedAudio(cacheKey, audioBuffer);

    const arrayBuffer = audioBuffer.buffer.slice(audioBuffer.byteOffset, audioBuffer.byteOffset + audioBuffer.byteLength);
    return new NextResponse(arrayBuffer as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.byteLength.toString(),
        "Cache-Control": "public, max-age=3600",
        "X-Voice-Source": "xai-tts",
      },
    });
  } catch (error) {
    console.error("Voice generation error:", error);
    // Graceful fallback to Google Translate TTS
    return generateGoogleTTS(trimmedText);
  }
}

// Free Google Translate TTS fallback — no API key needed, decent quality
// Splits long text into chunks (Google TTS has a ~200 char limit per request)
async function generateGoogleTTS(text: string): Promise<NextResponse> {
  const cacheKey = `gtts:${text}`;
  const cached = getCachedAudio(cacheKey);
  if (cached) {
    const arrayBuffer = cached.buffer.slice(cached.byteOffset, cached.byteOffset + cached.byteLength);
    return new NextResponse(arrayBuffer as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": cached.byteLength.toString(),
        "Cache-Control": "public, max-age=3600",
        "X-Voice-Source": "google-translate",
      },
    });
  }

  try {
    // Split text into chunks of ~200 chars at word boundaries
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > 0) {
      if (remaining.length <= 200) {
        chunks.push(remaining);
        break;
      }
      let splitAt = remaining.lastIndexOf(" ", 200);
      if (splitAt <= 0) splitAt = 200;
      chunks.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt).trim();
    }

    // Fetch audio for each chunk
    const audioBuffers: Buffer[] = [];
    for (const chunk of chunks) {
      const encoded = encodeURIComponent(chunk);
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encoded}&tl=en&client=tw-ob`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
      if (!res.ok) throw new Error(`Google TTS returned ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      audioBuffers.push(buf);
    }

    const combined = Buffer.concat(audioBuffers);
    setCachedAudio(cacheKey, combined);

    const arrayBuffer = combined.buffer.slice(combined.byteOffset, combined.byteOffset + combined.byteLength);
    return new NextResponse(arrayBuffer as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": combined.byteLength.toString(),
        "Cache-Control": "public, max-age=3600",
        "X-Voice-Source": "google-translate",
      },
    });
  } catch (error) {
    console.error("Google TTS fallback error:", error);
    return NextResponse.json(
      { error: "Voice generation unavailable" },
      { status: 503 }
    );
  }
}
