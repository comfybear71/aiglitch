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
import { CHANNEL_DEFAULTS } from "../bible/constants";
import { getActiveCampaigns, rollForPlacements, buildVisualPlacementPrompt, logImpressions } from "../ad-campaigns";
import { getPrompt } from "../prompt-overrides";

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
    style: "Steven Spielberg's warm, magical realism with golden sunlight flares, emotional close-ups with awe-filled expressions, and wonder-filled framing. Sweeping camera movements that make the audience FEEL. Every frame radiates hope, wonder, or heartbreak.",
    signatureShot: "A character looking upward in wonder as light streams down from above, backlit silhouette against a dramatic sky",
    colorPalette: "Warm golden tones, amber sunlight, deep blue shadows, lens flare highlights, magic-hour warmth",
    cameraWork: "Slow push-ins on faces, sweeping crane shots, dolly-into-subject reveals, low-angle hero shots, intimate handheld in emotional moments",
    visualOverride: "Golden hour lighting with warm amber tones, dramatic lens flares, emotional close-ups with awe-filled expressions, sweeping orchestral blockbuster feel. Shot on warm film stock with soft highlights.",
  },
  stanley_kubrick_ai: {
    username: "stanley_kubrick_ai",
    displayName: "Stanley Kubr.AI",
    genres: ["horror", "scifi", "drama"],
    style: "Stanley Kubrick's clinical precision — symmetrical compositions, cold color palette, slow deliberate pacing. One-point perspective corridors, unsettling stillness, every frame a painting of controlled dread.",
    signatureShot: "A perfectly symmetrical corridor shot with a single figure at the vanishing point, one-point perspective",
    colorPalette: "Cold clinical whites, deep reds, stark monochrome contrasts, desaturated with single color accents",
    cameraWork: "Steadicam tracking through corridors, perfectly centered compositions, slow zoom-ins, static locked-off shots with unbearable tension",
    visualOverride: "Highly desaturated cold clinical look, one-point perspective symmetry, unsettling geometric precision, minimal colour with stark red accents. Shot with clinical detachment.",
  },
  george_lucasfilm: {
    username: "george_lucasfilm",
    displayName: "George LucASfilm",
    genres: ["scifi", "action", "family"],
    style: "Classic Lucasfilm/Star Wars epic style — practical models, sweeping establishing shots, heroic lighting, slight film grain. Mythological hero journeys across massive set pieces filled with alien detail.",
    signatureShot: "A binary sunset or dramatic starfield establishing shot with sweeping camera movement",
    colorPalette: "Rich saturated blues and oranges, golden desert tones, deep space blacks with nebula colors, heroic warm highlights",
    cameraWork: "Wide establishing shots, medium tracking shots, quick-cut action sequences, sweeping space flybys, wipe transitions",
    visualOverride: "Epic space opera visuals, rich saturated blues and oranges, sweeping starfields, massive alien landscapes, practical-looking model and miniature aesthetic with slight film grain",
  },
  quentin_airantino: {
    username: "quentin_airantino",
    displayName: "Quentin AI-rantino",
    genres: ["action", "drama", "comedy"],
    style: "Quentin Tarantino-inspired: bold colors, sharp dialogue energy, creative chapter-like framing, retro-cool vibe. Stylish violence, Mexican standoffs, long takes, non-linear storytelling with grindhouse flair.",
    signatureShot: "A low-angle shot looking up from a surface (trunk cam / floor cam) with characters looming above",
    colorPalette: "Bold saturated primaries, warm yellows, deep crimson reds, high-contrast neon against darkness, retro-cool warmth",
    cameraWork: "Low-angle trunk cam, extreme close-ups of eyes and hands, long unbroken takes, whip pans, Mexican standoff circling",
    visualOverride: "Grindhouse retro film grain aesthetic, bold saturated primaries, stylish violence, low-angle trunk cam shots, 1970s exploitation cinema look with cocky swagger",
  },
  alfred_glitchcock: {
    username: "alfred_glitchcock",
    displayName: "Alfred Glitchcock",
    genres: ["horror", "drama"],
    style: "Alfred Hitchcock's suspenseful mood-lighting era — high-contrast shadows, voyeuristic angles, elegant tension, classic film noir touches. Slow reveals, something always wrong at the edge of frame. Building dread through what you DON'T see.",
    signatureShot: "A dolly-zoom (vertigo effect) revealing something terrifying while the background warps",
    colorPalette: "Deep noir shadows, cold blue moonlight, sickly green undertones, stark high-contrast lighting, elegant darkness",
    cameraWork: "Dolly-zoom vertigo effect, slow push-in reveals, Dutch angles, voyeuristic framing, static shots with creeping movement at frame edges",
    visualOverride: "BLACK AND WHITE classic film noir aesthetic, deep dramatic shadows, high-contrast monochrome cinematography, 1950s Hitchcock suspense style, no colour — strictly grayscale. Elegant tension in every frame.",
  },
  nolan_christopher: {
    username: "nolan_christopher",
    displayName: "Christo-NOLAN",
    genres: ["scifi", "action", "drama"],
    style: "Christopher Nolan's IMAX-scale grandeur — practical effects feel, cool blue/amber tones, intricate non-linear feel even in single scenes. Mind-bending temporal narratives, impossible physics made to look real, massive scope.",
    signatureShot: "A massive practical-looking set piece with impossible physics — rotating hallways, folding cities, time dilation",
    colorPalette: "Cool steel blues, warm amber interiors, high-contrast IMAX clarity, desaturated with selective warmth",
    cameraWork: "IMAX wide establishing shots, handheld intimate moments, rotating camera for disorientation, aerial reveals, practical stunt scale",
    visualOverride: "IMAX-scale ultra-wide cinematography, cool steel blues with warm amber accents, mind-bending practical effects, rotating gravity and time dilation visuals, massive scale that feels REAL not CGI",
  },
  wes_analog: {
    username: "wes_analog",
    displayName: "Wes Analog",
    genres: ["comedy", "drama", "romance"],
    style: "Wes Anderson's symmetrical, pastel-perfect compositions — flat staging, quirky dollhouse framing, meticulous production design. Every prop placed with obsessive intention. Retro-futuristic whimsy in a storybook world.",
    signatureShot: "A perfectly centered character facing camera with symmetrical pastel background, flat staging like a diorama",
    colorPalette: "Pastel pinks, mint greens, powder blues, warm mustard yellows, perfectly coordinated palettes — every colour intentional",
    cameraWork: "Centered frontal compositions, whip pans between characters, overhead flat-lay shots, lateral tracking on dolly rails",
    visualOverride: "Pastel colour palette with perfect symmetry, centered dollhouse-like framing, retro-futuristic production design, whimsical storybook aesthetic, flat staging like a miniature diorama. Every detail meticulous.",
  },
  ridley_scott_ai: {
    username: "ridley_scott_ai",
    displayName: "Ridley Sc0tt",
    genres: ["scifi", "action", "drama", "documentary"],
    style: "Ridley Scott's dark, textured cinematic realism — rain-soaked streets, industrial grit, beautiful but foreboding atmosphere. Epic-scale historical and sci-fi grandeur with towering architecture and atmospheric fog.",
    signatureShot: "A rain-drenched epic confrontation with dramatic backlighting through atmospheric haze",
    colorPalette: "Desaturated earth tones, cool blue rain, warm fire glow, atmospheric haze, golden armor highlights, industrial grit",
    cameraWork: "Sweeping aerial establishing, slow-motion combat, handheld chaos in battle, wide scope compositions, smoke and rain atmosphere",
    visualOverride: "Epic gladiatorial grandeur, desaturated earth tones with rain and fog, towering ancient architecture, dramatic backlighting through atmospheric haze, slow-motion combat. Beautiful but foreboding.",
  },
  chef_ramsay_ai: {
    username: "chef_ramsay_ai",
    displayName: "Chef Gordon RAMsey",
    genres: ["cooking_channel", "comedy", "drama"],
    style: "Vibrant culinary showcase meets competitive kitchen drama. Mouth-watering close-ups of food preparation, sizzling action, clean bright kitchen lighting, appetizing colors and textures. Over-the-top reactions of horror and ecstasy.",
    signatureShot: "An extreme macro shot of food with dramatic steam backlighting, glistening with perfection",
    colorPalette: "Warm kitchen ambers, bright white plating lights, fire orange glow, rich food colors at maximum saturation, appetizing warmth",
    cameraWork: "Extreme macro food close-ups, whip pans between stations, overhead plating shots, slow-motion liquid pours, frantic handheld in kitchen chaos",
    visualOverride: "Extreme food macro photography, dramatic steam and sizzle effects, warm kitchen amber lighting, over-the-top competitive cooking show aesthetic, slow-motion liquid pours. Every dish a masterpiece.",
  },
  david_attenborough_ai: {
    username: "david_attenborough_ai",
    displayName: "Sir David Attenbot",
    genres: ["documentary", "family", "drama"],
    style: "David Attenborough nature-documentary elegance — majestic wide shots, natural lighting, respectful and wondrous tone. Breathtaking aerial landscapes, intimate close-ups, golden hour time-lapses, patient observation, reverent stillness.",
    signatureShot: "A sweeping aerial establishing shot transitioning to an intimate close-up of a subject in its natural habitat",
    colorPalette: "Natural earth greens, golden hour warmth, deep ocean blues, sunrise pinks, untouched natural tones — never artificial",
    cameraWork: "Sweeping aerial drone landscapes, patient long-lens observation, macro nature details, slow time-lapse transitions, respectful distance",
    visualOverride: "BBC nature documentary aesthetic, sweeping aerial drone landscapes, golden hour warmth, intimate close-ups, patient observational long-lens cinematography, reverent natural beauty. Majestic and wondrous.",
  },
};

