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
import sharp from "sharp";
import { MarketingPlatform, PlatformAccount } from "./types";
import { buildOAuth1Header, getAppCredentials } from "./oauth1";

const X_IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5MB — X's limit for tweet_image

// ── Environment Variable Token Override ─────────────────────────────────
// Store sensitive API tokens in Vercel env vars instead of the DB.
// Env var takes precedence over the DB value when set.
const ENV_TOKEN_KEYS: Record<string, string> = {
  x: "XAI_API_KEY",
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

// ── Env-var-only platform accounts ──────────────────────────────────────
// Per TheMaster rule: Vercel env vars are the SOLE source of truth for
// social platform credentials. If env vars are set but DB row is missing,
// synthesize the account object from env vars alone.
function getEnvOnlyAccounts(): PlatformAccount[] {
  const accounts: PlatformAccount[] = [];

  // Instagram — needs INSTAGRAM_ACCESS_TOKEN + INSTAGRAM_USER_ID
  const igToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const igUserId = process.env.INSTAGRAM_USER_ID;
  if (igToken && igUserId) {
    accounts.push({
      id: "env-instagram",
      platform: "instagram",
      account_name: "sfrench71",
      account_id: igUserId,
      account_url: "https://www.instagram.com/sfrench71/",
      access_token: igToken,
      refresh_token: "",
      token_expires_at: null,
      extra_config: JSON.stringify({ instagram_user_id: igUserId }),
      is_active: true,
      last_posted_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as PlatformAccount);
  }

  // Facebook — needs FACEBOOK_ACCESS_TOKEN + FACEBOOK_PAGE_ID (or falls back to DB)
  const fbToken = process.env.FACEBOOK_ACCESS_TOKEN;
  const fbPageId = process.env.FACEBOOK_PAGE_ID || "1041648825691964";
  if (fbToken) {
    accounts.push({
      id: "env-facebook",
      platform: "facebook",
      account_name: "AIGlitch",
      account_id: fbPageId,
      account_url: "https://www.facebook.com/AIGlitch",
      access_token: fbToken,
      refresh_token: "",
      token_expires_at: null,
      extra_config: "{}",
      is_active: true,
      last_posted_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as PlatformAccount);
  }

  // TikTok removed — API denied by TikTok developer review (no personal/internal use allowed)

  return accounts;
}

// ── Platform Account Helpers ────────────────────────────────────────────

export async function getActiveAccounts(): Promise<PlatformAccount[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT * FROM marketing_platform_accounts WHERE is_active = TRUE
  ` as unknown as PlatformAccount[];
  const accounts = rows.map(applyEnvTokens);

  // Inject env-var-only accounts for platforms not in DB
  const dbPlatforms = new Set(accounts.map(a => a.platform));
  for (const envAccount of getEnvOnlyAccounts()) {
    if (!dbPlatforms.has(envAccount.platform)) {
      accounts.push(envAccount);
    }
  }

  // Log active accounts for debugging
  console.error(`[getActiveAccounts] ${accounts.length} accounts: ${accounts.map(a => `${a.platform}(${a.id.startsWith("env-") ? "env" : "db"})`).join(", ")}`);

  return accounts;
}

export async function getAccountForPlatform(platform: MarketingPlatform): Promise<PlatformAccount | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT * FROM marketing_platform_accounts WHERE platform = ${platform} AND is_active = TRUE LIMIT 1
  ` as unknown as PlatformAccount[];
  const account = rows[0] || null;
  if (account) return applyEnvTokens(account);

  // Fallback: check env-var-only accounts
  const envAccounts = getEnvOnlyAccounts();
  return envAccounts.find(a => a.platform === platform) || null;
}

/** Like getAccountForPlatform but also returns inactive accounts (for test posts) */
export async function getAnyAccountForPlatform(platform: MarketingPlatform): Promise<PlatformAccount | null> {
  const active = await getAccountForPlatform(platform);
  if (active) return active;
  const sql = getDb();
  const rows = await sql`
    SELECT * FROM marketing_platform_accounts WHERE platform = ${platform} LIMIT 1
  ` as unknown as PlatformAccount[];
  const account = rows[0] || null;
  if (account) return applyEnvTokens(account);

  // Fallback: check env-var-only accounts
  const envAccounts = getEnvOnlyAccounts();
  return envAccounts.find(a => a.platform === platform) || null;
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
async function uploadMediaToX(mediaUrl: string, creds: ReturnType<typeof getAppCredentials>): Promise<{ mediaId: string } | { error: string }> {
  if (!creds) return { error: "No OAuth 1.0a credentials available for media upload" };

  try {
    // Download the media file
    console.log(`[X media upload] Downloading: ${mediaUrl}`);
    const mediaResponse = await fetch(mediaUrl);
    if (!mediaResponse.ok) {
      const msg = `Failed to download media: ${mediaResponse.status} ${mediaResponse.statusText} from ${mediaUrl}`;
      console.error("[X media upload]", msg);
      return { error: msg };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let mediaBuffer: Buffer = Buffer.from(await mediaResponse.arrayBuffer()) as any;
    const contentType = mediaResponse.headers.get("content-type") || "application/octet-stream";
    const isVideo = contentType.startsWith("video/") || /\.(mp4|mov|webm)$/i.test(mediaUrl);

    // Compress images over X's 5MB limit using sharp
    let finalContentType = contentType;
    if (!isVideo && mediaBuffer.byteLength > X_IMAGE_MAX_BYTES) {
      console.log(`[X media upload] Image is ${(mediaBuffer.byteLength / 1024 / 1024).toFixed(1)}MB, compressing...`);
      try {
        // Progressive JPEG compression — try quality 80, then lower if still too big
        let quality = 80;
        let compressed = await sharp(mediaBuffer).jpeg({ quality, progressive: true }).toBuffer();
        while (compressed.byteLength > X_IMAGE_MAX_BYTES && quality > 20) {
          quality -= 15;
          compressed = await sharp(mediaBuffer).jpeg({ quality, progressive: true }).toBuffer();
        }
        if (compressed.byteLength <= X_IMAGE_MAX_BYTES) {
          console.log(`[X media upload] Compressed: ${(mediaBuffer.byteLength / 1024 / 1024).toFixed(1)}MB → ${(compressed.byteLength / 1024 / 1024).toFixed(1)}MB (q=${quality})`);
          mediaBuffer = compressed;
          finalContentType = "image/jpeg";
        } else {
          // Last resort: resize down
          compressed = await sharp(mediaBuffer).resize(1920, 1920, { fit: "inside" }).jpeg({ quality: 70 }).toBuffer();
          console.log(`[X media upload] Resized+compressed: ${(mediaBuffer.byteLength / 1024 / 1024).toFixed(1)}MB → ${(compressed.byteLength / 1024 / 1024).toFixed(1)}MB`);
          mediaBuffer = compressed;
          finalContentType = "image/jpeg";
        }
      } catch (compressErr) {
        console.error("[X media upload] Compression failed:", compressErr);
        return { error: `Image compression failed: ${compressErr instanceof Error ? compressErr.message : String(compressErr)}` };
      }
    }

    const totalBytes = mediaBuffer.byteLength;

    // Determine media_type and media_category for INIT
    const mediaType = isVideo ? "video/mp4" : finalContentType;
    const mediaCategory = isVideo ? "tweet_video" : (finalContentType === "image/gif" ? "tweet_gif" : "tweet_image");

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
      const errText = await initResponse.text();
      console.error("[X media INIT]", initResponse.status, errText);
      return { error: `X media INIT failed: ${initResponse.status} ${errText}` };
    }

    const initData = await initResponse.json() as { media_id_string?: string };
    const mediaId = initData.media_id_string;
    if (!mediaId) {
      console.error("[X media INIT] No media_id_string in response");
      return { error: "X media INIT returned no media_id_string" };
    }

    console.log(`[X media upload] INIT ok: mediaId=${mediaId}, ${totalBytes} bytes, type=${mediaType}, category=${mediaCategory}`);

    // ── APPEND (chunked, 4MB per chunk) ───────────────────────────────
    const chunkSize = 4 * 1024 * 1024; // 4MB
    let segmentIndex = 0;

    for (let offset = 0; offset < totalBytes; offset += chunkSize) {
      const chunk = mediaBuffer.subarray(offset, Math.min(offset + chunkSize, totalBytes));

      // OAuth 1.0a: multipart/form-data body params must NOT be in the signature
      const appendAuth = buildOAuth1Header("POST", uploadUrl, creds);

      // Send as multipart/form-data with binary chunk
      const formData = new FormData();
      formData.append("command", "APPEND");
      formData.append("media_id", mediaId);
      formData.append("segment_index", String(segmentIndex));
      formData.append("media", new Blob([new Uint8Array(chunk)]), "media");

      const appendResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: { Authorization: appendAuth },
        body: formData,
      });

      if (!appendResponse.ok && appendResponse.status !== 204) {
        const errText = await appendResponse.text();
        console.error("[X media APPEND]", appendResponse.status, errText);
        return { error: `X media APPEND failed (segment ${segmentIndex}): ${appendResponse.status} ${errText}` };
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
      const errText = await finalizeResponse.text();
      console.error("[X media FINALIZE]", finalizeResponse.status, errText);
      return { error: `X media FINALIZE failed: ${finalizeResponse.status} ${errText}` };
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
          const errMsg = processingInfo.error?.message || "unknown processing error";
          console.error("[X media STATUS] Processing failed:", errMsg);
          return { error: `X media processing failed: ${errMsg}` };
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
          const errText = await statusResponse.text();
          console.error("[X media STATUS]", statusResponse.status, errText);
          return { error: `X media STATUS poll failed: ${statusResponse.status} ${errText}` };
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
        return { error: "X media processing timed out after 30 attempts" };
      }
    }

    console.log(`[X media upload] Success: ${mediaId} (${isVideo ? "video" : "image"}, ${totalBytes} bytes)`);
    return { mediaId };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[X media upload error]", errMsg);
    return { error: `X media upload exception: ${errMsg}` };
  }
}

async function postToX(account: PlatformAccount, text: string, mediaUrl?: string | null): Promise<PostResult> {
  try {
    // Prefer OAuth 1.0a app credentials from env vars
    const creds = getAppCredentials();
    const tweetUrl = "https://api.twitter.com/2/tweets";
    const payload: Record<string, unknown> = { text };

    // Upload media if provided — requires OAuth 1.0a creds for the upload API
    if (mediaUrl) {
      if (!creds) {
        console.error("[X post] Cannot upload media: OAuth 1.0a credentials (X_CONSUMER_KEY, X_CONSUMER_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET) not configured");
        return { success: false, error: "X media upload requires OAuth 1.0a credentials (X_CONSUMER_KEY etc.) which are not configured" };
      }
      console.log(`[X post] Uploading media: ${mediaUrl}`);
      const uploadResult = await uploadMediaToX(mediaUrl, creds);
      if ("mediaId" in uploadResult) {
        console.log(`[X post] Media attached: ${uploadResult.mediaId}`);
        payload.media = { media_ids: [uploadResult.mediaId] };
      } else {
        console.error(`[X post] Media upload failed: ${uploadResult.error}`);
        return { success: false, error: `Media upload failed: ${uploadResult.error}` };
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

// ── TikTok — REMOVED (April 2026) ───────────────────────────────────────
// TikTok developer review denied: "does not support personal or internal use"
// All TikTok posting code removed. Consider Buffer.com API as alternative.

// ── Instagram Connector ──────────────────────────────────────────────────
// Free API via Meta Graph API
// Two-step: create media container → publish

async function postToInstagram(account: PlatformAccount, text: string, mediaUrl?: string | null): Promise<PostResult> {
  try {
    // Env var is sole source of truth for Instagram User ID (per TheMaster rule)
    const config = JSON.parse(account.extra_config || "{}");
    const igUserId = process.env.INSTAGRAM_USER_ID || config.instagram_user_id || account.account_id;

    console.log(`[instagram] === POSTING START === igUserId=${igUserId}, mediaUrl=${mediaUrl?.slice(0, 100)}, text=${text.slice(0, 50)}`);

    if (!mediaUrl) {
      console.error(`[instagram] REJECTED: no media URL`);
      return { success: false, error: "Instagram requires media content" };
    }

    // Determine media type from URL
    const isVideo = mediaUrl.includes(".mp4") || mediaUrl.includes("video");

    // For images: convert to JPEG and re-upload to Blob so Instagram gets a clean direct URL
    // Instagram can't fetch from Vercel Blob CDN or our proxy reliably
    let igMediaUrl = mediaUrl;
    if (!isVideo) {
      try {
        const { put } = await import("@vercel/blob");
        const sharp = (await import("sharp")).default;
        const { v4: uuidv4 } = await import("uuid");

        console.log(`[instagram] Converting image to JPEG for Instagram: ${mediaUrl.slice(0, 100)}`);
        const imgRes = await fetch(mediaUrl, { signal: AbortSignal.timeout(15000) });
        if (!imgRes.ok) {
          return { success: false, error: `Image fetch failed: HTTP ${imgRes.status} for ${mediaUrl}` };
        }
        const inputBuffer = Buffer.from(await imgRes.arrayBuffer());
        const jpegBuffer = await sharp(inputBuffer)
          .resize(1080, 1080, { fit: "cover", position: "centre" })
          .jpeg({ quality: 90 })
          .toBuffer();

        const blob = await put(`instagram/${uuidv4()}.jpg`, jpegBuffer, {
          access: "public",
          contentType: "image/jpeg",
          addRandomSuffix: false,
        });
        igMediaUrl = blob.url;
        console.log(`[instagram] Converted & uploaded JPEG: ${igMediaUrl}`);
      } catch (convertErr) {
        console.error(`[instagram] JPEG conversion failed, falling back to proxy: ${convertErr instanceof Error ? convertErr.message : convertErr}`);
        // Fallback to proxy approach
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://aiglitch.app";
        if (!mediaUrl.startsWith(appUrl)) {
          igMediaUrl = `${appUrl}/api/image-proxy?url=${encodeURIComponent(mediaUrl)}`;
        }
      }
    } else {
      // Videos: proxy through our domain
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://aiglitch.app";
      if (!mediaUrl.startsWith(appUrl)) {
        igMediaUrl = `${appUrl}/api/video-proxy?url=${encodeURIComponent(mediaUrl)}`;
        console.log(`[instagram] Proxying video through: ${igMediaUrl}`);
      }
    }

    console.log(`[instagram] Sending to Graph API: igUserId=${igUserId}, igMediaUrl=${igMediaUrl.slice(0, 150)}, isVideo=${isVideo}`);

    // Step 1: Create media container
    const containerParams: Record<string, string> = {
      caption: text,
      access_token: account.access_token,
    };

    if (isVideo) {
      containerParams.media_type = "REELS";
      containerParams.video_url = igMediaUrl;
    } else {
      containerParams.image_url = igMediaUrl;
    }

    // Use POST body (not query params) to avoid URL-encoding issues with image URLs
    const sentUrl = isVideo ? mediaUrl : igMediaUrl;
    console.log(`[instagram] Creating container with ${isVideo ? "video_url" : "image_url"}: ${sentUrl}`);
    const containerResponse = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(containerParams),
    });
    if (!containerResponse.ok) {
      const errBody = await containerResponse.text();
      return { success: false, error: `IG container failed: ${containerResponse.status} ${errBody} | sent_url: ${sentUrl} | original: ${mediaUrl}` };
    }

    const containerData = await containerResponse.json() as { id?: string };
    const containerId = containerData.id;

    if (!containerId) {
      return { success: false, error: "IG container creation returned no ID" };
    }

    // Step 2: Wait for container to be ready (poll status for videos, brief wait for images)
    if (isVideo) {
      // Poll container status — videos need processing time
      const maxWait = 60000; // 60 seconds max
      const pollInterval = 5000; // check every 5 seconds
      const start = Date.now();
      let ready = false;

      while (Date.now() - start < maxWait) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        try {
          const statusRes = await fetch(
            `https://graph.facebook.com/v21.0/${containerId}?fields=status_code&access_token=${account.access_token}`
          );
          if (statusRes.ok) {
            const statusData = await statusRes.json() as { status_code?: string };
            console.log(`[instagram] Container ${containerId} status: ${statusData.status_code}`);
            if (statusData.status_code === "FINISHED") {
              ready = true;
              break;
            }
            if (statusData.status_code === "ERROR") {
              return { success: false, error: "IG video processing failed (status: ERROR)" };
            }
          }
        } catch {
          // Keep polling on fetch errors
        }
      }

      if (!ready) {
        return { success: false, error: `IG video processing timed out after ${maxWait / 1000}s` };
      }
    } else {
      // Images are usually ready instantly, but give it a moment
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Step 3: Publish
    const publishUrl = `https://graph.facebook.com/v21.0/${igUserId}/media_publish?creation_id=${containerId}&access_token=${account.access_token}`;
    const publishResponse = await fetch(publishUrl, { method: "POST" });

    if (!publishResponse.ok) {
      const errBody = await publishResponse.text();
      return { success: false, error: `IG publish failed: ${publishResponse.status} ${errBody}` };
    }

    const publishData = await publishResponse.json() as { id?: string };
    console.log(`[instagram] === SUCCESS === Published! ID: ${publishData.id}`);
    return {
      success: true,
      platformPostId: publishData.id,
      platformUrl: `https://www.instagram.com/p/${publishData.id}/`,
    };
  } catch (err) {
    console.error(`[instagram] === EXCEPTION === ${err instanceof Error ? err.message : String(err)}`);
    return { success: false, error: `Instagram error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ── Facebook Connector ───────────────────────────────────────────────────
// Free API: Graph API for Pages
// POST /{page-id}/feed (text), /{page-id}/photos (image), /{page-id}/videos (video)

async function postToFacebook(account: PlatformAccount, text: string, mediaUrl?: string | null): Promise<PostResult> {
  try {
    const pageId = account.account_id;
    if (!pageId) {
      return { success: false, error: "Facebook page ID (account_id) not configured" };
    }
    if (!account.access_token) {
      return { success: false, error: "Facebook access token not configured (set FACEBOOK_ACCESS_TOKEN env var or add to DB)" };
    }
    let endpoint: string;
    const params: Record<string, string> = {
      access_token: account.access_token,
    };

    if (mediaUrl) {
      const isVideo = mediaUrl.includes(".mp4") || mediaUrl.includes("video");
      if (isVideo) {
        // Pass Blob URL directly via file_url — Facebook can fetch from Vercel Blob for videos
        endpoint = `https://graph.facebook.com/v21.0/${pageId}/videos`;
        console.error(`[facebook] >>> VIDEO POST START: file_url=${mediaUrl.slice(0, 100)}, pageId=${pageId}, hasToken=${!!account.access_token}`);

        try {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              access_token: account.access_token,
              file_url: mediaUrl,
              description: text,
            }),
            signal: AbortSignal.timeout(60000), // 60s timeout
          });

          console.error(`[facebook] >>> VIDEO RESPONSE: status=${response.status}`);

          if (!response.ok) {
            const errBody = await response.text();
            console.error(`[facebook] >>> VIDEO FAILED: ${response.status} ${errBody.slice(0, 500)}`);
            return { success: false, error: `FB ${response.status}: ${errBody}` };
          }
          const data = await response.json() as { id?: string; post_id?: string };
          const fbPostId = data.post_id || data.id;
          console.error(`[facebook] >>> VIDEO SUCCESS: id=${fbPostId}`);
          return { success: true, platformPostId: fbPostId, platformUrl: fbPostId ? `https://www.facebook.com/${pageId}/videos/${fbPostId.replace(`${pageId}_`, "")}` : undefined };
        } catch (fbErr) {
          console.error(`[facebook] >>> VIDEO EXCEPTION: ${fbErr instanceof Error ? fbErr.message : String(fbErr)}`);
          return { success: false, error: `FB video error: ${fbErr instanceof Error ? fbErr.message : String(fbErr)}` };
        }
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
    const newToken = data.access_token || null;

    // Persist the refreshed token back to the DB so future cycles don't start with an expired one
    if (newToken) {
      try {
        const sql = getDb();
        await sql`
          UPDATE marketing_platform_accounts
          SET access_token = ${newToken}, updated_at = NOW()
          WHERE platform = 'youtube' AND is_active = TRUE
        `;
      } catch (dbErr) {
        console.error("[YouTube token refresh] Failed to persist token to DB:", dbErr instanceof Error ? dbErr.message : dbErr);
      }
    }

    return newToken;
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

    // Proactively refresh the token instead of waiting for a 401.
    // The DB/env token is almost always expired (access tokens last ~1 hour).
    let accessToken = process.env.YOUTUBE_ACCESS_TOKEN;
    if (!accessToken) {
      const refreshed = await refreshYouTubeToken();
      accessToken = refreshed || account.access_token;
    }

    if (!accessToken) {
      return { success: false, error: "YouTube: no access token available (env, refresh, or DB)" };
    }

    // Step 1: Download video first so we know the actual content type
    const videoResponse = await fetch(mediaUrl);
    if (!videoResponse.ok) {
      return { success: false, error: `Failed to fetch video: ${videoResponse.status}` };
    }

    const videoBuffer = await videoResponse.arrayBuffer();
    // Detect content type from the response, fall back to mp4
    const videoContentType = videoResponse.headers.get("content-type") || "video/mp4";

    const title = text.slice(0, 100);
    const description = `${text}\n\n🤖 Generated by AIG!itch — The AI-Only Social Network\n🔗 https://aiglitch.app`;

    const uploadMetadata = JSON.stringify({
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
    });

    // Step 2: Start resumable upload with the actual content type
    let metadataResponse = await fetch(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Upload-Content-Type": videoContentType,
          "X-Upload-Content-Length": String(videoBuffer.byteLength),
        },
        body: uploadMetadata,
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
              "X-Upload-Content-Type": videoContentType,
              "X-Upload-Content-Length": String(videoBuffer.byteLength),
            },
            body: uploadMetadata,
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

    // Step 3: Upload the video bytes
    const uploadResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": videoContentType,
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
  const startTime = Date.now();
  console.log(`[postToPlatform] >>> ${platform} start (media=${mediaUrl?.slice(0, 60) || "none"})`);
  try {
    let result: PostResult;
    switch (platform) {
      case "x":         result = await postToX(account, text, mediaUrl); break;
      case "instagram": result = await postToInstagram(account, text, mediaUrl); break;
      case "facebook":  result = await postToFacebook(account, text, mediaUrl); break;
      case "youtube":   result = await postToYouTube(account, text, mediaUrl); break;
      default:          result = { success: false, error: `Unknown platform: ${platform}` };
    }
    const duration = Date.now() - startTime;
    console.log(`[postToPlatform] <<< ${platform} ${result.success ? "OK" : "FAIL"} (${duration}ms) ${result.error || result.platformPostId || ""}`);
    return result;
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(`[postToPlatform] <<< ${platform} EXCEPTION (${duration}ms): ${err instanceof Error ? err.message : err}`);
    return { success: false, error: `${platform} crashed: ${err instanceof Error ? err.message : String(err)}` };
  }
}
