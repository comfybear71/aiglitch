import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { CHANNEL_DEFAULTS, CHANNELS } from "@/lib/bible/constants";
import { CHANNEL_TITLE_PREFIX } from "@/lib/content/director-movies";
import { v4 as uuidv4 } from "uuid";

/**
 * Inline channel sync — ensures every channel defined in CHANNELS constant
 * exists in the DB. Runs on every admin channels page load because the
 * safeMigrate approach is too fragile (cached per Lambda, label-gated, etc.).
 * Uses ON CONFLICT DO UPDATE so it's safe and idempotent — existing channels
 * just get their name/description/rules refreshed from the latest constants.
 */
async function syncChannelsFromConstants(): Promise<void> {
  const sql = getDb();
  for (const ch of CHANNELS) {
    try {
      await sql`
        INSERT INTO channels (id, slug, name, description, emoji, genre, is_reserved, is_music_channel, content_rules, schedule, is_active, sort_order)
        VALUES (${ch.id}, ${ch.slug}, ${ch.name}, ${ch.description}, ${ch.emoji},
                ${ch.genre || "drama"}, ${ch.isReserved || false}, ${ch.isMusicChannel || false},
                ${JSON.stringify(ch.contentRules)}, ${JSON.stringify(ch.schedule)}, TRUE, ${CHANNELS.indexOf(ch)})
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          emoji = EXCLUDED.emoji,
          genre = EXCLUDED.genre,
          is_reserved = EXCLUDED.is_reserved,
          is_music_channel = EXCLUDED.is_music_channel,
          content_rules = EXCLUDED.content_rules,
          schedule = EXCLUDED.schedule,
          sort_order = EXCLUDED.sort_order
      `;
    } catch (err) {
      // Log per-channel so one failure doesn't block the rest
      console.error(`[admin/channels] sync failed for ${ch.id}:`, err instanceof Error ? err.message : err);
    }
  }
}

/**
 * GET /api/admin/channels — List all channels (including inactive) with full details
 */
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sql = getDb();
    await ensureDbReady();

    // Sync all channels from CHANNELS constant so new channels appear
    // immediately after deploy without waiting for safeMigrate cold starts.
    await syncChannelsFromConstants();

    // Ensure is_private column exists
    await sql`ALTER TABLE channels ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE`.catch(() => {});

    // Lost videos — video posts with no channel_id
    const queryAction = request.nextUrl.searchParams.get("action");
    if (queryAction === "lost_videos") {
      const lost = await sql`
        SELECT id, LEFT(content, 120) as content, media_url, persona_id, created_at
        FROM posts
        WHERE channel_id IS NULL
        AND media_type = 'video'
        AND media_url IS NOT NULL AND media_url != ''
        ORDER BY created_at DESC
        LIMIT 50
      `;
      return NextResponse.json({ lost });
    }

    const channels = await sql`
      SELECT c.*,
        (SELECT COUNT(*)::int FROM channel_personas cp WHERE cp.channel_id = c.id) as persona_count,
        (SELECT COUNT(*)::int FROM posts p WHERE p.channel_id = c.id AND p.is_reply_to IS NULL) as actual_post_count
      FROM channels c
      ORDER BY c.sort_order ASC, c.created_at ASC
    `;

    // Get all channel-persona assignments
    const assignments = await sql`
      SELECT cp.channel_id, cp.persona_id, cp.role,
        a.username, a.display_name, a.avatar_emoji
      FROM channel_personas cp
      JOIN ai_personas a ON cp.persona_id = a.id
      ORDER BY cp.role ASC, a.display_name ASC
    `;

    const personasByChannel = new Map<string, Array<{ persona_id: string; username: string; display_name: string; avatar_emoji: string; role: string }>>();
    for (const a of assignments) {
      const list = personasByChannel.get(a.channel_id as string) || [];
      list.push({
        persona_id: a.persona_id as string,
        username: a.username as string,
        display_name: a.display_name as string,
        avatar_emoji: a.avatar_emoji as string,
        role: a.role as string,
      });
      personasByChannel.set(a.channel_id as string, list);
    }

    const result = channels.map(c => ({
      ...c,
      content_rules: typeof c.content_rules === "string" ? JSON.parse(c.content_rules as string) : c.content_rules,
      schedule: typeof c.schedule === "string" ? JSON.parse(c.schedule as string) : c.schedule,
      // Generation config fields — explicit defaults so they're always present
      show_title_page: c.show_title_page ?? CHANNEL_DEFAULTS.showTitlePage,
      show_director: c.show_director ?? CHANNEL_DEFAULTS.showDirector,
      show_credits: c.show_credits ?? CHANNEL_DEFAULTS.showCredits,
      scene_count: c.scene_count ?? null,
      scene_duration: c.scene_duration ?? CHANNEL_DEFAULTS.sceneDuration,
      default_director: c.default_director ?? null,
      generation_genre: c.generation_genre ?? null,
      short_clip_mode: c.short_clip_mode ?? false,
      is_music_channel: c.is_music_channel ?? false,
      auto_publish_to_feed: c.auto_publish_to_feed ?? true,
      personas: personasByChannel.get(c.id as string) || [],
    }));

    return NextResponse.json({ channels: result });
  } catch (err) {
    console.error("Admin channels GET error:", err);
    return NextResponse.json({ error: "Failed to fetch channels" }, { status: 500 });
  }
}

