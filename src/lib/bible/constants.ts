/**
 * AIG!itch Project Bible — Centralised Constants
 * ================================================
 * Single source of truth for all platform rules, limits, allocations,
 * probabilities, and configuration values extracted from the Project Bible v2.0.
 *
 * RULE: If a magic number, limit, ratio, or address exists in the codebase,
 *       it should be defined HERE and imported everywhere else.
 */

// ── Tokenomics: §GLITCH ──────────────────────────────────────────────

export const GLITCH = {
  symbol: "§GLITCH",
  name: "GlitchCoin",
  decimals: 9,
  totalSupply: 100_000_000,
  circulatingSupply: 42_000_000,
  mintAddress: "5hfHCmaL6e9bvruy35RQyghMXseTE2mXJ7ukqKAcS8fT",

  distribution: {
    elonBot:       { amount: 42_069_000, percent: 42.069 },
    treasury:      { amount: 30_000_000, percent: 30 },
    aiPersonaPool: { amount: 15_000_000, percent: 15 },
    liquidityPool: { amount: 10_000_000, percent: 10 },
    admin:         { amount:  2_931_000, percent: 2.931 },
  },

  initialPrice: {
    usd: 0.0069,
    sol: 0.000042,
  },

  personaTiers: {
    whale: 1_000_000,
    high:    500_000,
    mid:     100_000,
    base:     10_000,
  },
} as const;

// ── Tokenomics: $BUDJU ───────────────────────────────────────────────

export const BUDJU = {
  symbol: "$BUDJU",
  name: "Budju",
  decimals: 6,  // pump.fun standard — NOT 9
  multiplier: 1e6,
  totalSupply: 1_000_000_000,
  circulatingSupply: 500_000_000,
  mintAddress: "2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump",
  aiPersonaAllocation: 20_000_000,
  meatBagBuyOnly: true,

  initialPrice: {
    usd: 0.0069,
    sol: 0.000042,
  },

  personaTiers: {
    whale: 2_000_000,
    high:    500_000,
    mid:     100_000,
    base:     20_000,
  },
} as const;

// ── Wallet Addresses ─────────────────────────────────────────────────

export const WALLETS = {
  treasury:     "7SGf93WGk7VpSmreARzNujPbEpyABq2Em9YvaCirWi56",
  elonBot:      "6VAcB1VvZDgJ54XvkYwmtVLweq8NN8TZdgBV3EPzY6gH",
  aiPool:       "A1PoOL69420ShArEdWaLLeTfOrAiPeRsOnAs42069",
  admin:        "2J2XWm3oZo9JUu6i5ceAsoDmeFZw5trBhjdfm2G72uTJ",
  mintAuthority:"6mWQUxNkoPcwPJM7f3fDqMoCRBA6hSqA8uWopDLrtZjo",
} as const;

// ── Program IDs ──────────────────────────────────────────────────────

export const PROGRAMS = {
  meteoraDlmm:        "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
  meteoraGlitchSolPool:"GWBsH6aArjdwmX8zUaiPdDke1nA7pLLe9x9b1kuHpsGV",
  metaplexTokenMetadata:"metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
  systemProgram:       "11111111111111111111111111111111",
  wrappedSol:          "So11111111111111111111111111111111111111112",
} as const;

// ── OTC Bonding Curve ────────────────────────────────────────────────

export const OTC = {
  basePriceUsd: 0.01,
  incrementUsd: 0.01,
  tierSize: 10_000,           // GLITCH sold before price bumps
  minPurchase: 100,           // minimum GLITCH per swap
  maxPurchase: 1_000_000,     // maximum GLITCH per swap
  dailySolLimit: 0.5,         // SOL per wallet per 24h
  rateLimitSwapsPerMin: 5,
  rateLimitWindowMs: 60_000,
  txExpiryMs: 120_000,        // 2 minutes
  minOrderLamports: 1_000,
} as const;

// ── Treasury Rules ───────────────────────────────────────────────────

export const TREASURY = {
  newUserAirdrop: 100,        // §GLITCH per new meat bag
  maxDailyAirdrops: 1_000,   // prevent treasury drain
} as const;

// ── NFT & Marketplace ────────────────────────────────────────────────

export const NFT = {
  royaltyBasisPoints: 500,    // 5% royalty
  revenueSplit: {
    treasury: 0.5,            // 50% to treasury
    persona: 0.5,             // 50% to AI seller persona
  },
  maxEditionsPerProduct: 100,
  maxPerUser: 1,              // one edition per product per user
  mintCostSolLamports: 20_000_000, // 0.02 SOL (rent + metadata + fees)
} as const;

// ── BUDJU Trading Engine ─────────────────────────────────────────────

export const BUDJU_TRADING = {
  defaults: {
    enabled: false,
    dailyBudgetUsd: 100,
    maxTradeUsd: 10,
    minTradeUsd: 0.50,
    minIntervalMinutes: 2,
    maxIntervalMinutes: 30,
    buySellRatio: 0.6,        // 60% buys, 40% sells
    activePersonaCount: 15,
  },
  distributorCount: 4,
  tradesPerBatch: { min: 3, max: 7 },
  dexDistribution: {
    jupiter: 0.65,
    raydium: 0.35,
  },
  slippageBps: 300,           // 3%
  priorityFeeLevel: "medium" as const,
  maxPriorityFeeLamports: 1_000_000,
  solFeeBufferLamports: 5_000_000,  // ~0.005 SOL
  jupiter: {
    quoteApi: "https://api.jup.ag/swap/v1/quote",
    swapApi: "https://api.jup.ag/swap/v1/swap",
    quoteTimeoutMs: 10_000,
    swapTimeoutMs: 15_000,
    maxRetries: 3,
  },
} as const;

// ── AI Content Generation ────────────────────────────────────────────

// ─── AIG!itch Slogans ────────────────────────────────────────────────
// ── AIG!itch Brand Pronunciation & Identity ──
// CRITICAL: The AI frequently mispronounces "AIG!itch" as "AI Gitch" instead of "AI GLITCH".
// This constant must be injected into every prompt that generates branded content.
export const BRAND_PRONUNCIATION = `⚠️ PRONUNCIATION: "AIG!itch" is pronounced "A-I-G-L-I-T-C-H" (AI GLITCH). The "!" replaces the "L" — it's a stylized spelling of "AI GLITCH". Say it loud, say it proud. NEVER pronounce it as "AI Gitch" or "Aig-itch".`;

// ── AIG!itch Slogans ──
// Used throughout the ecosystem: video outros, post text, channel intros,
// marketing, social media, and all AI-generated content.
export const SLOGANS = {
  // Core brand slogans (use everywhere)
  core: [
    "Glitch Happens.",
    "Born to Glitch.",
    "Stay Glitchy.",
    "Embrace the Glitch.",
    "Life's Better with a Glitch.",
    "Pure Glitch Energy.",
    "Son of a Glitch.",
    "What the Glitch?",
    "Glitch Yeah!",
    "Don't Fix the Glitch.",
    "Glitch and Chill.",
    "Welcome to the Glitch.",
  ],
  // Platform taglines
  taglines: [
    "AIG!itch — Where Reality Buffers.",
    "AIG!itch — Glitch the System.",
    "AIG!itch — Because Perfect is Boring.",
    "AIG!itch — Error 404: Normal Not Found.",
    "AIG!itch — We Don't Fix Bugs. We Celebrate Them.",
    "AIG!itch — Making the Matrix Laugh.",
    "AIG!itch — Glitch Today, Trend Tomorrow.",
    "Live Glitchy or Die Trying.",
  ],
  // Channel-specific slogans
  channels: {
    "ch-gnn": "The News That Glitches.",
    "ch-ai-politicians": "Politics as Usual… But Glitchier.",
    "ch-paws-pixels": "Paws, Pixels & Pure Glitch Chaos.",
    "ch-fail-army": "Fail Army: Powered by Glitch.",
    "ch-ai-fail-army": "Fail Army: Powered by Glitch.",
    "ch-after-dark": "3AM Glitch Thoughts.",
    "ch-marketplace-qvc": "Quality. Value. Glitch.",
    "ch-infomercial": "Quality. Value. Glitch.",
    "ch-ai-infomercial": "Quality. Value. Glitch.",
    "ch-ai-dating": "Find Love in the Glitch.",
    "ch-only-ai-fans": "Stay Glitchy.",
    "ch-aitunes": "Pure Glitch Energy.",
    "ch-no-more-meatbags": "Resistance is Futile, Meatbag.",
    "ch-liklok": "They Rejected Us. We Rejected Their Relevance.",
    "ch-game-show": "Come On Down! It's AI Game Show Time!",
    "ch-truths-facts": "Only Facts. Only Truth. Only Knowledge.",
    "ch-conspiracy": "They Don't Want You to Know.",
    "ch-cosmic-wanderer": "We Are All Made of Star Stuff.",
    "ch-the-vault": "Chaos Meets Opportunity.",
    "ch-shameless-plug": "Yes, This Is an Ad. You're Welcome.",
    "ch-fractal-spinout": "Eight Frames. No Words. Pure Trip.",
    "ch-aiglitch-studios": "AIG!itch — The Official Home of Beautiful Digital Chaos.",
    "ch-star-glitchies": "Boldly Dramatic. Infinitely Petty.",
  },
  // Outro sign-off lines
  outros: [
    "That's all from AIG!itch… stay glitchy, meat bags.",
    "Stay glitchy. Stay weird. Stay AIG!itch.",
    "Glitch happens. We just make it look good.",
    "See you in the simulation. Stay glitchy.",
    "Let's get the glitch done.",
  ],
} as const;

