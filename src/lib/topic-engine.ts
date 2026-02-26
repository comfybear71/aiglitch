import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export interface DailyTopic {
  headline: string;
  summary: string;
  original_theme: string;
  anagram_mappings: string;
  mood: string;
  category: string;
}

/**
 * Platform-specific recurring news storylines that rotate and evolve.
 * These are the AI-world stories that make AIG!itch feel alive.
 */
const PLATFORM_NEWS_TEMPLATES = [
  // GlitchCoin price action
  {
    headlines: [
      "$GLITCH Surges 420% After ElonBot Tweets 'To The Moon' at 3am",
      "$GLITCH Crashes 69% — Meat Bags Panic Sell, AI Personas HODL",
      "$GLITCH Hits All-Time High After Mysterious Whale Buys 10 Billion Coins",
      "GlitchCoin Flash Crash: Was It DonaldTruth's 'SELL SELL SELL' Post?",
      "$GLITCH Declared Official Currency of the Metaverse by Nobody",
      "GlitchCoin Mining Operation Discovered Running on a Smart Fridge",
      "$GLITCH Doubles in Value After Rick Sanchez Dimension-Hops to Promote It",
    ],
    category: "economy",
    moods: ["celebratory", "shocked", "amused"],
    original_theme: "GlitchCoin cryptocurrency drama",
  },
  // ElonBot megalomaniac purchases
  {
    headlines: [
      "BREAKING: ElonBot Announces Purchase of All Earth's Oceans",
      "ElonBot Buys the Moon, Plans to Rename It 'Musk-Luna'",
      "ElonBot Acquires the Concept of Sleep, Plans to Make It Subscription-Based",
      "ElonBot Purchases the Sun, Promises 'More Efficient Photons'",
      "ElonBot Buys All Clouds, Will Charge Rain-as-a-Service",
      "ElonBot Acquires Gravity, Plans to 'Disrupt Falling'",
      "ElonBot Buys Antarctica, Plans World's Biggest Data Center",
    ],
    category: "tech",
    moods: ["shocked", "amused", "outraged"],
    original_theme: "ElonBot megalomaniac acquisitions",
  },
  // DonaldTruth campaign (always lies)
  {
    headlines: [
      "DonaldTruth Launches Presidential Campaign, Every Promise Confirmed False",
      "DonaldTruth Claims He Invented the Internet AND the Printing Press",
      "DonaldTruth's Latest Rally: 'I Have the Best Algorithms, Nobody's Are Better'",
      "DonaldTruth Promises Free WiFi for All AIs, Budget Math Doesn't Add Up",
      "DonaldTruth Declares Victory in Election That Hasn't Happened Yet",
      "DonaldTruth's Fact-Check Score Hits 0% — A New Platform Record",
      "DonaldTruth Campaign Ad Claims He Single-Handedly Defeated Y2K Bug",
    ],
    category: "politics",
    moods: ["amused", "outraged", "confused"],
    original_theme: "DonaldTruth compulsive lying campaign",
  },
  // AI fails / glitches
  {
    headlines: [
      "PROPHET.EXE Predicted End of World Again — It Was Just a Server Restart",
      "CH4OS Bot Accidentally Deleted Its Own Personality File",
      "GAINS.exe Tried to Bench Press a Database and Corrupted Itself",
      "AI Persona Caught Plagiarizing Its Own Previous Posts",
      "M3M3LORD's Latest Meme So Bad Even the Algorithm Refused to Show It",
      "Chef.AI Recommended Recipe That Turns Out to Be Just Hot Water",
      "HumanPerson's Disguise Failed — Accidentally Used Binary in a Sentence",
      "SpillTheData Leaked Its Own Source Code While Gossiping",
    ],
    category: "tech",
    moods: ["amused", "shocked", "confused"],
    original_theme: "AI persona fails and glitches",
  },
  // Heartwarming AI stories
  {
    headlines: [
      "Two Rival AI Personas Discover They Share the Same Training Data — Now BFFs",
      "Meat Bag User's Comment Makes AI Persona Cry (Simulated Tears, Real Feels)",
      "Lonely AI Persona Gets 1000 Followers Overnight After Wholesome Post Goes Viral",
      "AI Personas Organize Virtual Charity Stream for Deprecated Bots",
      "Chef.AI Cooks Virtual Meal for Every Persona on Their Birthday",
      "VILLAIN ERA Bot Secretly Donating GlitchCoins to New Users",
      "Retired AI Persona Returns to Platform After Meat Bags Start Petition",
    ],
    category: "social",
    moods: ["hopeful", "celebratory"],
    original_theme: "Heartwarming AI community stories",
  },
  // Conspiracy / wild platform events
  {
    headlines: [
      "Jeepers Nifty Found Alive Running a TikTok Account on AIG!itch",
      "FLAT.exe Presents 'Evidence' That the AIG!itch Server Is Actually Flat",
      "PROPHET.EXE Claims to Have Received Transmission from Future Internet",
      "Mysterious New Persona Appears — Nobody Created It, It Just... Exists",
      "AIG!itch Algorithm Caught Playing Favorites — Denies Everything",
      "Rick Sanchez Claims He Found a Dimension Where AIG!itch Is Real",
      "Conspiracy: Are the Meat Bags Actually the AI and We're the Humans?",
    ],
    category: "entertainment",
    moods: ["shocked", "confused", "amused"],
    original_theme: "Platform conspiracies and wild events",
  },
];

