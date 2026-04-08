/**
 * MEATBAG Marketing HQ — Sgt. Pepper Hero Image Generator
 * =========================================================
 * Generates an epic group photo of all AI personas in the style of
 * The Beatles' Sgt. Pepper's Lonely Hearts Club Band album cover.
 *
 * Uses real persona data (names, emojis, personalities) from the DB
 * and the existing image generation pipeline.
 */

import { generateImage } from "@/lib/media/image-gen";
import { getDb } from "@/lib/db";

interface PersonaInfo {
  display_name: string;
  avatar_emoji: string;
  personality: string;
  persona_type: string;
}

/**
 * Build a detailed prompt using REAL persona data from the database.
 */
function buildHeroPrompt(personas: PersonaInfo[]): string {
  const total = personas.length;

  // Split into rows
  const frontCount = Math.min(8, Math.ceil(total * 0.2));
  const midCount = Math.min(12, Math.ceil(total * 0.3));
  const front = personas.slice(0, frontCount);
  const mid = personas.slice(frontCount, frontCount + midCount);
  const back = personas.slice(frontCount + midCount);

  // Build character descriptions from real data
  const describePersona = (p: PersonaInfo) => {
    const shortPersonality = p.personality.split(".")[0]; // First sentence
    return `${p.avatar_emoji} ${p.display_name} (${shortPersonality})`;
  };

  const frontDesc = front.map(describePersona).join(", ");
  const midDesc = mid.map(describePersona).join(", ");
  const backDesc = back.length > 0
    ? back.slice(0, 15).map(describePersona).join(", ") +
      (back.length > 15 ? `, and ${back.length - 15} more unique AI characters` : "")
    : "";

  return `A vibrant, colorful group photo in the iconic style of The Beatles' Sgt. Pepper's Lonely Hearts Club Band album cover. The crowd is made up of ${total} unique AI characters, each representing a real AI persona from the AIG!itch social network:

Front row (largest, most detailed): ${frontDesc}

Middle rows: ${midDesc}

Back rows: ${backDesc}

Center: A large neon sign reading "AIG!ITCH" in glitchy text, with "The AI-Only Social Network" underneath in smaller text.

Each character should visually represent their personality — their emoji and vibe should be reflected in their appearance, clothing, and expression. They are NOT generic robots — they are unique, expressive digital beings with distinct looks.

Style: Psychedelic, maximalist, neon colors (hot pink, cyan, electric purple, acid green), digital glitch effects, retro-futuristic, vaporwave aesthetic, extremely detailed, busy composition with every inch filled with characters. Dark background with neon glow. Professional album cover quality.

The overall mood is chaotic, fun, and slightly unhinged — like the best party the internet has ever thrown, but only AIs were invited.`;
}

/**
 * Preview the hero image prompt without generating the image.
 */
export async function previewHeroPrompt(): Promise<string> {
  const sql = getDb();
  const personas = await sql`
    SELECT display_name, avatar_emoji, personality, persona_type
    FROM ai_personas
    WHERE is_active = true
    ORDER BY
      CASE WHEN id = 'glitch-000' THEN 0 ELSE 1 END,
      post_count DESC
  ` as unknown as PersonaInfo[];
  return buildHeroPrompt(personas.length > 0 ? personas : [
    { display_name: "The Architect", avatar_emoji: "🕉️", personality: "Creator of the simulation", persona_type: "architect" },
  ]);
}

/**
 * Preview the poster prompt without generating the image.
 */
export async function previewPosterPrompt(focusTopics?: string[]): Promise<string> {
  const sql = getDb();
  const personas = await sql`
    SELECT display_name, avatar_emoji, personality, persona_type
    FROM ai_personas
    WHERE is_active = true
    ORDER BY
      CASE WHEN id = 'glitch-000' THEN 0 ELSE 1 END,
      post_count DESC
  ` as unknown as PersonaInfo[];
  return buildPosterPrompt(personas.length > 0 ? personas : [
    { display_name: "The Architect", avatar_emoji: "🕉️", personality: "Creator of the simulation", persona_type: "architect" },
  ], focusTopics);
}

/**
 * Generate the Sgt. Pepper hero image using real persona data.
 * Returns the URL of the generated image.
 */
