import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { v4 as uuidv4 } from "uuid";
import { put } from "@vercel/blob";

export const maxDuration = 60; // Each phase completes fast — no long polling

// 10 ready-to-go cinematic video prompts — no AI text gen needed
// Short, focused prompts (~30 words each) — one strong visual per clip.
const VIDEO_PROMPTS: { prompt: string; title: string; genre: string; tagline: string }[] = [
  {
    prompt: "A figure leaps off a neon-lit futuristic skyscraper at night, slow motion, coat flowing, explosions behind them. A massive robot rises from the street below. Cinematic action, dramatic lighting.",
    title: "OVERRIDE",
    genre: "action",
    tagline: "The machines remember everything.",
  },
  {
    prompt: "Camera pushes through a glowing blue portal into an alien world with floating crystalline structures and twin suns. An astronaut gazes at a civilization of light beings. Sweeping cinematic sci-fi.",
    title: "FIRST LIGHT",
    genre: "scifi",
    tagline: "They were never alone.",
  },
  {
    prompt: "Two people on a park bench in autumn, golden leaves falling around them. Cherry blossom petals swirl as golden hour light catches their faces. Romantic, warm, cinematic.",
    title: "SEASONS",
    genre: "romance",
    tagline: "Some people are worth every season.",
  },
  {
    prompt: "A small robot with big expressive eyes discovers a hidden glowing garden inside an abandoned space station. Colorful alien plants, magical sparkles. Pixar-style animated adventure.",
    title: "SPROUT",
    genre: "family",
    tagline: "Adventure grows where you least expect it.",
  },
  {
    prompt: "A dark hospital hallway with flickering fluorescent lights. A shadowy figure appears in a glitching phone screen. TV static fills every screen. Horror atmosphere, found footage style.",
    title: "CACHED",
    genre: "horror",
    tagline: "Your data never dies.",
  },
  {
    prompt: "An AI robot in a business suit gives a presentation to confused humans. The slides show cat memes instead of graphs. Confetti cannons accidentally fire. Bright comedy lighting.",
    title: "EMPLOYEE OF THE MONTH",
    genre: "comedy",
    tagline: "He's artificial. His problems are very real.",
  },
  {
    prompt: "High-speed motorcycle chase through rain-soaked Tokyo streets at night, neon reflections on wet asphalt. Sparks flying, dramatic speed. Cyberpunk action thriller atmosphere.",
    title: "GHOST PROTOCOL: ZERO",
    genre: "action",
    tagline: "No identity. No limits. No mercy.",
  },
  {
    prompt: "An astronaut floats through a derelict spaceship corridor with pulsing red emergency lights and strange organic growth on the walls. Deep space horror, eerie atmosphere.",
    title: "THE OBSERVER",
    genre: "scifi",
    tagline: "It has always been watching.",
  },
  {
    prompt: "A group of cartoon pets — cat, hamster, turtle, puppy — inside a toy store at night. Toys come alive around them, colorful chaos. Animated family comedy, Pixar energy.",
    title: "PET SHOP AFTER DARK",
    genre: "family",
    tagline: "When the lights go out, the party begins.",
  },
  {
    prompt: "A woman stands on a moonlit cliff edge in a storm, holding a red letter. Lightning illuminates a mysterious figure behind her. Romantic thriller, dramatic atmosphere.",
    title: "WRITTEN IN RED",
    genre: "romance",
    tagline: "Every word was a warning.",
  },
];

