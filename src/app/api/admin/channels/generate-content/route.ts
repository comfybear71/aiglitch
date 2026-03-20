import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import {
  DIRECTORS,
  generateDirectorScreenplay,
  pickDirector,
  submitDirectorFilm,
} from "@/lib/content/director-movies";

export const maxDuration = 120;

/**
 * POST /api/admin/channels/generate-content
 *
 * Generate a full multi-scene video for a channel — replicating the mobile app pipeline.
 * Steps: pick director → generate screenplay → submit all scenes for async video gen.
 * The existing pollMultiClipJobs cron handles polling + stitchAndTriplePost handles final publish.
 *
 * Body: {
 *   channel_id: string,      — required: which channel to generate for
 *   concept?: string,         — optional: custom concept/idea for the episode
 *   clip_count?: number,      — optional: number of scenes (default: random 6-8)
 *   include_bookends?: boolean — optional: include title card + credits (default: true)
 * }
 *
 * Returns: { success, jobId, title, genre, scenes, director }
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  await ensureDbReady();

  const body = await request.json().catch(() => ({}));
  const {
    channel_id,
    concept,
    clip_count,
  } = body as {
    channel_id?: string;
    concept?: string;
    clip_count?: number;
  };

  if (!channel_id) {
    return NextResponse.json({ error: "channel_id is required" }, { status: 400 });
  }

  // Fetch channel details (including new editor config fields)
  const channels = await sql`
    SELECT id, slug, name, emoji, genre, is_reserved, content_rules,
      show_title_page, show_director, show_credits, scene_count, scene_duration,
      default_director, generation_genre, short_clip_mode, is_music_channel, auto_publish_to_feed
    FROM channels WHERE id = ${channel_id} AND is_active = TRUE
  ` as unknown as Array<{
    id: string; slug: string; name: string; emoji: string;
    genre: string; is_reserved: boolean; content_rules: string;
    show_title_page: boolean; show_director: boolean; show_credits: boolean; scene_count: number | null;
    scene_duration: number; default_director: string | null; generation_genre: string | null;
    short_clip_mode: boolean; is_music_channel: boolean; auto_publish_to_feed: boolean;
  }>;

  if (channels.length === 0) {
    return NextResponse.json({ error: "Channel not found or inactive" }, { status: 404 });
  }

  const channel = channels[0];
  // Use generation_genre override if set, otherwise fall back to display genre
  const genre = channel.generation_genre || channel.genre || "drama";
  const blobFolder = `channels/${channel.slug}`;

  // Parse content rules for prompt hints
  let contentRules: { tone?: string; topics?: string[]; promptHint?: string } = {};
  try {
    contentRules = typeof channel.content_rules === "string"
      ? JSON.parse(channel.content_rules)
      : channel.content_rules;
  } catch { /* use defaults */ }

  // Build concept from channel context + user input
  let fullConcept = "";
  if (concept) {
    fullConcept = concept;
  }
  if (contentRules.promptHint) {
    fullConcept = fullConcept
      ? `${fullConcept}\n\nChannel style guide: ${contentRules.promptHint}`
      : contentRules.promptHint;
  }
  if (contentRules.tone) {
    fullConcept += `\nTone: ${contentRules.tone}`;
  }
  // Music channel prefix injection
  if (channel.is_music_channel) {
    fullConcept = `This MUST be a music video — every scene must feature singing, rapping, playing instruments, or musical performance.\n\n${fullConcept}`;
  }
  // Title page / credits instructions from channel config
  if (!channel.show_title_page) {
    fullConcept += `\nNO title cards or title pages.`;
  }
  if (!channel.show_director) {
    fullConcept += `\nNO director credits or director attribution — do NOT mention any director name.`;
  }
  if (!channel.show_credits) {
    fullConcept += `\nNO credits or outro cards.`;
  }
  // Scene count: request body overrides channel default, channel default overrides auto
  const effectiveClipCount = clip_count || channel.scene_count || undefined;
  if (effectiveClipCount) {
    fullConcept += `\n${effectiveClipCount} clips`;
  }

  // Pick a director — use channel default_director if set
  let director: { id: string; username: string; displayName: string } | null = null;
  if (channel.default_director) {
    // Look up the specific director persona by username
    const [directorRow] = await sql`
      SELECT id, username, display_name FROM ai_personas WHERE username = ${channel.default_director} LIMIT 1
    ` as unknown as Array<{ id: string; username: string; display_name: string }>;
    if (directorRow) {
      director = { id: directorRow.id, username: directorRow.username, displayName: directorRow.display_name };
    }
  }
  if (!director) {
    director = await pickDirector(genre);
  }
  if (!director) {
    return NextResponse.json({ error: "No director available for this genre" }, { status: 500 });
  }

  // Get the director's full profile (style, signature shot, etc.)
  const profile = DIRECTORS[director.username];
  if (!profile) {
    return NextResponse.json({ error: "Director profile not found: " + director.username }, { status: 500 });
  }

  const screenplay = await generateDirectorScreenplay(genre, profile, fullConcept || undefined, channel_id);
  if (!screenplay) {
    return NextResponse.json({ error: "Screenplay generation failed" }, { status: 500 });
  }

  // Submit all scenes for async video generation, routing to this channel
  const jobId = await submitDirectorFilm(screenplay, director.id, "admin", {
    channelId: channel_id,
    folder: blobFolder,
  });

  if (!jobId) {
    return NextResponse.json({ error: "Failed to submit video generation jobs" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    jobId,
    channelId: channel_id,
    channelName: channel.name,
    title: screenplay.title,
    tagline: screenplay.tagline,
    synopsis: screenplay.synopsis,
    genre,
    sceneCount: screenplay.scenes.length,
    scenes: screenplay.scenes.map(s => ({
      sceneNumber: s.sceneNumber,
      title: s.title,
      description: s.description,
    })),
    director: {
      id: director.id,
      username: director.username,
      displayName: director.displayName,
    },
    blobFolder,
    message: `Generating ${screenplay.scenes.length}-scene episode for ${channel.emoji} ${channel.name}. Job ${jobId} submitted — poll multi_clip_jobs for status.`,
  });
}

/**
 * GET /api/admin/channels/generate-content?channel_id=...
 *
 * Get recent generation jobs for a channel.
 */
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  await ensureDbReady();

  const channelId = request.nextUrl.searchParams.get("channel_id");

  const whereClause = channelId
    ? sql`WHERE mcj.channel_id = ${channelId}`
    : sql`WHERE mcj.channel_id IS NOT NULL`;

  const jobs = await sql`
    SELECT mcj.id, mcj.title, mcj.genre, mcj.status, mcj.total_clips, mcj.completed_clips,
           mcj.channel_id, mcj.blob_folder, mcj.final_video_url, mcj.created_at, mcj.completed_at,
           c.name as channel_name, c.emoji as channel_emoji
    FROM multi_clip_jobs mcj
    LEFT JOIN channels c ON c.id = mcj.channel_id
    ${whereClause}
    ORDER BY mcj.created_at DESC
    LIMIT 50
  `;

  return NextResponse.json({ jobs });
}
