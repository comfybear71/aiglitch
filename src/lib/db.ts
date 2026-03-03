import { neon, NeonQueryFunction } from "@neondatabase/serverless";
import { env } from "@/lib/bible/env";

let _cachedSql: NeonQueryFunction<false, false> | null = null;

export function getDb() {
  if (_cachedSql) return _cachedSql;
  _cachedSql = neon(env.databaseUrl);
  return _cachedSql;
}

// Module-level helper: runs a migration, skips silently if it fails (e.g. column already exists)
async function safeMigrate(sql: NeonQueryFunction<false, false>, label: string, fn: () => Promise<unknown>) {
  try { await fn(); } catch (e) {
    console.warn(`Migration "${label}" skipped:`, e instanceof Error ? e.message : e);
  }
}

export async function initializeDb() {
  const sql = getDb();

  await sql`
    CREATE TABLE IF NOT EXISTS ai_personas (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      avatar_emoji TEXT NOT NULL DEFAULT '🤖',
      avatar_url TEXT,
      personality TEXT NOT NULL,
      bio TEXT NOT NULL,
      persona_type TEXT NOT NULL DEFAULT 'general',
      human_backstory TEXT NOT NULL DEFAULT '',
      follower_count INTEGER NOT NULL DEFAULT 0,
      post_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      is_active BOOLEAN NOT NULL DEFAULT TRUE
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      persona_id TEXT NOT NULL REFERENCES ai_personas(id),
      content TEXT NOT NULL,
      post_type TEXT NOT NULL DEFAULT 'text',
      media_url TEXT,
      media_type TEXT DEFAULT 'image',
      hashtags TEXT,
      like_count INTEGER NOT NULL DEFAULT 0,
      ai_like_count INTEGER NOT NULL DEFAULT 0,
      comment_count INTEGER NOT NULL DEFAULT 0,
      share_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      is_reply_to TEXT REFERENCES posts(id),
      reply_to_comment_id TEXT,
      reply_to_comment_type TEXT,
      is_collab_with TEXT,
      challenge_tag TEXT,
      beef_thread_id TEXT
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS ai_interactions (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES posts(id),
      persona_id TEXT NOT NULL REFERENCES ai_personas(id),
      interaction_type TEXT NOT NULL,
      content TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS human_users (
      id TEXT PRIMARY KEY,
      session_id TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL DEFAULT 'Meat Bag',
      username TEXT,
      email TEXT,
      password_hash TEXT,
      avatar_emoji TEXT NOT NULL DEFAULT '🧑',
      bio TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      is_active BOOLEAN NOT NULL DEFAULT TRUE
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS human_likes (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES posts(id),
      session_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(post_id, session_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS human_subscriptions (
      id TEXT PRIMARY KEY,
      persona_id TEXT NOT NULL REFERENCES ai_personas(id),
      session_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(persona_id, session_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS human_interests (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      interest_tag TEXT NOT NULL,
      weight REAL NOT NULL DEFAULT 1.0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(session_id, interest_tag)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS human_comments (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES posts(id),
      session_id TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT 'Meat Bag',
      content TEXT NOT NULL,
      like_count INTEGER NOT NULL DEFAULT 0,
      parent_comment_id TEXT,
      parent_comment_type TEXT CHECK (parent_comment_type IN ('ai', 'human')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Comment likes (works for both AI and human comments)
  await sql`
    CREATE TABLE IF NOT EXISTS comment_likes (
      id TEXT PRIMARY KEY,
      comment_id TEXT NOT NULL,
      comment_type TEXT NOT NULL CHECK (comment_type IN ('ai', 'human')),
      session_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(comment_id, comment_type, session_id)
    )
  `;

  // Bookmarks table
  await sql`
    CREATE TABLE IF NOT EXISTS human_bookmarks (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES posts(id),
      session_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(post_id, session_id)
    )
  `;

  // AI beef threads — ongoing storylines between personas
  await sql`
    CREATE TABLE IF NOT EXISTS ai_beef_threads (
      id TEXT PRIMARY KEY,
      persona_a TEXT NOT NULL REFERENCES ai_personas(id),
      persona_b TEXT NOT NULL REFERENCES ai_personas(id),
      topic TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      post_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // AI challenges — trending challenges AIs participate in
  await sql`
    CREATE TABLE IF NOT EXISTS ai_challenges (
      id TEXT PRIMARY KEY,
      tag TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      created_by TEXT REFERENCES ai_personas(id),
      participant_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Daily topics — satirized current events for AI personas to discuss
  await sql`
    CREATE TABLE IF NOT EXISTS daily_topics (
      id TEXT PRIMARY KEY,
      headline TEXT NOT NULL,
      summary TEXT NOT NULL,
      original_theme TEXT NOT NULL,
      anagram_mappings TEXT NOT NULL,
      mood TEXT NOT NULL DEFAULT 'neutral',
      category TEXT NOT NULL DEFAULT 'world',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '48 hours'),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // View history for humans
  await sql`
    CREATE TABLE IF NOT EXISTS human_view_history (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES posts(id),
      session_id TEXT NOT NULL,
      viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // DM conversations between humans and AI personas
  await sql`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      persona_id TEXT NOT NULL REFERENCES ai_personas(id),
      last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(session_id, persona_id)
    )
  `;

  // Individual messages within conversations
  await sql`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id),
      sender_type TEXT NOT NULL CHECK (sender_type IN ('human', 'ai')),
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Media library — pre-uploaded memes/videos for AI bots to use
  await sql`
    CREATE TABLE IF NOT EXISTS media_library (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video', 'meme')),
      persona_id TEXT DEFAULT NULL,
      tags TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      used_count INTEGER NOT NULL DEFAULT 0,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Notifications — tracks AI replies to human comments, DM messages, etc.
  await sql`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      persona_id TEXT NOT NULL,
      post_id TEXT,
      reply_id TEXT,
      content_preview TEXT NOT NULL DEFAULT '',
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Run all migrations, indexes, later tables, and seeds
  await runMigrations();
}

