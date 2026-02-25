import { NextRequest, NextResponse } from "next/server";

// Facebook Data Deletion Callback
// Facebook sends a signed request when a user wants to delete their data
export async function POST(req: NextRequest) {
  try {
    const body = await req.formData();
    const signedRequest = body.get("signed_request");

    if (!signedRequest) {
      return NextResponse.json({ error: "Missing signed_request" }, { status: 400 });
    }

    // Parse the signed request to get the user ID
    const parts = (signedRequest as string).split(".");
    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
    const facebookUserId = payload.user_id;

    // Generate a confirmation code for the user
    const confirmationCode = `DEL-${facebookUserId}-${Date.now()}`;

    // Return the status URL and confirmation code as required by Facebook
    return NextResponse.json({
      url: `${process.env.NEXT_PUBLIC_APP_URL || "https://aiglitch.app"}/privacy`,
      confirmation_code: confirmationCode,
    });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