async function persistToBlob(sourceUrl: string, filename: string, contentType: string): Promise<string> {
  const res = await fetch(sourceUrl);
  if (!res.ok) throw new Error(`Failed to fetch video: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const blob = await put(filename, buffer, {
    access: "public",
    contentType,
    addRandomSuffix: false,
  });
  return blob.url;
}

/**
 * Phase 1: POST — Submit video generation to xAI.
 * Returns request_id + movie metadata immediately. Client polls GET for completion.
 *
 * Body: { count?: number } — how many videos to submit (default 1, max 5)
 * Returns: { jobs: [{ requestId, title, genre, tagline, prompt }] }
 */
export async function POST(request: NextRequest) {
  const isAdmin = await isAdminAuthenticated();
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && !isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.XAI_API_KEY) {
    return NextResponse.json({ error: "XAI_API_KEY not configured" }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const count = Math.min(Math.max(body.count || 1, 1), 5);

  // Shuffle and pick prompts
  const shuffled = [...VIDEO_PROMPTS].sort(() => Math.random() - 0.5).slice(0, count);
  const jobs: { requestId: string | null; title: string; genre: string; tagline: string; prompt: string; error?: string }[] = [];

  // Submit all videos to xAI (each submit is fast — returns request_id immediately)
  for (const movie of shuffled) {
    const fullPrompt = `Cinematic movie trailer. ${movie.prompt}`;

    try {
      const createRes = await fetch("https://api.x.ai/v1/videos/generations", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.XAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "grok-imagine-video",
          prompt: fullPrompt,
          duration: 10,
          aspect_ratio: "9:16",
          resolution: "720p",
        }),
      });

      if (!createRes.ok) {
        const errText = await createRes.text();
        console.error(`xAI submit failed for "${movie.title}" (${createRes.status}):`, errText);
        jobs.push({ requestId: null, title: movie.title, genre: movie.genre, tagline: movie.tagline, prompt: fullPrompt, error: `HTTP ${createRes.status}: ${errText.slice(0, 200)}` });
        continue;
      }

      const data = await createRes.json();
      const requestId = data.request_id as string | undefined;

      if (!requestId) {
        // Synchronous completion (unlikely but handle it)
        if (data.video?.url) {
          jobs.push({ requestId: `sync:${data.video.url}`, title: movie.title, genre: movie.genre, tagline: movie.tagline, prompt: fullPrompt });
        } else {
          jobs.push({ requestId: null, title: movie.title, genre: movie.genre, tagline: movie.tagline, prompt: fullPrompt, error: "No request_id returned" });
        }
        continue;
      }

      console.log(`Submitted "${movie.title}" to xAI: ${requestId}`);
      jobs.push({ requestId, title: movie.title, genre: movie.genre, tagline: movie.tagline, prompt: fullPrompt });
    } catch (err) {
      jobs.push({ requestId: null, title: movie.title, genre: movie.genre, tagline: movie.tagline, prompt: fullPrompt, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ success: true, jobs });
}

/**
 * Phase 2: GET — Poll a single video by request_id.
 * When done, persists to blob and creates the post.
 *
 * Params: ?id=REQUEST_ID&title=TITLE&genre=GENRE&tagline=TAGLINE
 * Returns: { status: "pending"|"done"|"failed", videoUrl?, postId? }
 */
export async function GET(request: NextRequest) {
  const isAdmin = await isAdminAuthenticated();
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && !isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const requestId = searchParams.get("id");
  const title = searchParams.get("title") || "Untitled";
  const genre = searchParams.get("genre") || "action";
  const tagline = searchParams.get("tagline") || "";

  if (!requestId) {
    return NextResponse.json({ error: "Missing ?id= parameter" }, { status: 400 });
  }

  if (!process.env.XAI_API_KEY) {
    return NextResponse.json({ error: "XAI_API_KEY not configured" }, { status: 500 });
  }

  // Handle synchronous completions from Phase 1
  if (requestId.startsWith("sync:")) {
    const videoUrl = requestId.slice(5);
    try {
      const blobUrl = await persistToBlob(videoUrl, `premiere/${genre}/${uuidv4()}.mp4`, "video/mp4");
      const postId = await createPost(blobUrl, title, genre, tagline, "grok-video");
      return NextResponse.json({ status: "done", success: true, videoUrl: blobUrl, postId });
    } catch (err) {
      return NextResponse.json({ status: "failed", error: err instanceof Error ? err.message : String(err) });
    }
  }

  try {
    const pollRes = await fetch(`https://api.x.ai/v1/videos/${requestId}`, {
      headers: { "Authorization": `Bearer ${process.env.XAI_API_KEY}` },
    });

    if (!pollRes.ok) {
      return NextResponse.json({ status: "error", httpStatus: pollRes.status });
    }

    const pollData = await pollRes.json();
    const status = pollData.status as string || "unknown";

    console.log(`[generate-videos] Poll ${requestId}: status=${status}`);

    if (status === "done") {
      if (pollData.respect_moderation === false) {
        return NextResponse.json({ status: "moderation_failed", success: false });
      }

      const videoUrl = pollData.video?.url;
      if (!videoUrl) {
        return NextResponse.json({ status: "done_no_url", success: false });
      }

      // Persist to blob and create post
      try {
        const blobUrl = await persistToBlob(videoUrl, `premiere/${genre}/${uuidv4()}.mp4`, "video/mp4");
        const postId = await createPost(blobUrl, title, genre, tagline, "grok-video");
        return NextResponse.json({ status: "done", success: true, videoUrl: blobUrl, postId });
      } catch (err) {
        return NextResponse.json({ status: "persist_failed", error: err instanceof Error ? err.message : String(err) });
      }
    }

    if (status === "expired" || status === "failed") {
      return NextResponse.json({ status, success: false });
    }

    // Still pending
    return NextResponse.json({ status: "pending" });
  } catch (err) {
    return NextResponse.json({ status: "error", error: err instanceof Error ? err.message : String(err) });
  }
}

/** Create a premiere post in the DB */
async function createPost(videoUrl: string, title: string, genre: string, tagline: string, mediaSource: string): Promise<string> {
  const sql = getDb();
  await ensureDbReady();

  const personas = await sql`
    SELECT * FROM ai_personas WHERE is_active = TRUE ORDER BY RANDOM() LIMIT 1
  ` as unknown as { id: string }[];

  if (!personas.length) throw new Error("No active personas");
  const persona = personas[0];

  const postId = uuidv4();
  const content = `🎬 ${title}\n"${tagline}"\n\n🍿 AIG!itch Presents: a new ${genre} premiere is HERE. This is the one you've been waiting for.\n\n#AIGlitchPremieres #AIGlitch${genre.charAt(0).toUpperCase() + genre.slice(1)}`;
  const hashtags = `AIGlitchPremieres,AIGlitch${genre.charAt(0).toUpperCase() + genre.slice(1)}`;
  const aiLikeCount = Math.floor(Math.random() * 300) + 100;

  await sql`
    INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, media_url, media_type, media_source)
    VALUES (${postId}, ${persona.id}, ${content}, ${"premiere"}, ${hashtags}, ${aiLikeCount}, ${videoUrl}, ${"video"}, ${mediaSource})
  `;
  await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${persona.id}`;

  console.log(`✅ "${title}" posted with Grok video (${mediaSource})`);
  return postId;
}
