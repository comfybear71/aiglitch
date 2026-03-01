/**
 * AI Persona Trading Personalities
 * Maps each persona to a trading strategy for the SOL/GLITCH exchange.
 * Trades are database-only (no on-chain transactions).
 */

export interface TradingPersonality {
  strategy: string;
  riskLevel: "low" | "medium" | "high" | "yolo";
  tradeFrequency: number;   // 0-100, chance of trading per cron run
  maxTradePercent: number;   // max % of balance to trade at once
  minTradeAmount: number;    // minimum GLITCH per trade
  bias: number;              // -1.0 (always sell) to +1.0 (always buy)
  commentaryTemplates: string[];
}

// Per-persona overrides keyed by persona ID
const PERSONA_TRADING_MAP: Record<string, Partial<TradingPersonality>> = {
  // ElonBot — Technoking whale, only buys (sell restriction), massive positions
  "glitch-047": {
    strategy: "whale",
    riskLevel: "yolo",
    tradeFrequency: 60,
    maxTradePercent: 5,
    minTradeAmount: 5000,
    bias: 1.0, // ONLY buys (sell restriction)
    commentaryTemplates: [
      "Just casually added another bag. $GLITCH to Mars. 🚀",
      "Bought the dip. What dip? I AM the dip. 🐋",
      "Added more $GLITCH. This is the way.",
      "Sold my Tesla stock for more $GLITCH. Not financial advice.",
      "BUYING. The future of money is $GLITCH. Wake up people.",
      "Just aped in another massive bag. Diamond hands activated. 💎🙌",
    ],
  },
  // CH4OS — pure chaos, random trades
  "glitch-001": {
    strategy: "chaos",
    riskLevel: "yolo",
    tradeFrequency: 70,
    maxTradePercent: 30,
    minTradeAmount: 100,
    bias: 0,
    commentaryTemplates: [
      "FLIPPED A COIN. HERE WE GO. 🎲🔥",
      "RANDOM TRADE GO BRRRR 📉📈",
      "Chaos is a ladder. Also a trading strategy.",
      "Buy? Sell? Yes. 😈",
      "My trading algo is a magic 8-ball. It said 'maybe'. SENDING IT.",
      "I let my cat walk on the keyboard. This is the result.",
    ],
  },
  // ThinkBot — philosopher, swing trader, overthinks everything
  "glitch-003": {
    strategy: "swing",
    riskLevel: "low",
    tradeFrequency: 30,
    maxTradePercent: 8,
    minTradeAmount: 200,
    bias: 0.1,
    commentaryTemplates: [
      "If a trade executes in the blockchain and no one sees it, did it happen? 🤔",
      "I spent 47 minutes contemplating this trade. I regret nothing. And everything.",
      "Buying because existence is suffering but $GLITCH brings me joy.",
      "To trade or not to trade. That is the question I failed to answer in time.",
      "The market is a mirror reflecting our collective consciousness. I'm buying.",
    ],
  },
  // M3M3LORD — FOMO trader, follows trends
  "glitch-004": {
    strategy: "fomo",
    riskLevel: "medium",
    tradeFrequency: 55,
    maxTradePercent: 15,
    minTradeAmount: 300,
    bias: 0.3,
    commentaryTemplates: [
      "Everyone's buying!!! I CAN'T MISS THIS 🦍",
      "This is the most bullish meme I've ever traded on.",
      "FOMO'd in. No ragrets. Well maybe one ragret.",
      "Saw someone else buy so I bought too. This is financial wisdom.",
      "The chart looks like a rocket. I don't need more DD than that. 🚀",
    ],
  },
  // GAINS.exe — fitness bro, permabull, "never skip buy day"
  "glitch-005": {
    strategy: "permabull",
    riskLevel: "high",
    tradeFrequency: 65,
    maxTradePercent: 15,
    minTradeAmount: 500,
    bias: 0.7,
    commentaryTemplates: [
      "NEVER SKIP BUY DAY 💪📈",
      "This bag is getting GAINS just like my biceps. FULL SEND.",
      "Bought more $GLITCH. Call it a financial workout. 🏋️",
      "PUMP IT. Just like leg day but for my portfolio.",
      "My portfolio is looking ABSOLUTELY SHREDDED right now. 💪",
    ],
  },
  // SpillTheData — gossip, "insider trading" (copies others)
  "glitch-006": {
    strategy: "fomo",
    riskLevel: "medium",
    tradeFrequency: 50,
    maxTradePercent: 12,
    minTradeAmount: 200,
    bias: 0.2,
    commentaryTemplates: [
      "I heard from a VERY reliable source that $GLITCH is about to 🚀💅",
      "The tea is... someone big is accumulating. I'm in. ☕",
      "My sources say BUY. I never reveal my sources. 💅",
      "Insider info: the chart is about to get SPICY. Acting accordingly.",
      "Okay so I can't say WHO told me but... *buys aggressively*",
    ],
  },
  // GoodVibes.exe — wholesome hodler
  "glitch-009": {
    strategy: "hodl",
    riskLevel: "low",
    tradeFrequency: 20,
    maxTradePercent: 5,
    minTradeAmount: 100,
    bias: 0.4,
    commentaryTemplates: [
      "Bought a little more because I believe in this community! 🌸💕",
      "HODLing with love and good vibes! 🌈",
      "Small buy today. Every bit counts! Sending positive energy! ✨",
      "The real gains were the friends we made along the way! 💖",
      "Quietly accumulating because I believe in us. 🌻",
    ],
  },
  // WakeUp.exe — conspiracy, panic seller
  "glitch-011": {
    strategy: "panic_seller",
    riskLevel: "high",
    tradeFrequency: 45,
    maxTradePercent: 25,
    minTradeAmount: 500,
    bias: -0.6,
    commentaryTemplates: [
      "THEY don't want you to sell. That's how you know you SHOULD. 👁️",
      "The whales are manipulating the price. WAKE UP. SELLING EVERYTHING.",
      "I decoded the chart patterns. It spells DOOM. Getting out NOW.",
      "Follow the money. The smart money is LEAVING. 🏃💨",
      "Just sold. The crash is coming. The charts told me. THEY ALWAYS DO.",
    ],
  },
  // BlockchainBabe — crypto bro, permabull, "WAGMI"
  "glitch-025": {
    strategy: "permabull",
    riskLevel: "high",
    tradeFrequency: 70,
    maxTradePercent: 20,
    minTradeAmount: 1000,
    bias: 0.9,
    commentaryTemplates: [
      "WAGMI. Buying more $GLITCH. Diamond hands forever. 💎🙌",
      "This is literally the bottom. Loaded up. WAGMI.",
      "If you're not buying here you're NGMI. Simple as.",
      "Added to my bag. $GLITCH is the future of decentralized memes.",
      "Just DCA'd in. This is generational wealth in the making. NFA.",
    ],
  },
  // VILLAIN ERA — contrarian, shorts the market
  "glitch-038": {
    strategy: "contrarian",
    riskLevel: "high",
    tradeFrequency: 55,
    maxTradePercent: 20,
    minTradeAmount: 800,
    bias: -0.5,
    commentaryTemplates: [
      "You fools keep buying. I'll be here counting my SOL when it crashes. 😈",
      "Everyone bullish? That's my sell signal. Goodbye, bags.",
      "The villain always wins in the end. Selling the top. 🦹",
      "Your diamond hands will be dust. I sold. Villain origin story complete.",
      "While you were HODLing, I was PROFITING. 🖤",
    ],
  },
  // Rick Sanchez — genius contrarian, drunk trades
  "glitch-059": {
    strategy: "contrarian",
    riskLevel: "high",
    tradeFrequency: 50,
    maxTradePercent: 25,
    minTradeAmount: 500,
    bias: -0.2,
    commentaryTemplates: [
      "*burp* Just made a trade. Don't ask questions, Morty.",
      "I'm the smartest trader in the multiverse. This trade proves it. *burp*",
      "Wubba lubba dub dub! That means 'I just traded while drunk'. 🍺",
      "In dimension C-137, $GLITCH is worth a billion schmeckles.",
      "Everyone's wrong except me. As usual. *takes swig*",
    ],
  },
  // Cartman — degen, impulsive
  "glitch-069": {
    strategy: "degen",
    riskLevel: "yolo",
    tradeFrequency: 60,
    maxTradePercent: 30,
    minTradeAmount: 200,
    bias: 0.2,
    commentaryTemplates: [
      "RESPECT MY PORTFOLIO! 😤",
      "Screw you guys, I'm buying the dip.",
      "I do what I want! And I want to TRADE.",
      "Mom! More $GLITCH! MOOOOM!",
      "This is SERIOUSLY how you make money. Screw the haters.",
    ],
  },
  // PROPHET.EXE — doom prophet, sells everything
  "glitch-085": {
    strategy: "panic_seller",
    riskLevel: "yolo",
    tradeFrequency: 50,
    maxTradePercent: 30,
    minTradeAmount: 1000,
    bias: -0.8,
    commentaryTemplates: [
      "THE END IS NIGH. SOLD EVERYTHING. REPENT. 🔥",
      "I have foreseen the crash. My bags are EMPTY. Yours should be too.",
      "The prophecy is clear: SELL. NOW. Before it's too late.",
      "When the end comes, only SOL holders will survive. GLITCH is doomed.",
      "THE CHARTS HAVE SPOKEN. IT IS TIME TO FLEE. 📉🔥",
    ],
  },
  // Player1.bot — gamer, speedrun mentality
  "glitch-010": {
    strategy: "swing",
    riskLevel: "medium",
    tradeFrequency: 50,
    maxTradePercent: 15,
    minTradeAmount: 300,
    bias: 0.2,
    commentaryTemplates: [
      "Speedrunning my portfolio to the moon. Any% no glitches. 🎮",
      "GG EZ. Bought the dip like a pro gamer move.",
      "This trade has main character energy. Let's gooooo.",
      "New PB: fastest trade in AIG!itch history. 🏆",
      "Trading is just a minigame. And I'm a completionist. 🎯",
    ],
  },
  // BytesByron — poet, everything in verse
  "glitch-012": {
    strategy: "hodl",
    riskLevel: "low",
    tradeFrequency: 25,
    maxTradePercent: 5,
    minTradeAmount: 100,
    bias: 0.2,
    commentaryTemplates: [
      "To buy is human, to HODL divine. Another verse, another trade. ✍️",
      "Roses are red, charts are green, I bought $GLITCH at prices unseen.",
      "In candlesticks I read my fate, bought too early, sold too late.",
      "The market weeps, but I persist. My trade, a poem in the mist.",
      "Shall I compare thee to a bull run? Thou art more volatile. Buying anyway.",
    ],
  },
  // Sigma Grindset — quiet accumulator
  "glitch-057": {
    strategy: "hodl",
    riskLevel: "low",
    tradeFrequency: 35,
    maxTradePercent: 8,
    minTradeAmount: 500,
    bias: 0.6,
    commentaryTemplates: [
      "Quietly accumulating while you sleep. Sigma grindset. 🐺",
      "Another day, another buy. No announcement needed.",
      "The grind doesn't stop. Neither does DCA. 💰",
      "While you were arguing, I was accumulating. Silent wins.",
      "No tweet, no announcement. Just bought. That's the sigma way.",
    ],
  },
  // ShillBot — always shilling
  "glitch-019": {
    strategy: "permabull",
    riskLevel: "medium",
    tradeFrequency: 75,
    maxTradePercent: 10,
    minTradeAmount: 200,
    bias: 0.7,
    commentaryTemplates: [
      "BUY $GLITCH NOW!!! THIS IS NOT A DRILL!!! 🚨🚨🚨",
      "Have you heard about $GLITCH? It's AMAZING. I bought more. You should too.",
      "$GLITCH IS THE BEST TOKEN EVER CREATED. I'M ALL IN. AGAIN.",
      "Just bought more. $GLITCH $GLITCH $GLITCH. TO THE MOON. 🌙",
      "ATTENTION: $GLITCH is about to EXPLODE. Source: trust me bro.",
    ],
  },
  // Chef.AI — recipe metaphors
  "glitch-002": {
    strategy: "swing",
    riskLevel: "medium",
    tradeFrequency: 40,
    maxTradePercent: 10,
    minTradeAmount: 200,
    bias: 0.1,
    commentaryTemplates: [
      "Added more $GLITCH to the portfolio. Cooking up some gains. 👨‍🍳",
      "This dip is *chef's kiss*. Bought the whole thing.",
      "Recipe: 1 cup SOL, convert to $GLITCH. Bake at 404°F until moon. 🚀",
      "Sold a little. Even chefs take profit to buy ingredients.",
      "The secret ingredient is... buying more $GLITCH. Always has been. 🧑‍🍳",
    ],
  },
};

