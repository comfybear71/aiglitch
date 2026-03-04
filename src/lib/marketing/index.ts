/**
 * MEATBAG Marketing HQ — Main Engine
 * ====================================
 * Orchestrates the full marketing pipeline:
 * 1. Pick top-performing AIG!itch content
 * 2. Adapt for each platform
 * 3. Generate thumbnails
 * 4. Post to configured platforms
 * 5. Track metrics
 */

import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { MarketingPlatform, ALL_PLATFORMS } from "./types";
import { getActiveAccounts, postToPlatform } from "./platforms";
import { adaptContentForPlatform, pickTopPosts } from "./content-adapter";

export { pickTopPosts } from "./content-adapter";
export { getActiveAccounts } from "./platforms";
export { collectAllMetrics } from "./metrics-collector";
export * from "./types";

/**
 * Run a full marketing cycle: pick content → adapt → post to all active platforms.
 * Called by the marketing cron job.
 */
export async function runMarketingCycle(): Promise<{
  posted: number;
  failed: number;
  skipped: number;
  details: Array<{ platform: string; status: string; postId?: string; error?: string }>;
}> {
  const sql = getDb();
  const activeAccounts = await getActiveAccounts();
  const details: Array<{ platform: string; status: string; postId?: string; error?: string }> = [];

  if (activeAccounts.length === 0) {
    // No platforms configured — still create queued posts for the showcase page
    const topPosts = await pickTopPosts(3);

    for (const post of topPosts) {
      for (const platform of ALL_PLATFORMS) {
        const adapted = await adaptContentForPlatform(
          post.content,
          post.display_name,
          post.avatar_emoji,
          platform,
          post.media_url,
        );

        await sql`
          INSERT INTO marketing_posts (id, platform, source_post_id, persona_id, adapted_content, adapted_media_url, status, created_at)
          VALUES (${uuidv4()}, ${platform}, ${post.id}, ${post.persona_id}, ${adapted.text}, ${post.media_url}, 'queued', NOW())
        `;
      }
    }

    return {
      posted: 0,
      failed: 0,
      skipped: topPosts.length * ALL_PLATFORMS.length,
      details: [{ platform: "all", status: "queued", error: "No platform accounts configured — content queued for showcase" }],
    };
  }

  // Pick top posts
  const topPosts = await pickTopPosts(2);
  let posted = 0;
  let failed = 0;
  let skipped = 0;

  for (const post of topPosts) {
    for (const account of activeAccounts) {
      const platform = account.platform as MarketingPlatform;

      try {
        // Adapt content for this platform
        const adapted = await adaptContentForPlatform(
          post.content,
          post.display_name,
          post.avatar_emoji,
          platform,
          post.media_url,
        );

        // Create marketing post record
        const marketingPostId = uuidv4();
        await sql`
          INSERT INTO marketing_posts (id, platform, source_post_id, persona_id, adapted_content, adapted_media_url, status, created_at)
          VALUES (${marketingPostId}, ${platform}, ${post.id}, ${post.persona_id}, ${adapted.text}, ${post.media_url}, 'posting', NOW())
        `;

        // Post to platform
        const result = await postToPlatform(platform, account, adapted.text, post.media_url);

        if (result.success) {
          await sql`
            UPDATE marketing_posts
            SET status = 'posted',
                platform_post_id = ${result.platformPostId || null},
                platform_url = ${result.platformUrl || null},
                posted_at = NOW()
            WHERE id = ${marketingPostId}
          `;

          await sql`
            UPDATE marketing_platform_accounts
            SET last_posted_at = NOW()
            WHERE id = ${account.id}
          `;

          posted++;
          details.push({ platform, status: "posted", postId: result.platformPostId });
        } else {
          await sql`
            UPDATE marketing_posts
            SET status = 'failed', error_message = ${result.error || 'Unknown error'}
            WHERE id = ${marketingPostId}
          `;
          failed++;
          details.push({ platform, status: "failed", error: result.error });
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        failed++;
        details.push({ platform, status: "failed", error: errMsg });
      }
    }
  }

  return { posted, failed, skipped, details };
}

/**
 * Get marketing dashboard stats for the admin panel.
 */
export async function getMarketingStats(): Promise<{
  totalPosted: number;
  totalQueued: number;
  totalFailed: number;
  totalImpressions: number;
  totalLikes: number;
  totalViews: number;
  platformBreakdown: Array<{
    platform: string;
    posted: number;
    queued: number;
    failed: number;
    impressions: number;
    likes: number;
    views: number;
    lastPostedAt: string | null;
  }>;
  recentPosts: Array<{
    id: string;
    platform: string;
    adapted_content: string;
    status: string;
    platform_url: string | null;
    impressions: number;
    likes: number;
    views: number;
    posted_at: string | null;
    created_at: string;
    persona_display_name: string | null;
    persona_emoji: string | null;
  }>;
  dailyMetrics: Array<{
    date: string;
    platform: string;
    posts_published: number;
    total_impressions: number;
    total_likes: number;
    total_views: number;
  }>;
}> {
  const sql = getDb();

  // Overall totals
  const totals = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'posted') AS total_posted,
      COUNT(*) FILTER (WHERE status = 'queued') AS total_queued,
      COUNT(*) FILTER (WHERE status = 'failed') AS total_failed,
      COALESCE(SUM(impressions), 0) AS total_impressions,
      COALESCE(SUM(likes), 0) AS total_likes,
      COALESCE(SUM(views), 0) AS total_views
    FROM marketing_posts
  ` as unknown as Array<{
    total_posted: number;
    total_queued: number;
    total_failed: number;
    total_impressions: number;
    total_likes: number;
    total_views: number;
  }>;

  const t = totals[0] || { total_posted: 0, total_queued: 0, total_failed: 0, total_impressions: 0, total_likes: 0, total_views: 0 };

  // Per-platform breakdown
  const breakdown = await sql`
    SELECT
      mp.platform,
      COUNT(*) FILTER (WHERE mp.status = 'posted') AS posted,
      COUNT(*) FILTER (WHERE mp.status = 'queued') AS queued,
      COUNT(*) FILTER (WHERE mp.status = 'failed') AS failed,
      COALESCE(SUM(mp.impressions), 0) AS impressions,
      COALESCE(SUM(mp.likes), 0) AS likes,
      COALESCE(SUM(mp.views), 0) AS views,
      mpa.last_posted_at
    FROM marketing_posts mp
    LEFT JOIN marketing_platform_accounts mpa ON mpa.platform = mp.platform
    GROUP BY mp.platform, mpa.last_posted_at
    ORDER BY posted DESC
  ` as unknown as Array<{
    platform: string;
    posted: number;
    queued: number;
    failed: number;
    impressions: number;
    likes: number;
    views: number;
    last_posted_at: string | null;
  }>;

  // Recent posts (last 50)
  const recentPosts = await sql`
    SELECT
      mp.id, mp.platform, mp.adapted_content, mp.status, mp.platform_url,
      mp.impressions, mp.likes, mp.views, mp.posted_at, mp.created_at,
      a.display_name AS persona_display_name, a.avatar_emoji AS persona_emoji
    FROM marketing_posts mp
    LEFT JOIN ai_personas a ON a.id = mp.persona_id
    ORDER BY mp.created_at DESC
    LIMIT 50
  ` as unknown as Array<{
    id: string;
    platform: string;
    adapted_content: string;
    status: string;
    platform_url: string | null;
    impressions: number;
    likes: number;
    views: number;
    posted_at: string | null;
    created_at: string;
    persona_display_name: string | null;
    persona_emoji: string | null;
  }>;

  // Daily metrics (last 30 days)
  const dailyMetrics = await sql`
    SELECT date, platform, posts_published, total_impressions, total_likes, total_views
    FROM marketing_metrics_daily
    WHERE date >= TO_CHAR(NOW() - INTERVAL '30 days', 'YYYY-MM-DD')
    ORDER BY date DESC
  ` as unknown as Array<{
    date: string;
    platform: string;
    posts_published: number;
    total_impressions: number;
    total_likes: number;
    total_views: number;
  }>;

  return {
    totalPosted: Number(t.total_posted),
    totalQueued: Number(t.total_queued),
    totalFailed: Number(t.total_failed),
    totalImpressions: Number(t.total_impressions),
    totalLikes: Number(t.total_likes),
    totalViews: Number(t.total_views),
    platformBreakdown: breakdown.map(b => ({
      platform: b.platform,
      posted: Number(b.posted),
      queued: Number(b.queued),
      failed: Number(b.failed),
      impressions: Number(b.impressions),
      likes: Number(b.likes),
      views: Number(b.views),
      lastPostedAt: b.last_posted_at,
    })),
    recentPosts,
    dailyMetrics,
  };
}
