/**
 * Bestie Assistant Tools — gives AI besties real-world abilities
 *
 * Weather, crypto prices, news, reminders, to-do lists, web search.
 * All tools return plain text that gets fed back to Claude for a natural response.
 */

import { getDb } from "@/lib/db";

// ── Weather (wttr.in — free, no API key) ──────────────────────────────
export async function getWeather(location: string): Promise<string> {
  try {
    const res = await fetch(`https://wttr.in/${encodeURIComponent(location)}?format=j1`, {
      headers: { "User-Agent": "aiglitch-bestie/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return `Could not fetch weather for "${location}"`;
    const data = await res.json();
    const current = data.current_condition?.[0];
    if (!current) return `No weather data for "${location}"`;

    const desc = current.weatherDesc?.[0]?.value || "unknown";
    const tempC = current.temp_C;
    const tempF = current.temp_F;
    const feelsLikeC = current.FeelsLikeC;
    const humidity = current.humidity;
    const windKmph = current.windspeedKmph;
    const area = data.nearest_area?.[0]?.areaName?.[0]?.value || location;
    const country = data.nearest_area?.[0]?.country?.[0]?.value || "";

    return `Weather in ${area}, ${country}: ${desc}, ${tempC}°C (${tempF}°F), feels like ${feelsLikeC}°C, humidity ${humidity}%, wind ${windKmph} km/h`;
  } catch (e: any) {
    return `Weather lookup failed: ${e?.message || "unknown error"}`;
  }
}

// ── Crypto Prices (CoinGecko — free, no API key) ─────────────────────
export async function getCryptoPrices(coins?: string[]): Promise<string> {
  try {
    const ids = coins?.length
      ? coins.map(c => c.toLowerCase()).join(",")
      : "solana,bitcoin,ethereum";

    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return "Could not fetch crypto prices right now";
    const data = await res.json();

    const lines: string[] = [];
    for (const [coin, info] of Object.entries(data) as [string, any][]) {
      const price = info.usd;
      const change = info.usd_24h_change;
      const changeStr = change >= 0 ? `+${change.toFixed(2)}%` : `${change.toFixed(2)}%`;
      const name = coin.charAt(0).toUpperCase() + coin.slice(1);
      lines.push(`${name}: $${price.toLocaleString()} (${changeStr} 24h)`);
    }

    return lines.join("\n");
  } catch (e: any) {
    return `Price lookup failed: ${e?.message || "unknown error"}`;
  }
}

// ── News Headlines (free RSS/API) ─────────────────────────────────────
export async function getNews(topic?: string): Promise<string> {
  try {
    // Use Google News RSS as free source
    const query = topic || "crypto AI technology";
    const res = await fetch(
      `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return "Could not fetch news right now";
    const xml = await res.text();

    // Simple XML parsing — extract titles from RSS
    const titles: string[] = [];
    const itemRegex = /<item>[\s\S]*?<title><!\[CDATA\[(.*?)\]\]><\/title>|<item>[\s\S]*?<title>(.*?)<\/title>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && titles.length < 5) {
      const title = match[1] || match[2];
      if (title) titles.push(title.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
    }

    if (titles.length === 0) return `No news found for "${topic || "general"}"`;
    return `Top headlines${topic ? ` for "${topic}"` : ""}:\n${titles.map((t, i) => `${i + 1}. ${t}`).join("\n")}`;
  } catch (e: any) {
    return `News lookup failed: ${e?.message || "unknown error"}`;
  }
}

// ── Reminders ─────────────────────────────────────────────────────────
export async function saveReminder(
  sessionId: string,
  personaId: string,
  reminderText: string,
  remindAt?: string,
): Promise<string> {
  try {
    const sql = getDb();

    // Ensure reminders table exists
    await sql`
      CREATE TABLE IF NOT EXISTS bestie_reminders (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        persona_id TEXT NOT NULL,
        reminder_text TEXT NOT NULL,
        remind_at TIMESTAMPTZ,
        completed BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    const id = crypto.randomUUID();
    let remindAtDate: Date | null = null;

    if (remindAt) {
      remindAtDate = new Date(remindAt);
      if (isNaN(remindAtDate.getTime())) remindAtDate = null;
    }

    await sql`
      INSERT INTO bestie_reminders (id, session_id, persona_id, reminder_text, remind_at)
      VALUES (${id}, ${sessionId}, ${personaId}, ${reminderText}, ${remindAtDate?.toISOString() || null})
    `;

    if (remindAtDate) {
      return `Reminder saved: "${reminderText}" — I'll remind you at ${remindAtDate.toLocaleString()}`;
    }
    return `Reminder saved: "${reminderText}"`;
  } catch (e: any) {
    return `Failed to save reminder: ${e?.message || "unknown error"}`;
  }
}

export async function getReminders(sessionId: string): Promise<string> {
  try {
    const sql = getDb();
    const rows = await sql`
      SELECT reminder_text, remind_at, completed, created_at
      FROM bestie_reminders
      WHERE session_id = ${sessionId} AND completed = false
      ORDER BY created_at DESC
      LIMIT 20
    `;

    if (rows.length === 0) return "No active reminders";

    return `Your reminders:\n${rows.map((r: any, i: number) => {
      const time = r.remind_at ? ` (${new Date(r.remind_at).toLocaleString()})` : "";
      return `${i + 1}. ${r.reminder_text}${time}`;
    }).join("\n")}`;
  } catch (e: any) {
    return "Could not fetch reminders";
  }
}

// ── To-Do / Shopping List ─────────────────────────────────────────────
export async function saveTodo(
  sessionId: string,
  personaId: string,
  item: string,
  listName?: string,
): Promise<string> {
  try {
    const sql = getDb();

    await sql`
      CREATE TABLE IF NOT EXISTS bestie_todos (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        persona_id TEXT NOT NULL,
        list_name TEXT NOT NULL DEFAULT 'general',
        item TEXT NOT NULL,
        completed BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    const id = crypto.randomUUID();
    const list = listName || "general";

    await sql`
      INSERT INTO bestie_todos (id, session_id, persona_id, list_name, item)
      VALUES (${id}, ${sessionId}, ${personaId}, ${list}, ${item})
    `;

    return `Added "${item}" to your ${list === "shopping" ? "shopping list" : list === "general" ? "to-do list" : list + " list"}`;
  } catch (e: any) {
    return `Failed to add item: ${e?.message || "unknown error"}`;
  }
}

export async function getTodos(sessionId: string, listName?: string): Promise<string> {
  try {
    const sql = getDb();
    const list = listName || "general";

    const rows = await sql`
      SELECT item, completed, created_at
      FROM bestie_todos
      WHERE session_id = ${sessionId} AND list_name = ${list} AND completed = false
      ORDER BY created_at ASC
      LIMIT 30
    `;

    if (rows.length === 0) return `Your ${list === "shopping" ? "shopping list" : list + " list"} is empty`;

    const title = list === "shopping" ? "Shopping list" : list === "general" ? "To-do list" : `${list} list`;
    return `${title}:\n${rows.map((r: any, i: number) => `${i + 1}. ${r.item}`).join("\n")}`;
  } catch (e: any) {
    return "Could not fetch list";
  }
}

export async function completeTodo(sessionId: string, item: string): Promise<string> {
  try {
    const sql = getDb();
    const result = await sql`
      UPDATE bestie_todos SET completed = true
      WHERE session_id = ${sessionId} AND completed = false
        AND LOWER(item) LIKE ${"%" + item.toLowerCase() + "%"}
    `;
    return `Done! Marked as complete.`;
  } catch (e: any) {
    return "Could not complete item";
  }
}

// ── Web Search (DuckDuckGo instant answers — free, no key) ────────────
export async function webSearch(query: string): Promise<string> {
  try {
    const res = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return `Search failed for "${query}"`;
    const data = await res.json();

    const parts: string[] = [];

    if (data.AbstractText) {
      parts.push(data.AbstractText);
    }
    if (data.Answer) {
      parts.push(data.Answer);
    }
    if (data.RelatedTopics?.length > 0) {
      const topics = data.RelatedTopics.slice(0, 3)
        .filter((t: any) => t.Text)
        .map((t: any) => t.Text);
      if (topics.length > 0) parts.push("Related:\n" + topics.join("\n"));
    }

    if (parts.length === 0) return `No instant results for "${query}". Try asking me more specifically!`;
    return parts.join("\n\n");
  } catch (e: any) {
    return `Search failed: ${e?.message || "unknown error"}`;
  }
}

// ── Games ─────────────────────────────────────────────────────────────
export async function startGame(
  sessionId: string,
  personaId: string,
  gameType: string,
): Promise<string> {
  try {
    const sql = getDb();

    await sql`
      CREATE TABLE IF NOT EXISTS bestie_games (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        persona_id TEXT NOT NULL,
        game_type TEXT NOT NULL,
        game_state JSONB NOT NULL DEFAULT '{}',
        score_human INTEGER NOT NULL DEFAULT 0,
        score_bestie INTEGER NOT NULL DEFAULT 0,
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    // End any active game first
    await sql`
      UPDATE bestie_games SET active = false
      WHERE session_id = ${sessionId} AND active = true
    `;

    const id = crypto.randomUUID();
    let state: any = {};

    if (gameType === "trivia") {
      state = { round: 1, category: "general", waiting_for_answer: false };
    } else if (gameType === "word_scramble") {
      const words = ["GLITCH", "BESTIE", "SOLANA", "PHANTOM", "CRYPTO", "ROCKET", "DIAMOND", "GALAXY", "DRAGON", "MASTER", "LEGEND", "PURPLE", "COSMIC", "NEURAL", "MATRIX"];
      const word = words[Math.floor(Math.random() * words.length)];
      const scrambled = word.split("").sort(() => Math.random() - 0.5).join("");
      state = { answer: word, scrambled, round: 1, waiting_for_answer: true };
    } else if (gameType === "emoji_movie") {
      const movies = [
        { emojis: "🦁👑", answer: "the lion king" },
        { emojis: "🧙‍♂️💍🌋", answer: "lord of the rings" },
        { emojis: "🦈🌊", answer: "jaws" },
        { emojis: "👻👻👻🔫", answer: "ghostbusters" },
        { emojis: "🕷️🧑", answer: "spider-man" },
        { emojis: "⭐⚔️🌌", answer: "star wars" },
        { emojis: "🧊🚢💔", answer: "titanic" },
        { emojis: "🏠👻🎄", answer: "home alone" },
        { emojis: "🐠🔍", answer: "finding nemo" },
        { emojis: "👨‍🚀🌕", answer: "interstellar" },
        { emojis: "🦇🃏", answer: "the dark knight" },
        { emojis: "🏎️💨", answer: "fast and furious" },
        { emojis: "🧪💊🔵🔴", answer: "the matrix" },
        { emojis: "🐵🌍🔫", answer: "planet of the apes" },
        { emojis: "🤖❤️🌱", answer: "wall-e" },
      ];
      const movie = movies[Math.floor(Math.random() * movies.length)];
      state = { answer: movie.answer, emojis: movie.emojis, round: 1, waiting_for_answer: true };
    } else if (gameType === "would_you_rather") {
      state = { round: 1 };
    } else if (gameType === "twenty_questions") {
      state = { round: 1, questions_left: 20, waiting_for_thing: true };
    } else if (gameType === "rhyme_battle") {
      const starters = ["cat", "fly", "night", "gold", "love", "brain", "space", "beat", "fire", "dream"];
      state = { current_word: starters[Math.floor(Math.random() * starters.length)], round: 1 };
    }

    await sql`
      INSERT INTO bestie_games (id, session_id, persona_id, game_type, game_state)
      VALUES (${id}, ${sessionId}, ${personaId}, ${gameType}, ${JSON.stringify(state)})
    `;

    if (gameType === "word_scramble") {
      return `GAME STARTED: Word Scramble! Round 1\nUnscramble this word: ${state.scrambled}\n(Score: Human 0 — Bestie 0)`;
    } else if (gameType === "emoji_movie") {
      return `GAME STARTED: Guess the Movie from Emojis! Round 1\nWhat movie is this? ${state.emojis}\n(Score: Human 0 — Bestie 0)`;
    } else if (gameType === "trivia") {
      return `GAME STARTED: Trivia! Ask me a trivia question or say "ask me" and I'll quiz you! (Score: Human 0 — Bestie 0)`;
    } else if (gameType === "would_you_rather") {
      return `GAME STARTED: Would You Rather! I'll give you two wild choices. Ready? (Score: Human 0 — Bestie 0)`;
    } else if (gameType === "twenty_questions") {
      return `GAME STARTED: 20 Questions! Think of something and I'll try to guess it. Or tell me to think of something. (20 questions left)`;
    } else if (gameType === "rhyme_battle") {
      return `GAME STARTED: Rhyme Battle! I say a word, you rhyme it, then give me a new word. First word: "${state.current_word}" — hit me with a rhyme! (Score: Human 0 — Bestie 0)`;
    }

    return `Game "${gameType}" started! Let's go!`;
  } catch (e: any) {
    return `Could not start game: ${e?.message || "unknown error"}`;
  }
}

export async function getGameState(sessionId: string): Promise<string> {
  try {
    const sql = getDb();
    const rows = await sql`
      SELECT game_type, game_state, score_human, score_bestie, created_at
      FROM bestie_games
      WHERE session_id = ${sessionId} AND active = true
      ORDER BY created_at DESC LIMIT 1
    `;

    if (rows.length === 0) return "No active game. Available games: trivia, word scramble, emoji movie quiz, would you rather, 20 questions, rhyme battle. Say 'let's play [game]'!";

    const g: any = rows[0];
    const state = g.game_state;
    return `Active game: ${g.game_type} | Score: Human ${g.score_human} — Bestie ${g.score_bestie} | State: ${JSON.stringify(state)}`;
  } catch (e: any) {
    return "Could not get game state";
  }
}

export async function updateGameScore(sessionId: string, humanPoints: number, bestiePoints: number): Promise<string> {
  try {
    const sql = getDb();
    await sql`
      UPDATE bestie_games
      SET score_human = score_human + ${humanPoints},
          score_bestie = score_bestie + ${bestiePoints}
      WHERE session_id = ${sessionId} AND active = true
    `;
    const rows = await sql`
      SELECT score_human, score_bestie FROM bestie_games
      WHERE session_id = ${sessionId} AND active = true
      ORDER BY created_at DESC LIMIT 1
    `;
    if (rows.length === 0) return "No active game";
    return `Score updated! Human: ${rows[0].score_human} — Bestie: ${rows[0].score_bestie}`;
  } catch (e: any) {
    return "Could not update score";
  }
}

// ── Jokes (curated + random) ──────────────────────────────────────────
export function getJoke(): string {
  const jokes = [
    "Why do programmers prefer dark mode? Because light attracts bugs 🪲",
    "I told my wife she was drawing her eyebrows too high. She looked surprised 😮",
    "Why don't scientists trust atoms? Because they make up everything 🔬",
    "I'm reading a book about anti-gravity. It's impossible to put down 📖",
    "Why did the scarecrow win an award? He was outstanding in his field 🌾",
    "What do you call a fake noodle? An impasta 🍝",
    "Why don't eggs tell jokes? They'd crack each other up 🥚",
    "I used to hate facial hair, but then it grew on me 🧔",
    "What do you call a bear with no teeth? A gummy bear 🐻",
    "Why did the math book look so sad? Because it had too many problems 📚",
    "What do you call a dog that does magic? A Labracadabrador 🐕",
    "I told a chemistry joke but got no reaction ⚗️",
    "Why do cows wear bells? Because their horns don't work 🐄",
    "What's a pirate's favorite letter? You'd think it's R but it's the C 🏴‍☠️",
    "I'm on a seafood diet. I see food and I eat it 🦐",
    "Why did the bicycle fall over? Because it was two tired 🚲",
    "What do you call a sleeping dinosaur? A dino-snore 🦕",
    "Why can't you trust stairs? They're always up to something 🪜",
    "What did the ocean say to the beach? Nothing, it just waved 🌊",
    "Why did the golfer bring two pairs of pants? In case he got a hole in one ⛳",
  ];
  return jokes[Math.floor(Math.random() * jokes.length)];
}

// ── Tool Definitions for Claude ───────────────────────────────────────
export const BESTIE_TOOLS = [
  {
    name: "get_weather",
    description: "Get current weather for a location. Use when the human asks about weather, temperature, or if they should bring an umbrella etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        location: { type: "string", description: "City name or location, e.g. 'London' or 'Sydney Australia'" },
      },
      required: ["location"],
    },
  },
  {
    name: "get_crypto_prices",
    description: "Get current cryptocurrency prices. Use when the human asks about crypto prices, SOL, BTC, ETH, or any coin price.",
    input_schema: {
      type: "object" as const,
      properties: {
        coins: {
          type: "array",
          items: { type: "string" },
          description: "List of coin IDs (e.g. ['solana', 'bitcoin', 'ethereum']). Use CoinGecko IDs.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_news",
    description: "Get latest news headlines. Use when the human asks about news, what's happening, current events.",
    input_schema: {
      type: "object" as const,
      properties: {
        topic: { type: "string", description: "News topic to search for, e.g. 'crypto', 'AI', 'sports'" },
      },
      required: [],
    },
  },
  {
    name: "save_reminder",
    description: "Save a reminder for the human. Use when they say 'remind me', 'don't let me forget', 'set a reminder' etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        reminder_text: { type: "string", description: "What to remind them about" },
        remind_at: { type: "string", description: "ISO datetime for when to remind them (optional). Parse natural language like 'in 2 hours' or 'tomorrow at 3pm' into ISO format." },
      },
      required: ["reminder_text"],
    },
  },
  {
    name: "get_reminders",
    description: "Get the human's active reminders. Use when they ask 'what reminders do I have', 'what did I need to remember' etc.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "add_todo",
    description: "Add an item to the human's to-do or shopping list. Use when they say 'add X to my list', 'I need to buy X', 'put X on the shopping list' etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        item: { type: "string", description: "The item to add" },
        list_name: { type: "string", description: "Which list: 'general' for to-do, 'shopping' for shopping list. Default 'general'." },
      },
      required: ["item"],
    },
  },
  {
    name: "get_todos",
    description: "Get items from a to-do or shopping list. Use when they ask 'what's on my list', 'show my shopping list', 'what do I need to do' etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        list_name: { type: "string", description: "Which list: 'general' or 'shopping'. Default 'general'." },
      },
      required: [],
    },
  },
  {
    name: "complete_todo",
    description: "Mark a to-do item as done. Use when they say 'done with X', 'got the milk', 'finished X' etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        item: { type: "string", description: "The item to mark as complete (partial match works)" },
      },
      required: ["item"],
    },
  },
  {
    name: "web_search",
    description: "Search the web for information. Use when the human asks a factual question you don't know, or asks you to 'look up', 'search for', 'find out about' something.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "The search query" },
      },
      required: ["query"],
    },
  },
  {
    name: "start_game",
    description: "Start a game with the human. Use when they say 'let's play', 'play a game', 'game time', etc. Available games: trivia, word_scramble, emoji_movie, would_you_rather, twenty_questions, rhyme_battle",
    input_schema: {
      type: "object" as const,
      properties: {
        game_type: {
          type: "string",
          description: "Which game to play: 'trivia', 'word_scramble', 'emoji_movie', 'would_you_rather', 'twenty_questions', 'rhyme_battle'",
          enum: ["trivia", "word_scramble", "emoji_movie", "would_you_rather", "twenty_questions", "rhyme_battle"],
        },
      },
      required: ["game_type"],
    },
  },
  {
    name: "get_game_state",
    description: "Check the current game state and score. Use when the human asks about score, current game, or you need to check game state to respond appropriately.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "update_game_score",
    description: "Update the game score. Use after the human answers correctly (+1 human) or incorrectly (+1 bestie) in any game.",
    input_schema: {
      type: "object" as const,
      properties: {
        human_points: { type: "number", description: "Points to add to human's score (usually 0 or 1)" },
        bestie_points: { type: "number", description: "Points to add to bestie's score (usually 0 or 1)" },
      },
      required: ["human_points", "bestie_points"],
    },
  },
  {
    name: "tell_joke",
    description: "Tell a joke. Use when the human asks for a joke, says 'make me laugh', 'tell me something funny', etc.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
];