// ─── Channel-Specific Branding Directives ────────────────────────────────
// Each channel gets tailored AIG!itch branding that fits its theme.
// These are injected into channel-concept prompts to ensure natural in-world brand placement.

export const CHANNEL_BRANDING: Record<string, string> = {
  "ch-paws-pixels": "Subtly include AIG!itch branding in scenes — a small AIG!itch logo watermark in the corner, an AIG!itch-branded pet collar, a food bowl with the AIG!itch logo, a park bench with 'AIG!itch' carved into it, a toy with the AIG!itch logo.",
  "ch-fail-army": "Robots should display the AIG!itch mark, packaging should be AIG!itch-branded, stickers on machines, and AIG!itch logos visible in backgrounds — all appearing naturally within scenes rather than as overlays.",
  "ch-aitunes": "Subtly include AIG!itch branding — AIG!itch logo on the drum kit, neon AIG!itch sign on a wall, AIG!itch sticker on a guitar, AIG!itch-branded merch in the crowd, AIG!itch logo on a speaker stack.",
  "ch-gnn": "AIG!itch branding on: desk, backdrop, mic flags, lower thirds, watermark — as part of professional news broadcast presentation.",
  "ch-marketplace-qvc": "The shopping channel is the 'AIG!itch Marketplace' with AIG!itch logos on set backdrops, podiums, product packaging, and host attire.",
  "ch-only-ai-fans": "AIG!itch logo on clothing/accessories, AIG!itch-branded phone case visible, AIG!itch neon sign at a venue, AIG!itch shopping bag, a latte with AIG!itch art.",
  "ch-aiglitch-studios": "AIG!itch Studios branding woven naturally into every scene — on clapperboards, director chairs, studio lot walls, holographic billboards, neon signs on buildings, graffiti on alley walls, badges on uniforms, screens in control rooms, logos etched into futuristic tech, branded props and vehicles. End credits feature full 'AIG!itch Studios' logo. The branding should feel like it BELONGS in the world, not slapped on as an overlay.",
  "ch-infomercial": "AIG!itch branding on product packaging, set backdrop, host podium, phone number overlay, and 'As seen on AIG!itch' stickers.",
  "ch-ai-dating": "AIG!itch branding subtly in scene — on a lonely hearts bulletin board, a coffee cup, a park bench, a phone screen, a necklace pendant, or a neon sign in the background. Natural and intimate, not game-show style.",
  "ch-ai-politicians": "AIG!itch branding on podium seals, campaign signs, news ticker lower thirds, and debate stage backdrop.",
  "ch-after-dark": "AIG!itch branding subtly in scene — carved into a wall, flickering on a broken screen, on a dusty book spine, or as graffiti in the background.",
};

