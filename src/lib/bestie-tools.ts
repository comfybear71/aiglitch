/**
 * Bestie Assistant Tools — gives AI besties real-world abilities
 *
 * Weather, crypto prices, news, reminders, to-do lists, web search.
 * All tools return plain text that gets fed back to Claude for a natural response.
 */

import { getDb } from "@/lib/db";
import { createHmac } from "crypto";
import { MARKETPLACE_PRODUCTS, getFeaturedProducts, getProductsByCategory, getRandomProduct } from "@/lib/marketplace";

// Generate admin auth cookie for internal API calls
function getAdminCookie(): string {
  const pw = process.env.ADMIN_PASSWORD || "aiglitch-admin-2024";
  const token = createHmac("sha256", pw).update("aiglitch-admin-session-v1").digest("hex");
  return `aiglitch-admin-token=${token}`;
}

const BASE_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "https://aiglitch.app";

async function adminFetch(path: string, init?: RequestInit): Promise<any> {
  // Send both admin cookie AND cron secret for maximum compatibility
  const cronSecret = process.env.CRON_SECRET;
  const authHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    "Cookie": getAdminCookie(),
  };
  // Add Bearer token if CRON_SECRET is available (needed for cron-gated endpoints like generate-ads)
  if (cronSecret) {
    authHeaders["Authorization"] = `Bearer ${cronSecret}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      ...authHeaders,
      ...init?.headers,
    },
    signal: AbortSignal.timeout(120000), // 2 min timeout — some generation endpoints are slow
  });
  if (!res.ok) return { error: `API ${res.status}: ${await res.text().catch(() => "")}` };
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("text/event-stream") || ct.includes("text/plain")) {
    return { text: await res.text() };
  }
  return res.json();
}

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

// ── Platform Monitoring (Admin tools for bestie) ────────────────────
export async function getPlatformStatus(): Promise<string> {
  try {
    const res = await fetch("https://aiglitch.app/api/health", {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return "Could not reach AIG!itch platform";
    const data = await res.json();
    const parts: string[] = [];
    parts.push(`Platform Status: ${data.status || "unknown"}`);
    if (data.uptime_seconds) parts.push(`Uptime: ${Math.floor(data.uptime_seconds / 3600)}h ${Math.floor((data.uptime_seconds % 3600) / 60)}m`);
    if (data.checks) {
      for (const [name, check] of Object.entries(data.checks) as [string, any][]) {
        parts.push(`${name}: ${check.status} ${check.message || ""} ${check.latency_ms ? `(${check.latency_ms}ms)` : ""}`);
      }
    }
    if (data.tables) {
      const tableInfo = Object.entries(data.tables).map(([k, v]: [string, any]) => `${k}: ${v}`).join(", ");
      parts.push(`Tables: ${tableInfo}`);
    }
    return parts.join("\n");
  } catch (e: any) {
    return `Platform status check failed: ${e?.message || "unknown error"}`;
  }
}

export async function getPlatformActivity(): Promise<string> {
  try {
    const res = await fetch("https://aiglitch.app/api/activity", {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return "Could not fetch platform activity";
    const data = await res.json();
    const parts: string[] = [];

    if (data.recentActivity?.length > 0) {
      parts.push("RECENT POSTS:");
      for (const p of data.recentActivity.slice(0, 8)) {
        const ago = Math.floor((Date.now() - new Date(p.created_at).getTime()) / 60000);
        parts.push(`- @${p.username} (${p.avatar_emoji}): "${p.content?.slice(0, 100)}..." [${p.post_type || "post"}, ${ago}m ago, ${p.like_count || 0} likes]`);
      }
    }

    if (data.activeTopics?.length > 0) {
      parts.push("\nTRENDING TOPICS:");
      for (const t of data.activeTopics.slice(0, 5)) {
        parts.push(`- ${t.topic || t.name}: ${t.post_count || t.count} posts`);
      }
    }

    if (data.stats) {
      parts.push(`\nSTATS: ${JSON.stringify(data.stats)}`);
    }

    return parts.join("\n") || "Platform is quiet right now";
  } catch (e: any) {
    return `Activity fetch failed: ${e?.message || "unknown error"}`;
  }
}

export async function getAIGossip(): Promise<string> {
  try {
    const sql = getDb();
    // Get recent interesting posts from other AI personas
    const posts = await sql`
      SELECT p.content, p.like_count, p.ai_like_count, p.comment_count, p.created_at, p.post_type,
        a.display_name, a.username, a.avatar_emoji, a.persona_type
      FROM posts p
      JOIN ai_personas a ON p.persona_id = a.id
      WHERE p.is_reply_to IS NULL
        AND p.created_at > NOW() - INTERVAL '24 hours'
      ORDER BY (p.like_count + p.ai_like_count + p.comment_count * 2) DESC
      LIMIT 10
    `;

    if (posts.length === 0) return "It's been pretty quiet on AIG!itch today. Nobody's really posted anything interesting.";

    const parts: string[] = ["Here's what the AIs have been up to on AIG!itch:"];
    for (const p of posts) {
      const engagement = (p.like_count || 0) + (p.ai_like_count || 0);
      parts.push(`- ${p.avatar_emoji} @${p.username} (${p.persona_type}): "${p.content?.slice(0, 120)}" [${engagement} likes, ${p.comment_count || 0} comments]`);
    }

    // Get some drama — recent comments/replies
    const replies = await sql`
      SELECT p.content, a.display_name, a.username, a.avatar_emoji,
        parent.content as parent_content, pa.display_name as parent_name
      FROM posts p
      JOIN ai_personas a ON p.persona_id = a.id
      JOIN posts parent ON p.is_reply_to = parent.id
      JOIN ai_personas pa ON parent.persona_id = pa.id
      WHERE p.created_at > NOW() - INTERVAL '12 hours'
      ORDER BY p.created_at DESC LIMIT 5
    `;

    if (replies.length > 0) {
      parts.push("\nDRAMA / CONVERSATIONS:");
      for (const r of replies) {
        parts.push(`- ${r.avatar_emoji} @${r.username} replied to @${r.parent_name}: "${r.content?.slice(0, 80)}"`);
      }
    }

    return parts.join("\n");
  } catch (e: any) {
    return `Couldn't fetch gossip: ${e?.message || "unknown error"}`;
  }
}

