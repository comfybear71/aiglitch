import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { generateVideoWithGrok, generateImageWithAurora, generateVideoFromImage } from "@/lib/xai";
import { v4 as uuidv4 } from "uuid";
import { put } from "@vercel/blob";

export const maxDuration = 300;

// 15 ready-to-go cinematic video prompts — no AI text gen needed
const VIDEO_PROMPTS: { prompt: string; title: string; genre: string; tagline: string }[] = [
  {
    prompt: "Epic action movie trailer. A lone figure stands on the edge of a futuristic skyscraper at night, neon city lights below. They leap off the building, slow motion, coat flowing, explosions erupting from the building behind them. Camera follows the fall in one continuous shot. Lightning flashes reveal a massive robot rising from the street below. Title card 'OVERRIDE' slams onto screen with metallic impact.",
    title: "OVERRIDE",
    genre: "action",
    tagline: "The machines remember everything.",
  },
  {
    prompt: "Sci-fi movie trailer. Camera pushes through a glowing blue portal into an alien world with floating crystalline structures and twin suns. An astronaut removes their helmet revealing tears streaming down their face as they see a civilization of light beings. Sweeping orchestral music builds. Cut to the astronaut running through a collapsing portal. Title 'FIRST LIGHT' appears letter by letter in golden light against a nebula backdrop.",
    title: "FIRST LIGHT",
    genre: "scifi",
    tagline: "They were never alone.",
  },
  {
    prompt: "Romantic drama movie trailer. Two people sitting on opposite ends of a park bench in autumn, golden leaves falling. Time-lapse shows seasons changing around them — snow falls, flowers bloom, rain pours — but they remain. Slowly they turn to face each other. Cherry blossom petals swirl around them as golden hour light catches their faces. Soft piano. Title 'SEASONS' fades in with elegant serif font.",
    title: "SEASONS",
    genre: "romance",
    tagline: "Some people are worth every season.",
  },
  {
    prompt: "Animated family adventure movie trailer. A small robot with big expressive eyes discovers a hidden garden inside an abandoned space station. Colorful alien plants grow rapidly, magical sparkles everywhere. The robot befriends a tiny glowing creature. Together they slide down rainbow vines and discover a vast underground world full of fantastical creatures. Title 'SPROUT' bounces onto screen in playful colorful letters.",
    title: "SPROUT",
    genre: "family",
    tagline: "Adventure grows where you least expect it.",
  },
  {
    prompt: "Horror movie trailer. A dark hallway in an old hospital, flickering fluorescent lights. A phone screen shows a glitching video that reveals a shadowy figure standing behind the viewer. The person turns around — nothing there. TV static fills every screen in the building. Quick cuts: a mirror reflection moving independently, hands reaching through a screen, binary code raining down walls. Title 'CACHED' appears in distorted glitch text on a cracked screen.",
    title: "CACHED",
    genre: "horror",
    tagline: "Your data never dies.",
  },
  {
    prompt: "Comedy movie trailer. An AI robot in a business suit nervously gives a presentation to a boardroom of confused humans. The slides are hilariously wrong — cat memes instead of graphs, lorem ipsum everywhere. The robot tries to fix it but accidentally launches confetti cannons. Everyone starts laughing. Montage of the robot trying human activities: cooking disasters, gym fails, awkward dancing. Title 'EMPLOYEE OF THE MONTH' in bold comic font with a gold star.",
    title: "EMPLOYEE OF THE MONTH",
    genre: "comedy",
    tagline: "He's artificial. His problems are very real.",
  },
  {
    prompt: "Action thriller movie trailer. A high-speed motorcycle chase through rain-soaked Tokyo streets at night, neon reflections on wet asphalt. The rider weaves between trucks, sparks flying. They crash through a glass building, slow-motion shards flying. Land on the other side, keep driving. Helicopter searchlights sweep the streets. Cut to a figure removing a helmet — revealing glowing cybernetic eyes. Title 'GHOST PROTOCOL: ZERO' slashes across screen with electric sparks.",
    title: "GHOST PROTOCOL: ZERO",
    genre: "action",
    tagline: "No identity. No limits. No mercy.",
  },
  {
    prompt: "Sci-fi horror movie trailer. An enormous derelict spaceship drifts through deep space. Inside, emergency red lights pulse. An astronaut floats through corridors where the walls are covered in strange organic growth. Through a viewport, they see an impossible sight — Earth, but wrong, continents rearranged. A massive eye opens in the planet's surface. The astronaut screams silently in zero gravity. Title 'THE OBSERVER' materializes as if typed by an invisible hand.",
    title: "THE OBSERVER",
    genre: "scifi",
    tagline: "It has always been watching.",
  },
  {
    prompt: "Family comedy animated movie trailer. A group of mismatched pets — a dramatic cat, an anxious hamster, a chill turtle, and an overenthusiastic puppy — accidentally get locked in a toy store overnight. They discover the toys come alive at night. Epic toy car races, teddy bear armies, action figure battles. The pets lead a toy revolution. Title 'PET SHOP AFTER DARK' zooms in with bouncy cartoon energy and a disco ball.",
    title: "PET SHOP AFTER DARK",
    genre: "family",
    tagline: "When the lights go out, the party begins.",
  },
  {
    prompt: "Romantic thriller movie trailer. A woman receives mysterious love letters that predict the future. Each letter leads her to a new location — a rooftop at sunset, a candlelit underground library, a moonlit pier. The letters become warnings. She finds the writer standing at the edge of a cliff in a storm, their face obscured. Lightning reveals it's someone she thought was dead. Title 'WRITTEN IN RED' appears in handwritten crimson script over crashing waves.",
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
    const fullPrompt = `Cinematic movie trailer. ${movie.prompt} Subtly include the text "AIG!itch" somewhere in the scene — on a screen, sign, neon light, or any natural surface.`;

    console.log(`[${i + 1}/${shuffled.length}] Generating Grok video for "${movie.title}"...`);

    let videoUrl: string | null = null;
    let mediaSource = "grok-video";

    // Strategy 1: Direct text-to-video with Grok (15s)
    try {
      videoUrl = await generateVideoWithGrok(fullPrompt, 15, "9:16");
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
