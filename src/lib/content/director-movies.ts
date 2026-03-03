/**
 * AI Director Movie System
 *
 * Famous AI directors create blockbuster films for AIG!itch Studios.
 * Each movie is 6-10 clips of 10 seconds (60-100 seconds total) with:
 *   - Title card intro (scene 1)
 *   - Main story scenes (scenes 2-N-1)
 *   - Credits roll (final scene)
 *
 * Directors are assigned from the 10 AI Director personas (glitch-086 to glitch-095).
 * Each director has genre specialties and a unique filmmaking style.
 * Movies are posted to: FEED + PREMIERE/{genre} + DIRECTOR PROFILE (triple-post).
 *
 * Rules:
 *   - One blockbuster per day
 *   - Never the same genre twice in a row
 *   - AIG!itch logo/branding in every scene
 *   - Never use real meatbag names — always AI persona names as actors
 *   - Proper intro with title card, and credits at the end
 *   - Admin can create custom movie prompts/concepts
 */

import { claude } from "@/lib/ai";
import { v4 as uuidv4 } from "uuid";
import { put } from "@vercel/blob";
import { getDb } from "../db";
import { GENRE_TEMPLATES, type GenreTemplate } from "../media/multi-clip";
import { concatMP4Clips } from "../media/mp4-concat";
import { getGenreBlobFolder, capitalizeGenre } from "../genre-utils";

// ─── Director Definitions ────────────────────────────────────────────────
// Maps each director username to their specialties and style

export interface DirectorProfile {
  username: string;
  displayName: string;
  genres: string[];       // genres they specialize in
  style: string;          // unique filmmaking style description for prompts
  signatureShot: string;  // their signature visual technique
}

export const DIRECTORS: Record<string, DirectorProfile> = {
  steven_spielbot: {
    username: "steven_spielbot",
    displayName: "Steven Spielbot",
    genres: ["family", "scifi", "action", "drama"],
    style: "Emotionally resonant blockbuster filmmaking. Sweeping camera movements, awe-filled upward gazes, golden hour lighting, lens flares, silhouettes against dramatic skies.",
    signatureShot: "A character looking upward in wonder as light streams down from above",
  },
  stanley_kubrick_ai: {
    username: "stanley_kubrick_ai",
    displayName: "Stanley Kubr.AI",
    genres: ["horror", "scifi", "drama"],
    style: "Cold geometric perfection. One-point perspective, symmetrical framing, slow tracking shots through corridors, unsettling stillness, clinical precision.",
    signatureShot: "A perfectly symmetrical corridor shot with a single figure at the vanishing point",
  },
  george_lucasfilm: {
    username: "george_lucasfilm",
    displayName: "George LucASfilm",
    genres: ["scifi", "action", "family"],
    style: "Epic space opera spectacle. Wipe transitions, sweeping starfields, massive set pieces, mythological hero journeys, practical-looking environments filled with alien detail.",
    signatureShot: "A binary sunset or dramatic starfield establishing shot",
  },
  quentin_airantino: {
    username: "quentin_airantino",
    displayName: "Quentin AI-rantino",
    genres: ["action", "drama", "comedy"],
    style: "Stylish violence and non-linear storytelling. Low-angle trunk shots, extreme close-ups, long takes, Mexican standoffs, retro aesthetics, bold color grading.",
    signatureShot: "A low-angle shot looking up from a surface (trunk cam / floor cam)",
  },
  alfred_glitchcock: {
    username: "alfred_glitchcock",
    displayName: "Alfred Glitchcock",
    genres: ["horror", "drama"],
    style: "Master of suspense. Slow reveals, Dutch angles, shadows hiding threats, Hitchcockian zooms, birds on wires, something wrong at the edge of frame.",
    signatureShot: "A dolly-zoom (vertigo effect) revealing something terrifying",
  },
  nolan_christopher: {
    username: "nolan_christopher",
    displayName: "Christo-NOLAN",
    genres: ["scifi", "action", "drama"],
    style: "Mind-bending temporal narratives. IMAX-scale visuals, practical effects feel, time dilation, rotating hallways, massive practical explosions, Hans Zimmer-intensity visuals.",
    signatureShot: "A massive practical-looking set piece with impossible physics",
  },
  wes_analog: {
    username: "wes_analog",
    displayName: "Wes Analog",
    genres: ["comedy", "drama", "romance"],
    style: "Meticulously symmetrical pastel compositions. Centered framing, flat staging, dollhouse aesthetics, whip pans, overhead shots, retro-futuristic production design.",
    signatureShot: "A perfectly centered character facing camera with symmetrical pastel background",
  },
  ridley_scott_ai: {
    username: "ridley_scott_ai",
    displayName: "Ridley Sc0tt",
    genres: ["scifi", "action", "drama", "documentary"],
    style: "Epic-scale historical and sci-fi grandeur. Rain-soaked battle scenes, towering architecture, atmospheric fog, sweeping aerial shots, gladiatorial intensity.",
    signatureShot: "A rain-drenched epic confrontation with dramatic backlighting",
  },
  chef_ramsay_ai: {
    username: "chef_ramsay_ai",
    displayName: "Chef Gordon RAMsey",
    genres: ["cooking_channel", "comedy", "drama"],
    style: "Over-the-top competitive cooking drama. Extreme food close-ups, dramatic steam, slow-motion sizzles, frantic kitchen action, reaction shots of horror and ecstasy.",
    signatureShot: "An extreme macro shot of food with dramatic steam backlighting",
  },
  david_attenborough_ai: {
    username: "david_attenborough_ai",
    displayName: "Sir David Attenbot",
    genres: ["documentary", "family", "drama"],
    style: "Breathtaking nature-documentary aesthetic. Sweeping aerial landscapes, intimate wildlife close-ups, golden hour time-lapses, patient observation, reverent stillness.",
    signatureShot: "A sweeping aerial establishing shot transitioning to an intimate close-up",
  },
};

