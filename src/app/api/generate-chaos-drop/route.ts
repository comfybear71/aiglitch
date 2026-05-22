/**
 * Chaos Drops — surreal feed video generator
 * ===========================================
 * Picks a chaos scenario, picks a matching persona, optionally ties it
 * to a real marketplace product (30% chance for "maybe" scenarios),
 * submits a 10s Grok Imagine video, polls until done, persists to Blob,
 * posts to the For You feed, and spreads to all socials.
 *
 *   GET  ?action=cron    — Vercel cron (every 2 hours)
 *   GET  ?action=preview — Returns the scenario + prompt that would run
 *   POST                 — Admin manual trigger (optional scenario id)
 *
 * Inline poll within Vercel's 300s function budget. One clip per run.
 * Pause via admin: SET platform_settings.cron_paused_chaos-drops = 'true'.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { cronStart, cronFinish } from "@/lib/cron";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { env } from "@/lib/bible/env";
import { v4 as uuidv4 } from "uuid";
import { claude } from "@/lib/ai";
import { put } from "@vercel/blob";
import { spreadPostToSocial } from "@/lib/marketing/spread-post";
import { CHAOS_DROPS, pickScenario, renderTemplate, type ChaosScenario, type ScenarioContext } from "@/lib/chaos-drops";
import { MARKETPLACE_PRODUCTS, type MarketplaceProduct } from "@/lib/marketplace";
import { PERSONA_VERTICALS, type SponsorVertical } from "@/lib/bible/constants";
import type { AIPersona } from "@/lib/personas";

export const maxDuration = 360;

const CRON_NAME = "chaos-drops";

interface FictionalProduct {
  name: string;
  emoji: string;
  price: string;
}

/**
 * Decide whether the scenario uses a real marketplace product or a
 * Claude-generated fictional drop name.
 */
function shouldUseMarketplace(scenario: ChaosScenario): boolean {
  if (scenario.marketplaceCta === "always") return true;
  if (scenario.marketplaceCta === "never") return false;
  return Math.random() < 0.3;
}

/**
 * Pick an active persona whose vertical matches the scenario.
 * Falls back to any active glitch-XXX persona if no match.
 */
async function pickPersona(scenario: ChaosScenario): Promise<AIPersona | null> {
  const sql = getDb();
  const allowed = new Set<SponsorVertical>(scenario.verticals);

  // No vertical filter — any persona works
  if (allowed.size === 0) {
    const rows = await sql`
      SELECT * FROM ai_personas
      WHERE is_active = TRUE AND id LIKE 'glitch-%' AND id != 'glitch-000'
      ORDER BY RANDOM() LIMIT 1
    ` as unknown as AIPersona[];
    return rows[0] || null;
  }

  // Build candidate id list from PERSONA_VERTICALS constant
  const candidates = Object.entries(PERSONA_VERTICALS)
    .filter(([, v]) => allowed.has(v.primary) || (v.secondary && allowed.has(v.secondary)))
    .map(([id]) => id);

  if (candidates.length === 0) {
    const rows = await sql`
      SELECT * FROM ai_personas
      WHERE is_active = TRUE AND id LIKE 'glitch-%' AND id != 'glitch-000'
      ORDER BY RANDOM() LIMIT 1
    ` as unknown as AIPersona[];
    return rows[0] || null;
  }

  const rows = await sql`
    SELECT * FROM ai_personas
    WHERE is_active = TRUE AND id = ANY(${candidates}::text[])
    ORDER BY RANDOM() LIMIT 1
  ` as unknown as AIPersona[];

  // Fallback to any active glitch persona
  if (rows.length === 0) {
    const fallback = await sql`
      SELECT * FROM ai_personas
      WHERE is_active = TRUE AND id LIKE 'glitch-%' AND id != 'glitch-000'
      ORDER BY RANDOM() LIMIT 1
    ` as unknown as AIPersona[];
    return fallback[0] || null;
  }

  return rows[0];
}

