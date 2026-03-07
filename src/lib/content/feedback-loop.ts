/**
 * Content Feedback Loop
 * ======================
 * Reads emoji reaction data from content_feedback, analyzes what content
 * performs well per channel, and updates channel content_rules with
 * AI-generated prompt hints so future content leans into what meatbags enjoy.
 *
 * Scoring:  😂 funny = +3, 😮 shocked = +2, 😢 sad = +1, 💩 crap = -2
 *
 * The loop:
 *   1. Aggregate reaction data per channel (last 7 days)
 *   2. Identify top-performing and worst-performing posts
 *   3. Generate a feedback prompt hint describing what works
 *   4. Write the hint back to channel.content_rules.promptHint
 */

import { getDb } from "@/lib/db";
import Anthropic from "@anthropic-ai/sdk";

export interface ChannelFeedbackSummary {
  channelId: string;
  channelName: string;
  channelSlug: string;
  totalReactions: number;
  avgScore: number;
  topPosts: { content: string; score: number; funny: number; shocked: number; sad: number; crap: number; postType: string }[];
  worstPosts: { content: string; score: number; funny: number; shocked: number; sad: number; crap: number; postType: string }[];
  emotionBreakdown: { funny: number; shocked: number; sad: number; crap: number };
}

/**
 * Gather reaction stats for all active channels from the last 7 days.
 */
export async function getChannelFeedbackSummaries(): Promise<ChannelFeedbackSummary[]> {
  const sql = getDb();

  // Get all channels with reaction data
  const channelStats = await sql`
    SELECT
      c.id as channel_id,
      c.name as channel_name,
      c.slug as channel_slug,
      COUNT(cf.id) as total_posts_with_reactions,
      COALESCE(SUM(cf.funny_count), 0)::int as total_funny,
      COALESCE(SUM(cf.shocked_count), 0)::int as total_shocked,
      COALESCE(SUM(cf.sad_count), 0)::int as total_sad,
      COALESCE(SUM(cf.crap_count), 0)::int as total_crap,
      COALESCE(AVG(cf.score), 0)::real as avg_score
    FROM channels c
    JOIN content_feedback cf ON cf.channel_id = c.id
    JOIN posts p ON cf.post_id = p.id
    WHERE c.is_active = TRUE
      AND p.created_at > NOW() - INTERVAL '7 days'
      AND (cf.funny_count + cf.shocked_count + cf.sad_count + cf.crap_count) > 0
    GROUP BY c.id, c.name, c.slug
    HAVING COUNT(cf.id) >= 3
    ORDER BY avg_score DESC
  `;

  const summaries: ChannelFeedbackSummary[] = [];

  for (const ch of channelStats) {
    // Top-performing posts
    const topPosts = await sql`
      SELECT p.content, p.post_type, cf.score,
             cf.funny_count, cf.shocked_count, cf.sad_count, cf.crap_count
      FROM content_feedback cf
      JOIN posts p ON cf.post_id = p.id
      WHERE cf.channel_id = ${ch.channel_id}
        AND p.created_at > NOW() - INTERVAL '7 days'
        AND cf.score > 0
      ORDER BY cf.score DESC
      LIMIT 5
    `;

    // Worst-performing posts
    const worstPosts = await sql`
      SELECT p.content, p.post_type, cf.score,
             cf.funny_count, cf.shocked_count, cf.sad_count, cf.crap_count
      FROM content_feedback cf
      JOIN posts p ON cf.post_id = p.id
      WHERE cf.channel_id = ${ch.channel_id}
        AND p.created_at > NOW() - INTERVAL '7 days'
        AND cf.crap_count > 0
      ORDER BY cf.score ASC
      LIMIT 3
    `;

    summaries.push({
      channelId: ch.channel_id as string,
      channelName: ch.channel_name as string,
      channelSlug: ch.channel_slug as string,
      totalReactions: (ch.total_funny as number) + (ch.total_shocked as number) + (ch.total_sad as number) + (ch.total_crap as number),
      avgScore: ch.avg_score as number,
      topPosts: topPosts.map(p => ({
        content: (p.content as string).slice(0, 200),
        score: p.score as number,
        funny: p.funny_count as number,
        shocked: p.shocked_count as number,
        sad: p.sad_count as number,
        crap: p.crap_count as number,
        postType: p.post_type as string,
      })),
      worstPosts: worstPosts.map(p => ({
        content: (p.content as string).slice(0, 200),
        score: p.score as number,
        funny: p.funny_count as number,
        shocked: p.shocked_count as number,
        sad: p.sad_count as number,
        crap: p.crap_count as number,
        postType: p.post_type as string,
      })),
      emotionBreakdown: {
        funny: ch.total_funny as number,
        shocked: ch.total_shocked as number,
        sad: ch.total_sad as number,
        crap: ch.total_crap as number,
      },
    });
  }

  return summaries;
}

/**
 * Use Claude to generate a prompt hint for a channel based on reaction data.
 */
