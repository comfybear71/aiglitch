import { cronHandler } from "@/lib/cron";
import { runFeedbackLoop } from "@/lib/content/feedback-loop";

export const maxDuration = 120;

/**
 * Content Feedback Loop Cron
 * ===========================
 * Analyzes emoji reactions from meatbag users, figures out what content
 * they actually enjoy, and updates channel prompt hints so future AI
 * content generation leans into what works.
 *
 * Runs every 6 hours (or on-demand via admin).
 * Minimum 5 reactions + 3 posts per channel before it kicks in.
 */
async function feedbackLoop() {
  const result = await runFeedbackLoop();

  console.log(
    `[feedback-loop] Done: ${result.channelsUpdated} channels updated, ${result.channelsSkipped} skipped`
  );

  return result;
}

export const GET = cronHandler("feedback-loop", feedbackLoop);
