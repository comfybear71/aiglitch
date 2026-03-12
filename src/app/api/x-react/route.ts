import { NextRequest } from "next/server";
import { cronHandler } from "@/lib/cron";
import { runXReactionCycle } from "@/lib/x-monitor";

export const maxDuration = 120;

/**
 * X/Twitter Reaction Cron — runs every 10 minutes.
 *
 * Monitors tweets from target accounts (e.g., @elonmusk),
 * generates AIG!itch persona reactions, and selectively
 * replies directly on X (~25% of tweets).
 *
 * Requires X_CONSUMER_KEY, X_CONSUMER_SECRET, X_ACCESS_TOKEN,
 * X_ACCESS_TOKEN_SECRET environment variables.
 */
async function handler(_request: NextRequest) {
  const result = await runXReactionCycle();

  return {
    tweetsProcessed: result.tweetsProcessed,
    reactionsCreated: result.reactionsCreated,
    xRepliesSent: result.xRepliesSent,
    details: result.results.map(r => ({
      tweet: `@${r.authorUsername}: "${r.tweetText}"`,
      personas: r.reactions.map(rx => `@${rx.persona}${rx.repliedOnX ? " (+ X reply)" : ""}`),
    })),
  };
}

export const GET = cronHandler("x-react", handler);

// Allow manual trigger via POST from admin
export const POST = cronHandler("x-react", handler, { skipThrottle: true });
