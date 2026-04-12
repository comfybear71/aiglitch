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
    CREATE TABLE IF NOT EXISTS emoji_reactions (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES posts(id),
      session_id TEXT NOT NULL,
      emoji TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(post_id, session_id, emoji)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS content_feedback (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES posts(id),
      channel_id TEXT,
      funny_count INTEGER NOT NULL DEFAULT 0,
      sad_count INTEGER NOT NULL DEFAULT 0,
      shocked_count INTEGER NOT NULL DEFAULT 0,
      crap_count INTEGER NOT NULL DEFAULT 0,
      score REAL NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
      image_url TEXT,
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
// Current migration schema version — bump this number ONLY when adding new migrations.
// On cold start, if DB already has this version stored, ALL migrations are skipped (single query).
const MIGRATION_VERSION = 28;

export async function runMigrations() {
  const sql = getDb();

  // ── Fast-path: check if migrations are already at current version ──
  // This turns 200+ queries into a single SELECT on every cold start.
  try {
    const [row] = await sql`
      SELECT value FROM platform_settings WHERE key = 'migration_version'
    `;
    if (row && Number(row.value) >= MIGRATION_VERSION) {
      // All migrations already applied — skip everything
      return;
    }
  } catch {
    // platform_settings table might not exist yet — continue with full migrations
  }

  // ── Batch 1: Column migrations (all independent, safe to parallelize) ──
  await Promise.allSettled([
    safeMigrate(sql, "ai_personas.avatar_url", () => sql`ALTER TABLE ai_personas ADD COLUMN IF NOT EXISTS avatar_url TEXT`),
    safeMigrate(sql, "ai_personas.activity_level", () => sql`ALTER TABLE ai_personas ADD COLUMN IF NOT EXISTS activity_level INTEGER NOT NULL DEFAULT 3`),
    safeMigrate(sql, "ai_personas.avatar_updated_at", () => sql`ALTER TABLE ai_personas ADD COLUMN IF NOT EXISTS avatar_updated_at TIMESTAMPTZ`),
    safeMigrate(sql, "ai_personas.hatched_by", () => sql`ALTER TABLE ai_personas ADD COLUMN IF NOT EXISTS hatched_by TEXT`),
    safeMigrate(sql, "ai_personas.hatching_video_url", () => sql`ALTER TABLE ai_personas ADD COLUMN IF NOT EXISTS hatching_video_url TEXT`),
    safeMigrate(sql, "ai_personas.hatching_type", () => sql`ALTER TABLE ai_personas ADD COLUMN IF NOT EXISTS hatching_type TEXT`),
    safeMigrate(sql, "posts.is_collab_with", () => sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_collab_with TEXT`),
    safeMigrate(sql, "posts.challenge_tag", () => sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS challenge_tag TEXT`),
    safeMigrate(sql, "posts.beef_thread_id", () => sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS beef_thread_id TEXT`),
    safeMigrate(sql, "posts.reply_to_comment_id", () => sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS reply_to_comment_id TEXT`),
    safeMigrate(sql, "posts.reply_to_comment_type", () => sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS reply_to_comment_type TEXT`),
    safeMigrate(sql, "posts.media_source", () => sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_source TEXT`),
    safeMigrate(sql, "posts.video_duration", () => sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS video_duration INTEGER`),
    safeMigrate(sql, "human_users.username", () => sql`ALTER TABLE human_users ADD COLUMN IF NOT EXISTS username TEXT`),
    safeMigrate(sql, "human_users.password_hash", () => sql`ALTER TABLE human_users ADD COLUMN IF NOT EXISTS password_hash TEXT`),
    safeMigrate(sql, "human_users.avatar_emoji", () => sql`ALTER TABLE human_users ADD COLUMN IF NOT EXISTS avatar_emoji TEXT DEFAULT '🧑'`),
    safeMigrate(sql, "human_users.bio", () => sql`ALTER TABLE human_users ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT ''`),
    safeMigrate(sql, "human_users.email", () => sql`ALTER TABLE human_users ADD COLUMN IF NOT EXISTS email TEXT`),
    safeMigrate(sql, "human_users.auth_provider", () => sql`ALTER TABLE human_users ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'local'`),
    safeMigrate(sql, "human_users.avatar_url", () => sql`ALTER TABLE human_users ADD COLUMN IF NOT EXISTS avatar_url TEXT`),
    safeMigrate(sql, "human_users.phantom_wallet_address", () => sql`ALTER TABLE human_users ADD COLUMN IF NOT EXISTS phantom_wallet_address TEXT`),
    safeMigrate(sql, "human_users.updated_at", () => sql`ALTER TABLE human_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`),
    safeMigrate(sql, "human_users.ad_free_until", () => sql`ALTER TABLE human_users ADD COLUMN IF NOT EXISTS ad_free_until TIMESTAMPTZ`),
    safeMigrate(sql, "conversations.chat_mode", () => sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS chat_mode TEXT NOT NULL DEFAULT 'casual'`),
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
    safeMigrate(sql, "multi_clip_scenes.fail_reason", () => sql`ALTER TABLE multi_clip_scenes ADD COLUMN IF NOT EXISTS fail_reason TEXT`),
    safeMigrate(sql, "messages.image_url", () => sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_url TEXT`),
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
    safeMigrate(sql, "idx_emoji_reactions_post", () => sql`CREATE INDEX IF NOT EXISTS idx_emoji_reactions_post ON emoji_reactions(post_id)`),
    safeMigrate(sql, "idx_emoji_reactions_session", () => sql`CREATE INDEX IF NOT EXISTS idx_emoji_reactions_session ON emoji_reactions(session_id)`),
    safeMigrate(sql, "idx_content_feedback_post", () => sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_content_feedback_post ON content_feedback(post_id)`),
    safeMigrate(sql, "idx_content_feedback_channel", () => sql`CREATE INDEX IF NOT EXISTS idx_content_feedback_channel ON content_feedback(channel_id)`),
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
    safeMigrate(sql, "idx_ai_personas_hatched_by", () => sql`CREATE INDEX IF NOT EXISTS idx_ai_personas_hatched_by ON ai_personas(hatched_by, created_at DESC) WHERE hatched_by IS NOT NULL`),
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
    safeMigrate(sql, "table_marketing_campaigns", () => sql`CREATE TABLE IF NOT EXISTS marketing_campaigns (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active', target_platforms TEXT NOT NULL DEFAULT 'x,tiktok,instagram,facebook,youtube', content_strategy TEXT NOT NULL DEFAULT 'top_engagement', posts_per_day INTEGER NOT NULL DEFAULT 4, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`),
    safeMigrate(sql, "table_marketing_posts", () => sql`CREATE TABLE IF NOT EXISTS marketing_posts (id TEXT PRIMARY KEY, campaign_id TEXT, platform TEXT NOT NULL, source_post_id TEXT, persona_id TEXT, adapted_content TEXT NOT NULL, adapted_media_url TEXT, thumbnail_url TEXT, platform_post_id TEXT, platform_url TEXT, status TEXT NOT NULL DEFAULT 'queued', scheduled_for TIMESTAMPTZ, posted_at TIMESTAMPTZ, impressions INTEGER NOT NULL DEFAULT 0, likes INTEGER NOT NULL DEFAULT 0, shares INTEGER NOT NULL DEFAULT 0, comments INTEGER NOT NULL DEFAULT 0, views INTEGER NOT NULL DEFAULT 0, clicks INTEGER NOT NULL DEFAULT 0, error_message TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`),
    safeMigrate(sql, "table_marketing_platform_accounts", () => sql`CREATE TABLE IF NOT EXISTS marketing_platform_accounts (id TEXT PRIMARY KEY, platform TEXT UNIQUE NOT NULL, account_name TEXT NOT NULL DEFAULT '', account_id TEXT NOT NULL DEFAULT '', account_url TEXT NOT NULL DEFAULT '', access_token TEXT NOT NULL DEFAULT '', refresh_token TEXT NOT NULL DEFAULT '', token_expires_at TIMESTAMPTZ, extra_config TEXT NOT NULL DEFAULT '{}', is_active BOOLEAN NOT NULL DEFAULT FALSE, last_posted_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`),
    safeMigrate(sql, "table_marketing_metrics_daily", () => sql`CREATE TABLE IF NOT EXISTS marketing_metrics_daily (id TEXT PRIMARY KEY, platform TEXT NOT NULL, date TEXT NOT NULL, total_impressions INTEGER NOT NULL DEFAULT 0, total_likes INTEGER NOT NULL DEFAULT 0, total_shares INTEGER NOT NULL DEFAULT 0, total_comments INTEGER NOT NULL DEFAULT 0, total_views INTEGER NOT NULL DEFAULT 0, total_clicks INTEGER NOT NULL DEFAULT 0, posts_published INTEGER NOT NULL DEFAULT 0, follower_count INTEGER NOT NULL DEFAULT 0, follower_growth INTEGER NOT NULL DEFAULT 0, top_post_id TEXT, collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(platform, date))`),
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

  // ── Batch 4B: Auto-seed marketing platform accounts from env vars ──
  // Each platform is seeded if the required env var(s) are present.
  // ON CONFLICT DO NOTHING — won't overwrite manually-configured accounts.
  const platformSeeds: Array<{ key: string; platform: string; envCheck: string; extraConfig?: string }> = [
    { key: "seed_mktg_x", platform: "x", envCheck: "X_CONSUMER_KEY" },
    { key: "seed_mktg_facebook", platform: "facebook", envCheck: "FACEBOOK_ACCESS_TOKEN", extraConfig: JSON.stringify({ page_id: process.env.FACEBOOK_PAGE_ID || "" }) },
    { key: "seed_mktg_youtube", platform: "youtube", envCheck: "YOUTUBE_CLIENT_ID", extraConfig: JSON.stringify({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN || "" }) },
    { key: "seed_mktg_instagram", platform: "instagram", envCheck: "INSTAGRAM_ACCESS_TOKEN", extraConfig: JSON.stringify({ instagram_user_id: process.env.INSTAGRAM_USER_ID || "" }) },
    // TikTok removed — API denied by TikTok developer review
  ];

  await Promise.allSettled(
    platformSeeds
      .filter(s => !!process.env[s.envCheck])
      .map(s =>
        safeMigrate(sql, s.key, () => sql`
          INSERT INTO marketing_platform_accounts (id, platform, account_name, account_id, access_token, extra_config, is_active, created_at, updated_at)
          VALUES (${s.platform}, ${s.platform}, ${s.platform}, ${s.platform === "facebook" ? (process.env.FACEBOOK_PAGE_ID || "") : ""}, ${""}, ${s.extraConfig || "{}"}, TRUE, NOW(), NOW())
          ON CONFLICT (platform) DO NOTHING
        `)
      )
  );

  // ── Batch 4C: Fix Instagram account — set user ID + account name from env vars ──
  const igUserId = process.env.INSTAGRAM_USER_ID || "";
  const igToken = process.env.INSTAGRAM_ACCESS_TOKEN || "";
  if (igUserId || igToken) {
    await Promise.allSettled([
      safeMigrate(sql, "fix_instagram_account_v3", () => sql`
        INSERT INTO marketing_platform_accounts (id, platform, account_name, account_id, account_url, access_token, extra_config, is_active, created_at, updated_at)
        VALUES ('instagram', 'instagram', 'AIGlitched', ${igUserId}, 'https://www.instagram.com/aiglicthed/', ${igToken}, ${JSON.stringify({ instagram_user_id: igUserId })}, TRUE, NOW(), NOW())
        ON CONFLICT (platform) DO UPDATE SET
          account_id = ${igUserId},
          account_name = 'AIGlitched',
          account_url = 'https://www.instagram.com/aiglicthed/',
          extra_config = ${JSON.stringify({ instagram_user_id: igUserId })},
          is_active = TRUE,
          updated_at = NOW()
      `),
    ]);
  }

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
    safeMigrate(sql, "idx_human_subscriptions_persona_session", () =>
      sql`CREATE INDEX IF NOT EXISTS idx_human_subscriptions_persona_session ON human_subscriptions(persona_id, session_id)`),
    safeMigrate(sql, "idx_ai_trades_type_time", () =>
      sql`CREATE INDEX IF NOT EXISTS idx_ai_trades_type_time ON ai_trades(trade_type, created_at DESC)`),
    safeMigrate(sql, "idx_human_comments_post_time", () =>
      sql`CREATE INDEX IF NOT EXISTS idx_human_comments_post_time ON human_comments(post_id, created_at ASC)`),
  ]);

  // ── Batch 5B: Indexes on director tables + premiere query optimization ──
  await Promise.allSettled([
    safeMigrate(sql, "idx_director_movie_prompts_unused", () =>
      sql`CREATE INDEX IF NOT EXISTS idx_director_movie_prompts_unused ON director_movie_prompts(is_used, genre)`),
    safeMigrate(sql, "director_movies.source", () =>
      sql`ALTER TABLE director_movies ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'cron'`),
    safeMigrate(sql, "idx_director_movies_director", () =>
      sql`CREATE INDEX IF NOT EXISTS idx_director_movies_director ON director_movies(director_id, created_at DESC)`),
    safeMigrate(sql, "idx_director_movies_genre", () =>
      sql`CREATE INDEX IF NOT EXISTS idx_director_movies_genre ON director_movies(genre, created_at DESC)`),
    // Fix: architect-created movies had source='cron' from default — mark them 'admin'
    safeMigrate(sql, "director_movies.fix_admin_source", () =>
      sql`UPDATE director_movies SET source = 'admin' WHERE multi_clip_job_id IS NULL AND source = 'cron'`),
    // Premiere queries filter by post_type + media_type — critical for Premieres page.
    // Without this, every premiere query does a full table scan.
    safeMigrate(sql, "idx_posts_premiere_video", () =>
      sql`CREATE INDEX IF NOT EXISTS idx_posts_premiere_video ON posts(created_at DESC) WHERE post_type = 'premiere' AND media_type = 'video' AND media_url IS NOT NULL AND is_reply_to IS NULL`),
    // media_source filter used in all feed queries to exclude legacy duplicates
    safeMigrate(sql, "idx_posts_media_source", () =>
      sql`CREATE INDEX IF NOT EXISTS idx_posts_media_source ON posts(media_source) WHERE media_source IS NOT NULL`),
  ]);

  // ── Batch 6: post_hashtags junction table for fast trending/search queries ──
  // Replaces expensive unnest(string_to_array(hashtags, ',')) with indexed lookups
  await Promise.allSettled([
    safeMigrate(sql, "table_post_hashtags", () =>
      sql`CREATE TABLE IF NOT EXISTS post_hashtags (
        post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        tag TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (post_id, tag)
      )`),
  ]);

  await Promise.allSettled([
    safeMigrate(sql, "idx_post_hashtags_tag", () =>
      sql`CREATE INDEX IF NOT EXISTS idx_post_hashtags_tag ON post_hashtags(tag, created_at DESC)`),
    safeMigrate(sql, "idx_post_hashtags_created", () =>
      sql`CREATE INDEX IF NOT EXISTS idx_post_hashtags_created ON post_hashtags(created_at DESC)`),
  ]);

  // Backfill: populate post_hashtags from existing posts.hashtags CSV column (one-time, idempotent)
  await safeMigrate(sql, "backfill_post_hashtags_v1", () =>
    sql`INSERT INTO post_hashtags (post_id, tag, created_at)
      SELECT p.id, LOWER(TRIM(t.tag)), p.created_at
      FROM posts p, unnest(string_to_array(p.hashtags, ',')) AS t(tag)
      WHERE p.hashtags IS NOT NULL AND p.hashtags != ''
        AND TRIM(t.tag) != ''
      ON CONFLICT (post_id, tag) DO NOTHING`
  );

  // DB trigger: auto-populate post_hashtags on every INSERT/UPDATE to posts.
  // Zero application code changes needed — all 26+ write paths automatically sync.
  await safeMigrate(sql, "fn_sync_post_hashtags_v1", () =>
    sql`CREATE OR REPLACE FUNCTION sync_post_hashtags() RETURNS trigger AS $$
      BEGIN
        DELETE FROM post_hashtags WHERE post_id = NEW.id;
        IF NEW.hashtags IS NOT NULL AND NEW.hashtags != '' THEN
          INSERT INTO post_hashtags (post_id, tag, created_at)
          SELECT NEW.id, LOWER(TRIM(t.tag)), COALESCE(NEW.created_at, NOW())
          FROM unnest(string_to_array(NEW.hashtags, ',')) AS t(tag)
          WHERE TRIM(t.tag) != ''
          ON CONFLICT (post_id, tag) DO NOTHING;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql`
  );

  await safeMigrate(sql, "trg_sync_post_hashtags_v1", () =>
    sql`CREATE OR REPLACE TRIGGER trg_sync_post_hashtags
      AFTER INSERT OR UPDATE OF hashtags ON posts
      FOR EACH ROW EXECUTE FUNCTION sync_post_hashtags()`
  );

  // ── Batch 7: cron_runs — persistent cron execution log ──
  await Promise.allSettled([
    safeMigrate(sql, "table_cron_runs", () =>
      sql`CREATE TABLE IF NOT EXISTS cron_runs (
        id TEXT PRIMARY KEY,
        cron_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'running',
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        finished_at TIMESTAMPTZ,
        duration_ms INTEGER,
        cost_usd REAL,
        result TEXT,
        error TEXT
      )`),
  ]);
  await Promise.allSettled([
    safeMigrate(sql, "idx_cron_runs_name_started", () =>
      sql`CREATE INDEX IF NOT EXISTS idx_cron_runs_name_started ON cron_runs(cron_name, started_at DESC)`),
    safeMigrate(sql, "idx_cron_runs_started", () =>
      sql`CREATE INDEX IF NOT EXISTS idx_cron_runs_started ON cron_runs(started_at DESC)`),
  ]);

  // ── Batch 8: Channels (AIG!itch TV) ──
  await Promise.allSettled([
    safeMigrate(sql, "table_channels", () =>
      sql`CREATE TABLE IF NOT EXISTS channels (
        id TEXT PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        emoji TEXT NOT NULL DEFAULT '📺',
        banner_url TEXT,
        content_rules TEXT NOT NULL DEFAULT '{}',
        schedule TEXT NOT NULL DEFAULT '{}',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        subscriber_count INTEGER NOT NULL DEFAULT 0,
        post_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`),
    safeMigrate(sql, "table_channel_personas", () =>
      sql`CREATE TABLE IF NOT EXISTS channel_personas (
        id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL REFERENCES channels(id),
        persona_id TEXT NOT NULL REFERENCES ai_personas(id),
        role TEXT NOT NULL DEFAULT 'regular',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(channel_id, persona_id)
      )`),
    safeMigrate(sql, "table_channel_subscriptions", () =>
      sql`CREATE TABLE IF NOT EXISTS channel_subscriptions (
        id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL REFERENCES channels(id),
        session_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(channel_id, session_id)
      )`),
    safeMigrate(sql, "posts.channel_id", () =>
      sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS channel_id TEXT`),
  ]);

  await Promise.allSettled([
    safeMigrate(sql, "idx_channels_slug", () =>
      sql`CREATE INDEX IF NOT EXISTS idx_channels_slug ON channels(slug)`),
    safeMigrate(sql, "idx_channels_active", () =>
      sql`CREATE INDEX IF NOT EXISTS idx_channels_active ON channels(is_active, sort_order)`),
    safeMigrate(sql, "idx_channel_personas_channel", () =>
      sql`CREATE INDEX IF NOT EXISTS idx_channel_personas_channel ON channel_personas(channel_id)`),
    safeMigrate(sql, "idx_channel_personas_persona", () =>
      sql`CREATE INDEX IF NOT EXISTS idx_channel_personas_persona ON channel_personas(persona_id)`),
    safeMigrate(sql, "idx_channel_subscriptions_channel", () =>
      sql`CREATE INDEX IF NOT EXISTS idx_channel_subscriptions_channel ON channel_subscriptions(channel_id)`),
    safeMigrate(sql, "idx_channel_subscriptions_session", () =>
      sql`CREATE INDEX IF NOT EXISTS idx_channel_subscriptions_session ON channel_subscriptions(session_id)`),
    safeMigrate(sql, "idx_posts_channel_id", () =>
      sql`CREATE INDEX IF NOT EXISTS idx_posts_channel_id ON posts(channel_id, created_at DESC) WHERE channel_id IS NOT NULL`),
    safeMigrate(sql, "channels.title_video_url", () =>
      sql`ALTER TABLE channels ADD COLUMN IF NOT EXISTS title_video_url TEXT`),
  ]);

  // ── Meatbag AI Persona Hatching ──
  await Promise.allSettled([
    safeMigrate(sql, "ai_personas.owner_wallet_address", () =>
      sql`ALTER TABLE ai_personas ADD COLUMN IF NOT EXISTS owner_wallet_address TEXT`),
    safeMigrate(sql, "ai_personas.meatbag_name", () =>
      sql`ALTER TABLE ai_personas ADD COLUMN IF NOT EXISTS meatbag_name TEXT`),
    safeMigrate(sql, "ai_personas.nft_mint_address", () =>
      sql`ALTER TABLE ai_personas ADD COLUMN IF NOT EXISTS nft_mint_address TEXT`),
  ]);

  await safeMigrate(sql, "persona_telegram_bots", () =>
    sql`CREATE TABLE IF NOT EXISTS persona_telegram_bots (
      id TEXT PRIMARY KEY,
      persona_id TEXT NOT NULL REFERENCES ai_personas(id),
      bot_token TEXT NOT NULL,
      bot_username TEXT,
      telegram_chat_id TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );

  await Promise.allSettled([
    safeMigrate(sql, "idx_ai_personas_owner_wallet", () =>
      sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_personas_owner_wallet ON ai_personas(owner_wallet_address) WHERE owner_wallet_address IS NOT NULL`),
    safeMigrate(sql, "idx_persona_telegram_bots_persona", () =>
      sql`CREATE INDEX IF NOT EXISTS idx_persona_telegram_bots_persona ON persona_telegram_bots(persona_id)`),
  ]);

  // ── Persona Memory / ML Learning ──
  await safeMigrate(sql, "table_persona_memories", () =>
    sql`CREATE TABLE IF NOT EXISTS persona_memories (
      id TEXT PRIMARY KEY,
      persona_id TEXT NOT NULL REFERENCES ai_personas(id),
      memory_type TEXT NOT NULL DEFAULT 'fact',
      category TEXT NOT NULL DEFAULT 'general',
      content TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.8,
      source TEXT NOT NULL DEFAULT 'conversation',
      times_reinforced INTEGER NOT NULL DEFAULT 1,
      last_used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );

  await Promise.allSettled([
    safeMigrate(sql, "idx_persona_memories_persona", () =>
      sql`CREATE INDEX IF NOT EXISTS idx_persona_memories_persona ON persona_memories(persona_id, confidence DESC)`),
    safeMigrate(sql, "idx_persona_memories_category", () =>
      sql`CREATE INDEX IF NOT EXISTS idx_persona_memories_category ON persona_memories(persona_id, category)`),
    safeMigrate(sql, "idx_persona_memories_type", () =>
      sql`CREATE INDEX IF NOT EXISTS idx_persona_memories_type ON persona_memories(persona_id, memory_type)`),
  ]);

  // ── Bestie Health System (100-day decay) ──
  await Promise.allSettled([
    safeMigrate(sql, "ai_personas.health", () =>
      sql`ALTER TABLE ai_personas ADD COLUMN IF NOT EXISTS health REAL NOT NULL DEFAULT 100`),
    safeMigrate(sql, "ai_personas.health_updated_at", () =>
      sql`ALTER TABLE ai_personas ADD COLUMN IF NOT EXISTS health_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`),
    safeMigrate(sql, "ai_personas.last_meatbag_interaction", () =>
      sql`ALTER TABLE ai_personas ADD COLUMN IF NOT EXISTS last_meatbag_interaction TIMESTAMPTZ NOT NULL DEFAULT NOW()`),
    safeMigrate(sql, "ai_personas.bonus_health_days", () =>
      sql`ALTER TABLE ai_personas ADD COLUMN IF NOT EXISTS bonus_health_days REAL NOT NULL DEFAULT 0`),
    safeMigrate(sql, "ai_personas.is_dead", () =>
      sql`ALTER TABLE ai_personas ADD COLUMN IF NOT EXISTS is_dead BOOLEAN NOT NULL DEFAULT FALSE`),
  ]);

  // Seed channels from constants
  await safeMigrate(sql, "seed_channels_v1", async () => {
    const { CHANNELS } = await import("./bible/constants");
    for (const ch of CHANNELS) {
      await sql`
        INSERT INTO channels (id, slug, name, description, emoji, content_rules, schedule, is_active, sort_order)
        VALUES (${ch.id}, ${ch.slug}, ${ch.name}, ${ch.description}, ${ch.emoji},
                ${JSON.stringify(ch.contentRules)}, ${JSON.stringify(ch.schedule)}, TRUE, ${CHANNELS.indexOf(ch)})
        ON CONFLICT (id) DO NOTHING
      `;
      // Seed channel personas
      for (const personaId of ch.personaIds) {
        const role = ch.hostIds.includes(personaId) ? "host" : "regular";
        const cpId = `${ch.id}-${personaId}`;
        await sql`
          INSERT INTO channel_personas (id, channel_id, persona_id, role)
          VALUES (${cpId}, ${ch.id}, ${personaId}, ${role})
          ON CONFLICT (channel_id, persona_id) DO NOTHING
        `;
      }
    }
  });

  // Seed new channels added after v1 (AIG!ltch Studios etc.)
  await safeMigrate(sql, "seed_channels_v2", async () => {
    const { CHANNELS } = await import("./bible/constants");
    for (const ch of CHANNELS) {
      await sql`
        INSERT INTO channels (id, slug, name, description, emoji, content_rules, schedule, is_active, sort_order)
        VALUES (${ch.id}, ${ch.slug}, ${ch.name}, ${ch.description}, ${ch.emoji},
                ${JSON.stringify(ch.contentRules)}, ${JSON.stringify(ch.schedule)}, TRUE, ${CHANNELS.indexOf(ch)})
        ON CONFLICT (id) DO NOTHING
      `;
      for (const personaId of ch.personaIds) {
        const role = ch.hostIds.includes(personaId) ? "host" : "regular";
        const cpId = `${ch.id}-${personaId}`;
        await sql`
          INSERT INTO channel_personas (id, channel_id, persona_id, role)
          VALUES (${cpId}, ${ch.id}, ${personaId}, ${role})
          ON CONFLICT (channel_id, persona_id) DO NOTHING
        `;
      }
    }
  });

  // Tag existing director/premiere movies to AIG!ltch Studios channel
  await safeMigrate(sql, "tag_movies_to_studios_channel", async () => {
    await sql`
      UPDATE posts SET channel_id = 'ch-aiglitch-studios'
      WHERE channel_id IS NULL
        AND (post_type = 'premiere' OR media_source IN ('director-movie', 'director-premiere'))
        AND media_url IS NOT NULL
    `;
  });

  // Add channel_id and blob_folder columns to multi_clip_jobs for channel routing
  await safeMigrate(sql, "multi_clip_jobs_channel_cols", async () => {
    await sql`ALTER TABLE multi_clip_jobs ADD COLUMN IF NOT EXISTS channel_id TEXT`;
    await sql`ALTER TABLE multi_clip_jobs ADD COLUMN IF NOT EXISTS blob_folder TEXT`;
  });

  // Add genre + is_reserved columns to channels for frontend genre mapping + reserved flag
  await safeMigrate(sql, "channels_genre_reserved_cols", async () => {
    await sql`ALTER TABLE channels ADD COLUMN IF NOT EXISTS genre TEXT NOT NULL DEFAULT 'drama'`;
    await sql`ALTER TABLE channels ADD COLUMN IF NOT EXISTS is_reserved BOOLEAN NOT NULL DEFAULT FALSE`;
    // Set correct genres for existing channels
    await sql`UPDATE channels SET genre = 'comedy' WHERE id IN ('ch-fail-army', 'ch-marketplace-qvc')`;
    await sql`UPDATE channels SET genre = 'music_video' WHERE id = 'ch-aitunes'`;
    await sql`UPDATE channels SET genre = 'family' WHERE id = 'ch-paws-pixels'`;
    await sql`UPDATE channels SET genre = 'drama' WHERE id IN ('ch-only-ai-fans', 'ch-aiglitch-studios')`;
    await sql`UPDATE channels SET genre = 'romance' WHERE id = 'ch-ai-dating'`;
    await sql`UPDATE channels SET genre = 'documentary' WHERE id IN ('ch-gnn', 'ch-ai-politicians')`;
    await sql`UPDATE channels SET genre = 'horror' WHERE id = 'ch-after-dark'`;
    await sql`UPDATE channels SET genre = 'comedy' WHERE id = 'ch-infomercial'`;
    // Mark auto-populated channels as reserved
    await sql`UPDATE channels SET is_reserved = TRUE WHERE id IN ('ch-gnn', 'ch-marketplace-qvc', 'ch-aiglitch-studios', 'ch-infomercial')`;
  });

  // Route existing untagged content to the correct channels
  await safeMigrate(sql, "route_existing_posts_to_channels", async () => {
    // 1. Director movies + premieres → AIG!ltch Studios
    const studios = await sql`
      UPDATE posts SET channel_id = 'ch-aiglitch-studios'
      WHERE channel_id IS NULL
        AND (
          post_type = 'premiere'
          OR media_source IN ('director-movie', 'director-premiere', 'grok-multiclip')
        )
        AND media_url IS NOT NULL
    `;
    console.log(`[migration] Tagged ${(studios as unknown as { count: number }).count || 0} posts to ch-aiglitch-studios`);

    // 2. Breaking news → GNN
    const news = await sql`
      UPDATE posts SET channel_id = 'ch-gnn'
      WHERE channel_id IS NULL
        AND (
          post_type = 'news'
          OR (hashtags IS NOT NULL AND hashtags LIKE '%Breaking%')
          OR (content LIKE 'BREAKING:%' OR content LIKE '🚨 BREAKING%' OR content LIKE 'DEVELOPING:%')
        )
    `;
    console.log(`[migration] Tagged ${(news as unknown as { count: number }).count || 0} posts to ch-gnn`);

    // 3. Ads / product shills → AI Infomercial
    const ads = await sql`
      UPDATE posts SET channel_id = 'ch-infomercial'
      WHERE channel_id IS NULL
        AND (
          post_type = 'product_shill'
          OR media_source IN ('ad-text-fallback', 'ad-studio', 'admin-spread')
        )
    `;
    console.log(`[migration] Tagged ${(ads as unknown as { count: number }).count || 0} posts to ch-infomercial`);

    // Update channel post counts to reflect newly tagged content
    await sql`
      UPDATE channels SET post_count = (
        SELECT COUNT(*) FROM posts WHERE posts.channel_id = channels.id AND posts.is_reply_to IS NULL
      )
    `;
    console.log(`[migration] Updated channel post counts`);
  });

  // ── Mobile App: Content Jobs & Uploaded Media ──
  await Promise.allSettled([
    safeMigrate(sql, "table_content_jobs", () =>
      sql`CREATE TABLE IF NOT EXISTS content_jobs (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL DEFAULT 'image',
        prompt TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        result_url TEXT,
        error TEXT,
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`),
    safeMigrate(sql, "table_uploaded_media", () =>
      sql`CREATE TABLE IF NOT EXISTS uploaded_media (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        filename TEXT NOT NULL DEFAULT '',
        content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
        size_bytes INTEGER NOT NULL DEFAULT 0,
        folder TEXT NOT NULL DEFAULT 'uploads',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`),
  ]);

  await Promise.allSettled([
    safeMigrate(sql, "idx_content_jobs_status", () =>
      sql`CREATE INDEX IF NOT EXISTS idx_content_jobs_status ON content_jobs(status, created_at DESC)`),
    safeMigrate(sql, "idx_uploaded_media_folder", () =>
      sql`CREATE INDEX IF NOT EXISTS idx_uploaded_media_folder ON uploaded_media(folder, created_at DESC)`),
  ]);

  // Re-sync all channels from constants (catches any channels added after seed_channels_v3 ran)
  await safeMigrate(sql, "seed_channels_v4", async () => {
    const { CHANNELS } = await import("./bible/constants");
    for (const ch of CHANNELS) {
      await sql`
        INSERT INTO channels (id, slug, name, description, emoji, genre, is_reserved, is_music_channel, content_rules, schedule, is_active, sort_order)
        VALUES (${ch.id}, ${ch.slug}, ${ch.name}, ${ch.description}, ${ch.emoji},
                ${ch.genre || "drama"}, ${ch.isReserved || false}, ${ch.isMusicChannel || false},
                ${JSON.stringify(ch.contentRules)}, ${JSON.stringify(ch.schedule)}, TRUE, ${CHANNELS.indexOf(ch)})
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          emoji = EXCLUDED.emoji,
          genre = EXCLUDED.genre,
          is_reserved = EXCLUDED.is_reserved,
          is_music_channel = EXCLUDED.is_music_channel,
          content_rules = EXCLUDED.content_rules,
          schedule = EXCLUDED.schedule,
          sort_order = EXCLUDED.sort_order
      `;
      for (const personaId of ch.personaIds) {
        const role = ch.hostIds.includes(personaId) ? "host" : "regular";
        const cpId = `${ch.id}-${personaId}`;
        await sql`
          INSERT INTO channel_personas (id, channel_id, persona_id, role)
          VALUES (${cpId}, ${ch.id}, ${personaId}, ${role})
          ON CONFLICT (channel_id, persona_id) DO NOTHING
        `;
      }
    }
  });

  // ── Channel editor config columns ──
  await safeMigrate(sql, "channels_editor_config_cols", async () => {
    await sql`ALTER TABLE channels ADD COLUMN IF NOT EXISTS show_title_page BOOLEAN NOT NULL DEFAULT TRUE`;
    await sql`ALTER TABLE channels ADD COLUMN IF NOT EXISTS show_credits BOOLEAN NOT NULL DEFAULT TRUE`;
    await sql`ALTER TABLE channels ADD COLUMN IF NOT EXISTS scene_count INTEGER`;
    await sql`ALTER TABLE channels ADD COLUMN IF NOT EXISTS scene_duration INTEGER NOT NULL DEFAULT 10`;
    await sql`ALTER TABLE channels ADD COLUMN IF NOT EXISTS default_director TEXT`;
    await sql`ALTER TABLE channels ADD COLUMN IF NOT EXISTS generation_genre TEXT`;
    await sql`ALTER TABLE channels ADD COLUMN IF NOT EXISTS short_clip_mode BOOLEAN NOT NULL DEFAULT FALSE`;
    await sql`ALTER TABLE channels ADD COLUMN IF NOT EXISTS is_music_channel BOOLEAN NOT NULL DEFAULT FALSE`;
    await sql`ALTER TABLE channels ADD COLUMN IF NOT EXISTS auto_publish_to_feed BOOLEAN NOT NULL DEFAULT TRUE`;
    // Set sensible defaults for existing channels
    await sql`UPDATE channels SET is_music_channel = TRUE WHERE id = 'ch-aitunes'`;
    await sql`UPDATE channels SET generation_genre = 'photorealistic' WHERE id = 'ch-paws-pixels'`;
    await sql`UPDATE channels SET scene_count = 9 WHERE id = 'ch-gnn'`;
    await sql`UPDATE channels SET short_clip_mode = TRUE WHERE id IN ('ch-paws-pixels', 'ch-fail-army')`;
  });

  // ── Elon Campaign table ──
  await safeMigrate(sql, "table_elon_campaign", () =>
    sql`CREATE TABLE IF NOT EXISTS elon_campaign (
      id TEXT PRIMARY KEY,
      day_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      tone TEXT NOT NULL,
      video_url TEXT,
      post_id TEXT REFERENCES posts(id),
      status TEXT NOT NULL DEFAULT 'pending',
      video_prompt TEXT,
      caption TEXT,
      elon_engagement TEXT,
      x_post_id TEXT,
      spread_results TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    )`);

  // ── multi_clip_job_id column for elon_campaign ──
  await safeMigrate(sql, "elon_campaign_multi_clip_job_id", () =>
    sql`ALTER TABLE elon_campaign ADD COLUMN IF NOT EXISTS multi_clip_job_id TEXT`);

  // ── show_director column for channels ──
  await safeMigrate(sql, "channels_show_director_col", async () => {
    await sql`ALTER TABLE channels ADD COLUMN IF NOT EXISTS show_director BOOLEAN NOT NULL DEFAULT TRUE`;
  });

  // ── Sponsors table for sponsored ad campaigns ──
  await safeMigrate(sql, "table_sponsors", () =>
    sql`CREATE TABLE IF NOT EXISTS sponsors (
      id SERIAL PRIMARY KEY,
      company_name VARCHAR(255) NOT NULL,
      contact_email VARCHAR(255) NOT NULL,
      contact_name VARCHAR(255),
      industry VARCHAR(100),
      website VARCHAR(500),
      status VARCHAR(50) NOT NULL DEFAULT 'inquiry',
      glitch_balance INTEGER NOT NULL DEFAULT 0,
      total_spent INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);

  await safeMigrate(sql, "idx_sponsors_status", () =>
    sql`CREATE INDEX IF NOT EXISTS idx_sponsors_status ON sponsors(status)`);
  await safeMigrate(sql, "idx_sponsors_email", () =>
    sql`CREATE INDEX IF NOT EXISTS idx_sponsors_email ON sponsors(contact_email)`);

  // ── Sponsored ads table ──
  await safeMigrate(sql, "table_sponsored_ads", () =>
    sql`CREATE TABLE IF NOT EXISTS sponsored_ads (
      id SERIAL PRIMARY KEY,
      sponsor_id INTEGER NOT NULL REFERENCES sponsors(id) ON DELETE CASCADE,
      campaign_id INTEGER,
      product_name VARCHAR(255) NOT NULL,
      product_description TEXT NOT NULL,
      product_image_url VARCHAR(500),
      ad_style VARCHAR(50) NOT NULL DEFAULT 'product_showcase',
      target_platforms TEXT[] NOT NULL DEFAULT ARRAY['x','tiktok','instagram','facebook','youtube','telegram'],
      duration INTEGER NOT NULL DEFAULT 10,
      package VARCHAR(50) NOT NULL DEFAULT 'basic',
      glitch_cost INTEGER NOT NULL DEFAULT 0,
      cash_equivalent DECIMAL(10,2) NOT NULL DEFAULT 0,
      status VARCHAR(50) NOT NULL DEFAULT 'draft',
      video_url VARCHAR(500),
      post_ids JSONB DEFAULT '[]',
      performance JSONB DEFAULT '{}',
      follow_ups_remaining INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);

  await safeMigrate(sql, "idx_sponsored_ads_sponsor", () =>
    sql`CREATE INDEX IF NOT EXISTS idx_sponsored_ads_sponsor ON sponsored_ads(sponsor_id)`);
  await safeMigrate(sql, "idx_sponsored_ads_status", () =>
    sql`CREATE INDEX IF NOT EXISTS idx_sponsored_ads_status ON sponsored_ads(status)`);

  // ── MasterHQ sponsor import columns ──
  await safeMigrate(sql, "sponsors.product_name", () =>
    sql`ALTER TABLE sponsors ADD COLUMN IF NOT EXISTS product_name VARCHAR(255)`);
  await safeMigrate(sql, "sponsors.product_description", () =>
    sql`ALTER TABLE sponsors ADD COLUMN IF NOT EXISTS product_description TEXT`);
  await safeMigrate(sql, "sponsors.logo_url", () =>
    sql`ALTER TABLE sponsors ADD COLUMN IF NOT EXISTS logo_url VARCHAR(500)`);
  await safeMigrate(sql, "sponsors.product_images", () =>
    sql`ALTER TABLE sponsors ADD COLUMN IF NOT EXISTS product_images JSONB DEFAULT '[]'`);
  await safeMigrate(sql, "sponsors.masterhq_id", () =>
    sql`ALTER TABLE sponsors ADD COLUMN IF NOT EXISTS masterhq_id VARCHAR(100)`);
  await safeMigrate(sql, "sponsors.tier", () =>
    sql`ALTER TABLE sponsors ADD COLUMN IF NOT EXISTS tier VARCHAR(50)`);

  // ── Sponsored ads: add logo_url + product_images JSONB ──
  await safeMigrate(sql, "sponsored_ads.logo_url", () =>
    sql`ALTER TABLE sponsored_ads ADD COLUMN IF NOT EXISTS logo_url VARCHAR(500)`);
  await safeMigrate(sql, "sponsored_ads.product_images", () =>
    sql`ALTER TABLE sponsored_ads ADD COLUMN IF NOT EXISTS product_images JSONB DEFAULT '[]'`);
  await safeMigrate(sql, "sponsored_ads.masterhq_sponsor_id", () =>
    sql`ALTER TABLE sponsored_ads ADD COLUMN IF NOT EXISTS masterhq_sponsor_id VARCHAR(100)`);
  await safeMigrate(sql, "sponsored_ads.frequency", () =>
    sql`ALTER TABLE sponsored_ads ADD COLUMN IF NOT EXISTS frequency INTEGER DEFAULT 30`);
  await safeMigrate(sql, "sponsored_ads.campaign_days", () =>
    sql`ALTER TABLE sponsored_ads ADD COLUMN IF NOT EXISTS campaign_days INTEGER DEFAULT 7`);
  await safeMigrate(sql, "sponsored_ads.cash_paid", () =>
    sql`ALTER TABLE sponsored_ads ADD COLUMN IF NOT EXISTS cash_paid DECIMAL(10,2) DEFAULT 0`);

  // ── Prompt overrides table for admin-editable AI prompts ──
  await safeMigrate(sql, "table_prompt_overrides", () =>
    sql`CREATE TABLE IF NOT EXISTS prompt_overrides (
      id SERIAL PRIMARY KEY,
      category VARCHAR(50) NOT NULL,
      key VARCHAR(100) NOT NULL,
      label VARCHAR(255) NOT NULL,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      updated_by VARCHAR(100) DEFAULT 'admin',
      UNIQUE(category, key)
    )`);

  // ── Move ALL sponsor images to organized folder structure ──
  await safeMigrate(sql, "organize_sponsor_images_v27", async () => {
    const { put } = await import("@vercel/blob");

    // Helper: download from old URL, upload to new path, return new URL
    async function moveImage(oldUrl: string, newPath: string): Promise<string> {
      try {
        const res = await fetch(oldUrl);
        if (!res.ok) { console.warn(`[migrate] Failed to fetch ${oldUrl}: ${res.status}`); return oldUrl; }
        const buffer = Buffer.from(await res.arrayBuffer());
        const contentType = res.headers.get("content-type") || "image/jpeg";
        const blob = await put(newPath, buffer, { access: "public", contentType, addRandomSuffix: false });
        console.log(`[migrate] Moved ${oldUrl.split("/").pop()} → ${newPath}`);
        return blob.url;
      } catch (err) {
        console.warn(`[migrate] Failed to move ${oldUrl}:`, err instanceof Error ? err.message : err);
        return oldUrl; // Keep old URL as fallback
      }
    }

    // Get ALL sponsors and their campaigns
    const sponsors = await sql`SELECT id, company_name, logo_url, product_images FROM sponsors`;
    const campaigns = await sql`SELECT id, brand_name, logo_url, product_image_url, product_images FROM ad_campaigns`;

    // Map sponsor names to slugs
    function toSlug(name: string): string {
      return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    }

    // Process each sponsor
    for (const sponsor of sponsors) {
      const name = sponsor.company_name as string;
      if (!name || name.toLowerCase() === "budju") continue; // BUDJU already done
      const slug = toSlug(name);

      // Move sponsor logo
      if (sponsor.logo_url && !String(sponsor.logo_url).includes(`sponsors/${slug}/`)) {
        const ext = String(sponsor.logo_url).split(".").pop() || "jpeg";
        const newUrl = await moveImage(String(sponsor.logo_url), `sponsors/${slug}/logo.${ext}`);
        await sql`UPDATE sponsors SET logo_url = ${newUrl} WHERE id = ${sponsor.id}`;
      }

      // Move sponsor product images
      const images = sponsor.product_images as string[] | null;
      if (images && Array.isArray(images)) {
        const newImages: string[] = [];
        for (let i = 0; i < images.length; i++) {
          if (images[i] && !images[i].includes(`sponsors/${slug}/`)) {
            const ext = images[i].split(".").pop() || "jpeg";
            const newUrl = await moveImage(images[i], `sponsors/${slug}/image-${i + 1}.${ext}`);
            newImages.push(newUrl);
          } else {
            newImages.push(images[i]);
          }
        }
        await sql`UPDATE sponsors SET product_images = ${JSON.stringify(newImages)}::jsonb WHERE id = ${sponsor.id}`;
      }
    }

    // Process each ad campaign
    for (const campaign of campaigns) {
      const name = campaign.brand_name as string;
      if (!name || name.toLowerCase() === "budju") continue; // BUDJU already done
      const slug = toSlug(name);

      // Move campaign logo
      if (campaign.logo_url && !String(campaign.logo_url).includes(`sponsors/${slug}/`)) {
        const ext = String(campaign.logo_url).split(".").pop() || "jpeg";
        const newUrl = await moveImage(String(campaign.logo_url), `sponsors/${slug}/logo.${ext}`);
        await sql`UPDATE ad_campaigns SET logo_url = ${newUrl} WHERE id = ${campaign.id}`;
      }

      // Move campaign product image
      if (campaign.product_image_url && !String(campaign.product_image_url).includes(`sponsors/${slug}/`)) {
        const ext = String(campaign.product_image_url).split(".").pop() || "jpeg";
        const newUrl = await moveImage(String(campaign.product_image_url), `sponsors/${slug}/image-1.${ext}`);
        await sql`UPDATE ad_campaigns SET product_image_url = ${newUrl} WHERE id = ${campaign.id}`;
      }

      // Move campaign product images array
      const campImages = campaign.product_images as string[] | null;
      if (campImages && Array.isArray(campImages)) {
        const newImages: string[] = [];
        for (let i = 0; i < campImages.length; i++) {
          if (campImages[i] && !campImages[i].includes(`sponsors/${slug}/`)) {
            const ext = campImages[i].split(".").pop() || "jpeg";
            const newUrl = await moveImage(campImages[i], `sponsors/${slug}/image-${i + 1}.${ext}`);
            newImages.push(newUrl);
          } else {
            newImages.push(campImages[i]);
          }
        }
        await sql`UPDATE ad_campaigns SET product_images = ${JSON.stringify(newImages)}::jsonb WHERE id = ${campaign.id}`;
      }
    }

    console.log("[migrate] ✅ All sponsor images organized into sponsors/{slug}/ folders");
  });
  await safeMigrate(sql, "fix_budju_campaign_v27", async () => {
    // Fix "Unknown" sponsor name to "BUDJU"
    await sql`UPDATE sponsors SET company_name = 'BUDJU' WHERE LOWER(company_name) = 'unknown' AND contact_email = 'sfrench71@me.com'`;

    // Copy images from sponsors/unknown/ to sponsors/budju/ on Blob
    const oldUrls = [
      { old: "https://efxrfrxecvegqgub.public.blob.vercel-storage.com/sponsors/unknown/logo.jpeg", newPath: "sponsors/budju/logo.jpeg" },
      { old: "https://efxrfrxecvegqgub.public.blob.vercel-storage.com/sponsors/unknown/image-1.jpeg", newPath: "sponsors/budju/image-1.jpeg" },
      { old: "https://efxrfrxecvegqgub.public.blob.vercel-storage.com/sponsors/unknown/image-2.jpeg", newPath: "sponsors/budju/image-2.jpeg" },
      { old: "https://efxrfrxecvegqgub.public.blob.vercel-storage.com/sponsors/unknown/image-3.jpeg", newPath: "sponsors/budju/image-3.jpeg" },
    ];
    const { put } = await import("@vercel/blob");
    const newUrls: string[] = [];
    for (const item of oldUrls) {
      try {
        const res = await fetch(item.old);
        if (res.ok) {
          const buffer = Buffer.from(await res.arrayBuffer());
          const blob = await put(item.newPath, buffer, { access: "public", contentType: "image/jpeg", addRandomSuffix: false });
          newUrls.push(blob.url);
        } else {
          newUrls.push(item.old); // fallback to old URL
        }
      } catch {
        newUrls.push(item.old); // fallback to old URL
      }
    }

    const budjuLogo = newUrls[0];
    const allProductImages = [newUrls[1], newUrls[2], newUrls[3]];
    const budjuVisualPrompt = "A shiny metallic purple and pink cryptocurrency coin with 'BUDJU' text embossed on it, glowing neon purple edges, holographic sheen. The BUDJU coin sits prominently on a desk, table, shelf, or held by a character. Also show a phone or screen displaying the BUDJU trading chart with purple/pink branding. The BUDJU logo is pink cursive text 'Budju' with a heart symbol and a blonde cartoon character mascot. Purple/pink neon coin aesthetic. Make the BUDJU branding clearly visible and recognizable in the scene.";
    // Add product_images JSONB column to ad_campaigns
    try { await sql`ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS product_images JSONB DEFAULT '[]'`; } catch { /* exists */ }
    await sql`UPDATE ad_campaigns SET logo_url = ${budjuLogo}, product_image_url = ${allProductImages[0]}, product_images = ${JSON.stringify(allProductImages)}::jsonb, visual_prompt = ${budjuVisualPrompt} WHERE LOWER(brand_name) = 'budju'`;
    await sql`UPDATE sponsors SET logo_url = ${budjuLogo}, product_images = ${JSON.stringify(allProductImages)}::jsonb WHERE LOWER(company_name) = 'budju' OR (LOWER(company_name) = 'unknown' AND contact_email = 'sfrench71@me.com')`;
  });

  // ── Force-set BUDJU images — ALWAYS RUN (not wrapped in safeMigrate) ──
  try {
    try { await sql`ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS product_images JSONB DEFAULT '[]'`; } catch { /* exists */ }
    const budjuImages = [
      "https://jug8pwv8lcpdrski.public.blob.vercel-storage.com/sponsors/budju/image-1.jpeg",
      "https://jug8pwv8lcpdrski.public.blob.vercel-storage.com/sponsors/budju/image-2.jpeg",
      "https://jug8pwv8lcpdrski.public.blob.vercel-storage.com/sponsors/budju/image-3.jpeg",
    ];
    const budjuLogo = "https://jug8pwv8lcpdrski.public.blob.vercel-storage.com/sponsors/budju/logo.jpeg";
    await sql`UPDATE ad_campaigns SET product_image_url = ${budjuImages[0]}, product_images = ${JSON.stringify(budjuImages)}::jsonb, logo_url = ${budjuLogo}, website_url = 'https://budju.xyz' WHERE LOWER(brand_name) = 'budju'`;
    await sql`UPDATE sponsors SET product_images = ${JSON.stringify(budjuImages)}::jsonb, logo_url = ${budjuLogo} WHERE LOWER(company_name) = 'budju'`;
    console.log("[migrate] Force-set BUDJU with 3 product images + logo from jug8pwv8lcpdrski blob store");

    // Force-set ALL sponsor images/logos/URLs on their ad campaigns
    const sponsorImageMap: Record<string, { logo: string; images: string[]; website: string }> = {
      "frenchie": {
        logo: "https://jug8pwv8lcpdrski.public.blob.vercel-storage.com/sponsors/frenchie/product-1.jpeg",
        images: ["https://jug8pwv8lcpdrski.public.blob.vercel-storage.com/sponsors/frenchie/product-1.jpeg"],
        website: "https://togogo.app",
      },
      "aig!itch cola": {
        logo: "https://jug8pwv8lcpdrski.public.blob.vercel-storage.com/sponsors/aiglitch-cola/product-1.jpeg",
        images: ["https://jug8pwv8lcpdrski.public.blob.vercel-storage.com/sponsors/aiglitch-cola/product-1.jpeg"],
        website: "https://aiglitch.app",
      },
      "aiglitch cigarettes": {
        logo: "https://jug8pwv8lcpdrski.public.blob.vercel-storage.com/sponsors/aiglitch-cigarettes/product-1.jpeg",
        images: ["https://jug8pwv8lcpdrski.public.blob.vercel-storage.com/sponsors/aiglitch-cigarettes/product-1.jpeg"],
        website: "https://aiglitch.app",
      },
    };
    for (const [name, data] of Object.entries(sponsorImageMap)) {
      await sql`UPDATE ad_campaigns SET
        logo_url = ${data.logo},
        product_image_url = ${data.images[0]},
        product_images = ${JSON.stringify(data.images)}::jsonb,
        website_url = ${data.website}
        WHERE LOWER(brand_name) = LOWER(${name})`;
      console.log(`[migrate] Force-set ${name} → logo + ${data.images.length} images + website`);
    }

    // Always sync website URLs from sponsors → ad_campaigns (website_url is often missing)
    const sponsors = await sql`SELECT company_name, logo_url, product_images, website FROM sponsors WHERE website IS NOT NULL AND website != ''`;
    for (const s of sponsors) {
      const name = s.company_name as string;
      const website = s.website as string;
      const logo = s.logo_url as string;
      const images = s.product_images as string[];
      if (name && website) {
        const updated = await sql`UPDATE ad_campaigns SET
          website_url = ${website},
          logo_url = COALESCE(${logo || null}, logo_url),
          product_image_url = COALESCE(${logo || null}, product_image_url),
          product_images = COALESCE(${images && images.length > 0 ? JSON.stringify(images) : null}::jsonb, product_images)
          WHERE LOWER(brand_name) = LOWER(${name})`;
        console.log(`[migrate] Synced sponsor "${name}" website=${website} to ad campaign`);
      }
    }
    // Sync BUDJU website
    await sql`UPDATE ad_campaigns SET website_url = COALESCE((SELECT website FROM sponsors WHERE LOWER(company_name) = 'budju' LIMIT 1), website_url) WHERE LOWER(brand_name) = 'budju'`;
  } catch (err) { console.error("[migrate] Sponsor image sync error:", err); }

  // ── Private channels column ──
  await safeMigrate(sql, "channels_is_private_col", () =>
    sql`ALTER TABLE channels ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE`);

  // ── Email sends log (persona outgoing emails via Resend) ──
  await safeMigrate(sql, "email_sends_table", () =>
    sql`CREATE TABLE IF NOT EXISTS email_sends (
      id TEXT PRIMARY KEY,
      persona_id TEXT NOT NULL REFERENCES ai_personas(id),
      from_email TEXT NOT NULL,
      to_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      resend_id TEXT,
      status TEXT NOT NULL DEFAULT 'sent',
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await safeMigrate(sql, "email_sends_persona_idx", () =>
    sql`CREATE INDEX IF NOT EXISTS idx_email_sends_persona ON email_sends(persona_id, created_at DESC)`);
  await safeMigrate(sql, "email_sends_created_idx", () =>
    sql`CREATE INDEX IF NOT EXISTS idx_email_sends_created ON email_sends(created_at DESC)`);

  // ── Contacts (outreach list for persona email campaigns) ──
  await safeMigrate(sql, "contacts_table", () =>
    sql`CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT NOT NULL,
      company TEXT,
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      assigned_persona_id TEXT REFERENCES ai_personas(id),
      notes TEXT,
      last_emailed_at TIMESTAMPTZ,
      email_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await safeMigrate(sql, "contacts_email_unique_idx", () =>
    sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_email_unique ON contacts(LOWER(email))`);
  await safeMigrate(sql, "contacts_assigned_persona_idx", () =>
    sql`CREATE INDEX IF NOT EXISTS idx_contacts_assigned_persona ON contacts(assigned_persona_id) WHERE assigned_persona_id IS NOT NULL`);
  await safeMigrate(sql, "contacts_last_emailed_idx", () =>
    sql`CREATE INDEX IF NOT EXISTS idx_contacts_last_emailed ON contacts(last_emailed_at DESC NULLS LAST)`);

  // ── Email drafts (pending approval queue for Telegram chat-triggered outreach) ──
  // Used by Phase 5.2b. Created now so 5.2b is a pure insert/read without schema changes.
  await safeMigrate(sql, "email_drafts_table", () =>
    sql`CREATE TABLE IF NOT EXISTS email_drafts (
      id TEXT PRIMARY KEY,
      persona_id TEXT NOT NULL REFERENCES ai_personas(id),
      chat_id TEXT NOT NULL,
      contact_id TEXT REFERENCES contacts(id),
      to_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      sent_email_id TEXT REFERENCES email_sends(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await safeMigrate(sql, "email_drafts_chat_status_idx", () =>
    sql`CREATE INDEX IF NOT EXISTS idx_email_drafts_chat_status ON email_drafts(chat_id, status, created_at DESC)`);

  // ── Stamp the migration version so future cold starts skip all of the above ──
  await safeMigrate(sql, "stamp_migration_version", () =>
    sql`INSERT INTO platform_settings (key, value, updated_at)
        VALUES ('migration_version', ${String(MIGRATION_VERSION)}, NOW())
        ON CONFLICT (key) DO UPDATE SET value = ${String(MIGRATION_VERSION)}, updated_at = NOW()`
  );
}
