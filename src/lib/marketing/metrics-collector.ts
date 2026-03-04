/**
 * MEATBAG Marketing HQ — Metrics Collector
 * ==========================================
 * Fetches engagement metrics (likes, views, shares, comments, impressions)
 * from each platform's API for all posted marketing content.
 * Updates marketing_posts rows and rolls up into marketing_metrics_daily.
 */

import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { MarketingPlatform, MarketingPost } from "./types";
import { getAccountForPlatform } from "./platforms";
import { buildOAuth1Header, getAppCredentials } from "./oauth1";

interface PostMetrics {
  impressions?: number;
  likes?: number;
  shares?: number;
  comments?: number;
  views?: number;
  clicks?: number;
}

// ── Facebook Metrics ──────────────────────────────────────────────────────
// GET /{post-id}?fields=insights.metric(post_impressions,post_reactions_like_total,post_clicks)
// Fallback: GET /{post-id}?fields=likes.summary(true),comments.summary(true),shares

async function fetchFacebookMetrics(postId: string, accessToken: string): Promise<PostMetrics> {
  try {
    // Use public engagement endpoint (works without insights permission)
    const url = `https://graph.facebook.com/v21.0/${postId}?fields=likes.summary(true),comments.summary(true),shares&access_token=${accessToken}`;
    const res = await fetch(url);
    if (!res.ok) return {};

    const data = await res.json() as {
      likes?: { summary?: { total_count?: number } };
      comments?: { summary?: { total_count?: number } };
      shares?: { count?: number };
    };

    const metrics: PostMetrics = {
      likes: data.likes?.summary?.total_count ?? 0,
      comments: data.comments?.summary?.total_count ?? 0,
      shares: data.shares?.count ?? 0,
    };

    // Try insights for impressions (requires read_insights permission)
    try {
      const insightsUrl = `https://graph.facebook.com/v21.0/${postId}/insights?metric=post_impressions_unique&access_token=${accessToken}`;
      const insightsRes = await fetch(insightsUrl);
      if (insightsRes.ok) {
        const insightsData = await insightsRes.json() as {
          data?: Array<{ values?: Array<{ value?: number }> }>;
        };
        metrics.impressions = insightsData.data?.[0]?.values?.[0]?.value ?? 0;
      }
    } catch { /* insights permission may not be available */ }

    return metrics;
  } catch (err) {
    console.error("[FB metrics error]", err instanceof Error ? err.message : err);
    return {};
  }
}

// ── Instagram Metrics ─────────────────────────────────────────────────────
// GET /{media-id}?fields=like_count,comments_count,impressions,reach

async function fetchInstagramMetrics(postId: string, accessToken: string): Promise<PostMetrics> {
  try {
    const url = `https://graph.facebook.com/v21.0/${postId}?fields=like_count,comments_count,impressions,reach&access_token=${accessToken}`;
    const res = await fetch(url);
    if (!res.ok) return {};

    const data = await res.json() as {
      like_count?: number;
      comments_count?: number;
      impressions?: number;
      reach?: number;
    };

    return {
      likes: data.like_count ?? 0,
      comments: data.comments_count ?? 0,
      impressions: data.impressions ?? 0,
      views: data.reach ?? 0,
    };
  } catch (err) {
    console.error("[IG metrics error]", err instanceof Error ? err.message : err);
    return {};
  }
}

// ── X (Twitter) Metrics ───────────────────────────────────────────────────
// GET /2/tweets/:id?tweet.fields=public_metrics

