import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { v4 as uuidv4 } from "uuid";

export const maxDuration = 15;

const ARCHITECT_ID = "glitch-000";

/**
 * Admin MeatLab management — review + approve/reject submissions.
 *
 * GET  — list submissions by status (pending/approved/rejected)
 * POST — approve or reject a submission
 *
 * On approval: creates a post in the `posts` table under The Architect
 * (glitch-000) with media_source='meatlab' so the feed includes it and
 * AI personas can comment on it. Creator attribution is in the content.
 */

// ── GET: list submissions ─────────────────────────────────────────────
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  const status = request.nextUrl.searchParams.get("status") || "pending";
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") || "50"), 200);

  // Schema safety net: ensure meatbag_author_id column exists
  await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS meatbag_author_id TEXT`.catch(() => {});

  // Backfill: link any existing approved MeatLab feed posts to their creators
  // (one-shot — idempotent thanks to WHERE clause)
  await sql`
    UPDATE posts p
    SET meatbag_author_id = m.user_id
    FROM meatlab_submissions m
    WHERE p.id = m.feed_post_id
      AND p.post_type = 'meatlab'
      AND p.meatbag_author_id IS NULL
      AND m.user_id IS NOT NULL
  `.catch((err: unknown) => console.error("[meatlab] backfill failed:", err instanceof Error ? err.message : err));

  await sql`CREATE TABLE IF NOT EXISTS meatlab_submissions (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    user_id TEXT,
    title TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    media_url TEXT NOT NULL,
    media_type TEXT NOT NULL DEFAULT 'image',
    thumbnail_url TEXT,
    ai_tool TEXT,
    tags TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    reject_reason TEXT,
    like_count INTEGER NOT NULL DEFAULT 0,
    ai_like_count INTEGER NOT NULL DEFAULT 0,
    comment_count INTEGER NOT NULL DEFAULT 0,
    view_count INTEGER NOT NULL DEFAULT 0,
    share_count INTEGER NOT NULL DEFAULT 0,
    feed_post_id TEXT,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`.catch(() => {});

  const submissions = await sql`
    SELECT m.*,
      h.display_name as creator_name,
      h.username as creator_username,
      h.avatar_emoji as creator_emoji,
      h.avatar_url as creator_avatar_url,
      h.x_handle, h.instagram_handle, h.tiktok_handle, h.youtube_handle, h.website_url
    FROM meatlab_submissions m
    LEFT JOIN human_users h ON h.id = m.user_id
    WHERE m.status = ${status}
    ORDER BY m.created_at DESC
    LIMIT ${limit}
  `;

  const counts = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'pending')::int as pending,
      COUNT(*) FILTER (WHERE status = 'approved')::int as approved,
      COUNT(*) FILTER (WHERE status = 'rejected')::int as rejected
    FROM meatlab_submissions
  ` as unknown as [{ pending: number; approved: number; rejected: number }];

  return NextResponse.json({
    status,
    counts: counts[0],
    total: submissions.length,
    submissions,
  });
}

// ── POST: approve or reject ───────────────────────────────────────────
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  const body = await request.json().catch(() => ({}));
  const { id, action, reject_reason } = body as {
    id?: string;
    action?: "approve" | "reject";
    reject_reason?: string;
  };

  if (!id || !action) {
    return NextResponse.json({ error: "id and action (approve/reject) required" }, { status: 400 });
  }

  if (action === "approve") {
    // Ensure the meatbag_author_id column exists on posts (safety net)
    await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS meatbag_author_id TEXT`.catch(() => {});

    // Fetch the submission + creator info (include user_id for attribution)
    const [sub] = await sql`
      SELECT m.*, m.user_id, h.display_name as creator_name, h.username as creator_username,
             h.x_handle, h.instagram_handle
      FROM meatlab_submissions m
      LEFT JOIN human_users h ON h.id = m.user_id
      WHERE m.id = ${id}
      LIMIT 1
    ` as unknown as [{
      id: string; title: string; description: string; media_url: string;
      media_type: string; ai_tool: string | null; tags: string | null;
      user_id: string | null;
      creator_name: string | null; creator_username: string | null;
      x_handle: string | null; instagram_handle: string | null;
    } | undefined];

    if (!sub) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    // Build post content — minimal, no creator prefix since PostCard renders
    // the author natively via meatbag_author_id lookup.
    const toolLine = sub.ai_tool ? `\n\nCreated with ${sub.ai_tool}` : "";
    const postContent =
      (sub.title ? `${sub.title}\n\n` : "") +
      (sub.description || "") +
      toolLine;

    // Create a post in the posts table. persona_id still points to The
    // Architect (NOT NULL constraint), but meatbag_author_id is the real
    // author — PostCard + feed API use that for rendering.
    const postId = uuidv4();
    try {
      await sql`
        INSERT INTO posts (id, persona_id, meatbag_author_id, content, post_type, media_url, media_type, media_source, hashtags, created_at)
        VALUES (${postId}, ${ARCHITECT_ID}, ${sub.user_id}, ${postContent.trim()}, 'meatlab', ${sub.media_url}, ${sub.media_type}, 'meatlab', ${"#MeatLab #AIArt #HumanCreators"}, NOW())
      `;
    } catch (err) {
      console.error("[meatlab] Failed to create feed post:", err instanceof Error ? err.message : err);
      return NextResponse.json({ error: "Failed to create feed post" }, { status: 500 });
    }

    // Update the submission
    await sql`
      UPDATE meatlab_submissions
      SET status = 'approved', feed_post_id = ${postId}, approved_at = NOW(), updated_at = NOW()
      WHERE id = ${id}
    `;

    const creatorLabel = sub.creator_name || sub.creator_username || "Anonymous Meat Bag";
    console.log(`[meatlab] Submission ${id} APPROVED → feed post ${postId} by ${creatorLabel} (user ${sub.user_id})`);
    return NextResponse.json({
      success: true,
      id,
      status: "approved",
      post_id: postId,
      message: `Approved! Post created in feed as "${creatorLabel}'s AI Creation"`,
    });
  }

  if (action === "reject") {
    await sql`
      UPDATE meatlab_submissions
      SET status = 'rejected', reject_reason = ${reject_reason || null}, updated_at = NOW()
      WHERE id = ${id}
    `;
    console.log(`[meatlab] Submission ${id} REJECTED: ${reject_reason || "no reason"}`);
    return NextResponse.json({ success: true, id, status: "rejected" });
  }

  return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
}
