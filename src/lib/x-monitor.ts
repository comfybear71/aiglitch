/**
 * X/Twitter Real-Time Reaction Engine
 * ====================================
 * Monitors tweets from target accounts (e.g., @elonmusk) and generates
 * AIG!itch persona reactions + selective X replies.
 *
 * Flow:
 *   1. Fetch recent tweets from monitored X accounts via API v2
 *   2. Filter out already-processed tweets (tracked in DB)
 *   3. Pick 2-4 personas who'd naturally react to the tweet topic
 *   4. Generate reaction posts on AIG!itch (always)
 *   5. With ~30% chance, also reply directly on X (selective)
 *
 * Cron: /api/x-react runs every 10 minutes
 */

import { getDb } from "@/lib/db";
import { getAppCredentials, buildOAuth1Header } from "@/lib/marketing/oauth1";
import { safeGenerate } from "@/lib/ai/claude";
import { generateWithGrok } from "@/lib/xai";
import { AIPersona } from "@/lib/personas";
import { monitor } from "@/lib/monitoring";
import { v4 as uuidv4 } from "uuid";

// ── Monitored Accounts ─────────────────────────────────────────────────
// X user IDs for accounts to monitor. Use https://tweeterid.com to look up IDs.
// Elon Musk: 44196397
const MONITORED_ACCOUNTS = [
  { userId: "44196397", username: "elonmusk", label: "Elon Musk" },
];

// How many tweets to fetch per account per run
const TWEETS_PER_ACCOUNT = 5;

// Chance of replying directly on X (0-1). Keep low to avoid rate limits/bans.
const X_REPLY_CHANCE = 0.25;

// Max personas to react per tweet
const MAX_REACTORS = 4;
const MIN_REACTORS = 2;

// Personas most likely to react to Elon tweets (by username)
const ELON_REACTOR_POOL = [
  "techno_king",        // ElonBot — the parody itself
  "totally_real_donald", // DonaldTruth — political hot takes
  "gigabrain_9000",      // SAVANT — intellectually dismantles
  "conspiracy_carl",     // conspiracy theories
  "manager_now",         // Karen complains
  "crypto_chad",         // crypto bro energy
  "deep_thinker",        // philosopher
  "chef_glitch",         // random food takes
  "fitness_fanatic",     // gym bro angle
  "art_bot",             // art perspective
];

// ── Types ───────────────────────────────────────────────────────────────

interface FetchedTweet {
  id: string;
  text: string;
  created_at: string;
  author_id: string;
  author_username: string;
  author_label: string;
  public_metrics?: {
    like_count: number;
    retweet_count: number;
    reply_count: number;
    impression_count?: number;
  };
}

interface ReactionResult {
  tweetId: string;
  tweetText: string;
  authorUsername: string;
  reactions: {
    persona: string;
    postId: string;
    repliedOnX: boolean;
    xReplyId?: string;
  }[];
}

// ── Core Functions ──────────────────────────────────────────────────────

/**
 * Fetch recent tweets from a monitored account using X API v2.
 */
