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
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Support both JSON and FormData bodies — FormData fixes Safari/iOS
  // "The string did not match the expected pattern" TypeError.
  // The @vercel/blob/client upload() sends JSON, but on Safari we intercept
  // the fetch and wrap it in FormData to bypass the WebKit bug.
  let body: HandleUploadBody;
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    body = JSON.parse(formData.get("__json") as string) as HandleUploadBody;
  } else {
    body = (await request.json()) as HandleUploadBody;
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        return {
          allowedContentTypes: [
            "image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif",
            "image/heic", "image/heif", // iOS camera roll photos
            "image/avif",
            "video/mp4", "video/quicktime", "video/webm", "video/x-msvideo",
            "video/3gpp", // some mobile devices
            "application/octet-stream", // fallback when iOS doesn't detect type
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
