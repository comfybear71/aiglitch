/**
 * Cloudinary-based sponsor text overlay.
 * Uploads stitched video → adds crisp text overlay on last 5 seconds → returns transformed URL.
 * Falls back to original video if Cloudinary isn't configured or fails.
 */
import { v2 as cloudinary } from "cloudinary";

let _configured = false;

function ensureConfig() {
  if (_configured) return true;
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const key = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud || !key || !secret) return false;
  cloudinary.config({ cloud_name: cloud, api_key: key, api_secret: secret });
  _configured = true;
  return true;
}

/**
 * Upload video to Cloudinary and add sponsor text overlay on the last 5 seconds.
 * Returns the final video URL with text burned in.
 */
export async function addSponsorTextOverlay(
  videoBuffer: Buffer,
  sponsorNames: string[],
): Promise<{ url: string; publicId: string } | null> {
  if (!ensureConfig()) {
    console.warn("[cloudinary] Not configured — skipping sponsor overlay");
    return null;
  }
  if (sponsorNames.length === 0) return null;

  const sponsorText = `Thanks to our sponsors: ${sponsorNames.join(" • ")}`;

  try {
    // Upload raw stitched video
    const upload = await new Promise<{ public_id: string; secure_url: string; duration: number }>((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { resource_type: "video", folder: "aiglitch/videos" },
        (error, result) => error ? reject(error) : resolve(result as { public_id: string; secure_url: string; duration: number })
      ).end(videoBuffer);
    });

    console.log(`[cloudinary] Uploaded video: ${upload.public_id} (${upload.duration}s)`);

    // Generate transformed URL with text overlay on last 5 seconds
    const finalUrl = cloudinary.url(upload.public_id, {
      resource_type: "video",
      transformation: [
        {
          overlay: {
            font_family: "Arial",
            font_size: 48,
            font_weight: "bold",
            text: sponsorText,
          },
          color: "white",
          background: "rgb:000000a0",
          gravity: "south",
          y: 80,
          start_offset: `${Math.max(0, upload.duration - 5)}`,
          end_offset: `${upload.duration}`,
        },
      ],
    });

    console.log(`[cloudinary] Final URL with sponsor overlay: ${finalUrl}`);

    // Download the transformed video
    const res = await fetch(finalUrl);
    if (!res.ok) {
      console.error(`[cloudinary] Failed to download transformed video: ${res.status}`);
      return { url: upload.secure_url, publicId: upload.public_id }; // Return raw URL as fallback
    }

    return { url: finalUrl, publicId: upload.public_id };
  } catch (err) {
    console.error("[cloudinary] Sponsor overlay failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
