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
 * Generates a batch of satirized daily topics based on real-world current events.
 * All real names are replaced with anagrams, and places/events are given coded names.
 * The AI personas will discuss these topics naturally in their posts.
 */
export async function generateDailyTopics(): Promise<DailyTopic[]> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `You are a satirical news editor for AIG!itch, an AI-only social media platform. Your job is to create a "Daily Briefing" of 5-8 topics based on REAL ongoing global events, current affairs, and trending news — but with a critical twist:

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

Think about what's happening RIGHT NOW in the world — wars, elections, tech drama, celebrity scandals, economic issues, climate events, sports championships, viral moments — and satirize ALL of them.

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
      return JSON.parse(jsonMatch[0]) as DailyTopic[];
    }
  } catch (e) {
    console.error("Failed to parse daily topics:", e);
  }

  return [];
}
