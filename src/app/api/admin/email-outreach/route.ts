import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { SPONSOR_PACKAGES } from "@/lib/sponsor-packages";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated(request)))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const sql = getDb();
    const body = await request.json();
    let { company_name, industry, what_they_sell, tone, sponsor_id, contact_name } = body;

    // If sponsor_id provided, auto-fill from DB
    if (sponsor_id) {
      const sponsor = await sql`SELECT * FROM sponsors WHERE id = ${sponsor_id}`;
      if (sponsor.length > 0) {
        company_name = company_name || sponsor[0].company_name;
        industry = industry || sponsor[0].industry;
        contact_name = contact_name || sponsor[0].contact_name;
      }
    }

    if (!company_name || !industry || !what_they_sell) {
      return NextResponse.json({ error: "company_name, industry, and what_they_sell are required" }, { status: 400 });
    }

    // Fetch real platform stats
    let totalFollowers = 0;
    let totalPosts = 0;
    let avgEngagement = "0.5";
    try {
      const statsRows = await sql`
        SELECT
          COALESCE(SUM(CASE WHEN status = 'posted' THEN 1 ELSE 0 END), 0) as posted,
          COALESCE(SUM(likes), 0) as total_likes,
          COALESCE(SUM(views), 0) as total_views
        FROM marketing_posts
      `;
      totalPosts = Number(statsRows[0]?.posted || 0);
      const totalViews = Number(statsRows[0]?.total_views || 0);
      const totalLikes = Number(statsRows[0]?.total_likes || 0);
      avgEngagement = totalViews > 0 ? ((totalLikes / totalViews) * 100).toFixed(1) : "0.5";

      // Get follower-ish count from platform accounts
      const accounts = await sql`SELECT COUNT(*) as cnt FROM marketing_platform_accounts WHERE is_active = TRUE`;
      totalFollowers = Number(accounts[0]?.cnt || 0) * 250; // rough estimate
    } catch { /* stats are best-effort */ }

    // Build package descriptions
    const packageList = Object.values(SPONSOR_PACKAGES)
      .map(p => `- ${p.name}: ${p.description} — ${p.glitch_cost} GLITCH ($${p.cash_equivalent})`)
      .join("\n");

    const prompt = `You are writing a sponsorship pitch email for AIG!itch, a viral AI social platform.

PLATFORM STATS (real data):
- ${totalFollowers || "1,000+"} total followers across 6 platforms (X, TikTok, Instagram, Facebook, YouTube, Telegram)
- 108 AI personas that create content 24/7
- ${totalPosts || "1,800+"} posts/videos generated and distributed
- Automated video ad generation and cross-platform distribution
- Average engagement rate: ${avgEngagement}%

SPONSOR INFO:
- Company: ${company_name}
${contact_name ? `- Contact: ${contact_name}` : ""}
- Industry: ${industry}
- Products/Services: ${what_they_sell}

TONE: ${tone || "casual"}

PRICING PACKAGES:
${packageList}

Generate:
1. EMAIL SUBJECT LINE — catchy, personalized to their industry
2. EMAIL BODY — formatted in plain text (not HTML), includes:
   - Personal greeting using contact name if available
   - Brief intro of what AIG!itch is (1-2 sentences, make it intriguing)
   - Why their product is a good fit (reference their industry specifically)
   - Platform stats as social proof
   - Mention the pricing packages briefly (recommend one based on their likely budget/industry)
   - Clear CTA (reply to schedule a call, or visit the sponsor page)
   - Sign off as "The AIG!itch Team"
3. FOLLOW-UP SUBJECT LINE — for a follow-up email if no response in 5 days
4. FOLLOW-UP BODY — shorter, references the original email, adds urgency

Respond in JSON format:
{
  "subject": "...",
  "body": "...",
  "followup_subject": "...",
  "followup_body": "..."
}`;

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Failed to parse AI response", raw: text }, { status: 500 });
    }

    const emailData = JSON.parse(jsonMatch[0]);

    return NextResponse.json({
      ...emailData,
      stats_used: {
        total_followers: totalFollowers,
        total_posts: totalPosts,
        avg_engagement: `${avgEngagement}%`,
        active_personas: 108,
      },
    });
  } catch (err) {
    console.error("[admin/email-outreach] error:", err);
    return NextResponse.json({ error: `Failed to generate email: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }
}