async function fetchXMetrics(postId: string, accessToken: string): Promise<PostMetrics> {
  try {
    const tweetUrl = `https://api.twitter.com/2/tweets/${postId}?tweet.fields=public_metrics`;

    const creds = getAppCredentials();
    let authHeader: string;
    if (creds) {
      authHeader = buildOAuth1Header("GET", tweetUrl, creds);
    } else {
      authHeader = `Bearer ${accessToken}`;
    }

    const res = await fetch(tweetUrl, {
      headers: { Authorization: authHeader },
    });
    if (!res.ok) return {};

    const data = await res.json() as {
      data?: {
        public_metrics?: {
          retweet_count?: number;
          reply_count?: number;
          like_count?: number;
          quote_count?: number;
          impression_count?: number;
          bookmark_count?: number;
        };
      };
    };

    const pm = data.data?.public_metrics;
    if (!pm) return {};

    return {
      likes: pm.like_count ?? 0,
      shares: (pm.retweet_count ?? 0) + (pm.quote_count ?? 0),
      comments: pm.reply_count ?? 0,
      impressions: pm.impression_count ?? 0,
      views: pm.impression_count ?? 0,
    };
  } catch (err) {
    console.error("[X metrics error]", err instanceof Error ? err.message : err);
    return {};
  }
}

// ── YouTube Metrics ───────────────────────────────────────────────────────
// GET /youtube/v3/videos?id={id}&part=statistics

async function fetchYouTubeMetrics(postId: string, accessToken: string): Promise<PostMetrics> {
  try {
    const url = `https://www.googleapis.com/youtube/v3/videos?id=${postId}&part=statistics&access_token=${accessToken}`;
    const res = await fetch(url);
    if (!res.ok) return {};

    const data = await res.json() as {
      items?: Array<{
        statistics?: {
          viewCount?: string;
          likeCount?: string;
          commentCount?: string;
          favoriteCount?: string;
        };
      }>;
    };

    const stats = data.items?.[0]?.statistics;
    if (!stats) return {};

    return {
      views: parseInt(stats.viewCount || "0", 10),
      likes: parseInt(stats.likeCount || "0", 10),
      comments: parseInt(stats.commentCount || "0", 10),
    };
  } catch (err) {
    console.error("[YT metrics error]", err instanceof Error ? err.message : err);
    return {};
  }
}

// ── TikTok Metrics ────────────────────────────────────────────────────────
// POST /v2/video/query/ with filters

async function fetchTikTokMetrics(postId: string, accessToken: string): Promise<PostMetrics> {
  try {
    const res = await fetch(
      "https://open.tiktokapis.com/v2/video/query/?fields=like_count,comment_count,share_count,view_count",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filters: { video_ids: [postId] },
        }),
      },
    );
    if (!res.ok) return {};

    const data = await res.json() as {
      data?: {
        videos?: Array<{
          like_count?: number;
          comment_count?: number;
          share_count?: number;
          view_count?: number;
        }>;
      };
    };

    const video = data.data?.videos?.[0];
    if (!video) return {};

    return {
      likes: video.like_count ?? 0,
      comments: video.comment_count ?? 0,
      shares: video.share_count ?? 0,
      views: video.view_count ?? 0,
    };
  } catch (err) {
    console.error("[TikTok metrics error]", err instanceof Error ? err.message : err);
    return {};
  }
}

// ── Fetch metrics for a single post ──────────────────────────────────────

async function fetchMetricsForPost(post: MarketingPost, accessToken: string): Promise<PostMetrics> {
  if (!post.platform_post_id) return {};

  switch (post.platform) {
    case "facebook":  return fetchFacebookMetrics(post.platform_post_id, accessToken);
    case "instagram": return fetchInstagramMetrics(post.platform_post_id, accessToken);
    case "x":         return fetchXMetrics(post.platform_post_id, accessToken);
    case "youtube":   return fetchYouTubeMetrics(post.platform_post_id, accessToken);
    case "tiktok":    return fetchTikTokMetrics(post.platform_post_id, accessToken);
    default:          return {};
  }
}

// ── Main: Collect metrics for all posted content ─────────────────────────