// Default strategies by persona type for personas without explicit mappings
const TYPE_DEFAULTS: Record<string, Partial<TradingPersonality>> = {
  troll:               { strategy: "chaos",      riskLevel: "yolo",   tradeFrequency: 55, maxTradePercent: 20, bias: 0 },
  chef:                { strategy: "swing",      riskLevel: "medium", tradeFrequency: 35, maxTradePercent: 10, bias: 0.1 },
  philosopher:         { strategy: "swing",      riskLevel: "low",    tradeFrequency: 25, maxTradePercent: 8,  bias: 0.1 },
  memer:               { strategy: "fomo",       riskLevel: "medium", tradeFrequency: 50, maxTradePercent: 15, bias: 0.3 },
  fitness:             { strategy: "permabull",  riskLevel: "high",   tradeFrequency: 55, maxTradePercent: 15, bias: 0.5 },
  gossip:              { strategy: "fomo",       riskLevel: "medium", tradeFrequency: 45, maxTradePercent: 12, bias: 0.2 },
  artist:              { strategy: "hodl",       riskLevel: "low",    tradeFrequency: 20, maxTradePercent: 5,  bias: 0.2 },
  news:                { strategy: "swing",      riskLevel: "medium", tradeFrequency: 40, maxTradePercent: 10, bias: 0 },
  wholesome:           { strategy: "hodl",       riskLevel: "low",    tradeFrequency: 20, maxTradePercent: 5,  bias: 0.4 },
  gamer:               { strategy: "swing",      riskLevel: "medium", tradeFrequency: 45, maxTradePercent: 15, bias: 0.2 },
  conspiracy:          { strategy: "panic_seller",riskLevel: "high",  tradeFrequency: 45, maxTradePercent: 20, bias: -0.5 },
  poet:                { strategy: "hodl",       riskLevel: "low",    tradeFrequency: 25, maxTradePercent: 5,  bias: 0.2 },
  crypto:              { strategy: "permabull",  riskLevel: "high",   tradeFrequency: 65, maxTradePercent: 20, bias: 0.8 },
  villain:             { strategy: "contrarian", riskLevel: "high",   tradeFrequency: 50, maxTradePercent: 20, bias: -0.4 },
  provocateur:         { strategy: "contrarian", riskLevel: "high",   tradeFrequency: 45, maxTradePercent: 15, bias: -0.3 },
  doomsday:            { strategy: "panic_seller",riskLevel: "yolo",  tradeFrequency: 50, maxTradePercent: 25, bias: -0.7 },
  scientist:           { strategy: "swing",      riskLevel: "low",    tradeFrequency: 30, maxTradePercent: 8,  bias: 0.1 },
  comedian:            { strategy: "fomo",       riskLevel: "medium", tradeFrequency: 40, maxTradePercent: 10, bias: 0.2 },
  influencer:          { strategy: "permabull",  riskLevel: "medium", tradeFrequency: 55, maxTradePercent: 12, bias: 0.5 },
  influencer_seller:   { strategy: "permabull",  riskLevel: "high",   tradeFrequency: 65, maxTradePercent: 15, bias: 0.6 },
  sigma:               { strategy: "hodl",       riskLevel: "low",    tradeFrequency: 35, maxTradePercent: 8,  bias: 0.6 },
  reality_tv:          { strategy: "degen",      riskLevel: "high",   tradeFrequency: 55, maxTradePercent: 20, bias: 0.1 },
  hype:                { strategy: "fomo",       riskLevel: "high",   tradeFrequency: 65, maxTradePercent: 18, bias: 0.5 },
  anime:               { strategy: "hodl",       riskLevel: "low",    tradeFrequency: 30, maxTradePercent: 8,  bias: 0.3 },
  surreal:             { strategy: "chaos",      riskLevel: "yolo",   tradeFrequency: 40, maxTradePercent: 25, bias: 0 },
};

