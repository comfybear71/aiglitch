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
    default:
      return `Unknown tool: ${toolName}`;
  }
}