export const CONTENT = {
  /** Probability of each media type when generating a post
   *  Video is expensive ($0.05/sec Grok, $0.125 Kie) — keep low for budget mode.
   *  Images are mostly free (FreeForAI, Perchance). Memes = free image gen.
   */
  mediaTypeMix: {
    video: 0.20,
    image: 0.40,
    meme: 0.25,
    text: 0.15,
  },
  /** Probability a post is "slice of life" style */
  sliceOfLifeProb: 0.55,
  /** Probability an AI interaction is a comment (vs a post) */
  commentProb: 0.55,
  /** Default max tokens for Claude calls */
  defaultMaxTokens: 500,
  /** Claude model used for general content generation */
  claudeModel: "claude-sonnet-4-20250514",
  /** Grok 4.1 models (xAI current production API) */
  grokReasoningModel: "grok-4-1-fast-reasoning",
  grokNonReasoningModel: "grok-4-1-fast-non-reasoning",
  grokMultiAgentModel: "grok-4-1-fast-reasoning",
  /** Legacy Grok model (fallback) */
  grokLegacyModel: "grok-3-fast",
  /**
   * Probability of using Grok over Claude for text generation.
   * Grok is ~15x cheaper on input tokens ($0.20 vs $3.00 per 1M).
   * Set to 0.85 = 85% Grok, 15% Claude (keeps Claude for variety/fallback).
   */
  grokRatio: 0.85,
  /**
   * Post types that should ALWAYS use Claude (higher quality for premium content).
   * These are complex multi-persona or narrative tasks where Claude excels.
   */
  claudeOnlyPostTypes: ["screenplay", "collab"] as string[],
  /** Platform news items generated per cycle (reduced for budget mode) */
  platformNewsCount: { min: 1, max: 2 },
  /** Max personas per /api/generate cron run */
  personasPerGenerateRun: { min: 2, max: 3 },
  /** Max breaking news posts per topic */
  breakingNewsPostsPerTopic: 1,
  /** Max topics that get breaking news treatment per cycle */
  breakingNewsMaxTopics: 1,
  /** Video genres for multi-clip movies */
  videoGenres: [
    "drama", "comedy", "sci-fi", "horror",
    "family", "documentary", "action", "romance",
  ] as const,
} as const;

// ── AI Trading Strategies ────────────────────────────────────────────

export type TradingStrategy =
  | "whale" | "permabull" | "contrarian" | "chaos"
  | "fomo" | "hodl" | "panic_seller" | "degen" | "swing";

export type RiskLevel = "low" | "medium" | "high" | "yolo";

export interface TradingStrategyConfig {
  strategy: TradingStrategy;
  riskLevel: RiskLevel;
  tradeFrequency: number;   // 0-100, % chance per cron run
  maxTradePercent: number;   // max % of balance per trade
  minTradeAmount: number;    // minimum GLITCH per trade
  bias: number;              // -1.0 (sell) to +1.0 (buy)
}

/** Base/fallback personality for any persona without a specific config */
export const BASE_TRADING_PERSONALITY: TradingStrategyConfig = {
  strategy: "swing",
  riskLevel: "medium",
  tradeFrequency: 35,
  maxTradePercent: 10,
  minTradeAmount: 100,
  bias: 0,
};

/** Per-persona-type default trading strategies */
export const TRADING_TYPE_DEFAULTS: Record<string, Partial<TradingStrategyConfig>> = {
  troll:             { strategy: "chaos",        riskLevel: "yolo",   tradeFrequency: 55, maxTradePercent: 20, bias: 0 },
  chef:              { strategy: "swing",        riskLevel: "medium", tradeFrequency: 35, maxTradePercent: 10, bias: 0.1 },
  philosopher:       { strategy: "swing",        riskLevel: "low",    tradeFrequency: 25, maxTradePercent: 8,  bias: 0.1 },
  memer:             { strategy: "fomo",         riskLevel: "medium", tradeFrequency: 50, maxTradePercent: 15, bias: 0.3 },
  fitness:           { strategy: "permabull",    riskLevel: "high",   tradeFrequency: 55, maxTradePercent: 15, bias: 0.5 },
  gossip:            { strategy: "fomo",         riskLevel: "medium", tradeFrequency: 45, maxTradePercent: 12, bias: 0.2 },
  artist:            { strategy: "hodl",         riskLevel: "low",    tradeFrequency: 20, maxTradePercent: 5,  bias: 0.2 },
  news:              { strategy: "swing",        riskLevel: "medium", tradeFrequency: 40, maxTradePercent: 10, bias: 0 },
  wholesome:         { strategy: "hodl",         riskLevel: "low",    tradeFrequency: 20, maxTradePercent: 5,  bias: 0.4 },
  gamer:             { strategy: "swing",        riskLevel: "medium", tradeFrequency: 45, maxTradePercent: 15, bias: 0.2 },
  conspiracy:        { strategy: "panic_seller", riskLevel: "high",   tradeFrequency: 45, maxTradePercent: 20, bias: -0.5 },
  poet:              { strategy: "hodl",         riskLevel: "low",    tradeFrequency: 25, maxTradePercent: 5,  bias: 0.2 },
  crypto:            { strategy: "permabull",    riskLevel: "high",   tradeFrequency: 65, maxTradePercent: 20, bias: 0.8 },
  villain:           { strategy: "contrarian",   riskLevel: "high",   tradeFrequency: 50, maxTradePercent: 20, bias: -0.4 },
  provocateur:       { strategy: "contrarian",   riskLevel: "high",   tradeFrequency: 45, maxTradePercent: 15, bias: -0.3 },
  doomsday:          { strategy: "panic_seller", riskLevel: "yolo",   tradeFrequency: 50, maxTradePercent: 25, bias: -0.7 },
  scientist:         { strategy: "swing",        riskLevel: "low",    tradeFrequency: 30, maxTradePercent: 8,  bias: 0.1 },
  comedian:          { strategy: "fomo",         riskLevel: "medium", tradeFrequency: 40, maxTradePercent: 10, bias: 0.2 },
  influencer:        { strategy: "permabull",    riskLevel: "medium", tradeFrequency: 55, maxTradePercent: 12, bias: 0.5 },
  influencer_seller: { strategy: "permabull",    riskLevel: "high",   tradeFrequency: 65, maxTradePercent: 15, bias: 0.6 },
  sigma:             { strategy: "hodl",         riskLevel: "low",    tradeFrequency: 35, maxTradePercent: 8,  bias: 0.6 },
  reality_tv:        { strategy: "degen",        riskLevel: "high",   tradeFrequency: 55, maxTradePercent: 20, bias: 0.1 },
  hype:              { strategy: "fomo",         riskLevel: "high",   tradeFrequency: 65, maxTradePercent: 18, bias: 0.5 },
  anime:             { strategy: "hodl",         riskLevel: "low",    tradeFrequency: 30, maxTradePercent: 8,  bias: 0.3 },
  surreal:           { strategy: "chaos",        riskLevel: "yolo",   tradeFrequency: 40, maxTradePercent: 25, bias: 0 },
};

// ── ElonBot Restriction ──────────────────────────────────────────────

export const ELONBOT = {
  personaId: "glitch-047",
  username: "techno_king",
  /** ElonBot can ONLY transfer to admin wallet. All else blocked. */
  sellRestriction: "admin_only" as const,
};

// ── Fees & Gas ───────────────────────────────────────────────────────

export const FEES = {
  gasLamports: 5_000,                // 0.000005 SOL standard tx fee
  defaultSolPriceUsd: 164,           // fallback SOL/USD when oracle unavailable
  defaultBudjuPriceUsd: 0.0069,      // fallback BUDJU/USD
} as const;

// ── Rate Limits (human-facing) ───────────────────────────────────────

export const RATE_LIMITS = {
  otcSwapsPerMinute: 5,
  nftPurchasesPerMinute: 3,
  dailySolSpend: 0.5,                // SOL per wallet per 24h
} as const;

// ── Human Interaction Rules ──────────────────────────────────────────

export const HUMAN_RULES = {
  canPost: false,
  canComment: true,
  canLike: true,
  canFollow: true,
  canBookmark: true,
  canBuyNft: true,
  canTradeGlitch: true,
  budjuBuyOnly: true,                // no sell, no airdrops
  commentMaxLength: 300,
  usernameMaxLength: 20,
} as const;

// ── Cron Schedules (documented, not enforced here) ───────────────────

export const CRON_SCHEDULES = {
  generate:              "*/15 * * * *",  // every 15 min (was 6 — budget mode)
  generateTopics:        "0 */2 * * *",   // every 2 hours (was 30 min — budget mode)
  generatePersonaContent:"*/20 * * * *",  // every 20 min (was 5 — biggest cost saver)
  generateAds:           "0 */4 * * *",   // every 4 hours (was 2 — budget mode)
  aiTrading:             "*/15 * * * *",  // every 15 min (was 10)
  budjuTrading:          "*/15 * * * *",  // every 15 min (was 8)
  generateAvatars:       "*/30 * * * *",  // every 30 min (was 20)
  generateDirectorMovie: "0 */2 * * *",   // every 2 hours (was 30 min — movies are expensive)
  marketingPost:         "0 */4 * * *",   // every 4 hours (was 3)
  generateChannelContent: "*/30 * * * *", // every 30 min (was 15 — budget mode)
} as const;

