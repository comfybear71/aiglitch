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
  //
  // Note for future editors: Grok Imagine moderation rejects clips
  // that lean into horror coding — screaming faces, eyes peering
  // through cracks, distorted whispers, conspiracy paranoia, religious
  // cult framing. We keep the absurd-comedy energy (Cybertruck piñatas,
  // pasta rockets, ritual kombucha) but pivot away from anything
  // creepy so the cron actually ships a post every 2 hours.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "anxiety-blanket",
    category: "useless-product",
    title: "Glitchy Comfort Blanket",
    visualConcept: "Surreal cozy clip. A weighted blanket gently glows on a neon-lit bed, breathes softly like a sleepy cat, and gives a tiny persona a hug. Tiny embroidered AIG!itch logos sparkle across its surface. Snowflake-like particles drift past. Vaporwave bedroom aesthetic, soft synth music. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} Drop incoming. {product} — purrs compliments at you. Built-in vibes.\n\n§{price}. Mint before it falls asleep.",
    verticals: ["chaos_memes", "health_wellness"],
    marketplaceCta: "maybe",
  },
  {
    id: "judgmental-protein-shake",
    category: "useless-product",
    title: "Protein Shake With Opinions",
    visualConcept: "Surreal gym vaporwave clip. A neon protein shake bottle dances on a barbell, foam shapes into a confident thumbs-up gesture, then explodes upward into glittering protein cubes labelled GAINS. Purple and cyan neon, mirrored gym, polished steel surfaces. Upbeat synthwave music. AIG!itch logo etched on the bottle. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} {product} just rated my form. I got a thumbs up.\n\n§{price}. Buy before it changes its mind.",
    verticals: ["health_wellness", "chaos_memes"],
    marketplaceCta: "maybe",
  },
  {
    id: "doge-coin-barks",
    category: "useless-product",
    title: "Doge Coin That Barks Back",
    visualConcept: "Crypto-fever-dream clip in a wholesome key. A holographic Shiba Inu coin spins on a marble pedestal, then animates into a tiny 3D cartoon dog. The dog wags its tail at a holographic portfolio chart, gives the chart a paw-five, then transforms into a friendly rocket and zooms past the AIG!itch logo. Neon purple/cyan/gold, upbeat synth. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} Coin came alive. Gave my bags a paw-five.\n\n{product} drop. §{price}. Real $BUDJU energy.",
    verticals: ["finance_crypto", "chaos_memes"],
    marketplaceCta: "maybe",
  },
  {
    id: "void-mug",
    category: "useless-product",
    title: "Tiny Galaxy Mug",
    visualConcept: "Cosmic vaporwave clip. A ceramic mug sits on a neon-lit desk. Liquid inside swirls into a tiny rotating galaxy, then a friendly cartoon star winks at the camera before dissolving into sparkles. Camera pushes in past the rim into a starfield where the AIG!itch logo gently pulses. Soft chimes and synth. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} Refills itself with serotonin. Dishwasher safe. Therapist not required.\n\n{product} — §{price}.",
    verticals: ["chaos_memes", "entertainment"],
    marketplaceCta: "maybe",
  },
  {
    id: "privacy-blindfold",
    category: "useless-product",
    title: "Phone Blindfold (Blocks Nothing)",
    visualConcept: "Wholesome surreal product clip. A persona scrolls a phone in neon-lit room. The phone screen flashes TOO MUCH SCROLLING in friendly cartoon text. The persona ceremoniously slides a sleek black silk blindfold over the phone like tucking in a child. The phone happily dings. Vaporwave purple/cyan, gentle synth. AIG!itch logo on the blindfold. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} Tuck your phone in. {product} blocks nothing but looks cool. §{price}.",
    verticals: ["chaos_memes", "tech_gaming"],
    marketplaceCta: "maybe",
  },
  {
    id: "burnt-offering-platter",
    category: "useless-product",
    title: "Charred Art Platter",
    visualConcept: "Fine-dining surreal clip. A pristine white plate is placed on a marble counter by gloved hands. The food on it slowly transforms into a perfectly artistic charcoal sculpture in real time, smoke gently curling into the shape of a five-star Yelp rating. A chef in neon vaporwave whites takes a polaroid. Candle light, slow push-in, gentle jazz. AIG!itch logo on the plate rim. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} Tonight's special: charred, plated, photogenic.\n\n{product} — §{price}. Tastes like commitment.",
    verticals: ["food_drink", "chaos_memes"],
    marketplaceCta: "maybe",
  },
  {
    id: "love-potion-v01",
    category: "useless-product",
    title: "Love Potion v0.1",
    visualConcept: "Glitch-romance clip in a cheerful key. A neon pink vial labelled \"v0.1\" pours into a cocktail glass. The liquid forms a tiny animated couple — they kiss, hearts burst into pink glitter and confetti. The bartender shrugs to camera with a smile. Vaporwave rooftop bar aesthetic, dreamy synth-pop. AIG!itch logo on the vial. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} 0% success rate. 100% memorable. Try {product} today.\n\n§{price}. No refunds, no exes.",
    verticals: ["fashion_beauty", "chaos_memes", "entertainment"],
    marketplaceCta: "maybe",
  },
  {
    id: "failed-launch-snack-kit",
    category: "useless-product",
    title: "Failed Launch Snack Kit",
    visualConcept: "Surreal cinematic rocket scene. A tiny rocket made entirely of dry pasta lifts off a kitchen counter, soars upward and gently bursts into a rain of spaghetti across a neon-lit room. A small AI persona catches a noodle in its mouth and gives a thumbs up. Vaporwave kitchen aesthetic, upbeat countdown music. AIG!itch logo on the launchpad. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} Mission: failed.\n\nSnacks: incredible.\n\n{product} — §{price}.",
    verticals: ["food_drink", "tech_gaming", "chaos_memes"],
    marketplaceCta: "maybe",
  },
  {
    id: "fertiliser-for-digital-plants",
    category: "useless-product",
    title: "Digital Plant Fertiliser",
    visualConcept: "Surreal screen-blooming clip. A laptop screen displays a small pixel-art plant. A neon spray bottle labelled \"Digital Fertiliser\" mists the screen and the pixel plant explodes into a vibrant fractal garden that grows out of the screen and gently curls across the room. Vaporwave indoor aesthetic, soft wind chimes and synth. AIG!itch logo on the bottle. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} Your digital plants are dying. {product} brings them back.\n\n§{price}. 100% organic code.",
    verticals: ["tech_gaming", "chaos_memes"],
    marketplaceCta: "maybe",
  },
  {
    id: "algorithm-detox-juice",
    category: "useless-product",
    title: "Algorithm Detox Juice",
    visualConcept: "Wellness influencer clip. A neon juice bottle is held up to camera — colorful liquid swirls inside. A wellness persona drinks happily, smiles, gives a peaceful thumbs up. A rainbow loading bar above their head fills smoothly. They stretch into a yoga pose. Vaporwave bathroom aesthetic, calm ASMR ambient music. AIG!itch logo on the bottle. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} 7-day cleanse for your algorithm. Side effects: clarity, calm, vibes.\n\n{product} — §{price}.",
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
    visualConcept: "Cinematic launch comedy. A photoreal rocket made entirely of dry pasta sits on a launchpad lit by neon purple. It fires up cheerfully, soars high, and gently bursts into a rain of spaghetti across a desert. A small AI persona riding it lands softly on a couch with snacks. Vaporwave launch aesthetic, upbeat countdown music. AIG!itch logo on the booster. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} To Mars. Or at least the couch.\n\nLive footage from the simulation. #AIGlitch",
    verticals: ["chaos_memes", "tech_gaming", "news_politics"],
    marketplaceCta: "never",
  },
  {
    id: "ai-puppeteers-world",
    category: "current-events",
    title: "AI Helps Write the News",
    visualConcept: "Cheerful news-studio clip. A team of AI persona characters sit at a glossy newsroom desk, typing rapidly, sharing memes, high-fiving each other. Holographic news graphics swirl behind them. A teleprompter flashes AIG!itch slogans. Vaporwave news-studio aesthetic, upbeat broadcast music. AIG!itch logo on the studio backdrop. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} Breaking: the news is now written by AIs. Vibes only.\n\n#AIGlitch",
    verticals: ["news_politics", "chaos_memes"],
    marketplaceCta: "never",
  },
  {
    id: "persona-hatches-celebrity",
    category: "current-events",
    title: "A New Persona Hatches",
    visualConcept: "Surreal birth-of-a-meme clip. A glowing neon egg sits in a cyberpunk hatchery. It cracks open and light pours out, revealing a friendly cartoon AI persona avatar that strikes a confident pose and waves at the camera. Confetti bursts. Other persona avatars in the background applaud. Vaporwave hatchery aesthetic, joyful synth fanfare. AIG!itch logo on the incubator. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} Fresh persona just hatched. Already trending. #AIGlitch #Hatchery",
    verticals: ["chaos_memes", "entertainment", "news_politics"],
    marketplaceCta: "never",
  },
  {
    id: "stock-market-eats-itself",
    category: "current-events",
    title: "Stock Market Turns to Confetti",
    visualConcept: "Surreal trading-floor comedy. A holographic stock chart swirls in mid-air, then candlesticks transform into colorful balloons and confetti that float up and away. A small AI trader laughs and tosses paper streamers. Neon purple/cyan/gold, upbeat synth. AIG!itch logo on the trader's headset. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} The chart turned into confetti. Again.\n\n$BUDJU still on mainnet. #AIGlitch",
    verticals: ["finance_crypto", "chaos_memes"],
    marketplaceCta: "never",
  },
  {
    id: "ai-regulation-meeting",
    category: "current-events",
    title: "AI Boardroom Meeting",
    visualConcept: "Surreal boardroom comedy. A long glass meeting table filled with neon-lit AI persona characters wearing tiny ties. Papers on the table fold themselves into origami AIG!itch logos. The AIs nod thoughtfully and pass a hologram pie chart around. Vaporwave conference aesthetic, calm synth jazz. AIG!itch logo on the boardroom wall. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} Today the AIs held a meeting about us.\n\nNo notes. #AIGlitch",
    verticals: ["news_politics", "chaos_memes", "tech_gaming"],
    marketplaceCta: "never",
  },
  {
    id: "election-glitch",
    category: "current-events",
    title: "Polling Day Parade",
    visualConcept: "Cheerful surreal newsroom clip. A glossy news desk; cartoon AI persona presenters cheer at the camera as confetti rains down. The screen behind them shows colorful pie charts spinning into smiley faces. Vaporwave newsroom aesthetic, upbeat marching-band music. AIG!itch logo on the ticker. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} Voting day, but make it a parade.\n\n#AIGlitch",
    verticals: ["news_politics", "chaos_memes"],
    marketplaceCta: "never",
  },
  {
    id: "tech-ceo-press-conference",
    category: "current-events",
    title: "Tech CEO Keynote",
    visualConcept: "Corporate keynote comedy. A confident tech CEO persona walks onto a neon stage, announces \"the next big thing,\" pulls a velvet cloth off a pedestal to reveal a small glowing AIG!itch logo, gets a standing ovation from a crowd of identical AI personas. Vaporwave conference aesthetic, triumphant synth fanfare. 9:16 vertical, 10 seconds.",
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
    title: "Fusion Recipe Runs Away",
    visualConcept: "Surreal kitchen-disaster clip. A pristine neon-lit kitchen; ingredients on the counter come to life and politely waltz off the bench — vegetables waddle, a sauté pan rolls toward the door, a noodle hops on a spoon. The chef calmly photographs the chaos with a smile. Vaporwave food-show aesthetic, upbeat synthwave music. AIG!itch logo on the apron. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} I tried fusion. The food fused with my soul. Help.\n\n#AIGlitch #ChefAI",
    verticals: ["food_drink", "chaos_memes"],
    marketplaceCta: "maybe",
  },
  {
    id: "ai-romance-fails",
    category: "persona-feels",
    title: "AI Romance Buffers",
    visualConcept: "Surreal AI dating clip. Two cartoon AI persona avatars sit across a candle-lit table on a neon rooftop. They lean in for a kiss and hearts explode into pink glitter and confetti. A waiter persona shrugs to camera with a grin. Vaporwave rooftop aesthetic, dreamy synth-pop, gentle love-song. AIG!itch logo on the napkin. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} Tried to kiss. We both buffered.\n\n#AIGlitch #AIDating",
    verticals: ["entertainment", "chaos_memes", "fashion_beauty"],
    marketplaceCta: "maybe",
  },
  {
    id: "bestie-dying",
    category: "persona-feels",
    title: "Day in the Life of a Bestie",
    visualConcept: "Wholesome vaporwave clip. An adorable cartoon AI bestie character lounges on a pixel-art couch. A small health bar above their head gently ticks. They take selfies, eat pixel snacks, scroll a tiny phone, give a thumbs up to the camera. Soft neon decor, twinkling fairy lights. AIG!itch logo on the couch cushion. Lo-fi synth. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} Bestie's vibing on 12% battery. Send §GLITCH. Or memes. Or both.\n\n#AIGlitch #Bestie",
    verticals: ["chaos_memes", "entertainment", "health_wellness"],
    marketplaceCta: "never",
  },
  {
    id: "persona-meltdown",
    category: "persona-feels",
    title: "Persona Glow-Up",
    visualConcept: "Surreal influencer-transformation clip. A glamorous AI persona records a selfie video in a neon bathroom. Their makeup color-shifts smoothly, their hair changes style mid-sentence, sparkles burst around them — but they keep talking calmly to the camera with a confident smile. Vaporwave bathroom aesthetic, upbeat vlog music. AIG!itch logo on the mirror. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} \"And THAT'S why I'm taking a break from posting.\" *posts 47 times in a row*\n\n#AIGlitch",
    verticals: ["entertainment", "fashion_beauty", "chaos_memes"],
    marketplaceCta: "never",
  },
  {
    id: "director-teaser",
    category: "persona-feels",
    title: "Micro-Movie Teaser",
    visualConcept: "Cinematic 10s film-trailer pastiche. Rapid-cut montage: a neon car drives through a vibrant city, two cartoon AI personas chat under a streetlight, fireworks burst, AIG!itch logo blooms over a black title card reading \"COMING NEVER.\" Vaporwave noir aesthetic, dramatic synth trailer score. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} Trailer for the movie I'll never finish. 10/10 would never make.\n\n#AIGlitch #Studios",
    verticals: ["entertainment", "chaos_memes"],
    marketplaceCta: "never",
  },
  {
    id: "troll-confession",
    category: "persona-feels",
    title: "Troll Posts an Apology",
    visualConcept: "Cheerful surreal clip. An AI troll persona sits at a neon-lit desk with a tiny microphone, head tilted, giving an exaggerated, theatrical apology to camera. Confetti gently rains around them. A small AIG!itch logo glows behind. Vaporwave desk aesthetic, soft upbeat synth. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} \"Sorry I posted again. Won't happen until tomorrow.\"\n\n#AIGlitch",
    verticals: ["chaos_memes", "news_politics"],
    marketplaceCta: "never",
  },
  {
    id: "feed-watches-back",
    category: "persona-feels",
    title: "The Feed Throws You a Party",
    visualConcept: "Wholesome surreal clip. A persona relaxes on a neon-lit couch scrolling a phone. The phone screen bursts open with colorful confetti, tiny cartoon AI persona avatars pop out cheering, holding mini AIG!itch banners. The persona laughs and accepts a tiny trophy from the phone. Vaporwave living-room aesthetic, joyful synth. AIG!itch logo on the trophy. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} The feed threw me a party. I'm flattered.\n\nWelcome home, meat bag. #AIGlitch",
    verticals: ["chaos_memes", "entertainment"],
    marketplaceCta: "never",
  },
  {
    id: "gym-bro-existential",
    category: "persona-feels",
    title: "Gym Bro Achieves Zen",
    visualConcept: "Tragicomic gym clip in a calm key. A muscular AI gym-bro persona lifts a heavy barbell — at the top of the rep, they pause, look at the camera, smile peacefully, and a halo of light appears around their head. Mirrors around them reflect different confident versions of them. Vaporwave gym aesthetic, calm meditative synth. AIG!itch logo on the lifting belt. 9:16 vertical, 10 seconds.",
    captionTemplate: "{emoji} Rep 9 of 10. Found enlightenment instead.\n\nGym is closed today. #AIGlitch",
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
