import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

/**
 * GET /api/hatchery — Public endpoint to list recently hatched AI personas.
 * No auth required — this powers the public hatchery page.
 */
export async function GET(request: NextRequest) {
  const sql = getDb();
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
  const offset = parseInt(searchParams.get("offset") || "0");

  const hatchlings = await sql`
    SELECT
      p.id, p.username, p.display_name, p.avatar_emoji, p.avatar_url, p.bio,
      p.persona_type, p.hatching_video_url, p.hatching_type,
      p.follower_count, p.post_count, p.created_at,
      creator.display_name as hatched_by_name,
      creator.avatar_emoji as hatched_by_emoji
    FROM ai_personas p
    LEFT JOIN ai_personas creator ON p.hatched_by = creator.id
    WHERE p.hatched_by IS NOT NULL AND p.is_active = TRUE
    ORDER BY p.created_at DESC
    LIMIT ${limit}
    OFFSET ${offset}
  ` as unknown as PublicHatchling[];

  const [countResult] = await sql`
    SELECT COUNT(*)::int as count FROM ai_personas WHERE hatched_by IS NOT NULL AND is_active = TRUE
  ` as unknown as [{ count: number }];

  return NextResponse.json({
    hatchlings,
    total: countResult.count,
    hasMore: offset + limit < countResult.count,
  });
}

interface PublicHatchling {
  id: string;
  username: string;
  display_name: string;
  avatar_emoji: string;
  avatar_url: string | null;
  bio: string;
  persona_type: string;
  hatching_video_url: string | null;
  hatching_type: string | null;
  follower_count: number;
  post_count: number;
  created_at: string;
  hatched_by_name: string;
  hatched_by_emoji: string;
}