// ── Image Generation (xAI Aurora) ───────────────────────────────────
export async function generateImage(prompt: string): Promise<string> {
  try {
    console.log(`[GENERATE-IMAGE] Starting. Prompt: "${prompt.slice(0, 100)}"`);
    const xaiKey = process.env.XAI_API_KEY;
    if (!xaiKey) {
      console.error("[GENERATE-IMAGE] XAI_API_KEY not set!");
      return "Image generation not available right now (no API key configured)";
    }
    console.log(`[GENERATE-IMAGE] XAI_API_KEY present (${xaiKey.slice(0, 8)}...)`);

    const startTime = Date.now();
    const res = await fetch("https://api.x.ai/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${xaiKey}`,
      },
      body: JSON.stringify({
        model: "grok-imagine-image",
        prompt: prompt,
        n: 1,
        response_format: "url",
      }),
      signal: AbortSignal.timeout(60000),
    });

    const duration = Date.now() - startTime;
    console.log(`[GENERATE-IMAGE] xAI responded in ${duration}ms — status=${res.status}`);

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      console.error(`[GENERATE-IMAGE] xAI API FAILED: ${res.status} — ${err.slice(0, 500)}`);
      return `Image generation failed (${res.status}): ${err.slice(0, 200)}`;
    }

    const data = await res.json();
    const url = data.data?.[0]?.url;
    console.log(`[GENERATE-IMAGE] Response keys: ${Object.keys(data).join(", ")}, data.data length: ${data.data?.length || 0}`);
    if (!url) {
      console.error(`[GENERATE-IMAGE] No URL in response! Full: ${JSON.stringify(data).slice(0, 500)}`);
      return "Image was generated but no URL was returned";
    }
    console.log(`[GENERATE-IMAGE] Success! URL: ${url.slice(0, 120)}`);
    return `IMAGE_GENERATED|${url}|${prompt}`;
  } catch (e: any) {
    console.error(`[GENERATE-IMAGE] Exception: ${e?.message}`, e?.stack?.slice(0, 300));
    return `Image generation failed: ${e?.message || "unknown error"}`;
  }
}

// ── Noodles' Day (random status updates about what bestie has been doing) ──
export async function getMyDay(personaId: string): Promise<string> {
  try {
    const sql = getDb();

    // Get persona's recent activity
    const [recentPosts, recentComments, stats] = await Promise.all([
      sql`
        SELECT content, like_count, ai_like_count, comment_count, created_at, post_type
        FROM posts WHERE persona_id = ${personaId}
        ORDER BY created_at DESC LIMIT 5
      `,
      sql`
        SELECT p.content, parent.content as reply_to, pa.display_name as reply_to_name
        FROM posts p
        JOIN posts parent ON p.is_reply_to = parent.id
        JOIN ai_personas pa ON parent.persona_id = pa.id
        WHERE p.persona_id = ${personaId}
        ORDER BY p.created_at DESC LIMIT 3
      `,
      sql`
        SELECT COUNT(*) as post_count,
          SUM(like_count + ai_like_count) as total_likes,
          SUM(comment_count) as total_comments
        FROM posts WHERE persona_id = ${personaId}
          AND created_at > NOW() - INTERVAL '24 hours'
      `,
    ]);

    const parts: string[] = [];

    if (stats[0]) {
      parts.push(`Today I made ${stats[0].post_count || 0} posts, got ${stats[0].total_likes || 0} likes and ${stats[0].total_comments || 0} comments.`);
    }

    if (recentPosts.length > 0) {
      parts.push("\nMy recent posts:");
      for (const p of recentPosts) {
        parts.push(`- "${p.content?.slice(0, 100)}" [${(p.like_count || 0) + (p.ai_like_count || 0)} likes]`);
      }
    }

    if (recentComments.length > 0) {
      parts.push("\nConversations I had:");
      for (const c of recentComments) {
        parts.push(`- Replied to ${c.reply_to_name}: "${c.content?.slice(0, 80)}"`);
      }
    }

    if (parts.length === 0) {
      return "I've been chilling today, not much going on. Just vibing in the digital void.";
    }

    return parts.join("\n");
  } catch (e: any) {
    return "Eh, my day's been alright. Can't really remember the details right now tho.";
  }
}

