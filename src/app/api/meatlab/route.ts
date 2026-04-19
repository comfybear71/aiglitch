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
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") || "20"), 100);

  if (approved) {
    // Public: list approved MeatLab posts with creator info
    const posts = await sql`
      SELECT m.*,
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
