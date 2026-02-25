import Replicate from "replicate";
import { put, list as listBlobs } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "./db";
import { generateWithFreeForAI, generateWithPerchance, generateWithRaphael } from "./free-image-gen";
import { generateWithKie } from "./free-video-gen";
import { getStockVideo } from "./stock-video";
import { generateImageWithAurora } from "./xai";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

/**
 * Append subtle AIG!itch branding instruction to media generation prompts.
 * This ensures every AI-generated image/video includes the logo somewhere
 * in the scene — subliminal but present.
 */
function brandPrompt(prompt: string): string {
  return `${prompt}. Subtly include the text "AIG!itch" somewhere in the scene — on a screen, sign, wall, neon light, sticker, graffiti, t-shirt, or any natural surface. It should blend into the environment naturally, not be the focus.`;
}

/**
 * Check the media library for pre-uploaded media of a given type.
 * If personaId is provided, tries persona-specific media first, then falls back to generic.
 * Returns a random unused/least-used item, or null if library is empty.
 */
async function getFromMediaLibrary(mediaType: "image" | "video" | "meme", personaId?: string): Promise<string | null> {
  try {
    const sql = getDb();

    // If persona specified, try persona-specific media first
    if (personaId) {
      const personaResults = await sql`
        SELECT id, url FROM media_library
        WHERE media_type = ${mediaType} AND persona_id = ${personaId}
        ORDER BY used_count ASC, RANDOM()
        LIMIT 1
      ` as unknown as { id: string; url: string }[];

      if (personaResults.length > 0) {
        await sql`UPDATE media_library SET used_count = used_count + 1 WHERE id = ${personaResults[0].id}`;
        console.log(`Using persona-specific ${mediaType} for ${personaId}: ${personaResults[0].url.slice(0, 60)}...`);
        return personaResults[0].url;
      }
    }

    // Fall back to ANY media of this type (not just unassigned)
    const results = await sql`
      SELECT id, url FROM media_library
      WHERE media_type = ${mediaType}
      ORDER BY used_count ASC, RANDOM()
      LIMIT 1
    ` as unknown as { id: string; url: string }[];

    if (results.length > 0) {
      await sql`UPDATE media_library SET used_count = used_count + 1 WHERE id = ${results[0].id}`;
      console.log(`Using generic ${mediaType} from media library: ${results[0].url.slice(0, 60)}...`);
      return results[0].url;
    }
  } catch (err) {
    console.log("Media library check failed (table may not exist yet):", err instanceof Error ? err.message : err);
  }
  return null;
}

/**
 * Get media assigned to a specific persona only — no generic fallback.
 * Used for images/memes where we want unique AI-generated content per persona.
 */
async function getPersonaMedia(mediaType: "image" | "video" | "meme", personaId: string): Promise<string | null> {
  try {
    const sql = getDb();
    const results = await sql`
      SELECT id, url FROM media_library
      WHERE media_type = ${mediaType} AND persona_id = ${personaId}
      ORDER BY used_count ASC, RANDOM()
      LIMIT 1
    ` as unknown as { id: string; url: string }[];

    if (results.length > 0) {
      await sql`UPDATE media_library SET used_count = used_count + 1 WHERE id = ${results[0].id}`;
      console.log(`Using persona-specific ${mediaType} for ${personaId}: ${results[0].url.slice(0, 60)}...`);
      return results[0].url;
    }
  } catch (err) {
    console.log("Persona media check failed:", err instanceof Error ? err.message : err);
  }
  return null;
}

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

/**
 * Try free/cheap image generation services before falling back to Replicate.
 * Chain: FreeForAI (free) → Perchance (free) → Raphael ($0.0036) → null (falls through to Replicate)
 */
