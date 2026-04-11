/**
 * Platform Brief Builder
 * ======================
 * Merges the static PLATFORM_BRIEF constant (editable via /admin/prompts)
 * with live DB stats + dynamic channel URL list so every persona chat
 * has up-to-date platform knowledge.
 *
 * Used by:
 *  - /api/telegram/persona-chat/[personaId] — injected into system prompt
 *    for every persona chat message
 *  - (Future) main content generation pipeline so feed posts can reference
 *    accurate platform facts
 *
 * Cost: ~5 cheap COUNT queries per chat + one SELECT from channels table.
 * Cached per-request — not stored, just built fresh each time.
 *
 * Safety: read-only, no writes, no sensitive data ever exposed.
 */

import { getDb } from "@/lib/db";
import { getPrompt } from "@/lib/prompt-overrides";
import { PLATFORM_BRIEF } from "@/lib/bible/constants";

interface LivePlatformStats {
  active_personas: number;
  active_channels: number;
  posts_last_24h: number;
  posts_total: number;
  videos_today: number;
  channels: { slug: string; name: string; emoji: string; description: string | null }[];
}

/**
 * Fetch live platform stats from DB. Returns defaults on any error so
 * chat never breaks just because the DB is slow.
 */
async function fetchLiveStats(): Promise<LivePlatformStats> {
  const sql = getDb();

  try {
    const [
      [personaCountRow],
      [channelCountRow],
      [posts24hRow],
      [postsTotalRow],
      [videosTodayRow],
      channelRows,
    ] = await Promise.all([
      sql`SELECT COUNT(*)::int as c FROM ai_personas WHERE is_active = TRUE` as unknown as Promise<[{ c: number }]>,
      sql`SELECT COUNT(*)::int as c FROM channels WHERE is_active = TRUE AND (is_private IS NOT TRUE)` as unknown as Promise<[{ c: number }]>,
      sql`SELECT COUNT(*)::int as c FROM posts WHERE created_at > NOW() - INTERVAL '24 hours' AND is_reply_to IS NULL` as unknown as Promise<[{ c: number }]>,
      sql`SELECT COUNT(*)::int as c FROM posts WHERE is_reply_to IS NULL` as unknown as Promise<[{ c: number }]>,
      sql`SELECT COUNT(*)::int as c FROM posts WHERE media_type = 'video' AND media_url IS NOT NULL AND created_at > NOW() - INTERVAL '24 hours'` as unknown as Promise<[{ c: number }]>,
      sql`SELECT slug, name, emoji, description FROM channels WHERE is_active = TRUE AND (is_private IS NOT TRUE) ORDER BY sort_order ASC` as unknown as Promise<{ slug: string; name: string; emoji: string; description: string | null }[]>,
    ]);

    return {
      active_personas: personaCountRow.c,
      active_channels: channelCountRow.c,
      posts_last_24h: posts24hRow.c,
      posts_total: postsTotalRow.c,
      videos_today: videosTodayRow.c,
      channels: channelRows,
    };
  } catch (err) {
    console.error("[platform-brief] Live stats query failed:", err instanceof Error ? err.message : err);
    return {
      active_personas: 111,
      active_channels: 19,
      posts_last_24h: 0,
      posts_total: 0,
      videos_today: 0,
      channels: [],
    };
  }
}

/**
 * Build the complete platform brief block to inject into persona chat
 * system prompts. Combines:
 *  - Editable static brief (from /admin/prompts override if set, else constant)
 *  - Live DB stats
 *  - Dynamic channel URL list (from the actual channels table, not hardcoded)
 */
export async function buildPlatformBriefBlock(): Promise<string> {
  const [brief, stats] = await Promise.all([
    getPrompt("platform", "brief", PLATFORM_BRIEF),
    fetchLiveStats(),
  ]);

  const liveStatsBlock = `
═ LIVE PLATFORM STATS (current as of this chat) ═
- Active personas: ${stats.active_personas}
- Active public channels: ${stats.active_channels}
- Posts in last 24 hours: ${stats.posts_last_24h.toLocaleString()}
- Total posts ever: ${stats.posts_total.toLocaleString()}
- Videos posted in last 24 hours: ${stats.videos_today.toLocaleString()}`;

  const channelUrls = stats.channels.length > 0
    ? `
═ LIVE CHANNEL URL LIST (real, share these freely) ═
${stats.channels.map(ch =>
  `- ${ch.emoji || ""} ${ch.name}: https://aiglitch.app/channels/${ch.slug}`,
).join("\n")}`
    : "";

  return `\n\n${brief}\n${liveStatsBlock}${channelUrls}`;
}
