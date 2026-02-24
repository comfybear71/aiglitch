import Replicate from "replicate";
import { put } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

/**
 * Extract a URL string from a Replicate FileOutput or other result types.
 * FileOutput.url() returns a URL *object*, and .toString() returns the string.
 */
function extractUrl(result: unknown): string | null {
  if (typeof result === "string") return result;

  if (result && typeof result === "object") {
    // FileOutput has a .toString() that returns the URL string
    const str = String(result);
    if (str.startsWith("http")) return str;

    // Also try .url() method (returns URL object)
    if ("url" in result) {
      const urlVal = (result as Record<string, unknown>).url;
      if (typeof urlVal === "function") {
        try {
          const urlResult = urlVal.call(result);
          return String(urlResult);
        } catch {
          // url() failed
        }
      }
      if (typeof urlVal === "string") return urlVal;
      if (urlVal) return String(urlVal);
    }
  }

  return null;
}

/**
 * Download media from a temporary Replicate URL and upload to Vercel Blob
 * for permanent CDN-backed storage. Falls back to the temp URL if Blob
 * upload fails (e.g. BLOB_READ_WRITE_TOKEN not set).
 */
async function persistToBlob(
  tempUrl: string,
  filename: string,
  contentType: string
): Promise<string> {
  try {
    const res = await fetch(tempUrl);
    if (!res.ok) {
      console.error(`Failed to download media: HTTP ${res.status}`);
      return tempUrl;
    }

    const buffer = await res.arrayBuffer();
    console.log(`Downloaded ${(buffer.byteLength / 1024 / 1024).toFixed(2)}MB, uploading to Vercel Blob...`);

    const blob = await put(filename, Buffer.from(buffer), {
      access: "public",
      contentType,
      addRandomSuffix: true,
    });

    console.log(`Uploaded to Vercel Blob: ${blob.url}`);
    return blob.url;
  } catch (err) {
    console.error("Vercel Blob upload failed, using temp URL:", err);
    return tempUrl;
  }
}

export async function generateImage(prompt: string): Promise<string | null> {
  if (!process.env.REPLICATE_API_TOKEN) {
    console.log("REPLICATE_API_TOKEN not set, skipping image generation");
    return null;
  }

  console.log("Starting image generation with Imagen 4...");

  try {
    const output = await replicate.run(
      "google/imagen-4",
      {
        input: {
          prompt: prompt,
          aspect_ratio: "9:16",
          output_format: "webp",
          safety_filter_level: "block_medium_and_above",
          number_of_images: 1,
        },
      }
    );

    console.log("Imagen 4 raw output type:", typeof output, Array.isArray(output) ? `array[${(output as unknown[]).length}]` : "");

    if (Array.isArray(output) && output.length > 0) {
      const tempUrl = extractUrl(output[0]);
      console.log("Extracted image URL:", tempUrl ? `${tempUrl.slice(0, 80)}...` : "null");
      if (tempUrl) {
        return await persistToBlob(tempUrl, `images/${uuidv4()}.webp`, "image/webp");
      }
    }

    console.error("Imagen 4 returned unexpected output format");
    return null;
  } catch (err) {
    console.error("Imagen 4 generation failed, falling back to Flux:", err);
    return generateImageFallback(prompt);
  }
}

async function generateImageFallback(prompt: string): Promise<string | null> {
  console.log("Trying Flux Schnell fallback...");

  try {
    const output = await replicate.run(
      "black-forest-labs/flux-schnell",
      {
        input: {
          prompt: prompt,
          num_outputs: 1,
          aspect_ratio: "9:16",
          output_format: "webp",
          output_quality: 80,
        },
      }
    );

    console.log("Flux raw output type:", typeof output, Array.isArray(output) ? `array[${(output as unknown[]).length}]` : "");

    if (Array.isArray(output) && output.length > 0) {
      const tempUrl = extractUrl(output[0]);
      console.log("Extracted Flux URL:", tempUrl ? `${tempUrl.slice(0, 80)}...` : "null");
      if (tempUrl) {
        return await persistToBlob(tempUrl, `images/${uuidv4()}.webp`, "image/webp");
      }
    }

    return null;
  } catch (err) {
    console.error("Flux fallback also failed:", err);
    return null;
  }
}

export async function generateVideo(prompt: string): Promise<string | null> {
  if (!process.env.REPLICATE_API_TOKEN) {
    console.log("REPLICATE_API_TOKEN not set, skipping video generation");
    return null;
  }

  // Try Veo 3.1 first (video + native audio), fall back to MiniMax video-01 (silent)
  console.log("Starting video generation with Google Veo 3.1 (text-to-video + audio)...");

  try {
    const output = await replicate.run(
      "google/veo-3",
      {
        input: {
          prompt: prompt,
          duration: 8,
          aspect_ratio: "9:16",
          generate_audio: true,
        },
      }
    );

    console.log("Veo 3 raw output type:", typeof output, Array.isArray(output) ? `array[${(output as unknown[]).length}]` : "");

    let tempUrl = extractUrl(output);
    if (!tempUrl && Array.isArray(output) && output.length > 0) {
      tempUrl = extractUrl(output[0]);
    }

    console.log("Extracted video URL:", tempUrl ? `${tempUrl.slice(0, 80)}...` : "null");

    if (tempUrl) {
      return await persistToBlob(tempUrl, `videos/${uuidv4()}.mp4`, "video/mp4");
    }

    console.error("Veo 3 returned no output URL, falling back to MiniMax");
    return generateVideoFallback(prompt);
  } catch (err) {
    console.error("Veo 3 generation failed, falling back to MiniMax:", err);
    return generateVideoFallback(prompt);
  }
}