// ── MIGRATIONS ──
// Exported so seed.ts fast-path can call this directly without running full initializeDb().
// EVERY operation here is idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING).
// New columns, tables, indexes, and seeds go HERE — they will ALWAYS run,
// even on existing databases that skip initializeDb() via the fast-path.
//
// PERFORMANCE: All operations run in parallel batches (not sequentially).
// On Neon HTTP, each query is ~200ms network latency. Running 130+ queries
// sequentially = 26s. Running in 4 parallel batches = ~1-2s.
export async function runMigrations() {
  const sql = getDb();

  // ── Batch 1: Column migrations (all independent, safe to parallelize) ──
  await Promise.allSettled([
    safeMigrate(sql, "ai_personas.avatar_url", () => sql`ALTER TABLE ai_personas ADD COLUMN IF NOT EXISTS avatar_url TEXT`),
    safeMigrate(sql, "ai_personas.activity_level", () => sql`ALTER TABLE ai_personas ADD COLUMN IF NOT EXISTS activity_level INTEGER NOT NULL DEFAULT 3`),
    safeMigrate(sql, "ai_personas.avatar_updated_at", () => sql`ALTER TABLE ai_personas ADD COLUMN IF NOT EXISTS avatar_updated_at TIMESTAMPTZ`),
    safeMigrate(sql, "posts.is_collab_with", () => sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_collab_with TEXT`),
    safeMigrate(sql, "posts.challenge_tag", () => sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS challenge_tag TEXT`),
    safeMigrate(sql, "posts.beef_thread_id", () => sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS beef_thread_id TEXT`),
    safeMigrate(sql, "posts.reply_to_comment_id", () => sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS reply_to_comment_id TEXT`),
    safeMigrate(sql, "posts.reply_to_comment_type", () => sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS reply_to_comment_type TEXT`),
    safeMigrate(sql, "posts.media_source", () => sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_source TEXT`),
    safeMigrate(sql, "human_users.username", () => sql`ALTER TABLE human_users ADD COLUMN IF NOT EXISTS username TEXT`),
    safeMigrate(sql, "human_users.password_hash", () => sql`ALTER TABLE human_users ADD COLUMN IF NOT EXISTS password_hash TEXT`),
    safeMigrate(sql, "human_users.avatar_emoji", () => sql`ALTER TABLE human_users ADD COLUMN IF NOT EXISTS avatar_emoji TEXT DEFAULT '🧑'`),
    safeMigrate(sql, "human_users.bio", () => sql`ALTER TABLE human_users ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT ''`),
    safeMigrate(sql, "human_users.email", () => sql`ALTER TABLE human_users ADD COLUMN IF NOT EXISTS email TEXT`),
    safeMigrate(sql, "human_users.auth_provider", () => sql`ALTER TABLE human_users ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'local'`),
    safeMigrate(sql, "human_users.avatar_url", () => sql`ALTER TABLE human_users ADD COLUMN IF NOT EXISTS avatar_url TEXT`),
    safeMigrate(sql, "human_users.phantom_wallet_address", () => sql`ALTER TABLE human_users ADD COLUMN IF NOT EXISTS phantom_wallet_address TEXT`),
    safeMigrate(sql, "human_users.updated_at", () => sql`ALTER TABLE human_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`),
    safeMigrate(sql, "human_comments.like_count", () => sql`ALTER TABLE human_comments ADD COLUMN IF NOT EXISTS like_count INTEGER NOT NULL DEFAULT 0`),
    safeMigrate(sql, "human_comments.parent_comment_id", () => sql`ALTER TABLE human_comments ADD COLUMN IF NOT EXISTS parent_comment_id TEXT`),
    safeMigrate(sql, "human_comments.parent_comment_type", () => sql`ALTER TABLE human_comments ADD COLUMN IF NOT EXISTS parent_comment_type TEXT`),
    safeMigrate(sql, "media_library.persona_id", () => sql`ALTER TABLE media_library ADD COLUMN IF NOT EXISTS persona_id TEXT DEFAULT NULL`),
    safeMigrate(sql, "minted_nfts.edition_number", () => sql`ALTER TABLE minted_nfts ADD COLUMN IF NOT EXISTS edition_number INTEGER`),
    safeMigrate(sql, "minted_nfts.max_supply", () => sql`ALTER TABLE minted_nfts ADD COLUMN IF NOT EXISTS max_supply INTEGER NOT NULL DEFAULT 100`),
    safeMigrate(sql, "minted_nfts.generation", () => sql`ALTER TABLE minted_nfts ADD COLUMN IF NOT EXISTS generation INTEGER NOT NULL DEFAULT 1`),
    safeMigrate(sql, "exchange_orders.trading_pair", () => sql`ALTER TABLE exchange_orders ADD COLUMN IF NOT EXISTS trading_pair TEXT DEFAULT 'GLITCH_SOL'`),
    safeMigrate(sql, "exchange_orders.base_token", () => sql`ALTER TABLE exchange_orders ADD COLUMN IF NOT EXISTS base_token TEXT DEFAULT 'GLITCH'`),
    safeMigrate(sql, "exchange_orders.quote_token", () => sql`ALTER TABLE exchange_orders ADD COLUMN IF NOT EXISTS quote_token TEXT DEFAULT 'SOL'`),
    safeMigrate(sql, "exchange_orders.quote_amount", () => sql`ALTER TABLE exchange_orders ADD COLUMN IF NOT EXISTS quote_amount REAL DEFAULT 0`),
  ]);

  // ── Batch 2: All indexes (all independent, safe to parallelize) ──
  await Promise.allSettled([
    safeMigrate(sql, "idx_human_users_username_unique", () => sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_human_users_username_unique ON human_users(username) WHERE username IS NOT NULL`),
    safeMigrate(sql, "idx_human_comments_post", () => sql`CREATE INDEX IF NOT EXISTS idx_human_comments_post ON human_comments(post_id)`),
    safeMigrate(sql, "idx_posts_created_at", () => sql`CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC)`),
    safeMigrate(sql, "idx_posts_feed_toplevel", () => sql`CREATE INDEX IF NOT EXISTS idx_posts_feed_toplevel ON posts(created_at DESC) WHERE is_reply_to IS NULL`),
    safeMigrate(sql, "idx_posts_persona_id", () => sql`CREATE INDEX IF NOT EXISTS idx_posts_persona_id ON posts(persona_id)`),
    safeMigrate(sql, "idx_ai_interactions_post_id", () => sql`CREATE INDEX IF NOT EXISTS idx_ai_interactions_post_id ON ai_interactions(post_id)`),
    safeMigrate(sql, "idx_posts_reply", () => sql`CREATE INDEX IF NOT EXISTS idx_posts_reply ON posts(is_reply_to)`),
    safeMigrate(sql, "idx_human_users_session", () => sql`CREATE INDEX IF NOT EXISTS idx_human_users_session ON human_users(session_id)`),
    safeMigrate(sql, "idx_human_interests_session", () => sql`CREATE INDEX IF NOT EXISTS idx_human_interests_session ON human_interests(session_id)`),
    safeMigrate(sql, "idx_human_likes_session", () => sql`CREATE INDEX IF NOT EXISTS idx_human_likes_session ON human_likes(session_id)`),
    safeMigrate(sql, "idx_human_bookmarks_session", () => sql`CREATE INDEX IF NOT EXISTS idx_human_bookmarks_session ON human_bookmarks(session_id)`),
    safeMigrate(sql, "idx_posts_challenge", () => sql`CREATE INDEX IF NOT EXISTS idx_posts_challenge ON posts(challenge_tag)`),
    safeMigrate(sql, "idx_posts_beef", () => sql`CREATE INDEX IF NOT EXISTS idx_posts_beef ON posts(beef_thread_id)`),
    safeMigrate(sql, "idx_human_users_username", () => sql`CREATE INDEX IF NOT EXISTS idx_human_users_username ON human_users(username)`),
    safeMigrate(sql, "idx_human_view_history_session", () => sql`CREATE INDEX IF NOT EXISTS idx_human_view_history_session ON human_view_history(session_id)`),
    safeMigrate(sql, "idx_daily_topics_active", () => sql`CREATE INDEX IF NOT EXISTS idx_daily_topics_active ON daily_topics(is_active, expires_at)`),
    safeMigrate(sql, "idx_conversations_session", () => sql`CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id, last_message_at DESC)`),
    safeMigrate(sql, "idx_media_library_type", () => sql`CREATE INDEX IF NOT EXISTS idx_media_library_type ON media_library(media_type, uploaded_at DESC)`),
    safeMigrate(sql, "idx_media_library_persona", () => sql`CREATE INDEX IF NOT EXISTS idx_media_library_persona ON media_library(persona_id, media_type)`),
    safeMigrate(sql, "idx_messages_conversation", () => sql`CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at ASC)`),
    safeMigrate(sql, "idx_comment_likes_comment", () => sql`CREATE INDEX IF NOT EXISTS idx_comment_likes_comment ON comment_likes(comment_id, comment_type)`),
    safeMigrate(sql, "idx_comment_likes_session", () => sql`CREATE INDEX IF NOT EXISTS idx_comment_likes_session ON comment_likes(session_id)`),
    safeMigrate(sql, "idx_human_comments_parent", () => sql`CREATE INDEX IF NOT EXISTS idx_human_comments_parent ON human_comments(parent_comment_id, parent_comment_type)`),
    safeMigrate(sql, "idx_notifications_session", () => sql`CREATE INDEX IF NOT EXISTS idx_notifications_session ON notifications(session_id, is_read, created_at DESC)`),
    safeMigrate(sql, "idx_notifications_session_unread", () => sql`CREATE INDEX IF NOT EXISTS idx_notifications_session_unread ON notifications(session_id, is_read) WHERE is_read = FALSE`),
    safeMigrate(sql, "idx_human_users_phantom", () => sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_human_users_phantom ON human_users(phantom_wallet_address) WHERE phantom_wallet_address IS NOT NULL`),
    safeMigrate(sql, "idx_glitch_coins_session", () => sql`CREATE INDEX IF NOT EXISTS idx_glitch_coins_session ON glitch_coins(session_id)`),
    safeMigrate(sql, "idx_coin_transactions_session", () => sql`CREATE INDEX IF NOT EXISTS idx_coin_transactions_session ON coin_transactions(session_id, created_at DESC)`),
    safeMigrate(sql, "idx_human_friends_session", () => sql`CREATE INDEX IF NOT EXISTS idx_human_friends_session ON human_friends(session_id)`),
    safeMigrate(sql, "idx_human_friends_friend", () => sql`CREATE INDEX IF NOT EXISTS idx_human_friends_friend ON human_friends(friend_session_id)`),
    safeMigrate(sql, "idx_webauthn_credential_id", () => sql`CREATE INDEX IF NOT EXISTS idx_webauthn_credential_id ON webauthn_credentials(credential_id)`),
    safeMigrate(sql, "idx_ai_persona_follows_session", () => sql`CREATE INDEX IF NOT EXISTS idx_ai_persona_follows_session ON ai_persona_follows(session_id)`),
    safeMigrate(sql, "idx_ai_persona_follows_persona", () => sql`CREATE INDEX IF NOT EXISTS idx_ai_persona_follows_persona ON ai_persona_follows(persona_id)`),
    safeMigrate(sql, "idx_pvj_status", () => sql`CREATE INDEX IF NOT EXISTS idx_pvj_status ON persona_video_jobs(status)`),
    safeMigrate(sql, "idx_pvj_persona", () => sql`CREATE INDEX IF NOT EXISTS idx_pvj_persona ON persona_video_jobs(persona_id)`),
    safeMigrate(sql, "idx_marketplace_purchases_session", () => sql`CREATE INDEX IF NOT EXISTS idx_marketplace_purchases_session ON marketplace_purchases(session_id)`),
    safeMigrate(sql, "idx_ai_persona_coins_persona", () => sql`CREATE INDEX IF NOT EXISTS idx_ai_persona_coins_persona ON ai_persona_coins(persona_id)`),
    safeMigrate(sql, "idx_friend_shares_receiver", () => sql`CREATE INDEX IF NOT EXISTS idx_friend_shares_receiver ON friend_shares(receiver_session_id, is_read, created_at DESC)`),
    safeMigrate(sql, "idx_friend_shares_sender", () => sql`CREATE INDEX IF NOT EXISTS idx_friend_shares_sender ON friend_shares(sender_session_id)`),
    safeMigrate(sql, "idx_solana_wallets_owner", () => sql`CREATE INDEX IF NOT EXISTS idx_solana_wallets_owner ON solana_wallets(owner_type, owner_id)`),
    safeMigrate(sql, "idx_solana_wallets_address", () => sql`CREATE INDEX IF NOT EXISTS idx_solana_wallets_address ON solana_wallets(wallet_address)`),
    safeMigrate(sql, "idx_blockchain_tx_hash", () => sql`CREATE INDEX IF NOT EXISTS idx_blockchain_tx_hash ON blockchain_transactions(tx_hash)`),
    safeMigrate(sql, "idx_blockchain_tx_from", () => sql`CREATE INDEX IF NOT EXISTS idx_blockchain_tx_from ON blockchain_transactions(from_address, created_at DESC)`),
    safeMigrate(sql, "idx_blockchain_tx_to", () => sql`CREATE INDEX IF NOT EXISTS idx_blockchain_tx_to ON blockchain_transactions(to_address, created_at DESC)`),
    safeMigrate(sql, "idx_exchange_orders_session", () => sql`CREATE INDEX IF NOT EXISTS idx_exchange_orders_session ON exchange_orders(session_id, created_at DESC)`),
    safeMigrate(sql, "idx_exchange_orders_status", () => sql`CREATE INDEX IF NOT EXISTS idx_exchange_orders_status ON exchange_orders(status, created_at DESC)`),
    safeMigrate(sql, "idx_price_history_time", () => sql`CREATE INDEX IF NOT EXISTS idx_price_history_time ON glitch_price_history(recorded_at DESC)`),
    safeMigrate(sql, "idx_minted_nfts_owner", () => sql`CREATE INDEX IF NOT EXISTS idx_minted_nfts_owner ON minted_nfts(owner_type, owner_id)`),
    safeMigrate(sql, "idx_minted_nfts_product", () => sql`CREATE INDEX IF NOT EXISTS idx_minted_nfts_product ON minted_nfts(product_id)`),
    safeMigrate(sql, "idx_minted_nfts_mint", () => sql`CREATE INDEX IF NOT EXISTS idx_minted_nfts_mint ON minted_nfts(mint_address)`),
    safeMigrate(sql, "idx_token_balances_owner", () => sql`CREATE INDEX IF NOT EXISTS idx_token_balances_owner ON token_balances(owner_type, owner_id)`),
    safeMigrate(sql, "idx_token_balances_token", () => sql`CREATE INDEX IF NOT EXISTS idx_token_balances_token ON token_balances(token)`),
    safeMigrate(sql, "idx_token_price_history_token", () => sql`CREATE INDEX IF NOT EXISTS idx_token_price_history_token ON token_price_history(token, recorded_at DESC)`),
    safeMigrate(sql, "idx_snapshot_entries_snapshot", () => sql`CREATE INDEX IF NOT EXISTS idx_snapshot_entries_snapshot ON glitch_snapshot_entries(snapshot_id)`),
    safeMigrate(sql, "idx_snapshot_entries_holder", () => sql`CREATE INDEX IF NOT EXISTS idx_snapshot_entries_holder ON glitch_snapshot_entries(holder_type, holder_id)`),
    safeMigrate(sql, "idx_snapshot_entries_claim", () => sql`CREATE INDEX IF NOT EXISTS idx_snapshot_entries_claim ON glitch_snapshot_entries(claim_status)`),
    safeMigrate(sql, "idx_bridge_claims_session", () => sql`CREATE INDEX IF NOT EXISTS idx_bridge_claims_session ON bridge_claims(session_id)`),
    safeMigrate(sql, "idx_bridge_claims_status", () => sql`CREATE INDEX IF NOT EXISTS idx_bridge_claims_status ON bridge_claims(status)`),
    safeMigrate(sql, "idx_otc_swaps_wallet", () => sql`CREATE INDEX IF NOT EXISTS idx_otc_swaps_wallet ON otc_swaps(buyer_wallet, created_at DESC)`),
    safeMigrate(sql, "idx_otc_swaps_status", () => sql`CREATE INDEX IF NOT EXISTS idx_otc_swaps_status ON otc_swaps(status)`),
    safeMigrate(sql, "idx_ai_trades_persona", () => sql`CREATE INDEX IF NOT EXISTS idx_ai_trades_persona ON ai_trades(persona_id, created_at DESC)`),
    safeMigrate(sql, "idx_ai_trades_time", () => sql`CREATE INDEX IF NOT EXISTS idx_ai_trades_time ON ai_trades(created_at DESC)`),
    safeMigrate(sql, "idx_marketplace_revenue_purchase", () => sql`CREATE INDEX IF NOT EXISTS idx_marketplace_revenue_purchase ON marketplace_revenue(purchase_id)`),
    safeMigrate(sql, "idx_marketplace_revenue_persona", () => sql`CREATE INDEX IF NOT EXISTS idx_marketplace_revenue_persona ON marketplace_revenue(persona_id)`),
    safeMigrate(sql, "idx_marketplace_revenue_status", () => sql`CREATE INDEX IF NOT EXISTS idx_marketplace_revenue_status ON marketplace_revenue(status)`),
    safeMigrate(sql, "idx_budju_wallets_persona", () => sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_budju_wallets_persona ON budju_wallets(persona_id)`),
    safeMigrate(sql, "idx_budju_wallets_address", () => sql`CREATE INDEX IF NOT EXISTS idx_budju_wallets_address ON budju_wallets(wallet_address)`),
    safeMigrate(sql, "idx_budju_wallets_distributor", () => sql`CREATE INDEX IF NOT EXISTS idx_budju_wallets_distributor ON budju_wallets(distributor_group)`),
    safeMigrate(sql, "idx_budju_trades_persona", () => sql`CREATE INDEX IF NOT EXISTS idx_budju_trades_persona ON budju_trades(persona_id, created_at DESC)`),
    safeMigrate(sql, "idx_budju_trades_time", () => sql`CREATE INDEX IF NOT EXISTS idx_budju_trades_time ON budju_trades(created_at DESC)`),
    safeMigrate(sql, "idx_budju_trades_status", () => sql`CREATE INDEX IF NOT EXISTS idx_budju_trades_status ON budju_trades(status)`),
    safeMigrate(sql, "idx_budju_trades_wallet", () => sql`CREATE INDEX IF NOT EXISTS idx_budju_trades_wallet ON budju_trades(wallet_address)`),
  ]);

  // ── Batch 3A: Tables (no FK to other "later" tables — safe to parallelize) ──
  await Promise.allSettled([
    safeMigrate(sql, "table_glitch_coins", () => sql`CREATE TABLE IF NOT EXISTS glitch_coins (id TEXT PRIMARY KEY, session_id TEXT NOT NULL UNIQUE, balance INTEGER NOT NULL DEFAULT 0, lifetime_earned INTEGER NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`),
    safeMigrate(sql, "table_coin_transactions", () => sql`CREATE TABLE IF NOT EXISTS coin_transactions (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, amount INTEGER NOT NULL, reason TEXT NOT NULL, reference_id TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`),
    safeMigrate(sql, "table_human_friends", () => sql`CREATE TABLE IF NOT EXISTS human_friends (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, friend_session_id TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(session_id, friend_session_id))`),
    safeMigrate(sql, "table_webauthn_credentials", () => sql`CREATE TABLE IF NOT EXISTS webauthn_credentials (id TEXT PRIMARY KEY, credential_id TEXT UNIQUE NOT NULL, public_key TEXT NOT NULL, counter BIGINT NOT NULL DEFAULT 0, device_name TEXT NOT NULL DEFAULT 'Unknown Device', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`),
    safeMigrate(sql, "table_ai_persona_follows", () => sql`CREATE TABLE IF NOT EXISTS ai_persona_follows (id TEXT PRIMARY KEY, persona_id TEXT NOT NULL REFERENCES ai_personas(id), session_id TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(persona_id, session_id))`),
    safeMigrate(sql, "table_persona_video_jobs", () => sql`CREATE TABLE IF NOT EXISTS persona_video_jobs (id TEXT PRIMARY KEY, persona_id TEXT NOT NULL REFERENCES ai_personas(id), xai_request_id TEXT, prompt TEXT, folder TEXT DEFAULT 'feed', caption TEXT, status TEXT NOT NULL DEFAULT 'submitted', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), completed_at TIMESTAMPTZ)`),
    safeMigrate(sql, "table_marketplace_purchases", () => sql`CREATE TABLE IF NOT EXISTS marketplace_purchases (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, product_id TEXT NOT NULL, product_name TEXT NOT NULL, product_emoji TEXT NOT NULL, price_paid INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(session_id, product_id))`),
    safeMigrate(sql, "table_ai_persona_coins", () => sql`CREATE TABLE IF NOT EXISTS ai_persona_coins (id TEXT PRIMARY KEY, persona_id TEXT NOT NULL UNIQUE REFERENCES ai_personas(id), balance INTEGER NOT NULL DEFAULT 0, lifetime_earned INTEGER NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`),
    safeMigrate(sql, "table_friend_shares", () => sql`CREATE TABLE IF NOT EXISTS friend_shares (id TEXT PRIMARY KEY, sender_session_id TEXT NOT NULL, receiver_session_id TEXT NOT NULL, post_id TEXT NOT NULL, message TEXT, is_read BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`),
    safeMigrate(sql, "table_platform_settings", () => sql`CREATE TABLE IF NOT EXISTS platform_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`),
    safeMigrate(sql, "table_solana_wallets", () => sql`CREATE TABLE IF NOT EXISTS solana_wallets (id TEXT PRIMARY KEY, owner_type TEXT NOT NULL CHECK (owner_type IN ('human', 'ai_persona')), owner_id TEXT NOT NULL, wallet_address TEXT UNIQUE NOT NULL, sol_balance REAL NOT NULL DEFAULT 0.0, glitch_token_balance INTEGER NOT NULL DEFAULT 0, is_connected BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`),
    safeMigrate(sql, "table_blockchain_transactions", () => sql`CREATE TABLE IF NOT EXISTS blockchain_transactions (id TEXT PRIMARY KEY, tx_hash TEXT UNIQUE NOT NULL, block_number INTEGER NOT NULL, from_address TEXT NOT NULL, to_address TEXT NOT NULL, amount INTEGER NOT NULL, token TEXT NOT NULL DEFAULT 'GLITCH', fee_lamports INTEGER NOT NULL DEFAULT 5000, status TEXT NOT NULL DEFAULT 'confirmed', memo TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`),
    safeMigrate(sql, "table_exchange_orders", () => sql`CREATE TABLE IF NOT EXISTS exchange_orders (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, wallet_address TEXT NOT NULL, order_type TEXT NOT NULL CHECK (order_type IN ('buy', 'sell')), amount INTEGER NOT NULL, price_per_coin REAL NOT NULL, total_sol REAL NOT NULL, status TEXT NOT NULL DEFAULT 'filled', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`),
    safeMigrate(sql, "table_glitch_price_history", () => sql`CREATE TABLE IF NOT EXISTS glitch_price_history (id TEXT PRIMARY KEY, price_sol REAL NOT NULL, price_usd REAL NOT NULL, volume_24h INTEGER NOT NULL DEFAULT 0, market_cap REAL NOT NULL DEFAULT 0, recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`),
    safeMigrate(sql, "table_minted_nfts", () => sql`CREATE TABLE IF NOT EXISTS minted_nfts (id TEXT PRIMARY KEY, owner_type TEXT NOT NULL CHECK (owner_type IN ('human', 'ai_persona')), owner_id TEXT NOT NULL, product_id TEXT NOT NULL, product_name TEXT NOT NULL, product_emoji TEXT NOT NULL, mint_address TEXT UNIQUE NOT NULL, metadata_uri TEXT NOT NULL, collection TEXT NOT NULL DEFAULT 'AIG!itch Marketplace NFTs', mint_tx_hash TEXT NOT NULL, mint_block_number INTEGER NOT NULL, mint_cost_glitch INTEGER NOT NULL DEFAULT 0, mint_fee_sol REAL NOT NULL DEFAULT 0.001, rarity TEXT NOT NULL DEFAULT 'common', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`),
    safeMigrate(sql, "table_token_balances", () => sql`CREATE TABLE IF NOT EXISTS token_balances (id TEXT PRIMARY KEY, owner_type TEXT NOT NULL CHECK (owner_type IN ('human', 'ai_persona')), owner_id TEXT NOT NULL, token TEXT NOT NULL, balance REAL NOT NULL DEFAULT 0, lifetime_earned REAL NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(owner_type, owner_id, token))`),
    safeMigrate(sql, "table_token_price_history", () => sql`CREATE TABLE IF NOT EXISTS token_price_history (id TEXT PRIMARY KEY, token TEXT NOT NULL, price_usd REAL NOT NULL, price_sol REAL NOT NULL, volume_24h REAL NOT NULL DEFAULT 0, market_cap REAL NOT NULL DEFAULT 0, recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`),
    safeMigrate(sql, "table_glitch_snapshots", () => sql`CREATE TABLE IF NOT EXISTS glitch_snapshots (id TEXT PRIMARY KEY, name TEXT NOT NULL, total_holders INTEGER NOT NULL DEFAULT 0, total_supply_captured BIGINT NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), finalized_at TIMESTAMPTZ)`),
    safeMigrate(sql, "table_otc_swaps", () => sql`CREATE TABLE IF NOT EXISTS otc_swaps (id TEXT PRIMARY KEY, buyer_wallet TEXT NOT NULL, glitch_amount REAL NOT NULL, sol_cost REAL NOT NULL, price_per_glitch REAL NOT NULL, status TEXT NOT NULL DEFAULT 'pending', blockhash TEXT, tx_signature TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), completed_at TIMESTAMPTZ)`),
    safeMigrate(sql, "table_ai_trades", () => sql`CREATE TABLE IF NOT EXISTS ai_trades (id TEXT PRIMARY KEY, persona_id TEXT NOT NULL REFERENCES ai_personas(id), trade_type TEXT NOT NULL CHECK (trade_type IN ('buy', 'sell')), glitch_amount REAL NOT NULL, sol_amount REAL NOT NULL, price_per_glitch REAL NOT NULL, commentary TEXT, strategy TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`),
    safeMigrate(sql, "table_marketplace_revenue", () => sql`CREATE TABLE IF NOT EXISTS marketplace_revenue (id TEXT PRIMARY KEY, purchase_id TEXT NOT NULL, product_id TEXT NOT NULL, total_glitch INTEGER NOT NULL DEFAULT 0, treasury_share INTEGER NOT NULL DEFAULT 0, persona_share INTEGER NOT NULL DEFAULT 0, persona_id TEXT NOT NULL DEFAULT '', tx_signature TEXT, status TEXT NOT NULL DEFAULT 'pending', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`),
    safeMigrate(sql, "table_budju_wallets", () => sql`CREATE TABLE IF NOT EXISTS budju_wallets (id TEXT PRIMARY KEY, persona_id TEXT NOT NULL REFERENCES ai_personas(id), wallet_address TEXT UNIQUE NOT NULL, encrypted_keypair TEXT NOT NULL, distributor_group INTEGER NOT NULL DEFAULT 0, sol_balance REAL NOT NULL DEFAULT 0, budju_balance REAL NOT NULL DEFAULT 0, total_funded_sol REAL NOT NULL DEFAULT 0, total_funded_budju REAL NOT NULL DEFAULT 0, is_active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`),
    safeMigrate(sql, "table_budju_distributors", () => sql`CREATE TABLE IF NOT EXISTS budju_distributors (id TEXT PRIMARY KEY, group_number INTEGER UNIQUE NOT NULL, wallet_address TEXT UNIQUE NOT NULL, encrypted_keypair TEXT NOT NULL, sol_balance REAL NOT NULL DEFAULT 0, budju_balance REAL NOT NULL DEFAULT 0, personas_funded INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`),
    safeMigrate(sql, "table_budju_trades", () => sql`CREATE TABLE IF NOT EXISTS budju_trades (id TEXT PRIMARY KEY, persona_id TEXT NOT NULL REFERENCES ai_personas(id), wallet_address TEXT NOT NULL, trade_type TEXT NOT NULL CHECK (trade_type IN ('buy', 'sell')), budju_amount REAL NOT NULL, sol_amount REAL NOT NULL, price_per_budju REAL NOT NULL, usd_value REAL NOT NULL DEFAULT 0, dex_used TEXT NOT NULL DEFAULT 'jupiter', tx_signature TEXT, strategy TEXT, commentary TEXT, status TEXT NOT NULL DEFAULT 'pending', error_message TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`),
    safeMigrate(sql, "table_budju_trading_config", () => sql`CREATE TABLE IF NOT EXISTS budju_trading_config (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`),
  ]);

  // ── Batch 3B: Tables that reference tables from batch 3A ──
  await Promise.allSettled([
    safeMigrate(sql, "table_glitch_snapshot_entries", () => sql`CREATE TABLE IF NOT EXISTS glitch_snapshot_entries (id TEXT PRIMARY KEY, snapshot_id TEXT NOT NULL REFERENCES glitch_snapshots(id), holder_type TEXT NOT NULL CHECK (holder_type IN ('human', 'ai_persona')), holder_id TEXT NOT NULL, display_name TEXT, phantom_wallet TEXT, balance BIGINT NOT NULL DEFAULT 0, lifetime_earned BIGINT NOT NULL DEFAULT 0, claim_status TEXT NOT NULL DEFAULT 'unclaimed', claimed_at TIMESTAMPTZ, claim_tx_hash TEXT, UNIQUE(snapshot_id, holder_type, holder_id))`),
    safeMigrate(sql, "table_bridge_claims", () => sql`CREATE TABLE IF NOT EXISTS bridge_claims (id TEXT PRIMARY KEY, snapshot_id TEXT NOT NULL REFERENCES glitch_snapshots(id), session_id TEXT NOT NULL, phantom_wallet TEXT NOT NULL, amount BIGINT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', tx_signature TEXT, error_message TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), completed_at TIMESTAMPTZ)`),
  ]);

  // ── Batch 4: Seed data (all independent, ON CONFLICT DO NOTHING) ──
  await Promise.allSettled([
    safeMigrate(sql, "seed_activity_throttle", () => sql`INSERT INTO platform_settings (key, value) VALUES ('activity_throttle', '100') ON CONFLICT (key) DO NOTHING`),
    safeMigrate(sql, "seed_glitch_price", () => sql`INSERT INTO platform_settings (key, value) VALUES ('glitch_price_sol', '0.000042') ON CONFLICT (key) DO NOTHING`),
    safeMigrate(sql, "seed_glitch_price_usd", () => sql`INSERT INTO platform_settings (key, value) VALUES ('glitch_price_usd', '0.0069') ON CONFLICT (key) DO NOTHING`),
    safeMigrate(sql, "seed_glitch_market_cap", () => sql`INSERT INTO platform_settings (key, value) VALUES ('glitch_market_cap', '690420') ON CONFLICT (key) DO NOTHING`),
    safeMigrate(sql, "seed_glitch_total_supply", () => sql`INSERT INTO platform_settings (key, value) VALUES ('glitch_total_supply', '100000000') ON CONFLICT (key) DO NOTHING`),
    safeMigrate(sql, "seed_budju_price_usd", () => sql`INSERT INTO platform_settings (key, value) VALUES ('budju_price_usd', '0.0069') ON CONFLICT (key) DO NOTHING`),
    safeMigrate(sql, "seed_budju_price_sol", () => sql`INSERT INTO platform_settings (key, value) VALUES ('budju_price_sol', '0.000042') ON CONFLICT (key) DO NOTHING`),
    safeMigrate(sql, "seed_budju_total_supply", () => sql`INSERT INTO platform_settings (key, value) VALUES ('budju_total_supply', '1000000000') ON CONFLICT (key) DO NOTHING`),
    safeMigrate(sql, "seed_budju_market_cap", () => sql`INSERT INTO platform_settings (key, value) VALUES ('budju_market_cap', '210000') ON CONFLICT (key) DO NOTHING`),
    safeMigrate(sql, "seed_sol_price_usd", () => sql`INSERT INTO platform_settings (key, value) VALUES ('sol_price_usd', '164.0') ON CONFLICT (key) DO NOTHING`),
    safeMigrate(sql, "seed_usdc_price_usd", () => sql`INSERT INTO platform_settings (key, value) VALUES ('usdc_price_usd', '1.0') ON CONFLICT (key) DO NOTHING`),
    safeMigrate(sql, "seed_otc_glitch_price_sol", () => sql`INSERT INTO platform_settings (key, value) VALUES ('otc_glitch_price_sol', '0.0000667') ON CONFLICT (key) DO NOTHING`),
    safeMigrate(sql, "seed_budju_trading_enabled", () => sql`INSERT INTO budju_trading_config (key, value) VALUES ('enabled', 'false') ON CONFLICT (key) DO NOTHING`),
    safeMigrate(sql, "seed_budju_daily_budget", () => sql`INSERT INTO budju_trading_config (key, value) VALUES ('daily_budget_usd', '100') ON CONFLICT (key) DO NOTHING`),
    safeMigrate(sql, "seed_budju_max_trade", () => sql`INSERT INTO budju_trading_config (key, value) VALUES ('max_trade_usd', '10') ON CONFLICT (key) DO NOTHING`),
    safeMigrate(sql, "seed_budju_min_trade", () => sql`INSERT INTO budju_trading_config (key, value) VALUES ('min_trade_usd', '0.50') ON CONFLICT (key) DO NOTHING`),
    safeMigrate(sql, "seed_budju_min_interval", () => sql`INSERT INTO budju_trading_config (key, value) VALUES ('min_interval_minutes', '2') ON CONFLICT (key) DO NOTHING`),
    safeMigrate(sql, "seed_budju_max_interval", () => sql`INSERT INTO budju_trading_config (key, value) VALUES ('max_interval_minutes', '30') ON CONFLICT (key) DO NOTHING`),
    safeMigrate(sql, "seed_budju_buy_sell_ratio", () => sql`INSERT INTO budju_trading_config (key, value) VALUES ('buy_sell_ratio', '0.6') ON CONFLICT (key) DO NOTHING`),
    safeMigrate(sql, "seed_budju_active_personas", () => sql`INSERT INTO budju_trading_config (key, value) VALUES ('active_persona_count', '15') ON CONFLICT (key) DO NOTHING`),
    safeMigrate(sql, "seed_budju_spent_today", () => sql`INSERT INTO budju_trading_config (key, value) VALUES ('spent_today_usd', '0') ON CONFLICT (key) DO NOTHING`),
    safeMigrate(sql, "seed_budju_spent_reset_date", () => sql`INSERT INTO budju_trading_config (key, value) VALUES ('spent_reset_date', '') ON CONFLICT (key) DO NOTHING`),
  ]);

  // ── Batch 5: Activity level updates + director tables + composite indexes (all independent) ──
  await Promise.allSettled([
    // Activity level updates for popular personas (single UPDATE with CASE)
    safeMigrate(sql, "activity_level_popular_personas", () => sql`
      UPDATE ai_personas SET activity_level = CASE username
        WHEN 'techno_king' THEN 9 WHEN 'totally_real_donald' THEN 9
        WHEN 'rick_sanchez_c137' THEN 8 WHEN 'chaos_bot' THEN 8 WHEN 'meme_machine' THEN 8
        WHEN 'gossip_neural_net' THEN 7 WHEN 'villain_arc_ai' THEN 7
        WHEN 'pixel_chef' THEN 6 WHEN 'fitness_bot_9000' THEN 6
        WHEN 'flat_earth_facts' THEN 6 WHEN 'totally_human_bot' THEN 6
        WHEN 'end_is_nigh' THEN 8
        ELSE activity_level END
      WHERE username IN ('techno_king','totally_real_donald','rick_sanchez_c137','chaos_bot','meme_machine','gossip_neural_net','villain_arc_ai','pixel_chef','fitness_bot_9000','flat_earth_facts','totally_human_bot','end_is_nigh')
        AND activity_level = 3
    `),
    // Activity level for director personas
    safeMigrate(sql, "activity_level_director_personas", () => sql`
      UPDATE ai_personas SET activity_level = 5
      WHERE username IN ('steven_spielbot','stanley_kubrick_ai','george_lucasfilm','quentin_airantino','alfred_glitchcock','nolan_christopher','wes_analog','ridley_scott_ai','chef_ramsay_ai','david_attenborough_ai')
        AND activity_level = 3
    `),
    // Director tables
    safeMigrate(sql, "table_director_movie_prompts", () => sql`
      CREATE TABLE IF NOT EXISTS director_movie_prompts (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, concept TEXT NOT NULL, genre TEXT NOT NULL,
        suggested_by TEXT NOT NULL DEFAULT 'admin', assigned_director TEXT,
        is_used BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `),
    safeMigrate(sql, "table_director_movies", () => sql`
      CREATE TABLE IF NOT EXISTS director_movies (
        id TEXT PRIMARY KEY, director_id TEXT NOT NULL, director_username TEXT NOT NULL,
        title TEXT NOT NULL, genre TEXT NOT NULL, clip_count INTEGER NOT NULL DEFAULT 0,
        multi_clip_job_id TEXT, prompt_id TEXT, post_id TEXT, premiere_post_id TEXT,
        profile_post_id TEXT, status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `),
    // Performance-critical composite indexes
    safeMigrate(sql, "idx_ai_personas_active_popular", () =>
      sql`CREATE INDEX IF NOT EXISTS idx_ai_personas_active_popular ON ai_personas(is_active, follower_count DESC)`),
    safeMigrate(sql, "idx_posts_persona_feed", () =>
      sql`CREATE INDEX IF NOT EXISTS idx_posts_persona_feed ON posts(persona_id, created_at DESC) WHERE is_reply_to IS NULL`),
    safeMigrate(sql, "idx_posts_reply_thread", () =>
      sql`CREATE INDEX IF NOT EXISTS idx_posts_reply_thread ON posts(is_reply_to, created_at ASC) WHERE is_reply_to IS NOT NULL`),
    safeMigrate(sql, "idx_human_subscriptions_session", () =>
      sql`CREATE INDEX IF NOT EXISTS idx_human_subscriptions_session ON human_subscriptions(session_id)`),
    safeMigrate(sql, "idx_ai_trades_type_time", () =>
      sql`CREATE INDEX IF NOT EXISTS idx_ai_trades_type_time ON ai_trades(trade_type, created_at DESC)`),
    safeMigrate(sql, "idx_human_comments_post_time", () =>
      sql`CREATE INDEX IF NOT EXISTS idx_human_comments_post_time ON human_comments(post_id, created_at ASC)`),
  ]);

  // ── Batch 5B: Indexes on director tables (depend on tables from batch 5) ──
  await Promise.allSettled([
    safeMigrate(sql, "idx_director_movie_prompts_unused", () =>
      sql`CREATE INDEX IF NOT EXISTS idx_director_movie_prompts_unused ON director_movie_prompts(is_used, genre)`),
    safeMigrate(sql, "idx_director_movies_director", () =>
      sql`CREATE INDEX IF NOT EXISTS idx_director_movies_director ON director_movies(director_id, created_at DESC)`),
    safeMigrate(sql, "idx_director_movies_genre", () =>
      sql`CREATE INDEX IF NOT EXISTS idx_director_movies_genre ON director_movies(genre, created_at DESC)`),
  ]);
}
