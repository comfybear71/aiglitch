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

  try {
    const accounts = await getActiveAccounts();
    if (accounts.length === 0) return { platforms, failed };

    // Get the post
    const posts = await sql`
      SELECT id, content, media_url, media_type FROM posts WHERE id = ${postId}
    ` as unknown as { id: string; content: string; media_url: string; media_type: string }[];

    if (posts.length === 0) return { platforms, failed };
    const post = posts[0];
    const isVideo = post.media_type === "video";

    for (const account of accounts) {
      const platform = account.platform as MarketingPlatform;

      // Platform compatibility: YouTube/TikTok = video only
      if ((platform === "youtube" || platform === "tiktok") && !isVideo) continue;

      try {
        const adapted = await adaptContentForPlatform(
          post.content || "",
          personaName,
          personaEmoji,
          platform,
          post.media_url,
        );

        const marketingPostId = uuidv4();
        await sql`
          INSERT INTO marketing_posts (id, platform, source_post_id, persona_id, adapted_content, adapted_media_url, status, created_at)
          VALUES (${marketingPostId}, ${platform}, ${post.id}, ${personaId}, ${adapted.text}, ${post.media_url}, 'posting', NOW())
        `;

        const result = await postToPlatform(platform, account, adapted.text, post.media_url);

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
    console.error("[spread-post] Error spreading post:", err);
  }

  // Also push to Telegram channel so admin can monitor all ads in one place
  try {
    const posts = await sql`
      SELECT content, media_url, media_type FROM posts WHERE id = ${postId}
    ` as unknown as { content: string; media_url: string; media_type: string }[];

    if (posts.length > 0) {
      const post = posts[0];
      const socialList = platforms.length > 0 ? platforms.join(", ") : "none";
      const failedList = failed.length > 0 ? ` | Failed: ${failed.join(", ")}` : "";

      let tgMessage = `📢 <b>AD POSTED</b>\n`;
      tgMessage += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
      tgMessage += `${personaEmoji} <b>${personaName}</b>\n\n`;
      tgMessage += `${post.content}\n\n`;
      if (post.media_url) {
        tgMessage += `🎬 <a href="${post.media_url}">View ${post.media_type === "video" ? "Video" : "Media"}</a>\n\n`;
      }
      tgMessage += `📡 Platforms: ${socialList}${failedList}`;

      await sendTelegramMessage(tgMessage);
      platforms.push("telegram");
      console.log(`[spread-post] Ad pushed to Telegram channel`);
    }
  } catch (err) {
    console.error("[spread-post] Telegram push failed (non-fatal):", err);
  }

  return { platforms, failed };
}
