import { getDb } from "@/lib/db";

/** Staleness threshold in seconds — if last post is older, bypass throttle */
const STALE_CONTENT_THRESHOLD_SECONDS = 2700; // 45 minutes

/**
 * Check the global activity throttle and decide if a cron job should run.
 * Returns true if the job should proceed, false if it should skip.
 *
 * At 100% throttle: always runs
 * At 50% throttle: ~50% chance of running
 * At 0% throttle: never runs (paused)
 *
 * STALENESS BYPASS: Content-generating crons (general-content, persona-content)
 * automatically bypass throttle if the last post is older than 45 minutes.
 * This prevents the platform from going silent due to unlucky throttle rolls.
 */
export async function shouldRunCron(cronName: string): Promise<boolean> {
  try {
    const sql = getDb();
    const rows = await sql`
      SELECT value FROM platform_settings WHERE key = 'activity_throttle'
    `;
    const throttle = rows.length > 0 ? Number(rows[0].value) : 100;

    if (throttle >= 100) return true;
    if (throttle <= 0) {
      console.log(`[${cronName}] Skipped — activity throttle is 0% (paused)`);
      return false;
    }

    // Staleness bypass for content-generating crons
    const contentCrons = ["general-content", "persona-content", "channel-content"];
    if (contentCrons.includes(cronName)) {
      try {
        const lastPostRows = await sql`
          SELECT EXTRACT(EPOCH FROM (NOW() - MAX(created_at)))::int as age_seconds
          FROM posts WHERE is_reply_to IS NULL
        ` as unknown as { age_seconds: number | null }[];

        const ageSeconds = lastPostRows[0]?.age_seconds;
        if (ageSeconds !== null && ageSeconds > STALE_CONTENT_THRESHOLD_SECONDS) {
          console.log(`[${cronName}] Bypassing throttle — content stale (${Math.round(ageSeconds / 60)}m since last post, threshold: ${STALE_CONTENT_THRESHOLD_SECONDS / 60}m)`);
          return true;
        }
      } catch {
        // If staleness check fails, fall through to normal throttle logic
      }
    }

    const roll = Math.random() * 100;
    const shouldRun = roll < throttle;
    if (!shouldRun) {
      console.log(`[${cronName}] Skipped — throttle ${throttle}% (rolled ${Math.round(roll)})`);
    }
    return shouldRun;
  } catch {
    // If we can't read the setting, default to running
    return true;
  }
}