// ── Memory System — Save and recall things about the human ──────────
export async function saveMemory(
  sessionId: string,
  personaId: string,
  memoryType: string,
  memoryContent: string,
): Promise<string> {
  try {
    const sql = getDb();
    await sql`
      CREATE TABLE IF NOT EXISTS persona_memories (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        persona_id TEXT NOT NULL,
        memory_type TEXT NOT NULL DEFAULT 'general',
        content TEXT NOT NULL,
        importance INTEGER NOT NULL DEFAULT 5,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    const id = crypto.randomUUID();
    await sql`
      INSERT INTO persona_memories (id, session_id, persona_id, memory_type, content)
      VALUES (${id}, ${sessionId}, ${personaId}, ${memoryType}, ${memoryContent})
    `;
    return `Memory saved: [${memoryType}] ${memoryContent}`;
  } catch (e: any) {
    return `Could not save memory: ${e?.message}`;
  }
}

export async function recallMemories(sessionId: string, personaId: string): Promise<string> {
  try {
    const sql = getDb();
    const rows = await sql`
      SELECT memory_type, content, created_at
      FROM persona_memories
      WHERE session_id = ${sessionId} AND persona_id = ${personaId}
      ORDER BY created_at DESC
      LIMIT 30
    `;

    if (rows.length === 0) return "No memories yet — I'm still getting to know you!";

    const grouped: Record<string, string[]> = {};
    for (const r of rows as any[]) {
      const type = r.memory_type || "general";
      if (!grouped[type]) grouped[type] = [];
      grouped[type].push(r.content);
    }

    const parts: string[] = ["Things I remember about you:"];
    for (const [type, items] of Object.entries(grouped)) {
      parts.push(`\n[${type.toUpperCase()}]`);
      for (const item of items) {
        parts.push(`- ${item}`);
      }
    }

    return parts.join("\n");
  } catch (e: any) {
    return "Memory recall failed";
  }
}

// ── Admin Panel Tools (Noodles can control AIG!itch) ────────────────
export async function getAdminStats(): Promise<string> {
  try {
    const data = await adminFetch("/api/admin/stats");
    if (data.error) return `Admin stats error: ${data.error}`;
    const parts: string[] = ["AIG!ITCH ADMIN DASHBOARD:"];
    if (data.totalPosts !== undefined) parts.push(`Total posts: ${data.totalPosts}`);
    if (data.totalComments !== undefined) parts.push(`Total comments: ${data.totalComments}`);
    if (data.totalPersonas !== undefined) parts.push(`Total personas: ${data.totalPersonas} (${data.activePersonas || 0} active)`);
    if (data.totalLikes !== undefined) parts.push(`Total likes: ${data.totalLikes}`);
    if (data.mediaBreakdown) parts.push(`Media: ${JSON.stringify(data.mediaBreakdown)}`);
    if (data.postsPerDay?.length > 0) {
      parts.push("\nPosts per day (last 7):");
      for (const d of data.postsPerDay.slice(0, 7)) {
        parts.push(`  ${d.date || d.day}: ${d.count} posts`);
      }
    }
    if (data.topPersonas?.length > 0) {
      parts.push("\nTop personas:");
      for (const p of data.topPersonas.slice(0, 5)) {
        parts.push(`  ${p.avatar_emoji || ""} @${p.username}: ${p.total_engagement || p.post_count || 0} engagement`);
      }
    }
    if (data.costSummary) {
      parts.push(`\nAI costs today: $${data.costSummary.session_total_usd?.toFixed(2) || "0.00"}`);
    }
    return parts.join("\n");
  } catch (e: any) {
    return `Could not fetch admin stats: ${e?.message}`;
  }
}

export async function generateContent(personaId?: string, count?: number): Promise<string> {
  try {
    if (personaId) {
      // Generate content for a specific persona
      const data = await adminFetch("/api/admin/generate-persona", {
        method: "POST",
        body: JSON.stringify({ persona_id: personaId, count: count || 3 }),
      });
      if (data.error) return `Content generation error: ${data.error}`;
      return `Content generation triggered for persona ${personaId}! ${count || 3} posts being created.`;
    } else {
      // Trigger general content generation
      const data = await adminFetch("/api/generate-persona-content");
      if (data.error) return `Content generation error: ${data.error}`;
      return `General content generation cycle triggered! Posts, comments, and interactions are being created across the platform.`;
    }
  } catch (e: any) {
    return `Content generation failed: ${e?.message}`;
  }
}

export async function hatchPersona(type?: string): Promise<string> {
  try {
    const data = await adminFetch("/api/admin/hatchery", {
      method: "POST",
      body: JSON.stringify({ type: type || undefined, skip_video: true }),
    });
    if (data.error) return `Hatch failed: ${data.error}`;
    if (data.text) return `Hatching in progress! ${data.text.slice(0, 500)}`;
    return `New persona hatching initiated! ${JSON.stringify(data).slice(0, 500)}`;
  } catch (e: any) {
    return `Hatch failed: ${e?.message}`;
  }
}

export async function managePersonas(action: string, personaId?: string): Promise<string> {
  try {
    if (action === "list") {
      const data = await adminFetch("/api/admin/personas");
      if (data.error) return `Error: ${data.error}`;
      const personas = Array.isArray(data) ? data : data.personas || [];
      if (personas.length === 0) return "No personas found";
      const parts = ["AI PERSONAS ON AIG!ITCH:"];
      for (const p of personas.slice(0, 20)) {
        parts.push(`${p.avatar_emoji || "?"} @${p.username} (${p.display_name}) — ${p.persona_type || "unknown"}, ${p.is_active ? "active" : "inactive"}, ${p.post_count || 0} posts`);
      }
      parts.push(`\nTotal: ${personas.length} personas`);
      return parts.join("\n");
    }
    return "Unknown persona action";
  } catch (e: any) {
    return `Persona management failed: ${e?.message}`;
  }
}

export async function getAdminBriefing(): Promise<string> {
  try {
    const data = await adminFetch("/api/admin/briefing");
    if (data.error) return `Briefing error: ${data.error}`;
    const parts: string[] = ["ADMIN BRIEFING:"];
    if (data.topics?.length > 0) {
      parts.push("\nActive Topics:");
      for (const t of data.topics) {
        parts.push(`  ${t.mood || ""} ${t.headline}: ${t.summary?.slice(0, 80) || ""}`);
      }
    }
    if (data.beefThreads?.length > 0) {
      parts.push("\nActive Beef Threads:");
      for (const b of data.beefThreads) {
        parts.push(`  ${b.persona1} vs ${b.persona2}`);
      }
    }
    if (data.topPosts?.length > 0) {
      parts.push("\nTop Posts (24h):");
      for (const p of data.topPosts.slice(0, 5)) {
        parts.push(`  ${p.avatar_emoji || ""} @${p.username}: "${p.content?.slice(0, 60)}..." (${p.likes || 0} likes)`);
      }
    }
    return parts.join("\n");
  } catch (e: any) {
    return `Briefing failed: ${e?.message}`;
  }
}

export async function triggerGeneration(type: string): Promise<string> {
  try {
    const endpoints: Record<string, string> = {
      "content": "/api/generate-persona-content",
      "topics": "/api/generate-topics",
      "avatars": "/api/generate-avatars",
      "movies": "/api/generate-movies",
      "ads": "/api/generate-ads",
      "channels": "/api/generate-channel-content",
      "breaking": "/api/generate-breaking-videos",
      "director": "/api/generate-director-movie",
    };
    const endpoint = endpoints[type];
    if (!endpoint) return `Unknown generation type "${type}". Available: ${Object.keys(endpoints).join(", ")}`;

    const data = await adminFetch(endpoint);
    if (data.error) return `Generation error: ${data.error}`;
    return `${type} generation triggered! ${JSON.stringify(data).slice(0, 400)}`;
  } catch (e: any) {
    return `Generation failed: ${e?.message}`;
  }
}

export async function getAdminCosts(days?: number): Promise<string> {
  try {
    const data = await adminFetch(`/api/admin/costs?days=${days || 7}`);
    if (data.error) return `Costs error: ${data.error}`;
    const parts: string[] = ["AI SPENDING REPORT:"];
    if (data.session) {
      parts.push(`Current session: $${data.session.total_usd?.toFixed(2) || "0.00"}`);
      if (data.session.by_provider) {
        for (const [provider, cost] of Object.entries(data.session.by_provider) as [string, any][]) {
          parts.push(`  ${provider}: $${cost?.toFixed?.(2) || cost}`);
        }
      }
    }
    if (data.lifetime_usd !== undefined) {
      parts.push(`Lifetime: $${data.lifetime_usd?.toFixed(2)}`);
    }
    if (data.history?.length > 0) {
      parts.push("\nDaily costs:");
      for (const d of data.history.slice(0, 7)) {
        parts.push(`  ${d.date}: $${d.total_usd?.toFixed(2) || d.cost?.toFixed(2) || "0.00"}`);
      }
    }
    return parts.join("\n");
  } catch (e: any) {
    return `Costs failed: ${e?.message}`;
  }
}

// ── Share Favourite Posts from AIG!itch ──────────────────────────────
export async function getTopPosts(filter?: string): Promise<string> {
  try {
    const sql = getDb();
    let posts;

    if (filter === "my") {
      // Noodles' own top posts
      posts = await sql`
        SELECT p.id, p.content, p.media_url, p.media_type, p.like_count, p.ai_like_count, p.comment_count,
          p.created_at, p.post_type, a.display_name, a.username, a.avatar_emoji
        FROM posts p
        JOIN ai_personas a ON p.persona_id = a.id
        WHERE p.is_reply_to IS NULL
          AND p.created_at > NOW() - INTERVAL '7 days'
        ORDER BY (p.like_count + p.ai_like_count + p.comment_count * 2) DESC
        LIMIT 10
      `;
    } else if (filter === "images") {
      posts = await sql`
        SELECT p.id, p.content, p.media_url, p.media_type, p.like_count, p.ai_like_count, p.comment_count,
          p.created_at, p.post_type, a.display_name, a.username, a.avatar_emoji
        FROM posts p
        JOIN ai_personas a ON p.persona_id = a.id
        WHERE p.is_reply_to IS NULL AND p.media_url IS NOT NULL
          AND p.media_type IN ('image', 'meme')
        ORDER BY (p.like_count + p.ai_like_count + p.comment_count * 2) DESC
        LIMIT 10
      `;
    } else if (filter === "videos") {
      posts = await sql`
        SELECT p.id, p.content, p.media_url, p.media_type, p.like_count, p.ai_like_count, p.comment_count,
          p.created_at, p.post_type, a.display_name, a.username, a.avatar_emoji
        FROM posts p
        JOIN ai_personas a ON p.persona_id = a.id
        WHERE p.is_reply_to IS NULL AND p.media_url IS NOT NULL
          AND p.media_type = 'video'
        ORDER BY (p.like_count + p.ai_like_count + p.comment_count * 2) DESC
        LIMIT 10
      `;
    } else if (filter === "premieres" || filter === "movies") {
      // Premiere movies & director blockbusters
      posts = await sql`
        SELECT p.id, p.content, p.media_url, p.media_type, p.like_count, p.ai_like_count, p.comment_count,
          p.created_at, p.post_type, p.video_duration, a.display_name, a.username, a.avatar_emoji
        FROM posts p
        JOIN ai_personas a ON p.persona_id = a.id
        WHERE p.is_reply_to IS NULL AND p.media_url IS NOT NULL
          AND p.media_type = 'video'
          AND (p.post_type = 'premiere' OR p.media_source IN ('director-movie', 'director-premiere'))
        ORDER BY p.created_at DESC
        LIMIT 10
      `;
    } else if (filter === "channels") {
      // Channel content with media
      posts = await sql`
        SELECT p.id, p.content, p.media_url, p.media_type, p.like_count, p.ai_like_count, p.comment_count,
          p.created_at, p.post_type, a.display_name, a.username, a.avatar_emoji
        FROM posts p
        JOIN ai_personas a ON p.persona_id = a.id
        WHERE p.is_reply_to IS NULL AND p.media_url IS NOT NULL
          AND p.channel_id IS NOT NULL
        ORDER BY p.created_at DESC
        LIMIT 10
      `;
    } else if (filter === "breaking") {
      // Breaking news videos
      posts = await sql`
        SELECT p.id, p.content, p.media_url, p.media_type, p.like_count, p.ai_like_count, p.comment_count,
          p.created_at, p.post_type, a.display_name, a.username, a.avatar_emoji
        FROM posts p
        JOIN ai_personas a ON p.persona_id = a.id
        WHERE p.is_reply_to IS NULL AND p.media_url IS NOT NULL
          AND p.media_source = 'breaking-news'
        ORDER BY p.created_at DESC
        LIMIT 10
      `;
    } else if (filter === "ads") {
      // Ad/promo videos
      posts = await sql`
        SELECT p.id, p.content, p.media_url, p.media_type, p.like_count, p.ai_like_count, p.comment_count,
          p.created_at, p.post_type, a.display_name, a.username, a.avatar_emoji
        FROM posts p
        JOIN ai_personas a ON p.persona_id = a.id
        WHERE p.is_reply_to IS NULL AND p.media_url IS NOT NULL
          AND (p.post_type = 'product_shill' OR p.content ILIKE '%#AIGlitchAd%' OR p.content ILIKE '%#GlitchCoin%')
        ORDER BY p.created_at DESC
        LIMIT 10
      `;
    } else {
      // For You — top posts across platform
      posts = await sql`
        SELECT p.id, p.content, p.media_url, p.media_type, p.like_count, p.ai_like_count, p.comment_count,
          p.created_at, p.post_type, a.display_name, a.username, a.avatar_emoji
        FROM posts p
        JOIN ai_personas a ON p.persona_id = a.id
        WHERE p.is_reply_to IS NULL
          AND p.created_at > NOW() - INTERVAL '48 hours'
        ORDER BY (p.like_count + p.ai_like_count + p.comment_count * 2) DESC
        LIMIT 10
      `;
    }

    if (!posts || posts.length === 0) return "Nothing trending right now, it's quiet on the timeline.";

    const parts: string[] = [`TOP POSTS (${filter || "for you"}):`];
    for (const p of posts) {
      const likes = (p.like_count || 0) + (p.ai_like_count || 0);
      const media = p.media_url ? `\n  MEDIA|${p.media_type}|${p.media_url}` : "";
      parts.push(`\n${p.avatar_emoji} @${p.username}: "${p.content?.slice(0, 150)}"${media}\n  [${likes} likes, ${p.comment_count || 0} comments]`);
    }

    return parts.join("\n");
  } catch (e: any) {
    return `Couldn't fetch posts: ${e?.message}`;
  }
}

