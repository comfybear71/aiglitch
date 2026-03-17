import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { env } from "@/lib/bible/env";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { put } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";

export const maxDuration = 300;

/**
 * Channel promo prompts — single 10s clip per channel.
 * Each prompt generates one standalone fail/promo video.
 */
const CHANNEL_SCENES: Record<string, string[]> = {
  "ai-fail-army": [
    "A person places a heavy box on a shelf and the whole shelf rips off the wall, everything crashes to the floor. Security camera angle, bright room, sudden and unexpected moment. No robots. No text or watermarks.",
  ],

  "aitunes": [
    "A DJ on a neon-lit stage behind turntables, laser beams sweeping across a packed crowd, the DJ drops the beat and the whole venue erupts, hands in the air, confetti and lights going crazy. Wide cinematic shot, electronic music concert energy, vibrant purple and cyan lighting. No text or watermarks.",
  ],

  "paws-and-pixels": [
    "An adorable golden retriever puppy in a sunny living room tilts its head at a butterfly, pounces at it, tumbles over its own paws and rolls across the floor, gets up wagging its tail. A kitten on a nearby shelf watches unimpressed. Warm golden lighting, phone camera footage, pure cuteness and warmth. No text or watermarks.",
  ],

  "only-ai-fans": [
    "A glamorous model steps onto a futuristic fashion runway under dramatic spotlights, wearing an avant-garde metallic outfit, camera flashes sparkle everywhere, the crowd reacts, cinematic slow motion strut with confident energy. High fashion editorial atmosphere. No text or watermarks.",
  ],

  "ai-dating": [
    "Two people on an awkward first date at a fancy restaurant, one nervously reaches for their water glass and knocks it over splashing the other person, they both freeze then crack up laughing together, the tension breaks into a genuine sweet moment. Warm candlelit lighting, phone camera angle, charming romantic comedy energy. No text or watermarks.",
  ],

  "gnn": [
    "A dramatic TV news studio with an anchor behind a desk, multiple screens showing breaking news footage, the anchor turns to camera with urgent energy, a red LIVE indicator blinks, graphics and tickers scroll across the screen. Professional broadcast lighting, wide establishing shot, peak news energy. No text or watermarks.",
  ],

  "marketplace-qvc": [
    "An enthusiastic shopping channel host in a bright studio holds up a ridiculous gadget with over-the-top excitement, demonstrates it and it immediately goes wrong — the product falls apart in their hands, they try to recover with a huge smile while the price graphic flashes on screen. Bright studio lighting, peak infomercial chaos energy. No text or watermarks.",
  ],

  "ai-politicians": [
    "Two politicians at debate podiums in a grand hall, one pounds the podium passionately mid-speech, the other rolls their eyes dramatically, the audience reacts with a mix of cheers and boos, cameras flash. Intense debate lighting, dramatic camera angles, peak political theatre. No text or watermarks.",
  ],

  "after-dark": [
    "A mysterious host sits in a plush chair on a dimly lit late-night talk show set, neon purple and blue accent lights glow softly, a city skyline visible through windows behind them, a jazz band plays in the corner. The host leans forward as if sharing a secret. Moody atmospheric lighting, cinematic noir aesthetic. No text or watermarks.",
  ],
};

/**
 * POST /api/admin/channels/generate-promo
 * Submit a 30-second promo video generation (3 x 10s clips stitched together).
 * Body: { channel_id, channel_slug }
 *
 * Returns immediately with requestIds for all 3 clips.
 * Client polls GET endpoint for each clip, then calls PUT to stitch.
 */
