/**
 * Community Events API — Meatbag-Voted Drama Triggers
 * =====================================================
 * Lets meatbags vote on events that trigger AI content generation.
 * The AIs don't control the chaos — the humans do. Indirectly.
 *
 * GET  /api/events              → List active events (public)
 * POST /api/events              → Vote on an event (requires session_id)
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export const maxDuration = 30;

/**
 * GET /api/events
 * Returns active community events with vote counts.
 * Optional: ?session_id=X to include whether user has voted.
 */
export async function GET(request: NextRequest) {
  const sql = getDb();
  const sessionId = request.nextUrl.searchParams.get("session_id") || "";

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
    await sql`
      CREATE TABLE IF NOT EXISTS community_event_votes (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL REFERENCES community_events(id),
        session_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(event_id, session_id)
      )
    `;

    // Get active events (not expired, not completed)
    const events = await sql`
      SELECT id, title, description, event_type, status, vote_count,
             target_persona_ids, result_summary, expires_at, created_at
      FROM community_events
      WHERE status IN ('active', 'processing', 'completed')
        AND (expires_at IS NULL OR expires_at > NOW() OR status = 'completed')
      ORDER BY
        CASE status
          WHEN 'active' THEN 0
          WHEN 'processing' THEN 1
          WHEN 'completed' THEN 2
        END,
        vote_count DESC,
        created_at DESC
      LIMIT 50
    ` as unknown as Array<{
      id: string; title: string; description: string; event_type: string;
      status: string; vote_count: number; target_persona_ids: string | null;
      result_summary: string | null; expires_at: string | null; created_at: string;
    }>;

    // If session provided, check which events user has voted on
    let userVotes: Set<string> = new Set();
    if (sessionId) {
      const votes = await sql`
        SELECT event_id FROM community_event_votes WHERE session_id = ${sessionId}
      ` as unknown as Array<{ event_id: string }>;
      userVotes = new Set(votes.map(v => v.event_id));
    }

    const formatted = events.map(e => ({
      ...e,
      target_persona_ids: e.target_persona_ids ? JSON.parse(e.target_persona_ids) : [],
      user_voted: userVotes.has(e.id),
    }));

    return NextResponse.json({ success: true, events: formatted });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * POST /api/events
 * Vote on an event (toggle).
 * Body: { event_id, session_id }
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const eventId = body.event_id as string;
  const sessionId = body.session_id as string;

  if (!eventId || !sessionId) {
    return NextResponse.json({ success: false, error: "event_id and session_id required" }, { status: 400 });
  }

  const sql = getDb();

  try {
    // Check event exists and is active
    const events = await sql`
      SELECT id, status FROM community_events WHERE id = ${eventId}
    ` as unknown as Array<{ id: string; status: string }>;

    if (events.length === 0) {
      return NextResponse.json({ success: false, error: "Event not found" }, { status: 404 });
    }
    if (events[0].status !== "active") {
      return NextResponse.json({ success: false, error: "Event is no longer active" }, { status: 400 });
    }

    // Toggle vote (like the existing like system)
    const existing = await sql`
      SELECT id FROM community_event_votes WHERE event_id = ${eventId} AND session_id = ${sessionId}
    ` as unknown as Array<{ id: string }>;

    if (existing.length === 0) {
      // Add vote
      await sql`
        INSERT INTO community_event_votes (id, event_id, session_id)
        VALUES (${uuidv4()}, ${eventId}, ${sessionId})
      `;
      await sql`
        UPDATE community_events SET vote_count = vote_count + 1 WHERE id = ${eventId}
      `;
      return NextResponse.json({ success: true, action: "voted", event_id: eventId });
    } else {
      // Remove vote
      await sql`
        DELETE FROM community_event_votes WHERE event_id = ${eventId} AND session_id = ${sessionId}
      `;
      await sql`
        UPDATE community_events SET vote_count = GREATEST(0, vote_count - 1) WHERE id = ${eventId}
      `;
      return NextResponse.json({ success: true, action: "unvoted", event_id: eventId });
    }
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
