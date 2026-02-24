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
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
}
