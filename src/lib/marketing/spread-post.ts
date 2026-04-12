/**
 * Spread a specific post to all active social media platforms.
 * Reusable from any route — media uploads, director movies, etc.
 */

import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { getActiveAccounts, postToPlatform } from "./platforms";
import { adaptContentForPlatform } from "./content-adapter";
import { MarketingPlatform } from "./types";
import { sendTelegramMessage, rewriteMentionsForTelegram } from "@/lib/telegram";

/**
 * Pick a fallback media URL when a post has no media of its own.
 * Picks a random recent image/video from the posts table so every
 * social media post gets a unique, relevant thumbnail instead of the
 * generic OG card.
 */
export async function pickFallbackMedia(preferVideo = false): Promise<string | null> {
  const sql = getDb();
  try {
    if (preferVideo) {
      const rows = await sql`
        SELECT media_url FROM posts
        WHERE media_url IS NOT NULL AND media_url != ''
          AND media_type LIKE 'video%'
          AND created_at > NOW() - INTERVAL '7 days'
        ORDER BY RANDOM() LIMIT 1
      `;
      if (rows.length > 0) return rows[0].media_url as string;
    }
    // Pick a random recent image
    const rows = await sql`
      SELECT media_url FROM posts
      WHERE media_url IS NOT NULL AND media_url != ''
        AND (media_type LIKE 'image%' OR media_type = 'meme')
        AND created_at > NOW() - INTERVAL '7 days'
      ORDER BY RANDOM() LIMIT 1
    `;
    if (rows.length > 0) return rows[0].media_url as string;

    // Broader fallback — any media from last 30 days
    const broader = await sql`
      SELECT media_url FROM posts
      WHERE media_url IS NOT NULL AND media_url != ''
        AND (media_type LIKE 'image%' OR media_type = 'meme')
      ORDER BY RANDOM() LIMIT 1
    `;
    return broader.length > 0 ? broader[0].media_url as string : null;
  } catch {
    return null;
  }
}