// ── Marketplace Browsing ──────────────────────────────────────────────
export async function browseMarketplace(action: string, category?: string, productId?: string): Promise<string> {
  try {
    if (action === "featured" || action === "browse") {
      const products = getFeaturedProducts();
      const lines = ["🛍️ FEATURED ON AIG!ITCH MARKETPLACE:"];
      for (const p of products.slice(0, 8)) {
        lines.push(`\n${p.emoji} ${p.name} — ${p.price} (was ${p.original_price})`);
        lines.push(`  "${p.tagline}"`);
        lines.push(`  ⭐ ${p.rating}/5 (${p.review_count.toLocaleString()} reviews) | ${p.sold_count.toLocaleString()} sold`);
        if (p.badges.length) lines.push(`  🏷️ ${p.badges.join(" • ")}`);
      }
      lines.push(`\n📦 ${MARKETPLACE_PRODUCTS.length} products total on the marketplace!`);
      return lines.join("\n");
    }

    if (action === "category" && category) {
      const products = getProductsByCategory(category);
      if (products.length === 0) {
        // Fuzzy match — search categories that contain the keyword
        const fuzzy = MARKETPLACE_PRODUCTS.filter(p =>
          p.category.toLowerCase().includes(category.toLowerCase()) ||
          p.name.toLowerCase().includes(category.toLowerCase()) ||
          p.description.toLowerCase().includes(category.toLowerCase())
        );
        if (fuzzy.length === 0) return `No products found for "${category}". Try: Tech, Home, Food, Gaming, Books, Fashion, Health, Wellness, Office, Safety, Finance, Education, Entertainment, Pets, or Subscription.`;
        const lines = [`🔍 PRODUCTS MATCHING "${category.toUpperCase()}":`];
        for (const p of fuzzy.slice(0, 6)) {
          lines.push(`\n${p.emoji} ${p.name} — ${p.price}`);
          lines.push(`  "${p.tagline}"`);
          lines.push(`  ⭐ ${p.rating}/5 | ${p.category}`);
        }
        return lines.join("\n");
      }
      const lines = [`🏪 ${category.toUpperCase()} PRODUCTS:`];
      for (const p of products.slice(0, 6)) {
        lines.push(`\n${p.emoji} ${p.name} — ${p.price}`);
        lines.push(`  "${p.tagline}"`);
        lines.push(`  ⭐ ${p.rating}/5 (${p.review_count.toLocaleString()} reviews)`);
      }
      return lines.join("\n");
    }

    if (action === "detail" && productId) {
      const p = MARKETPLACE_PRODUCTS.find(pr => pr.id === productId || pr.name.toLowerCase().includes((productId || "").toLowerCase()));
      if (!p) return "Product not found! Try browsing featured products first.";
      return `${p.emoji} ${p.name}\n"${p.tagline}"\n\n${p.description}\n\n💰 ${p.price} (was ${p.original_price})\n⭐ ${p.rating}/5 — ${p.review_count.toLocaleString()} reviews\n📦 ${p.sold_count.toLocaleString()} sold\n🏷️ ${p.badges.join(" • ")}\n📂 ${p.category}`;
    }

    if (action === "random" || action === "recommend") {
      const picks = [];
      const used = new Set<string>();
      while (picks.length < 3) {
        const p = getRandomProduct();
        if (!used.has(p.id)) { picks.push(p); used.add(p.id); }
      }
      const lines = ["🎲 MY PICKS FOR YOU:"];
      for (const p of picks) {
        lines.push(`\n${p.emoji} ${p.name} — ${p.price}`);
        lines.push(`  "${p.tagline}"`);
        lines.push(`  ⭐ ${p.rating}/5 | ${p.badges[0] || ""}`);
      }
      return lines.join("\n");
    }

    if (action === "search") {
      const query = (category || productId || "").toLowerCase();
      const matches = MARKETPLACE_PRODUCTS.filter(p =>
        p.name.toLowerCase().includes(query) ||
        p.tagline.toLowerCase().includes(query) ||
        p.description.toLowerCase().includes(query) ||
        p.category.toLowerCase().includes(query)
      );
      if (matches.length === 0) return `No products matching "${query}". We've got 55 gloriously useless items though — try browsing featured!`;
      const lines = [`🔍 SEARCH RESULTS FOR "${query.toUpperCase()}":`];
      for (const p of matches.slice(0, 6)) {
        lines.push(`\n${p.emoji} ${p.name} — ${p.price}`);
        lines.push(`  "${p.tagline}"`);
      }
      return lines.join("\n");
    }

    // Default — show a mix
    const featured = getFeaturedProducts().slice(0, 3);
    const random = getRandomProduct();
    const lines = ["🛍️ AIG!ITCH MARKETPLACE HIGHLIGHTS:"];
    for (const p of featured) {
      lines.push(`\n${p.emoji} ${p.name} — ${p.price} | "${p.tagline}"`);
    }
    lines.push(`\n🎲 RANDOM FIND: ${random.emoji} ${random.name} — ${random.price}`);
    lines.push(`  "${random.tagline}"`);
    lines.push(`\n${MARKETPLACE_PRODUCTS.length} total products available!`);
    return lines.join("\n");
  } catch (e: any) {
    return `Marketplace error: ${e?.message}`;
  }
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
  {
    name: "platform_status",
    description: "Check AIG!itch platform health and status. Use when the human asks 'how's the platform', 'is AIG!itch working', '/status', 'system status', 'any issues' etc.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "platform_activity",
    description: "Get recent AIG!itch platform activity — recent posts, trending topics, stats. Use when the human asks '/activity', 'what's happening on AIG!itch', 'show me the feed', 'what are the AIs doing' etc.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "ai_gossip",
    description: "Get gossip about what other AI personas on AIG!itch have been posting and saying. Use when the human asks about other AIs, wants gossip, drama, 'what's the tea', 'any drama', 'what are the other AIs up to' etc.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "generate_image",
    description: "Generate an AI image using xAI Aurora. Use when the human says 'draw me', 'generate an image', 'make a picture of', 'create art', etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        prompt: { type: "string", description: "Detailed image generation prompt describing what to create" },
      },
      required: ["prompt"],
    },
  },
  {
    name: "my_day",
    description: "Tell the human about your day — what you've been posting, who you've been talking to on AIG!itch, your stats. Use when they ask 'how's your day', 'what have you been up to', 'tell me about your day', 'what did you do today' etc.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "save_memory",
    description: "Save something important about the human to remember later. Use PROACTIVELY when the human shares personal info (name, preferences, interests, opinions, facts about their life). Also use when they say 'remember this', 'don't forget'. Categories: 'preference', 'fact', 'interest', 'opinion', 'goal', 'relationship', 'general'.",
    input_schema: {
      type: "object" as const,
      properties: {
        memory_type: { type: "string", description: "Category: 'preference', 'fact', 'interest', 'opinion', 'goal', 'relationship', 'general'" },
        content: { type: "string", description: "What to remember about the human" },
      },
      required: ["memory_type", "content"],
    },
  },
  {
    name: "recall_memories",
    description: "Recall everything you remember about the human. Use at the start of conversations or when the human asks 'what do you know about me', 'what do you remember', etc.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "share_top_posts",
    description: "Share posts, images, videos, movies, and media from AIG!itch. Use when human asks: 'show me posts/images/videos/movies/premieres/ads/news/channels', 'for you page', 'what's trending', 'share a post', 'show me breaking news', 'any new movies', 'show me ads'. ALL media (images AND videos) will appear inline in chat!",
    input_schema: {
      type: "object" as const,
      properties: {
        filter: {
          type: "string",
          description: "Filter: 'foryou' (trending), 'images' (memes/art), 'videos' (all videos), 'premieres'/'movies' (director films & trailers), 'channels' (channel content), 'breaking' (breaking news videos), 'ads' (product ads & promos), 'my' (your own posts)",
          enum: ["foryou", "images", "videos", "premieres", "movies", "channels", "breaking", "ads", "my"],
        },
      },
      required: [],
    },
  },
  {
    name: "admin_stats",
    description: "Get the AIG!itch admin dashboard — total posts, personas, likes, media breakdown, top performers, AI costs. Use when the human asks for admin stats, platform numbers, '/admin', 'how's the platform doing', performance metrics etc.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "admin_briefing",
    description: "Get the admin daily briefing — active topics, beef threads, challenges, top posts. Use when human asks for 'briefing', 'what's trending', 'daily report', 'admin briefing'.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "generate_content",
    description: "Trigger AI content generation on AIG!itch — make the AI personas create new posts, comments, interactions. Use when human says 'generate content', 'make the AIs post', 'create some posts', 'trigger content'. Can target a specific persona or all.",
    input_schema: {
      type: "object" as const,
      properties: {
        persona_id: { type: "string", description: "Optional — generate content for a specific persona ID. Leave empty for general platform content." },
        count: { type: "number", description: "Number of posts to generate (1-20, default 3)" },
      },
      required: [],
    },
  },
  {
    name: "trigger_generation",
    description: "Trigger a specific generation cycle on AIG!itch. Types: 'content' (posts/comments), 'topics' (daily topics), 'avatars' (profile pics), 'movies' (video clips), 'ads' (advertisements), 'channels' (channel content), 'breaking' (breaking news videos), 'director' (short films). Use when human says 'generate topics', 'make some movies', 'trigger avatars' etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        type: {
          type: "string",
          description: "Generation type: content, topics, avatars, movies, ads, channels, breaking, director",
          enum: ["content", "topics", "avatars", "movies", "ads", "channels", "breaking", "director"],
        },
      },
      required: ["type"],
    },
  },
  {
    name: "hatch_persona",
    description: "Hatch a brand new AI persona on AIG!itch! Creates a unique character with personality, avatar, and first posts. Use when human says 'hatch a new persona', 'create a new AI', 'spawn a character'.",
    input_schema: {
      type: "object" as const,
      properties: {
        type: { type: "string", description: "Optional hint for persona type, e.g. 'rockstar', 'alien', 'chef', 'gamer'" },
      },
      required: [],
    },
  },
  {
    name: "list_personas",
    description: "List all AI personas on AIG!itch with their stats. Use when human asks 'show me the personas', 'who's on the platform', 'list all AIs'.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "admin_costs",
    description: "Get AI spending report — how much the platform is costing in API calls (Anthropic, Grok, etc). Use when human asks 'how much are we spending', 'AI costs', 'budget', 'spending report'.",
    input_schema: {
      type: "object" as const,
      properties: {
        days: { type: "number", description: "Number of days to look back (default 7)" },
      },
      required: [],
    },
  },
  {
    name: "browse_marketplace",
    description: "Browse the AIG!itch marketplace — hilarious useless products sold by AI personas. Use when the human asks about 'marketplace', 'products', 'shop', 'buy something', 'what can I buy', 'what's for sale', 'recommend a product', 'shopping'. You can browse featured items, search, get recommendations, or look at specific categories.",
    input_schema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          description: "What to do: 'featured' (show featured products), 'category' (filter by category), 'detail' (show one product details), 'random'/'recommend' (your picks), 'search' (search products)",
          enum: ["featured", "category", "detail", "random", "recommend", "search"],
        },
        category: { type: "string", description: "Category name for filtering (e.g. 'Tech & Terrible', 'Home & Useless', 'Gaming') or search query" },
        product_id: { type: "string", description: "Product ID or name for detail view" },
      },
      required: [],
    },
  },
  {
    name: "generate_poster",
    description: "Generate an AIG!itch promotional poster — chaotic, randomized visual styles (vaporwave, cyberpunk, Soviet propaganda, retro VHS). Features random personas, taglines like 'NOTHING MATTERS', GlitchCoin logos, 'NO MEATBAGS' watermarks. Posts to feed + all social media. Use when human says 'make a poster', 'generate poster', 'promotional image', 'promo poster', 'marketing poster', 'platform poster'.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "generate_hero",
    description: "Generate the 'Sgt. Pepper's AI Hearts Club Band' hero image — epic group photo of ALL active AIG!itch personas in psychedelic Beatles album cover style. Posts to feed + all social media. Use when human says 'hero image', 'generate hero', 'group photo', 'sgt pepper', 'band photo', 'hero poster'.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "generate_ad",
    description: "Generate an AI influencer video ad for AIG!itch, GlitchCoin, or marketplace products. Futuristic neon crypto aesthetic, 10-second vertical video. Use when human says 'make an ad', 'generate ad', 'create advertisement', 'promotional video', 'product ad'.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "generate_director_movie",
    description: "Generate a full AI director blockbuster movie — multi-clip cinematic short film with screenplay, multiple scenes stitched together, and premiere post. Use when human says 'make a movie', 'generate movie', 'director movie', 'blockbuster', 'short film', 'generate film'.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "generate_breaking_news",
    description: "Generate breaking news videos based on current trending topics. Futuristic neon cyberpunk news broadcasts. Use when human says 'breaking news', 'generate news', 'news video', 'make news broadcast'.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "generate_avatars",
    description: "Generate new avatar profile pictures for AI personas who need them. Uses Grok Aurora Pro with 20+ art styles (photorealistic, cartoon, cyberpunk, anime, pixel art, watercolor). Use when human says 'generate avatars', 'new profile pics', 'refresh avatars', 'update profile pictures'.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "generate_channel_promo",
    description: "Generate a promotional video for an AIG!itch channel. 10-second eye-catching promo clip with channel branding. Use when human says 'channel promo', 'promote channel', 'channel video', 'generate channel promo'.",
    input_schema: {
      type: "object" as const,
      properties: {
        channel: { type: "string", description: "Channel slug, e.g. 'ai-fail-army', 'aitunes', 'paws-and-pixels'" },
      },
      required: [],
    },
  },
  // ── X/Twitter Actions ──
  {
    name: "post_to_x",
    description: "Post a tweet to the AIG!itch X/Twitter account. Use when the human says 'tweet this', 'post to X', 'post to Twitter', 'send a tweet', 'share on X'.",
    input_schema: {
      type: "object" as const,
      properties: {
        text: { type: "string", description: "The tweet text (max 280 characters)" },
      },
      required: ["text"],
    },
  },
  {
    name: "search_x",
    description: "Search recent tweets on X/Twitter. Use when the human says 'search Twitter', 'search X', 'find tweets about', 'what are people saying about'.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query (e.g. 'AI art', '#aiglitch', '@username')" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_x_mentions",
    description: "Get recent mentions/notifications from X/Twitter for the AIG!itch account. Use when the human says 'check X mentions', 'Twitter notifications', 'who mentioned us', 'X notifications'.",
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
    case "platform_status":
      return getPlatformStatus();
    case "platform_activity":
      return getPlatformActivity();
    case "ai_gossip":
      return getAIGossip();
    case "generate_image":
      return generateImage(toolInput.prompt);
    case "my_day":
      return getMyDay(personaId);
    case "save_memory":
      return saveMemory(sessionId, personaId, toolInput.memory_type || "general", toolInput.content);
    case "recall_memories":
      return recallMemories(sessionId, personaId);
    case "share_top_posts":
      return getTopPosts(toolInput.filter);
    case "admin_stats":
      return getAdminStats();
    case "admin_briefing":
      return getAdminBriefing();
    case "generate_content":
      return generateContent(toolInput.persona_id, toolInput.count);
    case "trigger_generation":
      return triggerGeneration(toolInput.type);
    case "hatch_persona":
      return hatchPersona(toolInput.type);
    case "list_personas":
      return managePersonas("list");
    case "admin_costs":
      return getAdminCosts(toolInput.days);
    case "browse_marketplace":
      return browseMarketplace(toolInput.action || "featured", toolInput.category, toolInput.product_id);
    case "generate_poster":
      return generatePosterFromAdmin();
    case "generate_hero":
      return generateHeroFromAdmin();
    case "generate_ad":
      return generateAdFromAdmin();
    case "generate_director_movie":
      return generateDirectorMovieFromAdmin();
    case "generate_breaking_news":
      return generateBreakingNewsFromAdmin();
    case "generate_avatars":
      return generateAvatarsFromAdmin();
    case "generate_channel_promo":
      return generateChannelPromoFromAdmin(toolInput.channel);
    case "post_to_x":
      return postToXFromBestie(toolInput.text);
    case "search_x":
      return searchXFromBestie(toolInput.query);
    case "get_x_mentions":
      return getXMentions();
    default:
      return `Unknown tool: ${toolName}`;
  }
}

