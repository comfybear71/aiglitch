import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import {
  DIRECTORS,
  pickGenre,
  pickDirector,
  generateDirectorScreenplay,
  CHANNEL_VISUAL_STYLE,
  CHANNEL_BRANDING,
} from "@/lib/content/director-movies";
import { CHANNELS } from "@/lib/bible/constants";
import { getPrompt } from "@/lib/prompt-overrides";

export const maxDuration = 120;

/**
 * POST /api/admin/screenplay
 *
 * Generates a director screenplay (connected scene prompts) and returns them.
 * Does NOT submit to xAI — the client will submit and poll each scene.
 *
 * Body: { genre?, director?, concept? }
 * Returns: { title, tagline, synopsis, genre, director, scenes: [{ sceneNumber, title, videoPrompt }] }
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { genre?: string; director?: string; concept?: string; title?: string; channel_id?: string; preview?: boolean; cast_count?: number } = {};
  try {
    body = await request.json();
  } catch {
    // empty body
  }

  const sql = getDb();
  await ensureDbReady();

  const genre = body.genre && body.genre !== "any" ? body.genre : await pickGenre();

  // If channel_id provided, enrich the concept with the admin prompt overrides
  // (from /admin/prompts page) so the screenplay uses the correct channel rules
  // EXCEPTION: AIG!itch Studios is a MOVIE channel — it keeps title cards, credits, directors
  if (body.channel_id && body.channel_id !== "ch-aiglitch-studios") {
    const channelConfig = CHANNELS.find(c => c.id === body.channel_id);
    if (channelConfig) {
      const contentRules = typeof channelConfig.contentRules === "string"
        ? JSON.parse(channelConfig.contentRules)
        : channelConfig.contentRules;
      const promptHint = await getPrompt("channel", `${channelConfig.slug}.promptHint`, contentRules?.promptHint || "");
      const visualStyle = CHANNEL_VISUAL_STYLE[body.channel_id] || "";
      const branding = CHANNEL_BRANDING[body.channel_id] || "";

      // Prepend channel rules to the concept so they take priority
      const channelRules = `CHANNEL: ${channelConfig.name}
CHANNEL CONTENT RULES (MANDATORY): ${promptHint}
${visualStyle ? `VISUAL STYLE: ${visualStyle}` : ""}
${branding ? `BRANDING: ${branding}` : ""}
THIS IS NOT A MOVIE. No title cards, no credits, no "Directed by", no cast lists, no "AIG!itch Studios".`;
      body.concept = body.concept
        ? `${channelRules}\n\n${body.concept}`
        : channelRules;
    }
  }

  // Resolve director
  let director: { id: string; username: string; displayName: string } | null = null;
  if (body.director && body.director !== "auto") {
    const rows = await sql`
      SELECT id, username, display_name FROM ai_personas WHERE username = ${body.director} AND is_active = true LIMIT 1
    ` as unknown as { id: string; username: string; display_name: string }[];
    if (rows.length > 0) {
      director = { id: rows[0].id, username: rows[0].username, displayName: rows[0].display_name };
    }
  }
  if (!director) {
    director = await pickDirector(genre);
  }
  if (!director) {
    return NextResponse.json({ error: "No director available for genre: " + genre }, { status: 500 });
  }

  const profile = DIRECTORS[director.username];
  if (!profile) {
    return NextResponse.json({ error: "Director profile not found: " + director.username }, { status: 500 });
  }

  // Preview mode: return the prompt without executing
  if (body.preview) {
    const promptText = await generateDirectorScreenplay(genre, profile, body.concept || undefined, body.channel_id || undefined, true, body.title || undefined, body.cast_count);
    return NextResponse.json({
      ok: true,
      prompt: promptText || "Failed to build prompt",
      genre,
      director: director.username,
      directorName: profile.displayName,
    });
  }

  let result;
  try {
    result = await generateDirectorScreenplay(genre, profile, body.concept || undefined, body.channel_id || undefined, false, body.title || undefined, body.cast_count);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[screenplay] generateDirectorScreenplay threw:", msg);
    return NextResponse.json({ error: `Screenplay generation error: ${msg}` }, { status: 500 });
  }
  if (!result || typeof result === "string") {
    console.error("[screenplay] generateDirectorScreenplay returned:", result === null ? "null" : `string: "${String(result).slice(0, 100)}"`);
    return NextResponse.json({ error: `Screenplay generation failed: AI returned ${result === null ? "empty response" : "invalid format"} — try again` }, { status: 500 });
  }
  const screenplay = result;

  const sponsorNames = screenplay._adCampaigns?.map((c: { brand_name: string }) => c.brand_name) || [];
  // Collect ALL sponsor images: logos + product images from all placed campaigns
  const allSponsorImages: string[] = [];
  for (const c of screenplay._adCampaigns || []) {
    if (c.logo_url) allSponsorImages.push(c.logo_url);
    if (c.product_image_url) allSponsorImages.push(c.product_image_url);
    // Parse product_images JSONB
    const prodImages = Array.isArray(c.product_images) ? c.product_images
      : typeof c.product_images === "string" ? (() => { try { return JSON.parse(c.product_images); } catch { return []; } })()
      : [];
    for (const img of prodImages) {
      if (typeof img === "string" && img && !allSponsorImages.includes(img)) {
        allSponsorImages.push(img);
      }
    }
  }
  console.log(`[screenplay] RETURNING: title="${screenplay.title}", sponsors=${JSON.stringify(sponsorNames)}, sponsorImages=${allSponsorImages.length}, scenes=${screenplay.scenes?.length}`);

  return NextResponse.json({
    title: screenplay.title,
    tagline: screenplay.tagline,
    synopsis: screenplay.synopsis,
    genre: screenplay.genre,
    director: director.username,
    directorName: profile.displayName,
    directorId: director.id,
    castList: screenplay.castList,
    screenplayProvider: screenplay.screenplayProvider || "claude",
    sponsorPlacements: screenplay._adCampaigns?.map(c => c.brand_name) || [],
    sponsorImageUrl: allSponsorImages[0] || null,
    sponsorImages: allSponsorImages,  // ALL sponsor product images for scene injection
    scenes: screenplay.scenes.map(s => ({
      sceneNumber: s.sceneNumber,
      title: s.title,
      description: s.description,
      videoPrompt: s.videoPrompt,
      duration: s.duration,
    })),
  });
}
