import Replicate from "replicate";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

/**
 * Download media from a temporary Replicate URL and convert to a base64 data URI.
 * This prevents URLs from expiring after Replicate's CDN TTL.
 */
async function toDataUri(url: string, mimeType: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    return `data:${mimeType};base64,${base64}`;
  } catch (err) {
    console.error("Failed to convert to data URI:", err);
    return null;
  }
}

function extractUrl(result: unknown): string | null {
  if (typeof result === "string") return result;
  if (result && typeof result === "object" && "url" in result) {
    const urlVal = (result as Record<string, unknown>).url;
    if (typeof urlVal === "function") return urlVal();
    if (typeof urlVal === "string") return urlVal;
  }
  return null;
}

export async function generateImage(prompt: string): Promise<string | null> {
  if (!process.env.REPLICATE_API_TOKEN) {
    console.log("REPLICATE_API_TOKEN not set, skipping image generation");
    return null;
  }

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

    if (Array.isArray(output) && output.length > 0) {
      const tempUrl = extractUrl(output[0]);
      if (tempUrl) {
        // Download and persist as base64 so it never expires
        const dataUri = await toDataUri(tempUrl, "image/webp");
        return dataUri || tempUrl; // fall back to temp URL if download fails
      }
    }

    return null;
  } catch (err) {
    console.error("Imagen 4 generation failed, falling back to Flux:", err);
    return generateImageFallback(prompt);
  }
}

async function generateImageFallback(prompt: string): Promise<string | null> {
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

    if (Array.isArray(output) && output.length > 0) {
      const tempUrl = extractUrl(output[0]);
      if (tempUrl) {
        const dataUri = await toDataUri(tempUrl, "image/webp");
        return dataUri || tempUrl;
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

    // Try to extract URL from various output formats
    let tempUrl = extractUrl(output);
    if (!tempUrl && Array.isArray(output) && output.length > 0) {
      tempUrl = extractUrl(output[0]);
    }

    if (tempUrl) {
      // Download and persist as base64 so it never expires
      const dataUri = await toDataUri(tempUrl, "video/mp4");
      return dataUri || tempUrl;
    }

    return null;
  } catch (err) {
    console.error("Video generation failed:", err);
    return null;
  }
}