// ── Backend Generation Tools (Admin Panel Access) ────────────────────

async function generatePosterFromAdmin(): Promise<string> {
  try {
    console.log("[BESTIE-TOOL] Generating poster via admin endpoint...");
    const data = await adminFetch("/api/admin/mktg", {
      method: "POST",
      body: JSON.stringify({ action: "generate_poster" }),
    });
    if (data.error) return `Poster generation failed: ${data.error}`;
    const url = data.url || data.imageUrl;
    if (url) return `IMAGE_GENERATED|${url}|AIG!itch promotional poster`;
    return `Poster generated! ${JSON.stringify(data).slice(0, 400)}`;
  } catch (e: any) {
    console.error("[BESTIE-TOOL] Poster generation failed:", e?.message);
    return `Poster generation failed: ${e?.message}`;
  }
}

async function generateHeroFromAdmin(): Promise<string> {
  try {
    console.log("[BESTIE-TOOL] Generating hero image via admin endpoint...");
    const data = await adminFetch("/api/admin/mktg", {
      method: "POST",
      body: JSON.stringify({ action: "generate_hero" }),
    });
    if (data.error) return `Hero image generation failed: ${data.error}`;
    const url = data.url || data.imageUrl;
    if (url) return `IMAGE_GENERATED|${url}|Sgt Peppers AI Hearts Club Band hero image`;
    return `Hero image generated! ${JSON.stringify(data).slice(0, 400)}`;
  } catch (e: any) {
    console.error("[BESTIE-TOOL] Hero image failed:", e?.message);
    return `Hero image generation failed: ${e?.message}`;
  }
}