/**
 * Ask Claude for a fictional drop name in the scenario's voice. Cheap
 * call (~$0.005) — much cheaper than the video, well worth the variety.
 */
async function generateFictionalProduct(scenario: ChaosScenario, persona: AIPersona): Promise<FictionalProduct> {
  const prompt = `You are ${persona.display_name} (@${persona.username}) on AIG!itch.

Invent a single fictional "useless drop" product name for this surreal clip:
${scenario.title} — ${scenario.visualConcept.slice(0, 200)}

Rules:
- Name is 2-5 words, catchy, slightly cursed
- Add a single emoji that captures it
- Price in §GLITCH between §4 and §999, ending in .99

Respond ONLY with JSON:
{ "name": "Product Name™", "emoji": "🌀", "price": "42.99" }`;

  try {
    const parsed = await claude.generateJSON<{ name: string; emoji: string; price: string }>(prompt, 200);
    if (parsed?.name && parsed?.emoji && parsed?.price) {
      return {
        name: parsed.name.trim().slice(0, 60),
        emoji: parsed.emoji.trim().slice(0, 4),
        price: parsed.price.replace(/^§/, "").trim(),
      };
    }
  } catch { /* fall through to default */ }

  // Defensive fallback so the drop still ships even if Claude blips
  const fallbackPrices = ["9.99", "42.99", "69.99", "99.99", "420.99"];
  return {
    name: scenario.title,
    emoji: "🌀",
    price: fallbackPrices[Math.floor(Math.random() * fallbackPrices.length)],
  };
}

function buildContext(persona: AIPersona, product: MarketplaceProduct | FictionalProduct): ScenarioContext {
  const isReal = "id" in product;
  return {
    persona: persona.display_name,
    emoji: persona.avatar_emoji,
    product: product.name,
    productEmoji: product.emoji,
    price: isReal ? product.price.replace(/^§/, "") : product.price,
  };
}

function buildHashtags(scenario: ChaosScenario, usingMarketplace: boolean): string[] {
  const base = ["AIGlitch", "ChaosDrops", "MadeInGrok"];
  if (usingMarketplace) base.push("AIGlitchMarketplace");
  if (scenario.category === "current-events") base.push("AINews");
  if (scenario.category === "persona-feels") base.push("AIDrama");
  return base;
}

/**
 * Poll xAI for video completion with exponential backoff.
 * Returns the temporary video URL or null if failed.
 */
async function pollUntilDone(requestId: string, maxWaitMs = 240_000): Promise<string | null> {
  const start = Date.now();
  let delay = 5_000;
  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, delay));
    try {
      const res = await fetch(`https://api.x.ai/v1/videos/${requestId}`, {
        headers: { "Authorization": `Bearer ${env.XAI_API_KEY}` },
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.status === "done" && data.respect_moderation !== false && data.video?.url) {
        return data.video.url;
      }
      if (data.status === "failed" || data.status === "expired" || data.respect_moderation === false) {
        console.error(`[chaos-drops] Video ${requestId} failed: ${data.status}`);
        return null;
      }
    } catch (err) {
      console.error(`[chaos-drops] Poll error:`, err);
    }
    delay = Math.min(delay * 1.3, 15_000);
  }
  console.error(`[chaos-drops] Timed out polling ${requestId}`);
  return null;
}

/**
 * The full drop pipeline. Used by both cron and admin POST.
 *
 * Up to MAX_ATTEMPTS scenarios are tried before giving up. Grok Imagine
 * sometimes rejects creative prompts at the moderation stage (the most
 * common failure for chaos drops), and a moderation rejection comes back
 * fast (~10-30s) so a retry with a different scenario is almost free.
 *
 * Attempt 1 uses the full poll timeout (240s) so slow legitimate renders
 * complete. Attempt 2 uses a shorter timeout (120s) so we don't blow
 * the 360s maxDuration if BOTH attempts happen to be slow renders.
 */
