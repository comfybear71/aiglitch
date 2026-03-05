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

/**
 * Upload media to X using the chunked upload flow (INIT → APPEND → FINALIZE → STATUS).
 * Works for both images and videos. Videos require async processing — we poll STATUS
 * until processing completes before returning the media_id.
 *
 * API: POST https://upload.twitter.com/1.1/media/upload.json (OAuth 1.0a only)
 * Chunk size: 4MB per APPEND call.
 */
async function uploadMediaToX(mediaUrl: string, creds: ReturnType<typeof getAppCredentials>): Promise<string | null> {
  if (!creds) return null;

  try {
    // Download the media file
    const mediaResponse = await fetch(mediaUrl);
    if (!mediaResponse.ok) {
      console.error("[X media upload] Failed to download media:", mediaResponse.status);
      return null;
    }

    const mediaBuffer = Buffer.from(await mediaResponse.arrayBuffer());
    const totalBytes = mediaBuffer.byteLength;
    const contentType = mediaResponse.headers.get("content-type") || "application/octet-stream";
    const isVideo = contentType.startsWith("video/") || /\.(mp4|mov|webm)$/i.test(mediaUrl);

    // Determine media_type and media_category for INIT
    const mediaType = isVideo ? "video/mp4" : contentType;
    const mediaCategory = isVideo ? "tweet_video" : (contentType === "image/gif" ? "tweet_gif" : "tweet_image");

    const uploadUrl = "https://upload.twitter.com/1.1/media/upload.json";

    // ── INIT ──────────────────────────────────────────────────────────
    const initParams: Record<string, string> = {
      command: "INIT",
      total_bytes: String(totalBytes),
      media_type: mediaType,
      media_category: mediaCategory,
    };

    const initAuth = buildOAuth1Header("POST", uploadUrl, creds, initParams);
    const initBody = new URLSearchParams(initParams);

    const initResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: initAuth,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: initBody.toString(),
    });

    if (!initResponse.ok) {
      console.error("[X media INIT]", initResponse.status, await initResponse.text());
      return null;
    }

    const initData = await initResponse.json() as { media_id_string?: string };
    const mediaId = initData.media_id_string;
    if (!mediaId) {
      console.error("[X media INIT] No media_id_string in response");
      return null;
    }

    // ── APPEND (chunked, 4MB per chunk) ───────────────────────────────
    const chunkSize = 4 * 1024 * 1024; // 4MB
    let segmentIndex = 0;

    for (let offset = 0; offset < totalBytes; offset += chunkSize) {
      const chunk = mediaBuffer.subarray(offset, Math.min(offset + chunkSize, totalBytes));

      // Build OAuth header for APPEND — only command, media_id, segment_index go into signature
      const appendParams: Record<string, string> = {
        command: "APPEND",
        media_id: mediaId,
        segment_index: String(segmentIndex),
      };
      const appendAuth = buildOAuth1Header("POST", uploadUrl, creds, appendParams);

      // Send as multipart/form-data with binary chunk
      const formData = new FormData();
      formData.append("command", "APPEND");
      formData.append("media_id", mediaId);
      formData.append("segment_index", String(segmentIndex));
      formData.append("media", new Blob([chunk]), "media");

      const appendResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: { Authorization: appendAuth },
        body: formData,
      });

      if (!appendResponse.ok && appendResponse.status !== 204) {
        console.error("[X media APPEND]", appendResponse.status, await appendResponse.text());
        return null;
      }

      segmentIndex++;
    }

    // ── FINALIZE ──────────────────────────────────────────────────────
    const finalizeParams: Record<string, string> = {
      command: "FINALIZE",
      media_id: mediaId,
    };

    const finalizeAuth = buildOAuth1Header("POST", uploadUrl, creds, finalizeParams);
    const finalizeBody = new URLSearchParams(finalizeParams);

    const finalizeResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: finalizeAuth,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: finalizeBody.toString(),
    });

    if (!finalizeResponse.ok) {
      console.error("[X media FINALIZE]", finalizeResponse.status, await finalizeResponse.text());
      return null;
    }

    const finalizeData = await finalizeResponse.json() as {
      media_id_string?: string;
      processing_info?: { state: string; check_after_secs?: number; error?: { message: string } };
    };

    // ── STATUS polling (for videos and async-processed media) ─────────
    if (finalizeData.processing_info) {
      let processingInfo = finalizeData.processing_info;
      const maxAttempts = 30; // Max ~5 minutes of polling
      let attempts = 0;

      while (processingInfo.state !== "succeeded" && attempts < maxAttempts) {
        if (processingInfo.state === "failed") {
          console.error("[X media STATUS] Processing failed:", processingInfo.error?.message);
          return null;
        }

        const waitSecs = processingInfo.check_after_secs || 5;
        await new Promise(resolve => setTimeout(resolve, waitSecs * 1000));

        const statusParams: Record<string, string> = {
          command: "STATUS",
          media_id: mediaId,
        };
        const statusAuth = buildOAuth1Header("GET", uploadUrl, creds, statusParams);
        const statusUrl = `${uploadUrl}?command=STATUS&media_id=${mediaId}`;

        const statusResponse = await fetch(statusUrl, {
          method: "GET",
          headers: { Authorization: statusAuth },
        });

        if (!statusResponse.ok) {
          console.error("[X media STATUS]", statusResponse.status, await statusResponse.text());
          return null;
        }

        const statusData = await statusResponse.json() as {
          processing_info?: { state: string; check_after_secs?: number; error?: { message: string } };
        };

        if (!statusData.processing_info) break; // No processing info means done
        processingInfo = statusData.processing_info;
        attempts++;
      }

      if (processingInfo.state !== "succeeded" && attempts >= maxAttempts) {
        console.error("[X media STATUS] Timed out waiting for processing");
        return null;
      }
    }

    console.log(`[X media upload] Success: ${mediaId} (${isVideo ? "video" : "image"}, ${totalBytes} bytes)`);
    return mediaId;
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
      console.log(`[X post] Uploading media: ${mediaUrl}`);
      const mediaId = await uploadMediaToX(mediaUrl, creds);
      if (mediaId) {
        console.log(`[X post] Media attached: ${mediaId}`);
        payload.media = { media_ids: [mediaId] };
      } else {
        console.warn(`[X post] Media upload failed for ${mediaUrl} — posting text-only`);
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

    // Build the correct Facebook URL based on content type
    let platformUrl: string | undefined;
    if (postId) {
      if (mediaUrl) {
        const isVideo = mediaUrl.includes(".mp4") || mediaUrl.includes("video");
        if (isVideo) {
          platformUrl = `https://www.facebook.com/${pageId}/videos/${postId.replace(`${pageId}_`, "")}`;
        } else {
          platformUrl = `https://www.facebook.com/photo/?fbid=${postId.replace(`${pageId}_`, "")}`;
        }
      } else if (postId.includes("_")) {
        const [pgId, pId] = postId.split("_");
        platformUrl = `https://www.facebook.com/${pgId}/posts/${pId}`;
      } else {
        platformUrl = `https://www.facebook.com/${pageId}/posts/${postId}`;
      }
    }

    return {
      success: true,
      platformPostId: postId,
      platformUrl,
    };
  } catch (err) {
    return { success: false, error: `Facebook error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ── YouTube Token Refresh ────────────────────────────────────────────────
// Uses YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET (marketing keys, separate
// from GOOGLE_CLIENT_ID/SECRET used for user login)

async function refreshYouTubeToken(): Promise<string | null> {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  let refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;

  // Fall back to refresh token stored in DB by the OAuth callback
  if (!refreshToken) {
    try {
      const sql = getDb();
      const rows = await sql`
        SELECT extra_config FROM marketing_platform_accounts WHERE platform = 'youtube' AND is_active = TRUE LIMIT 1
      `;
      if (rows[0]?.extra_config) {
        const config = JSON.parse(rows[0].extra_config as string);
        refreshToken = config.refresh_token;
      }
    } catch { /* ignore */ }
  }

  if (!clientId || !clientSecret || !refreshToken) return null;

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!res.ok) {
      console.error("[YouTube token refresh]", res.status, await res.text());
      return null;
    }

    const data = await res.json() as { access_token?: string };
    return data.access_token || null;
  } catch (err) {
    console.error("[YouTube token refresh error]", err instanceof Error ? err.message : err);
    return null;
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

    // Get access token: env var > refresh token > DB account
    let accessToken = process.env.YOUTUBE_ACCESS_TOKEN || account.access_token;

    const title = text.slice(0, 100);
    const description = `${text}\n\n🤖 Generated by AIG!itch — The AI-Only Social Network\n🔗 https://aiglitch.app`;

    // Step 1: Start resumable upload
    let metadataResponse = await fetch(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
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

    // If 401, try refreshing the token and retry once
    if (metadataResponse.status === 401) {
      const refreshed = await refreshYouTubeToken();
      if (refreshed) {
        accessToken = refreshed;
        metadataResponse = await fetch(
          "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "Content-Type": "application/json",
              "X-Upload-Content-Type": "video/mp4",
            },
            body: JSON.stringify({
              snippet: {
                title,
                description,
                tags: ["AIGlitch", "AI", "ArtificialIntelligence", "AIContent", "AISocialMedia"],
                categoryId: "22",
              },
              status: {
                privacyStatus: "public",
                selfDeclaredMadeForKids: false,
              },
            }),
          },
        );
      }
    }

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
