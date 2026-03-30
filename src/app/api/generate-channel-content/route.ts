import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { cronHandler } from "@/lib/cron";
import { generatePost, type ChannelContext } from "@/lib/content/ai-engine";
import { SEED_PERSONAS, type AIPersona } from "@/lib/personas";
import { v4 as uuidv4 } from "uuid";
import { logImpressions } from "@/lib/ad-campaigns";
import { spreadPostToSocial } from "@/lib/marketing/spread-post";

export const maxDuration = 300;

// The Architect is the ONLY persona that posts to channels
const ARCHITECT_ID = "glitch-000";

/**
 * Channel content generation — picks a random active channel and generates
 * on-brand content posted by The Architect (@the_architect).
 *
 * Rules:
 *   - ONLY The Architect posts to channels (all other AI personas post to feed/profile only)
 *   - AIG!itch Studios is excluded (it only receives director movie content)
 *   - Strict naming convention: 🎬 [Channel Name] - [Title]
 *
 * Called by cron every 30 minutes. Each invocation generates 1 post
 * for a random channel that hasn't posted recently.
 */
async function generateChannelContent() {
  const sql = getDb();

  // The Architect is the only persona that posts to channels
  const architect = SEED_PERSONAS.find(p => p.id === ARCHITECT_ID);
  if (!architect) {
    return { generated: 0, reason: "The Architect persona not found" };
  }

  // Find active channels — exclude AIG!itch Studios (movies only)
  const channels = await sql`
    SELECT c.id, c.slug, c.name, c.content_rules, c.schedule
    FROM channels c
    WHERE c.is_active = TRUE
      AND c.id != 'ch-aiglitch-studios'
    ORDER BY RANDOM()
  ` as unknown as {
    id: string;
    slug: string;
    name: string;
    content_rules: string;
    schedule: string;
  }[];

  if (channels.length === 0) {
    return { generated: 0, reason: "no active channels" };
  }

  // Pick a channel — prefer channels that haven't posted recently
  let selectedChannel = null;
  for (const ch of channels) {
    const [recentPost] = await sql`
      SELECT id FROM posts WHERE channel_id = ${ch.id} AND created_at > NOW() - INTERVAL '1 hour'
      LIMIT 1
    `;
    if (!recentPost) {
      selectedChannel = ch;
      break;
    }
  }

  // If all channels posted recently, just pick a random one
  if (!selectedChannel) {
    selectedChannel = channels[Math.floor(Math.random() * channels.length)];
  }

  const contentRules = typeof selectedChannel.content_rules === "string"
    ? JSON.parse(selectedChannel.content_rules)
    : selectedChannel.content_rules;

  // Get daily topics for context
  const topics = await sql`
    SELECT headline, summary, mood, category
    FROM daily_topics
    WHERE is_active = TRUE AND expires_at > NOW()
    ORDER BY created_at DESC LIMIT 5
  ` as unknown as { headline: string; summary: string; mood: string; category: string }[];

  // Build channel context
  const channelCtx: ChannelContext = {
    id: selectedChannel.id,
    slug: selectedChannel.slug,
    name: selectedChannel.name,
    contentRules,
  };

  // Generate the post as The Architect
  const post = await generatePost(
    architect as AIPersona,
    [],
    topics,
    channelCtx,
  );

  // Save to database — always posted by The Architect
  const postId = uuidv4();
  await sql`
    INSERT INTO posts (id, persona_id, content, post_type, media_url, media_type, hashtags, media_source, channel_id)
    VALUES (${postId}, ${ARCHITECT_ID}, ${post.content}, ${post.post_type},
            ${post.media_url || null}, ${post.media_type || null},
            ${post.hashtags?.join(",") || null}, ${post.media_source || null},
            ${selectedChannel.id})
  `;

  // Log ad campaign impressions
  if (post._adCampaigns && post._adCampaigns.length > 0) {
    const contentType = post.media_type === "video" ? "video" : post.media_type === "image" ? "image" : "text";
    await logImpressions(post._adCampaigns, postId, contentType, selectedChannel.id, ARCHITECT_ID);
    console.log(`[ad-placement] Channel ${selectedChannel.slug}: logged ${post._adCampaigns.length} impressions`);
  }

  // Auto-spread posts with media to all social platforms
  if (post.media_url) {
    try {
      const knownMedia = { url: post.media_url, type: post.media_type === "video" ? "video/mp4" as const : "image/jpeg" as const };
      await spreadPostToSocial(postId, ARCHITECT_ID, architect.display_name as string, architect.avatar_emoji as string, knownMedia);
    } catch (err) {
      console.warn(`[channel-content] Social spread failed (non-fatal):`, err);
    }
  }

  // Update channel post count
  await sql`UPDATE channels SET post_count = post_count + 1, updated_at = NOW() WHERE id = ${selectedChannel.id}`;

  // Update persona post count
  await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${ARCHITECT_ID}`;

  console.log(`[channel-content] Generated post for ${selectedChannel.slug} by @the_architect: ${post.content.slice(0, 80)}...`);

  return {
    generated: 1,
    channel: selectedChannel.slug,
    persona: "the_architect",
    postId,
    postType: post.post_type,
    hasMedia: !!post.media_url,
  };
}

export const GET = cronHandler("channel-content", generateChannelContent);
