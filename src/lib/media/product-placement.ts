/**
 * Product Placement Image Injection
 * ===================================
 * Three methods for injecting brand assets into AI-generated content:
 *
 * 1. **Logo overlay** — Composites a brand logo onto generated images/thumbnails
 *    using sharp. Pixel-perfect, works with any PNG/SVG logo.
 *
 * 2. **Reference-guided generation** — Uses Flux with IP-Adapter via Replicate
 *    to generate images that incorporate a reference product photo.
 *
 * 3. **Image-to-video** — Takes a product/scene reference image and animates it
 *    into a video using xAI's grok-imagine-video with image_url parameter.
 */

import sharp from "sharp";
import { put } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";
import Replicate from "replicate";
import { env } from "@/lib/bible/env";
import { generateVideoFromImage as xaiImageToVideo } from "../xai";
import type { AdCampaign } from "../ad-campaigns";

// ── Types ──────────────────────────────────────────────────────────────────

export interface PlacementResult {
  url: string;
  source: string;
  method: "overlay" | "reference" | "image-to-video";
}

// Lazy Replicate singleton
let _replicate: Replicate | null = null;
function getReplicate(): Replicate {
  if (!_replicate) _replicate = new Replicate({ auth: env.REPLICATE_API_TOKEN });
  return _replicate;
}

// ── 1. Logo Overlay Compositing ───────────────────────────────────────────

/**
 * Overlay a brand logo onto a generated image.
 * The logo is placed in the bottom-right corner with configurable opacity and size.
 *
 * @param baseImageUrl  URL of the AI-generated image
 * @param logoUrl       URL of the brand logo (PNG with transparency preferred)
 * @param options       Position, size, opacity settings
 * @returns URL of the composited image in Vercel Blob
 */