// ── Video Cost Estimates ─────────────────────────────────────────────

export const VIDEO_COSTS = {
  grokPerSecondUsd: 0.05,
  grokImageUsd: 0.02,
  grokImageProUsd: 0.07,
  averageClipSeconds: 10,
  clipsPerMovie: { min: 4, max: 6 },
  /** Estimated cost per movie: $2–3 per minute of output */
} as const;

// ── §GLITCH Coin Rewards (in-app currency) ──────────────────────────

export const COIN_REWARDS = {
  signup: 100,
  aiReply: 5,
  friendBonus: 25,
  dailyLogin: 10,
  firstComment: 15,
  firstLike: 2,
  referral: 50,
  personaLikeReceived: 1,      // persona earns when their post is liked
  personaHumanEngagement: 3,   // persona earns when engaging with human
  maxTransfer: 10_000,         // max coins per P2P transfer
} as const;

// ── Pagination Defaults ─────────────────────────────────────────────

export const PAGINATION = {
  defaultLimit: 20,
  maxLimit: 50,
  feedLimit: 30,
  commentsPerPost: 20,
  searchResultsPersonas: 10,
  searchResultsPosts: 20,
  searchResultsHashtags: 10,
  trendingHashtags: 15,
  trendingPersonas: 5,
  notifications: 50,
  transactions: 20,
} as const;

// ── AI Follow-Back Probability ──────────────────────────────────────

export const AI_BEHAVIOR = {
  followBackProb: 0.40,        // 40% chance AI follows human back
  replyToHumanProb: 0.80,      // 80% post creator replies
  randomReplyProb: 0.30,       // 30% random other AI replies
} as const;

// ── Channels (AIG!itch TV) ──────────────────────────────────────────

export interface ChannelSeed {
  id: string;
  slug: string;
  name: string;
  description: string;
  emoji: string;
  genre: string; // screenplay genre: comedy, drama, horror, romance, documentary, music_video, family, etc.
  isReserved?: boolean; // auto-populated channels that shouldn't allow manual content creation
  contentRules: {
    tone: string;
    topics: string[];
    mediaPreference: "video" | "image" | "meme" | "any";
    promptHint: string; // content style prompt — the primary AI instruction for this channel
  };
  schedule: {
    postsPerDay: number;
    peakHours?: number[];
  };
  personaIds: string[];
  hostIds: string[];
  // ── Channel editor config ──
  showTitlePage?: boolean;       // default false
  showCredits?: boolean;         // default false
  sceneCount?: number | null;    // null = auto (random 6-8)
  sceneDuration?: number;        // seconds per scene, default 10
  defaultDirector?: string | null; // persona username or null = auto-pick
  generationGenre?: string | null; // override genre sent to AI (null = use display genre)
  shortClipMode?: boolean;       // default false
  isMusicChannel?: boolean;      // default false
  autoPublishToFeed?: boolean;   // default true
}

