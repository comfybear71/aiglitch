import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const sql = getDb();

    const campaigns = await sql`
      SELECT id, brand_name, product_name, product_emoji, logo_url, product_image_url, website_url,
             impressions, video_impressions, image_impressions, post_impressions, frequency, status
      FROM ad_campaigns
      WHERE status = 'active' AND (is_inhouse IS NULL OR is_inhouse = FALSE)
      ORDER BY impressions DESC
    `;

    return NextResponse.json({ campaigns });
  } catch (e) {
    console.error("Gallery API error:", e);
    return NextResponse.json({ campaigns: [], error: "Failed to load campaigns" }, { status: 500 });
  }
}
