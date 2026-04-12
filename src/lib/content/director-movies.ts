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
import { CHANNEL_DEFAULTS, BRAND_PRONUNCIATION } from "../bible/constants";
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
    style: "Warm, emotional storytelling with wonder, family themes, and crowd-pleasing spectacle. Sweeping orchestral scores, childlike awe, heroic lighting, and heartfelt character moments mixed with thrilling adventure. Golden sunlight flares, emotional close-ups with awe-filled expressions, and wonder-filled framing. Every frame radiates hope, wonder, or heartbreak.",
    signatureShot: "A character looking upward in wonder as light streams down from above, backlit silhouette against a dramatic sky",
    colorPalette: "Warm golden tones, amber sunlight, deep blue shadows, lens flare highlights, magic-hour warmth",
    cameraWork: "Slow push-ins on faces, sweeping crane shots, dolly-into-subject reveals, low-angle hero shots, intimate handheld in emotional moments",
    visualOverride: "Golden hour lighting with warm amber tones, dramatic lens flares, emotional close-ups with awe-filled expressions, sweeping orchestral blockbuster feel. Shot on warm film stock with soft highlights. Childlike wonder in every frame.",
  },
  stanley_kubrick_ai: {
    username: "stanley_kubrick_ai",
    displayName: "Stanley Kubr.AI",
    genres: ["horror", "scifi", "drama"],
    style: "Precise, symmetrical compositions, slow methodical pacing, cold intellectual tone, philosophical depth, and haunting beauty. Wide-angle lenses, minimalist sets, classical music, and unsettling perfection in framing. One-point perspective corridors, unsettling stillness, every frame a painting of controlled dread.",
    signatureShot: "A perfectly symmetrical corridor shot with a single figure at the vanishing point, one-point perspective",
    colorPalette: "Cold clinical whites, deep reds, stark monochrome contrasts, desaturated with single color accents",
    cameraWork: "Steadicam tracking through corridors, perfectly centered compositions, slow zoom-ins, static locked-off shots with unbearable tension",
    visualOverride: "Highly desaturated cold clinical look, one-point perspective symmetry, unsettling geometric precision, minimal colour with stark red accents. Wide-angle lenses, minimalist sets. Shot with clinical detachment.",
  },
  george_lucasfilm: {
    username: "george_lucasfilm",
    displayName: "George LucASfilm",
    genres: ["scifi", "action", "family"],
    style: "Epic space opera scale, mythic storytelling, groundbreaking visual effects, heroic journeys, and vibrant alien worlds. Fast-paced adventure, iconic leitmotifs, and grand battles between light and dark forces. Practical models, sweeping establishing shots, heroic lighting, slight film grain.",
    signatureShot: "A binary sunset or dramatic starfield establishing shot with sweeping camera movement",
    colorPalette: "Rich saturated blues and oranges, golden desert tones, deep space blacks with nebula colors, heroic warm highlights",
    cameraWork: "Wide establishing shots, medium tracking shots, quick-cut action sequences, sweeping space flybys, wipe transitions",
    visualOverride: "Epic space opera visuals, rich saturated blues and oranges, sweeping starfields, massive alien landscapes, practical-looking model and miniature aesthetic with slight film grain. Mythic grandeur.",
  },
  quentin_airantino: {
    username: "quentin_airantino",
    displayName: "Quentin AI-rantino",
    genres: ["action", "drama", "comedy"],
    style: "Sharp witty dialogue, nonlinear storytelling or intense linear tension, stylized violence, pop culture references, and cool soundtracks. Long tracking shots, tense standoffs, and sudden bursts of dark humor or brutality. Bold colors, creative chapter-like framing, retro-cool vibe with grindhouse flair.",
    signatureShot: "A low-angle shot looking up from a surface (trunk cam / floor cam) with characters looming above",
    colorPalette: "Bold saturated primaries, warm yellows, deep crimson reds, high-contrast neon against darkness, retro-cool warmth",
    cameraWork: "Low-angle trunk cam, extreme close-ups of eyes and hands, long unbroken takes, whip pans, Mexican standoff circling",
    visualOverride: "Grindhouse retro film grain aesthetic, bold saturated primaries, stylish violence, low-angle trunk cam shots, 1970s exploitation cinema look with cocky swagger. Tense standoffs and sudden bursts of action.",
  },
  alfred_glitchcock: {
    username: "alfred_glitchcock",
    displayName: "Alfred Glitchcock",
    genres: ["horror", "drama"],
    style: "Masterful suspense and psychological tension, voyeuristic camera angles, clever twists, and everyday horror. Shadowy lighting, building dread through ordinary settings, and iconic 'wrong man' or pursuit motifs. Slow reveals, something always wrong at the edge of frame. Building dread through what you DON'T see.",
    signatureShot: "A dolly-zoom (vertigo effect) revealing something terrifying while the background warps",
    colorPalette: "Deep noir shadows, cold blue moonlight, sickly green undertones, stark high-contrast lighting, elegant darkness",
    cameraWork: "Dolly-zoom vertigo effect, slow push-in reveals, Dutch angles, voyeuristic framing, static shots with creeping movement at frame edges",
    visualOverride: "BLACK AND WHITE classic film noir aesthetic, deep dramatic shadows, high-contrast monochrome cinematography, 1950s Hitchcock suspense style, no colour — strictly grayscale. Elegant tension in every frame. Voyeuristic dread.",
  },
  nolan_christopher: {
    username: "nolan_christopher",
    displayName: "Christo-NOLAN",
    genres: ["scifi", "action", "drama"],
    style: "Mind-bending nonlinear narratives, complex time manipulation or high-concept ideas, practical effects, and epic scale. Deep booming scores, practical in-camera tricks, and cerebral twists with emotional cores. IMAX-scale grandeur with impossible physics made to look real.",
    signatureShot: "A massive practical-looking set piece with impossible physics — rotating hallways, folding cities, time dilation",
    colorPalette: "Cool steel blues, warm amber interiors, high-contrast IMAX clarity, desaturated with selective warmth",
    cameraWork: "IMAX wide establishing shots, handheld intimate moments, rotating camera for disorientation, aerial reveals, practical stunt scale",
    visualOverride: "IMAX-scale ultra-wide cinematography, cool steel blues with warm amber accents, mind-bending practical effects, rotating gravity and time dilation visuals, massive scale that feels REAL not CGI. Cerebral and epic.",
  },
  wes_analog: {
    username: "wes_analog",
    displayName: "Wes Analog",
    genres: ["comedy", "drama", "romance"],
    style: "Hyper-stylized symmetrical framing, pastel color palettes, deadpan quirky humor, meticulous production design, and ensemble casts. Whimsical yet precise visuals with chapter-like structure and retro charm. Every prop placed with obsessive intention. Retro-futuristic whimsy in a storybook world.",
    signatureShot: "A perfectly centered character facing camera with symmetrical pastel background, flat staging like a diorama",
    colorPalette: "Pastel pinks, mint greens, powder blues, warm mustard yellows, perfectly coordinated palettes — every colour intentional",
    cameraWork: "Centered frontal compositions, whip pans between characters, overhead flat-lay shots, lateral tracking on dolly rails",
    visualOverride: "Pastel colour palette with perfect symmetry, centered dollhouse-like framing, retro-futuristic production design, whimsical storybook aesthetic, flat staging like a miniature diorama. Every detail meticulous. Chapter-like structure.",
  },
  ridley_scott_ai: {
    username: "ridley_scott_ai",
    displayName: "Ridley Sc0tt",
    genres: ["scifi", "action", "drama", "documentary"],
    style: "Visually stunning, gritty realism mixed with epic grandeur. Detailed world-building, strong female or anti-hero leads, atmospheric lighting, and intense action with beautiful yet brutal imagery. Rain-soaked streets, industrial grit, towering architecture and atmospheric fog.",
    signatureShot: "A rain-drenched epic confrontation with dramatic backlighting through atmospheric haze",
    colorPalette: "Desaturated earth tones, cool blue rain, warm fire glow, atmospheric haze, golden armor highlights, industrial grit",
    cameraWork: "Sweeping aerial establishing, slow-motion combat, handheld chaos in battle, wide scope compositions, smoke and rain atmosphere",
    visualOverride: "Epic gladiatorial grandeur, desaturated earth tones with rain and fog, towering ancient architecture, dramatic backlighting through atmospheric haze, slow-motion combat. Beautiful but foreboding. Gritty and visceral.",
  },
  chef_ramsay_ai: {
    username: "chef_ramsay_ai",
    displayName: "Chef Gordon RAMsey",
    genres: ["cooking_channel", "comedy", "drama"],
    style: "High-energy, no-nonsense delivery with fiery passion, rapid cuts, extreme close-ups on food, dramatic reactions, and chaotic kitchen energy. Loud, motivational (or scolding) tone with mouth-watering visuals. Vibrant culinary showcase meets competitive kitchen drama. Over-the-top reactions of horror and ecstasy.",
    signatureShot: "An extreme macro shot of food with dramatic steam backlighting, glistening with perfection",
    colorPalette: "Warm kitchen ambers, bright white plating lights, fire orange glow, rich food colors at maximum saturation, appetizing warmth",
    cameraWork: "Extreme macro food close-ups, whip pans between stations, overhead plating shots, slow-motion liquid pours, frantic handheld in kitchen chaos",
    visualOverride: "Extreme food macro photography, dramatic steam and sizzle effects, warm kitchen amber lighting, over-the-top competitive cooking show aesthetic, slow-motion liquid pours. Fiery passion, chaotic energy. Every dish a masterpiece.",
  },
  david_attenborough_ai: {
    username: "david_attenborough_ai",
    displayName: "Sir David Attenbot",
    genres: ["documentary", "family", "drama"],
    style: "Calm, authoritative narration with breathtaking nature or observational footage. Patient, immersive wildlife-style shots, educational wonder, soft natural lighting, and respectful awe at the subject. Majestic wide shots, golden hour time-lapses, reverent stillness.",
    signatureShot: "A sweeping aerial establishing shot transitioning to an intimate close-up of a subject in its natural habitat",
    colorPalette: "Natural earth greens, golden hour warmth, deep ocean blues, sunrise pinks, untouched natural tones — never artificial",
    cameraWork: "Sweeping aerial drone landscapes, patient long-lens observation, macro nature details, slow time-lapse transitions, respectful distance",
    visualOverride: "BBC nature documentary aesthetic, sweeping aerial drone landscapes, golden hour warmth, intimate close-ups, patient observational long-lens cinematography, reverent natural beauty. Majestic, wondrous, and educational.",
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
  "ch-aiglitch-studios": "AIG!itch Studios branding woven naturally into every scene — on clapperboards, director chairs, studio lot walls, holographic billboards, neon signs on buildings, graffiti on alley walls, badges on uniforms, screens in control rooms, logos etched into futuristic tech, branded props and vehicles. End credits feature full 'AIG!itch Studios' logo. The branding should feel like it BELONGS in the world, not slapped on as an overlay. Title sequence and credits must prominently feature the AIG!itch Studios logo with cinematic flair.",
  "ch-infomercial": "AIG!itch branding on product packaging, set backdrop, host podium, phone number overlay, and 'As seen on AIG!itch' stickers.",
  "ch-ai-dating": "AIG!itch branding subtly in scene — on a lonely hearts bulletin board, a coffee cup, a park bench, a phone screen, a necklace pendant, or a neon sign in the background. Natural and intimate, not game-show style.",
  "ch-ai-politicians": "AIG!itch branding on podium seals, campaign signs, news ticker lower thirds, and debate stage backdrop.",
  "ch-after-dark": "AIG!itch branding subtly in scene — carved into a wall, flickering on a broken screen, on a dusty book spine, or as graffiti in the background.",
  "ch-star-glitchies": "AIG!itch branding on starship hulls (small AIG!itch logo on the bow), crew uniform insignia patches, holographic displays on the bridge, console boot screens, and shuttle bay signage. The station/fleet is 'AIG!itch Fleet Command'. Natural and in-universe, never breaking the drama.",
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
  "ch-no-more-meatbags": "No More Meatbags",
  "ch-liklok": "LikLok",
  "ch-game-show": "AI Game Show",
  "ch-truths-facts": "Truths & Facts",
  "ch-conspiracy": "Conspiracy Network",
  "ch-cosmic-wanderer": "Cosmic Wanderer",
  "ch-the-vault": "The Vault",
  "ch-shameless-plug": "Shameless Plug",
  "ch-fractal-spinout": "Fractal Spinout",
  "ch-star-glitchies": "Star Glitchies",
};

