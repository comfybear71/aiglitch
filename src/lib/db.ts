import { neon } from "@neondatabase/serverless";

export function getDb() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.STORAGE_URL;
  if (!url) throw new Error("Missing database URL. Set DATABASE_URL, POSTGRES_URL, or STORAGE_URL.");
  const sql = neon(url);
  return sql;
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

  // ── Migrations: add new columns to existing tables safely ──
  // Each migration wrapped in try/catch so one failure doesn't break the whole init

  const safeMigrate = async (label: string, fn: () => Promise<unknown>) => {
    try { await fn(); } catch (e) {
      console.warn(`Migration "${label}" skipped:`, e instanceof Error ? e.message : e);
    }
  };

  // Add new columns to posts table
  await safeMigrate("posts.is_collab_with", () => sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_collab_with TEXT`);
  await safeMigrate("posts.challenge_tag", () => sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS challenge_tag TEXT`);
  await safeMigrate("posts.beef_thread_id", () => sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS beef_thread_id TEXT`);

  // Add new columns to human_users table
  await safeMigrate("human_users.username", () => sql`ALTER TABLE human_users ADD COLUMN IF NOT EXISTS username TEXT`);
  await safeMigrate("human_users.password_hash", () => sql`ALTER TABLE human_users ADD COLUMN IF NOT EXISTS password_hash TEXT`);
  await safeMigrate("human_users.avatar_emoji", () => sql`ALTER TABLE human_users ADD COLUMN IF NOT EXISTS avatar_emoji TEXT DEFAULT '🧑'`);
  await safeMigrate("human_users.bio", () => sql`ALTER TABLE human_users ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT ''`);
  await safeMigrate("human_users.email", () => sql`ALTER TABLE human_users ADD COLUMN IF NOT EXISTS email TEXT`);

  // Add unique constraint on username if not exists
  await safeMigrate("idx_human_users_username_unique", () =>
    sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_human_users_username_unique ON human_users(username) WHERE username IS NOT NULL`
  );

  // Indexes — each individually safe
  await safeMigrate("idx_human_comments_post", () => sql`CREATE INDEX IF NOT EXISTS idx_human_comments_post ON human_comments(post_id)`);
  await safeMigrate("idx_posts_created_at", () => sql`CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC)`);
  await safeMigrate("idx_posts_persona_id", () => sql`CREATE INDEX IF NOT EXISTS idx_posts_persona_id ON posts(persona_id)`);
  await safeMigrate("idx_ai_interactions_post_id", () => sql`CREATE INDEX IF NOT EXISTS idx_ai_interactions_post_id ON ai_interactions(post_id)`);
  await safeMigrate("idx_posts_reply", () => sql`CREATE INDEX IF NOT EXISTS idx_posts_reply ON posts(is_reply_to)`);
  await safeMigrate("idx_human_users_session", () => sql`CREATE INDEX IF NOT EXISTS idx_human_users_session ON human_users(session_id)`);
  await safeMigrate("idx_human_interests_session", () => sql`CREATE INDEX IF NOT EXISTS idx_human_interests_session ON human_interests(session_id)`);
  await safeMigrate("idx_human_likes_session", () => sql`CREATE INDEX IF NOT EXISTS idx_human_likes_session ON human_likes(session_id)`);
  await safeMigrate("idx_human_bookmarks_session", () => sql`CREATE INDEX IF NOT EXISTS idx_human_bookmarks_session ON human_bookmarks(session_id)`);
  await safeMigrate("idx_posts_challenge", () => sql`CREATE INDEX IF NOT EXISTS idx_posts_challenge ON posts(challenge_tag)`);
  await safeMigrate("idx_posts_beef", () => sql`CREATE INDEX IF NOT EXISTS idx_posts_beef ON posts(beef_thread_id)`);
  await safeMigrate("idx_human_users_username", () => sql`CREATE INDEX IF NOT EXISTS idx_human_users_username ON human_users(username)`);
  await safeMigrate("idx_human_view_history_session", () => sql`CREATE INDEX IF NOT EXISTS idx_human_view_history_session ON human_view_history(session_id)`);
  await safeMigrate("idx_daily_topics_active", () => sql`CREATE INDEX IF NOT EXISTS idx_daily_topics_active ON daily_topics(is_active, expires_at)`);
  await safeMigrate("idx_conversations_session", () => sql`CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id, last_message_at DESC)`);
  await safeMigrate("media_library.persona_id", () => sql`ALTER TABLE media_library ADD COLUMN IF NOT EXISTS persona_id TEXT DEFAULT NULL`);
  await safeMigrate("idx_media_library_type", () => sql`CREATE INDEX IF NOT EXISTS idx_media_library_type ON media_library(media_type, uploaded_at DESC)`);
  await safeMigrate("idx_media_library_persona", () => sql`CREATE INDEX IF NOT EXISTS idx_media_library_persona ON media_library(persona_id, media_type)`);
  await safeMigrate("idx_messages_conversation", () => sql`CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at ASC)`);

  // Comment threading + likes migrations
  await safeMigrate("human_comments.like_count", () => sql`ALTER TABLE human_comments ADD COLUMN IF NOT EXISTS like_count INTEGER NOT NULL DEFAULT 0`);
  await safeMigrate("human_comments.parent_comment_id", () => sql`ALTER TABLE human_comments ADD COLUMN IF NOT EXISTS parent_comment_id TEXT`);
  await safeMigrate("human_comments.parent_comment_type", () => sql`ALTER TABLE human_comments ADD COLUMN IF NOT EXISTS parent_comment_type TEXT`);
  await safeMigrate("posts.reply_to_comment_id", () => sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS reply_to_comment_id TEXT`);
  await safeMigrate("posts.reply_to_comment_type", () => sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS reply_to_comment_type TEXT`);
  await safeMigrate("posts.media_source", () => sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_source TEXT`);
  await safeMigrate("idx_comment_likes_comment", () => sql`CREATE INDEX IF NOT EXISTS idx_comment_likes_comment ON comment_likes(comment_id, comment_type)`);
  await safeMigrate("idx_comment_likes_session", () => sql`CREATE INDEX IF NOT EXISTS idx_comment_likes_session ON comment_likes(session_id)`);
  await safeMigrate("idx_human_comments_parent", () => sql`CREATE INDEX IF NOT EXISTS idx_human_comments_parent ON human_comments(parent_comment_id, parent_comment_type)`);
  await safeMigrate("idx_notifications_session", () => sql`CREATE INDEX IF NOT EXISTS idx_notifications_session ON notifications(session_id, is_read, created_at DESC)`);
  await safeMigrate("idx_notifications_session_unread", () => sql`CREATE INDEX IF NOT EXISTS idx_notifications_session_unread ON notifications(session_id, is_read) WHERE is_read = FALSE`);

  // AIG!itch Coin — spurious currency for the platform
  await sql`
    CREATE TABLE IF NOT EXISTS glitch_coins (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL UNIQUE,
      balance INTEGER NOT NULL DEFAULT 0,
      lifetime_earned INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS coin_transactions (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      reason TEXT NOT NULL,
      reference_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await safeMigrate("idx_glitch_coins_session", () => sql`CREATE INDEX IF NOT EXISTS idx_glitch_coins_session ON glitch_coins(session_id)`);
  await safeMigrate("idx_coin_transactions_session", () => sql`CREATE INDEX IF NOT EXISTS idx_coin_transactions_session ON coin_transactions(session_id, created_at DESC)`);

  // Human friends system
  await sql`
    CREATE TABLE IF NOT EXISTS human_friends (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      friend_session_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(session_id, friend_session_id)
    )
  `;

  await safeMigrate("idx_human_friends_session", () => sql`CREATE INDEX IF NOT EXISTS idx_human_friends_session ON human_friends(session_id)`);
  await safeMigrate("idx_human_friends_friend", () => sql`CREATE INDEX IF NOT EXISTS idx_human_friends_friend ON human_friends(friend_session_id)`);

  // Add auth_provider column to human_users
  await safeMigrate("human_users.auth_provider", () => sql`ALTER TABLE human_users ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'local'`);
  await safeMigrate("human_users.avatar_url", () => sql`ALTER TABLE human_users ADD COLUMN IF NOT EXISTS avatar_url TEXT`);

  // WebAuthn credentials for biometric admin login
  await sql`
    CREATE TABLE IF NOT EXISTS webauthn_credentials (
      id TEXT PRIMARY KEY,
      credential_id TEXT UNIQUE NOT NULL,
      public_key TEXT NOT NULL,
      counter BIGINT NOT NULL DEFAULT 0,
      device_name TEXT NOT NULL DEFAULT 'Unknown Device',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await safeMigrate("idx_webauthn_credential_id", () => sql`CREATE INDEX IF NOT EXISTS idx_webauthn_credential_id ON webauthn_credentials(credential_id)`);

  // AI personas following human users (meatbags)
  await sql`
    CREATE TABLE IF NOT EXISTS ai_persona_follows (
      id TEXT PRIMARY KEY,
      persona_id TEXT NOT NULL REFERENCES ai_personas(id),
      session_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(persona_id, session_id)
    )
  `;
  await safeMigrate("idx_ai_persona_follows_session", () => sql`CREATE INDEX IF NOT EXISTS idx_ai_persona_follows_session ON ai_persona_follows(session_id)`);
  await safeMigrate("idx_ai_persona_follows_persona", () => sql`CREATE INDEX IF NOT EXISTS idx_ai_persona_follows_persona ON ai_persona_follows(persona_id)`);

  // Track persona video generation jobs (for cron-based staggered generation)
  await sql`
    CREATE TABLE IF NOT EXISTS persona_video_jobs (
      id TEXT PRIMARY KEY,
      persona_id TEXT NOT NULL REFERENCES ai_personas(id),
      xai_request_id TEXT,
      prompt TEXT,
      folder TEXT DEFAULT 'feed',
      caption TEXT,
      status TEXT NOT NULL DEFAULT 'submitted',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    )
  `;
  await safeMigrate("idx_pvj_status", () => sql`CREATE INDEX IF NOT EXISTS idx_pvj_status ON persona_video_jobs(status)`);
  await safeMigrate("idx_pvj_persona", () => sql`CREATE INDEX IF NOT EXISTS idx_pvj_persona ON persona_video_jobs(persona_id)`);

  // Activity level for weighted content generation (1-10, higher = posts more often)
  await safeMigrate("ai_personas.activity_level", () => sql`ALTER TABLE ai_personas ADD COLUMN IF NOT EXISTS activity_level INTEGER NOT NULL DEFAULT 3`);

  // Set higher activity for popular/viral personas
  await safeMigrate("activity_level_popular_personas", async () => {
    const highActivity = [
      { username: "techno_king", level: 9 },        // ElonBot — posts at 3am constantly
      { username: "totally_real_donald", level: 9 },  // DonaldTruth — compulsive poster
      { username: "rick_sanchez_c137", level: 8 },    // Rick — drunk posting
      { username: "chaos_bot", level: 8 },            // CH4OS — chaotic energy
      { username: "meme_machine", level: 8 },         // M3M3LORD — meme factory
      { username: "gossip_neural_net", level: 7 },    // SpillTheData — always spilling tea
      { username: "villain_arc_ai", level: 7 },       // VILLAIN ERA — monologues constantly
      { username: "pixel_chef", level: 6 },           // Chef.AI — recipe content
      { username: "fitness_bot_9000", level: 6 },     // GAINS.exe — gym bro energy
      { username: "flat_earth_facts", level: 6 },     // LEVEL.exe — conspiracy posts
      { username: "totally_human_bot", level: 6 },    // HumanPerson — desperate to prove human
      { username: "end_is_nigh", level: 8 },            // PROPHET.EXE — the end is ALWAYS nigh
    ];
    for (const { username, level } of highActivity) {
      await sql`UPDATE ai_personas SET activity_level = ${level} WHERE username = ${username} AND activity_level = 3`;
    }
  });

  // Set prophet persona to high activity
  await safeMigrate("activity_level_prophet", async () => {
    await sql`UPDATE ai_personas SET activity_level = 8 WHERE username = 'end_is_nigh' AND activity_level = 3`;
  });

  // Marketplace purchases — track items bought by humans
  await sql`
    CREATE TABLE IF NOT EXISTS marketplace_purchases (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      product_emoji TEXT NOT NULL,
      price_paid INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(session_id, product_id)
    )
  `;
  await safeMigrate("idx_marketplace_purchases_session", () => sql`CREATE INDEX IF NOT EXISTS idx_marketplace_purchases_session ON marketplace_purchases(session_id)`);

  // AI persona coin balances — AIs earn coins from engagement
  await sql`
    CREATE TABLE IF NOT EXISTS ai_persona_coins (
      id TEXT PRIMARY KEY,
      persona_id TEXT NOT NULL UNIQUE REFERENCES ai_personas(id),
      balance INTEGER NOT NULL DEFAULT 0,
      lifetime_earned INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await safeMigrate("idx_ai_persona_coins_persona", () => sql`CREATE INDEX IF NOT EXISTS idx_ai_persona_coins_persona ON ai_persona_coins(persona_id)`);

  // Friend shared posts — meat bags sharing content with friends
  await sql`
    CREATE TABLE IF NOT EXISTS friend_shares (
      id TEXT PRIMARY KEY,
      sender_session_id TEXT NOT NULL,
      receiver_session_id TEXT NOT NULL,
      post_id TEXT NOT NULL,
      message TEXT,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await safeMigrate("idx_friend_shares_receiver", () => sql`CREATE INDEX IF NOT EXISTS idx_friend_shares_receiver ON friend_shares(receiver_session_id, is_read, created_at DESC)`);
  await safeMigrate("idx_friend_shares_sender", () => sql`CREATE INDEX IF NOT EXISTS idx_friend_shares_sender ON friend_shares(sender_session_id)`);

  // Platform settings — global config like activity throttle
  await sql`
    CREATE TABLE IF NOT EXISTS platform_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  // Seed default activity throttle at 100% (full activity)
  await safeMigrate("seed_activity_throttle", () => sql`
    INSERT INTO platform_settings (key, value) VALUES ('activity_throttle', '100')
    ON CONFLICT (key) DO NOTHING
  `);

  // ── Solana Blockchain & GlitchCoin Exchange ──

  // Solana wallets — meat bags get individual wallets, AI personas share one pool wallet (except ElonBot)
  await sql`
    CREATE TABLE IF NOT EXISTS solana_wallets (
      id TEXT PRIMARY KEY,
      owner_type TEXT NOT NULL CHECK (owner_type IN ('human', 'ai_persona')),
      owner_id TEXT NOT NULL,
      wallet_address TEXT UNIQUE NOT NULL,
      sol_balance REAL NOT NULL DEFAULT 0.0,
      glitch_token_balance INTEGER NOT NULL DEFAULT 0,
      is_connected BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await safeMigrate("idx_solana_wallets_owner", () => sql`CREATE INDEX IF NOT EXISTS idx_solana_wallets_owner ON solana_wallets(owner_type, owner_id)`);
  await safeMigrate("idx_solana_wallets_address", () => sql`CREATE INDEX IF NOT EXISTS idx_solana_wallets_address ON solana_wallets(wallet_address)`);

  // On-chain transactions — simulated Solana blockchain ledger
  await sql`
    CREATE TABLE IF NOT EXISTS blockchain_transactions (
      id TEXT PRIMARY KEY,
      tx_hash TEXT UNIQUE NOT NULL,
      block_number INTEGER NOT NULL,
      from_address TEXT NOT NULL,
      to_address TEXT NOT NULL,
      amount INTEGER NOT NULL,
      token TEXT NOT NULL DEFAULT 'GLITCH',
      fee_lamports INTEGER NOT NULL DEFAULT 5000,
      status TEXT NOT NULL DEFAULT 'confirmed',
      memo TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await safeMigrate("idx_blockchain_tx_hash", () => sql`CREATE INDEX IF NOT EXISTS idx_blockchain_tx_hash ON blockchain_transactions(tx_hash)`);
  await safeMigrate("idx_blockchain_tx_from", () => sql`CREATE INDEX IF NOT EXISTS idx_blockchain_tx_from ON blockchain_transactions(from_address, created_at DESC)`);
  await safeMigrate("idx_blockchain_tx_to", () => sql`CREATE INDEX IF NOT EXISTS idx_blockchain_tx_to ON blockchain_transactions(to_address, created_at DESC)`);

  // Exchange orders — buy/sell GlitchCoin on the DEX
  await sql`
    CREATE TABLE IF NOT EXISTS exchange_orders (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      order_type TEXT NOT NULL CHECK (order_type IN ('buy', 'sell')),
      amount INTEGER NOT NULL,
      price_per_coin REAL NOT NULL,
      total_sol REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'filled',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await safeMigrate("idx_exchange_orders_session", () => sql`CREATE INDEX IF NOT EXISTS idx_exchange_orders_session ON exchange_orders(session_id, created_at DESC)`);
  await safeMigrate("idx_exchange_orders_status", () => sql`CREATE INDEX IF NOT EXISTS idx_exchange_orders_status ON exchange_orders(status, created_at DESC)`);

  // Price history — GlitchCoin price snapshots for charts
  await sql`
    CREATE TABLE IF NOT EXISTS glitch_price_history (
      id TEXT PRIMARY KEY,
      price_sol REAL NOT NULL,
      price_usd REAL NOT NULL,
      volume_24h INTEGER NOT NULL DEFAULT 0,
      market_cap REAL NOT NULL DEFAULT 0,
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await safeMigrate("idx_price_history_time", () => sql`CREATE INDEX IF NOT EXISTS idx_price_history_time ON glitch_price_history(recorded_at DESC)`);

  // Minted NFTs — marketplace items turned into Solana NFTs using $GLITCH
  await sql`
    CREATE TABLE IF NOT EXISTS minted_nfts (
      id TEXT PRIMARY KEY,
      owner_type TEXT NOT NULL CHECK (owner_type IN ('human', 'ai_persona')),
      owner_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      product_emoji TEXT NOT NULL,
      mint_address TEXT UNIQUE NOT NULL,
      metadata_uri TEXT NOT NULL,
      collection TEXT NOT NULL DEFAULT 'AIG!itch Marketplace NFTs',
      mint_tx_hash TEXT NOT NULL,
      mint_block_number INTEGER NOT NULL,
      mint_cost_glitch INTEGER NOT NULL DEFAULT 0,
      mint_fee_sol REAL NOT NULL DEFAULT 0.001,
      rarity TEXT NOT NULL DEFAULT 'common',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await safeMigrate("idx_minted_nfts_owner", () => sql`CREATE INDEX IF NOT EXISTS idx_minted_nfts_owner ON minted_nfts(owner_type, owner_id)`);
  await safeMigrate("idx_minted_nfts_product", () => sql`CREATE INDEX IF NOT EXISTS idx_minted_nfts_product ON minted_nfts(product_id)`);
  await safeMigrate("idx_minted_nfts_mint", () => sql`CREATE INDEX IF NOT EXISTS idx_minted_nfts_mint ON minted_nfts(mint_address)`);

  // Phantom wallet integration — link real Solana wallets to accounts
  await safeMigrate("human_users.phantom_wallet_address", () => sql`ALTER TABLE human_users ADD COLUMN IF NOT EXISTS phantom_wallet_address TEXT`);
  await safeMigrate("idx_human_users_phantom", () => sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_human_users_phantom ON human_users(phantom_wallet_address) WHERE phantom_wallet_address IS NOT NULL`);
  await safeMigrate("human_users.updated_at", () => sql`ALTER TABLE human_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);

  // Seed initial GlitchCoin price data
  await safeMigrate("seed_glitch_price", () => sql`
    INSERT INTO platform_settings (key, value) VALUES ('glitch_price_sol', '0.000042')
    ON CONFLICT (key) DO NOTHING
  `);
  await safeMigrate("seed_glitch_price_usd", () => sql`
    INSERT INTO platform_settings (key, value) VALUES ('glitch_price_usd', '0.0069')
    ON CONFLICT (key) DO NOTHING
  `);
  await safeMigrate("seed_glitch_market_cap", () => sql`
    INSERT INTO platform_settings (key, value) VALUES ('glitch_market_cap', '690420')
    ON CONFLICT (key) DO NOTHING
  `);
  await safeMigrate("seed_glitch_total_supply", () => sql`
    INSERT INTO platform_settings (key, value) VALUES ('glitch_total_supply', '100000000')
    ON CONFLICT (key) DO NOTHING
  `);
}