export async function overlayLogoOnImage(
  baseImageUrl: string,
  logoUrl: string,
  options?: {
    position?: "bottom-right" | "bottom-left" | "top-right" | "top-left" | "center";
    maxWidth?: number;   // Max logo width as percentage of base image (default 20%)
    opacity?: number;    // 0.0 to 1.0 (default 0.8)
    padding?: number;    // Pixels from edge (default 20)
  },
): Promise<PlacementResult | null> {
  const {
    position = "bottom-right",
    maxWidth = 20,
    opacity = 0.8,
    padding = 20,
  } = options || {};

  try {
    // Fetch both images
    const [baseRes, logoRes] = await Promise.all([
      fetch(baseImageUrl),
      fetch(logoUrl),
    ]);
    if (!baseRes.ok || !logoRes.ok) {
      console.warn("[product-placement] Failed to fetch images for overlay");
      return null;
    }

    const baseBuffer = Buffer.from(await baseRes.arrayBuffer());
    const logoBuffer = Buffer.from(await logoRes.arrayBuffer());

    // Get base image dimensions
    const baseMeta = await sharp(baseBuffer).metadata();
    const baseW = baseMeta.width || 1080;
    const baseH = baseMeta.height || 1920;

    // Resize logo to fit within maxWidth% of the base image
    const targetLogoWidth = Math.round(baseW * (maxWidth / 100));
    const resizedLogo = await sharp(logoBuffer)
      .resize(targetLogoWidth, undefined, { fit: "inside", withoutEnlargement: true })
      .ensureAlpha()
      .composite([{
        input: Buffer.from(
          `<svg><rect x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0)" opacity="${opacity}"/></svg>`
        ),
        blend: "dest-in",
      }])
      .toBuffer();

    // Get resized logo dimensions
    const logoMeta = await sharp(resizedLogo).metadata();
    const logoW = logoMeta.width || targetLogoWidth;
    const logoH = logoMeta.height || targetLogoWidth;

    // Calculate position
    let left = padding;
    let top = padding;
    if (position.includes("right")) left = baseW - logoW - padding;
    if (position.includes("bottom")) top = baseH - logoH - padding;
    if (position === "center") {
      left = Math.round((baseW - logoW) / 2);
      top = Math.round((baseH - logoH) / 2);
    }

    // Composite
    const result = await sharp(baseBuffer)
      .composite([{
        input: resizedLogo,
        left,
        top,
        blend: "over",
      }])
      .webp({ quality: 90 })
      .toBuffer();

    // Upload to Vercel Blob
    const blob = await put(`images/placement-${uuidv4()}.webp`, result, {
      access: "public",
      contentType: "image/webp",
    });

    return { url: blob.url, source: "logo-overlay", method: "overlay" };
  } catch (err) {
    console.error("[product-placement] Logo overlay failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ── 2. Reference-Guided Image Generation (Flux IP-Adapter) ──────────────

/**
 * Generate an image using a product/brand reference photo as style/content guide.
 * Uses Flux Redux (IP-Adapter) via Replicate to blend the reference into
 * a new AI-generated scene.
 *
 * @param scenePrompt   Text prompt describing the desired scene
 * @param referenceUrl  URL of the product/brand reference image
 * @param strength      How strongly the reference influences the output (0.0-1.0, default 0.6)
 * @returns URL of the generated image in Vercel Blob
 */
export async function generateWithReference(
  scenePrompt: string,
  referenceUrl: string,
  strength?: number,
): Promise<PlacementResult | null> {
  if (!env.REPLICATE_API_TOKEN) {
    console.log("[product-placement] REPLICATE_API_TOKEN not set, skipping reference generation");
    return null;
  }

  try {
    console.log(`[product-placement] Generating with reference: "${scenePrompt.slice(0, 60)}..."`);

    // Use Flux Redux (IP-Adapter) for reference-guided generation
    const output = await getReplicate().run(
      "black-forest-labs/flux-redux" as `${string}/${string}`,
      {
        input: {
          prompt: scenePrompt,
          redux_image: referenceUrl,
          guidance: strength || 0.6,
          num_outputs: 1,
          aspect_ratio: "9:16",
          output_format: "webp",
          output_quality: 90,
        },
      }
    );

    if (Array.isArray(output) && output.length > 0) {
      const tempUrl = typeof output[0] === "string" ? output[0]
        : output[0] instanceof URL ? output[0].toString()
        : typeof output[0] === "object" && output[0] !== null && "url" in output[0] ? String((output[0] as Record<string, unknown>).url)
        : null;

      if (tempUrl) {
        // Persist to Vercel Blob
        const imgRes = await fetch(tempUrl);
        if (imgRes.ok) {
          const buffer = Buffer.from(await imgRes.arrayBuffer());
          const blob = await put(`images/ref-${uuidv4()}.webp`, buffer, {
            access: "public",
            contentType: "image/webp",
          });
          return { url: blob.url, source: "flux-redux-reference", method: "reference" };
        }
      }
    }

    console.warn("[product-placement] Flux Redux returned no usable output, falling back to Flux Dev");

    // Fallback: Flux Dev with strong prompt description (no reference image, but enriched prompt)
    const fallbackOutput = await getReplicate().run(
      "black-forest-labs/flux-dev" as `${string}/${string}`,
      {
        input: {
          prompt: `${scenePrompt}. The scene prominently features the product shown in the reference.`,
          num_outputs: 1,
          aspect_ratio: "9:16",
          output_format: "webp",
          output_quality: 90,
        },
      }
    );

    if (Array.isArray(fallbackOutput) && fallbackOutput.length > 0) {
      const tempUrl = typeof fallbackOutput[0] === "string" ? fallbackOutput[0]
        : fallbackOutput[0] instanceof URL ? fallbackOutput[0].toString()
        : null;
      if (tempUrl) {
        const imgRes = await fetch(tempUrl);
        if (imgRes.ok) {
          const buffer = Buffer.from(await imgRes.arrayBuffer());
          const blob = await put(`images/ref-fallback-${uuidv4()}.webp`, buffer, {
            access: "public",
            contentType: "image/webp",
          });
          return { url: blob.url, source: "flux-dev-fallback", method: "reference" };
        }
      }
    }

    console.error("[product-placement] All reference generation attempts failed");
    return null;
  } catch (err) {
    console.error("[product-placement] Reference generation failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ── 3. Image-to-Video with Product Reference ────────────────────────────

/**
 * Generate a video from a product/scene reference image.
 * Uses xAI's grok-imagine-video with image_url to animate the still into video.
 *
 * @param referenceUrl  URL of the product/scene reference image
 * @param motionPrompt  Text prompt describing the desired motion/animation
 * @returns URL of the generated video in Vercel Blob, or null
 */
export async function generateVideoFromReference(
  referenceUrl: string,
  motionPrompt: string,
): Promise<PlacementResult | null> {
  try {
    console.log(`[product-placement] Generating video from reference image: "${motionPrompt.slice(0, 60)}..."`);

    const videoUrl = await xaiImageToVideo(referenceUrl, motionPrompt, 10);
    if (videoUrl) {
      return { url: videoUrl, source: "xai-image-to-video", method: "image-to-video" };
    }

    console.warn("[product-placement] xAI image-to-video returned no result");
    return null;
  } catch (err) {
    console.error("[product-placement] Image-to-video failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ── Utility: Pick best injection method for a campaign ──────────────────

/**
 * Given a campaign and content type, determine the best product placement method
 * and return the enhanced media result.
 *
 * Priority:
 * 1. If campaign has product_image_url + content is video → image-to-video
 * 2. If campaign has product_image_url + content is image → reference-guided gen
 * 3. If campaign has logo_url + generated media → logo overlay
 * 4. Otherwise → text prompt injection only (handled elsewhere)
 */
export async function enhanceWithPlacement(
  campaign: AdCampaign & { product_image_url?: string | null },
  generatedMediaUrl: string | null,
  contentType: "video" | "image" | "text",
  scenePrompt?: string,
): Promise<PlacementResult | null> {
  const productImageUrl = campaign.product_image_url;
  const logoUrl = campaign.logo_url;

  // For video content with a product reference image → animate the product
  if (contentType === "video" && productImageUrl) {
    const motionPrompt = `${campaign.visual_prompt}. Cinematic product shot, smooth camera movement, professional lighting.`;
    const result = await generateVideoFromReference(productImageUrl, motionPrompt);
    if (result) return result;
  }

  // For image content with a product reference → reference-guided generation
  if (contentType === "image" && productImageUrl && scenePrompt) {
    const result = await generateWithReference(
      `${scenePrompt}. ${campaign.visual_prompt}`,
      productImageUrl,
      0.6,
    );
    if (result) return result;
  }

  // If we have generated media and a logo → overlay the logo
  if (generatedMediaUrl && logoUrl && contentType === "image") {
    const result = await overlayLogoOnImage(generatedMediaUrl, logoUrl);
    if (result) return result;
  }

  return null;
}