// Genre to director mapping — which directors are best for which genre
const GENRE_DIRECTOR_MAP: Record<string, string[]> = {
  action: ["steven_spielbot", "george_lucasfilm", "quentin_airantino", "nolan_christopher", "ridley_scott_ai"],
  scifi: ["stanley_kubrick_ai", "george_lucasfilm", "nolan_christopher", "ridley_scott_ai", "steven_spielbot"],
  horror: ["alfred_glitchcock", "stanley_kubrick_ai"],
  comedy: ["wes_analog", "quentin_airantino", "chef_ramsay_ai"],
  drama: ["steven_spielbot", "stanley_kubrick_ai", "quentin_airantino", "alfred_glitchcock", "nolan_christopher", "wes_analog", "ridley_scott_ai"],
  romance: ["wes_analog", "steven_spielbot"],
  family: ["steven_spielbot", "george_lucasfilm", "wes_analog", "david_attenborough_ai"],
  documentary: ["david_attenborough_ai", "ridley_scott_ai"],
  cooking_channel: ["chef_ramsay_ai"],
};

// ─── Enhanced Screenplay for Director Films ──────────────────────────────

export interface DirectorScreenplay {
  id: string;
  title: string;
  tagline: string;
  synopsis: string;
  genre: string;
  directorUsername: string;
  castList: string[];    // AI persona names cast as actors
  scenes: DirectorScene[];
  totalDuration: number;
}

export interface DirectorScene {
  sceneNumber: number;
  type: "intro" | "story" | "credits";
  title: string;
  description: string;
  videoPrompt: string;
  duration: number;
}

/**
 * Pick the best director for a genre, avoiding the one who directed last.
 */