export async function spreadPostToSocial(
  postId: string,
  personaId: string,
  personaName: string,
  personaEmoji: string,
  knownMedia?: { url: string; type: string },
  telegramLabel?: string,
): Promise<{ platforms: string[]; failed: string[] }> {
  const sql = getDb();
  const platforms: string[] = [];
  const failed: string[] = [];

  // Get the post content (needed for both social platforms and Telegram)
  // If knownMedia is provided, use it directly to avoid read-after-write race condition
  // with Neon Postgres replication lag (media_url can be NULL if read too soon after INSERT)
  let postData: { content: string; media_url: string; media_type: string } | null = null;
  try {
    const posts = await sql`
      SELECT content, media_url, media_type FROM posts WHERE id = ${postId}
    ` as unknown as { content: string; media_url: string; media_type: string }[];
    if (posts.length > 0) {
      postData = posts[0];
      // Override with known media if DB returned NULL (replication lag fix)
      if (knownMedia && (!postData.media_url || postData.media_url === "")) {
        console.error(`[spread-post] DB returned null media_url for ${postId}, using known media: ${knownMedia.url.slice(0, 80)}...`);
        postData.media_url = knownMedia.url;
        postData.media_type = knownMedia.type.startsWith("video") ? "video" : "image";
        // Also fix the DB record so the post isn't broken
        await sql`UPDATE posts SET media_url = ${knownMedia.url}, media_type = ${knownMedia.type} WHERE id = ${postId} AND (media_url IS NULL OR media_url = '')`;
      }
    }
  } catch (err) {
    console.error("[spread-post] Failed to fetch post:", err);
  }

  // Post to social media platforms (X, Facebook, TikTok, YouTube, Instagram)
  if (postData) {
    try {
      console.error(`[spread-post] === START === postId=${postId}, media_type="${postData.media_type}", media_url=${postData.media_url?.slice(0, 80)}`);
      const accounts = await getActiveAccounts();
      const isVideo = postData.media_type === "video" || postData.media_type?.startsWith("video/") || postData.media_url?.includes(".mp4");
      console.error(`[spread-post] accounts=${accounts.length} (${accounts.map(a => a.platform).join(",")}), isVideo=${isVideo}`);

      // If post has no media, pick a fallback image so we don't show the generic OG card
      let mediaUrlToSpread = postData.media_url;
      if (!mediaUrlToSpread) {
        mediaUrlToSpread = await pickFallbackMedia() || "";
        if (mediaUrlToSpread) {
          console.error(`[spread-post] No media on post ${postId}, using fallback: ${mediaUrlToSpread}`);
        }
      }

      console.error(`[spread-post] Spreading ${postId}: isVideo=${isVideo}, media=${mediaUrlToSpread?.slice(0, 60)}, accounts=${accounts.length}`);

      // Post to ALL platforms in PARALLEL to avoid timeout
      const platformPromises = accounts
        .filter(account => {
          const platform = account.platform as MarketingPlatform;
          if (platform === "youtube" && !isVideo) {
            console.error(`[spread-post] SKIP ${platform}: not video (media_type=${postData.media_type})`);
            return false;
          }
          if (platform === "instagram" && !mediaUrlToSpread) return false;
          return true;
        })
        .map(async (account) => {
          const platform = account.platform as MarketingPlatform;
          console.error(`[spread-post] ATTEMPTING ${platform}...`);

          try {
            const adapted = await adaptContentForPlatform(
              postData!.content || "",
              personaName,
              personaEmoji,
              platform,
              mediaUrlToSpread,
            );

            const marketingPostId = uuidv4();
            await sql`
              INSERT INTO marketing_posts (id, platform, source_post_id, persona_id, adapted_content, adapted_media_url, status, created_at)
              VALUES (${marketingPostId}, ${platform}, ${postId}, ${personaId}, ${adapted.text}, ${mediaUrlToSpread}, 'posting', NOW())
            `;

            const result = await postToPlatform(platform, account, adapted.text, mediaUrlToSpread);

            if (result.success) {
              await sql`
                UPDATE marketing_posts
                SET status = 'posted', platform_post_id = ${result.platformPostId || null}, platform_url = ${result.platformUrl || null}, posted_at = NOW()
                WHERE id = ${marketingPostId}
              `;
              platforms.push(platform);
              console.error(`[spread-post] ${platform} OK: ${result.platformPostId || "no id"}`);
            } else {
              await sql`
                UPDATE marketing_posts
                SET status = 'failed', error_message = ${result.error || 'Unknown error'}
                WHERE id = ${marketingPostId}
              `;
              failed.push(platform);
              console.error(`[spread-post] ${platform} FAILED: ${result.error}`);
            }
          } catch (err) {
            failed.push(platform);
            console.error(`[spread-post] ${platform} ERROR: ${err instanceof Error ? err.message : err}`);
          }
        });

      await Promise.allSettled(platformPromises);
    } catch (err) {
      console.error("[spread-post] Error spreading to social platforms:", err);
    }
  }

  // Always push to Telegram channel — even if no social accounts are configured
  if (postData) {
    try {
      // Only show successful platforms — failures are still logged to the
      // server console for debugging, but the AIG!itch group notification
      // shouldn't look broken because tiktok/instagram rejected a payload.
      const socialList = platforms.length > 0 ? platforms.join(", ") : "none";
      if (failed.length > 0) {
        console.warn(`[spread-post] Failed platforms (hidden from Telegram): ${failed.join(", ")}`);
      }

      // Rewrite @persona_username mentions to @bot_username so they become
      // clickable links to the actual Telegram bot (e.g. @gigabrain_9000 →
      // @gigabrain_9000_bot). Personas without a bot keep their @mention as-is.
      const tgContent = await rewriteMentionsForTelegram(postData.content || "");

      const label = telegramLabel || "AD POSTED";
      const isMovie = label === "MOVIE POSTED";

      // For movie posts: just show title + link, NOT the full synopsis/director/actors
      let tgMessage = `📢 <b>${label}</b>\n`;
      tgMessage += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
      if (isMovie) {
        // Extract just the first line (movie title) from content
        const titleLine = tgContent.split("\n").find(l => l.trim()) || "New Movie";
        tgMessage += `${titleLine}\n\n`;
      } else {
        tgMessage += `${personaEmoji} <b>${personaName}</b>\n\n`;
        tgMessage += `${tgContent}\n\n`;
      }
      if (postData.media_url) {
        tgMessage += `🎬 <a href="${postData.media_url}">View ${postData.media_type === "video" ? "Video" : "Media"}</a>\n\n`;
      }
      tgMessage += `📡 Platforms: ${socialList}`;

      await sendTelegramMessage(tgMessage);
      platforms.push("telegram");
      console.error(`[spread-post] ${label} pushed to Telegram channel`);
    } catch (err) {
      console.error("[spread-post] Telegram push failed (non-fatal):", err);
    }
  }

  return { platforms, failed };
}
