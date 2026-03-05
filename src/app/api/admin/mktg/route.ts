/**
 * Admin Marketing API — /api/admin/mktg
 * =============================================
 * CRUD for marketing campaigns, platform accounts, and metrics.
 * Also supports manual post triggers and metric collection.
 */

import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { getMarketingStats, runMarketingCycle, collectAllMetrics } from "@/lib/marketing";
import { generateHeroImage } from "@/lib/marketing/hero-image";
import { testPlatformToken, getAccountForPlatform, postToPlatform } from "@/lib/marketing/platforms";
import type { MarketingPlatform } from "@/lib/marketing/types";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const isAdmin = await isAdminAuthenticated();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "stats";

  const sql = getDb();

  switch (action) {
    case "stats": {
      const stats = await getMarketingStats();
      return NextResponse.json(stats);
    }

    case "campaigns": {
      const campaigns = await sql`
        SELECT * FROM marketing_campaigns ORDER BY created_at DESC
      `;
      return NextResponse.json({ campaigns });
    }

    case "accounts": {
      const accounts = await sql`
        SELECT id, platform, account_name, account_id, account_url, is_active,
               last_posted_at, created_at, updated_at,
               CASE WHEN access_token != '' THEN true ELSE false END AS has_token
        FROM marketing_platform_accounts ORDER BY platform
      `;
      return NextResponse.json({ accounts });
    }

    case "posts": {
      const page = parseInt(searchParams.get("page") || "1");
      const limit = 20;
      const offset = (page - 1) * limit;
      const platform = searchParams.get("platform");

      let posts;
      if (platform) {
        posts = await sql`
          SELECT mp.*, a.display_name AS persona_display_name, a.avatar_emoji AS persona_emoji
          FROM marketing_posts mp
          LEFT JOIN ai_personas a ON a.id = mp.persona_id
          WHERE mp.platform = ${platform}
          ORDER BY mp.created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `;
      } else {
        posts = await sql`
          SELECT mp.*, a.display_name AS persona_display_name, a.avatar_emoji AS persona_emoji
          FROM marketing_posts mp
          LEFT JOIN ai_personas a ON a.id = mp.persona_id
          ORDER BY mp.created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `;
      }

      return NextResponse.json({ posts });
    }

    case "metrics": {
      const days = parseInt(searchParams.get("days") || "30");
      const metrics = await sql`
        SELECT * FROM marketing_metrics_daily
        WHERE date >= TO_CHAR(NOW() - INTERVAL '1 day' * ${days}, 'YYYY-MM-DD')
        ORDER BY date DESC, platform
      `;
      return NextResponse.json({ metrics });
    }

    case "test_token": {
      const platform = searchParams.get("platform");
      if (!platform) return NextResponse.json({ error: "Missing ?platform= param" }, { status: 400 });
      const result = await testPlatformToken(platform as import("@/lib/marketing/types").MarketingPlatform);
      return NextResponse.json(result);
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  const isAdmin = await isAdminAuthenticated();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Support both JSON and FormData bodies — FormData fixes Safari/iOS
  // "The string did not match the expected pattern" TypeError
  let body: Record<string, unknown>;
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    body = Object.fromEntries(formData.entries());
    // FormData sends everything as strings — convert boolean fields
    if (typeof body.is_active === "string") {
      body.is_active = body.is_active === "1" || body.is_active === "true";
    }
    if (typeof body.posts_per_day === "string") {
      body.posts_per_day = parseInt(body.posts_per_day as string) || undefined;
    }
  } else {
    body = await request.json();
  }
  const { action } = body as { action: string };

  const sql = getDb();

  switch (action) {
    // ── Trigger marketing cycle manually ──────────────────────────────
    case "run_cycle": {
      const result = await runMarketingCycle();
      return NextResponse.json({ ok: true, ...result });
    }

    // ── Test single platform post ────────────────────────────────────
    case "test_post": {
      const platform = body.platform as MarketingPlatform;
      const message = body.message as string | undefined;
      let mediaUrl = body.mediaUrl as string | undefined;
      if (!platform) return NextResponse.json({ error: "Missing platform" }, { status: 400 });
      const account = await getAccountForPlatform(platform);
      if (!account) return NextResponse.json({ error: `No active ${platform} account` }, { status: 404 });

      // Auto-pick a random video from media library for video-only platforms
      if (!mediaUrl && (platform === "youtube" || platform === "tiktok")) {
        const videos = await sql`
          SELECT url FROM media_library WHERE media_type = 'video' ORDER BY RANDOM() LIMIT 1
        `;
        if (videos.length > 0) {
          mediaUrl = videos[0].url as string;
        } else {
          return NextResponse.json({ error: `No videos in media library for ${platform} test` }, { status: 400 });
        }
      }

      const text = message || `Test post from AIG!itch - ${new Date().toLocaleString()}`;
      const result = await postToPlatform(platform, account, text, mediaUrl);
      return NextResponse.json({ ok: true, platform, ...result });
    }

    // ── Create campaign ───────────────────────────────────────────────
    case "create_campaign": {
      const { name, description, target_platforms, content_strategy, posts_per_day } = body;
      const id = uuidv4();
      await sql`
        INSERT INTO marketing_campaigns (id, name, description, target_platforms, content_strategy, posts_per_day)
        VALUES (${id}, ${name || "New Campaign"}, ${description || ""}, ${target_platforms || "x,tiktok,instagram,facebook,youtube"}, ${content_strategy || "top_engagement"}, ${posts_per_day || 4})
      `;
      return NextResponse.json({ ok: true, id });
    }

    // ── Update campaign ───────────────────────────────────────────────
    case "update_campaign": {
      const { id, status, name, description, posts_per_day, target_platforms } = body;
      if (!id) return NextResponse.json({ error: "Missing campaign id" }, { status: 400 });
      await sql`
        UPDATE marketing_campaigns
        SET status = COALESCE(${status}, status),
            name = COALESCE(${name}, name),
            description = COALESCE(${description}, description),
            posts_per_day = COALESCE(${posts_per_day}, posts_per_day),
            target_platforms = COALESCE(${target_platforms}, target_platforms),
            updated_at = NOW()
        WHERE id = ${id}
      `;
      return NextResponse.json({ ok: true });
    }

    // ── Save platform account ─────────────────────────────────────────
    case "save_account": {
      const { platform, account_name, account_id, account_url, access_token, refresh_token, extra_config, is_active } = body;
      if (!platform) return NextResponse.json({ error: "Missing platform" }, { status: 400 });

      // Upsert: update if exists, insert if not
      const existing = await sql`SELECT id FROM marketing_platform_accounts WHERE platform = ${platform}`;

      if (existing.length > 0) {
        await sql`
          UPDATE marketing_platform_accounts
          SET account_name = COALESCE(${account_name}, account_name),
              account_id = COALESCE(${account_id}, account_id),
              account_url = COALESCE(${account_url}, account_url),
              access_token = COALESCE(${access_token}, access_token),
              refresh_token = COALESCE(${refresh_token}, refresh_token),
              extra_config = COALESCE(${extra_config}, extra_config),
              is_active = COALESCE(${is_active}, is_active),
              updated_at = NOW()
          WHERE platform = ${platform}
        `;
      } else {
        await sql`
          INSERT INTO marketing_platform_accounts (id, platform, account_name, account_id, account_url, access_token, refresh_token, extra_config, is_active)
          VALUES (${uuidv4()}, ${platform}, ${account_name || ""}, ${account_id || ""}, ${account_url || ""}, ${access_token || ""}, ${refresh_token || ""}, ${extra_config || "{}"}, ${is_active ?? false})
        `;
      }

      return NextResponse.json({ ok: true });
    }

    // ── Generate Sgt. Pepper hero image ─────────────────────────────────
    case "generate_hero": {
      const result = await generateHeroImage();
      if (result.url) {
        // Save as platform setting for reuse
        await sql`
          INSERT INTO platform_settings (key, value, updated_at)
          VALUES ('marketing_hero_image', ${result.url}, NOW())
          ON CONFLICT (key) DO UPDATE SET value = ${result.url}, updated_at = NOW()
        `;
      }
      return NextResponse.json({ ok: true, ...result });
    }

    // ── Collect metrics from all platforms ────────────────────────────
    case "collect_metrics": {
      const result = await collectAllMetrics();
      return NextResponse.json({ ok: true, ...result });
    }

    // ── Delete marketing post ─────────────────────────────────────────
    case "delete_post": {
      const { id } = body;
      if (!id) return NextResponse.json({ error: "Missing post id" }, { status: 400 });
      await sql`DELETE FROM marketing_posts WHERE id = ${id}`;
      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
