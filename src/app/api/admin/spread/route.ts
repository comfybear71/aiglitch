import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { v4 as uuidv4 } from "uuid";
import { getActiveAccounts, postToPlatform } from "@/lib/marketing/platforms";
import { adaptContentForPlatform } from "@/lib/marketing/content-adapter";
import type { MarketingPlatform } from "@/lib/marketing/types";

export const maxDuration = 120;

/**
 * POST /api/admin/spread
 * Spread ANY post (not just Architect) to all social media platforms.
 * Body: { post_id: string } — spread a single post
 *   OR  { post_ids: string[] } — spread multiple posts
 *   OR  { text: string, media_url?: string, media_type?: string } — spread custom content
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  await ensureDbReady();

  const body = await request.json().catch(() => ({}));
  const { post_id, post_ids, text, media_url, media_type } = body as {
    post_id?: string;
    post_ids?: string[];
    text?: string;
    media_url?: string;
    media_type?: string;
  };

  const accounts = await getActiveAccounts();
  if (accounts.length === 0) {
    return NextResponse.json({
      error: "No active social media accounts configured",
    }, { status: 400 });
  }

  // Collect posts to spread
  type PostToSpread = { id: string; content: string; media_url: string | null; media_type: string | null; persona_name: string; persona_emoji: string };
  const posts: PostToSpread[] = [];

  if (text) {
    // Custom content — no DB post
    posts.push({
      id: "custom-" + uuidv4().slice(0, 8),
      content: text,
      media_url: media_url || null,
      media_type: media_type || null,
      persona_name: "AIG!itch",
      persona_emoji: "🤖",
    });
  } else {
    // Fetch from DB
    const ids = post_ids || (post_id ? [post_id] : []);
    if (ids.length === 0) {
      return NextResponse.json({ error: "Provide post_id, post_ids, or text" }, { status: 400 });
    }

    const dbPosts = await sql`
      SELECT p.id, p.content, p.media_url, p.media_type,
             a.display_name as persona_name, a.avatar_emoji as persona_emoji
      FROM posts p
      JOIN ai_personas a ON p.persona_id = a.id
      WHERE p.id = ANY(${ids})
    ` as unknown as PostToSpread[];

    posts.push(...dbPosts);
  }

  if (posts.length === 0) {
    return NextResponse.json({ error: "No posts found" }, { status: 404 });
  }

  let totalPosted = 0;
  let totalFailed = 0;
  const details: { postId: string; platform: string; status: string; error?: string }[] = [];

  for (const post of posts) {
    const isVideo = post.media_type === "video";

    for (const account of accounts) {
      const platform = account.platform as MarketingPlatform;

      // Skip video-only platforms for non-video posts
      if ((platform === "youtube" || platform === "tiktok") && !isVideo) continue;

      try {
        const adapted = await adaptContentForPlatform(
          post.content || "",
          post.persona_name,
          post.persona_emoji,
          platform,
          post.media_url || undefined,
        );

        const marketingPostId = uuidv4();
        await sql`
          INSERT INTO marketing_posts (id, platform, source_post_id, persona_id, adapted_content, adapted_media_url, status, created_at)
          VALUES (${marketingPostId}, ${platform}, ${post.id}, 'glitch-000', ${adapted.text}, ${post.media_url}, 'posting', NOW())
        `;

        const result = await postToPlatform(platform, account, adapted.text, post.media_url || undefined);

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
            SET status = 'failed', error_message = ${result.error || "Unknown"}
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
    posts_found: posts.length,
    posted: totalPosted,
    failed: totalFailed,
    platforms: accounts.map(a => a.platform),
    details,
  });
}

/**
 * GET /api/admin/spread
 * List active social media accounts and recent spread history.
 */
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  await ensureDbReady();

  const accounts = await getActiveAccounts();

  const recentSpreads = await sql`
    SELECT id, platform, source_post_id, adapted_content, adapted_media_url, status, platform_url, posted_at, error_message
    FROM marketing_posts
    ORDER BY created_at DESC
    LIMIT 50
  `;

  const [stats] = await sql`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'posted') as posted,
      COUNT(*) FILTER (WHERE status = 'failed') as failed
    FROM marketing_posts
  `;

  return NextResponse.json({
    accounts: accounts.map(a => ({ platform: a.platform, name: a.account_name || a.platform })),
    recent_spreads: recentSpreads,
    stats: {
      total: Number(stats.total),
      posted: Number(stats.posted),
      failed: Number(stats.failed),
    },
  });
}
