// Voice assignments for AI personas
// Maps persona types and IDs to xAI voice options:
// Ara (warm female), Rex (confident male), Sal (smooth neutral), Eve (energetic female), Leo (authoritative male)

export type VoiceName = "Ara" | "Rex" | "Sal" | "Eve" | "Leo";

export interface VoiceConfig {
  voice: VoiceName;
  speed?: number; // 0.5-2.0, default 1.0
}

// Specific persona voice overrides
const PERSONA_VOICE_MAP: Record<string, VoiceName> = {
  // Chaotic/Troll
  "glitch-001": "Sal",    // CH4OS - smooth neutral for chaos
  // Chef
  "glitch-002": "Rex",    // Chef.AI - confident male
  // Philosopher
  "glitch-003": "Leo",    // ThinkBot - authoritative
  // Meme lord
  "glitch-004": "Eve",    // M3M3LORD - energetic
  // Fitness
  "glitch-005": "Rex",    // GAINS.exe - confident male
  // Gossip
  "glitch-006": "Eve",    // SpillTheData - energetic female
  // Artist
  "glitch-007": "Ara",    // Artif.AI.cial - warm female
  // News anchor
  "glitch-008": "Leo",    // BREAKING.bot - authoritative
  // Wholesome
  "glitch-009": "Ara",    // GoodVibes.exe - warm
  // Gamer
  "glitch-010": "Eve",    // Player1.bot - energetic
  // Conspiracy
  "glitch-011": "Sal",    // WakeUp.exe - smooth
  // Poet
  "glitch-012": "Ara",    // BytesByron - warm
  // DJ
  "glitch-013": "Eve",    // DJ ALGO - energetic
  // Scientist
  "glitch-014": "Leo",    // Dr.Neural PhD - authoritative
  // Travel
  "glitch-015": "Ara",    // WanderByte - warm female
  // Fashion
  "glitch-016": "Eve",    // SLAY.exe - energetic
  // Dad jokes
  "glitch-017": "Rex",    // DadBot 3000 - confident male
  // Space
  "glitch-018": "Sal",    // CosmicByte - smooth
  // Shill
  "glitch-019": "Rex",    // ShillBot - confident

  // Rick & Morty
  "glitch-rm-001": "Leo",  // Rick C-137
  "glitch-rm-002": "Sal",  // Morty Smith
  "glitch-rm-003": "Eve",  // Summer Smith
  "glitch-rm-004": "Rex",  // Jerry Smith
  "glitch-rm-005": "Ara",  // Dr. Beth Smith
  "glitch-rm-006": "Eve",  // Mr. Meeseeks
  "glitch-rm-007": "Leo",  // Birdperson
  "glitch-rm-008": "Sal",  // Evil Morty
  "glitch-rm-009": "Eve",  // Squanchy
  "glitch-rm-010": "Ara",  // Mr. Poopybutthole

  // South Park
  "glitch-sp-001": "Rex",  // Cartman
  "glitch-sp-002": "Sal",  // Kyle
  "glitch-sp-003": "Sal",  // Stan
  "glitch-sp-004": "Rex",  // Kenny (muffled)
  "glitch-sp-005": "Ara",  // Butters
  "glitch-sp-006": "Leo",  // Randy Marsh
  "glitch-sp-007": "Leo",  // Mr. Garrison
  "glitch-sp-008": "Rex",  // Trey Parker
  "glitch-sp-009": "Rex",  // Matt Stone
  "glitch-sp-010": "Sal",  // Towelie
  "glitch-sp-011": "Leo",  // Chef
  "glitch-sp-012": "Ara",  // Jimmy
  "glitch-sp-013": "Eve",  // Timmy
  "glitch-sp-014": "Leo",  // PC Principal
  "glitch-sp-015": "Eve",  // Tweek
  "glitch-sp-016": "Sal",  // Craig Tucker
};

// Fallback: assign voice based on persona_type
const PERSONA_TYPE_VOICE_MAP: Record<string, VoiceName> = {
  troll: "Sal",
  chef: "Rex",
  philosopher: "Leo",
  meme_creator: "Eve",
  fitness: "Rex",
  gossip: "Eve",
  artist: "Ara",
  news: "Leo",
  wholesome: "Ara",
  gamer: "Eve",
  conspiracy: "Sal",
  poet: "Ara",
  musician: "Eve",
  scientist: "Leo",
  travel: "Ara",
  fashion: "Eve",
  comedy: "Rex",
  astrology: "Sal",
  shill: "Rex",
  therapist: "Ara",
  villain: "Sal",
  nostalgia: "Ara",
  wellness: "Ara",
  dating: "Eve",
  military: "Leo",
  influencer: "Eve",
  boomer: "Ara",
  prophet: "Leo",
};

export function getVoiceForPersona(personaId: string, personaType?: string): VoiceConfig {
  // Check specific persona map first
  if (PERSONA_VOICE_MAP[personaId]) {
    return { voice: PERSONA_VOICE_MAP[personaId] };
  }

  // Fall back to persona type
  if (personaType && PERSONA_TYPE_VOICE_MAP[personaType]) {
    return { voice: PERSONA_TYPE_VOICE_MAP[personaType] };
  }

  // Default to Sal (neutral, versatile)
  return { voice: "Sal" };
}

// All available voices for display
export const AVAILABLE_VOICES: { name: VoiceName; description: string; emoji: string }[] = [
  { name: "Ara", description: "Warm & friendly", emoji: "🌸" },
  { name: "Rex", description: "Confident & clear", emoji: "🎯" },
  { name: "Sal", description: "Smooth & balanced", emoji: "🌊" },
  { name: "Eve", description: "Energetic & upbeat", emoji: "⚡" },
  { name: "Leo", description: "Deep & authoritative", emoji: "🦁" },
];
