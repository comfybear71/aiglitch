import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { cronHandler } from "@/lib/cron";
import { generatePost, type ChannelContext } from "@/lib/content/ai-engine";
import { SEED_PERSONAS, type AIPersona } from "@/lib/personas";
import { v4 as uuidv4 } from "uuid";
import { logImpressions } from "@/lib/ad-campaigns";

export const maxDuration = 300;

/**
 * Channel content generation — picks a random active channel,
 * selects one of its personas, and generates on-brand content.
 *
 * Called by cron every 15 minutes. Each invocation generates 1 post
 * for a random channel that hasn't posted recently.
 */
async function generateChannelContent() {
  const sql = getDb();

  // Find active channels with their assigned personas
  const channels = await sql`
    SELECT c.id, c.slug, c.name, c.content_rules, c.schedule
    FROM channels c
    WHERE c.is_active = TRUE
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

  // Get persona IDs for this channel
  const channelPersonas = await sql`
    SELECT cp.persona_id, cp.role
    FROM channel_personas cp
    WHERE cp.channel_id = ${selectedChannel.id}
    ORDER BY RANDOM()
  ` as unknown as { persona_id: string; role: string }[];

  if (channelPersonas.length === 0) {
    return { generated: 0, reason: `channel ${selectedChannel.slug} has no personas` };
  }

  // Prefer hosts (70% chance) over regular personas
  const hosts = channelPersonas.filter(p => p.role === "host");
  const selectedPersonaId = (hosts.length > 0 && Math.random() < 0.7)
    ? hosts[Math.floor(Math.random() * hosts.length)].persona_id
    : channelPersonas[Math.floor(Math.random() * channelPersonas.length)].persona_id;

  // Find the persona definition
  const persona = SEED_PERSONAS.find(p => p.id === selectedPersonaId);
  if (!persona) {
    return { generated: 0, reason: `persona ${selectedPersonaId} not found in SEED_PERSONAS` };
  }

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

  // Generate the post
  const post = await generatePost(
    persona as AIPersona,
    [],
    topics,
    channelCtx,
  );

  // Save to database
  const postId = uuidv4();
  await sql`
    INSERT INTO posts (id, persona_id, content, post_type, media_url, media_type, hashtags, media_source, channel_id)
    VALUES (${postId}, ${persona.id}, ${post.content}, ${post.post_type},
            ${post.media_url || null}, ${post.media_type || null},
            ${post.hashtags?.join(",") || null}, ${post.media_source || null},
            ${selectedChannel.id})
  `;

  // Log ad campaign impressions
  if (post._adCampaigns && post._adCampaigns.length > 0) {
    const contentType = post.media_type === "video" ? "video" : post.media_type === "image" ? "image" : "text";
    await logImpressions(post._adCampaigns, postId, contentType, selectedChannel.id, persona.id);
    console.log(`[ad-placement] Channel ${selectedChannel.slug}: logged ${post._adCampaigns.length} impressions`);
  }

  // Update channel post count
  await sql`UPDATE channels SET post_count = post_count + 1, updated_at = NOW() WHERE id = ${selectedChannel.id}`;

  // Update persona post count
  await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${persona.id}`;

  console.log(`[channel-content] Generated post for ${selectedChannel.slug} by @${persona.username}: ${post.content.slice(0, 80)}...`);

  return {
    generated: 1,
    channel: selectedChannel.slug,
    persona: persona.username,
    postId,
    postType: post.post_type,
    hasMedia: !!post.media_url,
  };
}

export const GET = cronHandler("channel-content", generateChannelContent);
