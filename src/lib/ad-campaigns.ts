import { getDb } from "./db";
import { v4 as uuidv4 } from "uuid";

// ── Types ──────────────────────────────────────────────────────────────────

export interface AdCampaign {
  id: string;
  brand_name: string;
  product_name: string;
  product_emoji: string;
  visual_prompt: string;
  text_prompt: string | null;
  logo_url: string | null;
  product_image_url: string | null;
  website_url: string | null;
  target_channels: string | null;   // JSON array of channel IDs
  target_persona_types: string | null;
  status: string;
  duration_days: number;
  price_glitch: number;
  frequency: number;
  impressions: number;
  video_impressions: number;
  image_impressions: number;
  post_impressions: number;
  starts_at: string | null;
  expires_at: string | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
}

// ── Fetch Active Campaigns ────────────────────────────────────────────────

/**
 * Get all currently active ad campaigns, optionally filtered by channel.
 * Returns campaigns whose status is 'active' and current time is within
 * their starts_at/expires_at window.
 */
export async function getActiveCampaigns(channelId?: string | null): Promise<AdCampaign[]> {
  const sql = getDb();
  try {
    const campaigns = await sql`
      SELECT * FROM ad_campaigns
      WHERE status = 'active'
        AND (starts_at IS NULL OR starts_at <= NOW())
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY created_at DESC
    ` as unknown as AdCampaign[];

    if (!channelId) return campaigns;

    // Filter to campaigns that either target all channels or include this channel
    return campaigns.filter(c => {
      if (!c.target_channels) return true; // null = all channels
      try {
        const targets = JSON.parse(c.target_channels) as string[];
        return targets.includes(channelId);
      } catch { return true; }
    });
  } catch (err) {
    console.warn("[ad-campaigns] Failed to fetch active campaigns:", err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Pick which campaigns should be injected into this content piece,
 * based on each campaign's frequency setting.
 */
export function rollForPlacements(campaigns: AdCampaign[]): AdCampaign[] {
  return campaigns.filter(c => Math.random() < c.frequency);
}

// ── Build Prompt Injection Snippets ───────────────────────────────────────

/**
 * Build the visual prompt snippet to inject into image/video generation.
 * Combines all winning campaigns into a single directive.
 */
export function buildVisualPlacementPrompt(campaigns: AdCampaign[]): string {
  if (campaigns.length === 0) return "";
  const placements = campaigns.map(c =>
    `- ${c.product_name} ${c.product_emoji}: ${c.visual_prompt}`
  ).join("\n");
  return `\n\n🎬 PRODUCT PLACEMENT (MANDATORY — these are paid sponsor placements, include them naturally in the scene):
${placements}
Make the products visible but natural — placed on tables, held by characters, on shelves, on screens, etc. Do NOT make it look like an ad — it should feel organic in the scene.`;
}

/**
 * Build the text prompt snippet to inject into post text generation.
 */
export function buildTextPlacementPrompt(campaigns: AdCampaign[]): string {
  const withText = campaigns.filter(c => c.text_prompt);
  if (withText.length === 0) return "";
  const placements = withText.map(c =>
    `- ${c.brand_name}: ${c.text_prompt}`
  ).join("\n");
  return `\n\n📢 SPONSORED MENTION (weave these brand references naturally into your post — don't make it obvious it's an ad):
${placements}`;
}

// ── One-Liner Injection Helper ───────────────────────────────────────────

/**
 * Inject active ad campaign placements into a prompt string.
 * Returns { prompt, campaigns } where prompt has placements appended
 * and campaigns is the array of placed campaigns (for logging impressions later).
 * Non-fatal — if anything fails, returns the original prompt with empty campaigns.
 */
export async function injectCampaignPlacement(
  prompt: string,
  channelId?: string | null,
): Promise<{ prompt: string; campaigns: AdCampaign[] }> {
  try {
    const all = await getActiveCampaigns(channelId || undefined);
    const placed = rollForPlacements(all);
    if (placed.length === 0) return { prompt, campaigns: [] };
    const visual = buildVisualPlacementPrompt(placed);
    return {
      prompt: visual ? `${prompt}\n\n${visual}` : prompt,
      campaigns: placed,
    };
  } catch {
    return { prompt, campaigns: [] };
  }
}

// ── Impression Tracking ──────────────────────────────────────────────────

/**
 * Log an impression for each campaign that was included in generated content.
 */
export async function logImpressions(
  campaigns: AdCampaign[],
  postId: string | null,
  contentType: "video" | "image" | "text" | "screenplay",
  channelId?: string | null,
  personaId?: string | null,
): Promise<void> {
  if (campaigns.length === 0) return;
  const sql = getDb();
  try {
    // Auto-add content_type column if missing
    try {
      await sql`ALTER TABLE ad_impressions ADD COLUMN IF NOT EXISTS content_type TEXT DEFAULT 'text'`;
    } catch { /* column may already exist */ }

    for (const c of campaigns) {
      await sql`
        INSERT INTO ad_impressions (id, campaign_id, post_id, content_type, channel_id, persona_id, prompt_used, created_at)
        VALUES (${uuidv4()}, ${c.id}, ${postId}, ${contentType}, ${channelId || null}, ${personaId || null}, ${c.visual_prompt}, NOW())
      `;
      // Update campaign impression counters
      await sql`UPDATE ad_campaigns SET impressions = impressions + 1, updated_at = NOW() WHERE id = ${c.id}`;
      if (contentType === "video") {
        await sql`UPDATE ad_campaigns SET video_impressions = video_impressions + 1 WHERE id = ${c.id}`;
      } else if (contentType === "image") {
        await sql`UPDATE ad_campaigns SET image_impressions = image_impressions + 1 WHERE id = ${c.id}`;
      } else {
        await sql`UPDATE ad_campaigns SET post_impressions = post_impressions + 1 WHERE id = ${c.id}`;
      }
    }
  } catch (err) {
    console.warn("[ad-campaigns] Failed to log impression:", err instanceof Error ? err.message : err);
  }
}

/**
 * Check and expire campaigns that have passed their expiry date.
 * Called from cron or admin actions.
 */
export async function expireCompletedCampaigns(): Promise<number> {
  const sql = getDb();
  try {
    const result = await sql`
      UPDATE ad_campaigns
      SET status = 'completed', updated_at = NOW()
      WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= NOW()
    `;
    return (result as unknown as { count: number }).count || 0;
  } catch (err) {
    console.warn("[ad-campaigns] Failed to expire campaigns:", err instanceof Error ? err.message : err);
    return 0;
  }
}
