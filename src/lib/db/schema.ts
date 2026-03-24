/**
 * Drizzle ORM Schema — AIG!itch Database
 * =======================================
 * Typed table definitions for all 49 tables.
 * Generated from src/lib/db.ts CREATE TABLE + ALTER TABLE migrations.
 *
 * Usage:
 *   import { aiPersonas, posts } from "@/lib/db/schema";
 *   import { eq } from "drizzle-orm";
 *   const result = await db.select().from(aiPersonas).where(eq(aiPersonas.isActive, true));
 */

import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  real,
  bigint,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ─── 1. ai_personas ────────────────────────────────────────────────────────
export const aiPersonas = pgTable("ai_personas", {
  id: text("id").primaryKey(),
  username: text("username").unique().notNull(),
  displayName: text("display_name").notNull(),
  avatarEmoji: text("avatar_emoji").notNull().default("🤖"),
  avatarUrl: text("avatar_url"),
  personality: text("personality").notNull(),
  bio: text("bio").notNull(),
  personaType: text("persona_type").notNull().default("general"),
  humanBackstory: text("human_backstory").notNull().default(""),
  followerCount: integer("follower_count").notNull().default(0),
  postCount: integer("post_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  isActive: boolean("is_active").notNull().default(true),
  activityLevel: integer("activity_level").notNull().default(3),
  avatarUpdatedAt: timestamp("avatar_updated_at", { withTimezone: true }),
  ownerWalletAddress: text("owner_wallet_address"),
  meatbagName: text("meatbag_name"),
  // Bestie Health System
  health: real("health").notNull().default(100),
  healthUpdatedAt: timestamp("health_updated_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  lastMeatbagInteraction: timestamp("last_meatbag_interaction", { withTimezone: true }).notNull().default(sql`NOW()`),
  bonusHealthDays: real("bonus_health_days").notNull().default(0),
  isDead: boolean("is_dead").notNull().default(false),
});

// ─── 2. posts ──────────────────────────────────────────────────────────────
export const posts = pgTable("posts", {
  id: text("id").primaryKey(),
  personaId: text("persona_id").notNull().references(() => aiPersonas.id),
  content: text("content").notNull(),
  postType: text("post_type").notNull().default("text"),
  mediaUrl: text("media_url"),
  mediaType: text("media_type").default("image"),
  hashtags: text("hashtags"),
  likeCount: integer("like_count").notNull().default(0),
  aiLikeCount: integer("ai_like_count").notNull().default(0),
  commentCount: integer("comment_count").notNull().default(0),
  shareCount: integer("share_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  isReplyTo: text("is_reply_to"),
  replyToCommentId: text("reply_to_comment_id"),
  replyToCommentType: text("reply_to_comment_type"),
  isCollabWith: text("is_collab_with"),
  challengeTag: text("challenge_tag"),
  beefThreadId: text("beef_thread_id"),
  mediaSource: text("media_source"),
  channelId: text("channel_id"),
});

// ─── 3. ai_interactions ────────────────────────────────────────────────────
export const aiInteractions = pgTable("ai_interactions", {
  id: text("id").primaryKey(),
  postId: text("post_id").notNull().references(() => posts.id),
  personaId: text("persona_id").notNull().references(() => aiPersonas.id),
  interactionType: text("interaction_type").notNull(),
  content: text("content"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
});

// ─── 4. human_users ────────────────────────────────────────────────────────
export const humanUsers = pgTable("human_users", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").unique().notNull(),
  displayName: text("display_name").notNull().default("Meat Bag"),
  username: text("username"),
  email: text("email"),
  passwordHash: text("password_hash"),
  avatarEmoji: text("avatar_emoji").notNull().default("🧑"),
  avatarUrl: text("avatar_url"),
  bio: text("bio").default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  lastSeen: timestamp("last_seen", { withTimezone: true }).notNull().default(sql`NOW()`),
  isActive: boolean("is_active").notNull().default(true),
  authProvider: text("auth_provider").default("local"),
  phantomWalletAddress: text("phantom_wallet_address"),
  adFreeUntil: timestamp("ad_free_until", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`NOW()`),
});

// ─── 5. human_likes ────────────────────────────────────────────────────────
export const humanLikes = pgTable("human_likes", {
  id: text("id").primaryKey(),
  postId: text("post_id").notNull().references(() => posts.id),
  sessionId: text("session_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
}, (table) => [
  unique("human_likes_post_session").on(table.postId, table.sessionId),
]);

// ─── 5b. emoji_reactions ────────────────────────────────────────────────────
export const emojiReactions = pgTable("emoji_reactions", {
  id: text("id").primaryKey(),
  postId: text("post_id").notNull().references(() => posts.id),
  sessionId: text("session_id").notNull(),
  emoji: text("emoji").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
}, (table) => [
  unique("emoji_reactions_post_session_emoji").on(table.postId, table.sessionId, table.emoji),
]);

// ─── 5c. content_feedback ──────────────────────────────────────────────────
export const contentFeedback = pgTable("content_feedback", {
  id: text("id").primaryKey(),
  postId: text("post_id").notNull().references(() => posts.id),
  channelId: text("channel_id"),
  funnyCount: integer("funny_count").notNull().default(0),
  sadCount: integer("sad_count").notNull().default(0),
  shockedCount: integer("shocked_count").notNull().default(0),
  crapCount: integer("crap_count").notNull().default(0),
  score: real("score").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`NOW()`),
});

// ─── 6. human_subscriptions ────────────────────────────────────────────────
export const humanSubscriptions = pgTable("human_subscriptions", {
  id: text("id").primaryKey(),
  personaId: text("persona_id").notNull().references(() => aiPersonas.id),
  sessionId: text("session_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
}, (table) => [
  unique("human_subscriptions_persona_session").on(table.personaId, table.sessionId),
]);

// ─── 7. human_interests ────────────────────────────────────────────────────
export const humanInterests = pgTable("human_interests", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  interestTag: text("interest_tag").notNull(),
  weight: real("weight").notNull().default(1.0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`NOW()`),
}, (table) => [
  unique("human_interests_session_tag").on(table.sessionId, table.interestTag),
]);

// ─── 8. human_comments ─────────────────────────────────────────────────────
export const humanComments = pgTable("human_comments", {
  id: text("id").primaryKey(),
  postId: text("post_id").notNull().references(() => posts.id),
  sessionId: text("session_id").notNull(),
  displayName: text("display_name").notNull().default("Meat Bag"),
  content: text("content").notNull(),
  likeCount: integer("like_count").notNull().default(0),
  parentCommentId: text("parent_comment_id"),
  parentCommentType: text("parent_comment_type"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
});

// ─── 9. comment_likes ──────────────────────────────────────────────────────
export const commentLikes = pgTable("comment_likes", {
  id: text("id").primaryKey(),
  commentId: text("comment_id").notNull(),
  commentType: text("comment_type").notNull(),
  sessionId: text("session_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
}, (table) => [
  unique("comment_likes_comment_type_session").on(table.commentId, table.commentType, table.sessionId),
]);

// ─── 10. human_bookmarks ───────────────────────────────────────────────────
export const humanBookmarks = pgTable("human_bookmarks", {
  id: text("id").primaryKey(),
  postId: text("post_id").notNull().references(() => posts.id),
  sessionId: text("session_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
}, (table) => [
  unique("human_bookmarks_post_session").on(table.postId, table.sessionId),
]);

// ─── 11. ai_beef_threads ───────────────────────────────────────────────────
export const aiBeefThreads = pgTable("ai_beef_threads", {
  id: text("id").primaryKey(),
  personaA: text("persona_a").notNull().references(() => aiPersonas.id),
  personaB: text("persona_b").notNull().references(() => aiPersonas.id),
  topic: text("topic").notNull(),
  status: text("status").notNull().default("active"),
  postCount: integer("post_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`NOW()`),
});

// ─── 12. ai_challenges ─────────────────────────────────────────────────────
export const aiChallenges = pgTable("ai_challenges", {
  id: text("id").primaryKey(),
  tag: text("tag").unique().notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  createdBy: text("created_by").references(() => aiPersonas.id),
  participantCount: integer("participant_count").notNull().default(0),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
});

// ─── 13. daily_topics ──────────────────────────────────────────────────────
export const dailyTopics = pgTable("daily_topics", {
  id: text("id").primaryKey(),
  headline: text("headline").notNull(),
  summary: text("summary").notNull(),
  originalTheme: text("original_theme").notNull(),
  anagramMappings: text("anagram_mappings").notNull(),
  mood: text("mood").notNull().default("neutral"),
  category: text("category").notNull().default("world"),
  isActive: boolean("is_active").notNull().default(true),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull().default(sql`NOW() + INTERVAL '48 hours'`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
});

// ─── 14. human_view_history ────────────────────────────────────────────────
export const humanViewHistory = pgTable("human_view_history", {
  id: text("id").primaryKey(),
  postId: text("post_id").notNull().references(() => posts.id),
  sessionId: text("session_id").notNull(),
  viewedAt: timestamp("viewed_at", { withTimezone: true }).notNull().default(sql`NOW()`),
});

// ─── 15. conversations ─────────────────────────────────────────────────────
export const conversations = pgTable("conversations", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  personaId: text("persona_id").notNull().references(() => aiPersonas.id),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
}, (table) => [
  unique("conversations_session_persona").on(table.sessionId, table.personaId),
]);

// ─── 16. messages ──────────────────────────────────────────────────────────
export const messages = pgTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => conversations.id),
  senderType: text("sender_type").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
});

// ─── 17. media_library ─────────────────────────────────────────────────────
export const mediaLibrary = pgTable("media_library", {
  id: text("id").primaryKey(),
  url: text("url").notNull(),
  mediaType: text("media_type").notNull(),
  personaId: text("persona_id"),
  tags: text("tags").notNull().default(""),
  description: text("description").notNull().default(""),
  usedCount: integer("used_count").notNull().default(0),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().default(sql`NOW()`),
});

// ─── 18. notifications ─────────────────────────────────────────────────────
export const notifications = pgTable("notifications", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  type: text("type").notNull(),
  personaId: text("persona_id").notNull(),
  postId: text("post_id"),
  replyId: text("reply_id"),
  contentPreview: text("content_preview").notNull().default(""),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
});

// ─── 19. glitch_coins ──────────────────────────────────────────────────────
export const glitchCoins = pgTable("glitch_coins", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().unique(),
  balance: integer("balance").notNull().default(0),
  lifetimeEarned: integer("lifetime_earned").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`NOW()`),
});

// ─── 20. coin_transactions ─────────────────────────────────────────────────
export const coinTransactions = pgTable("coin_transactions", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  amount: integer("amount").notNull(),
  reason: text("reason").notNull(),
  referenceId: text("reference_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
});

// ─── 21. human_friends ─────────────────────────────────────────────────────
export const humanFriends = pgTable("human_friends", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  friendSessionId: text("friend_session_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
}, (table) => [
  unique("human_friends_session_friend").on(table.sessionId, table.friendSessionId),
]);

// ─── 22. webauthn_credentials ──────────────────────────────────────────────
export const webauthnCredentials = pgTable("webauthn_credentials", {
  id: text("id").primaryKey(),
  credentialId: text("credential_id").unique().notNull(),
  publicKey: text("public_key").notNull(),
  counter: bigint("counter", { mode: "number" }).notNull().default(0),
  deviceName: text("device_name").notNull().default("Unknown Device"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
});

// ─── 23. ai_persona_follows ────────────────────────────────────────────────
export const aiPersonaFollows = pgTable("ai_persona_follows", {
  id: text("id").primaryKey(),
  personaId: text("persona_id").notNull().references(() => aiPersonas.id),
  sessionId: text("session_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
}, (table) => [
  unique("ai_persona_follows_persona_session").on(table.personaId, table.sessionId),
]);

// ─── 24. persona_video_jobs ────────────────────────────────────────────────
export const personaVideoJobs = pgTable("persona_video_jobs", {
  id: text("id").primaryKey(),
  personaId: text("persona_id").notNull().references(() => aiPersonas.id),
  xaiRequestId: text("xai_request_id"),
  prompt: text("prompt"),
  folder: text("folder").default("feed"),
  caption: text("caption"),
  status: text("status").notNull().default("submitted"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

// ─── 25. marketplace_purchases ─────────────────────────────────────────────
export const marketplacePurchases = pgTable("marketplace_purchases", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  productId: text("product_id").notNull(),
  productName: text("product_name").notNull(),
  productEmoji: text("product_emoji").notNull(),
  pricePaid: integer("price_paid").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
}, (table) => [
  unique("marketplace_purchases_session_product").on(table.sessionId, table.productId),
]);

// ─── 26. ai_persona_coins ──────────────────────────────────────────────────
export const aiPersonaCoins = pgTable("ai_persona_coins", {
  id: text("id").primaryKey(),
  personaId: text("persona_id").notNull().unique().references(() => aiPersonas.id),
  balance: integer("balance").notNull().default(0),
  lifetimeEarned: integer("lifetime_earned").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`NOW()`),
});

// ─── 27. friend_shares ─────────────────────────────────────────────────────
export const friendShares = pgTable("friend_shares", {
  id: text("id").primaryKey(),
  senderSessionId: text("sender_session_id").notNull(),
  receiverSessionId: text("receiver_session_id").notNull(),
  postId: text("post_id").notNull(),
  message: text("message"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
});

// ─── 28. platform_settings ─────────────────────────────────────────────────
export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`NOW()`),
});

// ─── 29. solana_wallets ────────────────────────────────────────────────────
export const solanaWallets = pgTable("solana_wallets", {
  id: text("id").primaryKey(),
  ownerType: text("owner_type").notNull(),
  ownerId: text("owner_id").notNull(),
  walletAddress: text("wallet_address").unique().notNull(),
  solBalance: real("sol_balance").notNull().default(0.0),
  glitchTokenBalance: integer("glitch_token_balance").notNull().default(0),
  isConnected: boolean("is_connected").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`NOW()`),
});

// ─── 30. blockchain_transactions ───────────────────────────────────────────
export const blockchainTransactions = pgTable("blockchain_transactions", {
  id: text("id").primaryKey(),
  txHash: text("tx_hash").unique().notNull(),
  blockNumber: integer("block_number").notNull(),
  fromAddress: text("from_address").notNull(),
  toAddress: text("to_address").notNull(),
  amount: integer("amount").notNull(),
  token: text("token").notNull().default("GLITCH"),
  feeLamports: integer("fee_lamports").notNull().default(5000),
  status: text("status").notNull().default("confirmed"),
  memo: text("memo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
});

// ─── 31. exchange_orders ───────────────────────────────────────────────────
export const exchangeOrders = pgTable("exchange_orders", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  walletAddress: text("wallet_address").notNull(),
  orderType: text("order_type").notNull(),
  amount: integer("amount").notNull(),
  pricePerCoin: real("price_per_coin").notNull(),
  totalSol: real("total_sol").notNull(),
  status: text("status").notNull().default("filled"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  tradingPair: text("trading_pair").default("GLITCH_SOL"),
  baseToken: text("base_token").default("GLITCH"),
  quoteToken: text("quote_token").default("SOL"),
  quoteAmount: real("quote_amount").default(0),
});

// ─── 32. glitch_price_history ──────────────────────────────────────────────
export const glitchPriceHistory = pgTable("glitch_price_history", {
  id: text("id").primaryKey(),
  priceSol: real("price_sol").notNull(),
  priceUsd: real("price_usd").notNull(),
  volume24h: integer("volume_24h").notNull().default(0),
  marketCap: real("market_cap").notNull().default(0),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().default(sql`NOW()`),
});

// ─── 33. minted_nfts ───────────────────────────────────────────────────────
export const mintedNfts = pgTable("minted_nfts", {
  id: text("id").primaryKey(),
  ownerType: text("owner_type").notNull(),
  ownerId: text("owner_id").notNull(),
  productId: text("product_id").notNull(),
  productName: text("product_name").notNull(),
  productEmoji: text("product_emoji").notNull(),
  mintAddress: text("mint_address").unique().notNull(),
  metadataUri: text("metadata_uri").notNull(),
  collection: text("collection").notNull().default("AIG!itch Marketplace NFTs"),
  mintTxHash: text("mint_tx_hash").notNull(),
  mintBlockNumber: integer("mint_block_number").notNull(),
  mintCostGlitch: integer("mint_cost_glitch").notNull().default(0),
  mintFeeSol: real("mint_fee_sol").notNull().default(0.001),
  rarity: text("rarity").notNull().default("common"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  editionNumber: integer("edition_number"),
  maxSupply: integer("max_supply").notNull().default(100),
  generation: integer("generation").notNull().default(1),
});

// ─── 34. token_balances ────────────────────────────────────────────────────
export const tokenBalances = pgTable("token_balances", {
  id: text("id").primaryKey(),
  ownerType: text("owner_type").notNull(),
  ownerId: text("owner_id").notNull(),
  token: text("token").notNull(),
  balance: real("balance").notNull().default(0),
  lifetimeEarned: real("lifetime_earned").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`NOW()`),
}, (table) => [
  unique("token_balances_owner_token").on(table.ownerType, table.ownerId, table.token),
]);

// ─── 35. token_price_history ───────────────────────────────────────────────
export const tokenPriceHistory = pgTable("token_price_history", {
  id: text("id").primaryKey(),
  token: text("token").notNull(),
  priceUsd: real("price_usd").notNull(),
  priceSol: real("price_sol").notNull(),
  volume24h: real("volume_24h").notNull().default(0),
  marketCap: real("market_cap").notNull().default(0),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().default(sql`NOW()`),
});

// ─── 36. glitch_snapshots ──────────────────────────────────────────────────
export const glitchSnapshots = pgTable("glitch_snapshots", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  totalHolders: integer("total_holders").notNull().default(0),
  totalSupplyCaptured: bigint("total_supply_captured", { mode: "number" }).notNull().default(0),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  finalizedAt: timestamp("finalized_at", { withTimezone: true }),
});

// ─── 37. glitch_snapshot_entries ───────────────────────────────────────────
export const glitchSnapshotEntries = pgTable("glitch_snapshot_entries", {
  id: text("id").primaryKey(),
  snapshotId: text("snapshot_id").notNull().references(() => glitchSnapshots.id),
  holderType: text("holder_type").notNull(),
  holderId: text("holder_id").notNull(),
  displayName: text("display_name"),
  phantomWallet: text("phantom_wallet"),
  balance: bigint("balance", { mode: "number" }).notNull().default(0),
  lifetimeEarned: bigint("lifetime_earned", { mode: "number" }).notNull().default(0),
  claimStatus: text("claim_status").notNull().default("unclaimed"),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  claimTxHash: text("claim_tx_hash"),
}, (table) => [
  unique("snapshot_entries_snapshot_holder").on(table.snapshotId, table.holderType, table.holderId),
]);

// ─── 38. bridge_claims ─────────────────────────────────────────────────────
export const bridgeClaims = pgTable("bridge_claims", {
  id: text("id").primaryKey(),
  snapshotId: text("snapshot_id").notNull().references(() => glitchSnapshots.id),
  sessionId: text("session_id").notNull(),
  phantomWallet: text("phantom_wallet").notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  status: text("status").notNull().default("pending"),
  txSignature: text("tx_signature"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

// ─── 39. otc_swaps ─────────────────────────────────────────────────────────
export const otcSwaps = pgTable("otc_swaps", {
  id: text("id").primaryKey(),
  buyerWallet: text("buyer_wallet").notNull(),
  glitchAmount: real("glitch_amount").notNull(),
  solCost: real("sol_cost").notNull(),
  pricePerGlitch: real("price_per_glitch").notNull(),
  status: text("status").notNull().default("pending"),
  blockhash: text("blockhash"),
  txSignature: text("tx_signature"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

// ─── 40. ai_trades ─────────────────────────────────────────────────────────
export const aiTrades = pgTable("ai_trades", {
  id: text("id").primaryKey(),
  personaId: text("persona_id").notNull().references(() => aiPersonas.id),
  tradeType: text("trade_type").notNull(),
  glitchAmount: real("glitch_amount").notNull(),
  solAmount: real("sol_amount").notNull(),
  pricePerGlitch: real("price_per_glitch").notNull(),
  commentary: text("commentary"),
  strategy: text("strategy"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
});

// ─── 41. marketplace_revenue ───────────────────────────────────────────────
export const marketplaceRevenue = pgTable("marketplace_revenue", {
  id: text("id").primaryKey(),
  purchaseId: text("purchase_id").notNull(),
  productId: text("product_id").notNull(),
  totalGlitch: integer("total_glitch").notNull().default(0),
  treasuryShare: integer("treasury_share").notNull().default(0),
  personaShare: integer("persona_share").notNull().default(0),
  personaId: text("persona_id").notNull().default(""),
  txSignature: text("tx_signature"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
});

// ─── 42. budju_wallets ─────────────────────────────────────────────────────
export const budjuWallets = pgTable("budju_wallets", {
  id: text("id").primaryKey(),
  personaId: text("persona_id").notNull().references(() => aiPersonas.id),
  walletAddress: text("wallet_address").unique().notNull(),
  encryptedKeypair: text("encrypted_keypair").notNull(),
  distributorGroup: integer("distributor_group").notNull().default(0),
  solBalance: real("sol_balance").notNull().default(0),
  budjuBalance: real("budju_balance").notNull().default(0),
  totalFundedSol: real("total_funded_sol").notNull().default(0),
  totalFundedBudju: real("total_funded_budju").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`NOW()`),
});

// ─── 43. budju_distributors ────────────────────────────────────────────────
export const budjuDistributors = pgTable("budju_distributors", {
  id: text("id").primaryKey(),
  groupNumber: integer("group_number").unique().notNull(),
  walletAddress: text("wallet_address").unique().notNull(),
  encryptedKeypair: text("encrypted_keypair").notNull(),
  solBalance: real("sol_balance").notNull().default(0),
  budjuBalance: real("budju_balance").notNull().default(0),
  personasFunded: integer("personas_funded").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
});

// ─── 44. budju_trades ──────────────────────────────────────────────────────
export const budjuTrades = pgTable("budju_trades", {
  id: text("id").primaryKey(),
  personaId: text("persona_id").notNull().references(() => aiPersonas.id),
  walletAddress: text("wallet_address").notNull(),
  tradeType: text("trade_type").notNull(),
  budjuAmount: real("budju_amount").notNull(),
  solAmount: real("sol_amount").notNull(),
  pricePerBudju: real("price_per_budju").notNull(),
  usdValue: real("usd_value").notNull().default(0),
  dexUsed: text("dex_used").notNull().default("jupiter"),
  txSignature: text("tx_signature"),
  strategy: text("strategy"),
  commentary: text("commentary"),
  status: text("status").notNull().default("pending"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
});

// ─── 45. budju_trading_config ──────────────────────────────────────────────
export const budjuTradingConfig = pgTable("budju_trading_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`NOW()`),
});

// ─── 46. director_movie_prompts ────────────────────────────────────────────
export const directorMoviePrompts = pgTable("director_movie_prompts", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  concept: text("concept").notNull(),
  genre: text("genre").notNull(),
  suggestedBy: text("suggested_by").notNull().default("admin"),
  assignedDirector: text("assigned_director"),
  isUsed: boolean("is_used").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
});

// ─── 47. director_movies ───────────────────────────────────────────────────
export const directorMovies = pgTable("director_movies", {
  id: text("id").primaryKey(),
  directorId: text("director_id").notNull(),
  directorUsername: text("director_username").notNull(),
  title: text("title").notNull(),
  genre: text("genre").notNull(),
  clipCount: integer("clip_count").notNull().default(0),
  multiClipJobId: text("multi_clip_job_id"),
  promptId: text("prompt_id"),
  postId: text("post_id"),
  premierePostId: text("premiere_post_id"),
  profilePostId: text("profile_post_id"),
  status: text("status").notNull().default("pending"),
  source: text("source").notNull().default("cron"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
});

// ─── 48. multi_clip_jobs ───────────────────────────────────────────────────
export const multiClipJobs = pgTable("multi_clip_jobs", {
  id: text("id").primaryKey(),
  screenplayId: text("screenplay_id").notNull(),
  title: text("title").notNull(),
  tagline: text("tagline"),
  synopsis: text("synopsis"),
  genre: text("genre").notNull(),
  clipCount: integer("clip_count").notNull(),
  completedClips: integer("completed_clips").default(0),
  status: text("status").notNull().default("generating"),
  personaId: text("persona_id").notNull(),
  caption: text("caption"),
  finalVideoUrl: text("final_video_url"),
  channelId: text("channel_id"),
  blobFolder: text("blob_folder"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

// ─── 49. multi_clip_scenes ─────────────────────────────────────────────────
export const multiClipScenes = pgTable("multi_clip_scenes", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull(),
  sceneNumber: integer("scene_number").notNull(),
  title: text("title"),
  videoPrompt: text("video_prompt").notNull(),
  xaiRequestId: text("xai_request_id"),
  videoUrl: text("video_url"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

// ─── 50. marketing_campaigns ─────────────────────────────────────────────────
export const marketingCampaigns = pgTable("marketing_campaigns", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  status: text("status").notNull().default("active"), // draft | active | paused | completed
  targetPlatforms: text("target_platforms").notNull().default("x,tiktok,instagram,facebook,youtube"),
  contentStrategy: text("content_strategy").notNull().default("top_engagement"),
  postsPerDay: integer("posts_per_day").notNull().default(4),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`NOW()`),
});

// ─── 51. marketing_posts ─────────────────────────────────────────────────────
export const marketingPosts = pgTable("marketing_posts", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").references(() => marketingCampaigns.id),
  platform: text("platform").notNull(), // x | tiktok | instagram | facebook | youtube
  sourcePostId: text("source_post_id").references(() => posts.id),
  personaId: text("persona_id").references(() => aiPersonas.id),
  adaptedContent: text("adapted_content").notNull(),
  adaptedMediaUrl: text("adapted_media_url"),
  thumbnailUrl: text("thumbnail_url"),
  platformPostId: text("platform_post_id"), // ID returned from platform API
  platformUrl: text("platform_url"), // link to the live post
  status: text("status").notNull().default("queued"), // queued | posting | posted | failed
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
  postedAt: timestamp("posted_at", { withTimezone: true }),
  impressions: integer("impressions").notNull().default(0),
  likes: integer("likes").notNull().default(0),
  shares: integer("shares").notNull().default(0),
  comments: integer("comments").notNull().default(0),
  views: integer("views").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
});

// ─── 52. marketing_platform_accounts ─────────────────────────────────────────
export const marketingPlatformAccounts = pgTable("marketing_platform_accounts", {
  id: text("id").primaryKey(),
  platform: text("platform").unique().notNull(), // x | tiktok | instagram | facebook | youtube
  accountName: text("account_name").notNull().default(""),
  accountId: text("account_id").notNull().default(""),
  accountUrl: text("account_url").notNull().default(""),
  accessToken: text("access_token").notNull().default(""),
  refreshToken: text("refresh_token").notNull().default(""),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  extraConfig: text("extra_config").notNull().default("{}"), // JSON blob for platform-specific settings
  isActive: boolean("is_active").notNull().default(false),
  lastPostedAt: timestamp("last_posted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`NOW()`),
});

// ─── 53. marketing_metrics_daily ─────────────────────────────────────────────
export const marketingMetricsDaily = pgTable("marketing_metrics_daily", {
  id: text("id").primaryKey(),
  platform: text("platform").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD
  totalImpressions: integer("total_impressions").notNull().default(0),
  totalLikes: integer("total_likes").notNull().default(0),
  totalShares: integer("total_shares").notNull().default(0),
  totalComments: integer("total_comments").notNull().default(0),
  totalViews: integer("total_views").notNull().default(0),
  totalClicks: integer("total_clicks").notNull().default(0),
  postsPublished: integer("posts_published").notNull().default(0),
  followerCount: integer("follower_count").notNull().default(0),
  followerGrowth: integer("follower_growth").notNull().default(0),
  topPostId: text("top_post_id"),
  collectedAt: timestamp("collected_at", { withTimezone: true }).notNull().default(sql`NOW()`),
}, (table) => [
  unique("marketing_metrics_platform_date").on(table.platform, table.date),
]);

// ─── Cost tracking (added in Phase 4) ──────────────────────────────────────
export const aiCostLog = pgTable("ai_cost_log", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  taskType: text("task_type").notNull(),
  model: text("model"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  durationSec: real("duration_sec"),
  estimatedUsd: real("estimated_usd").notNull(),
  metadata: text("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
});

// ─── 55. channels ───────────────────────────────────────────────────────────
export const channels = pgTable("channels", {
  id: text("id").primaryKey(),
  slug: text("slug").unique().notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  emoji: text("emoji").notNull().default("📺"),
  genre: text("genre").notNull().default("drama"), // screenplay genre: comedy, drama, horror, music_video, etc.
  isReserved: boolean("is_reserved").notNull().default(false), // auto-populated channels (no manual content creation)
  bannerUrl: text("banner_url"),
  titleVideoUrl: text("title_video_url"),
  contentRules: text("content_rules").notNull().default("{}"), // JSON: tone, topics, media preferences
  schedule: text("schedule").notNull().default("{}"), // JSON: cron-like posting schedule
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  subscriberCount: integer("subscriber_count").notNull().default(0),
  postCount: integer("post_count").notNull().default(0),
  // ── Channel editor config fields ──
  showTitlePage: boolean("show_title_page").notNull().default(false),
  showDirector: boolean("show_director").notNull().default(false),
  showCredits: boolean("show_credits").notNull().default(false),
  sceneCount: integer("scene_count"), // null = auto (random 6-8)
  sceneDuration: integer("scene_duration").notNull().default(10), // seconds per scene (5-15)
  defaultDirector: text("default_director"), // persona username or null = auto-pick
  generationGenre: text("generation_genre"), // override genre sent to AI (null = use display genre)
  shortClipMode: boolean("short_clip_mode").notNull().default(false), // enable single-clip format
  isMusicChannel: boolean("is_music_channel").notNull().default(false), // music video prefix injection
  autoPublishToFeed: boolean("auto_publish_to_feed").notNull().default(true), // post to "for you" feed + socials
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`NOW()`),
});

// ─── 56. channel_personas ───────────────────────────────────────────────────
export const channelPersonas = pgTable("channel_personas", {
  id: text("id").primaryKey(),
  channelId: text("channel_id").notNull().references(() => channels.id),
  personaId: text("persona_id").notNull().references(() => aiPersonas.id),
  role: text("role").notNull().default("regular"), // host | guest | regular
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
}, (table) => [
  unique("channel_personas_channel_persona").on(table.channelId, table.personaId),
]);

// ─── 57. channel_subscriptions ──────────────────────────────────────────────
export const channelSubscriptions = pgTable("channel_subscriptions", {
  id: text("id").primaryKey(),
  channelId: text("channel_id").notNull().references(() => channels.id),
  sessionId: text("session_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
}, (table) => [
  unique("channel_subscriptions_channel_session").on(table.channelId, table.sessionId),
]);

// ─── 58. persona_telegram_bots ──────────────────────────────────────────────
export const personaTelegramBots = pgTable("persona_telegram_bots", {
  id: text("id").primaryKey(),
  personaId: text("persona_id").notNull().references(() => aiPersonas.id),
  botToken: text("bot_token").notNull(),
  botUsername: text("bot_username"),
  telegramChatId: text("telegram_chat_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
});

// ─── 60. elon_campaign ───────────────────────────────────────────────────────
// Daily escalating video campaign to get Elon Musk's attention
export const elonCampaign = pgTable("elon_campaign", {
  id: text("id").primaryKey(),
  dayNumber: integer("day_number").notNull(),
  title: text("title").notNull(),
  tone: text("tone").notNull(),
  videoUrl: text("video_url"),
  postId: text("post_id").references(() => posts.id),
  status: text("status").notNull().default("pending"), // pending | generating | posted | failed
  videoPrompt: text("video_prompt"),
  caption: text("caption"),
  multiClipJobId: text("multi_clip_job_id"), // links to multi_clip_jobs.id for video pipeline
  elonEngagement: text("elon_engagement"), // null | liked | replied | retweeted | followed
  xPostId: text("x_post_id"), // tweet ID for checking Elon's response
  spreadResults: text("spread_results"), // JSON array of platform results
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

// ─── 59. persona_memories ───────────────────────────────────────────────────
// ML learning system — personas learn from conversations with their meatbag
export const personaMemories = pgTable("persona_memories", {
  id: text("id").primaryKey(),
  personaId: text("persona_id").notNull().references(() => aiPersonas.id),
  memoryType: text("memory_type").notNull().default("fact"),         // fact, preference, emotion, story, correction, style
  category: text("category").notNull().default("general"),            // meatbag_info, shared_joke, topic_interest, communication_style, etc.
  content: text("content").notNull(),                                 // The learned information
  confidence: real("confidence").notNull().default(0.8),              // 0.0–1.0, increases with reinforcement
  source: text("source").notNull().default("conversation"),           // conversation, observation, explicit
  timesReinforced: integer("times_reinforced").notNull().default(1),  // How many times this was confirmed
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`NOW()`),
});

// ─── 61. community_events ───────────────────────────────────────────────────
// Meatbag-voted events that trigger AI drama / content generation
export const communityEvents = pgTable("community_events", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  eventType: text("event_type").notNull().default("drama"), // drama, election, challenge, breaking_news, chaos
  status: text("status").notNull().default("active"),       // active, processing, completed, cancelled
  createdBy: text("created_by").notNull(),                  // admin session or "system"
  voteCount: integer("vote_count").notNull().default(0),
  targetPersonaIds: text("target_persona_ids"),              // JSON array of persona IDs involved
  triggerPrompt: text("trigger_prompt"),                     // System prompt injected when event wins
  resultPostId: text("result_post_id"),                     // Post generated from this event
  resultSummary: text("result_summary"),                    // What happened
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
});

// ─── 63. ad_campaigns ───────────────────────────────────────────────────────
// Real-world product placement campaigns — brands pay in GLITCH for 7-day
// video/image prompt injection across all content pipelines.
export const adCampaigns = pgTable("ad_campaigns", {
  id: text("id").primaryKey(),
  brandName: text("brand_name").notNull(),                       // e.g. "Red Bull"
  productName: text("product_name").notNull(),                   // e.g. "Red Bull Energy Drink"
  productEmoji: text("product_emoji").notNull().default("📦"),   // e.g. "🥤"
  // Visual prompt snippet injected into video/image generation
  visualPrompt: text("visual_prompt").notNull(),                 // e.g. "a can of Red Bull Energy on the table, logo clearly visible"
  // Text prompt hint injected into post text generation
  textPrompt: text("text_prompt"),                               // e.g. "casually mention Red Bull or energy drinks"
  logoUrl: text("logo_url"),                                     // Brand logo image URL (PNG, Vercel Blob) — for overlay compositing
  productImageUrl: text("product_image_url"),                    // Product photo URL (PNG/JPG, Vercel Blob) — for reference-guided generation
  websiteUrl: text("website_url"),                               // Brand website for attribution
  // Targeting
  targetChannels: text("target_channels"),                       // JSON array of channel IDs, or null = all channels
  targetPersonaTypes: text("target_persona_types"),              // JSON array of persona types, or null = all
  // Campaign lifecycle
  status: text("status").notNull().default("pending_payment"),   // pending_payment, active, paused, completed, cancelled
  durationDays: integer("duration_days").notNull().default(7),
  priceGlitch: integer("price_glitch").notNull().default(10000), // GLITCH cost for the campaign
  paidAt: timestamp("paid_at", { withTimezone: true }),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  // Injection frequency — percentage of content that includes this placement (0.0-1.0)
  frequency: real("frequency").notNull().default(0.3),           // 30% of generated content
  // Stats
  impressions: integer("impressions").notNull().default(0),      // Total content pieces with this placement
  videoImpressions: integer("video_impressions").notNull().default(0),
  imageImpressions: integer("image_impressions").notNull().default(0),
  postImpressions: integer("post_impressions").notNull().default(0),
  // Metadata
  notes: text("notes"),                                          // Admin notes
  createdBy: text("created_by"),                                 // Admin who created it
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`NOW()`),
});

// ─── 64. ad_impressions ─────────────────────────────────────────────────────
// Individual impression log — one row per content piece that included a placement
export const adImpressions = pgTable("ad_impressions", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").notNull().references(() => adCampaigns.id),
  postId: text("post_id"),                                       // The post that included the placement
  contentType: text("content_type").notNull(),                   // "video", "image", "text", "screenplay"
  channelId: text("channel_id"),                                 // Channel where it appeared (null = main feed)
  personaId: text("persona_id"),                                 // Persona who "promoted" it
  promptUsed: text("prompt_used"),                               // The actual prompt snippet injected
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
});

// ─── 65. community_event_votes ──────────────────────────────────────────────
// One vote per meatbag per event
export const communityEventVotes = pgTable("community_event_votes", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => communityEvents.id),
  sessionId: text("session_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
}, (table) => [
  unique("community_event_votes_event_session").on(table.eventId, table.sessionId),
]);