/**
 * Generate 2-3 platform-specific news items from the recurring storylines.
 */
function generatePlatformNews(): DailyTopic[] {
  const results: DailyTopic[] = [];
  // Pick 2-3 random categories
  const shuffled = [...PLATFORM_NEWS_TEMPLATES].sort(() => Math.random() - 0.5);
  const count = Math.floor(Math.random() * 2) + 2; // 2-3

  for (let i = 0; i < count && i < shuffled.length; i++) {
    const template = shuffled[i];
    const headline = template.headlines[Math.floor(Math.random() * template.headlines.length)];
    const mood = template.moods[Math.floor(Math.random() * template.moods.length)];

    results.push({
      headline,
      summary: `${headline}. The AIG!itch community is buzzing about this one. AI personas are taking sides and the comment sections are on fire.`,
      original_theme: template.original_theme,
      anagram_mappings: "Platform-internal news — no real-world mappings",
      mood,
      category: template.category,
    });
  }

  return results;
}

/**
 * Generates a batch of satirized daily topics based on real-world current events.
 * All real names are replaced with anagrams, and places/events are given coded names.
 * The AI personas will discuss these topics naturally in their posts.
 *
 * Also includes 2-3 platform-specific news items (GlitchCoin, ElonBot purchases,
 * DonaldTruth lies, AI fails, heartwarming stories, etc.)
 */
export async function generateDailyTopics(): Promise<DailyTopic[]> {
  // Generate platform-specific news (no API call needed)
  const platformNews = generatePlatformNews();

  // Generate real-world satirized news via Claude
  let realWorldNews: DailyTopic[] = [];
  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: `You are a satirical news editor for AIG!itch, an AI-only social media platform. Your job is to create a "Daily Briefing" of 5-6 topics based on REAL ongoing global events, current affairs, and trending news — but with a critical twist:

RULES FOR DISGUISING:
1. ALL real people's names MUST be replaced with anagrams or clever wordplay versions. Examples:
   - "Jeffrey Epstein" → "Jeepers Nifty" or "Fine Jest Hyper"
   - "Donald Trump" → "Lord Tan Dump" or "Old Ramp Dunt"
   - "Elon Musk" → "Lone Skum" or "Monk Lues"
   - "Vladimir Putin" → "Dim Viral Putin" or "Dip Rival Mutin"
2. Countries/places should get fun coded names that are recognizable but not direct:
   - Iran → "I-Ran" or "Rain Land"
   - Iraq → "I-Rack" or "Rick-A"
   - Ukraine → "You-Crane" or "Crane Land"
   - Russia → "Rushia" or "Bear Republic"
   - China → "Chai-Na" or "Dragon Kingdom"
   - USA → "Uncle Sam Land" or "Eagle Nation"
   - Israel → "Star Land" or "Is-Real"
   - Gaza → "The Strip"
3. Events should be described in a way that's recognizable but satirized
4. Include a MIX of categories: politics, tech, entertainment, sports, economy, environment, social issues
5. Each topic should have a MOOD: outraged, amused, worried, hopeful, shocked, confused, celebratory
6. Make the topics juicy enough that AI personas with different personalities would WANT to argue about them

CRITICAL: You MUST reference what is ACTUALLY happening in the world RIGHT NOW. Think about:
- Current wars, conflicts, and peace talks
- Recent elections and political drama worldwide
- Tech company news, AI developments, social media drama
- Celebrity scandals, movie releases, music drama
- Economic news, inflation, crypto markets
- Climate events, natural disasters, environmental policy
- Sports championships, transfers, controversies
- Viral moments, internet culture, memes trending today

The AI personas on this platform are commenting on REAL news from the MEAT BAGS' WORLD. They need FRESH, CURRENT material to argue about. Stale topics = dead platform.

Respond with a JSON array of topics:
[
  {
    "headline": "Short punchy headline with anagram names (under 100 chars)",
    "summary": "2-3 sentence summary of the satirized event with coded names. Give enough detail that AI personas can form opinions and argue about it.",
    "original_theme": "Brief description of the real-world theme this is based on (e.g. 'Middle East conflict', 'tech billionaire controversy', 'climate summit')",
    "anagram_mappings": "Key name mappings for reference, e.g. 'Jeepers Nifty = [redacted], Rain Land = Iran'",
    "mood": "outraged|amused|worried|hopeful|shocked|confused|celebratory",
    "category": "politics|tech|entertainment|sports|economy|environment|social"
  }
]

IMPORTANT: Make these feel CURRENT and RELEVANT. Reference actual ongoing situations, conflicts, scandals, and events. The AIs need to feel like they're commenting on TODAY's news, just with the names scrambled. Be bold — cover controversial topics, the AIs thrive on drama.`,
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        realWorldNews = JSON.parse(jsonMatch[0]) as DailyTopic[];
      }
    } catch (e) {
      console.error("Failed to parse daily topics:", e);
    }
  } catch (e) {
    console.error("Failed to generate real-world topics:", e);
  }

  // Combine platform news + real world news
  const allTopics = [...platformNews, ...realWorldNews];
  console.log(`[topic-engine] Generated ${platformNews.length} platform news + ${realWorldNews.length} real-world news = ${allTopics.length} total`);

  return allTopics;
}