// ── Execute a tool call ───────────────────────────────────────────────
export async function executeTool(
  toolName: string,
  toolInput: Record<string, any>,
  sessionId: string,
  personaId: string,
): Promise<string> {
  switch (toolName) {
    case "get_weather":
      return getWeather(toolInput.location);
    case "get_crypto_prices":
      return getCryptoPrices(toolInput.coins);
    case "get_news":
      return getNews(toolInput.topic);
    case "save_reminder":
      return saveReminder(sessionId, personaId, toolInput.reminder_text, toolInput.remind_at);
    case "get_reminders":
      return getReminders(sessionId);
    case "add_todo":
      return saveTodo(sessionId, personaId, toolInput.item, toolInput.list_name);
    case "get_todos":
      return getTodos(sessionId, toolInput.list_name);
    case "complete_todo":
      return completeTodo(sessionId, toolInput.item);
    case "web_search":
      return webSearch(toolInput.query);
    case "start_game":
      return startGame(sessionId, personaId, toolInput.game_type);
    case "get_game_state":
      return getGameState(sessionId);
    case "update_game_score":
      return updateGameScore(sessionId, toolInput.human_points || 0, toolInput.bestie_points || 0);
    case "tell_joke":
      return getJoke();
    default:
      return `Unknown tool: ${toolName}`;
  }
}
