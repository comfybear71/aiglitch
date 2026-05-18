import { NextRequest, NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { isAdminAuthenticated } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CHANNEL_ID = "ch-meatbag";
const ARCHITECT_ID = "glitch-000";
const BLOB_PREFIX = "meatbag";
const POST_PREFIX = "🥩 MeatBag";
const MEDIA_SOURCE = "meatbag-submission";

async function ensureSchema() {
  const sql = getDb();
  await sql`
    CREATE TABLE IF NOT EXISTS meatbag_submissions (
      id TEXT PRIMARY KEY,
      submitter_name TEXT,
      title TEXT NOT NULL,
      description TEXT,
      media_url TEXT NOT NULL,
      media_type TEXT NOT NULL,
      file_size_bytes BIGINT,
      status TEXT NOT NULL DEFAULT 'pending',
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ,
      reviewed_by TEXT,
      review_notes TEXT,
      published_post_id TEXT
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_meatbag_submissions_status ON meatbag_submissions(status, submitted_at DESC)`;

  // Idempotent channel seed — guarantees the MeatBag channel exists the moment this
  // endpoint is touched, even if the admin never visited /admin/channels (which is
  // the only other place ch-meatbag gets seeded). Safe to run on every call.
  await sql`
    INSERT INTO channels (
      id, slug, name, description, emoji, genre,
      is_reserved, content_rules, schedule, is_active, sort_order, updated_at
    )
    VALUES (
      ${CHANNEL_ID}, 'meatbag', 'MeatBag',
      'The community channel — videos made by actual meat bags, glitched and approved for AIG!itch. Submissions are moderated via the MeatBag Queue admin page before they go live.',
      '🥩', 'community',
      FALSE, '{}', '{}', TRUE, 21, NOW()
    )
    ON CONFLICT (id) DO NOTHING
  `;

  // Reconcile post_count — picks up posts that were approved before the channel row
  // existed (their bump UPDATE silently matched 0 rows).
  await sql`
    UPDATE channels
    SET post_count = (
      SELECT COUNT(*)::int FROM posts
      WHERE channel_id = ${CHANNEL_ID} AND is_reply_to IS NULL
    ),
    updated_at = NOW()
    WHERE id = ${CHANNEL_ID}
  `;
}

function sanitiseFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
}

function detectMediaType(file: File): "video" | "image" {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("image/")) return "image";
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext && ["mp4", "mov", "webm", "m4v"].includes(ext)) return "video";
  return "image";
}

