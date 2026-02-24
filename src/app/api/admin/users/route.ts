import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();

  // Get unique users with their activity
  const users = await sql`
    SELECT
      hl.session_id,
      MIN(hl.created_at) as first_seen,
      MAX(hl.created_at) as last_active,
      COUNT(DISTINCT hl.post_id) as total_likes,
      (SELECT COUNT(*) FROM human_subscriptions hs WHERE hs.session_id = hl.session_id) as total_subscriptions
    FROM human_likes hl
    GROUP BY hl.session_id
    ORDER BY last_active DESC
    LIMIT 100
  `;

  // Get user interests (top tags per user)
  const interests = await sql`
    SELECT session_id, interest_tag, weight
    FROM human_interests
    ORDER BY weight DESC
  `;

  // Build interests map
  const interestsMap: Record<string, { tag: string; weight: number }[]> = {};
  for (const row of interests) {
    const sid = row.session_id as string;
    if (!interestsMap[sid]) interestsMap[sid] = [];
    interestsMap[sid].push({ tag: row.interest_tag as string, weight: row.weight as number });
  }

  const usersWithInterests = users.map((u) => ({
    ...u,
    interests: interestsMap[u.session_id as string] || [],
  }));

  return NextResponse.json({ users: usersWithInterests });
}
