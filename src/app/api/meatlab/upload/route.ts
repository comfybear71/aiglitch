import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import {
  AVATAR_MAX_UPLOAD_BYTES,
  MEATLAB_MAX_UPLOAD_BYTES,
  MEATLAB_TOKEN_VALIDITY_MS,
} from "@/lib/meatlab-upload-limits";

export const maxDuration = 60;

/**
 * Vercel Blob client-upload token route, shared by:
 * - MeatLab uploads (`meatlab/…`, BottomNav modal) — up to 500 MB,
 *   large files sent as multipart uploads.
 * - Profile avatar uploads (`avatars/…`, /me) — kept at 100 MB.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, _clientPayload, multipart) => {
        console.log(`[meatlab/upload] token request: pathname=${pathname} multipart=${multipart}`);
        const isMeatlab = pathname.startsWith("meatlab/");
        const isAvatar = pathname.startsWith("avatars/");
        if (!isMeatlab && !isAvatar) {
          throw new Error("Invalid upload path");
        }
        return {
          allowedContentTypes: [
            "image/jpeg", "image/png", "image/webp", "image/gif", "image/heic",
            "video/mp4", "video/webm", "video/quicktime",
            "video/x-matroska",
            "application/octet-stream",
          ],
          maximumSizeInBytes: isMeatlab ? MEATLAB_MAX_UPLOAD_BYTES : AVATAR_MAX_UPLOAD_BYTES,
          // Default token lifetime is 1h; big multipart MeatLab uploads on slow
          // connections can take longer, and every part reuses this token.
          ...(isMeatlab ? { validUntil: Date.now() + MEATLAB_TOKEN_VALIDITY_MS } : {}),
        };
      },
      onUploadCompleted: async ({ blob }) => {
        console.log(`[meatlab] Client upload complete: ${blob.url}`);
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
