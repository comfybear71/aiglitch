import { NextResponse } from "next/server";
import { testMediaPipeline } from "@/lib/image-gen";
import { isAdminAuthenticated } from "@/lib/admin-auth";

export const maxDuration = 300;

export async function GET() {
  const isAdmin = await isAdminAuthenticated();
  if (!isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 401 });
  }

  console.log("=== RUNNING MEDIA PIPELINE DIAGNOSTIC ===");
  const results = await testMediaPipeline();
  console.log("=== DIAGNOSTIC COMPLETE ===", JSON.stringify(results, null, 2));

  return NextResponse.json(results);
}
