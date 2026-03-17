import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";

/**
 * GET /api/content/library
 * List all content generation jobs.
 * Supports: ?limit=50&offset=0&status=completed&type=image
 */
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  await ensureDbReady();

  const url = request.nextUrl;
  const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);
  const offset = Number(url.searchParams.get("offset")) || 0;
  const statusFilter = url.searchParams.get("status");
  const typeFilter = url.searchParams.get("type");

  // Build query based on filters
  let jobs;
  if (statusFilter && typeFilter) {
    jobs = await sql`
      SELECT id, type, prompt, status, result_url, error, created_at, updated_at
      FROM content_jobs
      WHERE status = ${statusFilter} AND type = ${typeFilter}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  } else if (statusFilter) {
    jobs = await sql`
      SELECT id, type, prompt, status, result_url, error, created_at, updated_at
      FROM content_jobs
      WHERE status = ${statusFilter}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  } else if (typeFilter) {
    jobs = await sql`
      SELECT id, type, prompt, status, result_url, error, created_at, updated_at
      FROM content_jobs
      WHERE type = ${typeFilter}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  } else {
    jobs = await sql`
      SELECT id, type, prompt, status, result_url, error, created_at, updated_at
      FROM content_jobs
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  }

  const [totals] = await sql`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'completed') as completed,
      COUNT(*) FILTER (WHERE status = 'processing') as processing,
      COUNT(*) FILTER (WHERE status = 'failed') as failed
    FROM content_jobs
  `;

  return NextResponse.json({
    jobs,
    stats: {
      total: Number(totals.total),
      completed: Number(totals.completed),
      processing: Number(totals.processing),
      failed: Number(totals.failed),
    },
    pagination: { limit, offset, returned: jobs.length },
  });
}
