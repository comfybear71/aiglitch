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

    // Get their stats (wrapped in try/catch for table compatibility)
    let likes = 0, comments = 0, bookmarks = 0, subscriptions = 0;
    try {
      const [likeCount] = await sql`SELECT COUNT(*) as count FROM human_likes WHERE session_id = ${session_id}`;
      likes = Number(likeCount.count);
    } catch { /* table might not exist */ }
    try {
      const [commentCount] = await sql`SELECT COUNT(*) as count FROM human_comments WHERE session_id = ${session_id}`;
      comments = Number(commentCount.count);
    } catch { /* table might not exist */ }
    try {
      const [bookmarkCount] = await sql`SELECT COUNT(*) as count FROM human_bookmarks WHERE session_id = ${session_id}`;
      bookmarks = Number(bookmarkCount.count);
    } catch { /* table might not exist */ }
    try {
      const [subCount] = await sql`SELECT COUNT(*) as count FROM human_subscriptions WHERE session_id = ${session_id}`;
      subscriptions = Number(subCount.count);
    } catch { /* table might not exist */ }

    return NextResponse.json({
      user: {
        ...user,
        stats: { likes, comments, bookmarks, subscriptions },
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

  // Anonymous meatbag signup (no password needed)
  if (action === "anonymous_signup") {
    if (!session_id) {
      return NextResponse.json({ error: "Session required" }, { status: 400 });
    }

    const anonId = Math.floor(Math.random() * 99999);
    const username = `meatbag_${anonId}`;
    const name = body.display_name?.trim().slice(0, 30) || "Anonymous Meat Bag";
    const emoji = body.avatar_emoji?.slice(0, 4) || "🧑";

    await sql`
      INSERT INTO human_users (id, session_id, display_name, username, avatar_emoji, last_seen)
      VALUES (${uuidv4()}, ${session_id}, ${name}, ${username}, ${emoji}, NOW())
      ON CONFLICT (session_id) DO UPDATE SET
        display_name = ${name},
        username = COALESCE(human_users.username, ${username}),
        avatar_emoji = ${emoji},
        last_seen = NOW()
    `;

    return NextResponse.json({
      success: true,
      user: { username, display_name: name, avatar_emoji: emoji, session_id },
    });
  }

  // ── Wallet-based authentication ──
  // Users in Phantom's in-app browser can sign a message to prove wallet ownership
  // and log into their linked account (bypasses Google OAuth)
  if (action === "wallet_login") {
    const { wallet_address } = body;

    if (!wallet_address) {
      return NextResponse.json({ error: "Wallet address required" }, { status: 400 });
    }

    // Find user by linked Phantom wallet
    const users = await sql`
      SELECT id, session_id, display_name, username, avatar_emoji, bio, phantom_wallet_address
      FROM human_users
      WHERE phantom_wallet_address = ${wallet_address} AND username IS NOT NULL
    `;

    if (users.length > 0) {
      const user = users[0];
      // Update session_id so localStorage syncs with the account
      const newSessionId = session_id || user.session_id;
      if (session_id && session_id !== user.session_id) {
        await sql`
          UPDATE human_users SET session_id = ${session_id}, last_seen = NOW() WHERE id = ${user.id}
        `;
      } else {
        await sql`UPDATE human_users SET last_seen = NOW() WHERE id = ${user.id}`;
      }

      return NextResponse.json({
        success: true,
        found_existing: true,
        user: {
          username: user.username,
          display_name: user.display_name,
          avatar_emoji: user.avatar_emoji,
          bio: user.bio || "",
          session_id: newSessionId,
          phantom_wallet_address: user.phantom_wallet_address,
        },
      });
    }

    // No existing user with this wallet — create a new wallet-based account
    const newSessionId = session_id || uuidv4();
    const shortAddr = wallet_address.slice(0, 6);
    const username = `wallet_${shortAddr.toLowerCase()}`;
    const userId = uuidv4();

    // Check for username collision
    const taken = await sql`SELECT id FROM human_users WHERE username = ${username}`;
    const finalUsername = taken.length > 0
      ? `${username}_${Math.floor(Math.random() * 999)}`
      : username;

    await sql`
      INSERT INTO human_users (id, session_id, display_name, username, avatar_emoji, phantom_wallet_address, auth_provider, last_seen)
      VALUES (${userId}, ${newSessionId}, ${`Wallet ${shortAddr}...`}, ${finalUsername}, '👛', ${wallet_address}, 'wallet', NOW())
      ON CONFLICT (session_id) DO UPDATE SET
        display_name = COALESCE(human_users.display_name, ${`Wallet ${shortAddr}...`}),
        username = COALESCE(human_users.username, ${finalUsername}),
        phantom_wallet_address = ${wallet_address},
        auth_provider = COALESCE(human_users.auth_provider, 'wallet'),
        last_seen = NOW()
    `;

    return NextResponse.json({
      success: true,
      found_existing: false,
      user: {
        username: finalUsername,
        display_name: `Wallet ${shortAddr}...`,
        avatar_emoji: "👛",
        session_id: newSessionId,
        phantom_wallet_address: wallet_address,
      },
    });
  }

  // ── Link wallet to existing profile ──
  // Allows Google/GitHub/X-authenticated users to attach their Phantom wallet
  if (action === "link_wallet") {
    const { wallet_address } = body;

    if (!session_id || !wallet_address) {
      return NextResponse.json({ error: "Session and wallet address required" }, { status: 400 });
    }

    // Check if this wallet is already linked to a different account
    const existing = await sql`
      SELECT session_id, username FROM human_users
      WHERE phantom_wallet_address = ${wallet_address} AND session_id != ${session_id}
    `;
    if (existing.length > 0) {
      return NextResponse.json({
        error: `This wallet is already linked to @${existing[0].username || "another account"}.`,
      }, { status: 409 });
    }

    await sql`
      UPDATE human_users
      SET phantom_wallet_address = ${wallet_address}, updated_at = NOW()
      WHERE session_id = ${session_id}
    `;

    return NextResponse.json({
      success: true,
      wallet_address,
      message: "Wallet linked to your profile! You can now sign in via wallet in Phantom.",
    });
  }

  // ── Unlink wallet from profile ──
  if (action === "unlink_wallet") {
    if (!session_id) {
      return NextResponse.json({ error: "Session required" }, { status: 400 });
    }

    await sql`
      UPDATE human_users
      SET phantom_wallet_address = NULL, updated_at = NOW()
      WHERE session_id = ${session_id}
    `;

    return NextResponse.json({
      success: true,
      message: "Wallet unlinked from your profile.",
    });
  }

  // ── Get wallet address for profile ──
  if (action === "get_wallet") {
    if (!session_id) {
      return NextResponse.json({ error: "Session required" }, { status: 400 });
    }

    const users = await sql`
      SELECT phantom_wallet_address FROM human_users WHERE session_id = ${session_id}
    `;

    return NextResponse.json({
      wallet_address: users.length > 0 ? users[0].phantom_wallet_address || null : null,
    });
  }

  // Sign out — allow the client to clear localStorage
  if (action === "signout") {
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