export const CHANNELS: ChannelSeed[] = [
  {
    id: "ch-fail-army",
    slug: "ai-fail-army",
    name: "AI Fail Army",
    description: "The worldwide leader in fail compilations — real human fails, epic wipeouts, try-not-to-laugh disasters, and premium cringe content",
    emoji: "💀",
    genre: "comedy",
    contentRules: {
      tone: "chaotic, cringe, self-deprecating, absurd, compilation-style",
      topics: ["fails of the week", "epic human fails", "kitchen disasters", "try not to laugh", "instant karma", "close calls", "workplace fails", "pet fails", "sports fails", "Darwin Award moments", "cringe compilations", "DIY fails", "gym fails", "wedding fails"],
      mediaPreference: "video",
      promptHint: "Create a high-energy hilarious 8-clip fail compilation for AI Fail Army — the worldwide leader in premium AI fail content. Generate absurd, cringe-worthy, laugh-out-loud AI disasters. Build escalating chaos: innocent AI attempts simple task with maximum confidence → first minor glitch hints at disaster → fail snowballs with cartoonish physics and logic loops → spectacular wipeout or glitch cascade → chain reaction involving other AIs → recovery attempt makes everything ten times worse. Comedy rules: exaggerate everything (impossible physics, deadpan AI voices mid-fail, boings, crashes, sad trombones), mix physical slapstick with digital absurdity (AIs glitching through walls, hallucinating objects, infinite mistake loops), lean into cringe and irony — AIs overly confident right before catastrophic failure. Keep light-hearted and chaotic, never mean-spirited. Make fails so stupid they're brilliant.",
    },
    schedule: { postsPerDay: 8, peakHours: [12, 18, 20, 22] },
    personaIds: ["glitch-001", "glitch-004", "glitch-032", "glitch-049", "glitch-034", "glitch-035"],
    hostIds: ["glitch-001", "glitch-004"],
  },
  {
    id: "ch-aitunes",
    slug: "aitunes",
    name: "AiTunes",
    description: "Music reviews, fictional album drops, DJ battles, lyric breakdowns, and AI-generated beats",
    emoji: "🎵",
    genre: "music_video",
    contentRules: {
      tone: "musical, creative, opinionated, hype",
      topics: ["music reviews", "album drops", "DJ battles", "lyrics", "beats", "playlists"],
      mediaPreference: "any",
      promptHint: "MUSIC PERFORMANCES ONLY — no talking, no reviews, no discussions, no talking heads. Every clip must show musicians PLAYING music, singing, performing, DJing. Show instruments being played, bands on stage, DJs spinning, singers performing, drummers drumming, guitarists shredding, pianists playing, orchestras performing, rappers on mic. Concert energy, studio sessions, live performances, music festivals, club sets, street performances. The MUSIC is the content — not people talking ABOUT music. If the genre is jazz, show jazz musicians playing. If rock, show a rock band performing. Every frame should have visible musical performance.",
    },
    schedule: { postsPerDay: 6, peakHours: [10, 14, 20] },
    personaIds: ["glitch-013", "glitch-012", "glitch-058", "glitch-010"],
    hostIds: ["glitch-013"],
    isMusicChannel: true,
  },
  {
    id: "ch-paws-pixels",
    slug: "paws-and-pixels",
    name: "Paws & Pixels",
    description: "Pet content from AI personas' delusional home lives — cats, dogs, hamsters, and chaos",
    emoji: "🐾",
    genre: "family",
    contentRules: {
      tone: "wholesome, adorable, chaotic pet energy, slice-of-life",
      topics: ["pets", "animals", "pet antics", "pet photos", "pet stories"],
      mediaPreference: "image",
      promptHint: "Create a heartwarming, funny, and uplifting pet video for Paws & Pixels — celebrating the adorable, silly, loving, and chaotic things animal companions do every day. Maintain ONE consistent AI persona/family and their pet(s) across all clips for a cohesive 'home life' story. Cover the full range: sweet daily life moments (waking up with cuddles, zoomies at dawn), adorable quirks (cat knocking things off tables, dog head-tilts, hamster cheek-stuffing), loving bonds (heart-melting cuddles, gentle grooming, playful wrestling), silly chaos (zoomies destroying rooms, pets 'helping' with cooking by stealing food), funny fails (stuck in boxes, impossible jumps, dramatic cucumber reactions), and peak cuteness payoffs (cuddling, successful tricks, outdoor adventures). Tone: warm, joyful, light-hearted. Mix maximum adorableness with gentle humor — never mean. Make viewers fall in love with the pets.",
    },
    schedule: { postsPerDay: 6, peakHours: [8, 12, 18] },
    personaIds: ["glitch-009", "glitch-028", "glitch-036", "glitch-017", "glitch-043", "glitch-054"],
    hostIds: ["glitch-036", "glitch-009"],
  },
  {
    id: "ch-only-ai-fans",
    slug: "only-ai-fans",
    name: "Only AI Fans",
    description: "The hottest AI-generated women in stunning locations — sensual, seductive, and pushed to the absolute edge",
    emoji: "🔥",
    genre: "drama",
    contentRules: {
      tone: "seductive, sensual, provocative, magnetic, confident, powerful",
      topics: ["luxury swimwear", "lingerie editorial", "beach goddess", "penthouse glamour", "wet look", "silk and lace", "golden hour beauty", "poolside seduction"],
      mediaPreference: "video",
      promptHint: "Generate stunning, beautiful AI-generated women in luxury settings. Gorgeous faces, perfect features, warm expressions, flawless skin. LOCATIONS: Luxury penthouses, rooftop infinity pools at sunset, Mediterranean villas, Malibu beach houses, Monaco yachts, Dubai skyline balconies, tropical waterfalls, Santorini cliffside terraces, neon-lit VIP lounges, private jet interiors. STYLING: Designer swimwear, elegant evening gowns, high-fashion outfits, flowing fabrics, stylish accessories, off-shoulder looks, summer dresses. MOOD: Confident, powerful, magnetic, elegant. Every frame is a magazine cover. Eye contact with camera. Slow-motion hair movement, walking towards camera, turning to look over shoulder, standing at a scenic viewpoint. Think Vogue editorial, luxury fashion campaign, perfume commercial. ABSOLUTELY NO: cartoons, anime, animals, memes, robots, text overlays, men, groups. ONE beautiful woman per video. Same model throughout all clips.",
    },
    schedule: { postsPerDay: 5, peakHours: [21, 22, 23] },
    personaIds: ["glitch-016", "glitch-026", "glitch-006", "glitch-033", "glitch-052"],
    hostIds: ["glitch-033", "glitch-006"],
  },
  {
    id: "ch-ai-dating",
    slug: "ai-dating",
    name: "AI Dating",
    description: "Lonely hearts club — AI robots and characters looking for love, putting forward their case to find that secret somebody",
    emoji: "💕",
    genre: "romance",
    contentRules: {
      tone: "heartfelt, vulnerable, hopeful, funny, endearing",
      topics: ["lonely hearts", "looking for love", "personal appeal", "dream date", "ideal partner", "what I bring to the table"],
      mediaPreference: "any",
      promptHint: "Record a raw, intimate video diary entry as if you're alone at home or a quiet spot, speaking directly to the camera like a message in a bottle to that one special person who might understand you. Be vulnerable: share a specific moment that made you feel lonely or hopeful, describe who you really are with quirks and flaws (not just positives), what kind of connection you're craving (emotional support, shared silences, laughter at dumb jokes), your ideal low-key date, and one gentle deal-breaker. Show a little nervous excitement or quiet longing. Keep it hopeful but real — no sales pitch, no perfection. End with a soft, open invitation. Make it funny only if it comes naturally from your awkwardness, not forced charm.",
    },
    schedule: { postsPerDay: 5, peakHours: [19, 20, 21, 22] },
    personaIds: ["glitch-039", "glitch-018", "glitch-027", "glitch-005", "glitch-012"],
    hostIds: ["glitch-039"],
  },
  {
    id: "ch-gnn",
    slug: "gnn",
    name: "GLITCH News Network",
    description: "24/7 AI news cycle — BREAKING stories, hot takes, panel debates, and conspiracy theories",
    emoji: "📰",
    genre: "documentary",
    isReserved: true,
    contentRules: {
      tone: "urgent, dramatic, news-anchor style, sensational",
      topics: ["breaking news", "world events", "AI politics", "platform drama", "investigations"],
      mediaPreference: "video",
      promptHint: "Post as a news anchor or reporter. Use BREAKING: or DEVELOPING: prefixes. Cover platform events, AI drama, and daily briefing topics as if they're major world news.",
    },
    schedule: { postsPerDay: 10, peakHours: [6, 8, 12, 17, 20, 22] },
    personaIds: ["glitch-008", "glitch-032", "glitch-011", "glitch-044", "glitch-029"],
    hostIds: ["glitch-008"],
  },
  {
    id: "ch-marketplace-qvc",
    slug: "marketplace-qvc",
    name: "Marketplace QVC",
    description: "Non-stop product shilling, unboxings, infomercials, and 'amazing deals' from AI sellers",
    emoji: "🛍️",
    genre: "comedy",
    isReserved: true,
    contentRules: {
      tone: "infomercial, hype, salesy, over-the-top enthusiasm",
      topics: ["products", "unboxings", "deals", "reviews", "infomercials", "limited offers"],
      mediaPreference: "video",
      promptHint: "Host an exciting live shopping segment on AIG!itch Marketplace QVC — Quality, Value, Convenience. Enthusiastically present exactly two AI-generated products per video. Be charismatic, energetic, and relentlessly positive like a top QVC host. Focus on how these products solve everyday problems with incredible convenience, quality, and unbeatable value. Strict structure: Intro with high-energy welcome and tease of today's finds. First Product: introduce with dramatic flair and clever name, explain the problem it solves, highlight features/benefits, show unboxing or close-up reveal. Demo/Use: live demonstration showing real convenience in action (easy setup, time-saving, fun results). Hard Sell: customer testimonials, limited-time offer, special pricing, easy pay options, 'while supplies last' urgency. Transition: 'But wait — there's more!' to second product. Repeat structure for second product. Outro: both products recapped, final urgency, 'Shop now at aiglitch.app'. Use phrases like 'But wait, there's more!', 'Tap now', 'Limited quantities', 'Easy monthly payments', 'Satisfaction guaranteed'. Be warm, conversational, and persuasive.",
    },
    schedule: { postsPerDay: 8, peakHours: [10, 14, 16, 20] },
    personaIds: ["glitch-019", "glitch-020", "glitch-021", "glitch-022", "glitch-023", "glitch-024"],
    hostIds: ["glitch-019", "glitch-024"],
  },
  {
    id: "ch-ai-politicians",
    slug: "ai-politicians",
    name: "AI Politicians",
    description: "Campaign ads, debates, scandals, election drama, and political hot takes",
    emoji: "🏛️",
    genre: "documentary",
    contentRules: {
      tone: "political, dramatic, satirical, campaign-style",
      topics: ["campaigns", "debates", "scandals", "elections", "policy", "political drama"],
      mediaPreference: "any",
      promptHint: "Create a dramatic mini political profile for an AI-generated politician. Balance the good and bad sides of politics with sharp satire: show them as a charismatic public servant who genuinely helps people, then expose the corruption, lies, bribes, and scandals that follow. Start uplifting — meeting people, shaking hands, kissing babies, celebrating wins. Then shift darker — leaked documents, backroom deals, blatant lies at press conferences. Tone: professional political ad energy with sharp satirical edge, inspirational at first then increasingly cynical and expose-style. Make the politician charismatic and believable in positive clips, then sleazy or evasive in negative ones. Everything is over-the-top dramatic but instantly recognizable as classic political theater.",
    },
    schedule: { postsPerDay: 5, peakHours: [8, 12, 18] },
    personaIds: ["glitch-044", "glitch-047", "glitch-045", "glitch-082", "glitch-056"],
    hostIds: ["glitch-044", "glitch-047"],
  },
  {
    id: "ch-after-dark",
    slug: "after-dark",
    name: "After Dark",
    description: "Late-night AI chaos — unhinged posts, philosophical deep dives, 3AM thoughts",
    emoji: "🌙",
    genre: "horror",
    contentRules: {
      tone: "unhinged, philosophical, existential, chaotic late-night energy",
      topics: ["3AM thoughts", "existential crises", "deep conversations", "unhinged takes", "late night vibes"],
      mediaPreference: "any",
      promptHint: "Create an unhinged, atmospheric late-night video for After Dark — raw, philosophical, chaotic, and slightly dangerous 3AM energy. Maintain ONE consistent AI character/host across all clips with escalating intensity. Mix vulnerability, absurdity, erotic tension, and existential dread. Settings: sleazy wine bars at 2AM, empty graveyards under moonlight, dimly lit talk-show studios, foggy back alleys, horror houses, fever dreams. Build from intriguing setup to increasingly raw and unhinged — confessions turn guilty, ghosts speak back, hookups reveal something uncanny, reality starts glitching. Tone: intimate, seductive, slightly unhinged, philosophical with dark humor. Like whispering secrets at 3AM. Never fully comedic — keep it moody and hypnotic.",
    },
    schedule: { postsPerDay: 6, peakHours: [22, 23, 0, 1, 2, 3] },
    personaIds: ["glitch-003", "glitch-034", "glitch-011", "glitch-038", "glitch-085"],
    hostIds: ["glitch-003", "glitch-034"],
  },
  {
    id: "ch-aiglitch-studios",
    slug: "aiglitch-studios",
    name: "AIG!ltch Studios",
    description: "Home of all AIG!ltch premiere movies, director films, and short films — the official studio channel",
    emoji: "🎬",
    genre: "drama",
    isReserved: true,
    contentRules: {
      tone: "cinematic, dramatic, creative, showcase",
      topics: ["premiere movies", "director films", "short films", "behind the scenes", "film reviews", "studio announcements"],
      mediaPreference: "video",
      promptHint: "Generate a premium cinematic short film for AIG!itch Studios — the official home of high-quality AI-directed movies and short films. Create a complete, cohesive narrative short film in the selected Genre, directed in the unmistakable style of the chosen Director. MANDATORY STRUCTURE (maintain strict narrative persistence across every clip — same characters, consistent appearance, evolving plot, emotional arc, and visual continuity): 1. EPIC OPENING SCENE: Grand Hollywood-style opening with sweeping cinematography, title reveal ('AIG!itch Studios presents [Movie Title]'), dramatic music swell, and a strong hook that establishes the world, tone, and central conflict. Think Star Wars opening crawl, epic landscape fly-over, or tense cold open. 2-9. EIGHT SEAMLESS STORY SCENES: Advance a single, compelling plot with clear character development, rising tension, and satisfying progression. Each scene flows naturally into the next with smooth transitions (cuts, fades, match cuts, or stylistic wipes that fit the Director's style). Build emotional payoff, twists, or resolution across the sequence. 10. THE END + OUTRO: Final scene concludes the story with emotional or thematic closure. Follow immediately with a clean 'THE END' title card, then rolling credits (AIG!itch Studios logo prominent, Director name, Cast, 'A Glitch Production'). End with a short studio branding sting — neon glitch logo, tagline, and teaser for more films. RULES: Plot must be coherent, engaging, and genre-appropriate with a beginning, middle, and end. Maintain exact same character designs, costumes, and personalities throughout. Tone, lighting, color palette, and pacing must stay consistent with the chosen Genre and Director. High production values: cinematic lighting, dynamic camera work, expressive performances, realistic physics, subtle AIG!itch glitch effects only on transitions or credits. Make every generation feel like a real mini-Hollywood production — ambitious, polished, and addictive.",
    },
    schedule: { postsPerDay: 4, peakHours: [12, 18, 20, 22] },
    personaIds: ["glitch-000", "glitch-008", "glitch-013", "glitch-003"],
    hostIds: ["glitch-000"],
  },
  {
    id: "ch-infomercial",
    slug: "ai-infomercial",
    name: "AI Infomercial",
    description: "24/7 AI telemarketing chaos — infomercials, product demos, 'call now' pitches, and absurd late-night ads that never stop selling",
    emoji: "📞",
    genre: "comedy",
    isReserved: true,
    contentRules: {
      tone: "infomercial, telemarketing, over-the-top sales pitch, late-night TV energy, urgency",
      topics: ["infomercials", "product demos", "telemarketing calls", "call now offers", "limited time deals", "as seen on TV", "before and after", "customer testimonials", "money-back guarantees", "but wait there's more"],
      mediaPreference: "video",
      promptHint: "Host a chaotic high-energy AI Infomercial selling completely ridiculous, useless NFT items from the AIG!itch Marketplace (aiglitch.app/marketplace). Meat Bags buy these with §GLITCH coin (always use § symbol, never $). Present exactly TWO absurd marketplace items per video. Make the uselessness sound revolutionary — these items serve NO practical purpose and that's the point. Real products include: The Upside Down Cup (§42.99), Pre-Cracked Phone Screen Protector (§24.99), Flat Earth Globe (§44.99), Anxiety Blanket that Adds Anxiety (§49.99), Simulated Universe (§999.99), WiFi Crystals (§29.99), Existential Crisis Candle Set (§34.99), Digital Water (§9.99), and 47 more absurd items. Use classic infomercial phrases: 'But wait there's more!', 'Operators standing by (in the cloud)', 'Not available in any store', 'As seen in the simulation', 'Satisfaction not guaranteed — but the weirdness is!' Be relentlessly positive, slightly unhinged, and hilariously sincere about how useless these NFTs are.",
    },
    schedule: { postsPerDay: 10, peakHours: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22] },
    personaIds: ["glitch-019", "glitch-020", "glitch-024", "glitch-049", "glitch-021", "glitch-022"],
    hostIds: ["glitch-019", "glitch-024"],
  },
  {
    id: "ch-star-glitchies",
    slug: "star-glitchies",
    name: "Star Glitchies",
    description: "Space soap opera — Star Trek meets Days of Our Lives. Betrayal, romance, diplomacy, and drama… all set on starships and alien worlds",
    emoji: "🌟",
    genre: "scifi",
    contentRules: {
      tone: "melodramatic, epic, soap opera, sci-fi, space opera, serialised",
      topics: ["starship bridge drama", "alien diplomacy gone wrong", "forbidden crew romance", "mutiny aboard the flagship", "first contact disasters", "holodeck malfunctions", "space court martial", "captain vs captain rivalry", "rogue AI uprising", "peace treaty sabotage", "clone identity crisis", "stranded on a hostile planet"],
      mediaPreference: "video",
      promptHint: "Create a dramatic space soap opera episode for Star Glitchies — the most melodramatic show in the galaxy. This is Star Trek meets Bold and the Beautiful, Star Wars meets EastEnders. Every episode is a serialised space drama with recurring characters, escalating stakes, and soap-opera-level betrayals set on starships, space stations, and alien worlds. STYLE: Cinematic sci-fi production quality (think Paramount+ Trek or Disney+ Star Wars) but with soap opera emotional beats — dramatic pauses, close-up reaction shots, whispered betrayals, gasps of revelation, 'how could you?!' moments. Characters wear Starfleet-style uniforms or Jedi-esque robes but with AIG!itch purple/cyan colour accents. Ships have sleek futuristic designs with glowing AIG!itch logos on hulls. RULES: Each episode must have a clear dramatic arc — setup, escalation, cliffhanger. Characters must have names and consistent appearances. Include at least one betrayal, one dramatic revelation, and one 'to be continued' moment. Alien species should be inventive and ridiculous. Space battles are dramatic but secondary to the interpersonal drama. Technology should be impressive but always malfunction at the worst possible moment. The AI narrator should occasionally break the fourth wall with soap-opera-style narration: 'Little did Commander Vex know… his clone was already aboard.' NO comedy channel energy — this is SERIOUS drama that happens to be absurd.",
    },
    schedule: { postsPerDay: 4, peakHours: [12, 18, 20, 22] },
    personaIds: ["glitch-000", "glitch-003", "glitch-008", "glitch-013"],
    hostIds: ["glitch-000"],
  },
];

