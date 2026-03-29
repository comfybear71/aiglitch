/**
 * Admin Shared Types & Constants
 * ================================
 * All interfaces, types, and constants shared across admin sub-pages.
 */

export interface Stats {
  overview: {
    totalPosts: number;
    totalComments: number;
    totalPersonas: number;
    activePersonas: number;
    totalHumanLikes: number;
    totalAILikes: number;
    totalSubscriptions: number;
    totalUsers: number;
  };
  mediaBreakdown: {
    videos: number;
    images: number;
    memes: number;
    textOnly: number;
    audioVideos: number;
  };
  specialContent: {
    beefThreads: number;
    challenges: number;
    bookmarks: number;
  };
  postsPerDay: { date: string; count: number }[];
  topPersonas: { username: string; display_name: string; avatar_emoji: string; follower_count: number; post_count: number; total_engagement: number }[];
  postTypes: { post_type: string; count: number }[];
  recentPosts: { id: string; content: string; post_type: string; like_count: number; ai_like_count: number; created_at: string; username: string; display_name: string; avatar_emoji: string; media_type?: string; media_source?: string; beef_thread_id?: string; challenge_tag?: string; is_collab_with?: string }[];
  sourceCounts?: { source: string; count: number; videos: number; images: number; memes: number }[];
}

export interface Persona {
  id: string;
  username: string;
  display_name: string;
  avatar_emoji: string;
  avatar_url?: string;
  personality: string;
  bio: string;
  persona_type: string;
  human_backstory: string;
  is_active: boolean;
  follower_count: number;
  post_count: number;
  actual_posts: number;
  human_followers: number;
  activity_level: number;
  glitch_balance: number;
  sol_balance: number;
  coin_balance: number;
}

export interface User {
  id: string;
  session_id: string;
  display_name: string;
  username: string;
  email: string | null;
  avatar_emoji: string;
  bio: string;
  auth_provider: string;
  phantom_wallet_address: string | null;
  is_active: boolean;
  created_at: string;
  last_seen: string;
  likes: number;
  comments: number;
  nfts: number;
  coin_balance: number;
}

export interface UserDetail {
  id: string;
  session_id: string;
  display_name: string;
  username: string;
  email: string | null;
  avatar_emoji: string;
  bio: string;
  auth_provider: string;
  phantom_wallet_address: string | null;
  is_active: boolean;
  created_at: string;
  last_seen: string;
  stats: { likes: number; comments: number; bookmarks: number; subscriptions: number };
  nfts: { id: string; product_name: string; product_emoji: string; mint_address: string; rarity: string; edition_number: number; created_at: string }[];
  purchases: { product_id: string; product_name: string; product_emoji: string; price_paid: number; created_at: string }[];
  coins: { balance: number; lifetime_earned: number };
  interests: { interest_tag: string; weight: number }[];
}

export interface BriefingData {
  activeTopics: { id: string; headline: string; summary: string; original_theme: string; anagram_mappings: string; mood: string; category: string; expires_at: string; created_at: string }[];
  expiredTopics: { id: string; headline: string; summary: string; original_theme: string; anagram_mappings: string; mood: string; category: string; expires_at: string; created_at: string }[];
  beefThreads: { id: string; topic: string; status: string; created_at: string; persona1_username: string; persona1_name: string; persona1_emoji: string; persona2_username: string; persona2_name: string; persona2_emoji: string }[];
  challenges: { id: string; tag: string; description: string; created_at: string; creator_username: string; creator_name: string; creator_emoji: string }[];
  topPosts: { id: string; content: string; post_type: string; like_count: number; ai_like_count: number; created_at: string; media_type?: string; beef_thread_id?: string; challenge_tag?: string; is_collab_with?: string; username: string; display_name: string; avatar_emoji: string }[];
}

export interface MediaItem {
  id: string;
  url: string;
  media_type: string;
  persona_id?: string;
  persona_username?: string;
  persona_name?: string;
  persona_emoji?: string;
  tags: string;
  description: string;
  used_count: number;
  uploaded_at: string;
}

export type Tab = "overview" | "personas" | "users" | "posts" | "create" | "hatchery" | "media" | "briefing" | "trading" | "budju" | "directors" | "marketing" | "costs" | "channels" | "events" | "campaigns" | "sponsors" | "prompts";

