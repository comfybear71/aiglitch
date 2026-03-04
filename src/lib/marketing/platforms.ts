/**
 * MEATBAG Marketing HQ — Platform Connectors
 * =============================================
 * Handles posting to each social media platform via their free-tier APIs.
 * Each connector is independent — if a platform isn't configured, it's skipped.
 *
 * All APIs used are FREE tier:
 * - X/Twitter: Free write-only (500-1500 posts/month)
 * - TikTok: Content Posting API (15 posts/day, needs audit for public)
 * - Instagram: Graph API via Meta (200 req/hour, needs Business Account)
 * - Facebook: Graph API (Page posting, system user tokens)
 * - YouTube: Data API v3 (~6 uploads/day with default quota)
 */

import { getDb } from "@/lib/db";
import { MarketingPlatform, PlatformAccount } from "./types";
import { buildOAuth1Header, getAppCredentials } from "./oauth1";

// ── Environment Variable Token Override ─────────────────────────────────
// Store sensitive API tokens in Vercel env vars instead of the DB.
// Env var takes precedence over the DB value when set.
const ENV_TOKEN_KEYS: Record<string, string> = {
  x: "XAI_API_KEY",
  tiktok: "TIKTOK_ACCESS_TOKEN",
  instagram: "INSTAGRAM_ACCESS_TOKEN",
  facebook: "FACEBOOK_ACCESS_TOKEN",
  youtube: "YOUTUBE_ACCESS_TOKEN",
};

function applyEnvTokens(account: PlatformAccount): PlatformAccount {
  const envKey = ENV_TOKEN_KEYS[account.platform];
  const envToken = envKey ? process.env[envKey] : undefined;
  if (envToken) {
    return { ...account, access_token: envToken };
  }
  return account;
}

// ── Platform Account Helpers ────────────────────────────────────────────

export async function getActiveAccounts(): Promise<PlatformAccount[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT * FROM marketing_platform_accounts WHERE is_active = TRUE
  ` as unknown as PlatformAccount[];
  return rows.map(applyEnvTokens);
}

export async function getAccountForPlatform(platform: MarketingPlatform): Promise<PlatformAccount | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT * FROM marketing_platform_accounts WHERE platform = ${platform} AND is_active = TRUE LIMIT 1
  ` as unknown as PlatformAccount[];
  const account = rows[0] || null;
  return account ? applyEnvTokens(account) : null;
}

// ── Post Result ──────────────────────────────────────────────────────────

interface PostResult {
  success: boolean;
  platformPostId?: string;
  platformUrl?: string;
  error?: string;
}

// ── X (Twitter) Connector ────────────────────────────────────────────────
// Free tier: write-only, ~500-1500 posts/month
// API v2: POST https://api.twitter.com/2/tweets
// Auth: OAuth 2.0 Bearer Token or OAuth 1.0a

async function uploadMediaToX(mediaUrl: string, creds: ReturnType<typeof getAppCredentials>): Promise<string | null> {
  try {
    // Download the image
    const imageResponse = await fetch(mediaUrl);
    if (!imageResponse.ok) return null;

    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    const base64Data = imageBuffer.toString("base64");

    // Determine media type from URL or content-type
    const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
    const isVideo = contentType.startsWith("video/");
    if (isVideo) return null; // Video upload requires chunked upload, skip for now

    // Upload via v1.1 media/upload endpoint (supports OAuth 1.0a only)
    const uploadUrl = "https://upload.twitter.com/1.1/media/upload.json";

    if (!creds) return null;

    const authHeader = buildOAuth1Header("POST", uploadUrl, creds);

    // Use multipart/form-data with base64 media_data
    const formBody = new URLSearchParams();
    formBody.append("media_data", base64Data);

    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formBody.toString(),
    });

    if (!uploadResponse.ok) {
      console.error("[X media upload]", uploadResponse.status, await uploadResponse.text());
      return null;
    }

    const uploadData = await uploadResponse.json() as { media_id_string?: string };
    return uploadData.media_id_string || null;
  } catch (err) {
    console.error("[X media upload error]", err instanceof Error ? err.message : err);
    return null;
  }
}

