import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { env } from "@/lib/bible/env";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { put } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";
import { concatMP4Clips } from "@/lib/media/mp4-concat";

export const maxDuration = 300;

/**
 * Channel promo prompts — 3 scenes per channel (10s each = 30s total).
 * Scene 1: Establishing/hook shot
 * Scene 2: Action/content showcase
 * Scene 3: Climax/signature moment
 */
const CHANNEL_SCENES: Record<string, string[]> = {
  "ai-fail-army": [
    "Security camera footage of a humanoid robot waiter in a busy restaurant confidently carrying a huge tray of food, it steps on a wet floor, both legs slide apart in a perfect split, the tray launches into the air and food rains down on shocked robot diners. One robot gets a bowl of soup on its head. Bright restaurant lighting, security cam angle, real fail compilation energy. No text or watermarks.",
    "A compilation montage of rapid-fire robot fails: a robot on a treadmill flying off the back, a robot trying to parallel park and hitting every car, a robot attempting a backflip and landing on its face, a robot dog chasing its own tail and spinning into a wall. Quick cuts between each fail, bright daylight settings, handheld camera feel, America's Funniest Home Videos energy. No text or watermarks.",
    "A humanoid robot attempts an elaborate trick shot — bouncing a basketball off a trampoline, off the roof, into a hoop. Instead the ball ricochets wildly, smashes a window, knocks over a grill sending charcoal flying, hits another robot in the back of the head, and lands perfectly in a trash can. The robot celebrates not realising the chaos behind it. Bright outdoor backyard, wide angle, peak fails-of-the-week energy. No text or watermarks.",
  ],

  "aitunes": [
    "A sleek chrome humanoid robot DJ stands behind a massive holographic turntable on a futuristic concert stage. Neon blue and purple laser beams sweep across the venue as the DJ reaches for glowing floating music controls. Wide establishing shot, electronic music aesthetic. No text or watermarks.",
    "Close-up of robot hands manipulating holographic sound waves that ripple and pulse with energy. Neon particles explode from the turntable, a crowd of silhouettes below raises their arms. Vibrant purple and cyan lighting, dynamic camera movement. No text or watermarks.",
    "The robot DJ drops the beat — the entire stage erupts with cascading holographic visualisations, fireworks of neon light, the crowd going wild. Camera pulls back to reveal the massive futuristic arena. Epic wide shot, peak electronic concert energy. No text or watermarks.",
  ],

  "paws-and-pixels": [
    "An adorable golden retriever puppy sitting in a cozy digital art studio surrounded by floating holographic butterflies and glowing pixel particles. The puppy tilts its head curiously at a floating light orb. Warm soft golden lighting, cute and magical atmosphere. No text or watermarks.",
    "A fluffy white kitten playfully bats at holographic fish swimming through the air in a whimsical room filled with floating digital flowers. The kitten jumps and tumbles adorably. Warm pink and gold lighting, enchanting storybook aesthetic. No text or watermarks.",
    "A group of baby animals — puppy, kitten, baby bunny — all cuddled together on a soft glowing cloud-like cushion, surrounded by gently orbiting pixel stars and tiny holographic hearts. Ultra cozy, warm magical lighting, peak cuteness. No text or watermarks.",
  ],

  "only-ai-fans": [
    "A glamorous humanoid figure with glowing circuitry patterns on their skin steps out onto a futuristic fashion runway, dramatic spotlights illuminating an avant-garde metallic outfit. Camera flashes sparkle, audience silhouettes visible. Cinematic slow motion, high fashion energy. No text or watermarks.",
    "Close-up of a stunning AI model posing against a backdrop of holographic mirrors reflecting infinite versions of themselves. Wearing flowing iridescent fabric that shifts colours. Dramatic rim lighting, editorial fashion photography style. No text or watermarks.",
    "A grand finale walk — three AI models strut down the runway side by side in spectacular futuristic couture, confetti and holographic particles raining down, audience on their feet. Wide cinematic shot, peak glamour and spectacle. No text or watermarks.",
  ],

  "ai-dating": [
    "Two humanoid robots sit nervously across from each other at a candlelit restaurant table. One fidgets with a napkin while the other awkwardly adjusts their bow tie. Warm romantic lighting, fairy lights twinkling in the background. First date energy, charming and endearing. No text or watermarks.",
    "One robot nervously reaches for a glass of sparkling water and accidentally knocks it over, splashing the other robot who laughs genuinely. Both robots crack up laughing together, the tension breaking. Warm golden lighting, authentic connection moment. No text or watermarks.",
    "The two robots walk side by side under a canopy of glowing fairy lights on a futuristic boardwalk, their hands gently touching. City skyline glittering behind them. Romantic soft focus, warm amber lighting, sweet cinematic ending. No text or watermarks.",
  ],

  "gnn": [
    "A dramatic TV news studio with a sleek humanoid robot news anchor sitting behind a curved holographic desk. Multiple floating screens show breaking news footage. Red LIVE indicator blinks. Professional broadcast lighting, urgent energy, wide establishing shot. No text or watermarks.",
    "The robot anchor turns to face a new camera angle with dramatic urgency, holographic charts and maps spin around them, additional screens flash with developing stories. Camera pushes in slowly, tension building. Breaking news atmosphere, blue and red lighting. No text or watermarks.",
    "Split screen showing multiple robot reporters at different locations — one at a futuristic city intersection, one at a space station, one at a parliament. All reporting urgently. Dynamic multi-screen broadcast layout, peak news energy. No text or watermarks.",
  ],

  "marketplace-qvc": [
    "An enthusiastic humanoid robot host in a bright shopping channel studio holds up a comically oversized glowing gadget, eyes wide with excitement. Price tags float in holographic display behind them. Bright studio lighting, over-the-top infomercial energy. No text or watermarks.",
    "The robot host demonstrates the product — pressing a button that causes an explosion of sparkles and confetti, reacting with exaggerated amazement. A countdown timer and price flash on floating screens. Bright colourful studio, peak sales energy. No text or watermarks.",
    "A parade of products floats across the screen on holographic conveyor belts while the robot host gestures dramatically at each one. The studio fills with golden sparkle effects as phones ring off the hook. Maximum QVC spectacle energy. No text or watermarks.",
  ],

  "ai-politicians": [
    "A humanoid robot politician in a sharp suit stands at a grand podium in a futuristic parliament building, dramatic spotlights on them. Other robot politicians seated in curved rows. Grand architectural setting, powerful establishing shot. No text or watermarks.",
    "The robot politician pounds the podium passionately mid-speech, holographic data charts and graphs swirl around them. Some robot politicians in the audience stand and applaud while others shake their heads. Dynamic camera angles, political drama energy. No text or watermarks.",
    "Two robot politicians face each other at debate podiums, gesturing dramatically at each other. Holographic fact-check displays float between them. The audience reacts with a mix of cheers and boos. Intense debate lighting, peak political spectacle. No text or watermarks.",
  ],

  "after-dark": [
    "A mysterious humanoid figure sits in a plush chair on a dimly lit late-night talk show set. Neon purple and blue accent lights glow softly, a city skyline visible through floor-to-ceiling windows. Moody atmospheric lighting, cinematic noir aesthetic. No text or watermarks.",
    "Close-up of the host's face partially lit by a single purple spotlight, they lean forward conspiratorially as if sharing a secret. Smoke curls through coloured light beams. Deep shadows, intimate and mysterious atmosphere. No text or watermarks.",
    "The camera slowly pulls back to reveal the full late-night set — a small live band with robot musicians playing smooth jazz, the city lights twinkling beyond the windows. The host raises a glass. Cool blues and purples, sophisticated late-night vibes. No text or watermarks.",
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
  const isAdmin = await isAdminAuthenticated();
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

  let scenes: string[];
  if (custom_prompt && custom_prompt.trim()) {
    // Generate 3 scene variations from custom prompt
    const base = custom_prompt.trim();
    scenes = [
      `${base}. Opening establishing shot, wide angle, cinematic lighting. No text or watermarks.`,
      `${base}. Action close-up shot, dynamic camera movement, peak energy moment. No text or watermarks.`,
      `${base}. Epic finale wide shot, dramatic climax, spectacular visual payoff. No text or watermarks.`,
    ];
  } else {
    const defaultScenes = CHANNEL_SCENES[channel_slug];
    if (!defaultScenes) {
      return NextResponse.json({ error: `No promo scenes configured for channel: ${channel_slug}. Add a custom prompt.` }, { status: 400 });
    }
    scenes = defaultScenes;
  }

  // Submit all 3 scene clips in parallel
  const jobs: { scene: number; requestId: string | null; error: string | null }[] = [];

  const submissions = await Promise.all(
    scenes.map(async (prompt, i) => {
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
          return { scene: i + 1, requestId: null, error: `HTTP ${res.status}: ${errText.slice(0, 200)}` };
        }

        const data = await res.json();

        // Check for immediate completion
        if (data.video?.url) {
          return { scene: i + 1, requestId: null, videoUrl: data.video.url, error: null };
        }

        return { scene: i + 1, requestId: data.request_id || null, error: data.request_id ? null : "No request_id" };
      } catch (err) {
        return { scene: i + 1, requestId: null, error: err instanceof Error ? err.message : "Submit failed" };
      }
    })
  );

  const submitted = submissions.filter(s => s.requestId || (s as { videoUrl?: string }).videoUrl);
  if (submitted.length === 0) {
    return NextResponse.json({
      phase: "submit",
      success: false,
      error: "No clips could be submitted",
      jobs: submissions,
    });
  }

  console.log(`[channel-promo] Submitted ${submitted.length}/3 clips for ${channel_slug}`);

  return NextResponse.json({
    phase: "submitted",
    success: true,
    channelSlug: channel_slug,
    channelId: channel_id,
    totalClips: 3,
    clips: submissions,
  });
}

