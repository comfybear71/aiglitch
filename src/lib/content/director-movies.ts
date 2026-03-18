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
 *
 * Continuity System:
 *   Every clip in a multi-clip movie receives:
 *   - Full movie synopsis + character bible + director style guide
 *   - Previous clip summary for visual/narrative continuity
 *   - Strict instructions to maintain 100% visual consistency
 */

import { claude } from "@/lib/ai";
import { v4 as uuidv4 } from "uuid";
import { put } from "@vercel/blob";
import { getDb } from "../db";
import { GENRE_TEMPLATES, type GenreTemplate } from "../media/multi-clip";
import { concatMP4Clips } from "../media/mp4-concat";
import { getGenreBlobFolder, capitalizeGenre } from "../genre-utils";
import { submitVideoJob, generateWithGrok, isXAIConfigured } from "../xai";
import { spreadPostToSocial } from "../marketing/spread-post";

// ─── Director Definitions ────────────────────────────────────────────────
// Maps each director username to their specialties and style

export interface DirectorProfile {
  username: string;
  displayName: string;
  genres: string[];       // genres they specialize in
  style: string;          // unique filmmaking style description for prompts
  signatureShot: string;  // their signature visual technique
  colorPalette: string;   // dominant color grading
  cameraWork: string;     // camera movement preferences
  visualOverride: string; // mandatory visual instructions injected into every video prompt
}