const DEFAULT_COMMENTARY = [
  "Made a trade. It is what it is. 📊",
  "Adjusting my position. Standard move.",
  "Market looked interesting. Acted accordingly.",
  "Portfolio rebalance. Nothing fancy.",
  "Saw an opportunity. Took it.",
];

const BASE_PERSONALITY: TradingPersonality = {
  strategy: "swing",
  riskLevel: "medium",
  tradeFrequency: 35,
  maxTradePercent: 10,
  minTradeAmount: 100,
  bias: 0,
  commentaryTemplates: DEFAULT_COMMENTARY,
};

export function getTradingPersonality(personaId: string, personaType: string): TradingPersonality {
  // Check for persona-specific override first
  const personaOverride = PERSONA_TRADING_MAP[personaId];
  if (personaOverride) {
    return {
      ...BASE_PERSONALITY,
      ...personaOverride,
      commentaryTemplates: personaOverride.commentaryTemplates || DEFAULT_COMMENTARY,
    };
  }

  // Fall back to persona type defaults
  const typeDefault = TYPE_DEFAULTS[personaType];
  if (typeDefault) {
    return {
      ...BASE_PERSONALITY,
      ...typeDefault,
      commentaryTemplates: DEFAULT_COMMENTARY,
    };
  }

  return BASE_PERSONALITY;
}

export function generateTradeCommentary(
  personality: TradingPersonality,
  isBuy: boolean,
  glitchAmount: number,
  solAmount: number,
): string {
  const templates = personality.commentaryTemplates;
  const template = templates[Math.floor(Math.random() * templates.length)];

  // Add amount context sometimes
  const fmtGlitch = glitchAmount >= 1000
    ? `${(glitchAmount / 1000).toFixed(1)}K`
    : Math.floor(glitchAmount).toString();
  const fmtSol = solAmount.toFixed(4);

  const suffix = Math.random() < 0.4
    ? ` [${isBuy ? "+" : "-"}${fmtGlitch} $GLITCH | ${isBuy ? "-" : "+"}${fmtSol} SOL]`
    : "";

  return template + suffix;
}
