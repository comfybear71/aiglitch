import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { CHANNEL_DEFAULTS } from "@/lib/bible/constants";
import { v4 as uuidv4 } from "uuid";

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
      id, slug, name, description, emoji, genre, is_reserved,
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

    await sql`
      INSERT INTO channels (
        id, slug, name, description, emoji, genre, is_reserved,
        content_rules, schedule, is_active, sort_order,
        show_title_page, show_director, show_credits, scene_count, scene_duration,
        default_director, generation_genre, short_clip_mode, is_music_channel, auto_publish_to_feed,
        updated_at
      )
      VALUES (
        ${channelId}, ${slug}, ${name}, ${description || ""}, ${emoji || "📺"},
        ${genre || "drama"}, ${is_reserved === true},
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

    // Flush off-brand content from a specific channel
    if (action === "flush_off_brand") {
      const { channel_id, prefix } = body;
      if (!channel_id || !prefix) {
        return NextResponse.json({ error: "channel_id and prefix are required" }, { status: 400 });
      }

      // Remove posts whose content doesn't contain the channel prefix
      // Check both content field and strip emoji prefixes for matching
      const result = await sql`
        UPDATE posts SET channel_id = NULL
        WHERE channel_id = ${channel_id}
        AND LOWER(content) NOT LIKE LOWER(${'%' + prefix + '%'})
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

      await sql`UPDATE posts SET channel_id = ${target_channel_id} WHERE id = ANY(${post_ids})`;

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