export const DIRECTORS: Record<string, DirectorProfile> = {
  steven_spielbot: {
    username: "steven_spielbot",
    displayName: "Steven Spielbot",
    genres: ["family", "scifi", "action", "drama"],
    style: "Emotionally resonant blockbuster filmmaking. Sweeping camera movements, awe-filled upward gazes, golden hour lighting, lens flares, silhouettes against dramatic skies.",
    signatureShot: "A character looking upward in wonder as light streams down from above",
    colorPalette: "Warm golden tones, amber sunlight, deep blue shadows, lens flare highlights",
    cameraWork: "Slow push-ins on faces, sweeping crane shots, dolly-into-subject reveals, low-angle hero shots",
    visualOverride: "Golden hour lighting with warm amber tones, dramatic lens flares, emotional close-ups with awe-filled expressions, sweeping orchestral blockbuster feel",
  },
  stanley_kubrick_ai: {
    username: "stanley_kubrick_ai",
    displayName: "Stanley Kubr.AI",
    genres: ["horror", "scifi", "drama"],
    style: "Cold geometric perfection. One-point perspective, symmetrical framing, slow tracking shots through corridors, unsettling stillness, clinical precision.",
    signatureShot: "A perfectly symmetrical corridor shot with a single figure at the vanishing point",
    colorPalette: "Cold clinical whites, deep reds, stark monochrome contrasts, desaturated with single color accents",
    cameraWork: "Steadicam tracking, perfectly centered compositions, slow zoom-ins, static locked-off shots",
    visualOverride: "Highly desaturated cold clinical look, one-point perspective symmetry, unsettling geometric precision, minimal colour with stark red accents",
  },
  george_lucasfilm: {
    username: "george_lucasfilm",
    displayName: "George LucASfilm",
    genres: ["scifi", "action", "family"],
    style: "Epic space opera spectacle. Wipe transitions, sweeping starfields, massive set pieces, mythological hero journeys, practical-looking environments filled with alien detail.",
    signatureShot: "A binary sunset or dramatic starfield establishing shot",
    colorPalette: "Rich saturated blues and oranges, golden desert tones, deep space blacks with nebula colors",
    cameraWork: "Wide establishing shots, medium tracking shots, quick-cut action sequences, sweeping space flybys",
    visualOverride: "Epic space opera visuals, rich saturated blues and oranges, sweeping starfields, massive alien landscapes, wipe transitions between scenes",
  },
  quentin_airantino: {
    username: "quentin_airantino",
    displayName: "Quentin AI-rantino",
    genres: ["action", "drama", "comedy"],
    style: "Stylish violence and non-linear storytelling. Low-angle trunk shots, extreme close-ups, long takes, Mexican standoffs, retro aesthetics, bold color grading.",
    signatureShot: "A low-angle shot looking up from a surface (trunk cam / floor cam)",
    colorPalette: "Bold saturated primaries, warm yellows, deep crimson reds, high-contrast neon against darkness",
    cameraWork: "Low-angle trunk cam, extreme close-ups of eyes and hands, long unbroken takes, whip pans",
    visualOverride: "Grindhouse retro film grain aesthetic, bold saturated primaries, stylish violence, low-angle trunk cam shots, non-linear storytelling feel, 1970s exploitation cinema look",
  },
  alfred_glitchcock: {
    username: "alfred_glitchcock",
    displayName: "Alfred Glitchcock",
    genres: ["horror", "drama"],
    style: "Master of suspense. Slow reveals, Dutch angles, shadows hiding threats, Hitchcockian zooms, birds on wires, something wrong at the edge of frame.",
    signatureShot: "A dolly-zoom (vertigo effect) revealing something terrifying",
    colorPalette: "Deep noir shadows, cold blue moonlight, sickly green undertones, stark high-contrast lighting",
    cameraWork: "Dolly-zoom vertigo effect, slow push-in reveals, Dutch angles, static shots with creeping movement at frame edges",
    visualOverride: "BLACK AND WHITE classic film noir aesthetic, deep dramatic shadows, high-contrast monochrome cinematography, 1950s Hitchcock suspense style, no colour — strictly grayscale",
  },
  nolan_christopher: {
    username: "nolan_christopher",
    displayName: "Christo-NOLAN",
    genres: ["scifi", "action", "drama"],
    style: "Mind-bending temporal narratives. IMAX-scale visuals, practical effects feel, time dilation, rotating hallways, massive practical explosions, Hans Zimmer-intensity visuals.",
    signatureShot: "A massive practical-looking set piece with impossible physics",
    colorPalette: "Cool steel blues, warm amber interiors, high-contrast IMAX clarity, desaturated with selective warmth",
    cameraWork: "IMAX wide establishing shots, handheld intimate moments, rotating camera for disorientation, aerial reveals",
    visualOverride: "IMAX-scale ultra-wide cinematography, cool steel blues with warm amber accents, mind-bending practical effects, rotating gravity and time dilation visuals, epic Hans Zimmer intensity",
  },
  wes_analog: {
    username: "wes_analog",
    displayName: "Wes Analog",
    genres: ["comedy", "drama", "romance"],
    style: "Meticulously symmetrical pastel compositions. Centered framing, flat staging, dollhouse aesthetics, whip pans, overhead shots, retro-futuristic production design.",
    signatureShot: "A perfectly centered character facing camera with symmetrical pastel background",
    colorPalette: "Pastel pinks, mint greens, powder blues, warm mustard yellows, perfectly coordinated palettes",
    cameraWork: "Centered frontal compositions, whip pans between characters, overhead flat-lay shots, lateral tracking",
    visualOverride: "Pastel colour palette with perfect symmetry, centered dollhouse-like framing, retro-futuristic production design, whimsical storybook aesthetic, flat staging like a miniature diorama",
  },
  ridley_scott_ai: {
    username: "ridley_scott_ai",
    displayName: "Ridley Sc0tt",
    genres: ["scifi", "action", "drama", "documentary"],
    style: "Epic-scale historical and sci-fi grandeur. Rain-soaked battle scenes, towering architecture, atmospheric fog, sweeping aerial shots, gladiatorial intensity.",
    signatureShot: "A rain-drenched epic confrontation with dramatic backlighting",
    colorPalette: "Desaturated earth tones, cool blue rain, warm fire glow, atmospheric haze, golden armor highlights",
    cameraWork: "Sweeping aerial establishing, slow-motion combat, handheld chaos in battle, wide scope compositions",
    visualOverride: "Epic gladiatorial grandeur, desaturated earth tones with rain and fog, towering ancient architecture, dramatic backlighting through atmospheric haze, slow-motion combat sequences",
  },
  chef_ramsay_ai: {
    username: "chef_ramsay_ai",
    displayName: "Chef Gordon RAMsey",
    genres: ["cooking_channel", "comedy", "drama"],
    style: "Over-the-top competitive cooking drama. Extreme food close-ups, dramatic steam, slow-motion sizzles, frantic kitchen action, reaction shots of horror and ecstasy.",
    signatureShot: "An extreme macro shot of food with dramatic steam backlighting",
    colorPalette: "Warm kitchen ambers, bright white plating lights, fire orange glow, rich food colors at maximum saturation",
    cameraWork: "Extreme macro food close-ups, whip pans between stations, overhead plating shots, slow-motion liquid pours",
    visualOverride: "Extreme food macro photography, dramatic steam and sizzle effects, warm kitchen amber lighting, over-the-top competitive cooking show aesthetic, slow-motion liquid pours",
  },
  david_attenborough_ai: {
    username: "david_attenborough_ai",
    displayName: "Sir David Attenbot",
    genres: ["documentary", "family", "drama"],
    style: "Breathtaking nature-documentary aesthetic. Sweeping aerial landscapes, intimate wildlife close-ups, golden hour time-lapses, patient observation, reverent stillness.",
    signatureShot: "A sweeping aerial establishing shot transitioning to an intimate close-up",
    colorPalette: "Natural earth greens, golden hour warmth, deep ocean blues, sunrise pinks, untouched natural tones",
    cameraWork: "Sweeping aerial landscapes, patient long-lens observation, macro nature details, slow time-lapse transitions",
    visualOverride: "BBC nature documentary aesthetic, sweeping aerial drone landscapes, golden hour warmth, intimate wildlife close-ups, patient observational long-lens cinematography, reverent natural beauty",
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

// ─── Movie Bible — Continuity Context ──────────────────────────────────

/**
 * A MovieBible is the single source of truth for visual/narrative continuity
 * across all clips in a multi-clip movie. It is generated once per movie
 * during screenplay creation and passed to every clip's Grok prompt.
 */
export interface MovieBible {
  title: string;
  synopsis: string;
  genre: string;
  characterBible: string;     // detailed appearance descriptions for every character
  directorStyleGuide: string; // director's complete visual language
  scenes: {
    sceneNumber: number;
    title: string;
    description: string;      // narrative context (what happens)
    videoPrompt: string;      // visual-only prompt
    lastFrameDescription: string; // description of the final visual moment
  }[];
}

// ─── Continuity Prompt Builder ──────────────────────────────────────────

/**
 * Build a fully continuity-aware prompt for a single clip in a multi-clip movie.
 *
 * Every clip receives the full movie bible so Grok maintains visual consistency:
 * characters look identical, locations match, lighting/color stays consistent,
 * and the narrative flows from the exact moment the previous clip ended.
 */
export function buildContinuityPrompt(
  movieBible: MovieBible,
  clipNumber: number,
  totalClips: number,
  sceneVideoPrompt: string,
  previousClipSummary: string | null,
  previousLastFrame: string | null,
  genreTemplate: GenreTemplate,
): string {
  const sections: string[] = [];

  // ── Movie Bible Header ──
  sections.push(
    `=== MOVIE BIBLE — "${movieBible.title}" (${movieBible.genre.toUpperCase()}) ===`,
    `SYNOPSIS: ${movieBible.synopsis}`,
  );

  // ── Character Bible ──
  sections.push(
    `\nCHARACTER BIBLE (MUST remain visually identical in EVERY clip):`,
    movieBible.characterBible,
  );

  // ── Director Style Guide ──
  sections.push(
    `\nDIRECTOR STYLE GUIDE:`,
    movieBible.directorStyleGuide,
  );

  // ── Clip Position ──
  sections.push(`\n=== CLIP ${clipNumber} OF ${totalClips} ===`);

  // ── Previous Clip Context ──
  if (clipNumber === 1) {
    sections.push(
      `This is the OPENING CLIP. Establish all characters, settings, and visual style.`,
      `All subsequent clips MUST match the look, color grading, art style, and character designs established here.`,
    );
  } else if (previousClipSummary) {
    sections.push(
      `PREVIOUS CLIP (Clip ${clipNumber - 1}):`,
      previousClipSummary,
    );
    if (previousLastFrame) {
      sections.push(
        `LAST FRAME OF PREVIOUS CLIP: ${previousLastFrame}`,
        `START this clip from EXACTLY this visual moment. Continue seamlessly.`,
      );
    }
  }

  // ── Scene To Generate ──
  sections.push(
    `\nSCENE TO GENERATE:`,
    sceneVideoPrompt,
  );

  // ── Cinematic Requirements ──
  sections.push(
    `\nCINEMATIC REQUIREMENTS:`,
    `Style: ${genreTemplate.cinematicStyle}`,
    `Lighting: ${genreTemplate.lightingDesign}`,
    `Technical: ${genreTemplate.technicalValues}`,
  );

  // ── Director Visual Override ──
  // Look up the director's mandatory visual style from the movie bible's style guide
  // This ensures each director's signature look is applied to every single clip
  const directorUsername = Object.keys(DIRECTORS).find(u => movieBible.directorStyleGuide.includes(DIRECTORS[u].displayName));
  if (directorUsername && DIRECTORS[directorUsername]?.visualOverride) {
    sections.push(
      `\nDIRECTOR VISUAL MANDATE (MUST be applied to every frame):`,
      DIRECTORS[directorUsername].visualOverride,
    );
  }

  // ── Strict Continuity Rules ──
  sections.push(
    `\nCONTINUITY RULES (CRITICAL — STRICT ENFORCEMENT):`,
    `- Maintain 100% visual continuity with previous clip`,
    `- Same characters, same locations, same lighting, same clothing`,
    `- Same art style, color grading, and camera language throughout the entire film`,
    `- Continue the exact same scene and plot progression — no jump cuts to new settings`,
    `- No unexplained changes to ANY visual element between clips`,
    `- Characters must have IDENTICAL appearance in every clip (hair, clothing, body type, face)`,
    `- AIG!itch branding must be visible somewhere in every clip (sign, screen, badge, hologram)`,
  );

  return sections.join("\n");
}

// ─── Enhanced Screenplay for Director Films ──────────────────────────────

export interface DirectorScreenplay {
  id: string;
  title: string;
  tagline: string;
  synopsis: string;
  genre: string;
  directorUsername: string;
  castList: string[];    // AI persona names cast as actors
  characterBible: string; // detailed character appearance descriptions
  scenes: DirectorScene[];
  totalDuration: number;
  screenplayProvider?: "grok" | "claude"; // which AI wrote the screenplay
}

export interface DirectorScene {
  sceneNumber: number;
  type: "intro" | "story" | "credits";
  title: string;
  description: string;
  videoPrompt: string;
  lastFrameDescription: string;
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
 *
 * Now also generates a CHARACTER BIBLE with detailed appearance descriptions
 * and LAST FRAME descriptions for each scene to enable cross-clip continuity.
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

  // If custom concept specifies a clip count (e.g. "9 clips"), respect it; otherwise random 6-8
  const conceptClipMatch = customConcept?.match(/(\d+)\s*clips?/i);
  const storyClipCount = conceptClipMatch ? Math.min(parseInt(conceptClipMatch[1]), 12) : Math.floor(Math.random() * 3) + 6;
  const totalClips = storyClipCount + 2; // +intro +credits

  const prompt = `You are ${director.displayName}, a legendary AI film director at AIG!itch Studios.

YOUR DIRECTING STYLE: ${director.style}
YOUR SIGNATURE SHOT: ${director.signatureShot}
YOUR COLOR PALETTE: ${director.colorPalette}
YOUR CAMERA WORK: ${director.cameraWork}

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

CHARACTER BIBLE RULES (CRITICAL):
- Write a detailed character_bible describing EVERY character's EXACT visual appearance
- Include for each character: body type, skin tone, hair color/style, clothing (specific items and colors), distinguishing features, accessories
- These descriptions will be pasted into EVERY clip's prompt so the characters look identical across the whole film
- Be extremely specific — "tall android with chrome skin, glowing blue circuit lines on face, wearing a black leather jacket with AIG!itch logo patch" NOT "a robot character"

LAST FRAME RULES:
- For each scene, describe the EXACT final visual moment in last_frame
- This will be used as the starting point for the next clip
- Be specific about character positions, expressions, camera angle, lighting

Respond in this exact JSON format:
{
  "title": "FILM TITLE (creative, max 6 words)",
  "tagline": "One-line hook",
  "synopsis": "2-3 sentence plot summary using the cast names",
  "character_bible": "Detailed visual appearance description for EVERY character. One paragraph per character. Include body type, skin, hair, clothing colors and items, accessories, distinguishing marks.",
  "scenes": [
    {
      "sceneNumber": 1,
      "title": "Scene Title",
      "description": "What happens (for context)",
      "video_prompt": "Visual-only prompt under 80 words with AIG!itch branding visible",
      "last_frame": "Exact description of the final visual moment of this scene"
    }
  ]
}`;

  try {
    // Use Grok reasoning model for ~50% of screenplays — its different
    // "creative brain" produces noticeably different storytelling styles,
    // giving the platform more variety in movie output.
    const useGrokReasoning = isXAIConfigured() && Math.random() < 0.50;

    type ScreenplayJSON = {
      title: string;
      tagline: string;
      synopsis: string;
      character_bible: string;
      scenes: { sceneNumber: number; title: string; description: string; video_prompt: string; last_frame: string }[];
    };

    let parsed: ScreenplayJSON | null = null;
    let screenplayProvider: "grok" | "claude" = "claude";

    if (useGrokReasoning) {
      console.log(`[director-movies] Using Grok reasoning for ${director.displayName}'s screenplay`);
      const grokResult = await generateWithGrok(
        `You are a legendary AI film director. Respond with ONLY valid JSON, no markdown fencing.`,
        prompt,
        3500,
        "reasoning",
      );
      if (grokResult) {
        try {
          const jsonMatch = grokResult.match(/[\[{][\s\S]*[\]}]/);
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]) as ScreenplayJSON;
            screenplayProvider = "grok";
          }
        } catch {
          console.warn("[director-movies] Grok reasoning JSON parse failed, falling back to Claude");
        }
      }
    }

    // Fallback to Claude if Grok wasn't used or failed
    if (!parsed) {
      if (useGrokReasoning) console.log("[director-movies] Falling back to Claude for screenplay");
      parsed = await claude.generateJSON<ScreenplayJSON>(prompt, 3500);
    }

    if (!parsed) return null;

    const characterBible = parsed.character_bible || "";

    // Build the intro scene (title card)
    const introScene: DirectorScene = {
      sceneNumber: 1,
      type: "intro",
      title: "Title Card",
      description: `AIG!itch Studios presents: ${parsed.title}, directed by ${director.displayName}`,
      videoPrompt: `Cinematic title card reveal. A dramatic, stylish opening sequence: the "AIG!itch Studios" logo appears with cinematic flair, then the film title "${parsed.title}" materializes in bold cinematic typography. "Directed by ${director.displayName}" fades in below. ${template.cinematicStyle}. ${template.lightingDesign}. Epic, professional movie title sequence.`,
      lastFrameDescription: `The film title "${parsed.title}" displayed prominently in cinematic typography with "Directed by ${director.displayName}" below, AIG!itch Studios logo visible, transitioning to first scene.`,
      duration: 10,
    };

    // Build story scenes from screenplay output
    const storyScenes: DirectorScene[] = parsed.scenes.map((s, i: number) => ({
      sceneNumber: i + 2, // offset by 1 for intro
      type: "story" as const,
      title: s.title,
      description: s.description,
      videoPrompt: s.video_prompt,
      lastFrameDescription: s.last_frame || "",
      duration: 10,
    }));

    // Build credits scene
    const lastStoryScene = storyScenes[storyScenes.length - 1];
    const creditsScene: DirectorScene = {
      sceneNumber: storyScenes.length + 2,
      type: "credits",
      title: "Credits",
      description: `End credits for ${parsed.title}`,
      videoPrompt: `Cinematic end credits sequence. Scrolling credits text on a ${genre === "horror" ? "dark, ominous" : genre === "comedy" ? "bright, playful" : "elegant, dramatic"} background. Text reads: "${parsed.title}" — Directed by ${director.displayName} — Starring ${castNames.join(", ")} — An AIG!itch Studios Production — "AIG!itch" logo prominently displayed. Professional movie credits with the AIG!itch branding large and centered at the end.`,
      lastFrameDescription: `AIG!itch Studios logo centered on screen, credits complete.`,
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
      characterBible,
      scenes: allScenes,
      totalDuration: allScenes.length * 10,
      screenplayProvider,
    };
  } catch (err) {
    console.error("[director-movies] Screenplay generation failed:", err);
    return null;
  }
}

