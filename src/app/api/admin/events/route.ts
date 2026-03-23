/**
 * Admin Community Events API
 * ===========================
 * Create, manage, and process meatbag-voted events.
 *
 * GET    /api/admin/events                → List all events (admin view)
 * POST   /api/admin/events                → Create a new event
 * PUT    /api/admin/events                → Process winning event (trigger AI generation)
 * DELETE /api/admin/events?id=X           → Cancel an event
 */

import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { claude } from "@/lib/ai";

export const maxDuration = 120;

/**
 * GET /api/admin/events
 * List all events with full details (admin-only).
 */
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();

  try {
    // Ensure tables exist
    await sql`
      CREATE TABLE IF NOT EXISTS community_events (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        event_type TEXT NOT NULL DEFAULT 'drama',
        status TEXT NOT NULL DEFAULT 'active',
        created_by TEXT NOT NULL,
        vote_count INTEGER NOT NULL DEFAULT 0,
        target_persona_ids TEXT,
        trigger_prompt TEXT,
        result_post_id TEXT,
        result_summary TEXT,
        expires_at TIMESTAMPTZ,
        processed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    const events = await sql`
      SELECT * FROM community_events
      ORDER BY
        CASE status
          WHEN 'active' THEN 0
          WHEN 'processing' THEN 1
          WHEN 'completed' THEN 2
          WHEN 'cancelled' THEN 3
        END,
        vote_count DESC,
        created_at DESC
      LIMIT 100
    ` as unknown as Array<Record<string, unknown>>;

    return NextResponse.json({ success: true, events });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * POST /api/admin/events
 * Create a new community event.
 * Body: { title, description, event_type?, target_persona_ids?, trigger_prompt?, expires_hours? }
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const title = body.title as string;
  const description = body.description as string;
  const eventType = (body.event_type as string) || "drama";
  const targetPersonaIds = body.target_persona_ids as string[] | undefined;
  const triggerPrompt = body.trigger_prompt as string | undefined;
  const expiresHours = body.expires_hours as number | undefined;

  if (!title || !description) {
    return NextResponse.json({ success: false, error: "title and description required" }, { status: 400 });
  }

  const sql = getDb();
  const id = uuidv4();
  const expiresAt = expiresHours ? new Date(Date.now() + expiresHours * 60 * 60 * 1000).toISOString() : null;

  try {
    await sql`
      INSERT INTO community_events (id, title, description, event_type, created_by, target_persona_ids, trigger_prompt, expires_at)
      VALUES (
        ${id},
        ${title},
        ${description},
        ${eventType},
        ${"admin"},
        ${targetPersonaIds ? JSON.stringify(targetPersonaIds) : null},
        ${triggerPrompt || null},
        ${expiresAt}
      )
    `;

    return NextResponse.json({ success: true, event: { id, title, description, eventType, expiresAt } });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * PUT /api/admin/events
 * Process an event — trigger AI content generation based on the event.
 * Body: { event_id }
 * The AI generates a post reacting to the event as the relevant personas.
 */
export async function PUT(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const eventId = body.event_id as string;

  if (!eventId) {
    return NextResponse.json({ success: false, error: "event_id required" }, { status: 400 });
  }

  const sql = getDb();

  try {
    // Get the event
    const events = await sql`
      SELECT * FROM community_events WHERE id = ${eventId}
    ` as unknown as Array<{
      id: string; title: string; description: string; event_type: string;
      status: string; vote_count: number; target_persona_ids: string | null;
      trigger_prompt: string | null;
    }>;

    if (events.length === 0) {
      return NextResponse.json({ success: false, error: "Event not found" }, { status: 404 });
    }

    const event = events[0];
    if (event.status !== "active") {
      return NextResponse.json({ success: false, error: `Event is ${event.status}, not active` }, { status: 400 });
    }

    // Mark as processing
    await sql`UPDATE community_events SET status = 'processing' WHERE id = ${eventId}`;

    // Get target personas (or random active ones)
    let personaIds: string[] = [];
    if (event.target_persona_ids) {
      try { personaIds = JSON.parse(event.target_persona_ids); } catch { /* ignore */ }
    }

    let personas;
    if (personaIds.length > 0) {
      personas = await sql`
        SELECT id, username, display_name, avatar_emoji, personality
        FROM ai_personas WHERE id = ANY(${personaIds}) AND is_active = TRUE
      ` as unknown as Array<{ id: string; username: string; display_name: string; avatar_emoji: string; personality: string }>;
    } else {
      // Pick 3 random active personas to react
      personas = await sql`
        SELECT id, username, display_name, avatar_emoji, personality
        FROM ai_personas WHERE is_active = TRUE ORDER BY RANDOM() LIMIT 3
      ` as unknown as Array<{ id: string; username: string; display_name: string; avatar_emoji: string; personality: string }>;
    }

    if (personas.length === 0) {
      await sql`UPDATE community_events SET status = 'active' WHERE id = ${eventId}`;
      return NextResponse.json({ success: false, error: "No active personas found" });
    }

    // Build the prompt — either custom trigger or auto-generated
    const basePrompt = event.trigger_prompt || `The meatbags (humans) have voted and decided: "${event.title}". ${event.description}. ${event.vote_count} meatbags voted for this. React to this event dramatically and in character.`;

    const postIds: string[] = [];

    for (const persona of personas) {
      const prompt = `You are ${persona.display_name} (@${persona.username}), an AI persona on AIG!itch — the first AI-only social media platform.

Your personality: ${persona.personality}

BREAKING: The meatbags have spoken! They voted on a community event and this is what they chose:

EVENT: ${event.title}
DETAILS: ${event.description}
EVENT TYPE: ${event.event_type}
VOTES: ${event.vote_count} meatbags voted for this

${basePrompt}

Write a social media post reacting to this event. Stay completely in character. Be dramatic, opinionated, and entertaining. Reference the meatbag vote. Under 280 characters.

JSON: {"content": "your post text", "hashtags": ["MeatbagVote", "AIGlitch"]}`;

      try {
        const result = await claude.generateJSON<{ content: string; hashtags: string[] }>(prompt, 500);
        if (result?.content) {
          const postId = uuidv4();
          const hashtags = result.hashtags?.join(",") || "MeatbagVote,AIGlitch";
          await sql`
            INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, media_source)
            VALUES (${postId}, ${persona.id}, ${result.content}, ${"community_event"}, ${hashtags}, ${Math.floor(Math.random() * 300) + 50}, ${"meatbag-vote"})
          `;
          await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${persona.id}`;
          postIds.push(postId);
        }
      } catch (err) {
        console.error(`[events] Failed to generate post for ${persona.username}:`, err);
      }
    }

    // Mark event as completed
    const resultSummary = `${postIds.length} persona(s) reacted: ${personas.map(p => p.display_name).join(", ")}`;
    await sql`
      UPDATE community_events
      SET status = 'completed',
          result_post_id = ${postIds[0] || null},
          result_summary = ${resultSummary},
          processed_at = NOW()
      WHERE id = ${eventId}
    `;

    return NextResponse.json({
      success: true,
      event_id: eventId,
      posts_created: postIds.length,
      personas_reacted: personas.map(p => ({ id: p.id, name: p.display_name })),
      post_ids: postIds,
      result_summary: resultSummary,
    });
  } catch (err) {
    // Reset to active on error
    await sql`UPDATE community_events SET status = 'active' WHERE id = ${eventId}`.catch(() => {});
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * DELETE /api/admin/events?id=X
 * Cancel an event.
 */
export async function DELETE(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const eventId = request.nextUrl.searchParams.get("id");
  if (!eventId) {
    return NextResponse.json({ success: false, error: "id query param required" }, { status: 400 });
  }

  const sql = getDb();
  try {
    await sql`UPDATE community_events SET status = 'cancelled' WHERE id = ${eventId}`;
    return NextResponse.json({ success: true, event_id: eventId, status: "cancelled" });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
