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

  // Debug: show all wallet-connected users with their stats across ALL sessions
  if (action === "wallet_debug") {
    const walletUsers = await sql`
      SELECT id, session_id, display_name, username, phantom_wallet_address, created_at, last_seen
      FROM human_users
      WHERE phantom_wallet_address IS NOT NULL AND phantom_wallet_address != ''
      ORDER BY last_seen DESC NULLS LAST
    `;

    const results = [];
    for (const wu of walletUsers) {
      const wallet = wu.phantom_wallet_address as string;
      const sid = wu.session_id as string;

      // Find ALL session_ids linked to this wallet
      const allSessions = await sql`
        SELECT id, session_id, username, created_at FROM human_users WHERE phantom_wallet_address = ${wallet}
      `;

      const allSids = allSessions.map(s => s.session_id as string);

      // Count stats across ALL sessions for this wallet
      const [likes, comments, bookmarks, subs, nfts, purchases] = await Promise.all([
        sql`SELECT COUNT(*) as count FROM human_likes WHERE session_id = ANY(${allSids})`.catch(() => [{ count: 0 }]),
        sql`SELECT COUNT(*) as count FROM human_comments WHERE session_id = ANY(${allSids})`.catch(() => [{ count: 0 }]),
        sql`SELECT COUNT(*) as count FROM human_bookmarks WHERE session_id = ANY(${allSids})`.catch(() => [{ count: 0 }]),
        sql`SELECT COUNT(*) as count FROM human_subscriptions WHERE session_id = ANY(${allSids})`.catch(() => [{ count: 0 }]),
        sql`SELECT COUNT(*) as count FROM minted_nfts WHERE owner_type = 'human' AND owner_id = ANY(${allSids})`.catch(() => [{ count: 0 }]),
        sql`SELECT COUNT(*) as count FROM marketplace_purchases WHERE session_id = ANY(${allSids})`.catch(() => [{ count: 0 }]),
      ]);

      // Also check stats for just current session
      const [curLikes] = await sql`SELECT COUNT(*) as count FROM human_likes WHERE session_id = ${sid}`.catch(() => [{ count: 0 }]);

      results.push({
        user: { id: wu.id, username: wu.username, display_name: wu.display_name, wallet, created_at: wu.created_at, last_seen: wu.last_seen },
        currentSessionId: sid,
        allSessionIds: allSids,
        sessionCount: allSids.length,
        allSessions: allSessions.map(s => ({ id: s.id, session_id: s.session_id, username: s.username, created_at: s.created_at })),
        statsAcrossAllSessions: {
          likes: Number(likes[0]?.count || 0),
          comments: Number(comments[0]?.count || 0),
          bookmarks: Number(bookmarks[0]?.count || 0),
          subscriptions: Number(subs[0]?.count || 0),
          nfts: Number(nfts[0]?.count || 0),
          purchases: Number(purchases[0]?.count || 0),
        },
        currentSessionLikes: Number(curLikes?.count || 0),
      });
    }

    return NextResponse.json({ walletUsers: results, totalWalletUsers: results.length });
  }

  // ── Recover orphaned data for a wallet ──
  // Finds NFT purchases made by a wallet under sessions not linked to it,
  // and migrates all data from those orphaned sessions to the wallet's current session.
  if (action === "recover_orphans") {
    const wallet = request.nextUrl.searchParams.get("wallet");
    if (!wallet) {
      return NextResponse.json({ error: "wallet parameter required" }, { status: 400 });
    }

    // Find the wallet's current session
    const walletUsers = await sql`
      SELECT session_id FROM human_users WHERE phantom_wallet_address = ${wallet} AND username IS NOT NULL LIMIT 1
    `;
    if (walletUsers.length === 0) {
      return NextResponse.json({ error: "No user found for this wallet" }, { status: 404 });
    }
    const currentSid = walletUsers[0].session_id as string;

    // Find orphaned sessions via blockchain_transactions -> minted_nfts join
    const orphanedSessions = await sql`
      SELECT DISTINCT mn.owner_id AS orphan_sid
      FROM blockchain_transactions bt
      JOIN minted_nfts mn ON mn.mint_tx_hash = bt.tx_hash AND mn.owner_type = 'human'
      WHERE bt.from_address = ${wallet}
        AND mn.owner_id != ${currentSid}
    `;

    if (orphanedSessions.length === 0) {
      // Also check for orphaned marketplace_purchases via blockchain_transactions
      const orphanedPurchases = await sql`
        SELECT DISTINCT mp.session_id AS orphan_sid
        FROM blockchain_transactions bt
        JOIN marketplace_purchases mp ON mp.id::text IN (
          SELECT reference_id FROM coin_transactions WHERE reason LIKE 'NFT Purchase%' AND session_id != ${currentSid}
        )
        WHERE bt.from_address = ${wallet}
      `.catch(() => []);

      if (orphanedPurchases.length === 0) {
        return NextResponse.json({
          message: "No orphaned sessions found for this wallet",
          wallet,
          currentSessionId: currentSid,
        });
      }
    }

    const orphanSids = orphanedSessions.map(r => r.orphan_sid as string);

    // Show what we found before migrating
    const dryRun = request.nextUrl.searchParams.get("dry_run") === "true";
    const orphanDetails = [];
    for (const o of orphanSids) {
      const [nfts, purchases, likes, comments] = await Promise.all([
        sql`SELECT COUNT(*) as count FROM minted_nfts WHERE owner_type = 'human' AND owner_id = ${o}`.catch(() => [{ count: 0 }]),
        sql`SELECT COUNT(*) as count FROM marketplace_purchases WHERE session_id = ${o}`.catch(() => [{ count: 0 }]),
        sql`SELECT COUNT(*) as count FROM human_likes WHERE session_id = ${o}`.catch(() => [{ count: 0 }]),
        sql`SELECT COUNT(*) as count FROM human_comments WHERE session_id = ${o}`.catch(() => [{ count: 0 }]),
      ]);
      orphanDetails.push({
        session_id: o,
        nfts: Number(nfts[0]?.count || 0),
        purchases: Number(purchases[0]?.count || 0),
        likes: Number(likes[0]?.count || 0),
        comments: Number(comments[0]?.count || 0),
      });
    }

    if (dryRun) {
      return NextResponse.json({
        dry_run: true,
        wallet,
        currentSessionId: currentSid,
        orphanedSessions: orphanDetails,
        totalOrphans: orphanSids.length,
      });
    }

    // Migrate all data from orphaned sessions to current session
    const recovered: string[] = [];
    for (const o of orphanSids) {
      const s = currentSid;
      try { await sql`UPDATE human_likes SET session_id = ${s} WHERE session_id = ${o} AND post_id NOT IN (SELECT post_id FROM human_likes WHERE session_id = ${s})`; recovered.push(`likes(${o.slice(0,8)})`); } catch { /* ok */ }
      try { await sql`UPDATE human_comments SET session_id = ${s} WHERE session_id = ${o}`; recovered.push(`comments(${o.slice(0,8)})`); } catch { /* ok */ }
      try { await sql`UPDATE human_bookmarks SET session_id = ${s} WHERE session_id = ${o} AND post_id NOT IN (SELECT post_id FROM human_bookmarks WHERE session_id = ${s})`; recovered.push(`bookmarks(${o.slice(0,8)})`); } catch { /* ok */ }
      try { await sql`UPDATE human_subscriptions SET session_id = ${s} WHERE session_id = ${o} AND persona_id NOT IN (SELECT persona_id FROM human_subscriptions WHERE session_id = ${s})`; recovered.push(`subs(${o.slice(0,8)})`); } catch { /* ok */ }
      try { await sql`UPDATE minted_nfts SET owner_id = ${s} WHERE owner_type = 'human' AND owner_id = ${o}`; recovered.push(`nfts(${o.slice(0,8)})`); } catch { /* ok */ }
      try { await sql`UPDATE marketplace_purchases SET session_id = ${s} WHERE session_id = ${o} AND product_id NOT IN (SELECT product_id FROM marketplace_purchases WHERE session_id = ${s})`; recovered.push(`purchases(${o.slice(0,8)})`); } catch { /* ok */ }
      try { await sql`UPDATE glitch_coins SET session_id = ${s} WHERE session_id = ${o}`; recovered.push(`coins(${o.slice(0,8)})`); } catch { /* ok */ }
      try { await sql`UPDATE solana_wallets SET owner_id = ${s} WHERE owner_type = 'human' AND owner_id = ${o}`; recovered.push(`wallets(${o.slice(0,8)})`); } catch { /* ok */ }
      try { await sql`UPDATE token_balances SET owner_id = ${s} WHERE owner_type = 'human' AND owner_id = ${o}`; recovered.push(`tokens(${o.slice(0,8)})`); } catch { /* ok */ }
      try { await sql`UPDATE community_event_votes SET session_id = ${s} WHERE session_id = ${o}`; recovered.push(`votes(${o.slice(0,8)})`); } catch { /* ok */ }
      // Link orphaned user row's wallet
      try { await sql`UPDATE human_users SET phantom_wallet_address = ${wallet} WHERE session_id = ${o} AND phantom_wallet_address IS NULL`; } catch { /* ok */ }
    }

    return NextResponse.json({
      success: true,
      wallet,
      currentSessionId: currentSid,
      orphanedSessionsMigrated: orphanSids,
      recovered,
      orphanDetails,
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