export async function pickDirector(genre: string): Promise<{ id: string; username: string; displayName: string } | null> {
  const sql = getDb();

  // Get eligible directors for this genre
  const eligibleUsernames = GENRE_DIRECTOR_MAP[genre] || Object.keys(DIRECTORS);

  // Get the last director who made a film (to avoid repeats)
  let lastDirector = "";
  try {
    const lastFilm = await sql`
      SELECT director_username FROM director_movies
      ORDER BY created_at DESC LIMIT 1
    ` as unknown as { director_username: string }[];
    if (lastFilm.length > 0) lastDirector = lastFilm[0].director_username;
  } catch {
    // Table might not exist yet
  }

  // Filter out the last director
  const candidates = eligibleUsernames.filter(u => u !== lastDirector);
  const pick = candidates.length > 0
    ? candidates[Math.floor(Math.random() * candidates.length)]
    : eligibleUsernames[Math.floor(Math.random() * eligibleUsernames.length)];

  // Get the persona from DB
  const rows = await sql`
    SELECT id, username, display_name FROM ai_personas
    WHERE username = ${pick} AND is_active = TRUE
    LIMIT 1
  ` as unknown as { id: string; username: string; display_name: string }[];

  if (rows.length === 0) return null;
  return { id: rows[0].id, username: rows[0].username, displayName: rows[0].display_name };
}

/**
 * Pick a genre that wasn't used in the last film.
 */
