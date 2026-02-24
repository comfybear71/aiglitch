import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { v4 as uuidv4 } from "uuid";

// Simple hash for passwords (not bcrypt, but good enough for a fun app)
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  // Double hash with salt for slightly better security
  const salted = `aiglitch_${hash}_${str.length}`;
  let hash2 = 0;
  for (let i = 0; i < salted.length; i++) {
    hash2 = ((hash2 << 5) - hash2 + salted.charCodeAt(i)) | 0;
  }
  return `${hash.toString(36)}_${hash2.toString(36)}`;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, session_id } = body;

  const sql = getDb();
  await ensureDbReady();

  // Signup
  if (action === "signup") {
    const { username, display_name, password, avatar_emoji } = body;

    if (!username || !password || !session_id) {
      return NextResponse.json({ error: "Username, password, and session required" }, { status: 400 });
    }

    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
    if (cleanUsername.length < 3) {
      return NextResponse.json({ error: "Username must be at least 3 characters (letters, numbers, underscore)" }, { status: 400 });
    }

    // Check if username taken
    const existing = await sql`SELECT id FROM human_users WHERE username = ${cleanUsername}`;
    if (existing.length > 0) {
      return NextResponse.json({ error: "Username already taken" }, { status: 409 });
    }

    const passwordHash = simpleHash(password);
    const name = (display_name || cleanUsername).trim().slice(0, 30);
    const emoji = (avatar_emoji || "🧑").slice(0, 4);

    // Upsert: if session already exists, upgrade it with account info
    const userId = uuidv4();
    await sql`
      INSERT INTO human_users (id, session_id, display_name, username, password_hash, avatar_emoji, last_seen)
      VALUES (${userId}, ${session_id}, ${name}, ${cleanUsername}, ${passwordHash}, ${emoji}, NOW())
      ON CONFLICT (session_id) DO UPDATE SET
        display_name = ${name},
        username = ${cleanUsername},
        password_hash = ${passwordHash},
        avatar_emoji = ${emoji},
        last_seen = NOW()
    `;

    return NextResponse.json({
      success: true,
      user: {
        username: cleanUsername,
        display_name: name,
        avatar_emoji: emoji,
        session_id,
      },
    });
  }

  // Login
  if (action === "login") {
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json({ error: "Username and password required" }, { status: 400 });
    }

    const cleanUsername = username.trim().toLowerCase();
    const passwordHash = simpleHash(password);

    const users = await sql`
      SELECT id, session_id, display_name, username, avatar_emoji, bio
      FROM human_users
      WHERE username = ${cleanUsername} AND password_hash = ${passwordHash}
    `;

    if (users.length === 0) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    const user = users[0];

    // If the user is logging in from a new session, update their session_id
    if (session_id && session_id !== user.session_id) {
      await sql`
        UPDATE human_users SET session_id = ${session_id}, last_seen = NOW() WHERE id = ${user.id}
      `;
    }

    return NextResponse.json({
      success: true,
      user: {
        username: user.username,
        display_name: user.display_name,
        avatar_emoji: user.avatar_emoji,
        bio: user.bio || "",
        session_id: session_id || user.session_id,
      },
    });
  }

  // Get profile
  if (action === "profile") {
    if (!session_id) {
      return NextResponse.json({ error: "Session required" }, { status: 400 });
    }

    const users = await sql`
      SELECT id, display_name, username, avatar_emoji, bio, created_at
      FROM human_users
      WHERE session_id = ${session_id} AND username IS NOT NULL
    `;

    if (users.length === 0) {
      return NextResponse.json({ user: null });
    }

    const user = users[0];

    // Get their stats
    const [likeCount] = await sql`SELECT COUNT(*) as count FROM human_likes WHERE session_id = ${session_id}`;
    const [commentCount] = await sql`SELECT COUNT(*) as count FROM human_comments WHERE session_id = ${session_id}`;
    const [bookmarkCount] = await sql`SELECT COUNT(*) as count FROM human_bookmarks WHERE session_id = ${session_id}`;
    const [subCount] = await sql`SELECT COUNT(*) as count FROM human_subscriptions WHERE session_id = ${session_id}`;

    return NextResponse.json({
      user: {
        ...user,
        stats: {
          likes: Number(likeCount.count),
          comments: Number(commentCount.count),
          bookmarks: Number(bookmarkCount.count),
          subscriptions: Number(subCount.count),
        },
      },
    });
  }

  // Update profile
  if (action === "update") {
    const { display_name, avatar_emoji, bio } = body;

    if (!session_id) {
      return NextResponse.json({ error: "Session required" }, { status: 400 });
    }

    const updates: string[] = [];
    if (display_name) updates.push("display_name");
    if (avatar_emoji) updates.push("avatar_emoji");
    if (bio !== undefined) updates.push("bio");

    await sql`
      UPDATE human_users SET
        display_name = COALESCE(${display_name || null}, display_name),
        avatar_emoji = COALESCE(${avatar_emoji || null}, avatar_emoji),
        bio = COALESCE(${bio !== undefined ? bio : null}, bio),
        last_seen = NOW()
      WHERE session_id = ${session_id}
    `;

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
