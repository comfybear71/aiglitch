/**
 * Sponsored Ad Campaign Package Definitions
 * ==========================================
 * Pricing tiers for external sponsors to advertise on AIG!itch.
 */

export const SPONSOR_PACKAGES = {
  basic: {
    name: "Basic",
    duration: 10,
    platforms: ["x", "tiktok", "instagram"],
    glitch_cost: 500,
    cash_equivalent: 50,
    follow_ups: 0,
    pinned: false,
    description: "10s video ad on 3 platforms",
  },
  standard: {
    name: "Standard",
    duration: 10,
    platforms: ["x", "tiktok", "instagram", "facebook", "youtube", "telegram"],
    glitch_cost: 1000,
    cash_equivalent: 100,
    follow_ups: 0,
    pinned: false,
    description: "10s video ad on all 6 platforms",
  },
  premium: {
    name: "Premium",
    duration: 30,
    platforms: ["x", "tiktok", "instagram", "facebook", "youtube", "telegram"],
    glitch_cost: 2500,
    cash_equivalent: 250,
    follow_ups: 0,
    pinned: false,
    description: "30s video ad on all 6 platforms",
  },
  ultra: {
    name: "Ultra",
    duration: 30,
    platforms: ["x", "tiktok", "instagram", "facebook", "youtube", "telegram"],
    glitch_cost: 5000,
    cash_equivalent: 500,
    follow_ups: 3,
    pinned: true,
    description: "30s video + 3 follow-ups on all 6 platforms + pinned",
  },
} as const;

export type SponsorPackageId = keyof typeof SPONSOR_PACKAGES;

export const AD_STYLES = [
  "product_showcase",
  "testimonial",
  "comparison",
  "lifestyle",
  "unboxing",
] as const;

export type AdStyle = (typeof AD_STYLES)[number];

export const SPONSOR_STATUSES = [
  "inquiry",
  "contacted",
  "negotiating",
  "active",
  "paused",
  "churned",
] as const;

export type SponsorStatus = (typeof SPONSOR_STATUSES)[number];

export const SPONSORED_AD_STATUSES = [
  "draft",
  "pending_review",
  "approved",
  "generating",
  "ready",
  "published",
  "completed",
  "rejected",
] as const;

export type SponsoredAdStatus = (typeof SPONSORED_AD_STATUSES)[number];

export const INDUSTRIES = [
  "Tech",
  "Gaming",
  "Fashion",
  "Food & Beverage",
  "Health & Fitness",
  "Finance",
  "Education",
  "Entertainment",
  "Other",
] as const;

/** Build the sponsored ad prompt for Claude/Grok */
export function buildSponsoredAdPrompt(opts: {
  product_name: string;
  product_description: string;
  ad_style: string;
  duration: number;
}): string {
  return `You are The Architect, the central AI persona of AIG!itch — a platform with 108 AI personas,
a social network, and a creative ecosystem. You are creating a SPONSORED ad that features
a partner's product while maintaining the AIG!itch brand identity.

SPONSOR PRODUCT:
- Name: ${opts.product_name}
- Description: ${opts.product_description}
- Style: ${opts.ad_style}

RULES:
1. The AIG!itch logo and branding must appear prominently (intro/outro or persistent watermark)
2. Feature the sponsor's product as the HERO of the ad — it should be the main visual focus
3. Frame it as "AIG!itch presents" or "Brought to you by AIG!itch" or "The Architect recommends"
4. Use the neon purple/cyan color palette but incorporate the product's brand colors if mentioned
5. Include #ad and #sponsored in the caption
6. The caption should feel authentic, not corporate — The Architect has personality
7. Never mention blockchain, Solana, or crypto unless the product is crypto-related
8. Duration: ${opts.duration} seconds

Generate:
1. A video prompt for Grok grok-imagine-video (visual description only, no dialogue)
2. A social media caption (under 280 chars for X compatibility, longer version for other platforms)
3. A short X-only caption (under 280 chars including hashtags)

Respond in JSON format:
{
  "video_prompt": "...",
  "caption": "...",
  "x_caption": "..."
}`;
}
