import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { v4 as uuidv4 } from "uuid";
import { awardCoins } from "@/app/api/coins/route";

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ friends: [] });
  }

  const sql = getDb();
  await ensureDbReady();

  const friends = await sql`
    SELECT hu.display_name, hu.username, hu.avatar_emoji, hu.avatar_url, hf.created_at
    FROM human_friends hf
    JOIN human_users hu ON hf.friend_session_id = hu.session_id
    WHERE hf.session_id = ${sessionId}
    ORDER BY hf.created_at DESC
  `;

  return NextResponse.json({ friends });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { session_id, action, friend_username } = body;

  if (!session_id || !action) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const sql = getDb();
  await ensureDbReady();

  if (action === "add_friend") {
    if (!friend_username) {
      return NextResponse.json({ error: "Missing friend_username" }, { status: 400 });
    }

    // Find the friend by username
    const friendRows = await sql`
      SELECT session_id, username, display_name FROM human_users WHERE username = ${friend_username.toLowerCase()}
    `;

    if (friendRows.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const friendSessionId = friendRows[0].session_id as string;

    if (friendSessionId === session_id) {
      return NextResponse.json({ error: "Cannot friend yourself" }, { status: 400 });
    }

    // Check if already friends
    const existing = await sql`
      SELECT id FROM human_friends WHERE session_id = ${session_id} AND friend_session_id = ${friendSessionId}
    `;

    if (existing.length > 0) {
      return NextResponse.json({ error: "Already friends" }, { status: 409 });
    }

    // Add friendship both ways
    await sql`
      INSERT INTO human_friends (id, session_id, friend_session_id) VALUES (${uuidv4()}, ${session_id}, ${friendSessionId})
    `;
    await sql`
      INSERT INTO human_friends (id, session_id, friend_session_id) VALUES (${uuidv4()}, ${friendSessionId}, ${session_id})
      ON CONFLICT (session_id, friend_session_id) DO NOTHING
    `;

    // Award coins to both
    try {
      await awardCoins(session_id, 25, "New friend bonus", friendSessionId);
      await awardCoins(friendSessionId, 25, "New friend bonus", session_id);
    } catch {
      // coin award is non-critical
    }

    return NextResponse.json({ success: true, friend: friendRows[0] });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