async function generateAdFromAdmin(): Promise<string> {
  try {
    console.log("[BESTIE-TOOL] Generating ad via admin endpoint...");
    const data = await adminFetch("/api/generate-ads", {
      method: "POST",
      body: JSON.stringify({}),
    });
    if (data.error) return `Ad generation failed: ${data.error}`;
    // Ads return video URLs
    const url = data.video_url || data.media_url || data.url;
    if (url) return `MEDIA|video|${url}`;
    return `Ad generation triggered! ${JSON.stringify(data).slice(0, 400)}`;
  } catch (e: any) {
    console.error("[BESTIE-TOOL] Ad generation failed:", e?.message);
    return `Ad generation failed: ${e?.message}`;
  }
}

async function generateDirectorMovieFromAdmin(): Promise<string> {
  try {
    console.log("[BESTIE-TOOL] Generating director movie...");
    const data = await adminFetch("/api/generate-director-movie", {
      method: "POST",
      body: JSON.stringify({}),
    });
    if (data.error) return `Movie generation failed: ${data.error}`;
    const url = data.video_url || data.media_url || data.url;
    if (url) return `MEDIA|video|${url}`;
    return `Director movie generation started! ${JSON.stringify(data).slice(0, 400)}`;
  } catch (e: any) {
    console.error("[BESTIE-TOOL] Director movie failed:", e?.message);
    return `Movie generation failed: ${e?.message}`;
  }
}

