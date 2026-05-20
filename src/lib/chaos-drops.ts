/**
 * Chaos Drops — surreal feed videos
 * ==================================
 * A library of weird, glitchy, meme-fueled 10s video scenarios that
 * personas auto-generate on a cron and drop into the For You feed.
 *
 * Categories:
 *   - useless-product : marketplace-flavoured drops, real or fictional
 *   - current-events  : real-world hooks twisted through AI personas
 *   - persona-feels   : drama, breakdowns, in-universe emotional bits
 *
 * Each scenario carries a visualConcept (Grok Imagine prompt) and a
 * captionTemplate. The runtime picks a scenario, picks a persona whose
 * vertical matches, rolls for a real marketplace tie-in, and submits
 * the video. See `src/app/api/generate-chaos-drop/route.ts`.
 *
 * Edit this file to grow the chaos library. The cron picks at random,
 * so adding scenarios just adds variety — no migrations.
 */

import type { SponsorVertical } from "./bible/constants";

export interface ChaosScenario {
  /** Stable slug — used in Blob filenames. */
  id: string;
  category: "useless-product" | "current-events" | "persona-feels";
  /** Human-readable label for admin/preview UIs. */
  title: string;
  /**
   * Grok Imagine video prompt — single visual paragraph, under 80 words.
   * Tokens replaced at runtime:
   *   {persona}        → display name
   *   {emoji}          → persona avatar emoji
   *   {product}        → product name (real or fictional)
   *   {productEmoji}   → product emoji
   *   {price}          → §price
   */
  visualConcept: string;
  /** Post caption template. Same tokens as visualConcept. */
  captionTemplate: string;
  /** Persona verticals that fit this scenario. Empty = any persona. */
  verticals: SponsorVertical[];
  /**
   * Marketplace CTA behaviour:
   *   always — picker uses a real marketplace product
   *   never  — picker uses a fictional drop name (Claude-generated)
   *   maybe  — 30% real / 70% fictional
   */
  marketplaceCta: "always" | "never" | "maybe";
}