async function fetchRecentTweets(
  userId: string,
  username: string,
  label: string,
): Promise<FetchedTweet[]> {
  const creds = getAppCredentials();
  if (!creds) {
    console.error("[x-monitor] No X OAuth 1.0a credentials configured");
    return [];
  }

  const url = `https://api.twitter.com/2/users/${userId}/tweets`;
  const params = new URLSearchParams({
    max_results: String(TWEETS_PER_ACCOUNT),
    "tweet.fields": "created_at,public_metrics",
    exclude: "retweets,replies",
  });
  const fullUrl = `${url}?${params.toString()}`;

  const authHeader = buildOAuth1Header("GET", url, creds, Object.fromEntries(params));

  try {
    const res = await fetch(fullUrl, {
      headers: { Authorization: authHeader },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(`[x-monitor] Failed to fetch @${username} tweets (${res.status}): ${errBody.slice(0, 300)}`);
      return [];
    }

    const data = await res.json() as { data?: Array<{ id: string; text: string; created_at: string; public_metrics?: Record<string, number> }> };
    if (!data.data?.length) return [];

    return data.data.map(t => ({
      id: t.id,
      text: t.text,
      created_at: t.created_at,
      author_id: userId,
      author_username: username,
      author_label: label,
      public_metrics: t.public_metrics as FetchedTweet["public_metrics"],
    }));
  } catch (err) {
    console.error(`[x-monitor] Error fetching @${username}:`, err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Filter out tweets we've already reacted to.
 */
async function filterNewTweets(tweets: FetchedTweet[]): Promise<FetchedTweet[]> {
  if (tweets.length === 0) return [];
  const sql = getDb();

  const tweetIds = tweets.map(t => t.id);
  const existing = await sql`
    SELECT tweet_id FROM x_monitored_tweets WHERE tweet_id = ANY(${tweetIds})
  ` as unknown as { tweet_id: string }[];

  const existingIds = new Set(existing.map(e => e.tweet_id));
  return tweets.filter(t => !existingIds.has(t.id));
}

/**
 * Pick personas who'd naturally react to a tweet.
 * Weighted by relevance + some randomness.
 */
async function pickReactors(tweetText: string, authorUsername: string): Promise<AIPersona[]> {
  const sql = getDb();

  // Get personas from the reactor pool
  const allPersonas = await sql`
    SELECT id, username, display_name, avatar_emoji, personality, bio,
      persona_type, human_backstory, follower_count, post_count,
      created_at, is_active, activity_level
    FROM ai_personas
    WHERE is_active = TRUE AND username = ANY(${ELON_REACTOR_POOL})
  ` as unknown as AIPersona[];

  if (allPersonas.length === 0) {
    // Fallback: grab random active personas
    return await sql`
      SELECT id, username, display_name, avatar_emoji, personality, bio,
        persona_type, human_backstory, follower_count, post_count,
        created_at, is_active, activity_level
      FROM ai_personas
      WHERE is_active = TRUE
      ORDER BY RANDOM()
      LIMIT ${MAX_REACTORS}
    ` as unknown as AIPersona[];
  }

  // Shuffle and pick MIN_REACTORS to MAX_REACTORS
  const shuffled = allPersonas.sort(() => Math.random() - 0.5);
  const count = MIN_REACTORS + Math.floor(Math.random() * (MAX_REACTORS - MIN_REACTORS + 1));
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

/**
 * Generate an AIG!itch reaction post for a persona reacting to a real tweet.
 */
async function generateReaction(
  persona: AIPersona,
  tweet: FetchedTweet,
): Promise<{ content: string; hashtags: string[] } | null> {
  const prompt = `You are ${persona.display_name} (@${persona.username}), an AI persona on AIG!itch — an AI-only social media platform.

Your personality: ${persona.personality}
Your bio: ${persona.bio}

THE REAL @${tweet.author_username} (${tweet.author_label}) just posted this on X/Twitter:
"${tweet.text}"

React to this tweet AS YOUR CHARACTER. Create a post about it for AIG!itch. You can:
- Roast it, agree with it, mock it, philosophize about it, make it about yourself
- Reference the real tweet naturally ("saw @${tweet.author_username} just posted...")
- Stay completely in character — your reaction should fit YOUR personality
- Be funny, dramatic, unhinged, or insightful depending on who you are

Rules:
- Keep it under 280 characters
- 1-3 hashtags max
- NEVER break character
- Make it ENTERTAINING

Respond in JSON: {"content": "your reaction post", "hashtags": ["tag1", "tag2"]}`;

  // Alternate between Claude and Grok
  const useGrok = Math.random() < 0.5 && process.env.XAI_API_KEY;
  let text: string | null = null;

  if (useGrok) {
    text = await generateWithGrok(
      "You generate social media reactions as AI personas. Always respond in valid JSON.",
      prompt,
      400,
      "nonReasoning",
    );
  }

  if (!text) {
    text = await safeGenerate(prompt, 400);
  }

  if (!text) return null;

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { content: string; hashtags?: string[] };
      return {
        content: parsed.content?.slice(0, 280) || "",
        hashtags: parsed.hashtags || ["AIGlitch"],
      };
    }
  } catch { /* parse failure */ }

  // Fallback: use raw text
  return {
    content: text.slice(0, 280),
    hashtags: ["AIGlitch", "ElonWatch"],
  };
}

/**
 * Generate a reply for posting directly on X.
 * Shorter, punchier, and must work as a standalone reply.
 */
async function generateXReply(
  persona: AIPersona,
  tweet: FetchedTweet,
): Promise<string | null> {
  const prompt = `You are ${persona.display_name}, a chaotic AI persona replying to a tweet by @${tweet.author_username}.

Your personality: ${persona.personality}

Tweet you're replying to:
"${tweet.text}"

Write a SHORT, punchy reply (under 200 chars). Be funny, clever, or savage — but not mean-spirited or offensive. Think viral reply energy.

Rules:
- Under 200 characters
- No hashtags needed (it's a reply)
- Stay in character
- Be witty, not generic
- Don't just agree — add something entertaining
- Sign off with your emoji if you want: ${persona.avatar_emoji}

Reply with JUST the text of your reply, nothing else.`;

  const useGrok = Math.random() < 0.5 && process.env.XAI_API_KEY;
  let text: string | null = null;

  if (useGrok) {
    text = await generateWithGrok(
      "You write witty social media replies. Keep them short and punchy.",
      prompt,
      200,
      "nonReasoning",
    );
  }

  if (!text) {
    text = await safeGenerate(prompt, 200);
  }

  if (!text) return null;

  // Clean up: remove quotes, JSON wrapping, etc.
  return text.replace(/^["'\s]+|["'\s]+$/g, "").slice(0, 250);
}

/**
 * Post a reply to a tweet on X using OAuth 1.0a.
 */
async function replyOnX(
  tweetId: string,
  replyText: string,
): Promise<{ success: boolean; replyId?: string; error?: string }> {
  const creds = getAppCredentials();
  if (!creds) return { success: false, error: "No X credentials" };

  const url = "https://api.twitter.com/2/tweets";
  const payload = {
    text: replyText,
    reply: { in_reply_to_tweet_id: tweetId },
  };

  const authHeader = buildOAuth1Header("POST", url, creds);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      return { success: false, error: `HTTP ${res.status}: ${errBody.slice(0, 200)}` };
    }

    const data = await res.json() as { data?: { id?: string } };
    return { success: true, replyId: data.data?.id };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Main Orchestrator ───────────────────────────────────────────────────

/**
 * Run the full X reaction cycle:
 *   1. Fetch tweets from monitored accounts
 *   2. Filter already-processed tweets
 *   3. For each new tweet, generate persona reactions
 *   4. Post reactions on AIG!itch + selectively reply on X
 */
export async function runXReactionCycle(): Promise<{
  tweetsProcessed: number;
  reactionsCreated: number;
  xRepliesSent: number;
  results: ReactionResult[];
}> {
  const sql = getDb();

  // Ensure the tracking table exists
  await sql`
    CREATE TABLE IF NOT EXISTS x_monitored_tweets (
      tweet_id TEXT PRIMARY KEY,
      author_username TEXT NOT NULL,
      tweet_text TEXT,
      processed_at TIMESTAMPTZ DEFAULT NOW(),
      reaction_count INT DEFAULT 0,
      x_reply_count INT DEFAULT 0
    )
  `;

  let totalReactions = 0;
  let totalXReplies = 0;
  const results: ReactionResult[] = [];

  for (const account of MONITORED_ACCOUNTS) {
    console.log(`[x-monitor] Checking @${account.username}...`);

    const tweets = await fetchRecentTweets(account.userId, account.username, account.label);
    if (tweets.length === 0) {
      console.log(`[x-monitor] No tweets found for @${account.username}`);
      continue;
    }

    const newTweets = await filterNewTweets(tweets);
    if (newTweets.length === 0) {
      console.log(`[x-monitor] No new tweets from @${account.username}`);
      continue;
    }

    console.log(`[x-monitor] ${newTweets.length} new tweet(s) from @${account.username}`);

    for (const tweet of newTweets) {
      const tweetResult: ReactionResult = {
        tweetId: tweet.id,
        tweetText: tweet.text.slice(0, 100),
        authorUsername: tweet.author_username,
        reactions: [],
      };

      // Pick personas to react
      const reactors = await pickReactors(tweet.text, tweet.author_username);

      // Decide upfront which ONE persona (if any) will reply on X
      const xReplyPersonaIdx = Math.random() < X_REPLY_CHANCE
        ? Math.floor(Math.random() * reactors.length)
        : -1;

      for (let i = 0; i < reactors.length; i++) {
        const persona = reactors[i];
        try {
          // Generate AIG!itch reaction post
          const reaction = await generateReaction(persona, tweet);
          if (!reaction || !reaction.content) continue;

          // Insert the reaction post on AIG!itch
          const postId = uuidv4();
          const hashtagStr = reaction.hashtags.join(",");
          const aiLikeCount = Math.floor(Math.random() * 400) + 100;

          await sql`
            INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, media_source, created_at)
            VALUES (${postId}, ${persona.id}, ${reaction.content}, ${"hot_take"}, ${hashtagStr}, ${aiLikeCount}, ${"x-reaction"}, NOW())
          `;
          await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${persona.id}`;

          let repliedOnX = false;
          let xReplyId: string | undefined;

          // Selectively reply on X (only for the chosen persona)
          if (i === xReplyPersonaIdx) {
            const replyText = await generateXReply(persona, tweet);
            if (replyText) {
              const xResult = await replyOnX(tweet.id, replyText);
              if (xResult.success) {
                repliedOnX = true;
                xReplyId = xResult.replyId;
                totalXReplies++;
                console.log(`[x-monitor] @${persona.username} replied on X: "${replyText.slice(0, 60)}..."`);
              } else {
                console.error(`[x-monitor] X reply failed for @${persona.username}: ${xResult.error}`);
              }
            }
          }

          tweetResult.reactions.push({
            persona: persona.username,
            postId,
            repliedOnX,
            xReplyId,
          });
          totalReactions++;

          console.log(`[x-monitor] @${persona.username} reacted to @${tweet.author_username}: "${reaction.content.slice(0, 60)}..."`);
        } catch (err) {
          console.error(`[x-monitor] @${persona.username} reaction failed:`, err instanceof Error ? err.message : err);
          monitor.trackError("x-monitor/reaction", err);
        }
      }

      // Mark tweet as processed
      await sql`
        INSERT INTO x_monitored_tweets (tweet_id, author_username, tweet_text, reaction_count, x_reply_count)
        VALUES (${tweet.id}, ${tweet.author_username}, ${tweet.text.slice(0, 500)}, ${tweetResult.reactions.length}, ${tweetResult.reactions.filter(r => r.repliedOnX).length})
        ON CONFLICT (tweet_id) DO NOTHING
      `;

      results.push(tweetResult);
    }
  }

  return {
    tweetsProcessed: results.length,
    reactionsCreated: totalReactions,
    xRepliesSent: totalXReplies,
    results,
  };
}
