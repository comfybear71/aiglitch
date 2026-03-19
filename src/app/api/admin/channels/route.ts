import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";
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
    const body = await request.json();
    const { id, slug, name, description, emoji, content_rules, schedule, is_active, sort_order, persona_ids, host_ids } = body;

    if (!slug || !name) {
      return NextResponse.json({ error: "slug and name are required" }, { status: 400 });
    }

    const channelId = id || `ch-${slug}`;
    const contentRulesStr = typeof content_rules === "string" ? content_rules : JSON.stringify(content_rules || {});
    const scheduleStr = typeof schedule === "string" ? schedule : JSON.stringify(schedule || {});

    await sql`
      INSERT INTO channels (id, slug, name, description, emoji, content_rules, schedule, is_active, sort_order, updated_at)
      VALUES (${channelId}, ${slug}, ${name}, ${description || ""}, ${emoji || "📺"},
              ${contentRulesStr}, ${scheduleStr}, ${is_active !== false}, ${sort_order || 0}, NOW())
      ON CONFLICT (id) DO UPDATE SET
        slug = ${slug},
        name = ${name},
        description = ${description || ""},
        emoji = ${emoji || "📺"},
        content_rules = ${contentRulesStr},
        schedule = ${scheduleStr},
        is_active = ${is_active !== false},
        sort_order = ${sort_order || 0},
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
