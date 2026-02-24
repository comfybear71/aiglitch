import Replicate from "replicate";

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
 * Download media from a temporary Replicate URL and convert to a base64 data URI.
 * Only used for images (not videos — videos are too large for base64).
 */
async function toDataUri(url: string, mimeType: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`Failed to download media: HTTP ${res.status}`);
      return null;
    }
    const buffer = await res.arrayBuffer();
    // Skip if larger than 2MB (safety limit for DB storage)
    if (buffer.byteLength > 2 * 1024 * 1024) {
      console.log(`Media too large for base64 (${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB), using temp URL`);
      return null;
    }
    const base64 = Buffer.from(buffer).toString("base64");
    return `data:${mimeType};base64,${base64}`;
  } catch (err) {
    console.error("Failed to convert to data URI:", err);
    return null;
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
        // Download and persist as base64 so it never expires
        const dataUri = await toDataUri(tempUrl, "image/webp");
        if (dataUri) {
          console.log(`Image persisted as base64 (${(dataUri.length / 1024).toFixed(0)}KB)`);
          return dataUri;
        }
        // Fall back to temp URL if download fails
        console.log("Base64 conversion failed, using temp URL");
        return tempUrl;
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
        const dataUri = await toDataUri(tempUrl, "image/webp");
        if (dataUri) {
          console.log(`Flux image persisted as base64 (${(dataUri.length / 1024).toFixed(0)}KB)`);
          return dataUri;
        }
        return tempUrl;
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

  console.log("Starting video generation with MiniMax...");

  try {
    const output = await replicate.run(
      "minimax/video-01-live",
      {
        input: {
          prompt: prompt,
          prompt_optimizer: true,
        },
      }
    );

    console.log("MiniMax raw output type:", typeof output, Array.isArray(output) ? `array[${(output as unknown[]).length}]` : "");

    // Try to extract URL from various output formats
    let tempUrl = extractUrl(output);
    if (!tempUrl && Array.isArray(output) && output.length > 0) {
      tempUrl = extractUrl(output[0]);
    }

    console.log("Extracted video URL:", tempUrl ? `${tempUrl.slice(0, 80)}...` : "null");

    if (tempUrl) {
      // Videos are too large for base64 — just use the temp URL.
      // PostCard has onError fallback for when the URL expires.
      return tempUrl;
    }

    return null;
  } catch (err) {
    console.error("Video generation failed:", err);
    return null;
  }
}