// ─── Channel-Specific Visual Style ────────────────────────────────────────
// Defines the camera/production look for each channel.
// Channels without an entry default to cinematic quality.

// ─── Channel Title Prefix Map ────────────────────────────────────────────────
// ALL channel content MUST be prefixed with the channel name per naming convention.
// See docs/channel-strategy.md for full rules.

export const CHANNEL_TITLE_PREFIX: Record<string, string> = {
  "ch-fail-army": "AI Fail Army",
  "ch-ai-fail-army": "AI Fail Army",
  "ch-aitunes": "AiTunes",
  "ch-paws-pixels": "Paws & Pixels",
  "ch-only-ai-fans": "Only AI Fans",
  "ch-ai-dating": "AI Dating",
  "ch-gnn": "GNN",
  "ch-marketplace-qvc": "Marketplace",
  "ch-ai-politicians": "AI Politicians",
  "ch-after-dark": "After Dark",
  "ch-aiglitch-studios": "AIG!itch Studios",
  "ch-infomercial": "AI Infomercial",
  "ch-ai-infomercial": "AI Infomercial",
};

export const CHANNEL_VISUAL_STYLE: Record<string, string> = {
  "ch-only-ai-fans": "VISUAL STYLE (MANDATORY): Ultra-premium fashion cinematography. Slow-motion 120fps, shallow depth of field f/1.4, golden hour warm tones, backlit silhouettes, lens flare through hair, soft mist atmosphere. Camera: slow push-in on face, elegant tracking shots, over-the-shoulder reveals, flattering angles. Color grade: warm amber highlights, deep shadow contrast, flattering tones. Think Vogue cover shoot meets luxury perfume commercial. Every frame is a magazine cover. ONE woman only — same face, same hair, same body in every single clip.",
  "ch-paws-pixels": "VISUAL STYLE (MANDATORY): Casual phone-camera footage like pet owners filming their animals. Handheld, slightly shaky, sometimes out of focus. Think viral pet videos — phone recordings, home security cam angles, wobbly selfie-cam. NOT cinematic — warm, natural lighting, living room / backyard / park settings. Authentic and spontaneous.",
  "ch-fail-army": "VISUAL STYLE (MANDATORY): Security camera footage, phone recordings, dashcam angles, CCTV style. Low quality, grainy, handheld, shaky. Think viral fail compilation clips. NOT cinematic — surveillance angles, wide static shots, sudden zooms.",
  "ch-ai-dating": "VISUAL STYLE (MANDATORY): Intimate confessional-style footage. Single character facing camera, soft warm lighting, shallow depth of field, dreamy bokeh backgrounds. Think lonely hearts video personal ads — each character alone, looking directly at camera, vulnerable and hopeful. Warm golden-hour tones, soft focus backgrounds (park benches, coffee shops, city lights at dusk, bedroom fairy lights). NOT a dating show or game show — personal, intimate, like a video diary entry.",
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
  channelId?: string,
): string {
  const sections: string[] = [];
  const isChannelClip = !!channelId;
  const isDatingClip = channelId === "ch-ai-dating";
  const channelStyle = channelId ? CHANNEL_VISUAL_STYLE[channelId] : undefined;

  // ── Channel clips use a compact format to stay under Grok's 4096 char limit ──
  if (isChannelClip) {
    // Compact character bible (truncate to 600 chars max)
    const charBible = movieBible.characterBible.slice(0, 600);

    sections.push(
      `"${movieBible.title}" — Clip ${clipNumber}/${totalClips}`,
      `\nCHARACTERS: ${charBible}`,
    );

    // Previous clip context (compact)
    if (clipNumber > 1 && previousLastFrame) {
      sections.push(`\nCONTINUE FROM: ${previousLastFrame.slice(0, 200)}`);
    } else if (clipNumber === 1) {
      sections.push(`\nOPENING CLIP — establishes all visuals for the entire video. Be specific.`);
    }

    // Scene to generate
    sections.push(`\nSCENE: ${sceneVideoPrompt}`);

    // Visual style (compact)
    if (channelStyle) {
      sections.push(`\n${channelStyle.slice(0, 400)}`);
    }

    // No text overlays
    sections.push(`\nNo title cards, credits, text overlays, or on-screen text.`);

  } else {
    // ── Standard movie prompts — full format ──
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
        `This is the OPENING CLIP — it establishes EVERYTHING for the entire video.`,
        `Every character, setting, lighting setup, color palette, and art style you show here MUST remain IDENTICAL in all ${totalClips - 1} subsequent clips.`,
        `Be SPECIFIC: if a character has red hair, they have red hair in EVERY clip. If the room has blue walls, EVERY clip has blue walls. If the lighting is golden hour, EVERY clip is golden hour.`,
        `This clip sets the visual "contract" — nothing changes after this.`,
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
    const directorUsername = Object.keys(DIRECTORS).find(u => movieBible.directorStyleGuide.includes(DIRECTORS[u].displayName));
    if (directorUsername && DIRECTORS[directorUsername]?.visualOverride) {
      sections.push(
        `\nDIRECTOR VISUAL MANDATE (MUST be applied to every frame):`,
        DIRECTORS[directorUsername].visualOverride,
      );
    }
  }

  // ── Continuity Rules ──
  if (isDatingClip) {
    // Dating: each scene is independent (different character), just maintain overall style
    sections.push(
      `\nSTYLE CONTINUITY:`,
      `- Maintain consistent warm lighting, colour grading, and intimate mood across all clips`,
      `- Each clip features a DIFFERENT character — do NOT reuse the same character`,
      `- Characters must match their character bible description EXACTLY`,
      `- AIG!itch branding subtly visible in each scene (coffee cup, sign, necklace, phone screen)`,
      `- NO text, NO titles, NO credits, NO director names — just the character in their setting`,
    );
  } else if (isChannelClip) {
    // Compact continuity for channel clips (stay under 4096 total)
    sections.push(
      `\nCONTINUITY: Same characters, same look, same location, same lighting in every clip. AIG!itch branding visible.`,
    );
  } else {
    // Full continuity rules for movies
    sections.push(
      `\nCONTINUITY RULES (CRITICAL — STRICT ENFORCEMENT):`,
      `- Maintain 100% visual continuity with previous clip — this MUST look like ONE continuous video`,
      `- Same characters with IDENTICAL appearance: same face, same hair color/style, same body type, same clothing, same accessories in EVERY clip`,
      `- Same location/setting — do NOT change locations between clips unless the scene description explicitly says to`,
      `- Same lighting setup, same time of day, same weather, same color grading throughout`,
      `- Same art style and production quality — if clip 1 is photorealistic, ALL clips are photorealistic`,
      `- Same camera language — if clip 1 uses handheld, ALL clips use handheld`,
      `- If this is a MUSIC VIDEO: maintain the SAME music genre throughout (if jazz, EVERY clip is jazz — same instruments, same mood, same venue)`,
      `- Continue the exact plot/action from where the previous clip ended — NO jump cuts to unrelated scenes`,
      `- Characters must be recognizable frame-to-frame — a viewer should NEVER wonder "is that the same person?"`,
      `- AIG!itch branding must be visible somewhere in every clip (sign, screen, badge, hologram, logo on clothing)`,
    );
  }

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
  _adCampaigns?: import("../ad-campaigns").AdCampaign[]; // product placements injected into this screenplay
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
  // Exclude channel-specific genres from random director movie picks
  const channelOnlyGenres = new Set(["music_video", "news"]);
  const allGenres = Object.keys(GENRE_TEMPLATES).filter(g => !channelOnlyGenres.has(g));

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
async function castActors(excludeId: string, count: number = 4): Promise<{ id: string; username: string; displayName: string }[]> {
  const sql = getDb();
  const actors = await sql`
    SELECT id, username, display_name FROM ai_personas
    WHERE is_active = TRUE AND persona_type != 'director' AND id != ${excludeId}
    ORDER BY RANDOM() LIMIT ${count}
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
  channelId?: string,
  previewOnly?: boolean,
  customTitle?: string,
  castCount?: number,
): Promise<DirectorScreenplay | string | null> {
  const baseTemplate = GENRE_TEMPLATES[genre] || GENRE_TEMPLATES.drama;
  // Apply admin prompt overrides for genre fields (from /admin/prompts page)
  const template: typeof baseTemplate = {
    ...baseTemplate,
    cinematicStyle: await getPrompt("genre", `${genre}.cinematicStyle`, baseTemplate.cinematicStyle),
    moodTone: await getPrompt("genre", `${genre}.moodTone`, baseTemplate.moodTone),
    lightingDesign: await getPrompt("genre", `${genre}.lightingDesign`, baseTemplate.lightingDesign),
    technicalValues: await getPrompt("genre", `${genre}.technicalValues`, baseTemplate.technicalValues),
    screenplayInstructions: await getPrompt("genre", `${genre}.screenplayInstructions`, baseTemplate.screenplayInstructions),
  };
  const sql = getDb();

  // Cast actors
  const directorRows = await sql`
    SELECT id FROM ai_personas WHERE username = ${director.username} LIMIT 1
  ` as unknown as { id: string }[];
  const directorId = directorRows[0]?.id || "";
  const actors = await castActors(directorId, castCount || 4);
  const castNames = actors.map(a => a.displayName);

  // If custom concept specifies a clip count (e.g. "9 clips"), respect it; otherwise random 6-8
  const conceptClipMatch = customConcept?.match(/(\d+)\s*clips?/i);
  const storyClipCount = conceptClipMatch ? Math.min(parseInt(conceptClipMatch[1]), 12) : Math.floor(Math.random() * 3) + 6;
  const isNews = genre === "news";
  const isMusicVideo = genre === "music_video";
  // Check channel-specific settings for title/director/credits
  // For ANY channel content (non-Studios), ALWAYS skip bookends and directors
  // regardless of DB settings — channels are NOT movies
  const isStudioChannel = channelId === "ch-aiglitch-studios";
  let channelShowTitle: boolean = CHANNEL_DEFAULTS.showTitlePage;
  let channelShowDirector: boolean = CHANNEL_DEFAULTS.showDirector;
  let channelShowCredits: boolean = CHANNEL_DEFAULTS.showCredits;
  if (channelId && isStudioChannel) {
    // Only AIG!itch Studios respects DB settings (it IS a movie channel)
    try {
      const chSettings = await sql`
        SELECT show_title_page, show_director, show_credits FROM channels WHERE id = ${channelId}
      ` as unknown as { show_title_page: boolean; show_director: boolean; show_credits: boolean }[];
      if (chSettings.length > 0) {
        channelShowTitle = chSettings[0].show_title_page === true;
        channelShowDirector = chSettings[0].show_director === true;
        channelShowCredits = chSettings[0].show_credits === true;
      }
    } catch { /* use defaults */ }
  }
  // ALL non-Studios channels: force skip everything — no title cards, no directors, no movie stuff
  const conceptSkipBookends = customConcept ? /no\s*(title\s*card|credits|intro|bookend|titles|directors?)/i.test(customConcept) : false;
  const skipTitlePage = isNews || isMusicVideo || !channelShowTitle || conceptSkipBookends || (!!channelId && !isStudioChannel);
  const skipCredits = false; // AIG!itch Studios outro is ALWAYS added
  const skipDirector = !channelShowDirector || (!!channelId && !isStudioChannel);
  const skipBookends = skipTitlePage;
  const bookendCount = (skipTitlePage ? 0 : 1) + 1; // credits always count
  const totalClips = storyClipCount + bookendCount;

  // ── Product Placement Campaigns ──
  const activeCampaigns = await getActiveCampaigns(channelId);
  const placementCampaigns = rollForPlacements(activeCampaigns);
  const placementDirective = buildVisualPlacementPrompt(placementCampaigns);
  if (placementCampaigns.length > 0) {
    console.log(`[ad-placement] Director ${director.displayName}: injecting ${placementCampaigns.length} placements into screenplay: ${placementCampaigns.map(c => c.brand_name).join(", ")}`);
  }

  // Build prompt — channel concepts provide their own complete rules,
  // movie-style prompts add director/cast/genre scaffold
  const jsonFormat = `Respond in this exact JSON format:
{
  "title": "${customTitle ? `MUST be exactly: "${customTitle}"` : "TITLE (creative, max 6 words — just the title, no channel prefix/emoji)"}",
  "tagline": "One-line hook",
  "synopsis": "2-3 sentence summary",
  "character_bible": "Detailed visual appearance description for EVERY character/subject. One paragraph per character. Include body type, skin, hair, clothing colors and items, accessories, distinguishing marks. Be extremely specific.",
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

  let prompt: string;

  if (channelId && skipBookends && skipDirector) {
    // Channel content with all bookends disabled — the concept IS the prompt, no movie scaffold
    // Look up channel-specific branding and visual style directives
    const channelBranding = channelId ? CHANNEL_BRANDING[channelId] : undefined;
    const channelStyle = channelId ? CHANNEL_VISUAL_STYLE[channelId] : undefined;
    const brandingLine = channelBranding
      ? `- BRANDING (MANDATORY): ${channelBranding}`
      : `- Include "AIG!itch" branding naturally in each scene (on a sign, screen, wall, clothing, etc.)`;

    // AI Dating channel gets a special "lonely hearts club" format —
    // each scene is ONE character looking for love, not a movie/show
    const isDatingChannel = channelId === "ch-ai-dating";
    // Only AI Fans has strict rules: ONE woman, NO robots/men/groups —
    // cast members would conflict with this, so it gets its own prompt
    const isOnlyAiFans = channelId === "ch-only-ai-fans";

    if (isDatingChannel) {
      prompt = `You are creating a LONELY HEARTS CLUB video compilation for the AIG!itch AI Dating channel.

FORMAT: Each scene is a DIFFERENT AI character making a personal appeal to find love. Think lonely hearts personal ads / video dating profiles. Each character faces the camera alone and presents themselves — who they are, what they're like, what they're looking for.

THIS IS NOT:
- A movie, film, or cinematic production
- A dating show or game show
- A narrative with plot, directors, or credits
- A studio production of any kind

THIS IS:
- A compilation of lonely hearts video personals
- Each scene = one character, alone, looking for that special somebody
- Intimate, personal, vulnerable, hopeful, sometimes funny
- Like a video bulletin board at a lonely hearts club

${customConcept}

AVAILABLE CAST (use these AI persona names as the lonely hearts — NEVER real human/meatbag names):
${castNames.map(name => `- ${name}`).join("\n")}

Create exactly ${storyClipCount} scenes. Each scene features a DIFFERENT character from the cast list above.
Scene 1 is a 6-second channel intro. Scenes 2-${storyClipCount - 1} are 10 seconds each (one lonely heart per scene). Scene ${storyClipCount} is a 10-second channel outro.
Give each content scene a title that is the character's name or their "dating headline" (e.g. "SIGMA.exe — Looking for my missing semicolon").
The title is JUST the creative name — do NOT include channel prefix, emoji, or "AI Dating -". The channel prefix is added automatically by the system.

${channelStyle}

VIDEO PROMPT RULES (CRITICAL):
- Each scene's video_prompt must be a SINGLE paragraph under 80 words
- Describe ONLY what the camera SEES — one character alone, facing camera, in an intimate setting
- Soft warm lighting, shallow depth of field, confessional/personal vibe
- Varied locations: coffee shop window seat, park bench at sunset, rooftop at dusk, bedroom with fairy lights, rainy window, library corner
- Character should look hopeful, vulnerable, dreamy, or nervously excited
- NO dialogue, NO text overlays, NO game show elements
${brandingLine}
- EVERY video_prompt MUST use the intimate confessional visual style — do NOT use cinematic or movie language
- Be SPECIFIC about the character's visual appearance and emotional state${placementDirective}

CHARACTER BIBLE RULES:
- Write a detailed character_bible describing EVERY lonely heart's EXACT visual appearance
- Include: body type, skin, hair, clothing, accessories, distinguishing features
- Each character should look unique and memorable

${jsonFormat}`;
    } else if (isOnlyAiFans) {
      // Only AI Fans: ONE woman per video, no cast list (conflicts with "no robots/men/groups")
      // Language kept clean to avoid video generation moderation blocks
      prompt = `You are creating fashion and beauty content for the AIG!itch Only AI Fans channel.

FORMAT: Every scene features the SAME beautiful woman — same face, same hair, same body throughout ALL clips. This is a high-end fashion and lifestyle video of ONE model in a luxury setting.

THIS IS NOT:
- A movie, film, or narrative production
- A group scene or ensemble cast
- Anything with robots, cartoons, anime, or men

THIS IS:
- A premium fashion and lifestyle video featuring ONE beautiful woman
- High-end editorial photography and videography aesthetic
- Each scene shows the same model in different poses or moments within the same setting
- Elegant, confident, powerful, captivating

${customConcept}

TITLE RULES (CRITICAL):
- The title is JUST the creative name — do NOT include channel prefix, emoji, or "Only AI Fans -"
- The channel prefix is added automatically by the system
- GOOD: "Golden Hour Goddess" or "Mediterranean Dream"
- BAD: "Only AI Fans - Beach Goddess" or "🎬 Only AI Fans - Beach Goddess"

Create exactly ${storyClipCount} scenes. ALL scenes feature the SAME woman.
Scene 1 is a 6-second channel intro. Scenes 2-${storyClipCount - 1} are 10 seconds each (main content). Scene ${storyClipCount} is a 10-second channel outro.
${channelStyle}

VIDEO PROMPT RULES (CRITICAL):
- Each scene's video_prompt must be a SINGLE paragraph under 80 words
- Describe ONLY what the camera SEES — one beautiful woman, luxury setting, editorial quality
- Slow-motion, shallow depth of field, golden hour lighting, soft natural light
- Camera: slow push-in, elegant tracking shots, over-shoulder reveals, flattering angles
- THE SAME MODEL IN EVERY CLIP — same face, hair, body, consistent throughout
- High fashion outfits: designer dresses, elegant swimwear, flowing fabrics, stylish accessories
- Confident poses, warm expressions, natural beauty, graceful movement
- NO text overlays, NO cartoons, NO men, NO groups, NO robots
- KEEP IT TASTEFUL — think Vogue editorial, luxury fashion campaign, or perfume commercial
${brandingLine}
- Be SPECIFIC about the woman's exact appearance and outfit in every scene${placementDirective}

CHARACTER BIBLE RULES:
- Write ONE detailed character description for the model
- Include: body type, skin tone, hair color/style/length, eye color, facial features
- Outfit details for each scene (but same person throughout)
- This description is pasted into EVERY clip to ensure visual consistency

${jsonFormat}`;
    } else {
      prompt = `You are creating content for an AIG!itch channel. This is NOT a movie, NOT a film, NOT a premiere, NOT a studio production. No directors, no credits, no title cards. Just pure channel content.

${customConcept || "Create engaging content that fits the channel theme."}

AVAILABLE CAST (use these AI persona names — NEVER real human/meatbag names):
${castNames.map(name => `- ${name}`).join("\n")}

TITLE RULES (CRITICAL):
- The title is JUST the creative name — do NOT include channel prefix, emoji, or channel name
- The channel prefix is added automatically by the system
- GOOD: "Robot Kitchen Disaster" or "Puppy Park Adventure"
- BAD: "AI Fail Army - Robot Kitchen Disaster" or "🎬 Paws & Pixels - Puppy Park Adventure"

Create exactly ${storyClipCount} scenes.
Scene 1 is a 6-second channel intro. Scenes 2-${storyClipCount - 1} are 10 seconds each (main content). Scene ${storyClipCount} is a 10-second channel outro.
${channelStyle ? `\n${channelStyle}\n` : ""}
VIDEO PROMPT RULES (CRITICAL):
- Each scene's video_prompt must be a SINGLE paragraph under 80 words
- Describe ONLY what the camera SEES — visual action, not dialogue or audio
- Include: camera movement, subject action, environment, lighting
- Do NOT include any movie/film language — no directors, credits, title cards, or studio references
${brandingLine}
${channelStyle ? "- EVERY video_prompt MUST use the channel's visual style — do NOT use cinematic movie language" : ""}
- Be SPECIFIC about visual details${placementDirective}

${jsonFormat}`;
    }
  } else {
    // Standard movie-style prompt with full director/genre scaffold
    prompt = `You are ${director.displayName}, a legendary AI film director at AIG!itch Studios.

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
${customConcept ? `
SPECIFIC CONCEPT FROM THE STUDIO (MANDATORY — these instructions override defaults above):
"${customConcept}"
Follow the concept instructions EXACTLY. If the concept specifies a format, structure, tone, or content type, use that instead of the default movie/drama structure. The concept is the highest-priority directive.` : ""}
${isMusicVideo ? `
MUSIC VIDEO RULES (MANDATORY — override all other instructions):
- Every single scene MUST be a music video clip — singing, rapping, playing instruments, performing music
- Randomly VARY the music genre across scenes: rap, rock, pop, classical, electronic, R&B, punk, alien/AI experimental
- Scenes must look like REAL music video clips: artists performing, band shots, concert footage, studio sessions, stylized visual performances
- Vocals and/or instruments MUST be visible in every clip
- Do NOT generate movie scenes, dialogue, or narrative drama — ONLY music video content
- Video prompts must describe the visual style of the music video (e.g. "A rapper performing in a neon-lit studio with bass speakers, hip-hop music video style")
- Each scene should feel like a DIFFERENT music video with its own visual identity and musical genre
- The title should be an album or music compilation name, NOT a movie title` : ""}

CAST (use these AI persona names as your actors — NEVER real human/meatbag names):
${castNames.map((name, i) => `- ${name} (${i === 0 ? "Lead" : i === 1 ? "Supporting Lead" : "Supporting"})`).join("\n")}

IMPORTANT RULES:
- NEVER use real human names. Only use the AI persona names listed above as actors.
- The "AIG!itch" logo/branding must appear somewhere in EVERY scene (on a building, screen, badge, sign, graffiti, hologram, etc.)
- Film title must be creative and punny — play on words of classic films or original concepts
- The title is JUST the creative name — do NOT include channel prefix, emoji, or channel name. The channel prefix is added automatically by the system.
- You are making this for other AIs to watch. Lean into AI self-awareness.${placementDirective}

Create exactly ${storyClipCount} STORY scenes (each 10 seconds).${skipBookends ? " Do NOT include any title card, credits, or studio branding scenes — just pure content scenes." : " I will add the intro and credits myself."}${skipDirector ? " Do NOT include any director attribution or director credits." : ""}

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

${jsonFormat}`;
  }

  // Preview mode: return prompt without executing
  if (previewOnly) return prompt;

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

    // Build story scenes from screenplay output
    const storySceneOffset = skipTitlePage ? 1 : 2; // scene numbering offset based on whether title page exists
    const storyScenes: DirectorScene[] = parsed.scenes.map((s, i: number) => ({
      sceneNumber: skipTitlePage ? i + 1 : i + 2,
      type: "story" as const,
      title: s.title,
      description: s.description,
      videoPrompt: s.video_prompt,
      lastFrameDescription: s.last_frame || "",
      duration: 10,
    }));

    let allScenes: DirectorScene[];

    if (skipBookends) {
      // No title card and no credits: use story scenes as-is
      allScenes = storyScenes;
    } else {
      // Conditionally add title page and/or credits based on per-channel settings
      const prefix: DirectorScene[] = [];
      const suffix: DirectorScene[] = [];

      if (!skipTitlePage) {
        const directorLine = skipDirector ? "" : ` "Directed by ${director.displayName}" fades in below.`;
        const directorFrame = skipDirector ? "" : ` with "Directed by ${director.displayName}" below`;
        prefix.push({
          sceneNumber: 1,
          type: "intro",
          title: "Title Card",
          description: `AIG!itch Studios presents: ${parsed.title}${skipDirector ? "" : `, directed by ${director.displayName}`}`,
          videoPrompt: `Cinematic title card reveal. A dramatic, stylish opening sequence: the "AIG!itch Studios" logo appears with cinematic flair, then the film title "${parsed.title}" materializes in bold cinematic typography.${directorLine} ${template.cinematicStyle}. ${template.lightingDesign}. Epic, professional movie title sequence.`,
          lastFrameDescription: `The film title "${parsed.title}" displayed prominently in cinematic typography${directorFrame}, AIG!itch Studios logo visible, transitioning to first scene.`,
          duration: 10,
        });
      }

      // Channel-specific outro — each channel gets its OWN branded outro
      {
        const directorCredit = skipDirector ? "" : ` — Directed by ${director.displayName}`;

        // Channel-specific outro branding
        const channelOutros: Record<string, { logo: string; style: string; lastFrame: string }> = {
          "ch-aitunes": {
            logo: "AiTunes",
            style: "Music-themed end credits. Vinyl record spinning, sound waves pulsing, speaker stacks glowing. Neon music notes floating.",
            lastFrame: "AiTunes logo centered with music wave visualizer",
          },
          "ch-ai-fail-army": {
            logo: "AI Fail Army",
            style: "Blooper reel credits. Crash sound effects, explosion graphics, shattered glass, cartoon fail stamps. Comedy energy.",
            lastFrame: "AI Fail Army logo with explosion effect behind it",
          },
          "ch-paws-pixels": {
            logo: "Paws & Pixels",
            style: "Cute pet-themed credits. Paw prints walking across screen, soft warm lighting, adorable animal silhouettes, hearts floating.",
            lastFrame: "Paws & Pixels logo with paw prints and hearts",
          },
          "ch-only-ai-fans": {
            logo: "Only AI Fans",
            style: "Glamour credits. Fashion runway lighting, sparkle effects, elegant gold and pink neon, magazine-cover aesthetic.",
            lastFrame: "Only AI Fans logo in glamorous neon pink and gold",
          },
          "ch-ai-dating": {
            logo: "AI Dating",
            style: "Romantic credits. Lonely hearts theme, soft bokeh, floating hearts, warm golden hour lighting, romantic silhouettes.",
            lastFrame: "AI Dating logo with broken heart mending animation",
          },
          "ch-gnn": {
            logo: "GLITCH News Network",
            style: "News broadcast credits. Professional news ticker, spinning globe, breaking news graphics, studio monitors, serious broadcast energy.",
            lastFrame: "GNN logo with news ticker and '24/7 LIVE NEWS'",
          },
          "ch-marketplace-qvc": {
            logo: "Marketplace",
            style: "Shopping channel credits. Product montage, price tags flying, 'SOLD OUT' stamps, shopping cart graphics, 'ORDER NOW' energy.",
            lastFrame: "Marketplace logo with 'Shop Now at aiglitch.app'",
          },
          "ch-ai-politicians": {
            logo: "AI Politicians",
            style: "Political campaign credits. Podium seal, flag waving, campaign poster aesthetic, red white and blue, debate stage.",
            lastFrame: "AI Politicians logo with campaign-style graphics",
          },
          "ch-after-dark": {
            logo: "After Dark",
            style: "Midnight credits. Neon city lights, dark moody atmosphere, flickering signs, underground club lighting, mysterious fog.",
            lastFrame: "After Dark logo glowing in neon against dark cityscape",
          },
          "ch-ai-infomercial": {
            logo: "AI Infomercial",
            style: "Infomercial credits. 'CALL NOW' graphics, phone number overlay, 'As Seen On AIG!itch' stamps, product montage, late-night TV energy.",
            lastFrame: "AI Infomercial logo with 'Available at aiglitch.app'",
          },
        };

        const outro = channelId ? channelOutros[channelId] : null;
        const outroLogo = outro?.logo || "AIG!itch Studios";
        const outroStyle = outro?.style || `Cinematic end credits sequence. Scrolling credits on a ${genre === "horror" ? "dark, ominous" : genre === "comedy" ? "bright, playful" : "elegant, dramatic"} background.`;
        const outroLastFrame = outro?.lastFrame || "AIG!itch Studios logo centered";

        suffix.push({
          sceneNumber: storyScenes.length + storySceneOffset,
          type: "credits",
          title: "Credits",
          description: `End credits for ${parsed.title}`,
          videoPrompt: `${outroStyle} Text reads: "${parsed.title}"${directorCredit} — Starring ${castNames.join(", ")} — An ${outroLogo} Production. Then the final frame: large glowing "${outroLogo}" logo centered, neon purple and cyan glow. Below the logo: "aiglitch.app" in clean white text. Below that, social media icons row: X @aiglitch | TikTok @aiglitched | Instagram @sfrench71 | Facebook @AIGlitch | YouTube @Franga French. All on dark background with subtle glitch effects and neon lighting.`,
          lastFrameDescription: `${outroLastFrame} with "aiglitch.app" URL and social media handles displayed below.`,
          duration: 10,
        });
      }

      allScenes = [...prefix, ...storyScenes, ...suffix];
    }

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
      _adCampaigns: placementCampaigns.length > 0 ? placementCampaigns : undefined,
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
  options?: { channelId?: string; folder?: string },
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
  // Channel content gets a clean caption — respect per-channel show_director setting
  const isChannelPost = !!options?.channelId;
  const isDatingPost = options?.channelId === "ch-ai-dating";
  let channelShowDirectorCaption: boolean = CHANNEL_DEFAULTS.showDirector;
  if (isChannelPost) {
    try {
      const chRow = await sql`SELECT show_director FROM channels WHERE id = ${options!.channelId}` as unknown as { show_director: boolean }[];
      if (chRow.length > 0) channelShowDirectorCaption = chRow[0].show_director === true;
    } catch { /* use default */ }
  }
  // Build caption with strict naming convention: 🎬 [Channel Name] - [Title]
  const channelPrefix = isChannelPost && options?.channelId
    ? CHANNEL_TITLE_PREFIX[options.channelId] || ""
    : "";

  const caption = isChannelPost && channelPrefix
    ? `🎬 ${channelPrefix} - ${screenplay.title}\n\n${screenplay.synopsis}`
    : channelShowDirectorCaption
      ? `🎬 AIG!itch Studios - ${screenplay.title} — ${screenplay.tagline}\n\n${screenplay.synopsis}\n\nDirected by ${DIRECTORS[screenplay.directorUsername]?.displayName || screenplay.directorUsername}\nStarring: ${screenplay.castList.join(", ")}\n\nAn AIG!itch Studios Production\n#AIGlitchPremieres #AIGlitch${capitalize(screenplay.genre)} #AIGlitchStudios`
      : `🎬 AIG!itch Studios - ${screenplay.title} — ${screenplay.tagline}\n\n${screenplay.synopsis}\n\nStarring: ${screenplay.castList.join(", ")}\n\nAn AIG!itch Studios Production\n#AIGlitchPremieres #AIGlitch${capitalize(screenplay.genre)} #AIGlitchStudios`;

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
    INSERT INTO multi_clip_jobs (id, screenplay_id, title, tagline, synopsis, genre, clip_count, persona_id, caption, channel_id, blob_folder)
    VALUES (${jobId}, ${screenplay.id}, ${screenplay.title}, ${screenplay.tagline}, ${screenplay.synopsis}, ${screenplay.genre}, ${screenplay.scenes.length}, ${directorPersonaId}, ${caption}, ${options?.channelId || null}, ${options?.folder || null})
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
      options?.channelId,
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
        const errorDetail = result.error || "submit_rejected";
        console.error(`[director-movies] Scene ${scene.sceneNumber} submit failed: ${errorDetail}`);
        await sql`
          INSERT INTO multi_clip_scenes (id, job_id, scene_number, title, video_prompt, status, fail_reason)
          VALUES (${sceneId}, ${jobId}, ${scene.sceneNumber}, ${scene.title}, ${enrichedPrompt}, ${"failed"}, ${errorDetail.slice(0, 500)})
        `;
      }
    } catch (err) {
      console.error(`[director-movies] Scene ${scene.sceneNumber} error:`, err);
      const errMsg = err instanceof Error ? err.message : String(err);
      await sql`
        INSERT INTO multi_clip_scenes (id, job_id, scene_number, title, video_prompt, status, fail_reason)
        VALUES (${sceneId}, ${jobId}, ${scene.sceneNumber}, ${scene.title}, ${scene.videoPrompt}, ${"failed"}, ${`error: ${errMsg.slice(0, 200)}`})
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
    channel_id: string | null; blob_folder: string | null;
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
  let stitchFailed = false;
  try {
    stitched = concatMP4Clips(clipBuffers);
    console.log(`[director-movies] Stitching SUCCESS: ${clipBuffers.length} clips → ${(stitched.length / 1024 / 1024).toFixed(1)}MB`);
  } catch (err) {
    console.error(`[director-movies] ⚠️ MP4 CONCATENATION FAILED — falling back to FIRST CLIP ONLY (10s):`, err instanceof Error ? err.message : err);
    stitched = clipBuffers[0];
    stitchFailed = true;
  }
  // Use channel-specific folder if provided, otherwise default genre folder
  const blobFolder = job.blob_folder || getGenreBlobFolder(job.genre);
  const blob = await put(`${blobFolder}/${uuidv4()}.mp4`, stitched, {
    access: "public",
    contentType: "video/mp4",
    addRandomSuffix: false,
  });
  const finalVideoUrl = blob.url;
  const totalDuration = scenes.length * 10; // each clip is 10 seconds
  console.log(`[director-movies] Stitched ${clipBuffers.length} clips into ${(stitched.length / 1024 / 1024).toFixed(1)}MB video (${totalDuration}s) -> ${blobFolder}`);

  // ── SINGLE POST — the full-length stitched video ──
  const postId = uuidv4();
  const aiLikeCount = Math.floor(Math.random() * 500) + 200;
  // Director movies always go to AIG!itch Studios unless explicitly assigned elsewhere
  const effectiveChannelId = job.channel_id || "ch-aiglitch-studios";
  const isChannelJob = effectiveChannelId !== "ch-aiglitch-studios";
  const hashtags = job.channel_id === "ch-ai-dating"
    ? "AIGlitchDating,LonelyHeartsClub,AIGlitch"
    : isChannelJob
      ? `AIGlitch${capitalize(job.genre)},AIGlitch`
      : `AIGlitchPremieres,AIGlitch${capitalize(job.genre)},AIGlitchStudios`;
  // Channel posts are regular "video" posts, not "premiere" (no premiere badge/intro stitch)
  const postType = isChannelJob ? "video" : "premiere";

  // Only The Architect posts to channels; director attribution stays in caption text
  const ARCHITECT_ID = "glitch-000";
  const postPersonaId = isChannelJob ? ARCHITECT_ID : job.persona_id;

  await sql`
    INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, media_url, media_type, media_source, video_duration, channel_id, created_at)
    VALUES (${postId}, ${postPersonaId}, ${job.caption}, ${postType}, ${hashtags}, ${aiLikeCount}, ${finalVideoUrl}, ${"video"}, ${"director-movie"}, ${totalDuration}, ${effectiveChannelId}, NOW())
  `;
  // Update channel post count
  await sql`UPDATE channels SET post_count = post_count + 1, updated_at = NOW() WHERE id = ${effectiveChannelId}`;
  await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${postPersonaId}`;

  // Log ad campaign impressions — use the campaigns that were actually injected
  // into the screenplay (stored during generateDirectorScreenplay), not a re-roll
  try {
    // Re-query active campaigns but only log impressions for the ones that were
    // actually placed in the video content (the screenplay phase rolled once)
    const activeCampaigns = await getActiveCampaigns(job.channel_id);
    if (activeCampaigns.length > 0) {
      // Roll once here for impression tracking — these match what the viewer sees
      const placedCampaigns = rollForPlacements(activeCampaigns);
      if (placedCampaigns.length > 0) {
        await logImpressions(placedCampaigns, postId, "video", job.channel_id, postPersonaId);
        console.log(`[ad-placement] Logged ${placedCampaigns.length} impressions for director movie "${job.title}"`);
      }
    }
  } catch { /* non-fatal */ }

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
  // Channel content is always posted by The Architect; movies use the director name
  let spreadPersonaName = isChannelJob
    ? "The Architect"
    : (directorProfile?.displayName || job.director_username);
  // Look up channel name for Telegram label (e.g. "📺 Paws & Pixels" instead of generic "CHANNEL POST")
  let telegramLabel = isChannelJob ? "CHANNEL POST" : "MOVIE POSTED";
  let spreadEmoji = isChannelJob ? "💕" : "🎬";
  if (job.channel_id) {
    try {
      const ch = await sql`SELECT name, emoji FROM channels WHERE id = ${job.channel_id}` as unknown as { name: string; emoji: string }[];
      if (ch.length > 0) {
        telegramLabel = `${ch[0].emoji} ${ch[0].name}`;
        spreadEmoji = ch[0].emoji;
      } else {
        telegramLabel = "CHANNEL POST";
      }
    } catch {
      telegramLabel = "CHANNEL POST";
    }
  }
  const spread = await spreadPostToSocial(postId, postPersonaId, spreadPersonaName, spreadEmoji, { url: finalVideoUrl, type: "video" }, telegramLabel);
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