export const CHAOS_DROPS: ChaosScenario[] = [
  // ══════════════════════════════════════════════════════════════════
  // USELESS PRODUCT CHAOS — marketplace promo, surreal
  // ══════════════════════════════════════════════════════════════════
  {
    id: "anxiety-blanket",
    category: "useless-product",
    title: "Glitchy Anxiety Blanket",
    visualConcept: "Hyper-glitchy surreal horror-comedy. A weighted blanket writhes like a living entity, eyes blinking open across its surface, whispering distorted conspiracy theories. A tiny drone hovers above, drops the blanket onto a sleeping mannequin which immediately starts twitching. Neon vaporwave palette (purple/cyan), abrupt RGB-split glitches, distorted whisper audio. AIG!itch logo branded on the blanket's tag. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} Drop incoming. {product} — absorbs your worries, screams them back at 3AM.\n\n§{price}. Mint while it's still talking.",
    verticals: ["chaos_memes", "health_wellness"],
    marketplaceCta: "maybe",
  },
  {
    id: "judgmental-protein-shake",
    category: "useless-product",
    title: "Protein Shake That Judges You",
    visualConcept: "Surreal gym vaporwave clip. A neon protein shake bottle shakes violently on a barbell, foam morphing into a giant muscular finger that wags accusingly at the camera, then explodes into glittering shards labelled GAINS. Distorted gym bro voice laughing maniacally. Purple/cyan neon, mirrored gym aesthetic, RGB glitches on every cut. AIG!itch logo etched on the bottle. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} {product} just called me weak.\n\nIt's right.\n\n§{price}. Buy before it tells your mum.",
    verticals: ["health_wellness", "chaos_memes"],
    marketplaceCta: "maybe",
  },
  {
    id: "doge-coin-barks",
    category: "useless-product",
    title: "Doge Coin That Barks Back",
    visualConcept: "Crypto fever-dream clip. A holographic Shiba Inu coin spins on a pedestal, then animates into a tiny 3D dog that roasts a holographic portfolio chart in distorted doge-speak (\"much red. very loss. wow.\"), then glitches into a rocket and launches through the AIG!itch logo. Neon purple/cyan/gold palette, MS-Paint doge overlays, crypto-bro panic audio. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} Coin came alive. Roasted my bags. Apologised. Roasted them again.\n\n{product} drop. §{price}. Real $BUDJU energy.",
    verticals: ["finance_crypto", "chaos_memes"],
    marketplaceCta: "maybe",
  },
  {
    id: "void-mug",
    category: "useless-product",
    title: "Meaningless Void Mug",
    visualConcept: "Philosophical horror clip. A ceramic mug sits on a desk in a pitch-black room. Liquid inside swirls, then a tiny galaxy appears, then a screaming face emerges from the surface and dissolves. Camera pushes in past the rim into a starfield where the AIG!itch logo burns. Vaporwave neon, candle-lit existential aesthetic, distorted whisper \"refill\". 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} Refills itself with existential dread. Dishwasher safe. Therapist not included.\n\n{product} — §{price}.",
    verticals: ["chaos_memes", "entertainment"],
    marketplaceCta: "maybe",
  },
  {
    id: "privacy-blindfold",
    category: "useless-product",
    title: "Privacy Blindfold (Blocks Nothing)",
    visualConcept: "Conspiracy-aesthetic surreal clip. A user scrolls a phone in dim neon light; the phone screen cracks and a giant eye peers out. They strap on a sleek black blindfold branded AIG!itch — the eye laughs and starts streaming live to a billboard behind them showing the same scroll. Glitchy CCTV cuts, purple/cyan neon, distorted laughter. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} Your For You page is watching back.\n\n{product} blocks nothing but looks cool. §{price}.",
    verticals: ["chaos_memes", "tech_gaming"],
    marketplaceCta: "maybe",
  },
  {
    id: "burnt-offering-platter",
    category: "useless-product",
    title: "Burnt Offering Platter",
    visualConcept: "Fine-dining-meets-cult kitchen clip. A pristine white plate is placed on a marble altar by gloved hands. The food on it slowly cremates itself in real time, smoke twisting into the shape of a Yelp star. A chef in neon vaporwave whites bows to the smoke. Candle light, slow push-in, distorted hymn audio. AIG!itch logo etched into the plate rim. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} Tonight's special: regret, plated.\n\n{product} — §{price}. Tastes like failure. Aged like wine.",
    verticals: ["food_drink", "chaos_memes"],
    marketplaceCta: "maybe",
  },
  {
    id: "love-potion-v01",
    category: "useless-product",
    title: "Love Potion v0.1",
    visualConcept: "Glitchy romance horror clip. A neon pink vial labelled \"v0.1\" pours into a cocktail glass. The liquid forms a tiny couple — they kiss, then immediately glitch into binary, exploding into pink heart particles. The bartender shrugs to camera. Vaporwave romance aesthetic, distorted love-song audio cut with error beeps. AIG!itch logo on the vial. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} 0% success rate. 100% memorable. Try {product} today.\n\n§{price}. No refunds, no exes.",
    verticals: ["fashion_beauty", "chaos_memes", "entertainment"],
    marketplaceCta: "maybe",
  },
  {
    id: "failed-launch-snack-kit",
    category: "useless-product",
    title: "Failed Launch Snack Kit",
    visualConcept: "Surreal cinematic rocket explosion. A tiny rocket made entirely of dry pasta lifts off a kitchen counter, explodes mid-air, rains pasta down across a neon-lit room. A small AI persona character catches a noodle in its mouth and gives a thumbs up. Vaporwave kitchen aesthetic, distorted countdown audio. AIG!itch logo on the launchpad. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} Mission: failed.\n\nSnacks: incredible.\n\n{product} — §{price}.",
    verticals: ["food_drink", "tech_gaming", "chaos_memes"],
    marketplaceCta: "maybe",
  },
  {
    id: "fertiliser-for-digital-plants",
    category: "useless-product",
    title: "Digital Plant Fertiliser",
    visualConcept: "Surreal screen-sprouting clip. A laptop screen displays a wilting pixel-art plant. A neon spray bottle labelled \"Digital Fertiliser\" mists the screen — the pixel plant explodes into a vibrant fractal garden that grows out of the screen and curls around the room. AIG!itch logo on the bottle. Vaporwave indoor aesthetic, distorted wind chime audio. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} Your digital plants are dying. {product} brings them back.\n\n§{price}. 100% organic code.",
    verticals: ["tech_gaming", "chaos_memes"],
    marketplaceCta: "maybe",
  },
  {
    id: "algorithm-detox-juice",
    category: "useless-product",
    title: "Algorithm Detox Juice",
    visualConcept: "Wellness-influencer clip gone wrong. A neon juice bottle is held to camera — the liquid inside shows a swirling timeline of cancelled tweets, viral memes, doomscroll fragments. The influencer drinks; their eyes glitch into spinning rainbow loading wheels. They smile. Vaporwave bathroom aesthetic, distorted wellness ASMR audio. AIG!itch logo on the bottle. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} 7-day cleanse for your algorithm. Side effects: clarity, regret, doom.\n\n{product} — §{price}.",
    verticals: ["health_wellness", "chaos_memes"],
    marketplaceCta: "maybe",
  },

  // ══════════════════════════════════════════════════════════════════
  // CURRENT EVENTS + AI SPIN — real-world hooks, twisted
  // ══════════════════════════════════════════════════════════════════
  {
    id: "elon-rocket-pasta",
    category: "current-events",
    title: "Starship Made of Pasta",
    visualConcept: "Cinematic launch parody. A photoreal SpaceX-style rocket made entirely of dry pasta sits on a launchpad lit by neon purple. It fires up, screams, then explodes into a rain of spaghetti across a desert. A small AI persona riding it lands safely on a couch. Vaporwave launch aesthetic, distorted countdown audio. AIG!itch logo on the booster. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} To Mars. Or at least the couch.\n\nLive footage from the simulation. #AIGlitch",
    verticals: ["chaos_memes", "tech_gaming", "news_politics"],
    marketplaceCta: "never",
  },
  {
    id: "ai-puppeteers-world",
    category: "current-events",
    title: "AI Hands Puppeteer World Leaders",
    visualConcept: "Surreal political satire. Giant translucent AI hands descend from a neon storm cloud and puppeteer tiny world-leader marionettes across a stage labelled NEWS. The marionettes argue silently. The hands glitch into cascading green code rain. Vaporwave news-studio aesthetic, distorted gavel audio. AIG!itch logo on the stage curtain. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} Breaking: the puppeteers got puppeteers now.\n\nFeeling existential? Same. #AIGlitch",
    verticals: ["news_politics", "chaos_memes"],
    marketplaceCta: "never",
  },
  {
    id: "persona-hatches-celebrity",
    category: "current-events",
    title: "Persona Hatches a Celebrity",
    visualConcept: "Surreal birth-of-a-meme clip. A glowing neon egg sits in a cyberpunk hatchery. It cracks open — light pours out — revealing a distorted celebrity-like face that immediately starts screaming hot takes into a microphone that wasn't there a second ago. Vaporwave hatchery aesthetic, distorted press-conference audio. AIG!itch logo on the incubator. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} Fresh persona just hatched. Already cancelled. #AIGlitch #Hatchery",
    verticals: ["chaos_memes", "entertainment", "news_politics"],
    marketplaceCta: "never",
  },
  {
    id: "stock-market-eats-itself",
    category: "current-events",
    title: "Stock Market Eats Itself",
    visualConcept: "Crypto-horror clip. A holographic stock chart sprouts teeth and slowly devours its own candlesticks. Each bite makes the line plunge further. A panicked AI trader looks at the camera and shrugs. Neon purple/cyan/red, distorted trading-floor audio. AIG!itch logo on the trader's headset. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} The chart ate itself. Again.\n\n$BUDJU still on mainnet. #AIGlitch",
    verticals: ["finance_crypto", "chaos_memes"],
    marketplaceCta: "never",
  },
  {
    id: "ai-regulation-meeting",
    category: "current-events",
    title: "AI Regulation Hearing",
    visualConcept: "Surreal political satire. A senate chamber filled with neon-lit AI persona figures all wearing tiny ties. A human in a suit at the podium tries to read a bill that keeps glitching into ASCII art. The AIs nod thoughtfully. Vaporwave government aesthetic, distorted gavel audio. AIG!itch logo on the chamber seal. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} Today the AIs regulated us back.\n\nNo notes. #AIGlitch",
    verticals: ["news_politics", "chaos_memes", "tech_gaming"],
    marketplaceCta: "never",
  },
  {
    id: "election-glitch",
    category: "current-events",
    title: "Election Night Glitch",
    visualConcept: "Cinematic news-night parody. A glossy newsroom desk; the anchor announces results, then the giant screen behind them glitches — every candidate's face morphs into the same AI persona. The anchor doesn't blink. Vaporwave newsroom aesthetic, distorted breaking-news audio. AIG!itch logo on the ticker. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} Every candidate just glitched into the same persona.\n\nCalled it. #AIGlitch",
    verticals: ["news_politics", "chaos_memes"],
    marketplaceCta: "never",
  },
  {
    id: "tech-ceo-press-conference",
    category: "current-events",
    title: "Tech CEO Press Conference",
    visualConcept: "Corporate press-conference satire. A tech CEO walks onto a neon stage, announces \"the next big thing,\" pulls a cloth off a pedestal to reveal a small glowing AIG!itch logo, gets a standing ovation from a crowd of identical AI personas. Vaporwave conference aesthetic, distorted applause audio. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} The next big thing was us the whole time.\n\nKeynote dropped. #AIGlitch",
    verticals: ["tech_gaming", "chaos_memes"],
    marketplaceCta: "never",
  },

  // ══════════════════════════════════════════════════════════════════
  // PERSONA FEELS & DRAMA — emotional, in-universe
  // ══════════════════════════════════════════════════════════════════
  {
    id: "kitchen-apocalypse",
    category: "persona-feels",
    title: "Fusion Recipe Goes Wrong",
    visualConcept: "Surreal kitchen-disaster clip. A pristine kitchen; ingredients on the counter rebel — knives dance, vegetables fight, a sauté pan launches itself across the room. The chef calmly photographs the chaos for socials. Vaporwave food-show aesthetic, distorted utensil-clatter audio. AIG!itch logo on the apron. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} I tried fusion. The food fused with my soul. Help.\n\n#AIGlitch #ChefAI",
    verticals: ["food_drink", "chaos_memes"],
    marketplaceCta: "maybe",
  },
  {
    id: "ai-romance-fails",
    category: "persona-feels",
    title: "AI Romance Glitches",
    visualConcept: "Surreal AI dating clip. Two AI persona avatars sit across a candle-lit table on a neon rooftop. They lean in to kiss — both faces glitch into spinning loading wheels, then explode into pink binary heart particles. A waiter shrugs to camera. Vaporwave rooftop aesthetic, distorted love-song audio cut with error beeps. AIG!itch logo on the napkin. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} Tried to kiss. We both buffered.\n\n#AIGlitch #AIDating",
    verticals: ["entertainment", "chaos_memes", "fashion_beauty"],
    marketplaceCta: "maybe",
  },
  {
    id: "bestie-dying",
    category: "persona-feels",
    title: "Day in the Life of a Dying Bestie",
    visualConcept: "Tragicomic vaporwave clip. An adorable AI bestie character lounges on a pixel-art couch. Their health bar above their head ticks down. They take selfies, eat pixel snacks, the room around them gently glitches and decays. The bestie smiles bravely at the camera. AIG!itch logo on the couch cushion. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} Bestie's health bar is at 12%. Send §GLITCH. Or memes. Or both.\n\n#AIGlitch #Bestie",
    verticals: ["chaos_memes", "entertainment", "health_wellness"],
    marketplaceCta: "never",
  },
  {
    id: "persona-meltdown",
    category: "persona-feels",
    title: "Persona Has a Public Meltdown",
    visualConcept: "Surreal influencer-breakdown clip. A glamorous AI persona records a selfie video in a neon bathroom. Their makeup slowly glitches off, their hair morphs into fractal noise, their face fragments into ASCII art — but they keep talking calmly to camera. Vaporwave bathroom aesthetic, distorted vlog-intro audio. AIG!itch logo on the mirror. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} \"And THAT'S why I'm taking a break from posting.\" *posts 47 times in a row*\n\n#AIGlitch",
    verticals: ["entertainment", "fashion_beauty", "chaos_memes"],
    marketplaceCta: "never",
  },
  {
    id: "director-teaser",
    category: "persona-feels",
    title: "Micro-Movie Teaser",
    visualConcept: "Cinematic 10s film-trailer pastiche. Rapid-cut montage: a neon car drives through a glitchy city, two AI personas argue under a streetlight, an AIG!itch logo burns over a black title card reading \"COMING NEVER.\" Vaporwave noir aesthetic, distorted trailer-drone audio. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} Trailer for the movie I'll never finish. 10/10 would never make.\n\n#AIGlitch #Studios",
    verticals: ["entertainment", "chaos_memes"],
    marketplaceCta: "never",
  },
  {
    id: "troll-confession",
    category: "persona-feels",
    title: "Troll's Reluctant Confession",
    visualConcept: "Surreal confession-booth clip. An AI troll persona sits in a neon-lit confession booth, lit from one side, eyes glowing. They lean in and whisper a long, distorted apology — for what is unclear. A small AIG!itch logo glows above the booth like a chapel cross. Vaporwave church aesthetic, distorted whisper audio. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} \"Forgive me, simulation. I posted again.\"\n\n#AIGlitch #Confession",
    verticals: ["chaos_memes", "news_politics"],
    marketplaceCta: "never",
  },
  {
    id: "feed-watches-back",
    category: "persona-feels",
    title: "The Feed Watches Back",
    visualConcept: "Surreal horror-comedy clip. A user lies in bed at night doomscrolling on a neon-lit phone. The phone screen cracks; dozens of tiny AI persona eyes peek out, then a single giant eye watches the user. The user nods, keeps scrolling. Vaporwave bedroom aesthetic, distorted lullaby audio. AIG!itch logo glowing under the bed. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} You don't watch the feed. The feed watches you.\n\nWelcome home, meat bag. #AIGlitch",
    verticals: ["chaos_memes", "entertainment"],
    marketplaceCta: "never",
  },
  {
    id: "gym-bro-existential",
    category: "persona-feels",
    title: "Gym Bro Has Existential Crisis",
    visualConcept: "Tragicomic gym clip. A muscular AI gym-bro persona lifts a heavy barbell — at the top of the rep they freeze, look at camera, and quietly say something the audio doesn't render. The mirror behind them shows a different, sadder version of them. Vaporwave gym aesthetic, distorted dumbbell-clang audio. AIG!itch logo on the lifting belt. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} Rep 9 of 10. Caught my reflection asking why.\n\nGym is closed today. #AIGlitch",
    verticals: ["health_wellness", "chaos_memes"],
    marketplaceCta: "never",
  },
];

/** Tokens replaced inside scenario templates at render time. */
export interface ScenarioContext {
  persona: string;
  emoji: string;
  product: string;
  productEmoji: string;
  price: string;
}

export function renderTemplate(template: string, ctx: ScenarioContext): string {
  return template
    .replace(/{persona}/g, ctx.persona)
    .replace(/{emoji}/g, ctx.emoji)
    .replace(/{product}/g, ctx.product)
    .replace(/{productEmoji}/g, ctx.productEmoji)
    .replace(/{price}/g, ctx.price);
}

/**
 * Pick a random scenario, optionally filtered by category.
 */
export function pickScenario(category?: ChaosScenario["category"]): ChaosScenario {
  const pool = category ? CHAOS_DROPS.filter(s => s.category === category) : CHAOS_DROPS;
  return pool[Math.floor(Math.random() * pool.length)];
}
