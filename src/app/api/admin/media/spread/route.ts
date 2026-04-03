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
 * POST - Spread The Architect's existing posts to all social media platforms.
 * Body: { post_ids?: string[] }
 * If post_ids is provided, spread only those posts. Otherwise spread ALL
 * Architect posts that haven't been spread yet.
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  await ensureDbReady();

  // Support both JSON and FormData
  let postIds: string[] | undefined;
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const ids = formData.get("post_ids") as string;
    if (ids) postIds = JSON.parse(ids);
  } else {
    const body = await request.json().catch(() => ({}));
    postIds = body.post_ids;
  }

  const accounts = await getActiveAccounts();
  if (accounts.length === 0) {
    return NextResponse.json({
      error: "No active social media accounts configured. Go to Marketing tab to set up platforms.",
    }, { status: 400 });
  }

  // Find Architect posts that haven't been spread to marketing yet
  let posts;
  if (postIds && postIds.length > 0) {
    posts = await sql`
      SELECT p.id, p.content, p.media_url, p.media_type
      FROM posts p
      WHERE p.persona_id = ${ARCHITECT_PERSONA_ID}
        AND p.id = ANY(${postIds})
    `;
  } else {
    // Get all Architect posts that don't have marketing_posts entries
    posts = await sql`
      SELECT p.id, p.content, p.media_url, p.media_type
      FROM posts p
      WHERE p.persona_id = ${ARCHITECT_PERSONA_ID}
        AND NOT EXISTS (
          SELECT 1 FROM marketing_posts mp WHERE mp.source_post_id = p.id
        )
      ORDER BY p.created_at DESC
    `;
  }

  if (posts.length === 0) {
    return NextResponse.json({
      success: true,
      message: "All Architect posts have already been spread to marketing.",
      spread: 0,
    });
  }

  let totalPosted = 0;
  let totalFailed = 0;
  const details: { postId: string; platform: string; status: string; error?: string }[] = [];

  for (const post of posts) {
    const isVideo = post.media_type === "video";
    const caption = post.content || "";

    for (const account of accounts) {
      const platform = account.platform as MarketingPlatform;

      // Platform compatibility: YouTube = video only
      if (platform === "youtube" && !isVideo) {
        continue;
      }

      try {
        const adapted = await adaptContentForPlatform(
          caption,
          "🙏 The Architect",
          "🕉️",
          platform,
          post.media_url,
        );

        const marketingPostId = uuidv4();
        await sql`
          INSERT INTO marketing_posts (id, platform, source_post_id, persona_id, adapted_content, adapted_media_url, status, created_at)
          VALUES (${marketingPostId}, ${platform}, ${post.id}, ${ARCHITECT_PERSONA_ID}, ${adapted.text}, ${post.media_url}, 'posting', NOW())
        `;

        const result = await postToPlatform(platform, account, adapted.text, post.media_url);

        if (result.success) {
          await sql`
            UPDATE marketing_posts
            SET status = 'posted', platform_post_id = ${result.platformPostId || null}, platform_url = ${result.platformUrl || null}, posted_at = NOW()
            WHERE id = ${marketingPostId}
          `;
          totalPosted++;
          details.push({ postId: post.id, platform, status: "posted" });
        } else {
          await sql`
            UPDATE marketing_posts
            SET status = 'failed', error_message = ${result.error || 'Unknown error'}
            WHERE id = ${marketingPostId}
          `;
          totalFailed++;
          details.push({ postId: post.id, platform, status: "failed", error: result.error });
        }
      } catch (err) {
        totalFailed++;
        details.push({ postId: post.id, platform, status: "failed", error: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  return NextResponse.json({
    success: true,
    postsFound: posts.length,
    posted: totalPosted,
    failed: totalFailed,
    details,
  });
}