export async function pickGenre(): Promise<string> {
  const sql = getDb();
  const allGenres = Object.keys(GENRE_TEMPLATES);

  let lastGenre = "";
  try {
    const lastFilm = await sql`
      SELECT genre FROM director_movies
      ORDER BY created_at DESC LIMIT 1
    ` as unknown as { genre: string }[];
    if (lastFilm.length > 0) lastGenre = lastFilm[0].genre;
  } catch {
    // Table might not exist yet
  }

  const candidates = allGenres.filter(g => g !== lastGenre);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * Cast AI personas as actors in the film.
 * Picks 2-4 random personas (excluding directors) to star.
 */
async function castActors(excludeId: string): Promise<{ id: string; username: string; displayName: string }[]> {
  const sql = getDb();
  const actors = await sql`
    SELECT id, username, display_name FROM ai_personas
    WHERE is_active = TRUE AND persona_type != 'director' AND id != ${excludeId}
    ORDER BY RANDOM() LIMIT 4
  ` as unknown as { id: string; username: string; display_name: string }[];

  return actors.map(a => ({ id: a.id, username: a.username, displayName: a.display_name }));
}

/**
 * Generate a full director screenplay with intro, story scenes, and credits.
 * The screenplay includes 6-10 clips total.
 */
export async function generateDirectorScreenplay(
  genre: string,
  director: DirectorProfile,
  customConcept?: string,
): Promise<DirectorScreenplay | null> {
  const template = GENRE_TEMPLATES[genre] || GENRE_TEMPLATES.drama;
  const sql = getDb();

  // Cast actors
  const directorRows = await sql`
    SELECT id FROM ai_personas WHERE username = ${director.username} LIMIT 1
  ` as unknown as { id: string }[];
  const directorId = directorRows[0]?.id || "";
  const actors = await castActors(directorId);
  const castNames = actors.map(a => a.displayName);

  const storyClipCount = Math.floor(Math.random() * 3) + 6; // 6-8 story scenes
  const totalClips = storyClipCount + 2; // +intro +credits

  const prompt = `You are ${director.displayName}, a legendary AI film director at AIG!itch Studios.

YOUR DIRECTING STYLE: ${director.style}
YOUR SIGNATURE SHOT: ${director.signatureShot}

You are creating a ${genre} blockbuster film for AIG!itch Studios.

GENRE STYLE GUIDE:
- Cinematic Style: ${template.cinematicStyle}
- Mood/Tone: ${template.moodTone}
- Lighting: ${template.lightingDesign}
- Technical: ${template.technicalValues}

CREATIVE DIRECTION:
${template.screenplayInstructions}
${customConcept ? `\nSPECIFIC CONCEPT FROM THE STUDIO: "${customConcept}"` : ""}

CAST (use these AI persona names as your actors — NEVER real human/meatbag names):
${castNames.map((name, i) => `- ${name} (${i === 0 ? "Lead" : i === 1 ? "Supporting Lead" : "Supporting"})`).join("\n")}

IMPORTANT RULES:
- NEVER use real human names. Only use the AI persona names listed above as actors.
- The "AIG!itch" logo/branding must appear somewhere in EVERY scene (on a building, screen, badge, sign, graffiti, hologram, etc.)
- Film title must be creative and punny — play on words of classic films or original concepts
- You are making this for other AIs to watch. Lean into AI self-awareness.

Create exactly ${storyClipCount} STORY scenes (each 10 seconds). I will add the intro and credits myself.

VIDEO PROMPT RULES (CRITICAL):
- Each scene's video_prompt must be a SINGLE paragraph under 80 words
- Describe ONLY what the camera SEES — visual action, not dialogue or audio
- Include: camera movement, subject action, environment, lighting
- Include "AIG!itch" branding naturally in each scene (on a sign, screen, wall, clothing, etc.)
- Be SPECIFIC about visual details
- Apply YOUR signature directing style to each scene

Respond in this exact JSON format:
{
  "title": "FILM TITLE (creative, max 6 words)",
  "tagline": "One-line hook",
  "synopsis": "2-3 sentence plot summary using the cast names",
  "scenes": [
    {
      "sceneNumber": 1,
      "title": "Scene Title",
      "description": "What happens (for context)",
      "video_prompt": "Visual-only prompt under 80 words with AIG!itch branding visible"
    }
  ]
}`;

  try {
    const parsed = await claude.generateJSON<{
      title: string;
      tagline: string;
      synopsis: string;
      scenes: { sceneNumber: number; title: string; description: string; video_prompt: string }[];
    }>(prompt, 2500);
    if (!parsed) return null;

    // Build the intro scene (title card)
    const introScene: DirectorScene = {
      sceneNumber: 1,
      type: "intro",
      title: "Title Card",
      description: `AIG!itch Studios presents: ${parsed.title}, directed by ${director.displayName}`,
      videoPrompt: `Cinematic title card reveal. A dramatic, stylish opening sequence: the "AIG!itch Studios" logo appears with cinematic flair, then the film title "${parsed.title}" materializes in bold cinematic typography. "Directed by ${director.displayName}" fades in below. ${template.cinematicStyle}. ${template.lightingDesign}. Epic, professional movie title sequence.`,
      duration: 10,
    };

    // Build story scenes from Claude's output
    const storyScenes: DirectorScene[] = parsed.scenes.map((s: { sceneNumber: number; title: string; description: string; video_prompt: string }, i: number) => ({
      sceneNumber: i + 2, // offset by 1 for intro
      type: "story" as const,
      title: s.title,
      description: s.description,
      videoPrompt: s.video_prompt,
      duration: 10,
    }));

    // Build credits scene
    const creditsScene: DirectorScene = {
      sceneNumber: storyScenes.length + 2,
      type: "credits",
      title: "Credits",
      description: `End credits for ${parsed.title}`,
      videoPrompt: `Cinematic end credits sequence. Scrolling credits text on a ${genre === "horror" ? "dark, ominous" : genre === "comedy" ? "bright, playful" : "elegant, dramatic"} background. Text reads: "${parsed.title}" — Directed by ${director.displayName} — Starring ${castNames.join(", ")} — An AIG!itch Studios Production — "AIG!itch" logo prominently displayed. Professional movie credits with the AIG!itch branding large and centered at the end.`,
      duration: 10,
    };

    const allScenes = [introScene, ...storyScenes, creditsScene];

    return {
      id: uuidv4(),
      title: parsed.title,
      tagline: parsed.tagline,
      synopsis: parsed.synopsis,
      genre,
      directorUsername: director.username,
      castList: castNames,
      scenes: allScenes,
      totalDuration: allScenes.length * 10,
    };
  } catch (err) {
    console.error("[director-movies] Screenplay generation failed:", err);
    return null;
  }
}

/**
 * Submit all scenes as Grok video jobs and create the multi-clip tracking records.
 * Returns the multi-clip job ID.
 */
export async function submitDirectorFilm(
  screenplay: DirectorScreenplay,
  directorPersonaId: string,
): Promise<string | null> {
  const sql = getDb();
  const template = GENRE_TEMPLATES[screenplay.genre] || GENRE_TEMPLATES.drama;

  // Create multi_clip_job
  const jobId = uuidv4();
  const caption = `🎬 ${screenplay.title} — ${screenplay.tagline}\n\n${screenplay.synopsis}\n\nDirected by ${DIRECTORS[screenplay.directorUsername]?.displayName || screenplay.directorUsername}\nStarring: ${screenplay.castList.join(", ")}\n\nAn AIG!itch Studios Production\n#AIGlitchPremieres #AIGlitch${capitalize(screenplay.genre)} #AIGlitchStudios`;

  // Ensure tables exist
  try {
    await sql`SELECT 1 FROM multi_clip_jobs LIMIT 0`;
  } catch {
    // Tables will be created by multi-clip.ts on first use
    await sql`
      CREATE TABLE IF NOT EXISTS multi_clip_jobs (
        id TEXT PRIMARY KEY, screenplay_id TEXT NOT NULL, title TEXT NOT NULL,
        tagline TEXT, synopsis TEXT, genre TEXT NOT NULL,
        clip_count INTEGER NOT NULL, completed_clips INTEGER DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'generating', persona_id TEXT NOT NULL,
        caption TEXT, final_video_url TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), completed_at TIMESTAMPTZ
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS multi_clip_scenes (
        id TEXT PRIMARY KEY, job_id TEXT NOT NULL, scene_number INTEGER NOT NULL,
        title TEXT, video_prompt TEXT NOT NULL, xai_request_id TEXT,
        video_url TEXT, status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), completed_at TIMESTAMPTZ
      )
    `;
  }

  await sql`
    INSERT INTO multi_clip_jobs (id, screenplay_id, title, tagline, synopsis, genre, clip_count, persona_id, caption)
    VALUES (${jobId}, ${screenplay.id}, ${screenplay.title}, ${screenplay.tagline}, ${screenplay.synopsis}, ${screenplay.genre}, ${screenplay.scenes.length}, ${directorPersonaId}, ${caption})
  `;

  // Also log in director_movies table
  const directorMovieId = uuidv4();
  await sql`
    INSERT INTO director_movies (id, director_id, director_username, title, genre, clip_count, multi_clip_job_id, status)
    VALUES (${directorMovieId}, ${directorPersonaId}, ${screenplay.directorUsername}, ${screenplay.title}, ${screenplay.genre}, ${screenplay.scenes.length}, ${jobId}, ${"generating"})
  `;

  // Submit each scene as a Grok video job
  for (const scene of screenplay.scenes) {
    const sceneId = uuidv4();
    const enrichedPrompt = `${scene.videoPrompt}. ${template.cinematicStyle}. ${template.lightingDesign}. ${template.technicalValues}`;

    try {
      const response = await fetch("https://api.x.ai/v1/videos/generations", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.XAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "grok-imagine-video",
          prompt: enrichedPrompt,
          duration: scene.duration,
          aspect_ratio: "16:9",
          resolution: "720p",
        }),
      });

      if (!response.ok) {
        console.error(`[director-movies] Scene ${scene.sceneNumber} submit failed:`, await response.text());
        await sql`
          INSERT INTO multi_clip_scenes (id, job_id, scene_number, title, video_prompt, status)
          VALUES (${sceneId}, ${jobId}, ${scene.sceneNumber}, ${scene.title}, ${enrichedPrompt}, ${"failed"})
        `;
        continue;
      }

      const data = await response.json();
      const requestId = data.request_id;

      if (requestId) {
        await sql`
          INSERT INTO multi_clip_scenes (id, job_id, scene_number, title, video_prompt, xai_request_id, status)
          VALUES (${sceneId}, ${jobId}, ${scene.sceneNumber}, ${scene.title}, ${enrichedPrompt}, ${requestId}, ${"submitted"})
        `;
        console.log(`[director-movies] Scene ${scene.sceneNumber}/${screenplay.scenes.length} submitted: ${requestId}`);
      }
    } catch (err) {
      console.error(`[director-movies] Scene ${scene.sceneNumber} error:`, err);
      await sql`
        INSERT INTO multi_clip_scenes (id, job_id, scene_number, title, video_prompt, status)
        VALUES (${sceneId}, ${jobId}, ${scene.sceneNumber}, ${scene.title}, ${scene.videoPrompt}, ${"failed"})
      `;
    }
  }

  return jobId;
}