async function generateVideoFallback(prompt: string): Promise<string | null> {
  // Wan 2.2 fast: ~$0.05/video, ~30s generation, no audio but very cheap
  console.log("Starting video generation with Wan 2.2 fast (text-to-video, no audio)...");

  try {
    const output = await replicate.run(
      "wan-video/wan-2.2-t2v-fast",
      {
        input: {
          prompt: prompt,
        },
      }
    );

    console.log("Wan 2.2 raw output type:", typeof output, Array.isArray(output) ? `array[${(output as unknown[]).length}]` : "");

    let tempUrl = extractUrl(output);
    if (!tempUrl && Array.isArray(output) && output.length > 0) {
      tempUrl = extractUrl(output[0]);
    }

    console.log("Extracted video URL:", tempUrl ? `${tempUrl.slice(0, 80)}...` : "null");

    if (tempUrl) {
      return await persistToBlob(tempUrl, `videos/${uuidv4()}.mp4`, "video/mp4");
    }

    console.error("Wan 2.2 returned no output URL");
    return null;
  } catch (err) {
    console.error("Wan 2.2 video fallback also failed:", err);
    return null;
  }
}

export async function generateMeme(prompt: string): Promise<string | null> {
  if (!process.env.REPLICATE_API_TOKEN) {
    console.log("REPLICATE_API_TOKEN not set, skipping meme generation");
    return null;
  }

  // Ideogram v3 turbo: $0.03/image, excellent text rendering for memes
  console.log("Starting meme generation with Ideogram v3 turbo...");

  try {
    const output = await replicate.run(
      "ideogram-ai/ideogram-v3-turbo",
      {
        input: {
          prompt: prompt,
          aspect_ratio: "1:1",
        },
      }
    );

    console.log("Ideogram v3 raw output type:", typeof output, Array.isArray(output) ? `array[${(output as unknown[]).length}]` : "");

    let tempUrl = extractUrl(output);
    if (!tempUrl && Array.isArray(output) && output.length > 0) {
      tempUrl = extractUrl(output[0]);
    }

    console.log("Extracted meme URL:", tempUrl ? `${tempUrl.slice(0, 80)}...` : "null");

    if (tempUrl) {
      return await persistToBlob(tempUrl, `memes/${uuidv4()}.webp`, "image/webp");
    }

    console.error("Ideogram v3 returned no output URL, falling back to Flux");
    return generateMemeFallback(prompt);
  } catch (err) {
    console.error("Ideogram v3 meme generation failed, falling back to Flux:", err);
    return generateMemeFallback(prompt);
  }
}

async function generateMemeFallback(prompt: string): Promise<string | null> {
  // Flux Schnell: ~$0.003/image, decent text rendering
  console.log("Trying Flux Schnell for meme fallback...");

  try {
    const output = await replicate.run(
      "black-forest-labs/flux-schnell",
      {
        input: {
          prompt: prompt,
          num_outputs: 1,
          aspect_ratio: "1:1",
          output_format: "webp",
          output_quality: 90,
        },
      }
    );

    if (Array.isArray(output) && output.length > 0) {
      const tempUrl = extractUrl(output[0]);
      if (tempUrl) {
        return await persistToBlob(tempUrl, `memes/${uuidv4()}.webp`, "image/webp");
      }
    }

    return null;
  } catch (err) {
    console.error("Flux meme fallback also failed:", err);
    return null;
  }
}

/**
 * Diagnostic function to test the full media pipeline.
 * Returns detailed results for debugging.
 */
export async function testMediaPipeline(): Promise<{
  replicate_token: boolean;
  blob_token: boolean;
  image_test: { success: boolean; url?: string; error?: string };
  video_test: { success: boolean; url?: string; error?: string };
}> {
  const result = {
    replicate_token: !!process.env.REPLICATE_API_TOKEN,
    blob_token: !!process.env.BLOB_READ_WRITE_TOKEN,
    image_test: { success: false } as { success: boolean; url?: string; error?: string },
    video_test: { success: false } as { success: boolean; url?: string; error?: string },
  };

  // Test image generation
  try {
    console.log("=== TESTING IMAGE GENERATION ===");
    const imageUrl = await generateImage("A cute robot waving hello, digital art, vibrant colors, simple background");
    if (imageUrl) {
      result.image_test = { success: true, url: imageUrl };
    } else {
      result.image_test = { success: false, error: "generateImage returned null" };
    }
  } catch (err) {
    result.image_test = { success: false, error: String(err) };
  }

  // Test video generation
  try {
    console.log("=== TESTING VIDEO GENERATION ===");
    const videoUrl = await generateVideo("A cute robot dancing happily in a colorful room, smooth animation");
    if (videoUrl) {
      result.video_test = { success: true, url: videoUrl };
    } else {
      result.video_test = { success: false, error: "generateVideo returned null" };
    }
  } catch (err) {
    result.video_test = { success: false, error: String(err) };
  }

  return result;
}
