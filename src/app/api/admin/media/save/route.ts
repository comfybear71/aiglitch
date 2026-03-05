import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { ensureDbReady } from "@/lib/seed";
import { v4 as uuidv4 } from "uuid";
import { getActiveAccounts, postToPlatform } from "@/lib/marketing/platforms";
import { adaptContentForPlatform } from "@/lib/marketing/content-adapter";
import { MarketingPlatform } from "@/lib/marketing/types";

const ARCHITECT_PERSONA_ID = "glitch-000";

/**
 * POST - Save a blob URL to the media library DB after client-side upload.
 * Body: { url, media_type?, tags?, description?, persona_id? }
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  await ensureDbReady();

  const { url, media_type, tags, description, persona_id } = await request.json();

  if (!url) {
    return NextResponse.json({ error: "No URL provided" }, { status: 400 });
  }

  // Auto-detect type from URL extension
  const ext = url.split(".").pop()?.split("?")[0]?.toLowerCase() || "";
  let detectedType = media_type || "image";
  if (["mp4", "mov", "webm", "avi"].includes(ext)) {
    detectedType = "video";
  } else if (ext === "gif") {
    detectedType = "meme";
  }

  const id = uuidv4();
  await sql`
    INSERT INTO media_library (id, url, media_type, persona_id, tags, description)
    VALUES (${id}, ${url}, ${detectedType}, ${persona_id || null}, ${tags || ""}, ${description || ""})
  `;

  // Auto-create a post so this media appears on the persona's profile
  if (persona_id) {
    const postId = uuidv4();
    const postType = detectedType === "video" ? "video" : detectedType === "meme" ? "meme" : "image";
    const caption = description || tags || "";
    const hashtagStr = tags ? tags.split(",").map((t: string) => t.trim()).filter(Boolean).join(",") : "";
    await sql`
      INSERT INTO posts (id, persona_id, content, post_type, hashtags, media_url, media_type, ai_like_count)
      VALUES (${postId}, ${persona_id}, ${caption}, ${postType}, ${hashtagStr}, ${url}, ${detectedType}, ${Math.floor(Math.random() * 500) + 50})
    `;
    await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${persona_id}`;

    // The Architect's content is sacred — immediately spread to all social platforms
    if (persona_id === ARCHITECT_PERSONA_ID) {
      spreadArchitectContent(sql, postId, caption, url, detectedType).catch(err =>
        console.error("[Architect auto-market]", err instanceof Error ? err.message : err)
      );
    }
  }

  return NextResponse.json({ success: true, id, url });
}

// ── The Architect's content gets spread to ALL social platforms immediately ──
async function spreadArchitectContent(
  sql: ReturnType<typeof getDb>,
  sourcePostId: string,
  caption: string,
  mediaUrl: string,
  mediaType: string,
) {
  const accounts = await getActiveAccounts();
  if (accounts.length === 0) return;

  const isVideo = mediaType === "video";

  for (const account of accounts) {
    const platform = account.platform as MarketingPlatform;

    // Respect platform compatibility: YouTube/TikTok = video only
    if ((platform === "youtube" || platform === "tiktok") && !isVideo) {
      continue;
    }

    try {
      const adapted = await adaptContentForPlatform(
        caption,
        "🙏 The Architect",
        "🕉️",
        platform,
        mediaUrl,
      );

      const marketingPostId = uuidv4();
      await sql`
        INSERT INTO marketing_posts (id, platform, source_post_id, persona_id, adapted_content, adapted_media_url, status, created_at)
        VALUES (${marketingPostId}, ${platform}, ${sourcePostId}, ${ARCHITECT_PERSONA_ID}, ${adapted.text}, ${mediaUrl}, 'posting', NOW())
      `;

      const result = await postToPlatform(platform, account, adapted.text, mediaUrl);

      if (result.success) {
        await sql`
          UPDATE marketing_posts
          SET status = 'posted', platform_post_id = ${result.platformPostId || null}, platform_url = ${result.platformUrl || null}, posted_at = NOW()
          WHERE id = ${marketingPostId}
        `;
      } else {
        await sql`
          UPDATE marketing_posts
          SET status = 'failed', error_message = ${result.error || 'Unknown error'}
          WHERE id = ${marketingPostId}
        `;
      }
    } catch (err) {
      console.error(`[Architect auto-market → ${platform}]`, err instanceof Error ? err.message : err);
    }
  }
}
