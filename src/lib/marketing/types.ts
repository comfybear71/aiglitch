/**
 * MEATBAG Marketing HQ — Types
 * =============================
 * Shared types for the cross-platform marketing engine.
 */

export type MarketingPlatform = "x" | "tiktok" | "instagram" | "facebook" | "youtube";

export const ALL_PLATFORMS: MarketingPlatform[] = ["x", "tiktok", "instagram", "facebook", "youtube"];

export const PLATFORM_DISPLAY: Record<MarketingPlatform, { name: string; emoji: string; color: string }> = {
  x:         { name: "X (Twitter)",  emoji: "𝕏", color: "#000000" },
  tiktok:    { name: "TikTok",       emoji: "🎵", color: "#00F2EA" },
  instagram: { name: "Instagram",    emoji: "📸", color: "#E4405F" },
  facebook:  { name: "Facebook",     emoji: "📘", color: "#1877F2" },
  youtube:   { name: "YouTube",      emoji: "▶️", color: "#FF0000" },
};

/** Platform-specific content constraints */
export const PLATFORM_SPECS: Record<MarketingPlatform, {
  maxTextLength: number;
  preferredAspectRatio: string;
  mediaTypes: string[];
  hashtagStyle: "inline" | "end" | "none";
  linkSupport: boolean;
}> = {
  x: {
    maxTextLength: 280,
    preferredAspectRatio: "16:9",
    mediaTypes: ["image", "video"],
    hashtagStyle: "end",
    linkSupport: true,
  },
  tiktok: {
    maxTextLength: 2200,
    preferredAspectRatio: "9:16",
    mediaTypes: ["video"],
    hashtagStyle: "end",
    linkSupport: false,
  },
  instagram: {
    maxTextLength: 2200,
    preferredAspectRatio: "1:1",
    mediaTypes: ["image", "video"],
    hashtagStyle: "end",
    linkSupport: false,
  },
  facebook: {
    maxTextLength: 63206,
    preferredAspectRatio: "16:9",
    mediaTypes: ["image", "video", "text"],
    hashtagStyle: "inline",
    linkSupport: true,
  },
  youtube: {
    maxTextLength: 5000,
    preferredAspectRatio: "16:9",
    mediaTypes: ["video"],
    hashtagStyle: "end",
    linkSupport: true,
  },
};

export interface MarketingPost {
  id: string;
  campaign_id: string | null;
  platform: MarketingPlatform;
  source_post_id: string | null;
  persona_id: string | null;
  adapted_content: string;
  adapted_media_url: string | null;
  thumbnail_url: string | null;
  platform_post_id: string | null;
  platform_url: string | null;
  status: "queued" | "posting" | "posted" | "failed";
  scheduled_for: string | null;
  posted_at: string | null;
  impressions: number;
  likes: number;
  shares: number;
  comments: number;
  views: number;
  clicks: number;
  error_message: string | null;
  created_at: string;
}

export interface MarketingCampaign {
  id: string;
  name: string;
  description: string;
  status: "draft" | "active" | "paused" | "completed";
  target_platforms: string;
  content_strategy: string;
  posts_per_day: number;
  created_at: string;
  updated_at: string;
}

export interface PlatformAccount {
  id: string;
  platform: MarketingPlatform;
  account_name: string;
  account_id: string;
  account_url: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string | null;
  extra_config: string;
  is_active: boolean;
  last_posted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DailyMetrics {
  id: string;
  platform: MarketingPlatform;
  date: string;
  total_impressions: number;
  total_likes: number;
  total_shares: number;
  total_comments: number;
  total_views: number;
  total_clicks: number;
  posts_published: number;
  follower_count: number;
  follower_growth: number;
  top_post_id: string | null;
  collected_at: string;
}

export interface AdaptedContent {
  text: string;
  hashtags: string[];
  callToAction: string;
  thumbnailPrompt: string;
}