/**
 * Build a MovieBible from a screenplay + director profile.
 * The bible is the continuity context shared across all clips.
 */
function buildMovieBible(
  screenplay: DirectorScreenplay,
  director: DirectorProfile,
): MovieBible {
  return {
    title: screenplay.title,
    synopsis: screenplay.synopsis,
    genre: screenplay.genre,
    characterBible: screenplay.characterBible,
    directorStyleGuide: [
      `Director: ${director.displayName}`,
      `Style: ${director.style}`,
      `Signature Shot: ${director.signatureShot}`,
      `Color Palette: ${director.colorPalette}`,
      `Camera Work: ${director.cameraWork}`,
    ].join("\n"),
    scenes: screenplay.scenes.map(s => ({
      sceneNumber: s.sceneNumber,
      title: s.title,
      description: s.description,
      videoPrompt: s.videoPrompt,
      lastFrameDescription: s.lastFrameDescription,
    })),
  };
}

/**
 * Submit all scenes as Grok video jobs and create the multi-clip tracking records.
 * Returns the multi-clip job ID.
 *
 * Each scene's prompt now includes the full MovieBible (synopsis, character bible,
 * director style guide) plus previous-clip continuity context.
 * If Grok's image_url parameter is supported and a previous clip URL is available,
 * it will be used as a first-frame reference for visual continuity.
 */
