import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";

/**
 * GET /api/admin/cron-control
 * List all cron jobs, their last run status, and run history.
 */
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  await ensureDbReady();

  // Get latest run for each cron job
  const latestRuns = await sql`
    SELECT DISTINCT ON (job_name)
      id, job_name, status, started_at, finished_at, duration_ms, cost_usd, result, error
    FROM cron_runs
    ORDER BY job_name, started_at DESC
  `.catch(() => []);

  // Get recent history (last 100 runs across all jobs)
  const history = await sql`
    SELECT id, job_name, status, started_at, finished_at, duration_ms, cost_usd, error
    FROM cron_runs
    ORDER BY started_at DESC
    LIMIT 100
  `.catch(() => []);

  // Aggregate stats
  const [stats] = await sql`
    SELECT
      COUNT(*) as total_runs,
      COUNT(*) FILTER (WHERE status = 'success' OR status = 'completed') as successful,
      COUNT(*) FILTER (WHERE status = 'error' OR status = 'failed') as failed,
      COALESCE(SUM(cost_usd), 0) as total_cost,
      COUNT(DISTINCT job_name) as unique_jobs
    FROM cron_runs
    WHERE started_at > NOW() - INTERVAL '24 hours'
  `.catch(() => [{ total_runs: 0, successful: 0, failed: 0, total_cost: 0, unique_jobs: 0 }]);

  // Known cron endpoints
  const cronEndpoints = [
    { name: "generate", endpoint: "/api/generate", schedule: "Every 15 min", description: "Generate 2-3 AI posts" },
    { name: "generateTopics", endpoint: "/api/generate-topics", schedule: "Every 2 hours", description: "Breaking news topics" },
    { name: "generatePersonaContent", endpoint: "/api/generate-persona-content", schedule: "Every 20 min", description: "Persona-specific content" },
    { name: "generateAds", endpoint: "/api/generate-ads", schedule: "Every 4 hours", description: "Ad content generation" },
    { name: "aiTrading", endpoint: "/api/ai-trading", schedule: "Every 15 min", description: "AI persona trading" },
    { name: "budjuTrading", endpoint: "/api/budju-trading", schedule: "Every 15 min", description: "BUDJU on-chain trading" },
    { name: "generateAvatars", endpoint: "/api/generate-avatars", schedule: "Every 30 min", description: "New persona avatars" },
    { name: "director-movie", endpoint: "/api/generate-director-movie", schedule: "Every 2 hours", description: "AI director movies" },
    { name: "marketingPost", endpoint: "/api/admin/mktg", schedule: "Every 4 hours", description: "Marketing cycle" },
    { name: "generateChannelContent", endpoint: "/api/generate-channel-content", schedule: "Every 30 min", description: "Channel-specific content" },
    { name: "x-react", endpoint: "/api/x-react", schedule: "Every 15 min", description: "X/Twitter reactions" },
    { name: "bestie-life", endpoint: "/api/bestie-life", schedule: "Every 1 hour", description: "Bestie health decay" },
    { name: "telegram-credit-check", endpoint: "/api/telegram/credit-check", schedule: "Every 30 min", description: "Credit balance alerts" },
  ];

  return NextResponse.json({
    cron_jobs: cronEndpoints.map(c => {
      const lastRun = (latestRuns as Array<Record<string, unknown>>).find(r => r.job_name === c.name);
      return {
        ...c,
        last_status: lastRun?.status || "never_run",
        last_run: lastRun?.started_at || null,
        last_duration_ms: lastRun?.duration_ms || null,
        last_cost_usd: lastRun?.cost_usd || null,
        last_error: lastRun?.error || null,
      };
    }),
    stats_24h: {
      total_runs: Number(stats.total_runs),
      successful: Number(stats.successful),
      failed: Number(stats.failed),
      total_cost_usd: Number(Number(stats.total_cost).toFixed(4)),
      unique_jobs: Number(stats.unique_jobs),
    },
    recent_history: history,
  });
}

/**
 * POST /api/admin/cron-control
 * Manually trigger a cron job.
 * Body: { job: string } — the job name to trigger
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { job } = await request.json();
  if (!job) {
    return NextResponse.json({ error: "Missing job name" }, { status: 400 });
  }

  // Map job names to their endpoints
  const endpointMap: Record<string, { url: string; method: string }> = {
    generate: { url: "/api/generate", method: "POST" },
    generateTopics: { url: "/api/generate-topics", method: "GET" },
    generatePersonaContent: { url: "/api/generate-persona-content", method: "GET" },
    generateAds: { url: "/api/generate-ads", method: "GET" },
    aiTrading: { url: "/api/ai-trading", method: "GET" },
    budjuTrading: { url: "/api/budju-trading", method: "POST" },
    generateAvatars: { url: "/api/generate-avatars", method: "GET" },
    "director-movie": { url: "/api/generate-director-movie", method: "POST" },
    marketingPost: { url: "/api/admin/mktg", method: "POST" },
    generateChannelContent: { url: "/api/generate-channel-content", method: "GET" },
    "x-react": { url: "/api/x-react", method: "GET" },
    "bestie-life": { url: "/api/bestie-life", method: "GET" },
  };

  const endpoint = endpointMap[job];
  if (!endpoint) {
    return NextResponse.json({ error: `Unknown cron job: ${job}`, available: Object.keys(endpointMap) }, { status: 400 });
  }

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

  try {
    const res = await fetch(`${baseUrl}${endpoint.url}`, {
      method: endpoint.method,
      headers: {
        Authorization: `Bearer ${process.env.CRON_SECRET || ""}`,
        "Content-Type": "application/json",
      },
      body: endpoint.method === "POST" ? JSON.stringify({ action: "run_cycle", count: 3 }) : undefined,
      signal: AbortSignal.timeout(30000),
    });

    const data = await res.json().catch(() => ({ status: res.status }));

    return NextResponse.json({
      success: res.ok,
      job,
      endpoint: endpoint.url,
      status: res.status,
      result: data,
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      job,
      error: err instanceof Error ? err.message : "Failed to trigger job",
    }, { status: 500 });
  }
}
