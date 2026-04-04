import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { cronHandler } from "@/lib/cron";

/**
 * Sponsor GLITCH Burn — Daily Cron
 *
 * For each active ad_campaign with a starts_at date:
 *   1. Calculate daily burn rate = price_glitch / duration_days
 *   2. Find matching sponsor by brand_name
 *   3. Deduct daily_rate from sponsor.glitch_balance
 *   4. Add daily_rate to sponsor.total_spent
 *   5. If balance hits 0, mark campaign as completed
 *
 * Runs once per day. Idempotent: tracks last_burn_at on campaigns
 * to avoid double-burning on the same day.
 */

async function processBurn() {
  const sql = getDb();

  // Add last_burn_at column if it doesn't exist
  await sql`ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS last_burn_at TIMESTAMPTZ`;

  // Find all active campaigns that have a start date and haven't been burned today
  const campaigns = await sql`
    SELECT ac.id, ac.brand_name, ac.price_glitch, ac.duration_days, ac.starts_at, ac.expires_at, ac.last_burn_at
    FROM ad_campaigns ac
    WHERE ac.status = 'active'
      AND ac.starts_at IS NOT NULL
      AND ac.starts_at <= NOW()
      AND (ac.is_inhouse IS NULL OR ac.is_inhouse = FALSE)
      AND (ac.last_burn_at IS NULL OR ac.last_burn_at < CURRENT_DATE)
  ` as unknown as {
    id: string;
    brand_name: string;
    price_glitch: number;
    duration_days: number;
    starts_at: string;
    expires_at: string | null;
    last_burn_at: string | null;
  }[];

  if (campaigns.length === 0) {
    return { burned: 0, message: "No campaigns to burn today" };
  }

  const results: { brand: string; dailyRate: number; newBalance: number; expired: boolean }[] = [];

  for (const c of campaigns) {
    const dailyRate = Math.round(c.price_glitch / (c.duration_days || 7));

    // Calculate how many days we need to burn (catch up on missed days)
    const startDate = new Date(c.starts_at);
    const lastBurn = c.last_burn_at ? new Date(c.last_burn_at) : startDate;
    const now = new Date();
    const endDate = c.expires_at ? new Date(c.expires_at) : new Date(startDate.getTime() + (c.duration_days || 7) * 86400000);
    const burnUntil = now < endDate ? now : endDate;
    const daysToBurn = Math.max(0, Math.floor((burnUntil.getTime() - lastBurn.getTime()) / 86400000));

    if (daysToBurn === 0) continue;

    // Find matching sponsor by brand_name (case-insensitive)
    const sponsors = await sql`
      SELECT id, glitch_balance, total_spent FROM sponsors
      WHERE LOWER(company_name) = LOWER(${c.brand_name})
      LIMIT 1
    ` as unknown as { id: number; glitch_balance: number; total_spent: number }[];

    if (sponsors.length === 0) {
      console.log(`[sponsor-burn] No sponsor found for brand "${c.brand_name}" — skipping`);
      continue;
    }

    const sponsor = sponsors[0];
    const totalBurn = dailyRate * daysToBurn;
    const burnAmount = Math.min(totalBurn, sponsor.glitch_balance);
    const newBalance = Math.max(0, sponsor.glitch_balance - burnAmount);
    const newSpent = sponsor.total_spent + burnAmount;

    // Deduct from sponsor balance
    await sql`
      UPDATE sponsors
      SET glitch_balance = ${newBalance},
          total_spent = ${newSpent},
          updated_at = NOW()
      WHERE id = ${sponsor.id}
    `;

    // Mark campaign as burned today
    await sql`
      UPDATE ad_campaigns
      SET last_burn_at = NOW(), updated_at = NOW()
      WHERE id = ${c.id}
    `;

    // If sponsor balance is now 0, check if campaign should be completed
    const isExpired = c.expires_at && new Date(c.expires_at).getTime() <= Date.now();
    if (newBalance <= 0 || isExpired) {
      await sql`
        UPDATE ad_campaigns
        SET status = 'completed', updated_at = NOW()
        WHERE id = ${c.id} AND status = 'active'
      `;
    }

    console.log(`[sponsor-burn] ${c.brand_name}: burned §${burnAmount} (${daysToBurn} days × §${dailyRate}/day), balance §${newBalance}, spent §${newSpent}${newBalance <= 0 ? " — EXPIRED" : ""}`);

    results.push({
      brand: c.brand_name,
      dailyRate: burnAmount,
      newBalance,
      expired: newBalance <= 0,
    });
  }

  return {
    burned: results.length,
    results,
  };
}

export const GET = cronHandler("sponsor-burn", processBurn);

// Also allow manual trigger from admin (POST)
export async function POST(request: NextRequest) {
  // Simple admin auth check
  const authHeader = request.headers.get("cookie") || "";
  if (!authHeader.includes("admin_auth")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processBurn();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