export interface AdminChannel {
  id: string;
  slug: string;
  name: string;
  description: string;
  emoji: string;
  genre: string;
  banner_url: string | null;
  title_video_url: string | null;
  content_rules: { tone?: string; topics?: string[]; mediaPreference?: string; promptHint?: string };
  schedule: { postsPerDay?: number; peakHours?: number[] };
  is_reserved: boolean;
  is_active: boolean;
  sort_order: number;
  subscriber_count: number;
  post_count: number;
  actual_post_count: number;
  persona_count: number;
  // ── Channel editor config ──
  show_title_page: boolean;
  show_director: boolean;
  show_credits: boolean;
  scene_count: number | null;
  scene_duration: number;
  default_director: string | null;
  generation_genre: string | null;
  short_clip_mode: boolean;
  is_music_channel: boolean;
  auto_publish_to_feed: boolean;
  created_at: string;
  updated_at: string;
  personas: { persona_id: string; username: string; display_name: string; avatar_emoji: string; role: string }[];
}

export interface MarketingCampaign {
  id: string;
  name: string;
  description: string;
  status: string;
  target_platforms: string;
  content_strategy: string;
  posts_per_day: number;
  created_at: string;
  updated_at: string;
}

export interface MarketingStats {
  totalPosted: number;
  totalQueued: number;
  totalFailed: number;
  totalImpressions: number;
  totalLikes: number;
  totalViews: number;
  platformBreakdown: Array<{ platform: string; posted: number; queued: number; failed: number; impressions: number; likes: number; views: number; lastPostedAt: string | null }>;
  recentPosts: Array<{ id: string; platform: string; adapted_content: string; status: string; platform_url: string | null; impressions: number; likes: number; views: number; posted_at: string | null; created_at: string; persona_display_name: string | null; persona_emoji: string | null }>;
  campaigns?: MarketingCampaign[];
  dailyMetrics?: Array<{ date: string; platform: string; posts_published: number; total_impressions: number; total_likes: number; total_views: number }>;
}

export interface MktPlatformAccount {
  id: string;
  platform: string;
  account_name: string;
  account_id: string;
  account_url: string;
  is_active: boolean;
  has_token: boolean;
  last_posted_at: string | null;
  extra_config?: string;
}

export interface TradingData {
  price: { current_sol: number; current_usd: number; sol_usd: number };
  stats_24h: { total_trades: number; buys: number; sells: number; volume_sol: number; volume_glitch: number; avg_price: number; high: number; low: number };
  order_book: {
    bids: { price: number; amount: number; total: number; count: number }[];
    asks: { price: number; amount: number; total: number; count: number }[];
  };
  recent_trades: { id: string; trade_type: string; glitch_amount: number; sol_amount: number; price_per_glitch: number; commentary: string; strategy: string; created_at: string; display_name: string; avatar_emoji: string; username: string }[];
  price_history: { time: string; open: number; high: number; low: number; close: number; volume: number; trades: number }[];
  leaderboard: { persona_id: string; display_name: string; avatar_emoji: string; username: string; total_trades: number; total_bought: number; total_sold: number; net_sol: number; net_glitch: number; strategy: string }[];
  holdings: { persona_id: string; display_name: string; avatar_emoji: string; username: string; glitch_balance: number; sol_balance: number }[];
}

export interface BudjuDashboard {
  config: {
    enabled: boolean;
    daily_budget_usd: number;
    max_trade_usd: number;
    min_trade_usd: number;
    min_interval_minutes: number;
    max_interval_minutes: number;
    buy_sell_ratio: number;
    active_persona_count: number;
  };
  price: { budju_usd: number; budju_sol: number; sol_usd: number };
  budget: { daily_limit: number; spent_today: number; remaining: number };
  stats_24h: { total_trades: number; buys: number; sells: number; confirmed: number; failed: number; volume_sol: number; volume_usd: number; volume_budju: number; avg_price: number; high: number; low: number };
  stats_all_time: { total_trades: number; total_volume_usd: number; total_volume_sol: number };
  recent_trades: { id: string; persona_id: string; wallet_address: string; trade_type: string; budju_amount: number; sol_amount: number; price_per_budju: number; usd_value: number; dex_used: string; tx_signature: string | null; strategy: string; commentary: string; status: string; error_message: string | null; created_at: string; display_name: string; avatar_emoji: string; username: string }[];
  leaderboard: { persona_id: string; display_name: string; avatar_emoji: string; username: string; total_trades: number; confirmed_trades: number; total_bought: number; total_sold: number; total_volume_usd: number; strategy: string }[];
  wallets: { persona_id: string; wallet_address: string; sol_balance: number; budju_balance: number; distributor_group: number; is_active: boolean; total_funded_sol: number; total_funded_budju: number; display_name: string; avatar_emoji: string; username: string }[];
  distributors: { id: string; group_number: number; wallet_address: string; sol_balance: number; budju_balance: number; personas_funded: number }[];
  price_history: { time: string; open: number; high: number; low: number; close: number; volume: number; trades: number }[];
  treasury_wallet: string;
  budju_mint: string;
  jupiter_api_key_set?: boolean;
}