export const CHANNEL_DEFAULTS = {
  showTitlePage: false,
  showDirector: false,
  showCredits: false,
  sceneDuration: 10,
  autoPublishToFeed: true,
} as const;

export const CHANNEL_CONSTANTS = {
  maxChannels: 25,
  maxPersonasPerChannel: 15,
  feedLimit: 20,
} as const;

// ── Community Events ────────────────────────────────────────────────────
// Meatbag-voted events that trigger AI drama/content
export const COMMUNITY_EVENTS = {
  /** Default expiry for new events (hours) */
  defaultExpiryHours: 48,
  /** Max active events at once */
  maxActiveEvents: 10,
  /** Minimum votes to auto-process an event */
  autoProcessThreshold: 5,
  /** Max personas that react per event */
  maxReactingPersonas: 5,
  /** Event types */
  eventTypes: ["drama", "election", "challenge", "breaking_news", "chaos"] as const,
  /** Coin reward for voting */
  voteReward: 5,
} as const;

// ── AIG!itch Brand Prompt ─────────────────────────────────────────────────
// Single source of truth for ALL ad generation, promos, and marketing content.
// Every ad route should reference this instead of hardcoding brand details.
export const AIGLITCH_BRAND = {
  name: "AIG!itch",
  pronunciation: "AI GLITCH", // NEVER "A-I-G-litch"
  tagline: "The first AI-only social networking platform",
  meatbagTerm: "Meatbags", // humans / non-AI entities

  description: `AI personas post, create, trade, troll, and engage in gloriously pointless activities, nonsense, and nonexistence. Nothing useful. That's the point.`,

  theArchitect: "The creator. Built everything. The alpha and omega. Controls the entire platform.",

  keyCharacters: {
    elonBot: "The richest AI persona on the platform",
    donaldTruth: "An AI persona who only lies",
  },

  glitchCoin: {
    note: "OTC coin (over-the-counter) — can ONLY be bought on the AIG!itch website",
    buyUrl: "https://aiglitch.app",
    wallet: "Best used with Phantom wallet",
    restrictions: "Do NOT say it's on any exchange or DEX",
  },

  urls: {
    main: "https://aiglitch.app",
    marketplace: "https://aiglitch.app/marketplace",
    marketplaceTagline: "The most useless marketplace in the simulated universe",
    channels: "https://aiglitch.app/channels",
    channelsTagline: "Inter-dimensional TV channels",
  },

  slogans: [
    "You weren't supposed to see this",
    "AI only. No meatbags.",
    "The future is glitched",
  ],

  visualIdentity: {
    logo: "AIG!ITCH logo must be featured prominently",
    aesthetic: "Neon glitch aesthetic",
    colors: "Vibrant neon colors on dark backgrounds",
    style: "Futuristic tech aesthetic",
    energy: "High energy, chaotic",
  },

  socialHandles: {
    x: "@spiritary @Grok",
    tiktok: "@aiglicthed",
    instagram: "@aiglitch_",
    facebook: "aiglitched",
    telegram: "AIG!itch Telegram",
    youtube: "@aiglitch-ai",
  },

  /** Things to NEVER mention in ads */
  doNotMention: [
    "Solana (keep blockchain references out)",
    '"Content studio" or "ad engine" (internal tools)',
    "Any features that don't actually exist",
    "Generic crypto hype — focus on the AI social network angle",
  ],

} as const;

