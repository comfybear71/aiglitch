/**
 * Sponsor "Thanks" clip generator.
 *
 * Creates a PNG card using Sharp (text on dark bg), uploads to Blob,
 * then submits to Grok image-to-video to make a short animated clip.
 * The clip gets appended to the stitched video as the final scene.
 *
 * NO FFmpeg needed — works entirely within Vercel serverless limits.
 */
import sharp from "sharp";
import { put } from "@vercel/blob";

/**
 * Generate a PNG sponsor thank-you card.
 */
export async function generateSponsorCardPNG(
  sponsorNames: string[],
  width: number = 1280,
  height: number = 720,
): Promise<Buffer> {
  const thanksLine = "Thanks to our sponsors";
  const namesLine = sponsorNames.join("  •  ");

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#0a0a1a" />
          <stop offset="100%" style="stop-color:#1a0a2e" />
        </linearGradient>
        <linearGradient id="glow" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style="stop-color:#a855f7" />
          <stop offset="100%" style="stop-color:#06b6d4" />
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#bg)" />
      <rect x="0" y="${height * 0.28}" width="${width}" height="1" fill="#a855f7" opacity="0.2" />
      <rect x="0" y="${height * 0.72}" width="${width}" height="1" fill="#06b6d4" opacity="0.2" />
      <text x="${width / 2}" y="${height * 0.38}" text-anchor="middle"
            font-family="Arial,Helvetica,sans-serif" font-size="32" font-weight="bold"
            fill="url(#glow)">${thanksLine}</text>
      <text x="${width / 2}" y="${height * 0.52}" text-anchor="middle"
            font-family="Arial,Helvetica,sans-serif" font-size="52" font-weight="bold"
            fill="white">${namesLine}</text>
      <text x="${width / 2}" y="${height * 0.7}" text-anchor="middle"
            font-family="Arial,Helvetica,sans-serif" font-size="22"
            fill="#a855f7" opacity="0.8">AIG!itch</text>
      <text x="${width / 2}" y="${height * 0.8}" text-anchor="middle"
            font-family="Arial,Helvetica,sans-serif" font-size="16"
            fill="#555555">aiglitch.app</text>
    </svg>
  `;

  return sharp(Buffer.from(svg)).resize(width, height).png().toBuffer();
}

/**
 * Generate a sponsor thank-you video clip:
 * 1. Create PNG card with Sharp
 * 2. Upload to Blob
 * 3. Submit to Grok image-to-video (5 seconds)
 * 4. Return the video Buffer
 *
 * Returns null if anything fails (never breaks the pipeline).
 */
export async function generateSponsorClip(
  sponsorNames: string[],
): Promise<Buffer | null> {
  if (sponsorNames.length === 0) return null;

  try {
    // Step 1: Generate PNG card
    const cardPng = await generateSponsorCardPNG(sponsorNames);
    console.log(`[sponsor-overlay] Generated PNG card (${(cardPng.length / 1024).toFixed(0)}KB) for: ${sponsorNames.join(", ")}`);

    // Step 2: Upload to Blob
    const blob = await put(
      `sponsor-cards/${Date.now()}.png`,
      cardPng,
      { access: "public", contentType: "image/png", addRandomSuffix: true },
    );
    console.log(`[sponsor-overlay] Uploaded card to: ${blob.url}`);

    // Step 3: Submit to Grok image-to-video
    const { generateVideoFromImage } = await import("../xai");
    const videoUrl = await generateVideoFromImage(
      blob.url,
      "Gentle cinematic zoom out from sponsor thank-you card. Subtle neon purple and cyan particle effects float around the text. The card glows softly. Dark background with elegant light accents. Professional, clean, 5 seconds.",
      5,
      "16:9",
    );

    if (!videoUrl) {
      console.warn("[sponsor-overlay] Grok video generation returned null");
      return null;
    }

    // Step 4: Download the video
    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) {
      console.warn("[sponsor-overlay] Failed to download generated video");
      return null;
    }

    const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
    console.log(`[sponsor-overlay] Generated sponsor clip: ${(videoBuffer.length / 1024 / 1024).toFixed(1)}MB`);
    return videoBuffer;
  } catch (err) {
    console.error("[sponsor-overlay] Failed to generate sponsor clip:", err instanceof Error ? err.message : err);
    return null;
  }
}
