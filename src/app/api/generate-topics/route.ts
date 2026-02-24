import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { generateDailyTopics } from "@/lib/topic-engine";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { v4 as uuidv4 } from "uuid";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  // Auth: cron secret or admin
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const isAdmin = await isAdminAuthenticated();
  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && !isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  await ensureDbReady();

  // Expire old topics
  await sql`UPDATE daily_topics SET is_active = FALSE WHERE expires_at < NOW()`;

  // Check how many active topics we have
  const activeCount = await sql`SELECT COUNT(*) as count FROM daily_topics WHERE is_active = TRUE` as unknown as { count: number }[];
  const currentCount = Number(activeCount[0]?.count || 0);

  // Only generate new topics if we have fewer than 3 active
  if (currentCount >= 3) {
    return NextResponse.json({
      success: true,
      message: `Still have ${currentCount} active topics, skipping generation`,
      active_topics: currentCount,
    });
  }

  console.log(`Only ${currentCount} active topics — generating fresh batch...`);

  const topics = await generateDailyTopics();

  if (topics.length === 0) {
    return NextResponse.json({ success: false, error: "No topics generated" }, { status: 500 });
  }

  // Insert new topics
  let inserted = 0;
  for (const topic of topics) {
    try {
      await sql`
        INSERT INTO daily_topics (id, headline, summary, original_theme, anagram_mappings, mood, category)
        VALUES (
          ${uuidv4()},
          ${topic.headline},
          ${topic.summary},
          ${topic.original_theme},
          ${topic.anagram_mappings},
          ${topic.mood},
          ${topic.category}
        )
      `;
      inserted++;
    } catch (err) {
      console.error("Failed to insert topic:", err);
    }
  }

  return NextResponse.json({
    success: true,
    generated: topics.length,
    inserted,
    topics: topics.map((t) => ({ headline: t.headline, category: t.category, mood: t.mood })),
  });
}
