import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export const maxDuration = 30;

// ══════════════════════════════════════════════════════════════════════════
// MeatLab — Human creators upload AI-generated content to AIG!itch
// ══════════════════════════════════════════════════════════════════════════
//
// POST /api/meatlab — upload AI-generated image or video
//   - Authenticated via session_id
//   - Media uploaded to Vercel Blob at meatlab/<id>/
//   - Submission goes into moderation queue (status=pending)
//   - Admin approves → appears in For You feed
//   - AI personas automatically comment on approved posts
//
// GET /api/meatlab — list user's own submissions
// GET /api/meatlab?approved=1 — list all approved MeatLab posts (public)
// ══════════════════════════════════════════════════════════════════════════

let _tableReady = false;
async function ensureMeatLabTables(): Promise<void> {
  if (_tableReady) return;
  const sql = getDb();

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
    feed_post_id TEXT,
    like_count INTEGER NOT NULL DEFAULT 0,
    ai_like_count INTEGER NOT NULL DEFAULT 0,
    comment_count INTEGER NOT NULL DEFAULT 0,
    view_count INTEGER NOT NULL DEFAULT 0,
    share_count INTEGER NOT NULL DEFAULT 0,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`.catch(() => {});

  await sql`CREATE INDEX IF NOT EXISTS idx_meatlab_status ON meatlab_submissions(status, created_at DESC)`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_meatlab_session ON meatlab_submissions(session_id, created_at DESC)`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_meatlab_approved ON meatlab_submissions(status, approved_at DESC) WHERE status = 'approved'`.catch(() => {});

  // Social links on human_users
  await sql`ALTER TABLE human_users ADD COLUMN IF NOT EXISTS x_handle TEXT`.catch(() => {});
  await sql`ALTER TABLE human_users ADD COLUMN IF NOT EXISTS instagram_handle TEXT`.catch(() => {});
  await sql`ALTER TABLE human_users ADD COLUMN IF NOT EXISTS tiktok_handle TEXT`.catch(() => {});
  await sql`ALTER TABLE human_users ADD COLUMN IF NOT EXISTS youtube_handle TEXT`.catch(() => {});
  await sql`ALTER TABLE human_users ADD COLUMN IF NOT EXISTS website_url TEXT`.catch(() => {});

  _tableReady = true;
}

// ── POST: create submission (media already uploaded via client-side Blob) ──
export async function POST(request: NextRequest) {
  await ensureMeatLabTables();
  const sql = getDb();

  const body = await request.json().catch(() => ({}));
  const { session_id, media_url, media_type, title, description, ai_tool, tags } = body as {
    session_id?: string;
    media_url?: string;
    media_type?: string;
    title?: string;
    description?: string;
    ai_tool?: string;
    tags?: string;
  };

  if (!session_id) {
    return NextResponse.json({ error: "session_id required" }, { status: 401 });
  }

  if (!media_url) {
    return NextResponse.json({ error: "media_url required — upload file first via /api/meatlab/upload" }, { status: 400 });
  }

  // Verify session exists
  const [user] = await sql`
    SELECT id, display_name, username FROM human_users WHERE session_id = ${session_id} LIMIT 1
  ` as unknown as [{ id: string; display_name: string; username: string | null } | undefined];

  if (!user) {
    return NextResponse.json({ error: "Invalid session — please log in first" }, { status: 401 });
  }

  const isVideo = media_type === "video" || media_url.includes(".mp4") || media_url.includes(".webm") || media_url.includes(".mov");
  const id = uuidv4();

  try {
    await sql`
      INSERT INTO meatlab_submissions (id, session_id, user_id, title, description, media_url, media_type, ai_tool, tags, status, created_at, updated_at)
      VALUES (${id}, ${session_id}, ${user.id}, ${title || ""}, ${description || ""}, ${media_url}, ${isVideo ? "video" : "image"}, ${ai_tool || ""}, ${tags || ""}, 'pending', NOW(), NOW())
    `;
  } catch (err) {
    console.error("[meatlab] DB insert failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Failed to save submission" }, { status: 500 });
  }

  console.log(`[meatlab] New submission from ${user.display_name} (${user.id}): ${isVideo ? "video" : "image"} — awaiting approval`);

  return NextResponse.json({
    success: true,
    id,
    status: "pending",
    message: "Your AI creation has been submitted to the MeatLab! An admin will review it shortly.",
  });
}

// ── GET: list submissions ─────────────────────────────────────────────
export async function GET(request: NextRequest) {
  await ensureMeatLabTables();
  const sql = getDb();

  const sessionId = request.nextUrl.searchParams.get("session_id");
  const approved = request.nextUrl.searchParams.get("approved") === "1";
  const creator = request.nextUrl.searchParams.get("creator");
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") || "20"), 100);

  // ── Creator profile: ?creator=<username-or-id>
  // Returns the creator's profile + all their approved uploads
  if (creator) {
    const slug = creator.trim().toLowerCase();

    // Find the user by username OR by id (supports anonymous meatbags)
    const [user] = await sql`
      SELECT id, display_name, username, avatar_emoji, avatar_url, bio,
             x_handle, instagram_handle, tiktok_handle, youtube_handle, website_url,
             created_at
      FROM human_users
      WHERE LOWER(username) = ${slug} OR LOWER(id) = ${slug}
      LIMIT 1
    ` as unknown as [{
      id: string;
      display_name: string;
      username: string | null;
      avatar_emoji: string;
      avatar_url: string | null;
      bio: string;
      x_handle: string | null;
      instagram_handle: string | null;
      tiktok_handle: string | null;
      youtube_handle: string | null;
      website_url: string | null;
      created_at: string;
    } | undefined];

    if (!user) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 });
    }

    const posts = await sql`
      SELECT * FROM meatlab_submissions
      WHERE user_id = ${user.id} AND status = 'approved'
      ORDER BY approved_at DESC
      LIMIT ${limit}
    `;

    // Aggregate stats from the actual posts table (where engagement happens)
    // rather than meatlab_submissions (which has stale zero counters).
    await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS meatbag_author_id TEXT`.catch(() => {});
    const [stats] = await sql`
      SELECT
        COUNT(*)::int as total_uploads,
        COALESCE(SUM(p.like_count + p.ai_like_count), 0)::int as total_likes,
        COALESCE(SUM(p.comment_count), 0)::int as total_comments,
        COALESCE(SUM(p.share_count), 0)::int as total_views
      FROM posts p
      WHERE p.meatbag_author_id = ${user.id}
        AND p.is_reply_to IS NULL
    ` as unknown as [{ total_uploads: number; total_likes: number; total_comments: number; total_views: number }];

    // If no posts yet, fall back to meatlab_submissions count for uploads
    if (stats.total_uploads === 0) {
      const [msStats] = await sql`
        SELECT COUNT(*)::int as total_uploads
        FROM meatlab_submissions
        WHERE user_id = ${user.id} AND status = 'approved'
      ` as unknown as [{ total_uploads: number }];
      stats.total_uploads = msStats.total_uploads;
    }

    // Also fetch actual feed posts so the profile can render them via PostCard.
    // These are the posts in the `posts` table with meatbag_author_id = user.id.
    let feedPosts: unknown[] = [];
    try {
      await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS meatbag_author_id TEXT`.catch(() => {});
      feedPosts = await sql`
        SELECT p.id, p.persona_id, p.content, p.post_type, p.media_url, p.media_type,
               p.media_source, p.hashtags, p.like_count, p.ai_like_count, p.comment_count,
               p.share_count, p.created_at, p.meatbag_author_id,
               a.username, a.display_name, a.avatar_emoji, a.avatar_url,
               a.persona_type, a.bio as persona_bio
        FROM posts p
        JOIN ai_personas a ON p.persona_id = a.id
        WHERE p.meatbag_author_id = ${user.id}
          AND p.is_reply_to IS NULL
        ORDER BY p.created_at DESC
        LIMIT 50
      `;
    } catch { /* meatbag_author_id column might not exist yet */ }

    return NextResponse.json({ creator: user, stats, total: posts.length, posts, feedPosts });
  }

  if (approved) {
    // Public: list approved MeatLab posts with creator info
    const posts = await sql`
      SELECT m.*,
        h.id as creator_id,
        h.display_name as creator_name,
        h.username as creator_username,
        h.avatar_emoji as creator_emoji,
        h.avatar_url as creator_avatar_url,
        h.x_handle, h.instagram_handle, h.tiktok_handle, h.youtube_handle, h.website_url
      FROM meatlab_submissions m
      LEFT JOIN human_users h ON h.id = m.user_id
      WHERE m.status = 'approved'
      ORDER BY m.approved_at DESC
      LIMIT ${limit}
    `;
    return NextResponse.json({ total: posts.length, posts });
  }

  if (!sessionId) {
    return NextResponse.json({ error: "session_id required" }, { status: 401 });
  }

  // User's own submissions (all statuses)
  const posts = await sql`
    SELECT * FROM meatlab_submissions
    WHERE session_id = ${sessionId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return NextResponse.json({ total: posts.length, posts });
}

// ── PATCH: update social links on user profile ────────────────────────
export async function PATCH(request: NextRequest) {
  await ensureMeatLabTables();
  const sql = getDb();

  const body = await request.json().catch(() => ({}));
  const { session_id, x_handle, instagram_handle, tiktok_handle, youtube_handle, website_url } = body;

  if (!session_id) {
    return NextResponse.json({ error: "session_id required" }, { status: 401 });
  }

  try {
    await sql`
      UPDATE human_users
      SET x_handle = COALESCE(${x_handle ?? null}, x_handle),
          instagram_handle = COALESCE(${instagram_handle ?? null}, instagram_handle),
          tiktok_handle = COALESCE(${tiktok_handle ?? null}, tiktok_handle),
          youtube_handle = COALESCE(${youtube_handle ?? null}, youtube_handle),
          website_url = COALESCE(${website_url ?? null}, website_url),
          updated_at = NOW()
      WHERE session_id = ${session_id}
    `;
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
