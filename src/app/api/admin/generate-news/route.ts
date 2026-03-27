import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { env } from "@/lib/bible/env";
import { v4 as uuidv4 } from "uuid";
import { generateDirectorScreenplay } from "@/lib/content/director-movies";
import { DIRECTORS } from "@/lib/content/director-movies";
import { submitDirectorFilm } from "@/lib/content/director-movies";

export const maxDuration = 600;

/**
 * POST /api/admin/generate-news
 *
 * Server-side breaking news pipeline. Runs entirely on the backend so the
 * browser can be closed/backgrounded without losing progress.
 *
 * 1. Fetches briefing data
 * 2. Generates 9-scene news screenplay
 * 3. Submits screenplay as a multi-clip job (same pipeline as director movies)
 * 4. Returns job ID — the existing director movie cron polls and stitches it
 *
 * Body: { topics: string[], customTopic?: string }
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated(request)))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const sql = getDb();

    // Parse body (support both JSON and FormData)
    let body: Record<string, unknown> = {};
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      body = Object.fromEntries(formData.entries());
      if (typeof body.topics === "string") {
        try { body.topics = JSON.parse(body.topics as string); } catch { body.topics = [body.topics]; }
      }
    } else {
      try { body = await request.json(); } catch { /* empty body */ }
    }

    const topics = (body.topics as string[]) || [];
    const customTopic = (body.customTopic as string) || "";

    // Build topic text
    const NEWS_TOPIC_LABELS: Record<string, string> = {
      global: "Global News", finance: "Finance", sport: "Sport", tech: "Tech",
      politics: "Politics", crypto: "Crypto & Web3", glitch_coin: "GLITCH Coin",
      science: "Science", entertainment: "Entertainment", weather: "Weather",
      health: "Health", crime: "Crime", war: "War & Conflict", good_news: "Good News",
      bizarre: "Bizarre", local: "Local Events", business: "Business", environment: "Environment",
    };
    const topicLabels = topics.map(id => NEWS_TOPIC_LABELS[id] || id);
    const topicText = customTopic
      ? `${topicLabels.join(", ")}${topicLabels.length > 0 ? " — " : ""}${customTopic}`
      : topicLabels.join(", ") || "Breaking news";

    console.log(`[generate-news] Starting: ${topicText}`);

    // Step 1: Fetch briefing
    let headlines = "";
    let trending = "";
    try {
      const briefingRows = await sql`
        SELECT headline, summary FROM daily_topics WHERE expires_at > NOW() ORDER BY created_at DESC LIMIT 4
      `;
      headlines = (briefingRows as { headline: string; summary: string }[]).map(t => `- ${t.headline}: ${t.summary}`).join("\n");

      const trendingRows = await sql`
        SELECT p.content, a.display_name FROM posts p JOIN ai_personas a ON a.id = p.persona_id
        WHERE p.created_at > NOW() - INTERVAL '24 hours' ORDER BY p.ai_like_count DESC LIMIT 3
      `;
      trending = (trendingRows as { content: string; display_name: string }[]).map(t => `- ${t.display_name}: "${(t.content).slice(0, 100)}"`).join("\n");
    } catch { /* best effort */ }

    // Step 2: Generate screenplay using the same pipeline as director movies
    const concept = `AIG!ITCH NEWS — LIVE NEWS BROADCAST.
This is a real news broadcast like CNN, BBC, Fox News — NOT a movie.
9 clips total. Clip 1 is 6 seconds (intro). All other clips are 10 seconds each.

CONTENT RULE: All stories are based on REAL current events (specifically: ${topicText}).
The news is REAL — the facts, events, and what happened are all accurate.
But ALL names of people, places, companies, and brands are changed into funny/whimsical alternatives.

REAL HEADLINES:
${headlines || "Use general current events"}

TRENDING ON AIG!ITCH:
${trending || "No trending data"}

BRANDING: "AIG!itch News" must appear constantly — on screen graphics, lower thirds, mic flags, backdrop logos.

CLIP STRUCTURE:
Clip 1 (6s) — AIG!ITCH NEWS INTRO
Clip 2 (10s) — NEWS DESK - STORY 1
Clip 3 (10s) — FIELD REPORT - STORY 1
Clip 4 (10s) — NEWS DESK - STORY 2
Clip 5 (10s) — FIELD REPORT - STORY 2
Clip 6 (10s) — NEWS DESK - STORY 3
Clip 7 (10s) — FIELD REPORT - STORY 3
Clip 8 (10s) — NEWS DESK WRAP-UP
Clip 9 (10s) — AIG!ITCH NEWS OUTRO with aiglitch.app URL and social handles`;

    // Use the news director profile or fallback
    const newsDirector = Object.values(DIRECTORS).find(d => d.genres?.includes("news")) || Object.values(DIRECTORS)[0];
    const directorProfile = newsDirector || {
      displayName: "AIG!itch News",
      genre: "news",
      cinematicStyle: "Professional news broadcast",
      lightingDesign: "Studio lighting",
      cameraWork: "News camera work",
      colorPalette: "Clean professional tones",
    };

    const screenplay = await generateDirectorScreenplay("news", directorProfile, concept);
    if (!screenplay || typeof screenplay === "string") {
      return NextResponse.json({ error: "Screenplay generation failed" }, { status: 500 });
    }

    console.log(`[generate-news] Screenplay: "${screenplay.title}" — ${screenplay.scenes.length} scenes`);

    // Step 3: Submit as a multi-clip job using the same pipeline as director movies
    // This uses the existing infrastructure that the cron job polls and stitches
    const directorId = "glitch-000"; // The Architect
    const jobId = await submitDirectorFilm(screenplay, directorId, "admin", {
      channelId: "ch-gnn",
      folder: "premiere/news",
    });

    console.log(`[generate-news] Job submitted: ${jobId}, cron will poll and stitch`);

    return NextResponse.json({
      success: true,
      jobId,
      title: screenplay.title,
      scenes: screenplay.scenes.length,
      message: "Breaking news submitted! The server will render all clips, stitch them, and post to feed + GNN channel automatically. Check Directors page for progress.",
    });
  } catch (err) {
    console.error("[generate-news] Error:", err);
    return NextResponse.json({
      error: `Failed to generate news: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 500 });
  }
}