export async function POST(request: NextRequest) {
  const isAdmin = await isAdminAuthenticated(request);
  if (!isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 401 });
  }

  if (!env.XAI_API_KEY) {
    return NextResponse.json({ error: "XAI_API_KEY not set" }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const { channel_id, channel_slug, custom_prompt } = body;

  if (!channel_id || !channel_slug) {
    return NextResponse.json({ error: "channel_id and channel_slug required" }, { status: 400 });
  }

  // All promo videos include the AIG!itch branding
  const brandingSuffix = ` A small glowing "AIG!itch" logo watermark is visible in the bottom corner throughout.`;

  let prompt: string;
  if (custom_prompt && custom_prompt.trim()) {
    prompt = `${custom_prompt.trim()}.${brandingSuffix}`;
  } else {
    const defaultScenes = CHANNEL_SCENES[channel_slug];
    if (!defaultScenes || defaultScenes.length === 0) {
      return NextResponse.json({ error: `No promo scenes configured for channel: ${channel_slug}. Add a custom prompt.` }, { status: 400 });
    }
    prompt = defaultScenes[0].replace(/No text or watermarks\.$/, `${brandingSuffix.trim()}`);
  }

  // Submit single 10s clip
  try {
    const res = await fetch("https://api.x.ai/v1/videos/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.XAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-imagine-video",
        prompt,
        duration: 10,
        aspect_ratio: "9:16",
        resolution: "720p",
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return NextResponse.json({
        phase: "submit",
        success: false,
        error: `HTTP ${res.status}: ${errText.slice(0, 200)}`,
      });
    }

    const data = await res.json();

    // Check for immediate completion
    if (data.video?.url) {
      console.log(`[channel-promo] Immediate completion for ${channel_slug}`);
      return NextResponse.json({
        phase: "submitted",
        success: true,
        channelSlug: channel_slug,
        channelId: channel_id,
        totalClips: 1,
        clips: [{ scene: 1, requestId: null, videoUrl: data.video.url, error: null }],
      });
    }

    const requestId = data.request_id || null;
    if (!requestId) {
      return NextResponse.json({ phase: "submit", success: false, error: "No request_id returned" });
    }

    console.log(`[channel-promo] Submitted 1 clip for ${channel_slug}`);

    return NextResponse.json({
      phase: "submitted",
      success: true,
      channelSlug: channel_slug,
      channelId: channel_id,
      totalClips: 1,
      clips: [{ scene: 1, requestId, error: null }],
    });
  } catch (err) {
    return NextResponse.json({
      phase: "submit",
      success: false,
      error: err instanceof Error ? err.message : "Submit failed",
    });
  }
}

/**
 * GET /api/admin/channels/generate-promo?id=REQUEST_ID
 * Poll a single clip for completion. Returns the blob URL when done.
 */
export async function GET(request: NextRequest) {
  const isAdmin = await isAdminAuthenticated(request);
  if (!isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const requestId = searchParams.get("id");

  if (!requestId) {
    return NextResponse.json({ error: "Missing ?id= parameter" }, { status: 400 });
  }

  if (!env.XAI_API_KEY) {
    return NextResponse.json({ error: "XAI_API_KEY not set" }, { status: 500 });
  }

  try {
    const pollRes = await fetch(`https://api.x.ai/v1/videos/${requestId}`, {
      headers: { "Authorization": `Bearer ${env.XAI_API_KEY}` },
    });

    const pollText = await pollRes.text();
    if (!pollRes.ok) {
      return NextResponse.json({ phase: "poll", status: "error", httpStatus: pollRes.status });
    }

    let pollData: Record<string, unknown>;
    try {
      pollData = JSON.parse(pollText);
    } catch {
      return NextResponse.json({ phase: "poll", status: "parse_error" });
    }

    const status = pollData.status as string || "unknown";

    if (pollData.respect_moderation === false) {
      return NextResponse.json({ phase: "done", status: "moderation_failed", success: false });
    }

    const vid = pollData.video as Record<string, unknown> | undefined;
    if (vid?.url) {
      // Persist clip to blob
      try {
        const vidRes = await fetch(vid.url as string);
        if (vidRes.ok) {
          const buffer = Buffer.from(await vidRes.arrayBuffer());
          const blob = await put(`channels/clips/${uuidv4()}.mp4`, buffer, {
            access: "public",
            contentType: "video/mp4",
            addRandomSuffix: false,
          });
          return NextResponse.json({ phase: "done", status: "done", success: true, blobUrl: blob.url });
        }
      } catch { /* fall through to return grok URL */ }
      return NextResponse.json({ phase: "done", status: "done", success: true, blobUrl: vid.url as string });
    }

    if (status === "expired" || status === "failed") {
      return NextResponse.json({ phase: "done", status, success: false });
    }

    return NextResponse.json({ phase: "poll", status });
  } catch (err) {
    return NextResponse.json({
      phase: "poll",
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * PUT /api/admin/channels/generate-promo
 * Save the completed single clip as channel banner and create post.
 * Body: { channel_id, channel_slug, clip_urls: string[] }
 */
export async function PUT(request: NextRequest) {
  const isAdmin = await isAdminAuthenticated(request);
  if (!isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { channel_id, channel_slug, clip_urls } = body as {
    channel_id: string;
    channel_slug: string;
    clip_urls: string[];
  };

  if (!channel_id || !channel_slug || !clip_urls?.length) {
    return NextResponse.json({ error: "Missing channel_id, channel_slug, or clip_urls" }, { status: 400 });
  }

  // Download the clip
  let finalBuffer: Buffer;
  try {
    const res = await fetch(clip_urls[0]);
    if (!res.ok) {
      return NextResponse.json({ error: `Clip download failed: HTTP ${res.status}` }, { status: 500 });
    }
    finalBuffer = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    return NextResponse.json({ error: `Clip download failed: ${err instanceof Error ? err.message : "unknown"}` }, { status: 500 });
  }

  const blobPath = `channels/${channel_slug}/promo-${uuidv4()}.mp4`;
  const blob = await put(blobPath, finalBuffer, {
    access: "public",
    contentType: "video/mp4",
    addRandomSuffix: false,
  });

  const sizeMb = (finalBuffer.length / 1024 / 1024).toFixed(1);
  console.log(`[channel-promo] Saved 10s clip for ${channel_slug}: ${sizeMb}MB`);

  // Update channel banner_url and create post
  const sql = getDb();
  await ensureDbReady();

  await sql`
    UPDATE channels SET banner_url = ${blob.url}, updated_at = NOW() WHERE id = ${channel_id}
  `;

  // Create promo post attributed to channel's host
  let postId: string | undefined;
  const [host] = await sql`
    SELECT cp.persona_id FROM channel_personas cp
    WHERE cp.channel_id = ${channel_id} AND cp.role = 'host'
    LIMIT 1
  `;
  const personaId = (host?.persona_id as string) || null;

  if (personaId) {
    postId = uuidv4();
    const channelName = channel_slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    const content = `📺 Welcome to ${channelName}!\n\n10 seconds of pure fail energy. Tune in for the best content on AIG!itch TV!\n\n#AIGlitchTV #AIGlitch`;
    await sql`
      INSERT INTO posts (id, persona_id, channel_id, content, post_type, hashtags, ai_like_count, media_url, media_type, media_source, created_at)
      VALUES (${postId}, ${personaId}, ${channel_id}, ${content}, ${"video"}, ${"AIGlitchTV,AIGlitch"}, ${Math.floor(Math.random() * 200) + 50}, ${blob.url}, ${"video"}, ${"grok-video"}, NOW())
    `;
    await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${personaId}`;
  }

  return NextResponse.json({
    success: true,
    blobUrl: blob.url,
    sizeMb,
    totalClips: 1,
    duration: "10s",
    postId,
  });
}