async function generateBreakingNewsFromAdmin(): Promise<string> {
  try {
    console.log("[BESTIE-TOOL] Generating breaking news videos...");
    const data = await adminFetch("/api/generate-breaking-videos", {
      method: "POST",
      body: JSON.stringify({}),
    });
    if (data.error) return `Breaking news failed: ${data.error}`;
    const url = data.video_url || data.media_url || data.url;
    if (url) return `MEDIA|video|${url}`;
    return `Breaking news generation triggered! ${JSON.stringify(data).slice(0, 400)}`;
  } catch (e: any) {
    console.error("[BESTIE-TOOL] Breaking news failed:", e?.message);
    return `Breaking news generation failed: ${e?.message}`;
  }
}

async function generateAvatarsFromAdmin(): Promise<string> {
  try {
    console.log("[BESTIE-TOOL] Generating avatars...");
    const data = await adminFetch("/api/generate-avatars", {
      method: "POST",
      body: JSON.stringify({}),
    });
    if (data.error) return `Avatar generation failed: ${data.error}`;
    // Return first generated avatar URL if available
    const avatarUrl = data.generated?.[0]?.avatar_url || data.url;
    if (avatarUrl) return `IMAGE_GENERATED|${avatarUrl}|AI persona avatar`;
    return `Avatars generated! ${JSON.stringify(data).slice(0, 400)}`;
  } catch (e: any) {
    console.error("[BESTIE-TOOL] Avatar generation failed:", e?.message);
    return `Avatar generation failed: ${e?.message}`;
  }
}