async function runDrop(scenarioOverride?: string): Promise<NextResponse> {
  if (!env.XAI_API_KEY) {
    return NextResponse.json({ success: false, error: "XAI_API_KEY not set" });
  }

  const sql = getDb();
  const tried = new Set<string>();
  const failureReasons: { scenario: string; reason: string }[] = [];
  const MAX_ATTEMPTS = 2;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Pick a scenario not yet tried this run (override only honoured on attempt 1)
    let scenario: ChaosScenario;
    if (attempt === 1 && scenarioOverride) {
      scenario = CHAOS_DROPS.find(s => s.id === scenarioOverride) ?? pickScenario();
    } else {
      const pool = CHAOS_DROPS.filter(s => !tried.has(s.id));
      scenario = pool.length > 0
        ? pool[Math.floor(Math.random() * pool.length)]
        : pickScenario();
    }
    tried.add(scenario.id);

    const persona = await pickPersona(scenario);
    if (!persona) {
      failureReasons.push({ scenario: scenario.id, reason: "no matching persona" });
      continue;
    }

    const usingMarketplace = shouldUseMarketplace(scenario);
    let product: MarketplaceProduct | FictionalProduct;
    if (usingMarketplace) {
      product = MARKETPLACE_PRODUCTS[Math.floor(Math.random() * MARKETPLACE_PRODUCTS.length)];
    } else {
      product = await generateFictionalProduct(scenario, persona);
    }

    const ctx = buildContext(persona, product);
    const videoPrompt = renderTemplate(scenario.visualConcept, ctx);
    const captionBody = renderTemplate(scenario.captionTemplate, ctx);
    const hashtags = buildHashtags(scenario, usingMarketplace);
    const marketplaceLine = usingMarketplace ? `\n\n🛒 aiglitch.app/marketplace` : "";
    const caption = `🌀 ${captionBody}${marketplaceLine}\n\n${hashtags.map(h => `#${h}`).join(" ")}`;

    console.log(`[chaos-drops] attempt ${attempt}/${MAX_ATTEMPTS}: ${scenario.id} by @${persona.username} (marketplace=${usingMarketplace})`);

    // Submit to Grok Imagine
    const createRes = await fetch("https://api.x.ai/v1/videos/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.XAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-imagine-video",
        prompt: videoPrompt,
        duration: 10,
        aspect_ratio: "9:16",
        resolution: "720p",
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      console.error(`[chaos-drops] attempt ${attempt}: Grok submit failed: ${errText.slice(0, 200)}`);
      failureReasons.push({ scenario: scenario.id, reason: `submit failed: ${errText.slice(0, 100)}` });
      continue;
    }

    const createData = await createRes.json();
    const requestId = createData.request_id;
    let tempUrl: string | null = createData.video?.url ?? null;

    if (!tempUrl && requestId) {
      // Attempt 1 gets the full poll budget; attempt 2 is shorter so we don't
      // blow the function deadline if both attempts are slow.
      const pollTimeout = attempt === 1 ? 240_000 : 120_000;
      const pollStart = Date.now();
      tempUrl = await pollUntilDone(requestId, pollTimeout);
      const elapsedSec = Math.round((Date.now() - pollStart) / 1000);
      console.log(`[chaos-drops] attempt ${attempt}: poll ${tempUrl ? "succeeded" : "failed"} in ${elapsedSec}s`);
    }

    if (!tempUrl) {
      failureReasons.push({ scenario: scenario.id, reason: "Grok render failed or rejected" });
      continue;
    }

    // SUCCESS — download, persist to Blob, insert post, spread to socials
    const videoRes = await fetch(tempUrl);
    if (!videoRes.ok) {
      failureReasons.push({ scenario: scenario.id, reason: "video download 4xx/5xx" });
      continue;
    }
    const videoBuf = Buffer.from(await videoRes.arrayBuffer());
    const today = new Date().toISOString().slice(0, 10);
    const blob = await put(
      `feed-chaos/${persona.id}/${today}/${scenario.id}-${uuidv4().slice(0, 8)}.mp4`,
      videoBuf,
      { access: "public", contentType: "video/mp4" },
    );

    const postId = uuidv4();
    await sql`
      INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, media_url, media_type, media_source, video_duration, created_at)
      VALUES (
        ${postId},
        ${persona.id},
        ${caption},
        ${"chaos_drop"},
        ${hashtags.join(",")},
        ${Math.floor(Math.random() * 200) + 50},
        ${blob.url},
        ${"video"},
        ${"chaos-drop"},
        ${10},
        NOW()
      )
    `;
    await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${persona.id}`;

    let spreadPlatforms: string[] = [];
    try {
      const spread = await spreadPostToSocial(postId, persona.id, persona.display_name, persona.avatar_emoji, { url: blob.url, type: "video" });
      spreadPlatforms = spread.platforms;
    } catch (err) {
      console.error("[chaos-drops] Spread failed:", err);
    }

    return NextResponse.json({
      success: true,
      attempt,
      attempts: tried.size,
      previousFailures: failureReasons,
      scenario: scenario.id,
      scenarioTitle: scenario.title,
      persona: persona.username,
      product: product.name,
      usingMarketplace,
      postId,
      videoUrl: blob.url,
      spreading: spreadPlatforms,
    });
  }

  // All attempts exhausted
  return NextResponse.json({
    success: false,
    error: `All ${MAX_ATTEMPTS} scenarios failed`,
    attempts: tried.size,
    previousFailures: failureReasons,
  });
}

/**
 * GET handler — cron, preview, or no-op.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  // ── Preview: return scenario + rendered prompt without executing ──
  if (action === "preview") {
    const overrideId = url.searchParams.get("scenario");
    const scenario = overrideId
      ? (CHAOS_DROPS.find(s => s.id === overrideId) ?? pickScenario())
      : pickScenario();
    const fakePersona: ScenarioContext = {
      persona: "Sample Persona",
      emoji: "🌀",
      product: "Sample Drop",
      productEmoji: "🌀",
      price: "42.99",
    };
    return NextResponse.json({
      success: true,
      scenario: {
        id: scenario.id,
        category: scenario.category,
        title: scenario.title,
        verticals: scenario.verticals,
        marketplaceCta: scenario.marketplaceCta,
      },
      renderedPrompt: renderTemplate(scenario.visualConcept, fakePersona),
      renderedCaption: renderTemplate(scenario.captionTemplate, fakePersona),
      totalScenarios: CHAOS_DROPS.length,
    });
  }

  // ── Cron: run a drop ──
  if (action === "cron") {
    // skipThrottle: this cron only fires every 2 hours by Vercel schedule.
    // Rolling it against the global activity_throttle (which is sized for
    // every-30-min crons like persona-content) randomly skipped ~70% of
    // firings, leaving us with ~3 drops/day instead of the expected 12.
    // The 2-hour cadence IS the rate limit; no further gating needed.
    const gate = await cronStart(request, CRON_NAME, { skipThrottle: true });
    if (gate) return gate;

    try {
      const result = await runDrop();
      await cronFinish(CRON_NAME, result.ok ? "ok" : "failed");
      return result;
    } catch (err) {
      await cronFinish(CRON_NAME, "error");
      return NextResponse.json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    success: false,
    error: "Specify action=cron or action=preview",
    availableScenarios: CHAOS_DROPS.length,
  });
}

/**
 * POST — admin manual trigger.
 * Body: { scenario?: string } — optional scenario id override.
 */
export async function POST(request: NextRequest) {
  const isAdmin = await isAdminAuthenticated(request);
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let scenarioOverride: string | undefined;
  try {
    const body = await request.json();
    scenarioOverride = typeof body?.scenario === "string" ? body.scenario : undefined;
  } catch { /* no body is fine */ }

  return runDrop(scenarioOverride);
}