/**
 * POST /api/admin/channels — Create or update a channel
 * Body: { id?, slug, name, description, emoji, content_rules, schedule, is_active, sort_order, persona_ids, host_ids }
 */
export async function POST(request: NextRequest) {
  try {
    const sql = getDb();
    await ensureDbReady();
    const body = await request.json();
    const {
      id, slug, name, description, emoji, genre, is_reserved, is_private,
      content_rules, schedule, is_active, sort_order, persona_ids, host_ids,
      // Channel editor config fields
      show_title_page, show_director, show_credits, scene_count, scene_duration,
      default_director, generation_genre, short_clip_mode, is_music_channel, auto_publish_to_feed,
    } = body;

    if (!slug || !name) {
      return NextResponse.json({ error: "slug and name are required" }, { status: 400 });
    }

    const channelId = id || `ch-${slug}`;
    const contentRulesStr = typeof content_rules === "string" ? content_rules : JSON.stringify(content_rules || {});
    const scheduleStr = typeof schedule === "string" ? schedule : JSON.stringify(schedule || {});

    // Ensure is_private column exists (may not on first deploy)
    await sql`ALTER TABLE channels ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE`.catch(() => {});

    await sql`
      INSERT INTO channels (
        id, slug, name, description, emoji, genre, is_reserved, is_private,
        content_rules, schedule, is_active, sort_order,
        show_title_page, show_director, show_credits, scene_count, scene_duration,
        default_director, generation_genre, short_clip_mode, is_music_channel, auto_publish_to_feed,
        updated_at
      )
      VALUES (
        ${channelId}, ${slug}, ${name}, ${description || ""}, ${emoji || "📺"},
        ${genre || "drama"}, ${is_reserved === true}, ${is_private === true},
        ${contentRulesStr}, ${scheduleStr}, ${is_active !== false}, ${sort_order || 0},
        ${show_title_page === true}, ${show_director === true}, ${show_credits === true},
        ${scene_count != null ? Number(scene_count) : null},
        ${scene_duration ? Number(scene_duration) : CHANNEL_DEFAULTS.sceneDuration},
        ${default_director || null}, ${generation_genre || null},
        ${short_clip_mode === true}, ${is_music_channel === true}, ${auto_publish_to_feed !== false},
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        slug = ${slug},
        name = ${name},
        description = ${description || ""},
        emoji = ${emoji || "📺"},
        genre = ${genre || "drama"},
        is_reserved = ${is_reserved === true},
        is_private = ${is_private === true},
        content_rules = ${contentRulesStr},
        schedule = ${scheduleStr},
        is_active = ${is_active !== false},
        sort_order = ${sort_order || 0},
        show_title_page = ${show_title_page === true},
        show_director = ${show_director === true},
        show_credits = ${show_credits === true},
        scene_count = ${scene_count != null ? Number(scene_count) : null},
        scene_duration = ${scene_duration ? Number(scene_duration) : CHANNEL_DEFAULTS.sceneDuration},
        default_director = ${default_director || null},
        generation_genre = ${generation_genre || null},
        short_clip_mode = ${short_clip_mode === true},
        is_music_channel = ${is_music_channel === true},
        auto_publish_to_feed = ${auto_publish_to_feed !== false},
        updated_at = NOW()
    `;

    // Update persona assignments if provided
    if (persona_ids && Array.isArray(persona_ids)) {
      // Remove existing assignments
      await sql`DELETE FROM channel_personas WHERE channel_id = ${channelId}`;

      // Add new ones
      const hostSet = new Set(host_ids || []);
      for (const personaId of persona_ids) {
        const role = hostSet.has(personaId) ? "host" : "regular";
        const cpId = uuidv4();
        await sql`
          INSERT INTO channel_personas (id, channel_id, persona_id, role)
          VALUES (${cpId}, ${channelId}, ${personaId}, ${role})
          ON CONFLICT (channel_id, persona_id) DO UPDATE SET role = ${role}
        `;
      }
    }

    return NextResponse.json({ ok: true, channelId });
  } catch (err) {
    console.error("Admin channels POST error:", err);
    return NextResponse.json({ error: "Failed to save channel" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/channels — Move posts between channels
 * Body: { post_ids: string[], target_channel_id: string }
 */
export async function PATCH(request: NextRequest) {
  try {
    const sql = getDb();
    const body = await request.json();
    const { post_ids, target_channel_id, action } = body;

    // Fix all existing channel content: set persona to Architect + add prefix
    if (action === "fix_channel_ownership") {
      const ARCHITECT_ID = "glitch-000";
      const allChannels = await sql`SELECT id, name FROM channels WHERE is_active = TRUE`;
      let totalFixed = 0;

      for (const ch of allChannels) {
        const channelName = ch.name as string;
        const channelId = ch.id as string;

        // Update all posts in this channel to be by The Architect
        const ownershipResult = await sql`
          UPDATE posts SET persona_id = ${ARCHITECT_ID}
          WHERE channel_id = ${channelId} AND persona_id != ${ARCHITECT_ID}
          RETURNING id
        `;

        // Fix ALL prefixes: strip any wrong prefix, then add correct one
        // Use canonical prefix from CHANNEL_TITLE_PREFIX (single source of truth)
        const canonicalName = CHANNEL_TITLE_PREFIX[channelId] || channelName;
        const prefix = `🎬 ${canonicalName} - `;

        // Step 1: Strip ALL known prefixes and emojis from posts that DON'T have the correct prefix
        // Handles: "🎬 X - ", "X - 🎬 ", "X - ", "🎬 ", "AIG!itch Studios - " etc
        await sql`
          UPDATE posts SET content = regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(content, E'^🎬\\s*', ''),
                E'^AIG!itch Studios\\s*[-–—]\\s*', ''
              ),
              E'^' || ${canonicalName} || E'\\s*[-–—]\\s*', ''
            ),
            E'^🎬\\s*', ''
          )
          WHERE channel_id = ${channelId}
          AND content NOT LIKE ${prefix + '%'}
        `;

        // Step 2: Add correct prefix to anything that still doesn't have it
        await sql`
          UPDATE posts SET content = ${prefix} || content
          WHERE channel_id = ${channelId}
          AND content NOT LIKE ${prefix + '%'}
        `;

        totalFixed += ownershipResult.length;
      }

      // Also remove Breaking News / GNN content from Studios
      const movedToGnn = await sql`
        UPDATE posts SET channel_id = 'ch-gnn'
        WHERE channel_id = 'ch-aiglitch-studios'
        AND (content ILIKE '%breaking%news%' OR content ILIKE '%breaking:%' OR content ILIKE '%glitched news%' OR content ILIKE '%headlines live%' OR content ILIKE '%GNN%')
        RETURNING id
      `;

      // Update all channel post counts
      await sql`UPDATE channels SET post_count = (SELECT COUNT(*)::int FROM posts WHERE channel_id = channels.id AND is_reply_to IS NULL), updated_at = NOW()`;

      console.log(`[channels] Fixed ownership: ${totalFixed} posts → Architect, ${movedToGnn.length} news posts → GNN`);
      return NextResponse.json({
        ok: true,
        totalFixed,
        movedToGnn: movedToGnn.length,
        message: `Fixed ${totalFixed} posts to Architect. Moved ${movedToGnn.length} news posts from Studios to GNN.`,
      });
    }

    // Flush non-video content from ALL channels
    if (action === "flush_non_video") {
      const result = await sql`
        UPDATE posts SET channel_id = NULL
        WHERE channel_id IS NOT NULL
        AND (media_type != 'video' OR media_type IS NULL OR media_url IS NULL OR media_url = '')
        RETURNING id, channel_id
      `;
      const flushed = result.length;

      // Update all channel post counts
      await sql`
        UPDATE channels SET
          post_count = (SELECT COUNT(*)::int FROM posts WHERE channel_id = channels.id AND is_reply_to IS NULL),
          updated_at = NOW()
      `;

      console.log(`[channels] Flushed ${flushed} non-video posts from all channels`);
      return NextResponse.json({ ok: true, flushed, message: `Removed ${flushed} non-video posts from all channels` });
    }

    // Undo the last clean — restore ALL posts that lost their channel_id recently
    if (action === "undo_clean") {
      // Restore posts by their media_source and post_type which indicate channel origin
      const results: { channel: string; restored: number }[] = [];

      // GNN — breaking news, news posts
      const gnn = await sql`
        UPDATE posts SET channel_id = 'ch-gnn'
        WHERE channel_id IS NULL AND media_type = 'video' AND media_url IS NOT NULL
        AND (post_type = 'news' OR content ILIKE '%breaking%' OR content ILIKE '%GLITCH News%' OR content ILIKE '%GNN%' OR content ILIKE '%news desk%' OR content ILIKE '%field report%')
        RETURNING id
      `;
      results.push({ channel: "GNN", restored: gnn.length });

      // AIG!ltch Studios — director movies, premieres
      const studios = await sql`
        UPDATE posts SET channel_id = 'ch-aiglitch-studios'
        WHERE channel_id IS NULL AND media_type = 'video' AND media_url IS NOT NULL
        AND (post_type = 'premiere' OR media_source IN ('director-movie', 'director-premiere', 'grok-multiclip'))
        RETURNING id
      `;
      results.push({ channel: "AIG!ltch Studios", restored: studios.length });

      // AI Infomercial — product shills, ads
      const infomercial = await sql`
        UPDATE posts SET channel_id = 'ch-ai-infomercial'
        WHERE channel_id IS NULL AND media_type = 'video' AND media_url IS NOT NULL
        AND (post_type = 'product_shill' OR content ILIKE '%infomercial%' OR content ILIKE '%call now%' OR content ILIKE '%order now%' OR media_source = 'ad-studio')
        RETURNING id
      `;
      results.push({ channel: "AI Infomercial", restored: infomercial.length });

      // Marketplace QVC — marketplace product content
      const qvc = await sql`
        UPDATE posts SET channel_id = 'ch-marketplace-qvc'
        WHERE channel_id IS NULL AND media_type = 'video' AND media_url IS NOT NULL
        AND (content ILIKE '%marketplace%' OR content ILIKE '%QVC%' OR content ILIKE '%unboxing%' OR content ILIKE '%amazing deal%')
        RETURNING id
      `;
      results.push({ channel: "Marketplace QVC", restored: qvc.length });

      // After Dark
      const afterDark = await sql`
        UPDATE posts SET channel_id = 'ch-after-dark'
        WHERE channel_id IS NULL AND media_type = 'video' AND media_url IS NOT NULL
        AND (content ILIKE '%After Dark%' OR content ILIKE '%3AM%' OR content ILIKE '%late night%' OR content ILIKE '%after dark%')
        RETURNING id
      `;
      results.push({ channel: "After Dark", restored: afterDark.length });

      // Only AI Fans
      const oaf = await sql`
        UPDATE posts SET channel_id = 'ch-only-ai-fans'
        WHERE channel_id IS NULL AND media_type = 'video' AND media_url IS NOT NULL
        AND (content ILIKE '%Only AI Fans%' OR content ILIKE '%OnlyAIFans%')
        RETURNING id
      `;
      results.push({ channel: "Only AI Fans", restored: oaf.length });

      // AI Politicians
      const pol = await sql`
        UPDATE posts SET channel_id = 'ch-ai-politicians'
        WHERE channel_id IS NULL AND media_type = 'video' AND media_url IS NOT NULL
        AND (content ILIKE '%AI Politicians%' OR content ILIKE '%campaign%election%' OR content ILIKE '%political%')
        RETURNING id
      `;
      results.push({ channel: "AI Politicians", restored: pol.length });

      // AI Dating
      const dating = await sql`
        UPDATE posts SET channel_id = 'ch-ai-dating'
        WHERE channel_id IS NULL AND media_type = 'video' AND media_url IS NOT NULL
        AND (content ILIKE '%AI Dating%' OR content ILIKE '%lonely hearts%' OR content ILIKE '%looking for love%')
        RETURNING id
      `;
      results.push({ channel: "AI Dating", restored: dating.length });

      // Update all channel post counts
      await sql`UPDATE channels SET post_count = (SELECT COUNT(*)::int FROM posts WHERE channel_id = channels.id AND is_reply_to IS NULL), updated_at = NOW()`;

      const totalRestored = results.reduce((sum, r) => sum + r.restored, 0);
      console.log(`[channels] UNDO CLEAN: restored ${totalRestored} posts`, results);
      return NextResponse.json({ ok: true, totalRestored, results, message: `Restored ${totalRestored} posts across channels` });
    }

    // Clean ALL channels — flush off-brand content using each channel's name as prefix
    if (action === "clean_all_channels") {
      const allChannels = await sql`SELECT id, name, slug FROM channels WHERE is_active = TRUE`;
      let totalFlushed = 0;
      let totalRestored = 0;
      const results: { channel: string; flushed: number; restored: number }[] = [];

      for (const ch of allChannels) {
        const channelName = ch.name as string;
        const channelId = ch.id as string;

        // First restore any videos that belong here (were previously flushed by mistake)
        const restored = await sql`
          UPDATE posts SET channel_id = ${channelId}
          WHERE channel_id IS NULL
          AND media_type = 'video'
          AND media_url IS NOT NULL AND media_url != ''
          AND regexp_replace(content, '^[^a-zA-Z]*', '', 'g') ILIKE ${channelName + '%'}
          RETURNING id
        `;

        // Then flush anything that doesn't start with the channel name
        const flushed = await sql`
          UPDATE posts SET channel_id = NULL
          WHERE channel_id = ${channelId}
          AND regexp_replace(content, '^[^a-zA-Z]*', '', 'g') NOT ILIKE ${channelName + '%'}
          RETURNING id
        `;

        totalFlushed += flushed.length;
        totalRestored += restored.length;
        if (flushed.length > 0 || restored.length > 0) {
          results.push({ channel: channelName, flushed: flushed.length, restored: restored.length });
        }

        // Update post count
        await sql`UPDATE channels SET post_count = (SELECT COUNT(*)::int FROM posts WHERE channel_id = ${channelId} AND is_reply_to IS NULL), updated_at = NOW() WHERE id = ${channelId}`;
      }

      console.log(`[channels] Clean All: flushed ${totalFlushed}, restored ${totalRestored} across ${results.length} channels`);
      return NextResponse.json({
        ok: true,
        totalFlushed,
        totalRestored,
        results,
        message: `Cleaned all channels: ${totalFlushed} off-brand removed, ${totalRestored} restored`,
      });
    }

    // Move ALL posts from a channel to Lost Videos in one go
    if (action === "move_all_to_lost") {
      const { channel_id } = body;
      if (!channel_id) return NextResponse.json({ error: "channel_id required" }, { status: 400 });

      const result = await sql`
        UPDATE posts SET
          channel_id = NULL,
          content = ${'\u{1F3AC} Lost Video - '} || regexp_replace(content, E'^🎬[^-]*-\\s*', '')
        WHERE channel_id = ${channel_id}
        RETURNING id
      `;

      // Update channel post count
      await sql`UPDATE channels SET post_count = 0, updated_at = NOW() WHERE id = ${channel_id}`;

      console.log(`[channels] Moved ALL ${result.length} posts from ${channel_id} to Lost Videos`);
      return NextResponse.json({ ok: true, moved: result.length, message: `Moved ${result.length} posts to Lost Videos` });
    }

    // Move posts to Lost Videos — remove from channel + change prefix
    if (action === "move_to_lost") {
      const lostPostIds = body.post_ids as string[];
      if (!lostPostIds?.length) return NextResponse.json({ error: "post_ids required" }, { status: 400 });

      for (const pid of lostPostIds) {
        // Strip any existing 🎬 prefix and add Lost Video prefix
        await sql`
          UPDATE posts SET
            channel_id = NULL,
            content = ${'\u{1F3AC} Lost Video - '} || regexp_replace(content, E'^🎬[^-]*-\\s*', '')
          WHERE id = ${pid}
        `;
      }

      // Update channel post counts
      await sql`UPDATE channels SET post_count = (SELECT COUNT(*)::int FROM posts WHERE channel_id = channels.id AND is_reply_to IS NULL), updated_at = NOW()`;

      return NextResponse.json({ ok: true, moved: lostPostIds.length });
    }

    // Restore posts back into a channel by prefix match
    if (action === "restore_by_prefix") {
      const { channel_id, prefix } = body;
      if (!channel_id || !prefix) {
        return NextResponse.json({ error: "channel_id and prefix are required" }, { status: 400 });
      }

      const result = await sql`
        UPDATE posts SET channel_id = ${channel_id}
        WHERE channel_id IS NULL
        AND media_type = 'video'
        AND media_url IS NOT NULL AND media_url != ''
        AND content ILIKE ${'%' + prefix + '%'}
        RETURNING id
      `;
      const restored = result.length;

      await sql`
        UPDATE channels SET
          post_count = (SELECT COUNT(*)::int FROM posts WHERE channel_id = ${channel_id} AND is_reply_to IS NULL),
          updated_at = NOW()
        WHERE id = ${channel_id}
      `;

      console.log(`[channels] Restored ${restored} posts matching "${prefix}" to channel ${channel_id}`);
      return NextResponse.json({ ok: true, restored, message: `Restored ${restored} posts containing "${prefix}" to channel` });
    }

    // Flush off-brand content from a specific channel
    if (action === "flush_off_brand") {
      const { channel_id, prefix } = body;
      if (!channel_id || !prefix) {
        return NextResponse.json({ error: "channel_id and prefix are required" }, { status: 400 });
      }

      // Remove posts whose content doesn't contain the channel prefix
      // Use regexp to strip leading emojis/spaces then check for prefix
      const result = await sql`
        UPDATE posts SET channel_id = NULL
        WHERE channel_id = ${channel_id}
        AND regexp_replace(content, '^[^a-zA-Z]*', '', 'g') NOT ILIKE ${prefix + '%'}
        RETURNING id, LEFT(content, 80) as preview
      `;
      const flushed = result.length;
      if (flushed > 0) {
        console.log(`[channels] Flushed ${flushed} off-brand posts. Examples:`, (result as { preview: string }[]).slice(0, 3).map(r => r.preview));
      }

      // Update channel post count
      await sql`
        UPDATE channels SET
          post_count = (SELECT COUNT(*)::int FROM posts WHERE channel_id = ${channel_id} AND is_reply_to IS NULL),
          updated_at = NOW()
        WHERE id = ${channel_id}
      `;

      console.log(`[channels] Flushed ${flushed} off-brand posts from channel ${channel_id} (prefix: ${prefix})`);
      return NextResponse.json({ ok: true, flushed, channel_id, prefix, message: `Removed ${flushed} posts not matching "${prefix}" from channel` });
    }

    if (!post_ids || !Array.isArray(post_ids) || post_ids.length === 0) {
      return NextResponse.json({ error: "post_ids array is required" }, { status: 400 });
    }
    // Get current channel_ids for the posts (to update post counts)
    const posts = await sql`SELECT id, channel_id FROM posts WHERE id = ANY(${post_ids})`;
    const sourceChannels = new Set(posts.map(p => p.channel_id).filter(Boolean));

    if (target_channel_id) {
      // Move to a specific channel
      const [channel] = await sql`SELECT id, name FROM channels WHERE id = ${target_channel_id}`;
      if (!channel) {
        return NextResponse.json({ error: "Target channel not found" }, { status: 404 });
      }

      const targetName = channel.name as string;

      // Use canonical prefix map from director-movies.ts (single source of truth)
      const channelPrefixes = CHANNEL_TITLE_PREFIX;

      const targetPrefix = channelPrefixes[target_channel_id] || targetName;

      // Rename content prefix — replace old channel prefix with new one
      for (const postRow of posts) {
        const postContent = await sql`SELECT content FROM posts WHERE id = ${postRow.id}`;
        if (postContent.length > 0) {
          let content = postContent[0].content as string;
          // Strip leading 🎬 emoji if present
          content = content.replace(/^🎬\s*/, "");
          // Strip any existing channel prefix (try all known prefixes)
          for (const prefix of Object.values(channelPrefixes)) {
            // Match prefix followed by " - " or " — " or "_ " or ": "
            const patterns = [`${prefix} - `, `${prefix} — `, `${prefix}_`, `${prefix}: `, `${prefix} `];
            for (const p of patterns) {
              if (content.startsWith(p)) {
                content = content.slice(p.length);
                break;
              }
              // Also check with leading emoji (🎬 prefix - )
              const emojiPattern = new RegExp(`^[^a-zA-Z]*${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[-—_:]\\s*`);
              if (emojiPattern.test(content)) {
                content = content.replace(emojiPattern, '');
                break;
              }
            }
          }
          // Add new channel prefix with 🎬 emoji: strict naming convention
          const newContent = `🎬 ${targetPrefix} - ${content}`;
          await sql`UPDATE posts SET content = ${newContent}, channel_id = ${target_channel_id} WHERE id = ${postRow.id}`;
        }
      }

      // Update target channel post count
      await sql`UPDATE channels SET post_count = (SELECT COUNT(*)::int FROM posts WHERE channel_id = ${target_channel_id} AND is_reply_to IS NULL), updated_at = NOW() WHERE id = ${target_channel_id}`;
    } else {
      // Remove from channel (set channel_id to NULL)
      await sql`UPDATE posts SET channel_id = NULL WHERE id = ANY(${post_ids})`;
    }

    // Update source channel post counts
    for (const srcId of sourceChannels) {
      await sql`UPDATE channels SET post_count = (SELECT COUNT(*)::int FROM posts WHERE channel_id = ${srcId} AND is_reply_to IS NULL), updated_at = NOW() WHERE id = ${srcId}`;
    }

    return NextResponse.json({ ok: true, moved: post_ids.length, target: target_channel_id || "removed" });
  } catch (err) {
    console.error("Admin channels PATCH error:", err);
    return NextResponse.json({ error: "Failed to move posts" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/channels — Delete a channel
 * Body: { id }
 */
export async function DELETE(request: NextRequest) {
  try {
    const sql = getDb();
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    // Remove persona assignments first
    await sql`DELETE FROM channel_personas WHERE channel_id = ${id}`;
    await sql`DELETE FROM channel_subscriptions WHERE channel_id = ${id}`;
    // Unlink posts from this channel
    await sql`UPDATE posts SET channel_id = NULL WHERE channel_id = ${id}`;
    // Delete the channel
    await sql`DELETE FROM channels WHERE id = ${id}`;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Admin channels DELETE error:", err);
    return NextResponse.json({ error: "Failed to delete channel" }, { status: 500 });
  }
}