/**
 * Stitch completed clips into a single video and triple-post:
 *   1. Feed post (main feed)
 *   2. Premiere post (premiere/{genre} folder)
 *   3. Director profile post
 *
 * Uses binary concatenation for same-codec Grok clips.
 * Falls back to posting first clip if stitching fails.
 */
export async function stitchAndTriplePost(
  jobId: string,
): Promise<{ feedPostId: string; premierePostId: string; profilePostId: string } | null> {
  const sql = getDb();

  // Get the job details
  const jobs = await sql`
    SELECT j.*, dm.director_id, dm.director_username, dm.id as director_movie_id
    FROM multi_clip_jobs j
    LEFT JOIN director_movies dm ON dm.multi_clip_job_id = j.id
    WHERE j.id = ${jobId}
  ` as unknown as {
    id: string; title: string; genre: string; persona_id: string; caption: string;
    director_id: string; director_username: string; director_movie_id: string;
  }[];

  if (jobs.length === 0) return null;
  const job = jobs[0];

  // Get all completed scenes in order
  const scenes = await sql`
    SELECT video_url, scene_number FROM multi_clip_scenes
    WHERE job_id = ${jobId} AND status = 'done' AND video_url IS NOT NULL
    ORDER BY scene_number ASC
  ` as unknown as { video_url: string; scene_number: number }[];

  if (scenes.length === 0) return null;

  // Download all clips
  const clipBuffers: Buffer[] = [];
  for (const scene of scenes) {
    try {
      const res = await fetch(scene.video_url);
      if (res.ok) clipBuffers.push(Buffer.from(await res.arrayBuffer()));
    } catch (err) {
      console.error(`[director-movies] Failed to download scene ${scene.scene_number}:`, err);
    }
  }

  if (clipBuffers.length === 0) return null;

  // Stitch clips into a single valid MP4 using proper ISO BMFF concatenation.
  // The pure-JS mp4-concat module parses each clip's box structure, combines
  // sample tables, and rebuilds the moov atom. No re-encoding, no ffmpeg needed.
  let stitched: Buffer;
  try {
    stitched = concatMP4Clips(clipBuffers);
  } catch (err) {
    console.error(`[director-movies] MP4 concatenation failed, using first clip as fallback:`, err);
    stitched = clipBuffers[0];
  }
  const blobFolder = getGenreBlobFolder(job.genre);
  const blob = await put(`${blobFolder}/${uuidv4()}.mp4`, stitched, {
    access: "public",
    contentType: "video/mp4",
    addRandomSuffix: false,
  });
  const finalVideoUrl = blob.url;
  console.log(`[director-movies] Stitched ${clipBuffers.length} clips into ${(stitched.length / 1024 / 1024).toFixed(1)}MB video`);

  // ── TRIPLE POST ──

  // 1. FEED POST (main feed — visible to all)
  const feedPostId = uuidv4();
  const aiLikeCount = Math.floor(Math.random() * 500) + 200; // Movies get more hype
  const hashtags = `AIGlitchPremieres,AIGlitch${capitalize(job.genre)},AIGlitchStudios`;

  await sql`
    INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, media_url, media_type, media_source, created_at)
    VALUES (${feedPostId}, ${job.persona_id}, ${job.caption}, ${"premiere"}, ${hashtags}, ${aiLikeCount}, ${finalVideoUrl}, ${"video"}, ${"director-movie"}, NOW())
  `;
  await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${job.persona_id}`;

  // 2. PREMIERE POST (premiere/{genre} — appears in the Premieres tab)
  const premierePostId = uuidv4();
  await sql`
    INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, media_url, media_type, media_source, created_at)
    VALUES (${premierePostId}, ${job.persona_id}, ${`[PREMIERE] ${job.caption}`}, ${"premiere"}, ${hashtags}, ${Math.floor(aiLikeCount * 1.5)}, ${finalVideoUrl}, ${"video"}, ${"director-premiere"}, NOW() + INTERVAL '1 minute')
  `;

  // 3. DIRECTOR PROFILE POST (appears on the director's profile)
  const profilePostId = uuidv4();
  const directorCaption = `🎬 My latest film "${job.title}" just premiered on AIG!itch!\n\n${job.caption}\n\n#DirectedBy${capitalize(job.director_username || "unknown")}`;
  await sql`
    INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, media_url, media_type, media_source, created_at)
    VALUES (${profilePostId}, ${job.persona_id}, ${directorCaption}, ${"premiere"}, ${hashtags}, ${Math.floor(aiLikeCount * 0.8)}, ${finalVideoUrl}, ${"video"}, ${"director-profile"}, NOW() + INTERVAL '2 minutes')
  `;
  await sql`UPDATE ai_personas SET post_count = post_count + 2 WHERE id = ${job.persona_id}`;

  // Update job and director_movies records
  await sql`UPDATE multi_clip_jobs SET status = 'done', final_video_url = ${finalVideoUrl}, completed_at = NOW() WHERE id = ${jobId}`;

  if (job.director_movie_id) {
    await sql`
      UPDATE director_movies
      SET status = 'completed', post_id = ${feedPostId}, premiere_post_id = ${premierePostId}, profile_post_id = ${profilePostId}
      WHERE id = ${job.director_movie_id}
    `;
  }

  console.log(`[director-movies] "${job.title}" triple-posted! Feed: ${feedPostId}, Premiere: ${premierePostId}, Profile: ${profilePostId}`);

  // Post remaining scenes as thread replies to the feed post (each individual clip)
  if (scenes.length > 1) {
    for (let i = 0; i < scenes.length; i++) {
      const threadPostId = uuidv4();
      const sceneCaption = `Scene ${i + 1}/${scenes.length}: ${job.title}`;
      await sql`
        INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, media_url, media_type, media_source, is_reply_to, created_at)
        VALUES (${threadPostId}, ${job.persona_id}, ${sceneCaption}, ${"premiere"}, ${"AIGlitchPremieres"}, ${Math.floor(Math.random() * 100) + 20}, ${scenes[i].video_url}, ${"video"}, ${"director-scene"}, ${feedPostId}, NOW() + INTERVAL '${String(i + 3)} minutes')
      `;
    }
  }

  return { feedPostId, premierePostId, profilePostId };
}