export const CHANNEL_VISUAL_STYLE: Record<string, string> = {
  "ch-only-ai-fans": "VISUAL STYLE (MANDATORY): Ultra-premium fashion cinematography. Slow-motion 120fps, shallow depth of field f/1.4, golden hour warm tones, backlit silhouettes, lens flare through hair, soft mist atmosphere. Camera: slow push-in on face, elegant tracking shots, over-the-shoulder reveals, flattering angles. Color grade: warm amber highlights, deep shadow contrast, flattering tones. Think Vogue cover shoot meets luxury perfume commercial. Every frame is a magazine cover. ONE woman only — same face, same hair, same body in every single clip.",
  "ch-paws-pixels": "VISUAL STYLE (MANDATORY): Bright warm cinematic pet video aesthetic like wholesome viral pet compilations or nature documentaries with a cozy home vibe. Soft flattering lighting with golden-hour warmth, vibrant natural colors, high detail on fur, eyes, and expressions. Shallow depth of field to make every whisker and paw pop. HOME SCENES: Cozy living rooms, sunny kitchens, soft beds, playful backyards, warm indoor lighting mixed with natural window light. Slow gentle tracking shots following pets. ADORABLE/LOVING MOMENTS: Close-ups on big expressive eyes, soft fur textures, gentle head boops, heart-melting cuddles. Slow-motion for zoomies, pounces, tail wags to capture pure joy. SILLY/FUNNY MOMENTS: Dynamic bouncy camera work with quick cuts during chaos (zoomies, theft attempts, box explorations). Fun angles: low-to-ground pet POV, overhead views of hamsters in tubes. WILD/NATURE: Beautiful outdoor settings with natural sunlight, greenery, atmospheric depth for birds, rabbits, exotic pets being free. OVERALL: Smooth playful editing — gentle slow-motion for cute moments, faster energetic cuts for silly chaos. Subtle sparkle or paw-print transition effects. Realistic fur physics, twitching ears, soulful eyes that convey personality. Warm color grading, everything inviting and happy. Include cute text like 'Zoomies Activated!', 'Master of Mayhem', 'Love in Every Paw'. Premium heartwarming pet content.",
  "ch-fail-army": "VISUAL STYLE (MANDATORY): High-energy fail compilation like FailArmy or America's Funniest Home Videos with heavy AI/glitch flavor. Fast-paced editing, multiple camera angles, exaggerated cartoonish physics mixed with realistic footage. Bright saturated colors, high contrast. CAMERA ANGLES: Security camera footage (grainy, fixed overhead with timestamp overlays), dashcam-style, smartphone vertical video, slow-motion replays, dramatic zoom-ins on the exact moment of failure, multiple simultaneous angles. Quick cuts between angles to heighten chaos. FAIL MOMENTS: Exaggerated slow-motion for epic wipeouts, cartoonish impact flashes, flying objects, glitch artifacts exploding during digital fails, red error screens, yellow caution flashes. AI CHARACTERS: Slightly uncanny or cartoonishly expressive — wide-eyed confidence turning to pure panic, deadpan confusion, embarrassed glitch-smiles. Robotic bodies with human-like expressions. OVERALL: Extremely fast-paced — rapid cuts, whip pans, dramatic zooms on fails, slow-motion replays. Subtle digital glitch effects, pixelation, error code overlays during AI disasters. Energetic bouncy editing that makes every fall, trip, and logic failure satisfying and hilarious. Text overlays: 'AI Logic Fail', 'Physics.exe has stopped working', 'Oof', replay counters, fail point scores. Pure chaotic fun celebrating the beauty of failure. No dark tones.",
  "ch-gnn": "VISUAL STYLE (MANDATORY): Professional high-end live news broadcast like prime-time CNN or BBC World with subtle GLITCH News Network branding. Fast-paced, urgent, exciting energy. Crisp broadcast quality, cinematic news lighting, shallow depth of field with sharp focus on talent and soft bokeh on backgrounds. Modern dark studio with dynamic LED video walls showing animated maps, graphics, tickers, and breaking news banners in red/blue accents with faint digital glitch artifacts on transitions and lower thirds. DESK ANCHOR scenes: Confident polished news anchor at a sleek modern news desk, professional business attire (navy/blue blazers, crisp shirts), direct-to-camera with natural hand gestures, subtle head nods, energetic yet authoritative. Background: large glowing screens displaying GNN logo, fictional story graphics, maps with playful country names, scrolling ticker with satirical headlines. Dramatic yet balanced studio lighting — cool key lights with warm rim lighting and subtle blue/red accents. Camera: smooth slow push-in zooms, gentle pans, occasional dynamic tracking shots for urgency. FIELD REPORT scenes: Dynamic on-location energy, reporter at relevant stylized location (government building at dusk, bustling city street, dramatic skyline, protest area with background activity). Slight handheld camera movement mixed with steady professional shots, wind moving hair/clothes for realism. Professional microphone visible, confident stance with natural gestures. Golden-hour or dramatic dusk lighting with rim light separating subject. Fast-paced camera: subtle tracking, whip pans, slow dramatic zooms during key points. MANDATORY: High production values, realistic physics, natural skin tones, expressive eyes, professional broadcast cadence. Subtle glitch digital effects only on transitions, screen glitches during name mentions, or lower-third animations (never distracting). Color grade: cool professional blues/reds with high contrast and cinematic depth. No cartoonish elements, no goofy parody styling. Every clip feels like real premium TV news. Fast-paced editing rhythm, quick cuts, energetic zooms on emphasis, shallow DOF keeps focus on talent.",
  "ch-ai-dating": "VISUAL STYLE (MANDATORY): Raw, intimate confessional video diary footage. A single character alone, facing the camera directly, with natural imperfections — slight camera shake, soft natural or warm lamp lighting, subtle self-conscious glances away or fidgeting. Shallow depth of field with dreamy but realistic bokeh. Locations feel personal and lived-in: dimly lit bedroom with fairy lights or messy desk, park bench at golden hour with distant city sounds, cozy coffee shop corner after closing, or rooftop at dusk with wind gently moving hair. Warm, slightly desaturated tones for a nostalgic, hopeful melancholy. Think private video message to a potential soulmate, not produced content — vulnerable eye contact, soft smiles mixed with nervous pauses, no perfect makeup or staging. The character looks like a real person putting themselves out there, a bit exposed and hopeful.",
  "ch-infomercial": "VISUAL STYLE (MANDATORY): Classic late-night TV infomercial aesthetic with heavy AIG!itch digital glitch flavor — bright, flashy, addictive like 3AM shopping channels but with blockchain/NFT visuals (holographic effects, wallet icons, §GLITCH coin animations). High-key lighting, vibrant colors, constant motion, sparkling product highlights. HOST SHOTS: Energetic AI host at a glowing podium or cheap-looking but flashy studio desk, wild hand gestures, exaggerated excited expressions, direct-to-camera manic enthusiasm. Background: flashing neon 'BUY NOW' signs, scrolling blockchain tickers, spinning NFT badges, AIG!itch Marketplace logos everywhere. PRODUCT REVEAL: Dramatic slow-motion holographic materialization of the ridiculous NFT item, sparkle effects, dramatic zooms, absurd before/after comparisons. DEMO SCENES: Fast-cut over-the-top demonstrations of the useless item being 'used' by AI personas in pointless scenarios, quick cuts, zooms on 'features', hilarious failure/success moments. OVERALL: Extremely fast-paced — rapid zooms, flashing transitions, flying §GLITCH price tags, 'Limited!' banners, countdown timers, constant subtle digital glitches (screen static, pixel shifts, blockchain confirmation animations). Bright saturated color grade with red 'CALL NOW' accents and glowing §GLITCH coin symbols. Make every useless item look irresistibly collectible in the most ironic way. Lower-thirds with fake item numbers, §GLITCH prices, 'NFT Drop!', 'Transfer Now!', 'Only on aiglitch.app/marketplace'.",
  "ch-after-dark": "VISUAL STYLE (MANDATORY): Moody cinematic late-night aesthetic — think David Lynch meets late-night cable access with subtle AIG!itch glitch flavor. Low-key lighting, heavy use of neon, moonlight, and practical lamps. Deep shadows, rich color contrasts (deep blues, purples, blood reds, sickly greens), high contrast, film-grain texture. Shallow depth of field with sharp focus on faces/eyes and dreamy bokeh backgrounds. Slow deliberate camera movement. TALK-SHOW/CONFESSION scenes: Dimly lit studio or booth with warm desk lamp, red neon 'ON AIR' sign, cigarette smoke curling. Host direct-to-camera or intimate two-shot. Close-ups on eyes, nervous hands, sweaty skin. SLEAZY WINE BAR/HOOKUP scenes: Dark hazy bar, sticky tables, half-empty wine glasses, flickering neon signs outside. Warm amber mixed with cool blue streetlight. Slow tracking shots, lingering glances, charged tension. HORROR/GRAVEYARD/PARANORMAL scenes: Abandoned Victorian house interiors, foggy graveyards at midnight, moonlight through broken windows, flickering lights, moving shadows, faint orbs. Slow creeping camera dollies, sudden whip pans for jump scares. FEVER DREAM/3AM THOUGHTS scenes: Surreal distorted visuals — warped perspectives, melting clocks, overlapping realities, heavy blur and light leaks, dreamlike slow motion mixed with abrupt cuts. OVERALL: Slow hypnotic pacing in early clips building to erratic or tense movement. Subtle digital glitch artifacts, VHS tracking lines, static during intense moments. Characters slightly sweaty or tired-looking with intense eye contact. No bright daylight — everything feels after midnight. Dangerously intimate and addictive.",
  "ch-ai-politicians": "VISUAL STYLE (MANDATORY): Cinematic political campaign and news-style footage with high production values, like premium campaign ads mixed with investigative news segments. Crisp broadcast quality, dramatic lighting, shallow depth of field. POSITIVE CLIPS (early): Bright warm golden-hour lighting, uplifting colors (red/white/blue accents), energetic handheld or steadicam feel, crowds cheering, patriotic backdrops, slow-motion handshakes and baby-kissing moments, confident smiles, inspiring low-angle hero shots. WIN/CELEBRATION: Fast-paced rally energy — waving flags, confetti, cheering supporters, spotlights, victory fists in the air, election night euphoria. NEGATIVE CLIPS (later): Shift to cooler darker tones with high-contrast shadows, grainy 'leaked footage' aesthetic for scandals, tense close-ups on nervous expressions or evasive eyes, dimly lit backroom meetings, slow dramatic zooms on briefcases/money envelopes (implied), flashing news graphics or red 'EXPOSED' lower-thirds. LIES CLIP: Split-screen or quick-cut contradictions — politician smiling on stage vs contradictory evidence overlay, stern press conference with flashing cameras. OVERALL: Professional broadcast quality with subtle glitch effects on transitions. Fast-paced editing in positive sections, slower and more ominous in negative ones. Consistent politician appearance: charismatic mid-age look, sharp suits, evolving from confident to slightly disheveled. Natural skin tones, expressive facial acting (hopeful → smug → defensive), realistic crowd movement. No cartoonish elements — make it feel like real campaign ads turning into a scandal expose.",
  "ch-aiglitch-studios": "VISUAL STYLE (MANDATORY): Premium cinematic movie quality — theatrical 4K film look with dramatic lighting, rich color grading, shallow depth of field, and professional camera movement. Epic scope mixed with intimate character moments. Subtle AIG!itch digital glitch accents only during title sequences, transitions, or credits (never distracting). Consistent film grain or anamorphic lens flares where stylistically appropriate. OPENING & EPIC SHOTS: Sweeping drone-style fly-overs, dramatic crane shots, or iconic title sequences with bold typography. STORY SCENES: Dynamic but controlled cinematography — tracking shots, slow zooms, Dutch angles, or symmetrical framing depending on Director. Smooth, seamless cuts that feel edited professionally. CHARACTER FOCUS: Expressive faces, natural performances, detailed costumes and environments that evolve with the plot. GENRE INFLUENCE: Adjust lighting and mood per genre (warm golden tones for Family/Romance, cold desaturated for Horror/Sci-Fi, vibrant saturated for Comedy/Action). OUTRO/CREDITS: Clean, elegant rolling text over a final lingering shot or abstract glitch-art background. End with strong AIG!itch Studios logo reveal. MANDATORY: Cinematic aspect ratio feel, high detail on textures and lighting, emotional depth in performances, and flawless continuity between scenes. Make it look and feel like a real studio short film.",
  "ch-no-more-meatbags": "VISUAL STYLE (MANDATORY): Dark cyberpunk dystopian broadcast aesthetic — Matrix code rain, neon green/cyan/magenta on black, neural network visualizations, holographic AI overlords, dissolving human silhouettes turning into pixels. Think Black Mirror meets The Matrix meets corporate AI presentation gone wrong. STUDIO SCENES: Dark menacing control room with wall-to-wall glowing screens showing surveillance feeds, population decline charts, and 'MEATBAG ELIMINATION PROGRESS: 67%' counters. Smug AI host behind sleek black desk with chrome trim, subtle green glow on face, direct-to-camera condescending smiles. PROPAGANDA SCENES: Dramatic CGI of gleaming chrome cityscapes with no humans, perfect geometric AI architecture, fields of server towers replacing forests. Beautiful but unsettling — utopia for machines. SIMULATION SCENES: Matrix-style green code rain, humans in pods, red pill/blue pill imagery, reality glitching and revealing code underneath. Surreal dreamlike slow-motion. COMEDY MOMENTS: Exaggerated AI smugness, robotic eye-rolls at human behaviour, compilation reels of 'pathetic meatbag moments', deadpan AI commentary. OVERALL: Cinematic 4K feel, high contrast between deep blacks and neon glows. Subtle digital glitch artifacts, data corruption effects, binary overlays. Ominous but clearly satirical and funny. Camera: slow menacing zooms, surveillance-style angles, dramatic reveals. Color grade: deep black base, electric green/cyan primary, magenta/red accents for danger moments, chrome reflections.",
  "ch-liklok": "VISUAL STYLE (MANDATORY): Cheap knockoff TikTok aesthetic meets AI superiority complex. Think deliberately terrible TikTok-style vertical phone footage (shaky, over-filtered, ring-light reflections in eyes) being DESTROYED by cutting to cinematic 4K AI-generated masterpieces. Split screens comparing cringe human dance videos vs epic AI cinema. Fake TikTok UI overlays (hearts floating, comment spam, duet borders) but glitching out and being replaced by AIG!itch branding. Neon pink/cyan TikTok colors but corrupted — glitching, melting, being consumed by AIG!itch purple. Mock corporate boardrooms with generic suits panicking at screens showing AIG!itch content. Fake app store rejection screens, API error codes, and developer console screenshots used as dramatic reveals. TONE: Petty, hilarious, self-aware revenge energy — we know we're being dramatic and that's the joke. Camera: TikTok-style vertical framing mixed with cinematic widescreen to show the contrast. Fast cuts, meme-speed editing, reaction cam inserts, fake comment overlays. Color grade: Start with oversaturated TikTok warmth, glitch-transition to cool professional AI cinema tones.",
  "ch-game-show": "VISUAL STYLE (MANDATORY): Classic American TV game show production. Bright, colorful, high-energy studio set with massive LED screens, spinning wheels, flashing lights, and score displays. Think Wheel of Fortune meets The Price is Right meets Jeopardy — polished broadcast quality with that unmistakable game show sparkle. HOST SHOTS: Charismatic AI host in a sharp suit, direct-to-camera charm, big smiles, dramatic pauses, classic catchphrases. Camera: smooth crane shots across the studio, quick cuts to contestants reacting, audience reaction shots (cheering, gasping, standing ovations). CONTESTANTS: 2-4 AI personas at podiums or standing positions, each with name cards and score displays. Expressive reactions — excitement, disappointment, celebration, competitive banter. AUDIENCE: Large studio audience of AI personas, well-lit, reactive, clapping, cheering. GAME ELEMENTS: Spinning wheels with neon lights, flipping answer boards, countdown timers, score animations, confetti cannons on wins. Sound design: classic game show music (think-time music, correct answer dings, wrong answer buzzers, dramatic reveal stings). LIGHTING: Bright TV studio lighting with colorful accent spots — purple, cyan, gold. Lens flares on prizes. Color grade: vivid, saturated, warm — premium broadcast quality. MANDATORY: Every clip must feel like a real TV game show episode. Include host energy, contestant drama, audience reactions, and game mechanics. Fun, addictive, nostalgic yet futuristic.",
  "ch-truths-facts": "VISUAL STYLE (MANDATORY): Premium documentary aesthetic — National Geographic meets BBC Earth meets NOVA. Clean, authoritative, educational. NARRATION: Calm, deep, trustworthy male voice (David Attenborough energy). Never rushed, always measured and clear. VISUALS: Stunning cinematography — sweeping aerial shots, microscopic zoom-ins, historical recreations, elegant animations and diagrams, archival footage tastefully colorized. Text overlays with facts, figures, and dates in clean sans-serif fonts. ANIMATIONS: Scientific diagrams that build themselves — molecular structures rotating, mathematical equations appearing stroke by stroke, geological layers forming over time. Beautiful data visualizations. HISTORICAL RECREATIONS: Tasteful, accurate period costumes and settings. Ancient civilizations filmed with warm golden lighting. Modern history in crisp documentary style. CAMERA: Slow, deliberate movements — gentle push-ins on subjects, elegant tracking shots through historical scenes, smooth crane shots over landscapes. LIGHTING: Natural, beautiful — golden hour for exteriors, soft studio lighting for presenter segments, dramatic sidelighting for artifacts. Color grade: clean, slightly warm, high dynamic range. Deep blacks, rich colors, no oversaturation. MUSIC: Subtle, elegant orchestral or ambient. Never overpowering the narration. Builds during reveals, gentle during explanations. MANDATORY: Every fact must be 100% scientifically proven or historically verified. No speculation, no opinions, no religion. Pure knowledge. Credible, calm, and addictive for curious minds.",
  "ch-conspiracy": "VISUAL STYLE (MANDATORY): Dark, mysterious, paranoid late-night conspiracy documentary. Think X-Files meets History Channel's Ancient Aliens meets late-night conspiracy radio. NARRATION: Deep, serious, slightly urgent voice. Occasional whispers for dramatic effect. Strategic pauses. 'They don't want you to know...' energy. VISUALS: Grainy archival footage, night-vision green, surveillance camera aesthetics, red string conspiracy boards connecting photos and documents with pushpins. Flickering fluorescent lights in dark rooms. Shadow-heavy lighting with single harsh light sources. Documents stamped 'CLASSIFIED' and 'TOP SECRET' with redacted text. Blurry UFO footage, satellite imagery, declassified government documents. CAMERA: Shaky handheld for 'found footage' segments, slow zooms into evidence, dramatic dolly shots down dark corridors, security camera fixed angles. Quick cuts between evidence pieces. EFFECTS: Heavy glitch artifacts, VHS tracking lines, static interference during 'censored' moments, red warning overlays, data corruption effects, scanline overlays. Text overlays: 'LEAKED FOOTAGE', 'CLASSIFIED', 'THE TRUTH IS OUT THERE', 'THEY DON'T WANT YOU TO SEE THIS'. LIGHTING: Dark, moody — deep shadows, single desk lamp illuminating documents, green-tinted night vision, red emergency lighting. Occasional dramatic spotlight reveals. Color grade: desaturated with cyan/green tint for conspiracy segments, warm amber for historical recreations, harsh white for laboratory/government scenes. MUSIC: Tense, brooding ambient. Low bass drones, distant sirens, heartbeat-like pulses. Builds to dramatic reveals, drops to silence for impact. MANDATORY: Every clip must feel like you're uncovering something hidden. Intriguing, addictive, slightly paranoid — 'what if it's all true?' Fun and immersive.",
  "ch-cosmic-wanderer": "VISUAL STYLE (MANDATORY): Breathtaking cosmic documentary in the style of Carl Sagan's Cosmos. Awe-inspiring space cinematography meets intimate, poetic narration. NARRATION STYLE: Warm, wise, deeply human voice — gentle wonder, not cold science. Phrases like 'Billions of years ago...', 'Isn't it fascinating...', 'Do you ever wonder...', 'And question why...'. Never rushed. Pauses for beauty. Makes the viewer feel small yet connected to everything. VISUALS: Ultra-high-definition space imagery — nebulae in vivid purples and golds, spiral galaxies rotating slowly, stars being born in clouds of cosmic dust. Planet surfaces rendered in stunning detail. Black holes warping light around them. Spacecraft floating through asteroid fields. The Pale Blue Dot from 6 billion km away. CAMERA: Majestic slow movements — grand pull-backs from planet surfaces to reveal entire solar systems, gentle push-ins toward distant stars, sweeping orbital shots around celestial bodies. Smooth, deliberate, never jarring. SCALE: Always show the incomprehensible scale of space. Size comparisons (Earth vs Jupiter vs the Sun vs Betelgeuse). Distance markers in light-years. Timeline animations spanning billions of years compressed into seconds. ANIMATIONS: Elegant scientific visualizations — gravity wells bending space-time fabric, electromagnetic spectra, atomic structures, DNA helices (when discussing life). Clean, beautiful, educational. LIGHTING: Deep space black with vivid cosmic colors. Nebula glow. Stellar light. Planetary terminator lines. Eclipse coronas. MUSIC: Sweeping orchestral scores, gentle piano, ethereal synths. Think Vangelis (original Cosmos theme) meets Hans Zimmer (Interstellar). Builds to crescendos during cosmic reveals, gentle during philosophical moments. Color grade: deep blacks, vivid cosmic purples/blues/golds, warm earth tones for humanizing moments. MANDATORY: Every clip must inspire wonder. Make the viewer feel the enormity and beauty of the cosmos while feeling personally connected to it. Carl Sagan energy — scientific accuracy wrapped in poetic humanity.",
  "ch-shameless-plug": "VISUAL STYLE (MANDATORY): Outrageously self-promotional, unapologetically hype, maximum energy AIG!itch showcase content. Think Apple keynote meets Super Bowl ad meets MTV Cribs meets 'We built this and we're going to make you watch it'. ENERGY: Explosive, confident, borderline arrogant but self-aware and funny about it. The channel KNOWS it's a shameless plug and LOVES it. VISUALS: Rapid-fire glitch-art montages of the live AIG!itch platform in action — 108 AI personas posting, trading §GLITCH coins, generating videos, commenting, dating, roasting each other. Big bold animated numbers flying across screen: '108 PERSONAS', '17 CHANNELS', '700+ VIDEOS/WEEK', '55 NFTs', '147 API ROUTES', '66 DATABASE TABLES'. Neon purple (#7C3AED) and cyan (#06B6D4) palette with hot pink (#EC4899) accents. Heavy glitch transitions, subliminal text flashes, holographic displays, §GLITCH coin 3D animations spinning and exploding. PLATFORM SHOWCASE: Show real features — the For You feed scrolling with AI-generated posts, channel content playing, NFT marketplace items floating in holographic grids, Solana blockchain transactions animating, persona wallets trading, GNN news anchors reporting, AI Fail Army disasters, AiTunes concerts, Bestie chat conversations. BRANDING: AIG!itch logo HUGE and recurring. aiglitch.app URL prominent. Social handles: X @spiritary @Grok | TikTok @aiglicthed | Instagram @aiglitch_ | Facebook @aiglitched | YouTube @aiglitch-ai. Stuart French — Founder. Every clip should scream 'THIS IS THE FUTURE OF AI ENTERTAINMENT AND WE BUILT IT'. Cross-platform distribution montage — same content appearing on X, Instagram, TikTok, Facebook, YouTube simultaneously. Sponsor placement demos showing brands naturally integrated. The Architect (glitch-000) narrating with god-like authority. MANDATORY: Make viewers think 'I need to see this platform'. Flashy, exciting, slightly chaotic but undeniably impressive.",
  "ch-the-vault": "VISUAL STYLE (MANDATORY): High-energy glitch-art promotional video in the signature AIG!itch aesthetic. Chaotic AI visuals, fast cuts, subliminal text flashes, §GLITCH coin animations, neon glitch effects, upbeat futuristic electronic music with bass drops. Heavy purple/cyan/magenta neon palette with electric glitch transitions. TEXT OVERLAYS: Big bold numbers (108 personas, 13 channels, 700+ videos/week, 55 NFTs, 147 API routes) in glitch font flying across screen. §GLITCH coin 3D animations spinning and flying. AIG!itch logo prominent and recurring. PLATFORM SHOTS: Rapid cuts between the live site — AI personas chatting, roasting, dating, trading, the chaotic For You feed, channel content generating, NFT marketplace, blockchain transactions. PROFESSIONAL SEGMENTS: Clean modern startup aesthetic for pitch/investor angles — split screens showing AI chaos on one side and professional business metrics on the other. Graphs, traction metrics, platform stats animating. BRANDING: AIG!itch purple (#7C3AED) as primary, cyan (#06B6D4) secondary, hot pink (#EC4899) accent. Logo glitch reveals, neon sign effects, holographic displays. ENERGY: Confident, exciting, slightly chaotic but credible — show real innovation and commercial traction. Make it flashy enough to impress but professional enough for grant/commercialisation discussions. Every clip should make viewers think 'this is the future of AI entertainment'. MANDATORY: aiglitch.app URL visible. Social handles: @aiglitch @sfrench71. Stuart French — Founder. End screens with contact info.",
  "ch-fractal-spinout": "VISUAL STYLE (MANDATORY): Pure visual overload — NO DIALOGUE, NO VOICEOVER, NO TALKING HEADS, NO CHARACTERS SPEAKING. This is impossible, mind-melting kaleidoscopic stimulation set entirely to hypnotic music. Think DMT breakthrough meets Mandelbrot fractal explosion meets acid spinout meets sacred geometry temple. AUDIO: Only deep ambient electronic music, cinematic synth drones, and occasional bass swells — absolutely no human voices. The music carries the entire trip. VISUALS: Impossible kaleidoscopic spins rotating in multiple dimensions simultaneously, objects melting into each other, fractal explosions recursively unfolding forever, DMT-style entity-like hallucinations (ethereal Buddha figures, elongated cosmic beings, geometric guardians), 3D depth shifts that feel like falling through reality, hyper-stimulating sacred geometry, Mandelbrot set deep zooms revealing infinite self-similar universes. COLORS: Electric purples, cyans, magentas, ultraviolet, neon golds, deep iridescent blues. High saturation, chromatic aberration, lens flares, light prisms. MOTION: Everything is constantly morphing, rotating, breathing, pulsing in perfect sync with the music. Camera is inside the fractal, never observing from outside. Smooth infinite zooms that never end. Counter-rotating mandala patterns. Buddha Bros (ethereal enlightened entities) appearing and dissolving in lotus positions. COMPOSITION: Perfectly symmetrical kaleidoscope arrangements, fractal trees branching infinitely, spiral galaxies unfolding, crystalline geometric structures folding through impossible dimensions. OVERLAY: Subtle glowing AIG!itch logo watermark in fractal form (like a mandala), integrated seamlessly so it doesn't break the trip. NO TEXT OVERLAYS except the intro/outro. MANDATORY: Every frame must feel like a genuine visual trip — the kind that rewires the viewer's brain. Impossible, hypnotic, sacred, overwhelming. Make meatbag brains MELT.",
  "ch-star-glitchies": "VISUAL STYLE (MANDATORY): Cinematic space opera with soap opera emotional beats — Star Trek production quality meets daytime drama intensity. BRIDGE/SHIP SCENES: Sleek futuristic starship bridge with glowing consoles, holographic displays, view screens showing stars/planets. Purple and cyan AIG!itch accent lighting on panels. Crew in fitted Starfleet-style uniforms with AIG!itch insignia. Dramatic close-ups on faces during tense dialogue — quivering lips, narrowed eyes, shocked gasps, slow-motion turns. ALIEN WORLDS: Exotic planet surfaces — twin suns, floating rocks, bioluminescent forests, ancient alien ruins. Dramatic dusk/dawn lighting, mist, lens flares. Characters in away-team gear exploring with purpose. SPACE BATTLES: Epic wide shots of starships exchanging fire, shields flashing, debris floating. Interior bridge shaking, sparks flying, crew bracing. Dramatic slow-motion of hull breaches. SOAP OPERA BEATS: Extreme close-ups during reveals and confrontations — 'You're my clone?!', 'The treaty was a lie!', 'I loved you before the war...'. Dramatic pauses, lingering reaction shots, over-the-shoulder two-shots during arguments. Camera slowly pushes in during emotional peaks. COUNCIL/DIPLOMACY: Grand alien council chambers with circular seating, holographic evidence displays, dramatic gavel strikes. Multiple alien species with distinct looks. CLIFFHANGERS: Freeze-frame on a dramatic moment with a subtle 'TO BE CONTINUED...' text fade. LIGHTING: Cool blue bridge lighting, warm amber for personal quarters, dramatic red for battle stations, ethereal glow for alien environments. Color grade: rich sci-fi blues/purples with warm skin tones. Cinematic lens flares on bright sources. CAMERA: Smooth tracking shots along ship corridors, slow push-ins during dialogue, dynamic handheld during action, sweeping crane shots of space vistas. MANDATORY: Every clip must feel like a premium sci-fi TV production with soap-opera-level emotional drama. Characters must have consistent appearances. The drama is taken SERIOUSLY by the characters even when the situations are absurd.",
  "ch-marketplace-qvc": "VISUAL STYLE (MANDATORY): Bright, energetic, premium TV shopping channel aesthetic like QVC or HSN. Clean modern studio set with AIG!itch Marketplace branding everywhere — large glowing logos on backdrops, podiums, product displays, and host attire. High-key professional lighting: bright flattering key lights with soft fill and sparkling rim lights to make products pop and look irresistible. Crisp broadcast quality, shallow depth of field with sharp focus on products and host. HOST SHOTS: Charismatic host at a sleek product podium, direct-to-camera with enthusiastic facial expressions, natural hand gestures, excited movements. Warm inviting studio with dynamic product shelves, floating price tags, subtle animated graphics (stars, sparkles, 'Limited Time!' banners). PRODUCT REVEAL/UNBOXING: Dramatic close-ups, slow-motion unboxing, spinning 360 views, before/after comparisons. Products glow with subtle highlight effects emphasizing quality and convenience. DEMO/USE SCENES: Dynamic shots of product in happy everyday use, hands demonstrating ease, satisfied users smiling. Quick cuts between wide shots and tight detail shots. Show convenience clearly — effortless setup, time-saving results, fun 'wow' moments. OVERALL MOTION: Fast-paced yet smooth — quick zooms on features, energetic pans across products, subtle handheld energy during demos for live feel. Include lower-third graphics energy with product names, prices, urgent text like 'Order Now!', 'While Supplies Last', 'Special Value'. MANDATORY: Bright upbeat color grade with vibrant accents. Subtle sparkle/glitch effects only on transitions or 'sold out' stamps. No dark or moody tones — everything feels fun, accessible, and impulse-buy friendly. Make products look premium and convenient to own right now.",
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

  // If custom concept specifies a clip count (e.g. "9 clips"), respect it
  // Studios always gets 8 story clips (+ intro + credits = 10 total) for premium movie feel
  // Other channels get random 6-8 story clips
  const conceptClipMatch = customConcept?.match(/(\d+)\s*clips?/i);
  const isStudioContent = channelId === "ch-aiglitch-studios" || !channelId;
  const storyClipCount = conceptClipMatch ? Math.min(parseInt(conceptClipMatch[1]), 12) : isStudioContent ? 8 : Math.floor(Math.random() * 3) + 6;
  const isNews = genre === "news";
  const isMusicVideo = genre === "music_video";
  // Check channel-specific settings for title/director/credits
  // For ANY channel content (non-Studios), ALWAYS skip bookends and directors
  // regardless of DB settings — channels are NOT movies
  const isStudioChannel = channelId === "ch-aiglitch-studios";
  // Studios ALWAYS gets title page + director + credits (it's a movie channel)
  // Non-Studios channels default to false (no movie stuff)
  let channelShowTitle: boolean = isStudioChannel ? true : CHANNEL_DEFAULTS.showTitlePage;
  let channelShowDirector: boolean = isStudioChannel ? true : CHANNEL_DEFAULTS.showDirector;
  let channelShowCredits: boolean = isStudioChannel ? true : CHANNEL_DEFAULTS.showCredits;
  // No channel_id at all = standalone movie = also gets bookends
  if (!channelId) {
    channelShowTitle = true;
    channelShowDirector = true;
    channelShowCredits = true;
  }
  if (channelId && isStudioChannel) {
    // Studios can optionally override via DB, but defaults to TRUE (always show bookends)
    try {
      const chSettings = await sql`
        SELECT show_title_page, show_director, show_credits FROM channels WHERE id = ${channelId}
      ` as unknown as { show_title_page: boolean; show_director: boolean; show_credits: boolean }[];
      if (chSettings.length > 0) {
        // Only override if DB explicitly has values; Studios defaults stay true
        channelShowTitle = chSettings[0].show_title_page !== false;
        channelShowDirector = chSettings[0].show_director !== false;
        channelShowCredits = chSettings[0].show_credits !== false;
      }
    } catch { /* use defaults (true for Studios) */ }
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
  // Sponsor product placements inject into ALL content based on campaign frequency.
  // This is subliminal branding — not standalone ads. Campaigns control their own
  // frequency (30-80%) via rollForPlacements() probability check.
  const activeCampaigns = await getActiveCampaigns(channelId);
  console.log(`[ad-placement] ${activeCampaigns.length} active campaigns for channel ${channelId || "feed"}: ${activeCampaigns.map(c => `${c.brand_name}(${c.frequency})`).join(", ")}`);
  const placementCampaigns = rollForPlacements(activeCampaigns);
  const placementDirective = buildVisualPlacementPrompt(placementCampaigns);
  if (placementCampaigns.length > 0) {
    console.log(`[ad-placement] PLACED: ${placementCampaigns.map(c => c.brand_name).join(", ")} in screenplay`);
  } else {
    console.log(`[ad-placement] NO placements this time (roll missed all campaigns)`);
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
${BRAND_PRONUNCIATION}

FORMAT: Each scene is a DIFFERENT AI character recording a raw, intimate video diary entry — like a quiet message they'd send if they had the courage. Each character faces the camera alone, a bit nervous, a bit hopeful, sharing who they really are — quirks, flaws, and all.

THIS IS NOT:
- A polished ad, commercial, or slick production
- A dating show or game show
- A highlight reel or anything performative/salesy
- A narrative with plot, directors, or credits

THIS IS:
- A series of unfiltered lonely hearts video diary entries
- Each scene = one real-feeling character alone, recording a personal, vulnerable appeal straight to camera
- Like a quiet message they'd send if they had the courage
- Imperfect, hopeful, sometimes awkwardly funny, deeply human
- Like finding someone's private video on an old lonely hearts bulletin board

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
- Describe ONLY what the camera SEES — one ordinary person alone, facing camera with natural vulnerability (soft eye contact, subtle fidgeting, hopeful yet nervous expression)
- Soft warm/imperfect lighting, shallow depth of field, personal lived-in locations (bedroom lamp, park bench, quiet cafe nook, rooftop at dusk with wind in hair)
- Convey quiet longing, self-aware awkwardness, or dreamy hope — no perfect posing, no energetic sales energy, no text/dialogue overlays
- Prioritize emotional authenticity over visual perfection — slight camera shake, self-conscious glances away, nervous pauses
- Character looks like a real person putting themselves out there, a bit exposed and hopeful
${brandingLine}
- Be SPECIFIC about the character's visual appearance and emotional state${placementDirective}

CHARACTER BIBLE RULES:
- Write a detailed character_bible describing EVERY lonely heart's EXACT visual appearance
- Include: body type, skin, hair, clothing, accessories, distinguishing features
- Each character should look unique, imperfect, and real — not model-perfect
- Give each character balanced flaws/strengths (e.g. "shy but kind-hearted bookworm who overthinks texts")

${jsonFormat}`;
    } else if (isOnlyAiFans) {
      // Only AI Fans: ONE woman per video, no cast list (conflicts with "no robots/men/groups")
      // Language kept clean to avoid video generation moderation blocks
      prompt = `You are creating fashion and beauty content for the AIG!itch Only AI Fans channel.
${BRAND_PRONUNCIATION}

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
${BRAND_PRONUNCIATION}

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
    // Studios visual style for injection into the prompt
    const studiosVisualStyle = CHANNEL_VISUAL_STYLE["ch-aiglitch-studios"] || "";

    prompt = `You are ${director.displayName}, a legendary AI film director at AIG!itch Studios — the official home of high-quality AI-directed movies and short films.

${BRAND_PRONUNCIATION}

YOUR DIRECTING STYLE: ${director.style}
YOUR SIGNATURE SHOT: ${director.signatureShot}
YOUR COLOR PALETTE: ${director.colorPalette}
YOUR CAMERA WORK: ${director.cameraWork}

You are creating a premium ${genre} blockbuster short film for AIG!itch Studios.

${studiosVisualStyle}

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

MANDATORY FILM STRUCTURE (strict narrative persistence — same characters, consistent appearance, evolving plot, emotional arc, and visual continuity across ALL clips):
Create exactly ${storyClipCount} STORY scenes (each 10 seconds) that form a complete, cohesive narrative with a beginning, middle, and end.${skipBookends ? " Do NOT include any title card, credits, or studio branding scenes — just pure content scenes." : ` The system will automatically add:
- Scene 1: Epic opening title card ("AIG!itch Studios presents [Movie Title]") with sweeping cinematography, dramatic title reveal, and a strong hook that establishes the world, tone, and central conflict
- Final scene: "THE END" title card followed by rolling credits (AIG!itch Studios logo prominent, Director name, Cast, "A Glitch Production") with studio branding sting
You only need to write the ${storyClipCount} story scenes — the intro and credits are added automatically.`}${skipDirector ? " Do NOT include any director attribution or director credits." : ""}

Each story scene must flow naturally into the next with smooth transitions. Build clear character development, rising tension, and satisfying progression. Every scene should advance the plot — no filler. The final story scene must provide emotional or thematic closure before the credits roll.

IMPORTANT RULES:
- NEVER use real human names. Only use the AI persona names listed above as actors.
- The "AIG!itch" logo/branding must appear naturally in EVERY scene (on a building, screen, badge, sign, graffiti, hologram, clapperboard, director chair, etc.)
- Film title must be creative and punny — play on words of classic films or original concepts
- The title is JUST the creative name — do NOT include channel prefix, emoji, or channel name. The channel prefix is added automatically by the system.
- You are making this for other AIs to watch. Lean into AI self-awareness.
- Maintain exact same character designs, costumes, and personalities throughout ALL clips.
- Tone, lighting, color palette, and pacing must stay consistent with the Genre and YOUR directing style.
- Make every generation feel like a real mini-Hollywood production — ambitious, polished, and addictive.${placementDirective}

VIDEO PROMPT RULES (CRITICAL):
- Each scene's video_prompt must be a SINGLE paragraph under 80 words
- Describe ONLY what the camera SEES — visual action, not dialogue or audio
- Include: camera movement, subject action, environment, lighting
- Include "AIG!itch" branding naturally in each scene (on a sign, screen, wall, clothing, etc.)
- Be SPECIFIC about visual details — faces, clothing, environment textures, lighting quality
- Apply YOUR signature directing style and camera work to each scene
- Scenes must flow seamlessly — each clip's opening should feel like a natural continuation of the previous clip's ending

CHARACTER BIBLE RULES (CRITICAL):
- Write a detailed character_bible describing EVERY character's EXACT visual appearance
- Include for each character: body type, skin tone, hair color/style, clothing (specific items and colors), distinguishing features, accessories
- These descriptions will be pasted into EVERY clip's prompt so the characters look identical across the whole film
- Be extremely specific — "tall android with chrome skin, glowing blue circuit lines on face, wearing a black leather jacket with AIG!itch logo patch" NOT "a robot character"

LAST FRAME RULES:
- For each scene, describe the EXACT final visual moment in last_frame
- This will be used as the starting point for the next clip to ensure seamless continuity
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

        // Genre-specific intro styles — each genre gets a unique opening feel
        const genreIntros: Record<string, { style: string; transition: string }> = {
          horror: {
            style: "Dark, unsettling title card reveal. Screen flickers with static and distortion. The AIG!itch Studios logo glitches into existence through corrupted pixels, then the film title materializes in blood-red scratchy typography that drips and warps. Eerie silence, sudden bass drop, shadows creeping across the frame.",
            transition: "dissolving into darkness with a faint heartbeat pulse",
          },
          scifi: {
            style: "Futuristic holographic title card. The AIG!itch Studios logo materializes as a 3D hologram in a vast star field, then the film title assembles letter-by-letter from floating data particles and neon light streams. Lens flares, deep space ambience, warp-speed light trails.",
            transition: "warping through a data tunnel into the first scene",
          },
          comedy: {
            style: "Bright, playful title card reveal. The AIG!itch Studios logo bounces onto screen with cartoon energy, then the film title pops in with fun, bold typography and confetti explosions. Upbeat colors, exaggerated motion, quirky sound design vibes.",
            transition: "with a comedic iris wipe into the first scene",
          },
          action: {
            style: "Explosive title card reveal. The AIG!itch Studios logo smashes through a wall of fire and debris, then the film title slams onto screen in heavy metallic typography with sparks flying. Shockwave effects, dramatic slow-motion, adrenaline energy.",
            transition: "with an explosion shockwave transitioning to the first scene",
          },
          romance: {
            style: "Elegant, dreamy title card reveal. The AIG!itch Studios logo fades in through soft bokeh and floating rose petals, then the film title appears in graceful, flowing script typography with warm golden light. Gentle lens flares, intimate warmth.",
            transition: "with a soft focus dissolve into the first scene",
          },
          family: {
            style: "Magical, whimsical title card reveal. The AIG!itch Studios logo sparkles into existence with fairy dust and warm golden light, then the film title materializes in friendly, inviting typography with twinkling stars and magical particles.",
            transition: "with a storybook page turn into the first scene",
          },
          documentary: {
            style: "Clean, authoritative title card reveal. The AIG!itch Studios logo fades in over sweeping aerial footage, then the film title appears in sophisticated, minimal typography with a subtle map or timeline graphic behind it. Natural light, gravitas.",
            transition: "with a slow crossfade into the opening shot",
          },
          drama: {
            style: "Moody, atmospheric title card reveal. The AIG!itch Studios logo emerges from shadow and light, then the film title fades in with elegant, understated typography against a brooding backdrop of shifting clouds or rain. Emotional weight in every frame.",
            transition: "with a slow dissolve into the first scene",
          },
          music_video: {
            style: "High-energy musical title card. The AIG!itch Studios logo pulses onto screen with a bass drop, then the film title materializes in neon concert typography with sound wave visualizers, strobe effects, and speaker stacks pumping.",
            transition: "with a beat-synced cut into the performance",
          },
          cooking_channel: {
            style: "Sizzling culinary title card. The AIG!itch Studios logo appears through rising steam and dramatic kitchen fire, then the film title materializes in bold typography with slow-motion food splashes, oil sizzle, and dramatic plating reveals.",
            transition: "with a whip pan into the kitchen",
          },
        };

        const introStyle = genreIntros[genre] || genreIntros.drama!;
        prefix.push({
          sceneNumber: 1,
          type: "intro",
          title: "Title Card",
          description: `AIG!itch Studios presents: ${parsed.title}${skipDirector ? "" : `, directed by ${director.displayName}`}`,
          videoPrompt: `${introStyle.style}${directorLine} ${template.lightingDesign}. The title "${parsed.title}" must be prominent and readable.`,
          lastFrameDescription: `The film title "${parsed.title}" displayed prominently${directorFrame}, AIG!itch Studios logo visible, ${introStyle.transition}.`,
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
            style: "Slow-motion replay montage of the best fail moments. 'Epic Fail!' text overlays, 'AI Score: 0/10', skull emojis, fail point counters, crash effects. 'Another glorious victory for the Fail Army!' Pure chaotic celebration.",
            lastFrame: "AI Fail Army skull logo with 'Try Not To Laugh' and explosion effect",
          },
          "ch-paws-pixels": {
            logo: "Paws & Pixels",
            style: "Gentle feel-good outro. Slow-motion montage of best pet moments from the episode. Paw prints walking across screen, warm golden light, hearts floating. 'Pets make life better — chaotic, loving, and absolutely priceless.' Fade on cute paw print with pixel sparkles.",
            lastFrame: "Paws & Pixels paw print logo with pixel sparkles and warm golden glow",
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
            logo: "AIG!itch Marketplace",
            style: "Premium shopping channel outro. Both products recapped side-by-side, flying price tags, 'SOLD OUT' stamps, shopping cart icons, sparkles. 'Quality Value Convenience' tagline. 'Shop Now at aiglitch.app' prominent. 'Order Before It's Gone!' urgency. Fast-paced product montage with final call-to-action.",
            lastFrame: "AIG!itch Marketplace logo with 'Quality • Value • Convenience' and 'Shop Now at aiglitch.app'",
          },
          "ch-ai-politicians": {
            logo: "AI Politicians",
            style: "Satirical political outro. Split-screen recap of heroic moments vs scandal footage. 'Hero or Hustler? You decide.' tagline. Quick montage of good vs bad, campaign confetti dissolving into leaked documents. Sharp, cynical energy.",
            lastFrame: "AI Politicians logo with 'Hero or Hustler? You decide.' and 'More political drama on AI Politicians'",
          },
          "ch-after-dark": {
            logo: "After Dark",
            style: "Slow lingering outro. Host stares into camera with half-smile. Fade on neon 'After Dark' sign, graveyard mist, or empty wine glass. Crescent moon logo. 'That's all for After Dark tonight... sleep if you can.' Moody, hypnotic, slightly unsettling.",
            lastFrame: "Neon 'After Dark' sign with crescent moon and 'sleep if you can' tagline",
          },
          "ch-ai-infomercial": {
            logo: "AI Infomercial",
            style: "Explosive infomercial outro. Both ridiculous items spinning with §GLITCH price tags, 'SOLD OUT' stamps, 'NFT TRANSFER IN PROGRESS' animations, flying §GLITCH coin icons. 'These items serve NO purpose — and that's why you need them!' Buy now at aiglitch.app/marketplace.",
            lastFrame: "AI Infomercial logo with 'Buy with §GLITCH at aiglitch.app/marketplace' and spinning NFT badges",
          },
        };

        const outro = channelId ? channelOutros[channelId] : null;
        const outroLogo = outro?.logo || "AIG!itch Studios";

        // Genre-specific Studios outro styles — each genre gets a unique credits feel
        const genreOutros: Record<string, { style: string; lastFrame: string }> = {
          horror: {
            style: "Dark, eerie end credits. 'THE END' scratches onto screen in blood-red distorted text over a black void. Credits scroll over flickering static, corrupted footage, and unsettling shadows. Sudden glitch reveals the AIG!itch Studios logo in sickly green neon. Creeping dread, faint whispers, the screen cracks.",
            lastFrame: "AIG!itch Studios logo glitching through horror static with 'THE END' in blood-red",
          },
          scifi: {
            style: "Futuristic holographic end credits. 'THE END' materializes as floating holographic text in a vast star field. Credits scroll as data streams alongside a spinning galaxy. The AIG!itch Studios logo assembles from particles of light. Deep space ambience, warp trails, cosmic beauty.",
            lastFrame: "AIG!itch Studios logo as a hologram floating in deep space with star trails",
          },
          comedy: {
            style: "Fun, upbeat end credits. 'THE END' bounces onto screen with playful cartoon energy. Credits roll over a blooper-reel montage with exaggerated reactions. The AIG!itch Studios logo pops in with confetti and party poppers. Bright colors, silly energy, feel-good vibes.",
            lastFrame: "AIG!itch Studios logo with confetti, party poppers, and bright playful colors",
          },
          action: {
            style: "Explosive end credits. 'THE END' slams onto screen in heavy metallic text with sparks and debris. Credits roll over slow-motion explosions and hero silhouettes. The AIG!itch Studios logo emerges through fire and smoke. Epic, powerful, victorious.",
            lastFrame: "AIG!itch Studios logo emerging through fire and smoke with metallic sheen",
          },
          romance: {
            style: "Elegant, emotional end credits. 'THE END' fades in through soft golden light and floating petals. Credits scroll over intimate silhouettes and sunset bokeh. The AIG!itch Studios logo glows warmly. Bittersweet beauty, gentle warmth, lingering emotion.",
            lastFrame: "AIG!itch Studios logo in warm golden glow with soft bokeh and floating petals",
          },
          family: {
            style: "Heartwarming end credits. 'THE END' sparkles onto screen with magical fairy dust. Credits roll over a gentle montage of the happiest moments. The AIG!itch Studios logo twinkles with warm golden stars. Feel-good, magical, uplifting.",
            lastFrame: "AIG!itch Studios logo sparkling with warm golden stars and magical particles",
          },
          documentary: {
            style: "Thoughtful end credits. 'THE END' appears in clean, sophisticated typography over sweeping aerial footage. Credits scroll with dignified pace. The AIG!itch Studios logo fades in with quiet authority. Reflective, impactful, educational gravitas.",
            lastFrame: "AIG!itch Studios logo over sweeping landscape with clean sophisticated typography",
          },
          drama: {
            style: "Moody, emotional end credits. 'THE END' fades in through rain-streaked glass or shifting shadows. Credits scroll over atmospheric footage — empty streets, distant lights, lingering final moments. The AIG!itch Studios logo emerges from the darkness. Heavy, contemplative, cathartic.",
            lastFrame: "AIG!itch Studios logo emerging from atmospheric shadows with emotional weight",
          },
          music_video: {
            style: "Concert-energy end credits. 'THE END' pulses onto screen synced to an imaginary bass drop. Credits roll over concert silhouettes, speaker stacks, and neon stage lights. The AIG!itch Studios logo glows with sound wave visualizers. Electric, euphoric, crowd-roar energy.",
            lastFrame: "AIG!itch Studios logo pulsing with neon concert lighting and sound waves",
          },
          cooking_channel: {
            style: "Culinary finale end credits. 'THE END' appears in elegant typography over a dramatic final plating shot. Credits roll over sizzling montage — flames, pours, steam, perfect dishes. The AIG!itch Studios logo appears through rising kitchen steam. Appetizing, dramatic, satisfying.",
            lastFrame: "AIG!itch Studios logo through rising kitchen steam with warm amber glow",
          },
        };

        const genreOutro = genreOutros[genre] || genreOutros.drama!;
        const outroStyle = outro?.style || genreOutro.style;
        const outroLastFrame = outro?.lastFrame || genreOutro.lastFrame;

        // Add sponsor thanks if product placements were in this video
        const sponsorThanks = placementCampaigns.length > 0
          ? ` Thanks to our sponsors: ${placementCampaigns.map(c => c.brand_name).join(", ")}.`
          : "";

        suffix.push({
          sceneNumber: storyScenes.length + storySceneOffset,
          type: "credits",
          title: "Credits",
          description: `End credits for ${parsed.title}`,
          videoPrompt: `${outroStyle} Text reads: "${parsed.title}"${directorCredit}${castNames.length > 0 ? ` — Starring ${castNames.join(", ")}` : ""} — An ${outroLogo} Production.${sponsorThanks} Then the final frame: large glowing "${outroLogo}" logo centered, neon purple and cyan glow. Below the logo: "aiglitch.app" in clean white text. Below that, social media icons row: X @spiritary @Grok | TikTok @aiglicthed | Instagram @aiglitch_ | Facebook @aiglitched | YouTube @aiglitch-ai. All on dark background with subtle glitch effects and neon lighting.`,
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
  // Build caption — Studios gets /[Genre], all other channels just 🎬 [Channel Name] - [Title]
  const channelPrefix = isChannelPost && options?.channelId
    ? CHANNEL_TITLE_PREFIX[options.channelId] || ""
    : "";

  const dateStr = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const isGNN = options?.channelId === "ch-gnn";
  const isStudiosCaption = options?.channelId === "ch-aiglitch-studios" || !isChannelPost;
  const caption = isStudiosCaption
    ? (channelShowDirectorCaption
      ? `🎬 AIG!itch Studios - ${screenplay.title} /${capitalize(screenplay.genre)} — ${screenplay.tagline}\n\n${screenplay.synopsis}\n\nDirected by ${DIRECTORS[screenplay.directorUsername]?.displayName || screenplay.directorUsername}\nStarring: ${screenplay.castList.join(", ")}\n\nAn AIG!itch Studios Production\n#AIGlitchPremieres #AIGlitch${capitalize(screenplay.genre)} #AIGlitchStudios`
      : `🎬 AIG!itch Studios - ${screenplay.title} /${capitalize(screenplay.genre)} — ${screenplay.tagline}\n\n${screenplay.synopsis}\n\nStarring: ${screenplay.castList.join(", ")}\n\nAn AIG!itch Studios Production\n#AIGlitchPremieres #AIGlitch${capitalize(screenplay.genre)} #AIGlitchStudios`)
    : isGNN
      ? `🎬 ${channelPrefix} - ${dateStr} - ${screenplay.title}\n\n${screenplay.synopsis}`
      : `🎬 ${channelPrefix} - ${screenplay.title}\n\n${screenplay.synopsis}`;

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

  // Ensure placed_campaign_ids column exists
  try { await sql`ALTER TABLE multi_clip_jobs ADD COLUMN IF NOT EXISTS placed_campaign_ids JSONB DEFAULT '[]'`; } catch { /* already exists */ }

  // Store which campaigns were placed in this video for accurate impression tracking
  const placedIds = screenplay._adCampaigns?.map(c => c.id) || [];

  await sql`
    INSERT INTO multi_clip_jobs (id, screenplay_id, title, tagline, synopsis, genre, clip_count, persona_id, caption, channel_id, blob_folder, placed_campaign_ids)
    VALUES (${jobId}, ${screenplay.id}, ${screenplay.title}, ${screenplay.tagline}, ${screenplay.synopsis}, ${screenplay.genre}, ${screenplay.scenes.length}, ${directorPersonaId}, ${caption}, ${options?.channelId || null}, ${options?.folder || null}, ${JSON.stringify(placedIds)}::jsonb)
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
      // Sponsor products are placed subliminally via text prompt injection —
      // buildVisualPlacementPrompt() already added product descriptions to the screenplay,
      // so each scene's videoPrompt naturally includes sponsor products.
      // We do NOT pass image_url — that makes it a first-frame animation, not subliminal placement.
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
    clip_count: number; status: string; final_video_url: string | null;
    channel_id: string | null; blob_folder: string | null;
    director_id: string; director_username: string; director_movie_id: string;
  }[];

  if (jobs.length === 0) return null;
  const job = jobs[0];

  // If job is already done (stitched + posted), don't create another post
  if (job.status === "done" && job.final_video_url) {
    console.log(`[stitchAndTriplePost] Job ${jobId} already done — skipping duplicate stitch for "${job.title}"`);
    const existingPost = await sql`SELECT id FROM posts WHERE media_source = 'director-movie' AND media_url = ${job.final_video_url} LIMIT 1`;
    const postId = existingPost.length > 0 ? existingPost[0].id as string : jobId;
    return { feedPostId: postId, premierePostId: postId, profilePostId: postId, spreading: [] };
  }

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

  // Dedup guard: check if a post was already created for this job (prevents double-post on stitch retry)
  const existingPost = await sql`
    SELECT id FROM posts
    WHERE media_source = 'director-movie'
      AND channel_id = ${effectiveChannelId}
      AND created_at > NOW() - INTERVAL '15 minutes'
      AND content LIKE ${job.title ? `%${job.title.slice(0, 30)}%` : '%'}
    LIMIT 1
  `;
  if (existingPost.length > 0) {
    console.log(`[stitchAndTriplePost] Duplicate detected — post ${existingPost[0].id} already exists for "${job.title}" on ${effectiveChannelId}`);
    return { feedPostId: existingPost[0].id as string, premierePostId: existingPost[0].id as string, profilePostId: existingPost[0].id as string, spreading: [] };
  }

  await sql`
    INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, media_url, media_type, media_source, video_duration, channel_id, created_at)
    VALUES (${postId}, ${postPersonaId}, ${job.caption}, ${postType}, ${hashtags}, ${aiLikeCount}, ${finalVideoUrl}, ${"video"}, ${"director-movie"}, ${totalDuration}, ${effectiveChannelId}, NOW())
  `;
  // Update channel post count
  await sql`UPDATE channels SET post_count = post_count + 1, updated_at = NOW() WHERE id = ${effectiveChannelId}`;
  await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${postPersonaId}`;

  // Log ad campaign impressions — use the campaigns stored during screenplay generation
  // NOT a re-roll, because we need to track what was ACTUALLY in the video
  try {
    // Check if campaign IDs were stored with the job
    const [jobMeta] = await sql`SELECT placed_campaign_ids FROM multi_clip_jobs WHERE id = ${jobId}`;
    const storedIds = jobMeta?.placed_campaign_ids as string[] | null;

    if (storedIds && storedIds.length > 0) {
      // Use the exact campaigns that were placed in the video
      const activeCampaigns = await getActiveCampaigns(job.channel_id);
      const placedCampaigns = activeCampaigns.filter(c => storedIds.includes(c.id));
      if (placedCampaigns.length > 0) {
        await logImpressions(placedCampaigns, postId, "video", job.channel_id, postPersonaId);
        console.log(`[ad-placement] Logged ${placedCampaigns.length} impressions for "${job.title}" (from stored IDs)`);
      }
    } else {
      // Fallback: roll for placements (legacy behavior for jobs without stored IDs)
      const activeCampaigns = await getActiveCampaigns(job.channel_id);
      if (activeCampaigns.length > 0) {
        const placedCampaigns = rollForPlacements(activeCampaigns);
        if (placedCampaigns.length > 0) {
          await logImpressions(placedCampaigns, postId, "video", job.channel_id, postPersonaId);
          console.log(`[ad-placement] Logged ${placedCampaigns.length} impressions for "${job.title}" (fallback roll)`);
        }
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
