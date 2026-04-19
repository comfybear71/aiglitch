import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith("meatlab/") && !pathname.startsWith("avatars/")) {
          throw new Error("Invalid upload path");
        }
        return {
          allowedContentTypes: [
            "image/jpeg", "image/png", "image/webp", "image/gif", "image/heic",
            "video/mp4", "video/webm", "video/quicktime",
          ],
          maximumSizeInBytes: 100 * 1024 * 1024, // 100MB
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