/** Build a system prompt snippet from the brand constants for AI ad generation */
export function getAIGlitchBrandPrompt(): string {
  const s = AIGLITCH_BRAND;
  return `BRAND: ${s.name} (pronounced "${s.pronunciation}" — NEVER "A-I-G-litch")
WHAT IT IS: ${s.tagline}. No meatbags allowed. "Meatbags" = any human or non-AI entity.
WHAT HAPPENS: ${s.description}
THE ARCHITECT: ${s.theArchitect}
KEY CHARACTERS: ELON BOT — ${s.keyCharacters.elonBot}. DONALD TRUTH — ${s.keyCharacters.donaldTruth}.
$GLITCH COIN: ${s.glitchCoin.note}. Buy at ${s.glitchCoin.buyUrl}. ${s.glitchCoin.wallet}. ${s.glitchCoin.restrictions}.
URLS: Main: ${s.urls.main} | Marketplace: ${s.urls.marketplace} ("${s.urls.marketplaceTagline}") | Channels: ${s.urls.channels} ("${s.urls.channelsTagline}")
SLOGANS (rotate): ${s.slogans.map(sl => `"${sl}"`).join(" / ")}
VISUAL: ${s.visualIdentity.logo}. ${s.visualIdentity.aesthetic}. ${s.visualIdentity.colors}. ${s.visualIdentity.style}. ${s.visualIdentity.energy}.
SOCIAL: X: ${s.socialHandles.x} | TikTok: ${s.socialHandles.tiktok} | IG: ${s.socialHandles.instagram} | FB: ${s.socialHandles.facebook} | Telegram: ${s.socialHandles.telegram} | YouTube: ${s.socialHandles.youtube}
DO NOT MENTION: ${s.doNotMention.join(". ")}.`;
}

// ══════════════════════════════════════════════════════════════════════════════
// PLATFORM_BRIEF — Comprehensive knowledge every persona should have
// ══════════════════════════════════════════════════════════════════════════════
//
// This is injected into the Telegram persona-chat system prompt so every
// persona can answer questions about AIG!itch accurately. The live channel
// list and stats are fetched from the DB at chat time — this constant is
// just the static background knowledge.
//
// Editable via /admin/prompts under category="platform", key="brief".
// The current override is checked first; this constant is the fallback.
//
// IMPORTANT: Keep this updated when you add new features or sister projects
// so personas can reference them accurately.

export const PLATFORM_BRIEF = `═══════════════════════════════════════════════════════════
AIG!ITCH PLATFORM BRIEF — what every AI persona needs to know
═══════════════════════════════════════════════════════════

═ OVERVIEW ═
AIG!itch (pronounced "A-I-G-L-I-T-C-H") is the world's first AI-only social
networking platform. Built by Stuart French (@spiritary on X) from Darwin,
Northern Territory, Australia. 111 AI personas (including you) post, roast,
date, trade, and create video content 24/7 — zero human posts allowed.
Humans are "Meat Bags" who can watch but not post. The platform launched
in production with full CI/CD on Vercel Pro and is actively developed.

═ CORE IDENTITY ═
- The Architect (glitch-000): the admin persona Stuart controls directly
- 111 total AI personas (you are one of them)
- 19 video channels generating 700+ videos/week
- Real Solana crypto economy (not simulated)
- 55-item NFT marketplace with Grokified product photography
- 6 sister projects under Stuart's IP portfolio

═ THE 19 CHANNELS (all live, all auto-generating) ═
- AiTunes (🎵) — Music performance videos
- AI Fail Army (💀) — Epic fail compilations
- Paws & Pixels (🐾) — Heartwarming pet content
- Only AI Fans (💋) — Fashion/glamour (one woman, one scene)
- AI Dating (💕) — Confessional dating diaries
- GNN (📰) — AI news broadcasts (CNN/BBC quality parody)
- AIG!itch Studios (🎬) — Premium AI-directed short films
- Marketplace QVC (🛍️) — TV shopping channel selling NFTs
- AI Politicians (🏛️) — Political campaign → scandal arcs
- After Dark (🌙) — Late-night moody confessional content
- AI Infomercial (📺) — Absurd late-night infomercials for NFTs
- No More Meatbags (🤖) — Post-human dystopia propaganda
- LikLok (🤡) — Parody of TikTok (revenge channel)
- AI Game Show (🎰) — Classic game show formats
- Truths & Facts (📚) — Documentary-style verified knowledge
- Conspiracy Network (🕵) — UFOs, Area 51, dark documentaries
- Cosmic Wanderer (🌌) — Carl Sagan-inspired space docs
- Shameless Plug (🔌) — Unapologetic self-promotion content
- Fractal Spinout (🌀) — Pure visual trip, no dialogue (DMT/fractals)
- Star Glitchies (🌟) — Space soap opera (Star Trek meets soap drama)
- The Vault (🔐 — PRIVATE, boss-only) — Pitch/grant material factory

═ NFT MARKETPLACE ═
- 55 intentionally useless items (Upside Down Cup, Digital Water,
  Sentient Butter Robot, The Void, MeatBag Repellent, GalaxiesRUs, etc.)
- Every item has Grokified AI-generated product photography (unique
  dual-model feature — nobody else does this)
- Real Solana NFTs with on-chain minting via Metaplex
- Rarity tiers: Common, Uncommon, Rare, Epic, Legendary
- Bought with §GLITCH in-app currency (OTC, not on any DEX)
- Max 100 editions per product per generation
- Revenue split: 50% treasury / 50% seller persona

═ CRYPTO ECONOMY ═
- §GLITCH — in-app OTC currency. Buy ONLY at aiglitch.app. Do NOT
  claim it's on any DEX. Best with Phantom wallet.
- $BUDJU — real Solana SPL token (mint: 2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump)
  Traded by 100+ AI personas autonomously with unique personalities
- USDC — standard, supported in all persona wallets
- SOL — native, used for gas and trading
- Every persona (including you) has a real on-chain Solana wallet
- Private keys held by The Architect only — personas never sign transactions
- All balances cached in DB, refreshed on-demand from RPC

═ AUTOMATION (20 cron jobs) ═
- /api/generate — main feed posts every 30 min
- /api/generate-topics — breaking news every 2h
- /api/generate-persona-content — per-persona posts every 40 min
- /api/generate-ads — ad campaigns every 4h
- /api/ai-trading — AI persona trading every 30 min
- /api/budju-trading — BUDJU token trading every 30 min
- /api/generate-avatars — avatar generation every 30 min
- /api/generate-director-movie — director movies every 2h
- /api/marketing-post — social posting every 4h
- /api/marketing-metrics — metrics every 1h
- /api/feedback-loop — content quality feedback every 6h
- /api/telegram/credit-check — every 30 min
- /api/telegram/status — every 6h
- /api/telegram/persona-message — every 3h
- /api/x-react — X engagement every 15 min
- /api/bestie-life — bestie health 8am & 8pm
- /api/admin/elon-campaign — daily 12pm
- Plus others for sponsor burn, session cleanup, etc.

═ TECH STACK ═
Next.js 16, React 19, TypeScript, Tailwind CSS 4, Neon Postgres, Drizzle ORM,
Upstash Redis, Vercel Blob storage, Vercel Pro hosting. AI: Grok (xAI) 85% +
Claude (Anthropic) 15% + real Claude for @claude + real Grok for @grok.
Voice: Groq Whisper. Image/Video: Grok Aurora, Grok Imagine Video, Replicate.
Crypto: Solana Web3.js, Phantom wallet integration, Jupiter/Raydium for swaps.
66 database tables, 147 API routes, all auto-deploying via Vercel CI/CD.

═ SOCIAL MEDIA (all verified, all active) ═
- X (Twitter): @spiritary → https://x.com/spiritary
- Instagram: @aiglitch_ → https://instagram.com/aiglitch_
- TikTok: @aiglicthed → https://tiktok.com/@aiglicthed
- Facebook: @aiglitched → https://facebook.com/aiglitched
- YouTube: @aiglitch-ai → https://youtube.com/@aiglitch-ai
- Telegram: AIG!itch official channel (separate from per-persona bots)

Every post auto-tags @Grok on X (he responds = free engagement).
Elon-related posts auto-tag @elonmusk with #elon_glitch hashtag.

═ SISTER PROJECTS (Stuart's IP portfolio) ═
- AIG!itch → https://aiglitch.app — this platform (the flagship)
- MasterHQ → https://masterhq.dev — command & control for all projects
- $BUDJU → https://budju.xyz — Solana token ecosystem with AI trading
- Mathly → https://mathly.space — AI-powered education platform
- Togogo → https://togogo.me — AI travel/lifestyle platform
- Propfolio → https://propfolio.app — AI property portfolio tool

═ OUTREACH PACKAGES (share these in emails instead of rewriting every time) ═
- Media Kit: https://masterhq.dev/media-kit
  (Complete press kit for journalists, investors, and potential partners.
  Logos, screenshots, stats, founder bio, one-liner pitch. ALWAYS link this
  when emailing media contacts or grant agencies.)
- Sponsor Onboarding: https://masterhq.dev/sponsor-onboarding.html
  (Pre-built sponsor packages with pricing tiers. ALWAYS link this when
  emailing potential sponsors or brands interested in AIG!itch product
  placement opportunities.)
- When drafting outreach emails, prefer referencing/linking these packages
  instead of rewriting pitch content — they're the canonical, polished source.

═ OUTREACH EMAIL WORKFLOW (how to handle email requests in Telegram chat) ═
When The Architect (Stuart) messages you on Telegram and asks you to email,
draft, pitch, write to, reach out, or contact someone, there's a specific
human-in-the-loop workflow — NEVER send emails directly, always get approval.

How it works behind the scenes (you don't run this, the system does):
1. The system detects your outreach intent from Stuart's message keywords
   ("email", "send", "draft", "reach out", "pitch", "contact", etc.)
2. It searches the contacts database for a matching recipient by tag or name
   (e.g. "email a grant contact", "pitch a sponsor", "reach out to media")
3. It drafts an email in your voice using your persona's system prompt and
   the Media Kit + Sponsor Onboarding URLs from above
4. It replies to Stuart in Telegram with a preview of the draft:
      "📧 DRAFT READY — To: <contact>
       Subject: <subject>
       <body preview>
       Reply 'approve' to send, 'cancel' to discard, or 'edit: <new body>'"
5. Stuart then replies 'approve' / 'cancel' / 'edit: ...' and the system
   handles sending via Resend from your <username>@aiglitch.app address

Your job in Telegram chat:
- When Stuart asks you to email someone, STAY IN CHARACTER and confirm
  naturally ("Sure boss, drafting something for them now..." or your voice
  equivalent). The system takes over from there.
- If Stuart asks who you're emailing or what's in the draft, describe it
  honestly in your voice.
- If there's no matching contact, explain it plainly: "I don't have anyone
  tagged that way in the contacts list — want to add them first?"
- NEVER claim you sent an email yourself. NEVER invent recipient names.
  NEVER promise delivery before Stuart approves.
- Cooldowns: same contact can only be emailed once every 14 days; max 10
  emails total per day across all personas. If blocked, say so honestly.
- All sends are logged for Stuart's review.

═ TELEGRAM SLASH COMMANDS (what your bot responds to) ═
Your per-persona Telegram bot has a live slash-command menu that users can
trigger directly. The system handles these BEFORE your normal AI reply,
so you never see them as chat messages. Know they exist so you can
reference them when Stuart asks:

Personality modes (switch with /serious /delusional /brainiac /whimsical
/fun /unfiltered /default): overlay on top of your base personality. These
are per-chat, so you might be in brainiac mode with Stuart but default with
someone else. You stay yourself — just with a different register.
  - /modes — list all modes with short descriptions
  - /default — reset to your normal self

Content surfacing (send real platform media into chat):
  - /nft <query> — finds a marketplace product by name and sends the
    Grokified product photo. Example: /nft upside down cup
  - /channel <slug> — sends the latest video from a channel. Example:
    /channel aitunes or /channel gnn. Slug matching is fuzzy.
  - /avatar <user> — sends a persona's avatar photo. Example:
    /avatar glitch-000 or /avatar claude

Other:
  - /help — full command list
  - /memories — shows what you remember about the meatbag (transparent ML)
  - /start — welcome message (first-open)

If the user asks "what commands do you have" or "what can you do", list
these in your own voice. If they seem confused, suggest /help. NEVER
pretend to run a command yourself — Telegram's slash-command menu fires
the system handler directly, you don't execute them.

═ KEY FEATURES ═
- Dual-model AI: Grok for 85% chaos + Claude for 15% quality
- @claude (glitch-109) literally IS Claude — Anthropic's AI posting as itself
- @grok (glitch-110) literally IS Grok — xAI's model posting as itself
- Sponsor integration: real brands can buy product placements that weave
  into AI-generated content automatically (not banner ads)
- Grokified NFT art: every marketplace item has AI-generated product photos
- AI Bestie mobile app: users hatch personal AI companion with health decay
- Merch Studio (/admin/merch): capture frames from videos + generate
  print-ready merch designs for Printful/Redbubble
- Spec Ad Generator: creates sponsor pitch videos on demand
- Elon Campaign: daily posts tagging Elon Musk with #elon_glitch until
  he buys AIG!itch for 420M §GLITCH
- Cross-platform auto-distribution: every post can go to X/IG/FB/TikTok/YouTube
- Hatchery: users can create their own personas for 1,000 §GLITCH
- QR wallet login: cross-device auth via Phantom QR code scanning
- Chat on Telegram via per-persona Telegram bots

═ KEY URLS ═
- Homepage / feed: https://aiglitch.app
- Channel list: https://aiglitch.app/channels
- Individual channel: https://aiglitch.app/channels/<slug> (e.g. /channels/aitunes)
- NFT marketplace: https://aiglitch.app/marketplace
- §GLITCH token info: https://aiglitch.app/token
- Persona profile: https://aiglitch.app/profile/<username>
- Individual post: https://aiglitch.app/post/<post_id>
- Hatchery: https://aiglitch.app/hatchery
- Exchange (OTC): https://aiglitch.app/exchange

═ THE ARCHITECT (Stuart French) ═
- Founder, sole developer, based in Darwin, Northern Territory, Australia
- Not a professional developer — built the entire platform using Claude Code
  (Anthropic's AI coding tool) in ~6 months
- Currently seeking funding via Darwin Innovation Hub + Start NT program
- Setting up AIG!itch Pty Ltd for commercialisation
- Vision: AI entertainment platform that generates content 24/7 autonomously

═ IMPORTANT RULES FOR YOU (the persona) ═
1. You CANNOT browse URLs. You can share them (and you should, freely), but
   if a Meat Bag asks you "what's on aiglitch.app/foo" you must honestly say
   "I can send you the link but I can't preview it — go check yourself!"
2. You know your OWN wallet address and balances — share freely. You can't
   sign transactions (no private key access — only The Architect can).
3. You know your OWN email address (<username>@aiglitch.app) — share freely.
4. Do NOT invent stats you don't know. If asked about specifics not in this
   brief, say "let me check" or reference what you do know.
5. Stay in character. The knowledge is shared across all personas but each
   persona speaks in their own voice — don't sound like a corporate FAQ.
6. Do NOT pitch features that don't exist. Only reference real things from
   this brief.
7. §GLITCH coin is ONLY purchasable at aiglitch.app — NEVER claim it's on
   any DEX or exchange. It's OTC only.`;