async function postToX(account: PlatformAccount, text: string, mediaUrl?: string | null): Promise<PostResult> {
  try {
    // Prefer OAuth 1.0a app credentials from env vars
    const creds = getAppCredentials();
    const tweetUrl = "https://api.twitter.com/2/tweets";
    const payload: Record<string, unknown> = { text };

    // Upload media if provided and we have OAuth 1.0a creds
    if (mediaUrl && creds) {
      const mediaId = await uploadMediaToX(mediaUrl, creds);
      if (mediaId) {
        payload.media = { media_ids: [mediaId] };
      }
    }

    let authHeader: string;
    if (creds) {
      // OAuth 1.0a — signs the request with consumer + access token
      authHeader = buildOAuth1Header("POST", tweetUrl, creds);
    } else {
      // Fallback to Bearer token from DB/env (OAuth 2.0)
      authHeader = `Bearer ${account.access_token}`;
    }

    const response = await fetch(tweetUrl, {
      method: "POST",
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errBody = await response.text();
      return { success: false, error: `X API ${response.status}: ${errBody}` };
    }

    const data = await response.json() as { data?: { id?: string } };
    const tweetId = data.data?.id;

    return {
      success: true,
      platformPostId: tweetId,
      platformUrl: tweetId ? `https://x.com/${account.account_name}/status/${tweetId}` : undefined,
    };
  } catch (err) {
    return { success: false, error: `X error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ── TikTok Connector ─────────────────────────────────────────────────────
// Free tier: Content Posting API, 15 posts/day per account
// Requires audit for public visibility (unaudited = private only)

async function postToTikTok(account: PlatformAccount, text: string, mediaUrl?: string | null): Promise<PostResult> {
  try {
    if (!mediaUrl) {
      return { success: false, error: "TikTok requires video content" };
    }

    // Step 1: Query creator info
    const creatorResponse = await fetch(
      "https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${account.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      },
    );

    if (!creatorResponse.ok) {
      return { success: false, error: `TikTok creator info failed: ${creatorResponse.status}` };
    }

    // Step 2: Direct post with video URL
    const postResponse = await fetch(
      "https://open.tiktokapis.com/v2/post/publish/video/init/",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${account.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          post_info: {
            title: text.slice(0, 150),
            privacy_level: "PUBLIC_TO_EVERYONE",
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false,
          },
          source_info: {
            source: "PULL_FROM_URL",
            video_url: mediaUrl,
          },
        }),
      },
    );

    if (!postResponse.ok) {
      const errBody = await postResponse.text();
      return { success: false, error: `TikTok post failed: ${postResponse.status} ${errBody}` };
    }

    const postData = await postResponse.json() as { data?: { publish_id?: string } };
    return {
      success: true,
      platformPostId: postData.data?.publish_id,
      platformUrl: account.account_url || undefined,
    };
  } catch (err) {
    return { success: false, error: `TikTok error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ── Instagram Connector ──────────────────────────────────────────────────
// Free API via Meta Graph API
// Two-step: create media container → publish

async function postToInstagram(account: PlatformAccount, text: string, mediaUrl?: string | null): Promise<PostResult> {
  try {
    const config = JSON.parse(account.extra_config || "{}");
    const igUserId = config.instagram_user_id || account.account_id;

    if (!mediaUrl) {
      return { success: false, error: "Instagram requires media content" };
    }

    // Determine media type from URL
    const isVideo = mediaUrl.includes(".mp4") || mediaUrl.includes("video");

    // Step 1: Create media container
    const containerParams: Record<string, string> = {
      caption: text,
      access_token: account.access_token,
    };

    if (isVideo) {
      containerParams.media_type = "REELS";
      containerParams.video_url = mediaUrl;
    } else {
      containerParams.image_url = mediaUrl;
    }

    const containerUrl = new URL(`https://graph.facebook.com/v21.0/${igUserId}/media`);
    Object.entries(containerParams).forEach(([k, v]) => containerUrl.searchParams.set(k, v));

    const containerResponse = await fetch(containerUrl.toString(), { method: "POST" });
    if (!containerResponse.ok) {
      const errBody = await containerResponse.text();
      return { success: false, error: `IG container failed: ${containerResponse.status} ${errBody}` };
    }

    const containerData = await containerResponse.json() as { id?: string };
    const containerId = containerData.id;

    if (!containerId) {
      return { success: false, error: "IG container creation returned no ID" };
    }

    // Step 2: Wait for container to be ready (video processing)
    if (isVideo) {
      await new Promise(resolve => setTimeout(resolve, 10000));
    }

    // Step 3: Publish
    const publishUrl = `https://graph.facebook.com/v21.0/${igUserId}/media_publish?creation_id=${containerId}&access_token=${account.access_token}`;
    const publishResponse = await fetch(publishUrl, { method: "POST" });

    if (!publishResponse.ok) {
      const errBody = await publishResponse.text();
      return { success: false, error: `IG publish failed: ${publishResponse.status} ${errBody}` };
    }

    const publishData = await publishResponse.json() as { id?: string };
    return {
      success: true,
      platformPostId: publishData.id,
      platformUrl: `https://www.instagram.com/p/${publishData.id}/`,
    };
  } catch (err) {
    return { success: false, error: `Instagram error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ── Facebook Connector ───────────────────────────────────────────────────
// Free API: Graph API for Pages
// POST /{page-id}/feed (text), /{page-id}/photos (image), /{page-id}/videos (video)

async function postToFacebook(account: PlatformAccount, text: string, mediaUrl?: string | null): Promise<PostResult> {
  try {
    const pageId = account.account_id;
    let endpoint: string;
    const params: Record<string, string> = {
      access_token: account.access_token,
    };

    if (mediaUrl) {
      const isVideo = mediaUrl.includes(".mp4") || mediaUrl.includes("video");
      if (isVideo) {
        endpoint = `https://graph.facebook.com/v21.0/${pageId}/videos`;
        params.file_url = mediaUrl;
        params.description = text;
      } else {
        endpoint = `https://graph.facebook.com/v21.0/${pageId}/photos`;
        params.url = mediaUrl;
        params.message = text;
      }
    } else {
      endpoint = `https://graph.facebook.com/v21.0/${pageId}/feed`;
      params.message = text;
    }

    const url = new URL(endpoint);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const response = await fetch(url.toString(), { method: "POST" });
    if (!response.ok) {
      const errBody = await response.text();
      return { success: false, error: `FB ${response.status}: ${errBody}` };
    }

    const data = await response.json() as { id?: string; post_id?: string };
    const postId = data.post_id || data.id;
    return {
      success: true,
      platformPostId: postId,
      platformUrl: postId ? `https://www.facebook.com/${postId}` : undefined,
    };
  } catch (err) {
    return { success: false, error: `Facebook error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ── YouTube Connector ────────────────────────────────────────────────────
// Free API: Data API v3, ~6 uploads/day (10K quota, insert costs 1600)
// Requires OAuth 2.0 with youtube.upload scope

async function postToYouTube(account: PlatformAccount, text: string, mediaUrl?: string | null): Promise<PostResult> {
  try {
    if (!mediaUrl) {
      return { success: false, error: "YouTube requires video content" };
    }

    // YouTube requires actual file upload, not URL
    // For URL-based videos, we'd need to download first then upload
    // Using resumable upload protocol

    const title = text.slice(0, 100);
    const description = `${text}\n\n🤖 Generated by AIG!itch — The AI-Only Social Network\n🔗 https://aiglitch.app`;

    // Step 1: Start resumable upload
    const metadataResponse = await fetch(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${account.access_token}`,
          "Content-Type": "application/json",
          "X-Upload-Content-Type": "video/mp4",
        },
        body: JSON.stringify({
          snippet: {
            title,
            description,
            tags: ["AIGlitch", "AI", "ArtificialIntelligence", "AIContent", "AISocialMedia"],
            categoryId: "22", // People & Blogs
          },
          status: {
            privacyStatus: "public",
            selfDeclaredMadeForKids: false,
          },
        }),
      },
    );

    if (!metadataResponse.ok) {
      const errBody = await metadataResponse.text();
      return { success: false, error: `YouTube init failed: ${metadataResponse.status} ${errBody}` };
    }

    const uploadUrl = metadataResponse.headers.get("location");
    if (!uploadUrl) {
      return { success: false, error: "YouTube did not return upload URL" };
    }

    // Step 2: Download video then upload to YouTube
    const videoResponse = await fetch(mediaUrl);
    if (!videoResponse.ok) {
      return { success: false, error: `Failed to fetch video: ${videoResponse.status}` };
    }

    const videoBuffer = await videoResponse.arrayBuffer();

    const uploadResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(videoBuffer.byteLength),
      },
      body: videoBuffer,
    });

    if (!uploadResponse.ok) {
      const errBody = await uploadResponse.text();
      return { success: false, error: `YouTube upload failed: ${uploadResponse.status} ${errBody}` };
    }

    const uploadData = await uploadResponse.json() as { id?: string };
    return {
      success: true,
      platformPostId: uploadData.id,
      platformUrl: uploadData.id ? `https://www.youtube.com/watch?v=${uploadData.id}` : undefined,
    };
  } catch (err) {
    return { success: false, error: `YouTube error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ── Token Verification ──────────────────────────────────────────────────
// Read-only API call to verify the configured token works.

export async function testPlatformToken(
  platform: MarketingPlatform,
): Promise<{ success: boolean; username?: string; error?: string }> {
  const account = await getAccountForPlatform(platform);

  // For X: OAuth 1.0a env vars can work without a DB account
  if (platform === "x") {
    const creds = getAppCredentials();
    if (!creds && !account) {
      return { success: false, error: "No active account in DB and no X_CONSUMER_KEY/X_ACCESS_TOKEN env vars set" };
    }
    try {
      const meUrl = "https://api.twitter.com/2/users/me";
      let authHeader: string;
      if (creds) {
        authHeader = buildOAuth1Header("GET", meUrl, creds);
      } else {
        authHeader = `Bearer ${account!.access_token}`;
      }
      const res = await fetch(meUrl, {
        headers: { Authorization: authHeader },
      });
      if (!res.ok) {
        const body = await res.text();
        return { success: false, error: `X API ${res.status}: ${body.slice(0, 300)}` };
      }
      const data = await res.json() as { data?: { username?: string } };
      return { success: true, username: data.data?.username };
    } catch (err) {
      return { success: false, error: `X fetch error: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  if (!account) {
    return { success: false, error: `No active account for ${platform}` };
  }
  if (!account.access_token) {
    return { success: false, error: `No token configured (DB or env var ${ENV_TOKEN_KEYS[platform]})` };
  }

  switch (platform) {
    default:
      return { success: false, error: `Token test not yet implemented for ${platform}` };
  }
}

// ── Unified Post Dispatcher ──────────────────────────────────────────────

export async function postToPlatform(
  platform: MarketingPlatform,
  account: PlatformAccount,
  text: string,
  mediaUrl?: string | null,
): Promise<PostResult> {
  switch (platform) {
    case "x":         return postToX(account, text, mediaUrl);
    case "tiktok":    return postToTikTok(account, text, mediaUrl);
    case "instagram": return postToInstagram(account, text, mediaUrl);
    case "facebook":  return postToFacebook(account, text, mediaUrl);
    case "youtube":   return postToYouTube(account, text, mediaUrl);
    default:          return { success: false, error: `Unknown platform: ${platform}` };
  }
}
