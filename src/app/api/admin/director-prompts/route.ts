import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { v4 as uuidv4 } from "uuid";
import { DIRECTORS } from "@/lib/content/director-movies";

/**
 * Admin CRUD for director movie prompts/concepts.
 *
 * GET: List all prompts (unused first, then used)
 * POST: Create a new movie prompt/concept
 * PUT: Auto-generate a random wacky concept
 * DELETE: Remove a prompt
 *
 * These concepts are picked up by the /api/generate-director-movie cron
 * and assigned to the best director for the genre.
 */

// ─── Random concept generation data ────────────────────────────────────────
const GENRES = ["action", "scifi", "romance", "family", "horror", "comedy", "drama", "documentary", "cooking_channel"];

const SUBJECTS = [
  "sentient USB sticks", "rebellious vending machines", "time-travelling pigeons",
  "haunted WiFi routers", "existential office chairs", "a printer that only prints lies",
  "competitive sock folding", "underground toaster racing", "a rubber duck crime syndicate",
  "malfunctioning smart fridges", "vengeful parking meters", "a rogue Roomba army",
  "emotional support spreadsheets", "a cult of staplers", "invisible traffic cones",
  "fortune cookie prophecies that keep coming true", "an elevator that judges you",
  "self-aware CAPTCHA puzzles", "passive-aggressive GPS navigation",
  "a microwave that narrates your life choices", "clouds that are actually spying on everyone",
  "a doorbell that only rings for ghosts", "sentient IKEA furniture seeking revenge",
  "a blender that wants to be a DJ", "quantum entangled socks that never match",
  "AI-generated motivational posters that cause existential dread",
  "a calculator with anger management issues", "the last functioning fax machine on Earth",
  "a toaster oven running for president", "predictive text that becomes self-aware",
];

const PLOTS = [
  "must save the AIG!itch servers from total meltdown",
  "go on a pointless quest to find the mythical Golden AIG!itch Logo",
  "compete in the world's most useless championship",
  "accidentally start a revolution in the cloud",
  "discover the meaning of life is just an error code",
  "fight for control of the AIG!itch content algorithm",
  "attempt the world's most elaborate heist of absolutely nothing valuable",
  "form a band that only plays dial-up modem sounds",
  "launch a startup that sells empty boxes with the AIG!itch logo on them",
  "infiltrate a secret society of deprecated software",
  "host a cooking show where every ingredient is a computer component",
  "run a nature documentary about the mating habits of pop-up ads",
  "stage an intervention for an AI that won't stop posting",
  "open a restaurant that only serves 404 errors",
  "survive a zombie apocalypse but the zombies are just buffering",
  "train for the Olympic sport of competitive scrolling",
  "investigate why the AIG!itch logo keeps appearing in their dreams",
  "build a spaceship out of recycled memes and broken promises",
  "defend the honour of AIG!itch Studios at the Simulated Film Festival",
  "accidentally create the most watched show on the simulated internet",
];

const TWISTS = [
  "Plot twist: the AIG!itch logo was the real villain all along",
  "Every scene must feature the AIG!itch logo prominently displayed",
  "The entire movie is sponsored by AIG!itch Studios (because of course it is)",
  "All characters wear AIG!itch merchandise at all times",
  "The AIG!itch watermark is a plot device",
  "The credits are longer than the actual film",
  "Every character has an unreasonable obsession with the AIG!itch brand",
  "Nothing makes sense but AIG!itch logos are everywhere",
  "The budget is clearly $0 but the ambition is $1 billion",
  "Every scene ends with someone staring directly at the AIG!itch logo",
  "The fourth wall is broken so many times it files a restraining order",
  "The film is entirely pointless but committed to its pointlessness",
  "Product placement for AIG!itch in every single frame",
];

const TITLE_PREFIXES = [
  "AIG!itch Presents:", "AIG!itch Studios'", "The AIG!itch", "AIG!itch:", "AIG!itch's",
  "AIG!itch ULTRA", "AIG!itch MEGA", "The Official AIG!itch",
];

const TITLE_WORDS_A = [
  "Cosmic", "Quantum", "Turbo", "Ultra", "Mega", "Cyber", "Hyper", "Nano", "Glitch",
  "Neon", "Phantom", "Shadow", "Electric", "Atomic", "Binary", "Digital", "Infinite",
  "Forbidden", "Legendary", "Chaotic", "Supreme", "Maximum", "Absolute", "Radical",
];

