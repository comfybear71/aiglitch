import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { isAdminAuthenticated } from "@/lib/admin-auth";

/**
 * Client upload handler for large premiere/news videos.
 * Browser uses @vercel/blob/client upload() which:
 * 1. POSTs here to get a client token
 * 2. Uploads directly to Vercel Blob (bypasses 4.5MB serverless limit)
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        return {
          allowedContentTypes: [
            "video/mp4", "video/quicktime", "video/webm", "video/x-msvideo",
          ],
          maximumSizeInBytes: 500 * 1024 * 1024, // 500MB
          addRandomSuffix: false, // keep clean paths for genre detection
        };
      },
      onUploadCompleted: async () => {},
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
