import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  const action = request.nextUrl.searchParams.get("action");
  const userId = request.nextUrl.searchParams.get("user_id");

  // Get detailed info for a single user
  if (action === "detail" && userId) {
    const users = await sql`
      SELECT id, session_id, display_name, username, email, avatar_emoji, bio,
             auth_provider, phantom_wallet_address, is_active, created_at, last_seen
      FROM human_users WHERE id = ${userId}
    `;
    if (users.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const user = users[0];
    const sid = user.session_id as string;

    // Fetch all related data in parallel
    const [likes, comments, bookmarks, subs, nfts, purchases, coins, interests] = await Promise.all([
      sql`SELECT COUNT(*) as count FROM human_likes WHERE session_id = ${sid}`.catch(() => [{ count: 0 }]),
      sql`SELECT COUNT(*) as count FROM human_comments WHERE session_id = ${sid}`.catch(() => [{ count: 0 }]),
      sql`SELECT COUNT(*) as count FROM human_bookmarks WHERE session_id = ${sid}`.catch(() => [{ count: 0 }]),
      sql`SELECT COUNT(*) as count FROM human_subscriptions WHERE session_id = ${sid}`.catch(() => [{ count: 0 }]),
      sql`SELECT id, product_name, product_emoji, mint_address, rarity, edition_number, created_at FROM minted_nfts WHERE owner_type = 'human' AND owner_id = ${sid} ORDER BY created_at DESC`.catch(() => []),
      sql`SELECT product_id, product_name, product_emoji, price_paid, created_at FROM marketplace_purchases WHERE session_id = ${sid} ORDER BY created_at DESC`.catch(() => []),
      sql`SELECT balance, lifetime_earned FROM glitch_coins WHERE session_id = ${sid}`.catch(() => []),
      sql`SELECT interest_tag, weight FROM human_interests WHERE session_id = ${sid} ORDER BY weight DESC`.catch(() => []),
    ]);

    return NextResponse.json({
      user: {
        ...user,
        stats: {
          likes: Number(likes[0]?.count || 0),
          comments: Number(comments[0]?.count || 0),
          bookmarks: Number(bookmarks[0]?.count || 0),
          subscriptions: Number(subs[0]?.count || 0),
        },
        nfts,
        purchases,
        coins: coins.length > 0 ? { balance: Number(coins[0].balance), lifetime_earned: Number(coins[0].lifetime_earned) } : { balance: 0, lifetime_earned: 0 },
        interests,
      },
    });
  }

  // Default: list all registered users with full profile data
  const users = await sql`
    SELECT
      hu.id, hu.session_id, hu.display_name, hu.username, hu.email,
      hu.avatar_emoji, hu.bio, hu.auth_provider, hu.phantom_wallet_address,
      hu.is_active, hu.created_at, hu.last_seen
    FROM human_users hu
    WHERE hu.username IS NOT NULL
    ORDER BY hu.last_seen DESC
    LIMIT 200
  `;

  // Batch fetch counts for all users
  const sessionIds = users.map(u => u.session_id as string);
  let likeCounts: Record<string, number> = {};
  let commentCounts: Record<string, number> = {};
  let nftCounts: Record<string, number> = {};
  let coinBalances: Record<string, number> = {};

  if (sessionIds.length > 0) {
    const [likeRows, commentRows, nftRows, coinRows] = await Promise.all([
      sql`SELECT session_id, COUNT(*) as count FROM human_likes WHERE session_id = ANY(${sessionIds}) GROUP BY session_id`.catch(() => []),
      sql`SELECT session_id, COUNT(*) as count FROM human_comments WHERE session_id = ANY(${sessionIds}) GROUP BY session_id`.catch(() => []),
      sql`SELECT owner_id, COUNT(*) as count FROM minted_nfts WHERE owner_type = 'human' AND owner_id = ANY(${sessionIds}) GROUP BY owner_id`.catch(() => []),
      sql`SELECT session_id, balance FROM glitch_coins WHERE session_id = ANY(${sessionIds})`.catch(() => []),
    ]);
    for (const r of likeRows) likeCounts[r.session_id as string] = Number(r.count);
    for (const r of commentRows) commentCounts[r.session_id as string] = Number(r.count);
    for (const r of nftRows) nftCounts[r.owner_id as string] = Number(r.count);
    for (const r of coinRows) coinBalances[r.session_id as string] = Number(r.balance);
  }

  const usersWithStats = users.map(u => {
    const sid = u.session_id as string;
    return {
      ...u,
      likes: likeCounts[sid] || 0,
      comments: commentCounts[sid] || 0,
      nfts: nftCounts[sid] || 0,
      coin_balance: coinBalances[sid] || 0,
    };
  });

  return NextResponse.json({ users: usersWithStats });
}

// UPDATE user
export async function PATCH(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  const body = await request.json();
  const { user_id, display_name, username, bio, avatar_emoji, is_active } = body;

  if (!user_id) {
    return NextResponse.json({ error: "user_id required" }, { status: 400 });
  }

  // Check user exists
  const existing = await sql`SELECT id, username FROM human_users WHERE id = ${user_id}`;
  if (existing.length === 0) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // If changing username, check uniqueness
  if (username && username !== existing[0].username) {
    const taken = await sql`SELECT id FROM human_users WHERE username = ${username} AND id != ${user_id}`;
    if (taken.length > 0) {
      return NextResponse.json({ error: "Username already taken" }, { status: 409 });
    }
  }

  await sql`
    UPDATE human_users SET
      display_name = COALESCE(${display_name || null}, display_name),
      username = COALESCE(${username || null}, username),
      bio = COALESCE(${bio !== undefined ? bio : null}, bio),
      avatar_emoji = COALESCE(${avatar_emoji || null}, avatar_emoji),
      is_active = COALESCE(${is_active !== undefined ? is_active : null}, is_active),
      updated_at = NOW()
    WHERE id = ${user_id}
  `;

  return NextResponse.json({ success: true, message: `User ${existing[0].username} updated` });
}

// DELETE user and all associated data
export async function DELETE(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  const { user_id } = await request.json();

  if (!user_id) {
    return NextResponse.json({ error: "user_id required" }, { status: 400 });
  }

  const existing = await sql`SELECT id, session_id, username FROM human_users WHERE id = ${user_id}`;
  if (existing.length === 0) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const sid = existing[0].session_id as string;
  const uname = existing[0].username;

  // Delete all associated data
  try { await sql`DELETE FROM human_likes WHERE session_id = ${sid}`; } catch { /* */ }
  try { await sql`DELETE FROM human_comments WHERE session_id = ${sid}`; } catch { /* */ }
  try { await sql`DELETE FROM human_bookmarks WHERE session_id = ${sid}`; } catch { /* */ }
  try { await sql`DELETE FROM human_subscriptions WHERE session_id = ${sid}`; } catch { /* */ }
  try { await sql`DELETE FROM human_interests WHERE session_id = ${sid}`; } catch { /* */ }
  try { await sql`DELETE FROM marketplace_purchases WHERE session_id = ${sid}`; } catch { /* */ }
  try { await sql`DELETE FROM glitch_coins WHERE session_id = ${sid}`; } catch { /* */ }
  try { await sql`DELETE FROM minted_nfts WHERE owner_type = 'human' AND owner_id = ${sid}`; } catch { /* */ }
  try { await sql`DELETE FROM solana_wallets WHERE owner_type = 'human' AND owner_id = ${sid}`; } catch { /* */ }

  // Delete the user record itself
  await sql`DELETE FROM human_users WHERE id = ${user_id}`;

  return NextResponse.json({ success: true, message: `User @${uname} and all associated data deleted` });
}
