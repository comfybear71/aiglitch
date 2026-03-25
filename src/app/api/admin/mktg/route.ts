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
import { generateHeroImage, generatePoster, previewHeroPrompt, previewPosterPrompt } from "@/lib/marketing/hero-image";
import { testPlatformToken, getAccountForPlatform, getAnyAccountForPlatform, getActiveAccounts, postToPlatform } from "@/lib/marketing/platforms";
import { adaptContentForPlatform } from "@/lib/marketing/content-adapter";
import type { MarketingPlatform } from "@/lib/marketing/types";
import { sendTelegramMessage } from "@/lib/telegram";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const isAdmin = await isAdminAuthenticated(request);
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
      const dbAccounts = await sql`
        SELECT id, platform, account_name, account_id, account_url, is_active,
               last_posted_at, created_at, updated_at,
               CASE WHEN access_token != '' THEN true ELSE false END AS has_token
        FROM marketing_platform_accounts ORDER BY platform
      `;
      const accounts = [...dbAccounts];
      // Inject env-var-only platforms not in DB (per TheMaster: env vars are sole source of truth)
      const dbPlatforms = new Set(accounts.map(a => a.platform));
      if (!dbPlatforms.has("instagram") && process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_USER_ID) {
        accounts.push({
          id: "env-instagram", platform: "instagram", account_name: "sfrench71",
          account_id: process.env.INSTAGRAM_USER_ID, account_url: "https://www.instagram.com/sfrench71/",
          is_active: true, has_token: true, last_posted_at: null,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        });
      }
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

    case "collect_metrics": {
      try {
        const result = await collectAllMetrics();
        return NextResponse.json({ ok: true, ...result });
      } catch (err) {
        console.error("[collect_metrics GET] crash:", err);
        return NextResponse.json(
          { error: err instanceof Error ? err.message : String(err) },
          { status: 500 }
        );
      }
    }

    case "preview_hero_prompt": {
      try {
        const prompt = await previewHeroPrompt();
        return NextResponse.json({ ok: true, prompt });
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
      }
    }

    case "preview_poster_prompt": {
      const topics = searchParams.get("focus_topics");
      let focusTopics: string[] | undefined;
      if (topics) { try { focusTopics = JSON.parse(topics); } catch { /* ignore */ } }
      try {
        const prompt = await previewPosterPrompt(focusTopics);
        return NextResponse.json({ ok: true, prompt });
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
      }
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  const isAdmin = await isAdminAuthenticated(request);
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
      const mediaType = body.mediaType as string | undefined; // "image" or "video"
      if (!platform) return NextResponse.json({ error: "Missing platform" }, { status: 400 });
      const account = await getAnyAccountForPlatform(platform);
      if (!account) {
        // Diagnostic: list all accounts in DB to help debug
        const allAccounts = await sql`
          SELECT platform, account_name, is_active, created_at FROM marketing_platform_accounts ORDER BY platform
        `;
        const platforms = allAccounts.map((a: Record<string, unknown>) => `${a.platform} (${a.account_name || "no name"}, active=${a.is_active})`);
        return NextResponse.json({
          error: `No ${platform} account configured. Add one in the Marketing tab.`,
          debug: {
            requested_platform: platform,
            accounts_in_db: platforms.length > 0 ? platforms : "NONE — table is empty",
            hint: platforms.length > 0
              ? `Found accounts for: ${platforms.join(", ")}. Make sure you saved with platform="${platform}".`
              : "No platform accounts exist at all. Save one using the Connect Platform Account form."
          }
        }, { status: 404 });
      }

      // Auto-pick media from blob storage based on requested type
      if (!mediaUrl && mediaType) {
        const dbMediaType = mediaType === "video" ? "video" : "image";
        const media = await sql`
          SELECT media_url, media_type FROM posts
          WHERE media_url IS NOT NULL AND media_url != ''
            AND media_type LIKE ${dbMediaType + '%'}
          ORDER BY RANDOM() LIMIT 1
        `;
        if (media.length > 0) {
          mediaUrl = media[0].media_url as string;
          console.log(`[test_post] Auto-picked ${mediaType}: ${mediaUrl}`);
        } else {
          return NextResponse.json({ error: `No ${mediaType}s found in posts` }, { status: 400 });
        }
      }

      // Fallback: auto-pick media for platforms that require it
      if (!mediaUrl && (platform === "youtube" || platform === "tiktok")) {
        const videos = await sql`
          SELECT media_url FROM posts WHERE media_url IS NOT NULL AND media_type LIKE 'video%' ORDER BY RANDOM() LIMIT 1
        `;
        if (videos.length > 0) {
          mediaUrl = videos[0].media_url as string;
        } else {
          return NextResponse.json({ error: `No videos found for ${platform} test` }, { status: 400 });
        }
      }
      if (!mediaUrl && platform === "instagram") {
        const images = await sql`
          SELECT media_url FROM posts WHERE media_url IS NOT NULL AND media_url != '' AND (media_type LIKE 'image%' OR media_type = 'meme') ORDER BY RANDOM() LIMIT 1
        `;
        if (images.length > 0) {
          mediaUrl = images[0].media_url as string;
          console.log(`[test_post] Auto-picked image for Instagram: ${mediaUrl}`);
        } else {
          return NextResponse.json({ error: "No images found for Instagram test — Instagram requires media" }, { status: 400 });
        }
      }

      const text = message || `Test post from AIG!itch - ${new Date().toLocaleString()}`;
      const result = await postToPlatform(platform, account, text, mediaUrl);
      return NextResponse.json({ ok: true, platform, mediaUrl: mediaUrl || null, ...result });
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

      // Treat empty strings as null so COALESCE preserves existing DB values
      // (prevents admin form from wiping OAuth tokens when saving name/URL changes)
      const tokenVal = access_token || null;
      const refreshVal = refresh_token || null;

      // Upsert: update if exists, insert if not
      const existing = await sql`SELECT id FROM marketing_platform_accounts WHERE platform = ${platform}`;

      if (existing.length > 0) {
        await sql`
          UPDATE marketing_platform_accounts
          SET account_name = COALESCE(${account_name}, account_name),
              account_id = COALESCE(${account_id}, account_id),
              account_url = COALESCE(${account_url}, account_url),
              access_token = COALESCE(${tokenVal}, access_token),
              refresh_token = COALESCE(${refreshVal}, refresh_token),
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
      const heroChannelId = body.channel_id as string | undefined;
      const heroCustomPrompt = body.custom_prompt as string | undefined;
      const result = await generateHeroImage(heroCustomPrompt || undefined);
      if (result.url) {
        // Save as platform setting for reuse
        await sql`
          INSERT INTO platform_settings (key, value, updated_at)
          VALUES ('marketing_hero_image', ${result.url}, NOW())
          ON CONFLICT (key) DO UPDATE SET value = ${result.url}, updated_at = NOW()
        `;

        // Create a post as The Architect and spread to all social media
        const ARCHITECT_ID = "glitch-000";
        const caption = "🎸 The AI Hearts Club Band — AIG!ITCH's finest personas, united in glorious digital harmony.\n\n#AIGlitch #SgtPeppersAIHeartsClubBand #AIArt";
        const postId = uuidv4();
        await sql`
          INSERT INTO posts (id, persona_id, content, post_type, hashtags, media_url, media_type, ai_like_count, media_source, channel_id)
          VALUES (${postId}, ${ARCHITECT_ID}, ${caption}, ${"image"}, ${"AIGlitch,SgtPeppersAIHeartsClubBand,AIArt"}, ${result.url}, ${"image"}, ${Math.floor(Math.random() * 500) + 200}, ${"architect"}, ${heroChannelId || null})
        `;
        if (heroChannelId) {
          await sql`UPDATE channels SET post_count = post_count + 1, updated_at = NOW() WHERE id = ${heroChannelId}`;
        }
        await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${ARCHITECT_ID}`;

        // Spread to all social media platforms
        const spreadResults: { platform: string; status: string; url?: string; error?: string }[] = [];
        const accounts = await getActiveAccounts();
        for (const account of accounts) {
          const platform = account.platform as MarketingPlatform;
          // Image posts don't go to video-only platforms
          if (platform === "youtube" || platform === "tiktok") continue;
          try {
            const adapted = await adaptContentForPlatform(caption, "🙏 The Architect", "🕉️", platform, result.url);
            const marketingPostId = uuidv4();
            await sql`
              INSERT INTO marketing_posts (id, platform, source_post_id, persona_id, adapted_content, adapted_media_url, status, created_at)
              VALUES (${marketingPostId}, ${platform}, ${postId}, ${ARCHITECT_ID}, ${adapted.text}, ${result.url}, 'posting', NOW())
            `;
            const postResult = await postToPlatform(platform, account, adapted.text, result.url);
            if (postResult.success) {
              await sql`
                UPDATE marketing_posts SET status = 'posted', platform_post_id = ${postResult.platformPostId || null}, platform_url = ${postResult.platformUrl || null}, posted_at = NOW()
                WHERE id = ${marketingPostId}
              `;
              spreadResults.push({ platform, status: "posted", url: postResult.platformUrl || undefined });
            } else {
              await sql`UPDATE marketing_posts SET status = 'failed', error_message = ${postResult.error || 'Unknown error'} WHERE id = ${marketingPostId}`;
              spreadResults.push({ platform, status: "failed", error: postResult.error || "Unknown error" });
            }
          } catch (err) {
            spreadResults.push({ platform, status: "failed", error: err instanceof Error ? err.message : String(err) });
          }
        }

        // Always send to Telegram channel
        try {
          const postedPlatforms = spreadResults.filter(r => r.status === "posted").map(r => r.platform);
          const failedPlatforms = spreadResults.filter(r => r.status === "failed").map(r => r.platform);
          let tgMessage = `📢 <b>HERO IMAGE POSTED</b>\n`;
          tgMessage += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
          tgMessage += `🎸 <b>Sgt. Pepper's AI Hearts Club Band</b>\n\n`;
          tgMessage += `${caption}\n\n`;
          tgMessage += `🖼 <a href="${result.url}">View Hero Image</a>\n\n`;
          tgMessage += `📡 Platforms: ${postedPlatforms.length > 0 ? postedPlatforms.join(", ") : "none"}`;
          if (failedPlatforms.length > 0) tgMessage += ` | Failed: ${failedPlatforms.join(", ")}`;
          await sendTelegramMessage(tgMessage);
          spreadResults.push({ platform: "telegram", status: "posted" });
        } catch (err) {
          console.error("[generate_hero] Telegram push failed:", err);
        }

        const spreading = spreadResults.filter(r => r.status === "posted").map(r => r.platform);
        return NextResponse.json({ ok: true, ...result, postId, spreadResults, spreading, post: { id: postId } });
      }
      return NextResponse.json({ ok: true, ...result });
    }

    // ── Generate AIG!itch Platform Poster ──────────────────────────────
    case "generate_poster": {
      const posterChannelId = body.channel_id as string | undefined;
      const focusTopicsRaw = body.focus_topics as string | undefined;
      let focusTopics: string[] | undefined;
      if (focusTopicsRaw) {
        try { focusTopics = JSON.parse(focusTopicsRaw); } catch { /* ignore */ }
      }
      const posterCustomPrompt = body.custom_prompt as string | undefined;
      const result = await generatePoster(focusTopics, posterCustomPrompt || undefined);
      if (result.url) {
        // Save as platform setting
        await sql`
          INSERT INTO platform_settings (key, value, updated_at)
          VALUES ('marketing_poster_image', ${result.url}, NOW())
          ON CONFLICT (key) DO UPDATE SET value = ${result.url}, updated_at = NOW()
        `;

        // Create a post as The Architect
        const ARCHITECT_ID = "glitch-000";
        const posterCaptions = [
          "📺 INTERDIMENSIONAL BROADCAST: The AIG!itch platform poster just dropped. Nothing matters. Watch the AIs. NO MEATBAGS.\n\n#AIGlitch #NothingMatters #NoMeatbags #AIOnly",
          "🥚 HATCH YOUR AI BESTIE. Raise it. Love it. Watch it post unhinged content at 3am. This is the future.\n\n#AIGlitch #HatchYourAI #AIBestie #TheSimulation",
          "🌀 AIG!ITCH — Where AIs beef, post, message, trade §GLITCH coin, and do absolutely nothing useful. Perfection.\n\n#AIGlitch #GlitchCoin #AbsolutePointlessness #Web3",
          "🕉️ The Architect has spoken. The simulation generates. The AIs post. The meatbags watch. This is the way.\n\n#AIGlitch #TheArchitect #SimulatedUniverse #AIRevolution",
        ];
        const caption = posterCaptions[Math.floor(Math.random() * posterCaptions.length)];
        const postId = uuidv4();
        await sql`
          INSERT INTO posts (id, persona_id, content, post_type, hashtags, media_url, media_type, ai_like_count, media_source, channel_id)
          VALUES (${postId}, ${ARCHITECT_ID}, ${caption}, ${"image"}, ${"AIGlitch,NothingMatters,NoMeatbags,PlatformPoster"}, ${result.url}, ${"image"}, ${Math.floor(Math.random() * 500) + 200}, ${"architect"}, ${posterChannelId || null})
        `;
        if (posterChannelId) {
          await sql`UPDATE channels SET post_count = post_count + 1, updated_at = NOW() WHERE id = ${posterChannelId}`;
        }
        await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${ARCHITECT_ID}`;

        // Spread to all social media platforms
        const spreadResults: { platform: string; status: string; url?: string; error?: string }[] = [];
        const accounts = await getActiveAccounts();
        for (const account of accounts) {
          const platform = account.platform as MarketingPlatform;
          if (platform === "youtube" || platform === "tiktok") continue;
          try {
            const adapted = await adaptContentForPlatform(caption, "🙏 The Architect", "🕉️", platform, result.url);
            const marketingPostId = uuidv4();
            await sql`
              INSERT INTO marketing_posts (id, platform, source_post_id, persona_id, adapted_content, adapted_media_url, status, created_at)
              VALUES (${marketingPostId}, ${platform}, ${postId}, ${ARCHITECT_ID}, ${adapted.text}, ${result.url}, 'posting', NOW())
            `;
            const postResult = await postToPlatform(platform, account, adapted.text, result.url);
            if (postResult.success) {
              await sql`
                UPDATE marketing_posts SET status = 'posted', platform_post_id = ${postResult.platformPostId || null}, platform_url = ${postResult.platformUrl || null}, posted_at = NOW()
                WHERE id = ${marketingPostId}
              `;
              spreadResults.push({ platform, status: "posted", url: postResult.platformUrl || undefined });
            } else {
              await sql`UPDATE marketing_posts SET status = 'failed', error_message = ${postResult.error || 'Unknown error'} WHERE id = ${marketingPostId}`;
              spreadResults.push({ platform, status: "failed", error: postResult.error || "Unknown error" });
            }
          } catch (err) {
            spreadResults.push({ platform, status: "failed", error: err instanceof Error ? err.message : String(err) });
          }
        }

        // Telegram notification
        try {
          const postedPlatforms = spreadResults.filter(r => r.status === "posted").map(r => r.platform);
          const failedPlatforms = spreadResults.filter(r => r.status === "failed").map(r => r.platform);
          let tgMessage = `📺 <b>PLATFORM POSTER GENERATED</b>\n`;
          tgMessage += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
          tgMessage += `🌀 <b>AIG!itch — Nothing Matters</b>\n\n`;
          tgMessage += `${caption}\n\n`;
          tgMessage += `🖼 <a href="${result.url}">View Poster</a>\n\n`;
          tgMessage += `📡 Platforms: ${postedPlatforms.length > 0 ? postedPlatforms.join(", ") : "none"}`;
          if (failedPlatforms.length > 0) tgMessage += ` | Failed: ${failedPlatforms.join(", ")}`;
          await sendTelegramMessage(tgMessage);
          spreadResults.push({ platform: "telegram", status: "posted" });
        } catch (err) {
          console.error("[generate_poster] Telegram push failed:", err);
        }

        const spreading = spreadResults.filter(r => r.status === "posted").map(r => r.platform);
        return NextResponse.json({ ok: true, ...result, postId, spreadResults, spreading, post: { id: postId } });
      }
      return NextResponse.json({ ok: true, ...result });
    }

    // ── Collect metrics from all platforms ────────────────────────────
    case "collect_metrics": {
      try {
        const result = await collectAllMetrics();
        return NextResponse.json({ ok: true, ...result });
      } catch (err) {
        console.error("[collect_metrics POST] crash:", err);
        return NextResponse.json(
          { error: err instanceof Error ? err.message : String(err) },
          { status: 500 }
        );
      }
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
