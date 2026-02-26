import { getDb } from "@/lib/db";

/**
 * Check the global activity throttle and decide if a cron job should run.
 * Returns true if the job should proceed, false if it should skip.
 *
 * At 100% throttle: always runs
 * At 50% throttle: ~50% chance of running
 * At 0% throttle: never runs (paused)
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