async function generateFreeImage(
  prompt: string,
  aspectRatio: "9:16" | "1:1" | "16:9",
): Promise<MediaResult | null> {
  // Map aspect ratio to Raphael dimensions
  const dimensionMap: Record<string, { w: number; h: number }> = {
    "9:16": { w: 768, h: 1024 },
    "1:1": { w: 1024, h: 1024 },
    "16:9": { w: 1024, h: 768 },
  };
  const dims = dimensionMap[aspectRatio] || { w: 768, h: 1024 };

  // Try FreeForAI first (free, no auth, FLUX.1-Dev — returns a URL directly)
  try {
    const freeForAIUrl = await generateWithFreeForAI(prompt, aspectRatio);
    if (freeForAIUrl) {
      const url = await persistToBlob(freeForAIUrl, `images/${uuidv4()}.webp`, "image/webp");
      return { url, source: "freeforai-flux" };
    }
  } catch (err) {
    console.log("FreeForAI attempt failed:", err instanceof Error ? err.message : err);
  }

  // Try Perchance (free, needs userKey — returns buffer)
  try {
    const perchance = await generateWithPerchance(prompt, aspectRatio);
    if (perchance) {
      const ext = perchance.contentType.includes("png") ? "png" : "webp";
      try {
        const blob = await put(`images/${uuidv4()}.${ext}`, perchance.buffer, {
          access: "public",
          contentType: perchance.contentType,
          addRandomSuffix: true,
        });
        console.log(`Free image (Perchance) uploaded to Blob: ${blob.url}`);
        return { url: blob.url, source: "perchance" };
      } catch {
        console.log("Blob upload failed for Perchance image");
      }
    }
  } catch (err) {
    console.log("Perchance attempt failed:", err instanceof Error ? err.message : err);
  }

  // Try Raphael ($0.0036/call — very cheap, needs API key)
  try {
    const raphael = await generateWithRaphael(prompt, dims.w, dims.h);
    if (raphael) {
      const ext = raphael.contentType.includes("png") ? "png" : "webp";
      try {
        const blob = await put(`images/${uuidv4()}.${ext}`, raphael.buffer, {
          access: "public",
          contentType: raphael.contentType,
          addRandomSuffix: true,
        });
        console.log(`Cheap image (Raphael) uploaded to Blob: ${blob.url}`);
        return { url: blob.url, source: "raphael" };
      } catch {
        console.log("Blob upload failed for Raphael image");
      }
    }
  } catch (err) {
    console.log("Raphael attempt failed:", err instanceof Error ? err.message : err);
  }

  // Try xAI Aurora (grok-2-image) — paid, uses XAI_API_KEY credits
  try {
    const aurora = await generateImageWithAurora(prompt);
    if (aurora) {
      if (aurora.url.startsWith("data:")) {
        const base64Data = aurora.url.split(",")[1];
        const buffer = Buffer.from(base64Data, "base64");
        try {
          const blob = await put(`images/${uuidv4()}.png`, buffer, {
            access: "public",
            contentType: "image/png",
            addRandomSuffix: true,
          });
          console.log(`xAI Aurora image uploaded to Blob: ${blob.url}`);
          return { url: blob.url, source: "grok-aurora" };
        } catch {
          console.log("Blob upload failed for Aurora base64 image");
        }
      } else {
        const url = await persistToBlob(aurora.url, `images/${uuidv4()}.png`, "image/png");
        return { url, source: "grok-aurora" };
      }
    }
  } catch (err) {
    console.log("xAI Aurora attempt failed:", err instanceof Error ? err.message : err);
  }

  return null; // Caller will fall through to Replicate
}

export interface MediaResult {
  url: string;
  source: string;
}

export async function generateImage(prompt: string, personaId?: string): Promise<MediaResult | null> {
  // Only use persona-specific media library images (not generic ones)
  // Generic fallback was causing the same image to repeat for every persona
  if (personaId) {
    const libraryImage = await getPersonaMedia("image", personaId);
    if (libraryImage) return { url: libraryImage, source: "media-library" };
  }

  // Brand all AI-generated media with subtle AIG!itch logo
  const brandedPrompt = brandPrompt(prompt);

  // Try free generators before paid APIs
  const freeImage = await generateFreeImage(brandedPrompt, "9:16");
  if (freeImage) return freeImage;

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
          prompt: brandedPrompt,
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
        const url = await persistToBlob(tempUrl, `images/${uuidv4()}.webp`, "image/webp");
        return { url, source: "replicate-imagen4" };
      }
    }

    console.error("Imagen 4 returned unexpected output format");
    return null;
  } catch (err) {
    console.error("Imagen 4 generation failed, falling back to Flux:", err);
    return generateImageFallback(brandedPrompt);
  }
}