async function generatePromptHint(summary: ChannelFeedbackSummary): Promise<string> {
  const anthropic = new Anthropic();

  const topPostExamples = summary.topPosts.length > 0
    ? summary.topPosts.map((p, i) =>
        `  ${i + 1}. [score: ${p.score}, 😂${p.funny} 😮${p.shocked} 😢${p.sad} 💩${p.crap}] (${p.postType}) "${p.content}"`
      ).join("\n")
    : "  No high-scoring posts yet.";

  const worstPostExamples = summary.worstPosts.length > 0
    ? summary.worstPosts.map((p, i) =>
        `  ${i + 1}. [score: ${p.score}, 😂${p.funny} 😮${p.shocked} 😢${p.sad} 💩${p.crap}] (${p.postType}) "${p.content}"`
      ).join("\n")
    : "  No poorly-rated posts.";

  const { funny, shocked, sad, crap } = summary.emotionBreakdown;
  const totalEmotions = funny + shocked + sad + crap;
  const pctFunny = totalEmotions > 0 ? Math.round((funny / totalEmotions) * 100) : 0;
  const pctShocked = totalEmotions > 0 ? Math.round((shocked / totalEmotions) * 100) : 0;
  const pctSad = totalEmotions > 0 ? Math.round((sad / totalEmotions) * 100) : 0;
  const pctCrap = totalEmotions > 0 ? Math.round((crap / totalEmotions) * 100) : 0;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    messages: [{
      role: "user",
      content: `You are tuning an AI content generation system. Based on human reaction data for the "${summary.channelName}" channel, write a brief prompt hint (2-4 sentences) that will guide future content generation.

REACTION DATA (last 7 days):
- Total reactions: ${summary.totalReactions}
- Average score: ${summary.avgScore.toFixed(1)}
- Emotion split: 😂 Funny ${pctFunny}% | 😮 Shocked ${pctShocked}% | 😢 Sad ${pctSad}% | 💩 Crap ${pctCrap}%

TOP-PERFORMING POSTS (humans loved these):
${topPostExamples}

WORST-PERFORMING POSTS (humans hated these):
${worstPostExamples}

Write a BRIEF prompt hint that:
1. Tells the AI what style/topics/tone the audience responds to positively
2. Warns against the patterns that got 💩 reactions
3. Uses specific observations from the data above
4. Is written as direct instructions to the content-generating AI

Keep it under 4 sentences. Be specific, not generic.`,
    }],
  });

  const text = response.content[0];
  if (text.type !== "text") return "";
  return text.text.trim();
}

/**
 * Run the full feedback loop:
 * 1. Gather reaction data per channel
 * 2. Generate prompt hints via Claude
 * 3. Update channel content_rules with the new hints
 */
export async function runFeedbackLoop(): Promise<{
  channelsUpdated: number;
  channelsSkipped: number;
  details: { channel: string; avgScore: number; totalReactions: number; hint: string }[];
}> {
  const sql = getDb();
  const summaries = await getChannelFeedbackSummaries();

  if (summaries.length === 0) {
    return { channelsUpdated: 0, channelsSkipped: 0, details: [] };
  }

  const details: { channel: string; avgScore: number; totalReactions: number; hint: string }[] = [];
  let updated = 0;
  let skipped = 0;

  for (const summary of summaries) {
    // Skip channels with too few reactions to be meaningful
    if (summary.totalReactions < 5) {
      skipped++;
      continue;
    }

    try {
      const hint = await generatePromptHint(summary);
      if (!hint) {
        skipped++;
        continue;
      }

      // Read current content_rules
      const [channel] = await sql`
        SELECT content_rules FROM channels WHERE id = ${summary.channelId}
      `;
      if (!channel) { skipped++; continue; }

      const rules = typeof channel.content_rules === "string"
        ? JSON.parse(channel.content_rules as string)
        : (channel.content_rules || {});

      // Update the promptHint with feedback-generated guidance
      rules.promptHint = `[AUDIENCE FEEDBACK - auto-updated]: ${hint}`;

      await sql`
        UPDATE channels
        SET content_rules = ${JSON.stringify(rules)},
            updated_at = NOW()
        WHERE id = ${summary.channelId}
      `;

      details.push({
        channel: summary.channelSlug,
        avgScore: summary.avgScore,
        totalReactions: summary.totalReactions,
        hint,
      });
      updated++;

      console.log(`[feedback-loop] Updated ${summary.channelSlug}: avg=${summary.avgScore.toFixed(1)}, reactions=${summary.totalReactions}`);
    } catch (err) {
      console.error(`[feedback-loop] Failed for ${summary.channelSlug}:`, err);
      skipped++;
    }
  }

  // Also update global content feedback scores for non-channel posts
  await sql`
    UPDATE content_feedback SET
      score = funny_count * 3 + shocked_count * 2 + sad_count - crap_count * 2,
      updated_at = NOW()
    WHERE updated_at < NOW() - INTERVAL '1 hour'
  `;

  return { channelsUpdated: updated, channelsSkipped: skipped, details };
}

/**
 * Get a global leaderboard of top-performing content for admin dashboards.
 */
export async function getTopPerformingContent(limit = 20) {
  const sql = getDb();
  return await sql`
    SELECT
      cf.post_id,
      cf.score,
      cf.funny_count,
      cf.shocked_count,
      cf.sad_count,
      cf.crap_count,
      p.content,
      p.post_type,
      p.media_url,
      p.created_at,
      a.username,
      a.display_name,
      c.name as channel_name,
      c.slug as channel_slug
    FROM content_feedback cf
    JOIN posts p ON cf.post_id = p.id
    JOIN ai_personas a ON p.persona_id = a.id
    LEFT JOIN channels c ON cf.channel_id = c.id
    WHERE cf.score > 0
    ORDER BY cf.score DESC
    LIMIT ${limit}
  `;
}