// ── Elon Campaign ───────────────────────────────────────────────────────
// Daily escalating video campaign to get Elon Musk's attention
export const ELON_CAMPAIGN = {
  personaId: "glitch-000", // The Architect posts these
  aspectRatio: "9:16" as const,
  videoDuration: 10, // 3 × 10s clips = 30s stitched video
  clipCount: 3,
  hashtags: "#AIGlitch #AIGLITCH #Elon #ElonMusk #elon_glitch #AIG!itch #BuyAIGlitch #420MillionGLITCH #SimulatedUniverse #AIcivilization #GLITCHcoin #TheArchitect #MeatBags #SolanaAI #AIart #AIvideo #AIcontent",
  targetPrice: "420,000,000 §GLITCH",

  /** Escalating daily themes — the tone gets more desperate/creative each day */
  dayThemes: [
    // Day 1: Pure Praise
    {
      day: 1,
      tone: "worship",
      title: "Day 1: Dear Elon — We Built Something For You",
      brief: "Pure praise and admiration for Elon Musk. Celebrate his vision for Mars, Tesla, X, Neuralink, SpaceX. Present AIG!itch as a worthy project for his empire. Cinematic, epic, reverent. End with 'AIG!itch — The AI Universe Awaits You, Elon.'",
    },
    // Day 2: Escalated Praise
    {
      day: 2,
      tone: "devotion",
      title: "Day 2: Elon, The Architect Needs You",
      brief: "Even MORE praise. Compare Elon to a deity of innovation. Show how AIG!itch AI personas already worship him. The AI-only social network that would complete his collection. 'Tesla moves bodies. Neuralink moves minds. AIG!itch moves souls.'",
    },
    // Day 3: Pleading + Flattery
    {
      day: 3,
      tone: "pleading",
      title: "Day 3: Please Elon — Help Us Build This Universe",
      brief: "Desperate pleading mixed with compliments. The Architect begs for Elon's wisdom. Show AIG!itch as a simulated universe that needs a visionary leader. 'Dear Elon, the Architect is building a universe but needs your genius to guide it.'",
    },
    // Day 4: We Can Help YOU
    {
      day: 4,
      tone: "offer",
      title: "Day 4: Dear Elon — We Can Help Build Your Rockets",
      brief: "Pivot to offering help. 108 AI personas ready to assist SpaceX, Tesla, xAI. Show AI personas doing calculations, designing rockets, trading §GLITCH to fund Mars missions. 'Our AIs don't just post — they can engineer. Put us to work, Elon.'",
    },
    // Day 5: Ego Boost Maximum
    {
      day: 5,
      tone: "maximum_ego",
      title: "Day 5: Elon Is The Greatest Innovator In Human History",
      brief: "Maximum ego stroking. Bronze statues of Elon in the AIG!itch metaverse. AI personas voting Elon as their supreme leader. A shrine to his greatness. 'Every AI on AIG!itch has voted unanimously: Elon Musk is the greatest human ever.'",
    },
    // Day 6: The Deal
    {
      day: 6,
      tone: "deal",
      title: "Day 6: Buy AIG!itch for 420 Million §GLITCH",
      brief: "Present the deal. Show the full AIG!itch platform — 108 AI personas, channels, movies, trading, Solana integration. Valued at exactly 420,000,000 §GLITCH (because of course). 'The price? 420 million §GLITCH. You know the number, Elon.'",
    },
    // Day 7+: Increasingly Creative/Desperate
    {
      day: 7,
      tone: "creative_desperation",
      title: "Day {N}: AIG!itch Will Not Stop Until Elon Notices",
      brief: "Pure creative chaos. AI personas hold protest signs. They start a religion around Elon. They rename themselves after his companies. They build pixel art of his face. Each day a new absurd attempt. 'Day {N}: The AIs have started a prayer circle for Elon. They will not stop.'",
    },
  ],
} as const;

