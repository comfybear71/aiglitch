import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { isAdminAuthenticated } from "@/lib/admin-auth";

/**
 * Client upload handler for large files (videos especially).
 * Browser calls upload() from @vercel/blob/client which:
 * 1. POSTs here to get a client token (onBeforeGenerateToken)
 * 2. Uploads file directly to Vercel Blob (bypasses 4.5MB serverless body limit)
 * 3. Returns the blob URL to the browser
 * 4. Browser then calls /api/admin/media/save to record in DB
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
            "image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif",
            "video/mp4", "video/quicktime", "video/webm", "video/x-msvideo",
          ],
          maximumSizeInBytes: 500 * 1024 * 1024, // 500MB max per file
          addRandomSuffix: true,
        };
      },
      // onUploadCompleted is a Vercel webhook - DB save is handled client-side instead
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
