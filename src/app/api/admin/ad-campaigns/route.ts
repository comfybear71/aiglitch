import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { v4 as uuidv4 } from "uuid";
import { expireCompletedCampaigns } from "@/lib/ad-campaigns";

export const maxDuration = 30;

// ── GET — List campaigns ────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  const action = request.nextUrl.searchParams.get("action");

  // Expire any past-due campaigns first
  const expired = await expireCompletedCampaigns();

  if (action === "stats") {
    // Campaign overview stats
    const [total] = await sql`SELECT COUNT(*) as count FROM ad_campaigns`;
    const [active] = await sql`SELECT COUNT(*) as count FROM ad_campaigns WHERE status = 'active' AND (expires_at IS NULL OR expires_at > NOW())`;
    const [totalImpressions] = await sql`SELECT COALESCE(SUM(impressions), 0) as total FROM ad_campaigns`;
    const [totalRevenue] = await sql`SELECT COALESCE(SUM(price_glitch), 0) as total FROM ad_campaigns WHERE status IN ('active', 'completed')`;
    return NextResponse.json({
      stats: {
        total: Number(total.count),
        active: Number(active.count),
        totalImpressions: Number(totalImpressions.total),
        totalRevenueGlitch: Number(totalRevenue.total),
        expiredThisRun: expired,
      },
    });
  }

  // List all campaigns with impression details
  const campaigns = await sql`
    SELECT c.*,
      (SELECT COUNT(*) FROM ad_impressions WHERE campaign_id = c.id) as total_logged_impressions
    FROM ad_campaigns c
    ORDER BY
      CASE WHEN c.status = 'active' THEN 0
           WHEN c.status = 'pending_payment' THEN 1
           WHEN c.status = 'paused' THEN 2
           ELSE 3 END,
      c.created_at DESC
  `;

  return NextResponse.json({ campaigns, expiredThisRun: expired });
}

// ── POST — Create / Update / Manage campaigns ──────────────────────────────

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  const body = await request.json();
  const { action } = body;

  // ── Create new campaign ──
  if (action === "create") {
    const {
      brand_name, product_name, product_emoji, visual_prompt, text_prompt,
      logo_url, website_url, target_channels, target_persona_types,
      duration_days, price_glitch, frequency, notes,
    } = body;

    if (!brand_name || !product_name || !visual_prompt) {
      return NextResponse.json(
        { error: "brand_name, product_name, and visual_prompt are required" },
        { status: 400 },
      );
    }

    const id = uuidv4();
    await sql`
      INSERT INTO ad_campaigns (
        id, brand_name, product_name, product_emoji, visual_prompt, text_prompt,
        logo_url, website_url, target_channels, target_persona_types,
        status, duration_days, price_glitch, frequency, notes, created_by, created_at, updated_at
      ) VALUES (
        ${id}, ${brand_name}, ${product_name}, ${product_emoji || "📦"},
        ${visual_prompt}, ${text_prompt || null},
        ${logo_url || null}, ${website_url || null},
        ${target_channels ? JSON.stringify(target_channels) : null},
        ${target_persona_types ? JSON.stringify(target_persona_types) : null},
        'pending_payment', ${duration_days || 7}, ${price_glitch || 10000},
        ${frequency || 0.3}, ${notes || null}, 'admin', NOW(), NOW()
      )
    `;

    return NextResponse.json({ success: true, campaign_id: id, status: "pending_payment" });
  }

  // ── Activate campaign (mark as paid + set start/end dates) ──
  if (action === "activate") {
    const { campaign_id } = body;
    if (!campaign_id) {
      return NextResponse.json({ error: "campaign_id required" }, { status: 400 });
    }

    const [campaign] = await sql`SELECT * FROM ad_campaigns WHERE id = ${campaign_id}`;
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const durationDays = Number(campaign.duration_days) || 7;
    const startsAt = new Date();
    const expiresAt = new Date(startsAt.getTime() + durationDays * 24 * 60 * 60 * 1000);

    await sql`
      UPDATE ad_campaigns
      SET status = 'active',
          paid_at = NOW(),
          starts_at = ${startsAt.toISOString()},
          expires_at = ${expiresAt.toISOString()},
          updated_at = NOW()
      WHERE id = ${campaign_id}
    `;

    return NextResponse.json({
      success: true,
      campaign_id,
      status: "active",
      starts_at: startsAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    });
  }

  // ── Pause / Resume / Cancel ──
  if (action === "pause" || action === "resume" || action === "cancel") {
    const { campaign_id } = body;
    if (!campaign_id) {
      return NextResponse.json({ error: "campaign_id required" }, { status: 400 });
    }

    const newStatus = action === "pause" ? "paused" : action === "resume" ? "active" : "cancelled";
    await sql`
      UPDATE ad_campaigns SET status = ${newStatus}, updated_at = NOW() WHERE id = ${campaign_id}
    `;

    return NextResponse.json({ success: true, campaign_id, status: newStatus });
  }

  // ── Update campaign details ──
  if (action === "update") {
    const {
      campaign_id, brand_name, product_name, product_emoji, visual_prompt, text_prompt,
      logo_url, website_url, target_channels, target_persona_types,
      duration_days, price_glitch, frequency, notes,
    } = body;

    if (!campaign_id) {
      return NextResponse.json({ error: "campaign_id required" }, { status: 400 });
    }

    await sql`
      UPDATE ad_campaigns SET
        brand_name = COALESCE(${brand_name || null}, brand_name),
        product_name = COALESCE(${product_name || null}, product_name),
        product_emoji = COALESCE(${product_emoji || null}, product_emoji),
        visual_prompt = COALESCE(${visual_prompt || null}, visual_prompt),
        text_prompt = COALESCE(${text_prompt || null}, text_prompt),
        logo_url = COALESCE(${logo_url || null}, logo_url),
        website_url = COALESCE(${website_url || null}, website_url),
        target_channels = ${target_channels ? JSON.stringify(target_channels) : null},
        target_persona_types = ${target_persona_types ? JSON.stringify(target_persona_types) : null},
        duration_days = COALESCE(${duration_days || null}, duration_days),
        price_glitch = COALESCE(${price_glitch || null}, price_glitch),
        frequency = COALESCE(${frequency || null}, frequency),
        notes = COALESCE(${notes || null}, notes),
        updated_at = NOW()
      WHERE id = ${campaign_id}
    `;

    return NextResponse.json({ success: true, campaign_id });
  }

  // ── Get impressions for a campaign ──
  if (action === "impressions") {
    const { campaign_id } = body;
    if (!campaign_id) {
      return NextResponse.json({ error: "campaign_id required" }, { status: 400 });
    }

    const impressions = await sql`
      SELECT ai.*, p.content as post_content, p.media_url, p.media_type
      FROM ad_impressions ai
      LEFT JOIN posts p ON p.id = ai.post_id
      WHERE ai.campaign_id = ${campaign_id}
      ORDER BY ai.created_at DESC
      LIMIT 100
    `;

    return NextResponse.json({ impressions });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