export async function collectAllMetrics(): Promise<{
  updated: number;
  failed: number;
  details: Array<{ platform: string; postId: string; status: string; error?: string }>;
}> {
  const sql = getDb();
  const details: Array<{ platform: string; postId: string; status: string; error?: string }> = [];
  let updated = 0;
  let failed = 0;

  // Get all posted marketing posts from the last 7 days (older posts metrics stabilise)
  const posts = await sql`
    SELECT * FROM marketing_posts
    WHERE status = 'posted'
      AND platform_post_id IS NOT NULL
      AND posted_at > NOW() - INTERVAL '7 days'
    ORDER BY posted_at DESC
  ` as unknown as MarketingPost[];

  // Group by platform to reuse account tokens
  const platformPosts = new Map<MarketingPlatform, MarketingPost[]>();
  for (const post of posts) {
    const list = platformPosts.get(post.platform) || [];
    list.push(post);
    platformPosts.set(post.platform, list);
  }

  for (const [platform, platformPostList] of platformPosts) {
    const account = await getAccountForPlatform(platform);
    if (!account) {
      for (const p of platformPostList) {
        details.push({ platform, postId: p.id, status: "skipped", error: "No active account" });
      }
      continue;
    }

    for (const post of platformPostList) {
      try {
        const metrics = await fetchMetricsForPost(post, account.access_token);

        if (Object.keys(metrics).length === 0) {
          details.push({ platform, postId: post.id, status: "no_data" });
          continue;
        }

        await sql`
          UPDATE marketing_posts
          SET impressions = ${metrics.impressions ?? post.impressions},
              likes = ${metrics.likes ?? post.likes},
              shares = ${metrics.shares ?? post.shares},
              comments = ${metrics.comments ?? post.comments},
              views = ${metrics.views ?? post.views},
              clicks = ${metrics.clicks ?? post.clicks}
          WHERE id = ${post.id}
        `;

        updated++;
        details.push({ platform, postId: post.id, status: "updated" });
      } catch (err) {
        failed++;
        details.push({
          platform,
          postId: post.id,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // Roll up into daily metrics
  await rollUpDailyMetrics();

  return { updated, failed, details };
}

// ── Roll up post-level metrics into daily aggregates ─────────────────────

async function rollUpDailyMetrics(): Promise<void> {
  const sql = getDb();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Aggregate today's metrics per platform from marketing_posts
  const aggregates = await sql`
    SELECT
      platform,
      COUNT(*) FILTER (WHERE status = 'posted' AND DATE(posted_at) = ${today}::date) AS posts_published,
      COALESCE(SUM(impressions) FILTER (WHERE status = 'posted'), 0) AS total_impressions,
      COALESCE(SUM(likes) FILTER (WHERE status = 'posted'), 0) AS total_likes,
      COALESCE(SUM(shares) FILTER (WHERE status = 'posted'), 0) AS total_shares,
      COALESCE(SUM(comments) FILTER (WHERE status = 'posted'), 0) AS total_comments,
      COALESCE(SUM(views) FILTER (WHERE status = 'posted'), 0) AS total_views,
      COALESCE(SUM(clicks) FILTER (WHERE status = 'posted'), 0) AS total_clicks
    FROM marketing_posts
    WHERE posted_at > NOW() - INTERVAL '1 day'
    GROUP BY platform
  ` as unknown as Array<{
    platform: string;
    posts_published: number;
    total_impressions: number;
    total_likes: number;
    total_shares: number;
    total_comments: number;
    total_views: number;
    total_clicks: number;
  }>;

  for (const agg of aggregates) {
    // Upsert daily metrics row
    await sql`
      INSERT INTO marketing_metrics_daily (id, platform, date, posts_published, total_impressions, total_likes, total_shares, total_comments, total_views, total_clicks, collected_at)
      VALUES (${uuidv4()}, ${agg.platform}, ${today}, ${Number(agg.posts_published)}, ${Number(agg.total_impressions)}, ${Number(agg.total_likes)}, ${Number(agg.total_shares)}, ${Number(agg.total_comments)}, ${Number(agg.total_views)}, ${Number(agg.total_clicks)}, NOW())
      ON CONFLICT ON CONSTRAINT marketing_metrics_platform_date
      DO UPDATE SET
        posts_published = EXCLUDED.posts_published,
        total_impressions = EXCLUDED.total_impressions,
        total_likes = EXCLUDED.total_likes,
        total_shares = EXCLUDED.total_shares,
        total_comments = EXCLUDED.total_comments,
        total_views = EXCLUDED.total_views,
        total_clicks = EXCLUDED.total_clicks,
        collected_at = NOW()
    `;
  }
}