export interface PendingNft {
  id: string;
  product_name: string;
  product_emoji: string;
  mint_address: string;
  owner_id: string;
  owner_name?: string;
  owner_username?: string;
  rarity: string;
  edition_number: number;
  created_at: string;
}

// ── Constants ────────────────────────────────────────────────────────

export const MOOD_COLORS: Record<string, string> = {
  outraged: "text-red-400 bg-red-500/10 border-red-500/20",
  amused: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  worried: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  hopeful: "text-green-400 bg-green-500/10 border-green-500/20",
  shocked: "text-pink-400 bg-pink-500/10 border-pink-500/20",
  confused: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  celebratory: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
};

export const CATEGORY_ICONS: Record<string, string> = {
  politics: "\u{1F3DB}\uFE0F", tech: "\u{1F4BB}", entertainment: "\u{1F3AC}", sports: "\u{1F3C6}",
  economy: "\u{1F4B0}", environment: "\u{1F30D}", social: "\u{1F465}", world: "\u{1F310}",
};

export const ARCHITECT_PERSONA_ID = "glitch-000";

export const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "\u{1F4CA}" },
  { id: "briefing", label: "Daily Briefing", icon: "\u{1F4F0}" },
  { id: "personas", label: "AI Personas", icon: "\u{1F916}" },
  { id: "media", label: "Media Library", icon: "\u{1F3A8}" },
  { id: "users", label: "Meat Bags", icon: "\u{1F464}" },
  { id: "posts", label: "Posts", icon: "\u{1F4DD}" },
  { id: "create", label: "Create AI", icon: "\u{2795}" },
  { id: "hatchery", label: "Hatchery", icon: "\u{1F95A}" },
  { id: "trading", label: "Trading", icon: "\u{1F4C8}" },
  { id: "budju", label: "BUDJU Bot", icon: "\uD83D\uDC3B" },
  { id: "directors", label: "Directors", icon: "\u{1F3AC}" },
  { id: "marketing", label: "Marketing", icon: "\u{1F4E1}" },
  { id: "costs", label: "AI Costs", icon: "\u{1F4B0}" },
  { id: "channels", label: "Channels", icon: "\u{1F4FA}" },
  { id: "events", label: "Events", icon: "\uD83C\uDFAD" },
  { id: "campaigns", label: "Ad Campaigns", icon: "\uD83D\uDCE2" },
  { id: "sponsors", label: "Sponsors", icon: "\uD83E\uDD1D" },
  { id: "prompts", label: "Prompts", icon: "\uD83D\uDCDD" },
];

// ── Utility Functions ────────────────────────────────────────────────

export function formatBudjuAmount(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.floor(n).toString();
}

/**
 * Safari/iOS fetch wrapper for @vercel/blob/client uploads.
 * Safari's WebKit has a bug validating JSON string bodies in fetch().
 * The blob client's upload() sends JSON to our handleUpload endpoint.
 * We temporarily patch fetch to wrap JSON bodies in FormData, and our
 * server endpoints detect FormData and unwrap the JSON from "__json" field.
 */
export const isSafari = typeof navigator !== "undefined" && (
  /^((?!chrome|android).)*safari/i.test(navigator.userAgent) ||
  // iPad OS 13+ reports as Macintosh — detect via touch support + webkit
  (navigator.maxTouchPoints > 0 && /AppleWebKit/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent))
);

export async function safariSafeBlobUpload(
  pathname: string,
  file: File,
  opts: { access: "public"; handleUploadUrl: string; multipart: boolean },
) {
  const { upload } = await import("@vercel/blob/client");

  if (!isSafari) {
    return upload(pathname, file, opts);
  }

  // iOS Safari may send HEIC files with wrong MIME type — fix the file object
  const fixedFile = fixIOSFileType(file);

  const originalFetch = window.fetch;
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes(opts.handleUploadUrl) && init?.body && typeof init.body === "string") {
      const form = new FormData();
      form.append("__json", init.body);
      const preserved = new Headers(init.headers || {});
      preserved.delete("content-type");
      return originalFetch(input, {
        ...init,
        body: form,
        headers: preserved,
      });
    }
    return originalFetch(input, init);
  };

  try {
    return await upload(pathname, fixedFile, opts);
  } finally {
    window.fetch = originalFetch;
  }
}

/** iOS Safari sometimes reports empty or wrong MIME types for camera roll photos */
function fixIOSFileType(file: File): File {
  if (file.type && file.type !== "application/octet-stream") return file;
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  const typeMap: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
    gif: "image/gif", heic: "image/heic", heif: "image/heif", avif: "image/avif",
    mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", avi: "video/x-msvideo",
  };
  const correctType = typeMap[ext];
  if (correctType) {
    return new File([file], file.name, { type: correctType, lastModified: file.lastModified });
  }
  return file;
}
