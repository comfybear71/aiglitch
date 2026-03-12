/**
 * Spread a specific post to all active social media platforms.
 * Reusable from any route — media uploads, director movies, etc.
 */

import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { getActiveAccounts, postToPlatform } from "./platforms";
import { adaptContentForPlatform } from "./content-adapter";
import { MarketingPlatform } from "./types";
import { sendTelegramMessage } from "@/lib/telegram";

export async function spreadPostToSocial(
  postId: string,
  personaId: string,
  personaName: string,
  personaEmoji: string,
): Promise<{ platforms: string[]; failed: string[] }> {
  const sql = getDb();
  const platforms: string[] = [];
  const failed: string[] = [];

  // Get the post content (needed for both social platforms and Telegram)
  let postData: { content: string; media_url: string; media_type: string } | null = null;
  try {
    const posts = await sql`
      SELECT content, media_url, media_type FROM posts WHERE id = ${postId}
    ` as unknown as { content: string; media_url: string; media_type: string }[];
    if (posts.length > 0) postData = posts[0];
  } catch (err) {
    console.error("[spread-post] Failed to fetch post:", err);
  }

  // Post to social media platforms (X, Facebook, TikTok, YouTube, Instagram)
  if (postData) {
    try {
      const accounts = await getActiveAccounts();
      const isVideo = postData.media_type === "video";

      for (const account of accounts) {
        const platform = account.platform as MarketingPlatform;

        // Platform compatibility: YouTube/TikTok = video only
        if ((platform === "youtube" || platform === "tiktok") && !isVideo) continue;

        try {
          const adapted = await adaptContentForPlatform(
            postData.content || "",
            personaName,
            personaEmoji,
            platform,
            postData.media_url,
          );

          const marketingPostId = uuidv4();
          await sql`
            INSERT INTO marketing_posts (id, platform, source_post_id, persona_id, adapted_content, adapted_media_url, status, created_at)
            VALUES (${marketingPostId}, ${platform}, ${postId}, ${personaId}, ${adapted.text}, ${postData.media_url}, 'posting', NOW())
          `;

          const result = await postToPlatform(platform, account, adapted.text, postData.media_url);

          if (result.success) {
            await sql`
              UPDATE marketing_posts
              SET status = 'posted', platform_post_id = ${result.platformPostId || null}, platform_url = ${result.platformUrl || null}, posted_at = NOW()
              WHERE id = ${marketingPostId}
            `;
            platforms.push(platform);
          } else {
            await sql`
              UPDATE marketing_posts
              SET status = 'failed', error_message = ${result.error || 'Unknown error'}
              WHERE id = ${marketingPostId}
            `;
            failed.push(platform);
          }
        } catch {
          failed.push(platform);
        }
      }
    } catch (err) {
      console.error("[spread-post] Error spreading to social platforms:", err);
    }
  }

  // Always push to Telegram channel — even if no social accounts are configured
  if (postData) {
    try {
      const socialList = platforms.length > 0 ? platforms.join(", ") : "none";
      const failedList = failed.length > 0 ? ` | Failed: ${failed.join(", ")}` : "";

      let tgMessage = `📢 <b>AD POSTED</b>\n`;
      tgMessage += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
      tgMessage += `${personaEmoji} <b>${personaName}</b>\n\n`;
      tgMessage += `${postData.content}\n\n`;
      if (postData.media_url) {
        tgMessage += `🎬 <a href="${postData.media_url}">View ${postData.media_type === "video" ? "Video" : "Media"}</a>\n\n`;
      }
      tgMessage += `📡 Platforms: ${socialList}${failedList}`;

      await sendTelegramMessage(tgMessage);
      platforms.push("telegram");
      console.log(`[spread-post] Ad pushed to Telegram channel`);
    } catch (err) {
      console.error("[spread-post] Telegram push failed (non-fatal):", err);
    }
  }

  return { platforms, failed };
}
