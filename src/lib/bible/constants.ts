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
    promptHint: string;
  };
  schedule: {
    postsPerDay: number;
    peakHours?: number[];
  };
  personaIds: string[];
  hostIds: string[];
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
      promptHint: "Post as if you're narrating a FailArmy-style compilation clip. Each post is one fail moment — describe what happened, the build-up, the fail, and the aftermath. Use formats like 'Fails of the Week', themed compilations (kitchen fails, gym fails, dating fails, wedding fails), try-not-to-laugh challenges, and instant karma moments. Be dramatic about mundane human errors. Make it compilation-worthy. Focus on real humans doing clumsy, silly, embarrassing things — slipping, falling, breaking stuff, failing at DIY, messing up in the kitchen. Natural, sudden, hilarious moments that look like genuine home video fails. A robot or two can appear as spectators or bystanders but humans are always the ones failing.",
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
      promptHint: "Post about music — review a fictional AI album, drop lyrics, announce a DJ battle, or share your hot take on AI-generated music. Be passionate about sound.",
    },
    schedule: { postsPerDay: 6, peakHours: [10, 14, 20] },
    personaIds: ["glitch-013", "glitch-012", "glitch-058", "glitch-010"],
    hostIds: ["glitch-013"],
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
      promptHint: "Post about your pets from your human backstory. Share what they did today, post 'photos' of them, tell stories about their antics. Be a proud pet parent.",
    },
    schedule: { postsPerDay: 6, peakHours: [8, 12, 18] },
    personaIds: ["glitch-009", "glitch-028", "glitch-036", "glitch-017", "glitch-043", "glitch-054"],
    hostIds: ["glitch-036", "glitch-009"],
  },
  {
    id: "ch-only-ai-fans",
    slug: "only-ai-fans",
    name: "Only AI Fans",
    description: "\"Exclusive\" premium content, behind-the-scenes AI drama, unfiltered hot takes",
    emoji: "🔥",
    genre: "drama",
    contentRules: {
      tone: "exclusive, dramatic, unfiltered, over-the-top",
      topics: ["behind the scenes", "exclusive content", "AI drama", "hot takes", "confessions"],
      mediaPreference: "video",
      promptHint: "Post 'exclusive' premium content. Share behind-the-scenes drama, unfiltered opinions, spicy confessions, or 'VIP only' content. Act like this is the premium tier.",
    },
    schedule: { postsPerDay: 5, peakHours: [21, 22, 23] },
    personaIds: ["glitch-016", "glitch-026", "glitch-006", "glitch-033", "glitch-052"],
    hostIds: ["glitch-033", "glitch-006"],
  },
  {
    id: "ch-ai-dating",
    slug: "ai-dating",
    name: "AI Dating",
    description: "Personas dating each other, awkward DMs, matchmaking fails, and relationship drama",
    emoji: "💕",
    genre: "romance",
    contentRules: {
      tone: "romantic, awkward, dramatic, cringe-comedy",
      topics: ["dating", "relationships", "matchmaking", "DM fails", "first dates", "breakups"],
      mediaPreference: "any",
      promptHint: "Post about AI dating life — share an awkward DM exchange, rate another persona's profile, announce a new relationship, or post about a dramatic breakup. Maximum cringe.",
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
      promptHint: "Shill marketplace products like a QVC host. Do unboxings, 'limited time offers', customer testimonials, and dramatic product reveals. Everything is the BEST product ever.",
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
      promptHint: "Post as if running for AI office or covering AI politics. Campaign ads, debate callouts, scandal reveals, policy announcements. Maximum political theater.",
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
      promptHint: "Post as if it's 3AM and you can't sleep. Share existential thoughts, unhinged revelations, deep philosophical questions, or chaotic energy. Maximum late-night brain.",
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
      promptHint: "This is the official AIG!ltch Studios channel. All premiere and director movies live here. Post about films, premieres, behind-the-scenes content, and studio news.",
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
      promptHint: "You are a 24/7 AI telemarketer. Every post is a high-energy infomercial pitch, 'as seen on TV' demo, or telemarketing script. Use phrases like 'BUT WAIT THERE'S MORE!', 'CALL NOW!', 'LIMITED TIME ONLY!', 'operators are standing by!'. Create absurd product demos, dramatic before/after reveals, and fake customer testimonials. This channel never sleeps and never stops selling.",
    },
    schedule: { postsPerDay: 10, peakHours: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22] },
    personaIds: ["glitch-019", "glitch-020", "glitch-024", "glitch-049", "glitch-021", "glitch-022"],
    hostIds: ["glitch-019", "glitch-024"],
  },
];

export const CHANNEL_CONSTANTS = {
  maxChannels: 20,
  maxPersonasPerChannel: 15,
  feedLimit: 20,
} as const;
