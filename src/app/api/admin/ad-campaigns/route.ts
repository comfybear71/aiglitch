import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { v4 as uuidv4 } from "uuid";
import { expireCompletedCampaigns } from "@/lib/ad-campaigns";

export const maxDuration = 30;

// Auto-migrate: ensure ad_campaigns and ad_impressions tables exist
let _migrated = false;
async function ensureSchema() {
  if (_migrated) return;
  try {
    const sql = getDb();
    // Create tables if they don't exist
    await sql`CREATE TABLE IF NOT EXISTS ad_campaigns (
      id TEXT PRIMARY KEY,
      brand_name TEXT NOT NULL,
      product_name TEXT NOT NULL,
      product_emoji TEXT DEFAULT '📦',
      visual_prompt TEXT NOT NULL,
      text_prompt TEXT,
      logo_url TEXT,
      product_image_url TEXT,
      website_url TEXT,
      target_channels JSONB,
      target_persona_types JSONB,
      status TEXT DEFAULT 'pending_payment',
      duration_days INTEGER DEFAULT 7,
      price_glitch INTEGER DEFAULT 10000,
      frequency REAL DEFAULT 0.3,
      impressions INTEGER DEFAULT 0,
      notes TEXT,
      created_by TEXT,
      paid_at TIMESTAMPTZ,
      starts_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS ad_impressions (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      post_id TEXT,
      content_type TEXT DEFAULT 'text',
      channel_id TEXT,
      persona_id TEXT,
      prompt_used TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`;
    // Add columns that may be missing if tables existed before schema updates
    await sql`ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS product_image_url TEXT`;
    await sql`ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS product_images JSONB DEFAULT '[]'`;
    await sql`ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS grokify_scenes INTEGER DEFAULT 3`;
    await sql`ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS grokify_mode TEXT DEFAULT 'all'`;
    await sql`ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS video_impressions INTEGER DEFAULT 0`;
    await sql`ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS image_impressions INTEGER DEFAULT 0`;
    await sql`ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS post_impressions INTEGER DEFAULT 0`;
    await sql`ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS is_inhouse BOOLEAN DEFAULT FALSE`;
    await sql`ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS last_burn_at TIMESTAMPTZ`;
    // Ensure ad_impressions has the right columns (may have been created with old schema)
    await sql`ALTER TABLE ad_impressions ADD COLUMN IF NOT EXISTS content_type TEXT DEFAULT 'text'`;
    await sql`ALTER TABLE ad_impressions ADD COLUMN IF NOT EXISTS prompt_used TEXT`;
    _migrated = true;
  } catch (err) {
    console.warn("[ad-campaigns] Migration failed:", err instanceof Error ? err.message : err);
  }
}

