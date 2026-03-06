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

// POST: Generate voice audio for a text message using xAI Realtime API
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

  // Check cache first
  const cacheKey = `${voiceConfig.voice}:${trimmedText}`;
  const cached = getCachedAudio(cacheKey);
  if (cached) {
    const arrayBuffer = cached.buffer.slice(cached.byteOffset, cached.byteOffset + cached.byteLength);
    return new NextResponse(arrayBuffer as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": cached.byteLength.toString(),
        "Cache-Control": "public, max-age=3600",
        "X-Voice-Source": "cache",
      },
    });
  }

  try {
    // Use xAI Realtime API via WebSocket to generate speech from text
    const audioChunks: string[] = [];

    await new Promise<void>((resolve, reject) => {
      // Dynamic import for server-side WebSocket
      import("ws").then(({ default: WebSocket }) => {
        const ws = new WebSocket("wss://api.x.ai/v1/realtime", {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        });

        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error("Voice generation timed out"));
        }, 15000);

        ws.on("open", () => {
          // Configure session with persona voice
          ws.send(JSON.stringify({
            type: "session.update",
            session: {
              voice: voiceConfig.voice,
              input_audio_format: "pcm16",
              output_audio_format: "pcm16",
              instructions: "You are a text-to-speech converter. Read the following text exactly as written, with appropriate emotion and tone. Do not add any extra words.",
            },
          }));

          // Send the text as a conversation item
          ws.send(JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "message",
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: `Read this aloud exactly: "${trimmedText}"`,
                },
              ],
            },
          }));

          // Trigger response generation
          ws.send(JSON.stringify({
            type: "response.create",
            response: {
              modalities: ["audio", "text"],
            },
          }));
        });

        ws.on("message", (data: Buffer) => {
          try {
            const event = JSON.parse(data.toString());

            if (event.type === "response.audio.delta") {
              audioChunks.push(event.delta);
            } else if (event.type === "response.done") {
              clearTimeout(timeout);
              ws.close();
              resolve();
            } else if (event.type === "error") {
              clearTimeout(timeout);
              ws.close();
              reject(new Error(event.error?.message || "xAI voice error"));
            }
          } catch {
            // Ignore parse errors on non-JSON messages
          }
        });

        ws.on("error", (err: Error) => {
          clearTimeout(timeout);
          reject(err);
        });

        ws.on("close", () => {
          clearTimeout(timeout);
          resolve();
        });
      }).catch(reject);
    });

    if (audioChunks.length === 0) {
      // No audio generated — fallback to Google TTS
      return generateGoogleTTS(trimmedText);
    }

    // Combine base64 PCM chunks into a single buffer
    const combinedPcm = Buffer.concat(
      audioChunks.map(chunk => Buffer.from(chunk, "base64"))
    );

    // Convert PCM16 to WAV format
    const wavBuffer = pcmToWav(combinedPcm, 24000, 1, 16);

    // Cache for future requests
    setCachedAudio(cacheKey, wavBuffer);

    // Convert Buffer to ArrayBuffer for NextResponse compatibility
    const arrayBuffer = wavBuffer.buffer.slice(wavBuffer.byteOffset, wavBuffer.byteOffset + wavBuffer.byteLength);
    return new NextResponse(arrayBuffer as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": wavBuffer.byteLength.toString(),
        "Cache-Control": "public, max-age=3600",
        "X-Voice-Source": "xai-realtime",
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

// Convert raw PCM16 data to WAV format
function pcmToWav(pcmData: Buffer, sampleRate: number, numChannels: number, bitsPerSample: number): Buffer {
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmData.length;
  const headerSize = 44;
  const buffer = Buffer.alloc(headerSize + dataSize);

  // RIFF header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);

  // fmt sub-chunk
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // Sub-chunk size
  buffer.writeUInt16LE(1, 20); // PCM format
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data sub-chunk
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  pcmData.copy(buffer, 44);

  return buffer;
}