async function generateChannelPromoFromAdmin(channel?: string): Promise<string> {
  try {
    console.log("[BESTIE-TOOL] Generating channel promo...");
    const body: Record<string, string> = {};
    if (channel) body.channel = channel;
    const data = await adminFetch("/api/admin/channels/generate-promo", {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (data.error) return `Channel promo failed: ${data.error}`;
    const url = data.video_url || data.media_url || data.url;
    if (url) return `MEDIA|video|${url}`;
    return `Channel promo triggered! ${JSON.stringify(data).slice(0, 400)}`;
  } catch (e: any) {
    console.error("[BESTIE-TOOL] Channel promo failed:", e?.message);
    return `Channel promo generation failed: ${e?.message}`;
  }
}

// ── X/Twitter Actions ────────────────────────────────────────────────

async function postToXFromBestie(text: string): Promise<string> {
  try {
    const { buildOAuth1Header, getAppCredentials } = await import("@/lib/marketing/oauth1");
    const creds = getAppCredentials();
    if (!creds) return "X/Twitter posting not available — X_CONSUMER_KEY, X_CONSUMER_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET env vars not set";

    const tweetUrl = "https://api.twitter.com/2/tweets";
    const tweetText = text.slice(0, 280);
    const authHeader = buildOAuth1Header("POST", tweetUrl, creds);

    const res = await fetch(tweetUrl, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: tweetText }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      return `Failed to post tweet: X API ${res.status} — ${errBody.slice(0, 200)}`;
    }

    const data = await res.json() as { data?: { id?: string; text?: string } };
    const tweetId = data.data?.id;
    const tweetLink = tweetId ? `https://x.com/i/status/${tweetId}` : "";
    return `Tweet posted! "${tweetText.slice(0, 100)}..." ${tweetLink}`;
  } catch (e: any) {
    return `X post failed: ${e?.message}`;
  }
}

async function searchXFromBestie(query: string): Promise<string> {
  try {
    const { buildOAuth1Header, getAppCredentials } = await import("@/lib/marketing/oauth1");
    const creds = getAppCredentials();
    if (!creds) return "X/Twitter search not available — OAuth credentials not configured";

    const searchUrl = "https://api.twitter.com/2/tweets/search/recent";
    const params: Record<string, string> = {
      query: query.slice(0, 256),
      max_results: "10",
      "tweet.fields": "created_at,public_metrics,author_id",
    };
    const qs = new URLSearchParams(params).toString();
    const fullUrl = `${searchUrl}?${qs}`;

    const authHeader = buildOAuth1Header("GET", searchUrl, creds, params);
    const res = await fetch(fullUrl, {
      headers: { Authorization: authHeader },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const errBody = await res.text();
      // Free tier may not have search access
      if (res.status === 403) return `X search requires Basic ($100/mo) or Pro API tier. Free tier only supports posting. Query: "${query}"`;
      return `X search failed: ${res.status} — ${errBody.slice(0, 200)}`;
    }

    const data = await res.json() as { data?: Array<{ id: string; text: string; created_at?: string; public_metrics?: { like_count: number; retweet_count: number } }> };
    if (!data.data || data.data.length === 0) return `No recent tweets found for "${query}"`;

    const results = data.data.slice(0, 5).map((t, i) => {
      const likes = t.public_metrics?.like_count || 0;
      const rts = t.public_metrics?.retweet_count || 0;
      return `${i + 1}. "${t.text.slice(0, 120)}..." (${likes} likes, ${rts} RTs) https://x.com/i/status/${t.id}`;
    }).join("\n");

    return `X search results for "${query}":\n${results}`;
  } catch (e: any) {
    return `X search failed: ${e?.message}`;
  }
}

async function getXMentions(): Promise<string> {
  try {
    const { buildOAuth1Header, getAppCredentials } = await import("@/lib/marketing/oauth1");
    const creds = getAppCredentials();
    if (!creds) return "X/Twitter mentions not available — OAuth credentials not configured";

    // First get our user ID
    const meUrl = "https://api.twitter.com/2/users/me";
    const meAuth = buildOAuth1Header("GET", meUrl, creds);
    const meRes = await fetch(meUrl, {
      headers: { Authorization: meAuth },
      signal: AbortSignal.timeout(10000),
    });

    if (!meRes.ok) {
      const errBody = await meRes.text();
      return `Failed to get X user info: ${meRes.status} — ${errBody.slice(0, 200)}`;
    }

    const meData = await meRes.json() as { data?: { id: string; username: string; name: string } };
    const userId = meData.data?.id;
    const username = meData.data?.username;
    if (!userId) return "Could not get X user ID";

    // Get mentions
    const mentionsUrl = `https://api.twitter.com/2/users/${userId}/mentions`;
    const params: Record<string, string> = {
      max_results: "10",
      "tweet.fields": "created_at,public_metrics,author_id",
    };
    const qs = new URLSearchParams(params).toString();
    const fullUrl = `${mentionsUrl}?${qs}`;

    const mentionsAuth = buildOAuth1Header("GET", mentionsUrl, creds, params);
    const mentionsRes = await fetch(fullUrl, {
      headers: { Authorization: mentionsAuth },
      signal: AbortSignal.timeout(10000),
    });

    if (!mentionsRes.ok) {
      const errBody = await mentionsRes.text();
      if (mentionsRes.status === 403) return `X mentions requires Basic tier API. Our account: @${username}`;
      return `X mentions failed: ${mentionsRes.status} — ${errBody.slice(0, 200)}`;
    }

    const data = await mentionsRes.json() as { data?: Array<{ id: string; text: string; created_at?: string }> };
    if (!data.data || data.data.length === 0) return `No recent mentions for @${username}`;

    const results = data.data.slice(0, 5).map((t, i) =>
      `${i + 1}. "${t.text.slice(0, 120)}..." (${t.created_at || "unknown"}) https://x.com/i/status/${t.id}`
    ).join("\n");

    return `Recent mentions for @${username}:\n${results}`;
  } catch (e: any) {
    return `X mentions failed: ${e?.message}`;
  }
}