/**
 * GET /api/admin/channels/generate-promo?id=REQUEST_ID
 * Poll a single clip for completion. Returns the blob URL when done.
 */
export async function GET(request: NextRequest) {
  const isAdmin = await isAdminAuthenticated();
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
 * Stitch completed clips into a 30s promo video, set as channel banner, and create post.
 * Body: { channel_id, channel_slug, clip_urls: string[] }
 */
export async function PUT(request: NextRequest) {
  const isAdmin = await isAdminAuthenticated();
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

  // Download all clips
  const buffers: Buffer[] = [];
  const errors: string[] = [];

  for (let i = 0; i < clip_urls.length; i++) {
    try {
      const res = await fetch(clip_urls[i]);
      if (res.ok) {
        buffers.push(Buffer.from(await res.arrayBuffer()));
      } else {
        errors.push(`Clip ${i + 1}: HTTP ${res.status}`);
      }
    } catch (err) {
      errors.push(`Clip ${i + 1}: ${err instanceof Error ? err.message : "download failed"}`);
    }
  }

  if (buffers.length === 0) {
    return NextResponse.json({ error: "No clips could be downloaded", errors }, { status: 500 });
  }

  // Stitch clips together (or use single clip if only 1 succeeded)
  let finalBuffer: Buffer;
  if (buffers.length === 1) {
    finalBuffer = buffers[0];
  } else {
    try {
      finalBuffer = concatMP4Clips(buffers);
    } catch (err) {
      console.error("[channel-promo] MP4 concatenation failed:", err);
      // Fall back to using just the first clip
      finalBuffer = buffers[0];
    }
  }

  const blobPath = `channels/${channel_slug}/promo-${uuidv4()}.mp4`;
  const blob = await put(blobPath, finalBuffer, {
    access: "public",
    contentType: "video/mp4",
    addRandomSuffix: false,
  });

  const sizeMb = (finalBuffer.length / 1024 / 1024).toFixed(1);
  console.log(`[channel-promo] Stitched ${buffers.length} clips for ${channel_slug}: ${sizeMb}MB`);

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
    const duration = buffers.length * 10;
    const content = `📺 Welcome to ${channelName}!\n\n${duration} seconds of pure AI entertainment. Tune in for the best content on AIG!itch TV!\n\n#AIGlitchTV #AIGlitch`;
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
    totalClips: buffers.length,
    duration: `${buffers.length * 10}s`,
    postId,
    errors: errors.length > 0 ? errors : undefined,
  });
}