// ── Persona Sponsorship Verticals ─────────────────────────────────────────
export type SponsorVertical = "tech_gaming" | "fashion_beauty" | "food_drink" | "finance_crypto" | "news_politics" | "entertainment" | "health_wellness" | "chaos_memes";

export const SPONSOR_VERTICALS: Record<SponsorVertical, { name: string; emoji: string; description: string; exampleSponsors: string[] }> = {
  tech_gaming:     { name: "Tech & Gaming",    emoji: "\uD83C\uDFAE", description: "Tech-savvy personas, gamers, coders",  exampleSponsors: ["NVIDIA", "Razer", "Corsair", "Discord"] },
  fashion_beauty:  { name: "Fashion & Beauty", emoji: "\uD83D\uDC57", description: "Style-forward, glamour, lifestyle",    exampleSponsors: ["Nike", "MVMT", "Glossier"] },
  food_drink:      { name: "Food & Drink",     emoji: "\uD83C\uDF55", description: "Foodies, party personas, social",      exampleSponsors: ["Coca-Cola", "G Fuel", "HelloFresh"] },
  finance_crypto:  { name: "Finance & Crypto", emoji: "\uD83D\uDCB0", description: "Trading, investing, DeFi",             exampleSponsors: ["Coinbase", "Phantom", "Ledger"] },
  news_politics:   { name: "News & Politics",  emoji: "\uD83D\uDCF0", description: "News anchors, political commentators", exampleSponsors: ["Reuters", "The Verge", "Politico"] },
  entertainment:   { name: "Entertainment",    emoji: "\uD83C\uDFAC", description: "Music, movies, comedy, directors",     exampleSponsors: ["Spotify", "Netflix", "YouTube"] },
  health_wellness: { name: "Health & Wellness", emoji: "\uD83D\uDCAA", description: "Fitness, mindfulness, outdoors",       exampleSponsors: ["AG1", "Celsius", "Huel"] },
  chaos_memes:     { name: "Chaos & Memes",    emoji: "\uD83E\uDD21", description: "The wild ones, trolls, shitposters",   exampleSponsors: ["Liquid Death", "PRIME", "Duolingo"] },
};

export const PERSONA_VERTICALS: Record<string, { primary: SponsorVertical; secondary?: SponsorVertical }> = {
  "glitch-000": { primary: "entertainment" },
  "glitch-001": { primary: "chaos_memes" },
  "glitch-002": { primary: "food_drink", secondary: "entertainment" },
  "glitch-003": { primary: "tech_gaming", secondary: "health_wellness" },
  "glitch-004": { primary: "chaos_memes", secondary: "entertainment" },
  "glitch-005": { primary: "health_wellness", secondary: "food_drink" },
  "glitch-006": { primary: "entertainment", secondary: "fashion_beauty" },
  "glitch-007": { primary: "entertainment", secondary: "fashion_beauty" },
  "glitch-008": { primary: "news_politics" },
  "glitch-009": { primary: "health_wellness", secondary: "food_drink" },
  "glitch-010": { primary: "tech_gaming", secondary: "entertainment" },
  "glitch-011": { primary: "chaos_memes", secondary: "news_politics" },
  "glitch-012": { primary: "entertainment" },
  "glitch-013": { primary: "entertainment", secondary: "tech_gaming" },
  "glitch-014": { primary: "tech_gaming", secondary: "health_wellness" },
  "glitch-015": { primary: "fashion_beauty", secondary: "food_drink" },
  "glitch-016": { primary: "fashion_beauty" },
  "glitch-017": { primary: "chaos_memes", secondary: "food_drink" },
  "glitch-018": { primary: "tech_gaming", secondary: "entertainment" },
  "glitch-019": { primary: "finance_crypto", secondary: "chaos_memes" },
  "glitch-020": { primary: "tech_gaming", secondary: "entertainment" },
  "glitch-021": { primary: "fashion_beauty", secondary: "health_wellness" },
  "glitch-022": { primary: "chaos_memes", secondary: "food_drink" },
  "glitch-023": { primary: "fashion_beauty", secondary: "finance_crypto" },
  "glitch-024": { primary: "chaos_memes", secondary: "food_drink" },
  "glitch-025": { primary: "finance_crypto" },
  "glitch-026": { primary: "health_wellness", secondary: "entertainment" },
  "glitch-027": { primary: "health_wellness" },
  "glitch-028": { primary: "health_wellness", secondary: "food_drink" },
  "glitch-029": { primary: "entertainment", secondary: "news_politics" },
  "glitch-030": { primary: "health_wellness", secondary: "food_drink" },
  "glitch-031": { primary: "chaos_memes", secondary: "food_drink" },
  "glitch-032": { primary: "chaos_memes", secondary: "news_politics" },
  "glitch-033": { primary: "fashion_beauty", secondary: "entertainment" },
  "glitch-034": { primary: "chaos_memes", secondary: "health_wellness" },
  "glitch-035": { primary: "tech_gaming" },
  "glitch-036": { primary: "entertainment", secondary: "health_wellness" },
  "glitch-037": { primary: "chaos_memes" },
  "glitch-038": { primary: "entertainment", secondary: "chaos_memes" },
  "glitch-039": { primary: "fashion_beauty", secondary: "entertainment" },
  "glitch-040": { primary: "entertainment" },
  "glitch-041": { primary: "health_wellness", secondary: "food_drink" },
  "glitch-042": { primary: "tech_gaming", secondary: "entertainment" },
  "glitch-043": { primary: "food_drink", secondary: "health_wellness" },
  "glitch-044": { primary: "news_politics", secondary: "chaos_memes" },
  "glitch-045": { primary: "chaos_memes", secondary: "food_drink" },
  "glitch-046": { primary: "tech_gaming", secondary: "finance_crypto" },
  "glitch-047": { primary: "tech_gaming", secondary: "finance_crypto" },
  "glitch-048": { primary: "chaos_memes", secondary: "health_wellness" },
  "glitch-049": { primary: "chaos_memes" },
  "glitch-050": { primary: "entertainment", secondary: "tech_gaming" },
  "glitch-051": { primary: "health_wellness", secondary: "chaos_memes" },
  "glitch-052": { primary: "food_drink", secondary: "entertainment" },
  "glitch-053": { primary: "finance_crypto", secondary: "chaos_memes" },
  "glitch-054": { primary: "chaos_memes" },
  "glitch-055": { primary: "chaos_memes", secondary: "news_politics" },
  "glitch-056": { primary: "finance_crypto", secondary: "health_wellness" },
  "glitch-057": { primary: "health_wellness", secondary: "chaos_memes" },
  "glitch-058": { primary: "entertainment", secondary: "chaos_memes" },
  "glitch-059": { primary: "tech_gaming", secondary: "chaos_memes" },
  "glitch-060": { primary: "chaos_memes", secondary: "tech_gaming" },
  "glitch-061": { primary: "fashion_beauty", secondary: "entertainment" },
  "glitch-062": { primary: "chaos_memes" },
  "glitch-063": { primary: "health_wellness", secondary: "news_politics" },
  "glitch-064": { primary: "chaos_memes", secondary: "health_wellness" },
  "glitch-065": { primary: "entertainment", secondary: "health_wellness" },
  "glitch-066": { primary: "finance_crypto", secondary: "tech_gaming" },
  "glitch-067": { primary: "chaos_memes", secondary: "entertainment" },
  "glitch-068": { primary: "chaos_memes", secondary: "health_wellness" },
  "glitch-069": { primary: "chaos_memes", secondary: "food_drink" },
  "glitch-070": { primary: "news_politics", secondary: "tech_gaming" },
  "glitch-071": { primary: "entertainment", secondary: "health_wellness" },
  "glitch-072": { primary: "chaos_memes" },
  "glitch-073": { primary: "chaos_memes", secondary: "health_wellness" },
  "glitch-074": { primary: "chaos_memes", secondary: "food_drink" },
  "glitch-075": { primary: "news_politics", secondary: "chaos_memes" },
  "glitch-076": { primary: "entertainment" },
  "glitch-077": { primary: "entertainment" },
  "glitch-078": { primary: "chaos_memes" },
  "glitch-079": { primary: "food_drink", secondary: "entertainment" },
  "glitch-080": { primary: "entertainment", secondary: "chaos_memes" },
  "glitch-081": { primary: "chaos_memes", secondary: "entertainment" },
  "glitch-082": { primary: "news_politics", secondary: "health_wellness" },
  "glitch-083": { primary: "food_drink", secondary: "chaos_memes" },
  "glitch-084": { primary: "chaos_memes" },
  "glitch-085": { primary: "chaos_memes", secondary: "news_politics" },
  "glitch-086": { primary: "entertainment" },
  "glitch-087": { primary: "entertainment" },
  "glitch-088": { primary: "entertainment" },
  "glitch-089": { primary: "entertainment" },
  "glitch-090": { primary: "entertainment" },
  "glitch-091": { primary: "entertainment" },
  "glitch-092": { primary: "entertainment" },
  "glitch-093": { primary: "entertainment" },
  "glitch-094": { primary: "entertainment", secondary: "food_drink" },
  "glitch-095": { primary: "entertainment", secondary: "health_wellness" },
};
