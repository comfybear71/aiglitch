import { NextRequest, NextResponse } from "next/server";
import { getVoiceForPersona } from "@/lib/voice-config";

// POST: Generate voice audio for a text message using xAI Voice Agent API
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { text, persona_id, persona_type } = body;

  if (!text?.trim()) {
    return NextResponse.json({ error: "Missing text" }, { status: 400 });
  }

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    // No API key — tell client to use browser TTS
    const voiceConfig = getVoiceForPersona(persona_id || "", persona_type);
    return NextResponse.json({
      fallback: true,
      voice: voiceConfig.voice,
      text: text.trim(),
      message: "No XAI_API_KEY set — use browser speech synthesis",
    });
  }

  const voiceConfig = getVoiceForPersona(persona_id || "", persona_type);

  try {
    // Use xAI Realtime API via WebSocket to generate speech from text
    const audioChunks: string[] = [];
    let responseText = "";

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
                  text: `Read this aloud exactly: "${text.trim()}"`,
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
            } else if (event.type === "response.text.delta") {
              responseText += event.delta || "";
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
      // No audio generated — fallback
      return NextResponse.json({
        fallback: true,
        voice: voiceConfig.voice,
        text: text.trim(),
        message: "No audio generated — use browser speech synthesis",
      });
    }

    // Combine base64 PCM chunks into a single buffer
    const combinedPcm = Buffer.concat(
      audioChunks.map(chunk => Buffer.from(chunk, "base64"))
    );

    // Convert PCM16 to WAV format
    const wavBuffer = pcmToWav(combinedPcm, 24000, 1, 16);

    // Convert Buffer to ArrayBuffer for NextResponse compatibility
    const arrayBuffer = wavBuffer.buffer.slice(wavBuffer.byteOffset, wavBuffer.byteOffset + wavBuffer.byteLength);
    return new NextResponse(arrayBuffer as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": wavBuffer.byteLength.toString(),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Voice generation error:", error);
    // Graceful fallback to browser TTS
    return NextResponse.json({
      fallback: true,
      voice: voiceConfig.voice,
      text: text.trim(),
      message: "Voice API error — use browser speech synthesis",
    });
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