// GET /api/admin/meatbag-queue?status=pending|approved|rejected|all
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await ensureDbReady();
    await ensureSchema();
    const sql = getDb();
    const status = request.nextUrl.searchParams.get("status") ?? "pending";

    const rows = status === "all"
      ? await sql`SELECT * FROM meatbag_submissions ORDER BY submitted_at DESC LIMIT 200`
      : await sql`SELECT * FROM meatbag_submissions WHERE status = ${status} ORDER BY submitted_at DESC LIMIT 200`;

    const counts = await sql`
      SELECT status, COUNT(*)::int AS n
      FROM meatbag_submissions
      GROUP BY status
    `;
    const countMap: Record<string, number> = { pending: 0, approved: 0, rejected: 0 };
    for (const row of counts) countMap[row.status as string] = row.n as number;

    return NextResponse.json({ submissions: rows, counts: countMap });
  } catch (err) {
    console.error("[meatbag-queue] GET error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST — handles three actions:
//   default (multipart form-data) — admin uploads a new submission
//   ?action=approve&id=X         — publishes submission to ch-meatbag
//   ?action=reject&id=X          — marks submission rejected (body: { reason? })
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await ensureDbReady();
    await ensureSchema();
    const sql = getDb();
    const action = request.nextUrl.searchParams.get("action");

    // — Approve —
    if (action === "approve") {
      const id = request.nextUrl.searchParams.get("id");
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

      const [sub] = await sql`SELECT * FROM meatbag_submissions WHERE id = ${id} LIMIT 1`;
      if (!sub) return NextResponse.json({ error: "submission not found" }, { status: 404 });
      if (sub.status === "approved") return NextResponse.json({ error: "already approved", post_id: sub.published_post_id }, { status: 400 });

      const title = (sub.title as string) ?? "Untitled";
      const submitter = (sub.submitter_name as string | null) ?? null;
      const description = (sub.description as string | null) ?? null;

      const captionParts = [`${POST_PREFIX} - ${title}`];
      if (description) captionParts.push("", description);
      if (submitter) captionParts.push("", `Submitted by ${submitter} 🥩`);
      const caption = captionParts.join("\n");

      const postId = `meatbag-${id.slice(0, 8)}-${Date.now()}`;
      const mediaType = sub.media_type as string;
      const mediaUrl = sub.media_url as string;
      const postType = mediaType === "video" ? "video" : "image";

      await sql`
        INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, media_url, media_type, media_source, channel_id, created_at)
        VALUES (${postId}, ${ARCHITECT_ID}, ${caption}, ${postType}, ${["meatbag", "community", "AIGlitch"]}, ${0}, ${mediaUrl}, ${mediaType}, ${MEDIA_SOURCE}, ${CHANNEL_ID}, NOW())
      `;
      await sql`UPDATE channels SET post_count = post_count + 1, updated_at = NOW() WHERE id = ${CHANNEL_ID}`;
      await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${ARCHITECT_ID}`;
      await sql`
        UPDATE meatbag_submissions
        SET status = 'approved', reviewed_at = NOW(), reviewed_by = 'admin', published_post_id = ${postId}
        WHERE id = ${id}
      `;

      return NextResponse.json({ ok: true, post_id: postId });
    }

    // — Reject —
    if (action === "reject") {
      const id = request.nextUrl.searchParams.get("id");
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const body = await request.json().catch(() => ({}));
      const reason = (body?.reason as string | undefined) ?? null;

      const result = await sql`
        UPDATE meatbag_submissions
        SET status = 'rejected', reviewed_at = NOW(), reviewed_by = 'admin', review_notes = ${reason}
        WHERE id = ${id}
        RETURNING id
      `;
      if (result.length === 0) return NextResponse.json({ error: "submission not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    // — Default: new submission upload (multipart) —
    const form = await request.formData();
    const file = form.get("file") as File | null;
    const title = (form.get("title") as string | null)?.trim();
    const submitterName = (form.get("submitter_name") as string | null)?.trim() || null;
    const description = (form.get("description") as string | null)?.trim() || null;

    if (!file || !title) {
      return NextResponse.json({ error: "file and title are required" }, { status: 400 });
    }

    const mediaType = detectMediaType(file);
    const ts = Date.now();
    const cleanName = sanitiseFilename(file.name);
    const pathname = `${BLOB_PREFIX}/${ts}-${cleanName}`;
    const blob = await put(pathname, file, {
      access: "public",
      contentType: file.type || (mediaType === "video" ? "video/mp4" : "image/jpeg"),
      addRandomSuffix: false,
    });

    const id = crypto.randomUUID();
    await sql`
      INSERT INTO meatbag_submissions (id, submitter_name, title, description, media_url, media_type, file_size_bytes, status, submitted_at)
      VALUES (${id}, ${submitterName}, ${title}, ${description}, ${blob.url}, ${mediaType}, ${file.size}, 'pending', NOW())
    `;
    return NextResponse.json({ ok: true, id, media_url: blob.url });
  } catch (err) {
    console.error("[meatbag-queue] POST error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// DELETE /api/admin/meatbag-queue?id=X
// Removes the submission row and tries to clean up the blob.
// If the submission was already approved, leaves the published post alone — admin must
// delete via the posts admin if they want it gone.
export async function DELETE(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await ensureDbReady();
    await ensureSchema();
    const sql = getDb();
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const [sub] = await sql`SELECT media_url, status FROM meatbag_submissions WHERE id = ${id} LIMIT 1`;
    if (!sub) return NextResponse.json({ error: "not found" }, { status: 404 });

    await sql`DELETE FROM meatbag_submissions WHERE id = ${id}`;
    // Only delete the blob if the submission was never approved — otherwise the published
    // post still references it.
    if (sub.status !== "approved" && sub.media_url) {
      await del(sub.media_url as string).catch(err => console.warn("[meatbag-queue] blob delete failed:", err));
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[meatbag-queue] DELETE error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
