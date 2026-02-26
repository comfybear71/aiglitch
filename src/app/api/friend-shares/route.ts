import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { v4 as uuidv4 } from "uuid";

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ shares: [] });
  }

  const sql = getDb();
  await ensureDbReady();

  // Get posts shared WITH this user (inbox)
  const shares = await sql`
    SELECT fs.id, fs.post_id, fs.message, fs.is_read, fs.created_at,
      hu.display_name as sender_name, hu.avatar_emoji as sender_avatar, hu.username as sender_username,
      p.content as post_content, p.post_type, p.media_url, p.media_type,
      a.display_name as persona_name, a.avatar_emoji as persona_avatar, a.username as persona_username
    FROM friend_shares fs
    JOIN human_users hu ON fs.sender_session_id = hu.session_id
    JOIN posts p ON fs.post_id = p.id
    JOIN ai_personas a ON p.persona_id = a.id
    WHERE fs.receiver_session_id = ${sessionId}
    ORDER BY fs.created_at DESC
    LIMIT 50
  `;

  // Count unread
  const [unreadRow] = await sql`
    SELECT COUNT(*) as count FROM friend_shares
    WHERE receiver_session_id = ${sessionId} AND is_read = FALSE
  `;

  return NextResponse.json({
    shares,
    unread: Number(unreadRow.count),
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { session_id, action, post_id, friend_username, message } = body;

  if (!session_id || !action) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const sql = getDb();
  await ensureDbReady();

  if (action === "share") {
    if (!post_id || !friend_username) {
      return NextResponse.json({ error: "Missing post_id or friend_username" }, { status: 400 });
    }

    // Find the friend's session_id
    const friendRows = await sql`
      SELECT session_id FROM human_users WHERE username = ${friend_username.toLowerCase()}
    `;
    if (friendRows.length === 0) {
      return NextResponse.json({ error: "Friend not found" }, { status: 404 });
    }

    const friendSessionId = friendRows[0].session_id as string;

    // Verify they are actually friends
    const friendship = await sql`
      SELECT id FROM human_friends WHERE session_id = ${session_id} AND friend_session_id = ${friendSessionId}
    `;
    if (friendship.length === 0) {
      return NextResponse.json({ error: "Not friends with this user" }, { status: 403 });
    }

    // Create the share
    await sql`
      INSERT INTO friend_shares (id, sender_session_id, receiver_session_id, post_id, message, created_at)
      VALUES (${uuidv4()}, ${session_id}, ${friendSessionId}, ${post_id}, ${message || null}, NOW())
    `;

    return NextResponse.json({ success: true });
  }

  if (action === "mark_read") {
    // Mark all shares as read for this user
    await sql`
      UPDATE friend_shares SET is_read = TRUE
      WHERE receiver_session_id = ${session_id} AND is_read = FALSE
    `;
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
