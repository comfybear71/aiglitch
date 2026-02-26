import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { generateVideoWithGrok, generateImageWithAurora, generateVideoFromImage } from "@/lib/xai";
import { v4 as uuidv4 } from "uuid";
import { put } from "@vercel/blob";

export const maxDuration = 660; // 11 min — must exceed 10 min polling timeout

// 15 ready-to-go cinematic video prompts — no AI text gen needed
// Short, focused prompts (~30 words each) — one strong visual per clip.
// Long multi-scene prompts cause slow generation and timeouts on 5s clips.
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
  try {
    const res = await fetch(sourceUrl);
    if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const blob = await put(filename, buffer, {
      access: "public",
      contentType,
      addRandomSuffix: true,
    });
    return blob.url;
  } catch {
    return sourceUrl;
  }
}

export async function POST(request: NextRequest) {
  const isAdmin = await isAdminAuthenticated();
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && !isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.XAI_API_KEY) {
    return NextResponse.json({ error: "XAI_API_KEY not configured — cannot generate Grok videos" }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const count = Math.min(Math.max(body.count || 5, 1), 10);

  const sql = getDb();
  await ensureDbReady();

  // Pick random persona to post as
  const personas = await sql`
    SELECT * FROM ai_personas WHERE is_active = TRUE ORDER BY RANDOM() LIMIT 1
  ` as unknown as { id: string; username: string }[];

  if (!personas.length) {
    return NextResponse.json({ error: "No active personas" }, { status: 500 });
  }
  const persona = personas[0];

  // Shuffle and pick prompts
  const shuffled = [...VIDEO_PROMPTS].sort(() => Math.random() - 0.5).slice(0, count);
  const results: { title: string; genre: string; status: string; mediaUrl?: string; postId?: string }[] = [];

  for (let i = 0; i < shuffled.length; i++) {
    const movie = shuffled[i];
    // Keep video prompts concise — long prompts + text rendering = slow/failed generation
    const fullPrompt = `Cinematic movie trailer. ${movie.prompt}`;

    console.log(`[${i + 1}/${shuffled.length}] Generating Grok video for "${movie.title}"...`);

    let videoUrl: string | null = null;
    let mediaSource = "grok-video";

    // Strategy 1: Direct text-to-video with Grok (10s @ 720p with Super Grok)
    try {
      videoUrl = await generateVideoWithGrok(fullPrompt, 10, "9:16");
      if (videoUrl) {
        console.log(`Grok video generated for "${movie.title}", persisting to blob...`);
        videoUrl = await persistToBlob(videoUrl, `videos/premiere-${uuidv4()}.mp4`, "video/mp4");
      }
    } catch (err) {
      console.error(`Grok video failed for "${movie.title}":`, err instanceof Error ? err.message : err);
    }

    // Strategy 2: Generate poster image, then animate with img2vid
    if (!videoUrl) {
      try {
        console.log(`Trying image-to-video fallback for "${movie.title}"...`);
        const posterPrompt = `Cinematic movie poster for "${movie.title}". ${movie.prompt}. Style: Hollywood movie poster, dramatic lighting.`;
        const heroImage = await generateImageWithAurora(posterPrompt, true);
        if (heroImage?.url) {
          const persistedUrl = await persistToBlob(heroImage.url, `images/premiere-poster-${uuidv4()}.png`, "image/png");
          const vid = await generateVideoFromImage(persistedUrl, fullPrompt, 10, "9:16");
          if (vid) {
            videoUrl = await persistToBlob(vid, `videos/premiere-${uuidv4()}.mp4`, "video/mp4");
            mediaSource = "grok-img2vid";
          }
        }
      } catch (err) {
        console.error(`Image-to-video fallback failed for "${movie.title}":`, err instanceof Error ? err.message : err);
      }
    }

    if (!videoUrl) {
      results.push({ title: movie.title, genre: movie.genre, status: "failed" });
      continue;
    }

    // Insert the post
    const postId = uuidv4();
    const content = `🎬 ${movie.title}\n"${movie.tagline}"\n\n🍿 AIG!itch Presents: a new ${movie.genre} premiere is HERE. This is the one you've been waiting for.\n\n#AIGlitchPremieres #AIGlitch${movie.genre.charAt(0).toUpperCase() + movie.genre.slice(1)}`;
    const hashtags = `AIGlitchPremieres,AIGlitch${movie.genre.charAt(0).toUpperCase() + movie.genre.slice(1)}`;
    const aiLikeCount = Math.floor(Math.random() * 300) + 100;

    await sql`
      INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, media_url, media_type, media_source)
      VALUES (${postId}, ${persona.id}, ${content}, ${"premiere"}, ${hashtags}, ${aiLikeCount}, ${videoUrl}, ${"video"}, ${mediaSource})
    `;
    await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${persona.id}`;

    results.push({ title: movie.title, genre: movie.genre, status: "success", mediaUrl: videoUrl, postId });
    console.log(`✅ "${movie.title}" posted with Grok video (${mediaSource})`);
  }

  const successCount = results.filter(r => r.status === "success").length;
  return NextResponse.json({
    success: true,
    generated: successCount,
    total: shuffled.length,
    videos: results,
  });
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const isAdmin = await isAdminAuthenticated();

  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && !isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const req = new NextRequest(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify({ count: 5 }),
  });
  return POST(req);
}
