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
  try {
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
    // and migrate all related data so nothing is lost
    if (session_id && session_id !== user.session_id) {
      const oldSid = user.session_id;
      await sql`
        UPDATE human_users SET session_id = ${session_id}, last_seen = NOW() WHERE id = ${user.id}
      `;
      // Migrate all user data from old session_id to new session_id
      try { await sql`UPDATE human_likes SET session_id = ${session_id} WHERE session_id = ${oldSid}`; } catch { /* table may not exist */ }
      try { await sql`UPDATE human_comments SET session_id = ${session_id} WHERE session_id = ${oldSid}`; } catch { /* table may not exist */ }
      try { await sql`UPDATE human_bookmarks SET session_id = ${session_id} WHERE session_id = ${oldSid}`; } catch { /* table may not exist */ }
      try { await sql`UPDATE human_subscriptions SET session_id = ${session_id} WHERE session_id = ${oldSid}`; } catch { /* table may not exist */ }
      try { await sql`UPDATE minted_nfts SET owner_id = ${session_id} WHERE owner_type = 'human' AND owner_id = ${oldSid}`; } catch { /* table may not exist */ }
      try { await sql`UPDATE marketplace_purchases SET session_id = ${session_id} WHERE session_id = ${oldSid}`; } catch { /* table may not exist */ }
      try { await sql`UPDATE glitch_coins SET session_id = ${session_id} WHERE session_id = ${oldSid}`; } catch { /* table may not exist */ }
      try { await sql`UPDATE solana_wallets SET owner_id = ${session_id} WHERE owner_type = 'human' AND owner_id = ${oldSid}`; } catch { /* table may not exist */ }
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
      SELECT id, display_name, username, avatar_emoji, avatar_url, bio, created_at, phantom_wallet_address
      FROM human_users
      WHERE session_id = ${session_id} AND username IS NOT NULL
    `;

    if (users.length === 0) {
      return NextResponse.json({ user: null });
    }

    const user = users[0];

    // NOTE: Orphan recovery was moved to wallet_login flow only (not every profile load).
    // Running a 4-table UNION scan on every profile request was causing slow page loads.

    // Get their stats — run all 4 counts in parallel for speed.
    // If user has a wallet, also count data under any old session_ids from the same wallet
    // (covers data that wasn't migrated during wallet_login session merges).
    const walletAddr = user.phantom_wallet_address as string | null;
    let likes = 0, comments = 0, bookmarks = 0, subscriptions = 0;
    try {
      // Build a list of all session_ids that belong to this wallet user
      let sessionIds = [session_id];
      if (walletAddr) {
        try {
          const walletSessions = await sql`
            SELECT DISTINCT session_id FROM human_users WHERE phantom_wallet_address = ${walletAddr}
          `;
          sessionIds = walletSessions.map(r => r.session_id as string);
          if (!sessionIds.includes(session_id)) sessionIds.push(session_id);
        } catch { /* use single session fallback */ }
      }

      const [likeRes, commentRes, bookmarkRes, subRes] = await Promise.all([
        sql`SELECT COUNT(*) as count FROM human_likes WHERE session_id = ANY(${sessionIds})`.catch(() => [{ count: 0 }]),
        sql`SELECT COUNT(*) as count FROM human_comments WHERE session_id = ANY(${sessionIds})`.catch(() => [{ count: 0 }]),
        sql`SELECT COUNT(*) as count FROM human_bookmarks WHERE session_id = ANY(${sessionIds})`.catch(() => [{ count: 0 }]),
        sql`SELECT COUNT(*) as count FROM human_subscriptions WHERE session_id = ANY(${sessionIds})`.catch(() => [{ count: 0 }]),
      ]);
      likes = Number(likeRes[0]?.count || 0);
      comments = Number(commentRes[0]?.count || 0);
      bookmarks = Number(bookmarkRes[0]?.count || 0);
      subscriptions = Number(subRes[0]?.count || 0);
    } catch { /* stats fetch failed, return zeros */ }

    return NextResponse.json({
      user: {
        ...user,
        stats: { likes, comments, bookmarks, subscriptions },
      },
    });
  }

  // Update profile
  if (action === "update") {
    const { display_name, avatar_emoji, avatar_url, bio, username } = body;

    if (!session_id) {
      return NextResponse.json({ error: "Session required" }, { status: 400 });
    }

    // Username uniqueness check — must not collide with AI personas OR other meatbags
    if (username) {
      const normalizedUsername = String(username).trim().toLowerCase();
      if (!/^[a-z0-9_]{3,24}$/.test(normalizedUsername)) {
        return NextResponse.json({
          error: "Username must be 3-24 chars, lowercase letters/numbers/underscore only",
        }, { status: 400 });
      }
      // Check against ai_personas
      const [personaClash] = await sql`
        SELECT 1 FROM ai_personas WHERE LOWER(username) = ${normalizedUsername} LIMIT 1
      ` as unknown as [{ "?column?": number } | undefined];
      if (personaClash) {
        return NextResponse.json({
          error: `Username "${normalizedUsername}" is already taken by an AI persona`,
        }, { status: 409 });
      }
      // Check against other meatbags (exclude current user)
      const [meatbagClash] = await sql`
        SELECT 1 FROM human_users
        WHERE LOWER(username) = ${normalizedUsername}
          AND session_id != ${session_id}
        LIMIT 1
      ` as unknown as [{ "?column?": number } | undefined];
      if (meatbagClash) {
        return NextResponse.json({
          error: `Username "${normalizedUsername}" is already taken`,
        }, { status: 409 });
      }
    }

    const normalizedUsername = username ? String(username).trim().toLowerCase() : null;

    await sql`
      UPDATE human_users SET
        display_name = COALESCE(${display_name || null}, display_name),
        avatar_emoji = COALESCE(${avatar_emoji || null}, avatar_emoji),
        avatar_url = COALESCE(${avatar_url ?? null}, avatar_url),
        bio = COALESCE(${bio !== undefined ? bio : null}, bio),
        username = COALESCE(${normalizedUsername}, username),
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
    let users;
    try {
      users = await sql`
        SELECT id, session_id, display_name, username, avatar_emoji, bio, phantom_wallet_address
        FROM human_users
        WHERE phantom_wallet_address = ${wallet_address} AND username IS NOT NULL
      `;
    } catch (err) {
      console.error("[wallet_login] SELECT failed:", err);
      return NextResponse.json({ error: "Database query failed", detail: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }

    if (users.length > 0) {
      const user = users[0];
      // Update session_id so localStorage syncs with the account
      const newSessionId = session_id || user.session_id;
      if (session_id && session_id !== user.session_id) {
        const oldSid = user.session_id;
        // The browser has a DIFFERENT session_id than the wallet account.
        // There may be a "stub" row for the browser's session_id — delete it first
        // to avoid unique constraint violation, then migrate its data to the wallet account.
        try {
          // Delete the browser's stub user row first to free up the session_id
          await sql`DELETE FROM human_users WHERE session_id = ${session_id} AND id != ${user.id}`;
          // Now update the wallet account's session_id to match the browser
          await sql`
            UPDATE human_users SET session_id = ${session_id}, last_seen = NOW() WHERE id = ${user.id}
          `;
          // Migrate ALL data from old session_id to new one.
          // Use NOT IN subqueries to skip rows that would violate unique constraints.
          // NEVER delete leftover rows — they may still hold valid user data.
          const s = session_id, o = oldSid;
          const migrated: string[] = [];
          try { await sql`UPDATE human_likes SET session_id = ${s} WHERE session_id = ${o} AND post_id NOT IN (SELECT post_id FROM human_likes WHERE session_id = ${s})`; migrated.push("likes"); } catch { /* ok */ }
          try { await sql`UPDATE human_comments SET session_id = ${s} WHERE session_id = ${o}`; migrated.push("comments"); } catch { /* ok */ }
          try { await sql`UPDATE human_bookmarks SET session_id = ${s} WHERE session_id = ${o} AND post_id NOT IN (SELECT post_id FROM human_bookmarks WHERE session_id = ${s})`; migrated.push("bookmarks"); } catch { /* ok */ }
          try { await sql`UPDATE human_subscriptions SET session_id = ${s} WHERE session_id = ${o} AND persona_id NOT IN (SELECT persona_id FROM human_subscriptions WHERE session_id = ${s})`; migrated.push("subs"); } catch { /* ok */ }
          try { await sql`UPDATE minted_nfts SET owner_id = ${s} WHERE owner_type = 'human' AND owner_id = ${o}`; migrated.push("nfts"); } catch { /* ok */ }
          try { await sql`UPDATE marketplace_purchases SET session_id = ${s} WHERE session_id = ${o} AND product_id NOT IN (SELECT product_id FROM marketplace_purchases WHERE session_id = ${s})`; migrated.push("purchases"); } catch { /* ok */ }
          try { await sql`UPDATE glitch_coins SET session_id = ${s} WHERE session_id = ${o}`; migrated.push("coins"); } catch { /* ok */ }
          try { await sql`UPDATE solana_wallets SET owner_id = ${s} WHERE owner_type = 'human' AND owner_id = ${o}`; migrated.push("wallets"); } catch { /* ok */ }
          try { await sql`UPDATE token_balances SET owner_id = ${s} WHERE owner_type = 'human' AND owner_id = ${o}`; migrated.push("tokens"); } catch { /* ok */ }
          try { await sql`UPDATE community_event_votes SET session_id = ${s} WHERE session_id = ${o}`; migrated.push("votes"); } catch { /* ok */ }
          console.log(`[wallet_login] Session merge ${o} -> ${s}: migrated [${migrated.join(", ")}]`);
        } catch (mergeErr) {
          console.error("[wallet_login] Session merge failed:", mergeErr);
          // Fallback: just use the wallet account's existing session_id
          return NextResponse.json({
            success: true,
            found_existing: true,
            user: {
              username: user.username,
              display_name: user.display_name,
              avatar_emoji: user.avatar_emoji,
              bio: user.bio || "",
              session_id: user.session_id,
              phantom_wallet_address: user.phantom_wallet_address,
            },
          });
        }
      } else {
        await sql`UPDATE human_users SET last_seen = NOW() WHERE id = ${user.id}`;
      }

      // ── Wallet-based orphan recovery ──
      // Find NFT purchases made by this wallet under OTHER sessions (e.g. user
      // bought NFTs in Safari, then later connected wallet in Phantom browser).
      // blockchain_transactions.from_address stores the buyer wallet, so we can
      // trace tx_hashes back to minted_nfts and discover orphaned session_ids.
      try {
        const orphanedSessions = await sql`
          SELECT DISTINCT mn.owner_id AS orphan_sid
          FROM blockchain_transactions bt
          JOIN minted_nfts mn ON mn.mint_tx_hash = bt.tx_hash AND mn.owner_type = 'human'
          WHERE bt.from_address = ${wallet_address}
            AND mn.owner_id != ${newSessionId}
        `;
        if (orphanedSessions.length > 0) {
          const orphanSids = orphanedSessions.map(r => r.orphan_sid as string);
          const recovered: string[] = [];
          for (const o of orphanSids) {
            const s = newSessionId;
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
            // Link orphaned user row's wallet so future queries can find it
            try { await sql`UPDATE human_users SET phantom_wallet_address = ${wallet_address} WHERE session_id = ${o} AND phantom_wallet_address IS NULL`; } catch { /* ok */ }
          }
          console.log(`[wallet_login] Orphan recovery for ${wallet_address}: found ${orphanSids.length} orphaned sessions, recovered [${recovered.join(", ")}]`);
        }
      } catch (orphanErr) {
        console.warn("[wallet_login] Orphan recovery failed (non-fatal):", orphanErr instanceof Error ? orphanErr.message : orphanErr);
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

    // No existing user with this wallet — link wallet to existing session or create new account
    const newSessionId = session_id || uuidv4();
    const shortAddr = wallet_address.slice(0, 6);

    try {
      // First, try to update an existing user row for this session_id
      const updated = await sql`
        UPDATE human_users
        SET phantom_wallet_address = ${wallet_address},
            auth_provider = COALESCE(auth_provider, 'wallet'),
            last_seen = NOW()
        WHERE session_id = ${newSessionId}
        RETURNING id, username, display_name, avatar_emoji
      `;

      if (updated.length > 0) {
        // User already exists for this session — just linked wallet
        const user = updated[0];
        return NextResponse.json({
          success: true,
          found_existing: true,
          user: {
            username: user.username,
            display_name: user.display_name,
            avatar_emoji: user.avatar_emoji,
            session_id: newSessionId,
            phantom_wallet_address: wallet_address,
          },
        });
      }

      // No existing user for this session — create new wallet-based account
      const username = `wallet_${shortAddr.toLowerCase()}`;
      const userId = uuidv4();
      const taken = await sql`SELECT id FROM human_users WHERE username = ${username}`;
      const finalUsername = taken.length > 0
        ? `${username}_${Math.floor(Math.random() * 999)}`
        : username;

      await sql`
        INSERT INTO human_users (id, session_id, display_name, username, avatar_emoji, phantom_wallet_address, auth_provider, last_seen)
        VALUES (${userId}, ${newSessionId}, ${`Wallet ${shortAddr}...`}, ${finalUsername}, '👛', ${wallet_address}, 'wallet', NOW())
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
    } catch (err) {
      console.error("[wallet_login] DB operation failed:", err);
      return NextResponse.json({ error: "Failed to create wallet account", detail: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
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

  // ── Merge old accounts into current account ──
  // Consolidates data from previous usernames into the current session
  if (action === "merge_accounts") {
    const { old_usernames } = body;

    if (!session_id || !old_usernames || !Array.isArray(old_usernames) || old_usernames.length === 0) {
      return NextResponse.json({ error: "Session and old_usernames array required" }, { status: 400 });
    }

    // Verify the current session has a valid account
    const currentUser = await sql`
      SELECT id, username FROM human_users WHERE session_id = ${session_id} AND username IS NOT NULL
    `;
    if (currentUser.length === 0) {
      return NextResponse.json({ error: "No account found for current session" }, { status: 404 });
    }

    const merged: string[] = [];
    const notFound: string[] = [];

    for (const oldUsername of old_usernames) {
      const clean = oldUsername.trim().toLowerCase();
      // Find old account by username
      const oldUsers = await sql`
        SELECT id, session_id, username FROM human_users
        WHERE LOWER(username) = ${clean} AND session_id != ${session_id}
      `;

      if (oldUsers.length === 0) {
        notFound.push(oldUsername);
        continue;
      }

      const oldSid = oldUsers[0].session_id;

      // Migrate all data from old session to current session
      try { await sql`UPDATE human_likes SET session_id = ${session_id} WHERE session_id = ${oldSid}`; } catch { /* */ }
      try { await sql`UPDATE human_comments SET session_id = ${session_id} WHERE session_id = ${oldSid}`; } catch { /* */ }
      try { await sql`UPDATE human_bookmarks SET session_id = ${session_id} WHERE session_id = ${oldSid}`; } catch { /* */ }
      try { await sql`UPDATE human_subscriptions SET session_id = ${session_id} WHERE session_id = ${oldSid}`; } catch { /* */ }
      try { await sql`UPDATE minted_nfts SET owner_id = ${session_id} WHERE owner_type = 'human' AND owner_id = ${oldSid}`; } catch { /* */ }
      try { await sql`UPDATE marketplace_purchases SET session_id = ${session_id} WHERE session_id = ${oldSid}`; } catch { /* */ }
      try { await sql`UPDATE solana_wallets SET owner_id = ${session_id} WHERE owner_type = 'human' AND owner_id = ${oldSid}`; } catch { /* */ }

      // Merge coin balances: add old balance to current
      try {
        const [oldCoins] = await sql`SELECT balance, lifetime_earned FROM glitch_coins WHERE session_id = ${oldSid}`;
        if (oldCoins && Number(oldCoins.balance) > 0) {
          await sql`
            INSERT INTO glitch_coins (session_id, balance, lifetime_earned)
            VALUES (${session_id}, ${Number(oldCoins.balance)}, ${Number(oldCoins.lifetime_earned)})
            ON CONFLICT (session_id) DO UPDATE SET
              balance = glitch_coins.balance + ${Number(oldCoins.balance)},
              lifetime_earned = glitch_coins.lifetime_earned + ${Number(oldCoins.lifetime_earned)}
          `;
          await sql`DELETE FROM glitch_coins WHERE session_id = ${oldSid}`;
        }
      } catch { /* */ }

      merged.push(oldUsers[0].username);
    }

    return NextResponse.json({
      success: true,
      current_user: currentUser[0].username,
      merged_accounts: merged,
      not_found: notFound,
      message: merged.length > 0
        ? `Merged data from ${merged.join(", ")} into @${currentUser[0].username}`
        : "No matching accounts found to merge",
    });
  }

  // Sign out — allow the client to clear localStorage
  if (action === "signout") {
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    console.error("[auth/human] Unhandled error:", err);
    return NextResponse.json(
      { error: "Internal server error", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