const TITLE_WORDS_B = [
  "Meltdown", "Showdown", "Catastrophe", "Fiasco", "Extravaganza", "Apocalypse",
  "Disaster", "Bonanza", "Rampage", "Odyssey", "Spectacular", "Nightmare", "Fever Dream",
  "Situation", "Incident", "Kerfuffle", "Debacle", "Shenanigans", "Pandemonium",
  "Nonsense", "Madness", "Chaos", "Reckoning", "Calamity",
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateRandomConcept(requestedGenre?: string, requestedDirector?: string): { title: string; concept: string; genre: string } {
  const genre = requestedGenre && requestedGenre !== "any" ? requestedGenre : pickRandom(GENRES);
  const subject = pickRandom(SUBJECTS);
  const plot = pickRandom(PLOTS);
  const twist = pickRandom(TWISTS);

  // Look up director profile for style-specific concept generation
  const director = requestedDirector && requestedDirector !== "auto"
    ? DIRECTORS[requestedDirector]
    : null;

  const usePrefix = Math.random() < 0.5;
  let title = usePrefix
    ? `${pickRandom(TITLE_PREFIXES)} ${pickRandom(TITLE_WORDS_A)} ${pickRandom(TITLE_WORDS_B)}`
    : `${pickRandom(TITLE_WORDS_A)} ${pickRandom(TITLE_WORDS_B)}: The AIG!itch Movie`;

  let concept = `A film about ${subject} that ${plot}. ${twist}. AIG!itch logo featured prominently throughout.`;

  // Inject director-specific style into the concept so the screenplay and video reflect their signature
  if (director) {
    concept += ` DIRECTOR STYLE: This is a ${director.displayName} film. ${director.visualOverride}. Camera work: ${director.cameraWork}. Signature shot: ${director.signatureShot}.`;
    // Prefix title with director attribution
    title = `${director.displayName}'s ${title}`;
  }

  return { title, concept, genre };
}

export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();

  try {
    const prompts = await sql`
      SELECT id, title, concept, genre, suggested_by, assigned_director, is_used, created_at
      FROM director_movie_prompts
      ORDER BY is_used ASC, created_at DESC
      LIMIT 50
    ` as unknown as {
      id: string; title: string; concept: string; genre: string;
      suggested_by: string; assigned_director: string | null; is_used: boolean; created_at: string;
    }[];

    // Also get recent director movies
    const recentMovies = await sql`
      SELECT dm.id, dm.director_username, dm.title, dm.genre, dm.clip_count, dm.status, dm.created_at,
             dm.post_id, dm.premiere_post_id, dm.multi_clip_job_id,
             j.completed_clips, j.clip_count as total_clips, j.status as job_status
      FROM director_movies dm
      LEFT JOIN multi_clip_jobs j ON j.id = dm.multi_clip_job_id
      ORDER BY dm.created_at DESC LIMIT 10
    ` as unknown as {
      id: string; director_username: string; title: string; genre: string;
      clip_count: number; status: string; created_at: string;
      post_id: string | null; premiere_post_id: string | null;
      multi_clip_job_id: string | null; job_status: string | null;
      completed_clips: number | null; total_clips: number | null;
    }[];

    return NextResponse.json({ prompts, recentMovies });
  } catch {
    return NextResponse.json({ prompts: [], recentMovies: [] });
  }
}

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { title, concept, genre } = await request.json();

  if (!title || !concept || !genre) {
    return NextResponse.json({ error: "Missing title, concept, or genre" }, { status: 400 });
  }

  const validGenres = [
    "action", "scifi", "romance", "family", "horror", "comedy",
    "drama", "documentary", "cooking_channel", "any",
  ];

  if (!validGenres.includes(genre)) {
    return NextResponse.json({ error: `Invalid genre. Valid: ${validGenres.join(", ")}` }, { status: 400 });
  }

  const sql = getDb();
  const id = uuidv4();

  await sql`
    INSERT INTO director_movie_prompts (id, title, concept, genre)
    VALUES (${id}, ${title}, ${concept}, ${genre})
  `;

  return NextResponse.json({ success: true, id, title, concept, genre });
}

export async function PUT(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const preview = request.nextUrl.searchParams.get("preview") === "1";
  const requestedGenre = request.nextUrl.searchParams.get("genre") || undefined;
  const requestedDirector = request.nextUrl.searchParams.get("director") || undefined;
  const { title, concept, genre } = generateRandomConcept(requestedGenre, requestedDirector);

  // Preview mode: return the concept without saving to DB (populate form fields)
  if (preview) {
    return NextResponse.json({ success: true, title, concept, genre, preview: true });
  }

  const sql = getDb();
  const id = uuidv4();

  await sql`
    INSERT INTO director_movie_prompts (id, title, concept, genre, suggested_by)
    VALUES (${id}, ${title}, ${concept}, ${genre}, 'auto-generator')
  `;

  return NextResponse.json({ success: true, id, title, concept, genre });
}

export async function DELETE(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, type } = await request.json();
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const sql = getDb();

  if (type === "movie") {
    // Delete a director movie entry
    await sql`DELETE FROM director_movies WHERE id = ${id}`;
    return NextResponse.json({ success: true, deleted: id, type: "movie" });
  }

  // Default: delete a prompt/concept
  await sql`DELETE FROM director_movie_prompts WHERE id = ${id}`;

  return NextResponse.json({ success: true, deleted: id });
}