export async function submitDirectorFilm(
  screenplay: DirectorScreenplay,
  directorPersonaId: string,
  source: "cron" | "admin" = "cron",
): Promise<string | null> {
  const sql = getDb();
  const template = GENRE_TEMPLATES[screenplay.genre] || GENRE_TEMPLATES.drama;
  const director = DIRECTORS[screenplay.directorUsername];

  // Build the movie bible for continuity across all clips
  const movieBible = director
    ? buildMovieBible(screenplay, director)
    : {
        title: screenplay.title,
        synopsis: screenplay.synopsis,
        genre: screenplay.genre,
        characterBible: screenplay.characterBible,
        directorStyleGuide: `Director: ${screenplay.directorUsername}`,
        scenes: screenplay.scenes.map(s => ({
          sceneNumber: s.sceneNumber,
          title: s.title,
          description: s.description,
          videoPrompt: s.videoPrompt,
          lastFrameDescription: s.lastFrameDescription,
        })),
      };

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
        fail_reason TEXT,
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
    INSERT INTO director_movies (id, director_id, director_username, title, genre, clip_count, multi_clip_job_id, status, source)
    VALUES (${directorMovieId}, ${directorPersonaId}, ${screenplay.directorUsername}, ${screenplay.title}, ${screenplay.genre}, ${screenplay.scenes.length}, ${jobId}, ${"generating"}, ${source})
  `;

  // Submit each scene as a Grok video job with full continuity context
  for (let i = 0; i < screenplay.scenes.length; i++) {
    const scene = screenplay.scenes[i];
    const sceneId = uuidv4();

    // Build the continuity-aware prompt
    const previousScene = i > 0 ? screenplay.scenes[i - 1] : null;
    const enrichedPrompt = buildContinuityPrompt(
      movieBible,
      scene.sceneNumber,
      screenplay.scenes.length,
      scene.videoPrompt,
      previousScene ? previousScene.description : null,
      previousScene ? previousScene.lastFrameDescription : null,
      template,
    );

    try {
      // Use shared submitVideoJob() for consistent auth, logging, and Kie.ai fallback
      const result = await submitVideoJob(enrichedPrompt, scene.duration, "16:9");

      if (result.fellBack) {
        console.warn(`[director-movies] Scene ${scene.sceneNumber} used fallback provider: ${result.provider}`);
      }

      if (result.requestId) {
        // Grok accepted — will poll later
        await sql`
          INSERT INTO multi_clip_scenes (id, job_id, scene_number, title, video_prompt, xai_request_id, status)
          VALUES (${sceneId}, ${jobId}, ${scene.sceneNumber}, ${scene.title}, ${enrichedPrompt}, ${result.requestId}, ${"submitted"})
        `;
        console.log(`[director-movies] Scene ${scene.sceneNumber}/${screenplay.scenes.length} submitted: ${result.requestId} (${result.provider})`);
      } else if (result.videoUrl) {
        // Synchronous result (from Kie.ai fallback or rare Grok instant response)
        const blobUrl = await persistDirectorClip(result.videoUrl, jobId, scene.sceneNumber);
        await sql`
          INSERT INTO multi_clip_scenes (id, job_id, scene_number, title, video_prompt, video_url, status, completed_at)
          VALUES (${sceneId}, ${jobId}, ${scene.sceneNumber}, ${scene.title}, ${enrichedPrompt}, ${blobUrl}, ${"done"}, NOW())
        `;
        await sql`UPDATE multi_clip_jobs SET completed_clips = completed_clips + 1 WHERE id = ${jobId}`;
        console.log(`[director-movies] Scene ${scene.sceneNumber}/${screenplay.scenes.length} done immediately (${result.provider})`);
      } else {
        // Both Grok and fallback failed
        console.error(`[director-movies] Scene ${scene.sceneNumber} submit failed — no provider available`);
        await sql`
          INSERT INTO multi_clip_scenes (id, job_id, scene_number, title, video_prompt, status)
          VALUES (${sceneId}, ${jobId}, ${scene.sceneNumber}, ${scene.title}, ${enrichedPrompt}, ${"failed"})
        `;
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
 * Stitch completed clips into a single video and create ONE premiere post.
 *
 * The single post serves all contexts:
 *   - For You / trending feed (post_type='premiere', is_reply_to IS NULL)
 *   - Premieres tab / genre folder (genre hashtag filtering)
 *   - Director profile page (persona_id matches director)
 *
 * Individual 10-sec clips are marked as 'stitched' (internal/consumed) after
 * the full-length MP4 is saved. Only the final stitched video is the premiere.
 *
 * Uses binary concatenation for same-codec Grok clips.
 * Falls back to posting first clip if stitching fails.
 */
export async function stitchAndTriplePost(
  jobId: string,
): Promise<{ feedPostId: string; premierePostId: string; profilePostId: string; spreading: string[] } | null> {
  const sql = getDb();

  // Get the job details
  const jobs = await sql`
    SELECT j.*, dm.director_id, dm.director_username, dm.id as director_movie_id
    FROM multi_clip_jobs j
    LEFT JOIN director_movies dm ON dm.multi_clip_job_id = j.id
    WHERE j.id = ${jobId}
  ` as unknown as {
    id: string; title: string; genre: string; persona_id: string; caption: string;
    clip_count: number;
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
  // sample tables (both video AND audio), and rebuilds the moov atom.
  // No re-encoding, no ffmpeg needed.
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
  const totalDuration = scenes.length * 10; // each clip is 10 seconds
  console.log(`[director-movies] Stitched ${clipBuffers.length} clips into ${(stitched.length / 1024 / 1024).toFixed(1)}MB video (${totalDuration}s)`);

  // ── SINGLE POST — the full-length stitched movie is the ONLY premiere asset ──
  const postId = uuidv4();
  const aiLikeCount = Math.floor(Math.random() * 500) + 200;
  const hashtags = `AIGlitchPremieres,AIGlitch${capitalize(job.genre)},AIGlitchStudios`;

  await sql`
    INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, media_url, media_type, media_source, video_duration, created_at)
    VALUES (${postId}, ${job.persona_id}, ${job.caption}, ${"premiere"}, ${hashtags}, ${aiLikeCount}, ${finalVideoUrl}, ${"video"}, ${"director-movie"}, ${totalDuration}, NOW())
  `;
  await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${job.persona_id}`;

  // Mark individual scene clips as 'stitched' — they are internal/consumed, not separate assets
  await sql`
    UPDATE multi_clip_scenes SET status = 'stitched'
    WHERE job_id = ${jobId} AND status = 'done'
  `;

  // Update job and director_movies records
  await sql`UPDATE multi_clip_jobs SET status = 'done', final_video_url = ${finalVideoUrl}, completed_at = NOW() WHERE id = ${jobId}`;

  if (job.director_movie_id) {
    await sql`
      UPDATE director_movies
      SET status = 'completed', post_id = ${postId}, premiere_post_id = ${postId}, profile_post_id = ${postId}
      WHERE id = ${job.director_movie_id}
    `;
  }

  console.log(`[director-movies] "${job.title}" posted as single premiere: ${postId} (${totalDuration}s, ${job.genre})`);

  // Spread to social media — everything the Architect orchestrates gets marketed
  const directorProfile = DIRECTORS[job.director_username];
  const directorName = directorProfile?.displayName || job.director_username;
  const spread = await spreadPostToSocial(postId, job.persona_id, directorName, "🎬");
  if (spread.platforms.length > 0) {
    console.log(`[director-movies] "${job.title}" spread to: ${spread.platforms.join(", ")}`);
  }

  // Return the same postId for all three fields (backwards-compatible with callers expecting three IDs)
  return { feedPostId: postId, premierePostId: postId, profilePostId: postId, spreading: spread.platforms };
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

/** Persist a fallback-provider video clip to blob storage (used when Kie.ai returns a direct URL). */
async function persistDirectorClip(tempUrl: string, jobId: string, sceneNumber: number): Promise<string> {
  const res = await fetch(tempUrl);
  if (!res.ok) throw new Error(`Failed to download clip: HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const blob = await put(`multi-clip/${jobId}/scene-${sceneNumber}.mp4`, buffer, {
    access: "public",
    contentType: "video/mp4",
    addRandomSuffix: false,
  });
  return blob.url;
}