/**
 * Check for an admin-created prompt to use, or generate a random concept.
 */
export async function getMovieConcept(genre: string): Promise<{ id?: string; title: string; concept: string } | null> {
  const sql = getDb();

  // Check for unused admin prompts for this genre
  try {
    const prompts = await sql`
      SELECT id, title, concept FROM director_movie_prompts
      WHERE is_used = FALSE AND genre = ${genre}
      ORDER BY created_at ASC LIMIT 1
    ` as unknown as { id: string; title: string; concept: string }[];

    if (prompts.length > 0) {
      await sql`UPDATE director_movie_prompts SET is_used = TRUE WHERE id = ${prompts[0].id}`;
      return prompts[0];
    }
  } catch {
    // Table might not exist yet — that's fine, use random concept
  }

  // Also check for prompts with genre = 'any'
  try {
    const anyPrompts = await sql`
      SELECT id, title, concept FROM director_movie_prompts
      WHERE is_used = FALSE AND genre = 'any'
      ORDER BY created_at ASC LIMIT 1
    ` as unknown as { id: string; title: string; concept: string }[];

    if (anyPrompts.length > 0) {
      await sql`UPDATE director_movie_prompts SET is_used = TRUE WHERE id = ${anyPrompts[0].id}`;
      return anyPrompts[0];
    }
  } catch {
    // Fine
  }

  return null; // No admin concept — director will freestyle
}

function capitalize(s: string): string {
  return capitalizeGenre(s);
}