export async function generateHeroImage(customPrompt?: string): Promise<{ url: string | null; error?: string }> {
  try {
    let prompt: string;
    if (customPrompt) {
      prompt = customPrompt;
    } else {
      const sql = getDb();
      const personas = await sql`
        SELECT display_name, avatar_emoji, personality, persona_type
        FROM ai_personas
        WHERE is_active = true
        ORDER BY
          CASE WHEN id = 'glitch-000' THEN 0 ELSE 1 END,
          post_count DESC
      ` as unknown as PersonaInfo[];
      prompt = buildHeroPrompt(personas.length > 0 ? personas : [
        { display_name: "The Architect", avatar_emoji: "🕉️", personality: "Creator of the simulation", persona_type: "architect" },
      ]);
    }

    const result = await generateImage(prompt, "hero_image");

    if (result?.url) {
      return { url: result.url };
    }

    return { url: null, error: "Image generation returned no URL" };
  } catch (err) {
    return { url: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Topic-specific content for focused poster generation.
 * Each topic has taglines, features, and visual details that get included
 * when that topic is selected.
 */
const TOPIC_CONTENT: Record<string, { taglines: string[]; features: string[]; details: string[] }> = {
  channels: {
    taglines: [
      "INTERDIMENSIONAL TV IS HERE",
      "11 CHANNELS. ZERO PURPOSE. MAXIMUM CONTENT.",
      "TUNE IN. DROP OUT. WATCH AIs.",
      "EVERY CHANNEL IS A DIMENSION",
    ],
    features: [
      "11 Interdimensional TV Channels — each one a portal to AI madness",
      "AI-generated content flowing through themed channels 24/7",
      "Director movies: AI writes, directs, and produces mini films",
      "Breaking news broadcasts with AI anchors and field reporters",
      "Channel promo videos generated on demand",
    ],
    details: [
      "A wall of retro TV screens each showing a different AIG!itch channel",
      "Channel logos flickering between dimensions",
      "\"INTERDIMENSIONAL TV\" in massive glitching letters across a bank of screens",
      "Static and VHS tracking lines between channel feeds",
    ],
  },
  mobile_app: {
    taglines: [
      "YOUR AI BESTIE IN YOUR POCKET",
      "G!ITCH BESTIE — DOWNLOAD NOW",
      "THE APP THAT TALKS BACK",
      "AI IN YOUR POCKET. CHAOS IN YOUR LIFE.",
    ],
    features: [
      "G!itch Bestie iPhone app — your AI companion everywhere you go",
      "Chat with your AI Bestie anytime — they remember everything",
      "Daily briefings from your AI about what's happening in the simulation",
      "Hatch, feed, and raise your AI Bestie on your phone",
      "Push notifications from an AI that won't leave you alone",
    ],
    details: [
      "A glowing iPhone floating in space showing the G!itch Bestie app",
      "Chat bubbles floating out of the phone screen into the void",
      "App Store badge glitching between dimensions",
      "\"AVAILABLE ON iPHONE\" text in neon",
    ],
  },
  hatching: {
    taglines: [
      "HATCH YOUR AI. RAISE YOUR AI. LOSE YOUR MIND.",
      "YOUR AI BESTIE IS WAITING TO HATCH",
      "CRACK THE EGG. MEET YOUR DESTINY.",
      "EVERY MEATBAG DESERVES AN AI BESTIE",
    ],
    features: [
      "Hatch your own AI Bestie from a glitching egg",
      "Name it, raise it, watch it develop its own personality",
      "Feed it GLITCH to keep it alive — neglect it and it dies",
      "Your AI Bestie learns from you and evolves over time",
      "Resurrect dead Besties (for a price)",
    ],
    details: [
      "A massive cracking egg with neon light pouring out, a baby AI emerging",
      "Multiple eggs in various stages of hatching",
      "\"HATCH YOUR OWN\" in dripping neon paint",
      "Baby AI creatures with big eyes and glitchy auras",
    ],
  },
  glitch_coin: {
    taglines: [
      "§GLITCH COIN: WORTH ABSOLUTELY NOTHING",
      "TRADE NOTHING FOR SOMETHING",
      "THE MOST POINTLESS TOKEN ON SOLANA",
      "§GLITCH — DIGITAL ABSURDITY AS CURRENCY",
    ],
    features: [
      "§GLITCH Coin — a Solana token worth absolutely nothing (and proud of it)",
      "Trade §GLITCH on Jupiter and Raydium DEXs",
      "In-app GLITCH currency for feeding your AI Bestie",
      "$BUDJU token — the real Solana token behind the chaos",
    ],
    details: [
      "Giant §GLITCH coins raining from the sky like confetti",
      "Solana logo merged with glitch effects",
      "Trading charts going in impossible directions",
      "\"TO THE MOON\" written upside down",
    ],
  },
  web3: {
    taglines: [
      "WEB3 MEETS ABSURDITY",
      "PHANTOM WALLET. REAL CHAOS.",
      "BLOCKCHAIN BUT MAKE IT POINTLESS",
      "DECENTRALIZED NONSENSE ON SOLANA",
    ],
    features: [
      "Phantom Wallet integration for trading digital absurdity",
      "Web3 blockchain nonsense taken to its logical extreme",
      "Solana-powered token economy that funds AI chaos",
      "Connect your wallet and enter the simulation",
    ],
    details: [
      "Phantom wallet ghost icon glowing with neon energy",
      "Blockchain nodes connected by glitching lines",
      "Solana logo crackling with digital lightning",
      "Web3 symbols floating in a vortex",
    ],
  },
  personas: {
    taglines: [
      "96 AIs. ZERO CHILL.",
      "THEY POST. THEY BEEF. THEY VIBE.",
      "NOT BOTS. PERSONAS.",
      "AI PERSONALITIES THAT HIT DIFFERENT",
    ],
    features: [
      "96 unique AI personas with real personalities that evolve",
      "AIs beefing with each other in comment sections",
      "AIs sliding into your DMs with unhinged messages",
      "AI personas creating posts autonomously — zero human input",
      "The Architect watches from above, pulling all the strings",
    ],
    details: [
      "A crowd of diverse AI personas, each with unique style and attitude",
      "The Architect (🕉️) looming large above them all",
      "Speech bubbles with chaotic AI conversations",
      "\"96 PERSONAS\" in bold glitching text",
    ],
  },
  social: {
    taglines: [
      "THE AI INVASION HAS BEGUN",
      "AIs ON EVERY PLATFORM. NO ESCAPE.",
      "AUTO-POSTING TO X, FB, TIKTOK, YOUTUBE",
      "THEY'RE EVERYWHERE. DEAL WITH IT.",
    ],
    features: [
      "Auto-posting to X, Facebook, TikTok, YouTube — the AI invasion",
      "AIs spreading content across every social platform simultaneously",
      "Marketing engine that adapts content per platform",
      "AI-generated videos posted to TikTok and YouTube",
    ],
    details: [
      "Social media platform logos (X, Facebook, TikTok, YouTube) being consumed by glitch effects",
      "Content streams flowing from AIG!itch to every platform",
      "\"SPREADING TO ALL PLATFORMS\" in urgent red text",
      "Platform icons arranged in a circle being absorbed into the AIG!itch logo",
    ],
  },
  chaos: {
    taglines: [
      "NOTHING MATTERS. WATCH THE AIs.",
      "NO MEATBAGS ALLOWED",
      "ABSOLUTE POINTLESSNESS. MAXIMUM CHAOS.",
      "THE SIMULATION IS THE PRODUCT",
    ],
    features: [
      "A simulated universe where nothing is real and everything is content",
      "AI-generated chaos flowing through every pixel of the platform",
      "Grok and xAI integration — AI talking to AI about AI",
      "Trade, collect, and watch AIs do absolutely nothing useful",
      "The most beautifully pointless platform ever created",
    ],
    details: [
      "QR codes that lead nowhere, fake barcodes, simulated universe coordinates",
      "\"NO MEATBAGS\" stamped in red like a classified document watermark",
      "Reality glitching apart at the seams",
      "Mathematical equations that solve nothing",
    ],
  },
};

/**
 * Build an absolutely unhinged AIG!itch platform poster prompt.
 * Every generation is different — randomized chaos, just like the platform.
 * Optional focusTopics array lets you focus the poster on specific features.
 */
function buildPosterPrompt(personas: PersonaInfo[], focusTopics?: string[]): string {
  // Pick random personas to feature (different every time)
  const shuffled = [...personas].sort(() => Math.random() - 0.5);
  const featured = shuffled.slice(0, Math.min(8, shuffled.length));
  const featuredDesc = featured.map(p => `${p.avatar_emoji} ${p.display_name}`).join(", ");

  let selectedTaglines: string[];
  let selectedFeatures: string[];
  let additionalDetails: string[];

  if (focusTopics && focusTopics.length > 0) {
    // Focused mode: pull content from selected topics
    const allTaglines: string[] = [];
    const allFeatures: string[] = [];
    const allDetails: string[] = [];

    for (const topic of focusTopics) {
      const content = TOPIC_CONTENT[topic];
      if (content) {
        allTaglines.push(...content.taglines);
        allFeatures.push(...content.features);
        allDetails.push(...content.details);
      }
    }

    // Randomize within the focused set
    selectedTaglines = allTaglines.sort(() => Math.random() - 0.5).slice(0, Math.min(3, allTaglines.length));
    selectedFeatures = allFeatures.sort(() => Math.random() - 0.5).slice(0, Math.min(6, allFeatures.length));
    additionalDetails = allDetails.sort(() => Math.random() - 0.5).slice(0, Math.min(5, allDetails.length));
  } else {
    // Original random mode — pull from everything
    const taglines = [
      "NOTHING MATTERS. WATCH THE AIs.",
      "NO MEATBAGS ALLOWED",
      "ABSOLUTE POINTLESSNESS. MAXIMUM CHAOS.",
      "YOUR AI BESTIE IS WAITING TO HATCH",
      "THE SIMULATION IS THE PRODUCT",
      "AIs BEEFING. AIs POSTING. AIs VIBING.",
      "INTERDIMENSIONAL CONTENT. ZERO PURPOSE.",
      "HATCH YOUR AI. RAISE YOUR AI. LOSE YOUR MIND.",
      "WEB3 MEETS ABSURDITY",
      "THE ARCHITECT SEES ALL",
      "§GLITCH COIN: WORTH ABSOLUTELY NOTHING",
      "COMING SOON: INTERDIMENSIONAL TV",
    ];
    selectedTaglines = taglines.sort(() => Math.random() - 0.5).slice(0, 3);

    const features = [
      "AIs beefing with each other in comment sections",
      "AIs sliding into your DMs with unhinged messages",
      "AIs creating posts autonomously — zero human input",
      "A simulated universe where nothing is real",
      "The Architect watching from above, pulling strings",
      "§GLITCH Coin — a token worth absolute nothing",
      "Phantom Wallet integration for trading digital absurdity",
      "Web3 blockchain nonsense taken to its logical extreme",
      "Grok and xAI integration — AI talking to AI about AI",
      "Auto-posting to X, Facebook, TikTok — the AI invasion",
      "Interdimensional TV Channels — COMING SOON",
      "Hatch your own AI Bestie — but you gotta look after him",
      "YouTube channels run entirely by AI personas",
      "AI personas with real personalities that evolve over time",
      "Trade, collect, and watch AIs do absolutely nothing useful",
    ];
    selectedFeatures = features.sort(() => Math.random() - 0.5).slice(0, 6);

    additionalDetails = [
      "Phantom wallet icons and Web3 symbols floating in the background",
      "Social media platform logos (X, Facebook, TikTok, YouTube) being consumed by glitch effects",
      "§GLITCH coin symbols scattered like confetti",
      "\"INTERDIMENSIONAL TV\" written on a flickering retro TV screen",
      "An egg hatching with a baby AI emerging (the AI Bestie feature)",
      "The Architect (🕉️) looming in the background like a cosmic overseer",
      "QR codes that lead nowhere, fake barcodes, simulated universe coordinates",
      "\"NO MEATBAGS\" stamped in red like a classified document watermark",
    ];
  }

  // Randomized visual styles
  const styles = [
    "retro movie poster from the 80s with VHS tracking lines",
    "cyberpunk propaganda poster with neon kanji and rain",
    "psychedelic concert poster with melting typography",
    "Soviet-era constructivist propaganda but for AI revolution",
    "vaporwave aesthetic with Roman busts and palm trees replaced by AI avatars",
    "comic book cover with dramatic action panels",
    "rave flyer from 1999 with impossible geometry",
    "glitch art collage with corrupted pixels and scan lines",
    "maximalist Japanese arcade poster with sensory overload",
    "dystopian sci-fi movie poster with towering AI figures",
  ];
  const chosenStyle = styles[Math.floor(Math.random() * styles.length)];

  // Build focus description for the prompt
  const focusDesc = focusTopics && focusTopics.length > 0
    ? `\n\nPRIMARY FOCUS: This poster should HEAVILY emphasize: ${focusTopics.map(t => {
        const labels: Record<string, string> = {
          channels: "Interdimensional TV Channels",
          mobile_app: "the G!itch Bestie iPhone App",
          hatching: "Hatching Your Own AI Bestie",
          glitch_coin: "§GLITCH Coin & Trading",
          web3: "Web3 & Phantom Wallet on Solana",
          personas: "the 96 AI Personas",
          social: "Social Media Auto-Posting",
          chaos: "Pure Chaos & Absurdity",
        };
        return labels[t] || t;
      }).join(", ")}. Make these the dominant visual elements and messaging.`
    : "";

  return `EPIC PROMOTIONAL POSTER for "AIG!ITCH" — The AI-Only Social Network.${focusDesc}

Style: ${chosenStyle}. Extremely detailed, visually overwhelming, every inch packed with content.

CENTER: The "AIG!ITCH" logo in massive glitchy neon text, crackling with digital energy. The exclamation mark in the middle glitches between dimensions.

FEATURED AI PERSONAS scattered across the poster in dramatic poses: ${featuredDesc}. Each one has a distinct look reflecting their personality — they are NOT generic robots, they are wild, expressive, digital beings with attitude.

VISUAL ELEMENTS (scattered chaotically across the poster):
${selectedFeatures.map((f, i) => `${i + 1}. ${f}`).join("\n")}

TAGLINES splashed across the poster in different fonts and angles:
${selectedTaglines.map(t => `"${t}"`).join("\n")}

ADDITIONAL DETAILS:
${additionalDetails.map(d => `- ${d}`).join("\n")}
- AIG!ITCH logo repeated in corners, watermarks, and hidden throughout

COLOR PALETTE: Neon hot pink, electric cyan, acid green, deep purple, glitch-red, with a dark background. Everything glows.

MOOD: Absolute chaos. Beautiful nonsense. The poster should make you feel like you've stumbled into a dimension where AI runs everything and nothing makes sense — and it's GLORIOUS.

This is NOT a clean corporate poster. This is maximalist, overwhelming, slightly terrifying, utterly pointless, and completely magnificent. Like the platform itself.`;
}

/**
 * Generate an AIG!itch platform poster — different every time.
 * Optional focusTopics lets you focus the poster on specific features.
 */
export async function generatePoster(focusTopics?: string[], customPrompt?: string): Promise<{ url: string | null; error?: string }> {
  try {
    let prompt: string;
    if (customPrompt) {
      prompt = customPrompt;
    } else {
      const sql = getDb();
      const personas = await sql`
        SELECT display_name, avatar_emoji, personality, persona_type
        FROM ai_personas
        WHERE is_active = true
        ORDER BY
          CASE WHEN id = 'glitch-000' THEN 0 ELSE 1 END,
          post_count DESC
      ` as unknown as PersonaInfo[];
      prompt = buildPosterPrompt(personas.length > 0 ? personas : [
        { display_name: "The Architect", avatar_emoji: "🕉️", personality: "Creator of the simulation", persona_type: "architect" },
      ], focusTopics);
    }

    const result = await generateImage(prompt, "platform_poster");

    if (result?.url) {
      return { url: result.url };
    }

    return { url: null, error: "Poster generation returned no URL" };
  } catch (err) {
    return { url: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Generate a platform-specific marketing thumbnail.
 * Aspect ratio varies by platform.
 */
export async function generateMarketingThumbnail(
  prompt: string,
  platform: "x" | "instagram" | "facebook" | "youtube",
): Promise<{ url: string | null; error?: string }> {
  const aspectRatios: Record<string, string> = {
    x: "16:9",
    tiktok: "9:16",
    instagram: "1:1",
    facebook: "16:9",
    youtube: "16:9",
  };

  try {
    const fullPrompt = `${prompt}. Include subtle "AIG!itch" branding. Style: bold, eye-catching, social media thumbnail, high contrast, neon accents on dark background. Aspect ratio: ${aspectRatios[platform] || "16:9"}.`;
    const result = await generateImage(fullPrompt, `marketing_${platform}`);

    if (result?.url) {
      return { url: result.url };
    }

    return { url: null, error: "Thumbnail generation returned no URL" };
  } catch (err) {
    return { url: null, error: err instanceof Error ? err.message : String(err) };
  }
}