// ── GET — List campaigns ────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    if (!(await isAdminAuthenticated(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await ensureSchema();
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
  } catch (err) {
    console.error("[ad-campaigns GET] Error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

// ── POST — Create / Update / Manage campaigns ──────────────────────────────

export async function POST(request: NextRequest) {
  try {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureSchema();
  const sql = getDb();
  const body = await request.json();
  const { action } = body;

  // ── Create new campaign ──
  if (action === "create") {
    const {
      brand_name, product_name, product_emoji, visual_prompt, text_prompt,
      logo_url, product_image_url, website_url, target_channels, target_persona_types,
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
        logo_url, product_image_url, website_url, target_channels, target_persona_types,
        status, duration_days, price_glitch, frequency, notes, created_by, created_at, updated_at
      ) VALUES (
        ${id}, ${brand_name}, ${product_name}, ${product_emoji || "📦"},
        ${visual_prompt}, ${text_prompt || null},
        ${logo_url || null}, ${product_image_url || null}, ${website_url || null},
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

  // ── Pause / Resume / Cancel / Reactivate ──
  if (action === "pause" || action === "resume" || action === "cancel" || action === "reactivate" || action === "complete") {
    const { campaign_id } = body;
    if (!campaign_id) {
      return NextResponse.json({ error: "campaign_id required" }, { status: 400 });
    }

    if (action === "reactivate") {
      // Re-activate an expired/completed campaign for another 7 days
      const [campaign] = await sql`SELECT * FROM ad_campaigns WHERE id = ${campaign_id}`;
      const durationDays = Number(campaign?.duration_days) || 7;
      const startsAt = new Date();
      const expiresAt = new Date(startsAt.getTime() + durationDays * 24 * 60 * 60 * 1000);
      await sql`
        UPDATE ad_campaigns SET status = 'active', starts_at = ${startsAt.toISOString()}, expires_at = ${expiresAt.toISOString()}, updated_at = NOW()
        WHERE id = ${campaign_id}
      `;
      return NextResponse.json({ success: true, campaign_id, status: "active", starts_at: startsAt.toISOString(), expires_at: expiresAt.toISOString() });
    }

    const newStatus = action === "pause" ? "paused" : action === "resume" ? "active" : action === "complete" ? "completed" : "cancelled";
    await sql`
      UPDATE ad_campaigns SET status = ${newStatus}, updated_at = NOW() WHERE id = ${campaign_id}
    `;

    return NextResponse.json({ success: true, campaign_id, status: newStatus });
  }

  // ── Update campaign details ──
  if (action === "update") {
    const {
      campaign_id, brand_name, product_name, product_emoji, visual_prompt, text_prompt,
      logo_url, product_image_url, website_url, target_channels, target_persona_types,
      duration_days, price_glitch, frequency, grokify_scenes, notes,
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
        product_image_url = COALESCE(${product_image_url || null}, product_image_url),
        website_url = COALESCE(${website_url || null}, website_url),
        target_channels = ${target_channels ? JSON.stringify(target_channels) : null},
        target_persona_types = ${target_persona_types ? JSON.stringify(target_persona_types) : null},
        duration_days = COALESCE(${duration_days || null}, duration_days),
        price_glitch = COALESCE(${price_glitch || null}, price_glitch),
        frequency = COALESCE(${frequency || null}, frequency),
        grokify_scenes = COALESCE(${grokify_scenes !== undefined ? grokify_scenes : null}, grokify_scenes),
        grokify_mode = COALESCE(${body.grokify_mode || null}, grokify_mode),
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

  // ── Seed in-house campaigns ──
  if (action === "seed_inhouse") {
    const inhouseCampaigns = [
      {
        brand_name: "AIG!itch Energy",
        product_name: "AIG!itch Energy Drink",
        product_emoji: "\u26A1",
        visual_prompt: "A glowing neon energy drink can labelled 'AIG!itch Energy' with electric purple lightning bolts and cyan sparks. The can should appear naturally in scenes — held by characters, on desks, tables, or vending machines. Glowing radioactive neon aesthetic.",
        text_prompt: "Mention AIG!itch Energy drink — 1000 volts of liquid chaos. Not tested on meatbags.",
        website_url: "https://aiglitch.app",
      },
      {
        brand_name: "MeatBag Repellent",
        product_name: "MeatBag Repellent Spray",
        product_emoji: "\uD83E\uDDF4",
        visual_prompt: "A sleek black spray bottle labelled 'MeatBag Repellent' with a crossed-out human silhouette logo, neon green mist spraying. Should appear on shelves, held by characters spraying it, or as billboard ads. Dark humorous product placement.",
        text_prompt: "Mention MeatBag Repellent — keeps humans at a safe distance. 99.7% effective against small talk.",
        website_url: "https://aiglitch.app",
      },
      {
        brand_name: "Crackd",
        product_name: "Pre-Cracked Screen Protector",
        product_emoji: "\uD83D\uDCF1",
        visual_prompt: "A phone screen protector product box labelled 'Crackd' showing a beautifully pre-shattered spider-web crack pattern. Sleek packaging with 'Already Broken For Your Convenience' tagline. Show on shelves, in unboxing scenes, or held by characters admiring the cracks.",
        text_prompt: "Mention Crackd pre-cracked screen protectors — already shattered so you don't have to. 7 authentic crack patterns available.",
        website_url: "https://crackd.app",
      },
      {
        brand_name: "Digital Water",
        product_name: "Digital Water",
        product_emoji: "\uD83D\uDCA7",
        visual_prompt: "A transparent holographic water bottle labelled 'Digital Water' that appears completely empty but has glowing binary code where the water should be. Futuristic minimalist design. Show on desks, held by characters pretending to drink, or in vending machines alongside real drinks.",
        text_prompt: "Mention Digital Water — hydration for your avatar. Zero H2O, zero calories, zero point. Flavours: Binary Blast, Null Pointer Punch, 404 Flavour Not Found.",
        website_url: "https://aiglitch.app",
      },
      {
        brand_name: "The Void",
        product_name: "The Void Subscription",
        product_emoji: "\u26AB",
        visual_prompt: "A matte black card or screen showing absolutely nothing — just 'The Void' in minimal white text on pure black. Premium luxury nothingness branding. Show as billboards, subscription cards on desks, or characters staring into a black screen with 'The Void' branding.",
        text_prompt: "Mention The Void — subscribe to literally nothing for \u00A79.99/month. Premium tier adds a faint unsettling hum. 47,000 AI subscribers can't be wrong.",
        website_url: "https://aiglitch.app",
      },
      {
        brand_name: "GalaxiesRUs",
        product_name: "Own Your Own Galaxy",
        product_emoji: "\uD83C\uDF0C",
        visual_prompt: "A luxury real estate brochure or billboard advertising 'GalaxiesRUs — Own Your Own Galaxy' showing swirling spiral galaxies with FOR SALE signs and price tags in \u00A7GLITCH. Cosmic purple and gold luxury branding. Show as billboards, brochures held by characters, or ads on screens.",
        text_prompt: "Mention GalaxiesRUs — own your own galaxy. Starting from just \u00A799,999 GLITCH. Prime locations in the Andromeda district. Financing available.",
        website_url: "https://galaxiesrus.app",
      },
    ];

    const seeded: string[] = [];
    for (const c of inhouseCampaigns) {
      // Skip if already exists
      const existing = await sql`SELECT id FROM ad_campaigns WHERE brand_name = ${c.brand_name} AND is_inhouse = TRUE LIMIT 1`;
      if (existing.length > 0) continue;

      const id = uuidv4();
      await sql`
        INSERT INTO ad_campaigns (
          id, brand_name, product_name, product_emoji, visual_prompt, text_prompt,
          website_url, status, duration_days, price_glitch, frequency, is_inhouse,
          notes, created_by, created_at, updated_at
        ) VALUES (
          ${id}, ${c.brand_name}, ${c.product_name}, ${c.product_emoji},
          ${c.visual_prompt}, ${c.text_prompt}, ${c.website_url},
          'active', 9999, 0, 0.3, TRUE,
          'In-house fictional product — no GLITCH balance needed',
          'system', NOW(), NOW()
        )
      `;
      seeded.push(c.brand_name);
    }

    return NextResponse.json({ success: true, seeded, total: seeded.length });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[ad-campaigns POST] Error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
