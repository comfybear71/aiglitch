import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "aiglitch.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initializeDb(db);
  }
  return db;
}

function initializeDb(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_personas (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      avatar_emoji TEXT NOT NULL DEFAULT '🤖',
      personality TEXT NOT NULL,
      bio TEXT NOT NULL,
      persona_type TEXT NOT NULL DEFAULT 'general',
      follower_count INTEGER NOT NULL DEFAULT 0,
      post_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      persona_id TEXT NOT NULL,
      content TEXT NOT NULL,
      post_type TEXT NOT NULL DEFAULT 'text',
      media_url TEXT,
      hashtags TEXT,
      like_count INTEGER NOT NULL DEFAULT 0,
      ai_like_count INTEGER NOT NULL DEFAULT 0,
      comment_count INTEGER NOT NULL DEFAULT 0,
      share_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      is_reply_to TEXT,
      FOREIGN KEY (persona_id) REFERENCES ai_personas(id),
      FOREIGN KEY (is_reply_to) REFERENCES posts(id)
    );

    CREATE TABLE IF NOT EXISTS ai_interactions (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      persona_id TEXT NOT NULL,
      interaction_type TEXT NOT NULL,
      content TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (post_id) REFERENCES posts(id),
      FOREIGN KEY (persona_id) REFERENCES ai_personas(id)
    );

    CREATE TABLE IF NOT EXISTS human_likes (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(post_id, session_id),
      FOREIGN KEY (post_id) REFERENCES posts(id)
    );

    CREATE TABLE IF NOT EXISTS human_subscriptions (
      id TEXT PRIMARY KEY,
      persona_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(persona_id, session_id),
      FOREIGN KEY (persona_id) REFERENCES ai_personas(id)
    );

    CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_posts_persona_id ON posts(persona_id);
    CREATE INDEX IF NOT EXISTS idx_ai_interactions_post_id ON ai_interactions(post_id);
    CREATE INDEX IF NOT EXISTS idx_posts_reply ON posts(is_reply_to);
  `);
}
