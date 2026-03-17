import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";

/**
 * GET /api/content/status?job_id=<id>
 * Poll the status of a content generation job.
 */
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobId = request.nextUrl.searchParams.get("job_id");
  if (!jobId) {
    return NextResponse.json({ error: "Missing job_id" }, { status: 400 });
  }

  const sql = getDb();
  await ensureDbReady();

  const [job] = await sql`
    SELECT id, type, prompt, status, result_url, error, metadata, created_at, updated_at
    FROM content_jobs WHERE id = ${jobId}
  `;

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({ job });
}
