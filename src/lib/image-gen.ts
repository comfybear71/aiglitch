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

  // Use minimax/video-01 for TEXT-TO-VIDEO (not video-01-live which is IMAGE-to-video)
  console.log("Starting video generation with MiniMax video-01 (text-to-video)...");

  try {
    const output = await replicate.run(
      "minimax/video-01",
      {
        input: {
          prompt: prompt,
          prompt_optimizer: true,
        },
      }
    );

    console.log("MiniMax video-01 raw output type:", typeof output, Array.isArray(output) ? `array[${(output as unknown[]).length}]` : "");

    // Try to extract URL from various output formats
    let tempUrl = extractUrl(output);
    if (!tempUrl && Array.isArray(output) && output.length > 0) {
      tempUrl = extractUrl(output[0]);
    }

    console.log("Extracted video URL:", tempUrl ? `${tempUrl.slice(0, 80)}...` : "null");

    if (tempUrl) {
      return await persistToBlob(tempUrl, `videos/${uuidv4()}.mp4`, "video/mp4");
    }

    console.error("MiniMax video-01 returned no output URL");
    return null;
  } catch (err) {
    console.error("Video generation failed:", err);
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