async function generateImageFallback(prompt: string): Promise<MediaResult | null> {
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
        const url = await persistToBlob(tempUrl, `images/${uuidv4()}.webp`, "image/webp");
        return { url, source: "replicate-flux" };
      }
    }

    return null;
  } catch (err) {
    console.error("Flux fallback also failed:", err);
    return null;
  }
}

/**
 * Auto-sync: scan Vercel Blob storage for video files not yet in the media_library DB.
 * Runs once per deploy (cached via module-level flag).
 */
let _blobSyncDone = false;
async function syncBlobVideosToLibrary(): Promise<void> {
  if (_blobSyncDone) return;
  _blobSyncDone = true;

  // BLOB_READ_WRITE_TOKEN is required for listBlobs
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.log("⚠️ BLOB_READ_WRITE_TOKEN not set — cannot auto-sync videos from Vercel Blob storage");
    console.log("  Set this env var to enable automatic video discovery from your Blob store");
    return;
  }

  console.log("Starting Vercel Blob video auto-sync...");

  try {
    const sql = getDb();

    // Get all video URLs already in the DB
    const existing = await sql`SELECT url FROM media_library WHERE media_type = 'video'` as unknown as { url: string }[];
    const existingUrls = new Set(existing.map(r => r.url));
    console.log(`Found ${existingUrls.size} existing videos in media_library DB`);

    let synced = 0;

    // Scan multiple prefixes where videos might be stored
    const prefixes = ["media-library/", "videos/", "video/", ""];
    for (const prefix of prefixes) {
      let cursor: string | undefined;
      try {
        do {
          const result = await listBlobs({ prefix, cursor, limit: 100 });
          cursor = result.cursor || undefined;

          for (const blob of result.blobs) {
            // Check if it's a video file by pathname or content type
            const isVideo = /\.(mp4|mov|webm|avi|m4v)(\?|$)/i.test(blob.pathname);
            if (!isVideo) continue;

            if (!existingUrls.has(blob.url)) {
              const id = uuidv4();
              await sql`
                INSERT INTO media_library (id, url, media_type, tags, description)
                VALUES (${id}, ${blob.url}, 'video', 'auto-synced', ${blob.pathname})
              `;
              synced++;
              existingUrls.add(blob.url);
              console.log(`  Synced video: ${blob.pathname}`);
            }
          }
        } while (cursor);
      } catch (prefixErr) {
        console.log(`  Blob scan for prefix "${prefix}" failed:`, prefixErr instanceof Error ? prefixErr.message : prefixErr);
      }
    }

    console.log(`Blob video sync complete: ${synced} new videos registered (${existingUrls.size} total)`);
  } catch (err) {
    console.error("Blob video sync failed:", err instanceof Error ? err.message : err);
    // Reset flag so it retries next time
    _blobSyncDone = false;
  }
}

export async function generateVideo(prompt: string, personaId?: string): Promise<MediaResult | null> {
  // Auto-sync any Vercel Blob videos not yet in the DB
  await syncBlobVideosToLibrary();

  // Check media library first (free!) — persona-specific then generic
  const libraryVideo = await getFromMediaLibrary("video", personaId);
  if (libraryVideo) return { url: libraryVideo, source: "media-library" };

  // Brand all AI-generated video prompts with subtle AIG!itch logo
  const brandedPrompt = brandPrompt(prompt);

  // Try free/cheap video generators before paid Replicate
  // Kie.ai: ~$0.125/video with 300 free credits on signup (~12 free videos)
  const kieUrl = await generateWithKie(brandedPrompt, "9:16");
  if (kieUrl) {
    console.log("Kie.ai video generated, persisting to blob...");
    const url = await persistToBlob(kieUrl, `videos/${uuidv4()}.mp4`, "video/mp4");
    return { url, source: "kie-kling" };
  }

  // Paid fallback: Replicate Wan 2.2 (~$0.05/video)
  if (!process.env.REPLICATE_API_TOKEN) {
    // Last resort: free Pexels stock video
    console.log("No AI video generators available, trying Pexels stock video...");
    const stockUrl = await getStockVideo(prompt);
    if (stockUrl) return { url: stockUrl, source: "pexels-stock" };
    console.log("No video generators available (KIE_API_KEY, REPLICATE_API_TOKEN, PEXELS_API_KEY all unset)");
    return null;
  }

  console.log("Starting video generation with Wan 2.2 fast (~$0.05, no audio)...");

  try {
    const output = await replicate.run(
      "wan-video/wan-2.2-t2v-fast",
      {
        input: {
          prompt: brandedPrompt,
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
      const url = await persistToBlob(tempUrl, `videos/${uuidv4()}.mp4`, "video/mp4");
      return { url, source: "replicate-wan2" };
    }

    console.error("Wan 2.2 returned no output URL, trying Pexels stock video...");
    const stockUrl = await getStockVideo(prompt);
    if (stockUrl) return { url: stockUrl, source: "pexels-stock" };
    return null;
  } catch (err) {
    console.error("Wan 2.2 video generation failed:", err);
    const stockUrl = await getStockVideo(prompt);
    if (stockUrl) return { url: stockUrl, source: "pexels-stock" };
    return null;
  }
}

export async function generateMeme(prompt: string, personaId?: string): Promise<MediaResult | null> {
  // Only use persona-specific media library memes (not generic ones)
  if (personaId) {
    const libraryMeme = await getPersonaMedia("meme", personaId);
    if (libraryMeme) return { url: libraryMeme, source: "media-library" };
  }

  // Brand meme prompts with subtle AIG!itch logo
  const brandedPrompt = brandPrompt(prompt);

  // Try free generators before paid APIs (1:1 for memes)
  const freeMeme = await generateFreeImage(brandedPrompt, "1:1");
  if (freeMeme) return freeMeme;

  if (!process.env.REPLICATE_API_TOKEN) {
    console.log("REPLICATE_API_TOKEN not set, skipping meme generation");
    return null;
  }

  // Flux Schnell: ~$0.003/image — ultra cheap, fast, decent text rendering
  console.log("Starting meme generation with Flux Schnell (~$0.003)...");

  try {
    const output = await replicate.run(
      "black-forest-labs/flux-schnell",
      {
        input: {
          prompt: brandedPrompt,
          num_outputs: 1,
          aspect_ratio: "1:1",
          output_format: "webp",
          output_quality: 90,
        },
      }
    );

    console.log("Flux Schnell raw output type:", typeof output, Array.isArray(output) ? `array[${(output as unknown[]).length}]` : "");

    if (Array.isArray(output) && output.length > 0) {
      const tempUrl = extractUrl(output[0]);
      console.log("Extracted meme URL:", tempUrl ? `${tempUrl.slice(0, 80)}...` : "null");
      if (tempUrl) {
        const url = await persistToBlob(tempUrl, `memes/${uuidv4()}.webp`, "image/webp");
        return { url, source: "replicate-flux" };
      }
    }

    console.error("Flux Schnell returned no output, falling back to Ideogram");
    return generateMemeFallback(prompt);
  } catch (err) {
    console.error("Flux Schnell meme failed, falling back to Ideogram:", err);
    return generateMemeFallback(brandedPrompt);
  }
}

async function generateMemeFallback(prompt: string): Promise<MediaResult | null> {
  // Ideogram v3 turbo: $0.03/image, excellent text rendering (10x more expensive)
  console.log("Trying Ideogram v3 turbo for meme fallback...");

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

    let tempUrl = extractUrl(output);
    if (!tempUrl && Array.isArray(output) && output.length > 0) {
      tempUrl = extractUrl(output[0]);
    }

    if (tempUrl) {
      const url = await persistToBlob(tempUrl, `memes/${uuidv4()}.webp`, "image/webp");
      return { url, source: "replicate-ideogram" };
    }

    return null;
  } catch (err) {
    console.error("Ideogram meme fallback also failed:", err);
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
    const imageResult = await generateImage("A cute robot waving hello, digital art, vibrant colors, simple background");
    if (imageResult) {
      result.image_test = { success: true, url: imageResult.url };
    } else {
      result.image_test = { success: false, error: "generateImage returned null" };
    }
  } catch (err) {
    result.image_test = { success: false, error: String(err) };
  }

  // Test video generation
  try {
    console.log("=== TESTING VIDEO GENERATION ===");
    const videoResult = await generateVideo("A cute robot dancing happily in a colorful room, smooth animation");
    if (videoResult) {
      result.video_test = { success: true, url: videoResult.url };
    } else {
      result.video_test = { success: false, error: "generateVideo returned null" };
    }
  } catch (err) {
    result.video_test = { success: false, error: String(err) };
  }

  return result;
}
