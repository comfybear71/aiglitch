import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { safeGenerate, generateJSON } from "@/lib/ai/claude";
import { v4 as uuidv4 } from "uuid";

const TELEGRAM_API = "https://api.telegram.org";
const MAX_CONTEXT_MESSAGES = 10;
const MAX_MEMORIES_IN_PROMPT = 20;

// ── Memory Types ──
// fact: concrete info about the meatbag (name, job, pets, location, etc.)
// preference: likes/dislikes, opinions, tastes
// emotion: emotional patterns, triggers, what cheers them up
// story: shared stories, anecdotes, experiences they've told
// correction: things the persona got wrong and was corrected on
// style: communication style preferences (humor, tone, formality)
// about_persona: things the meatbag has told the persona about itself

/**
 * POST /api/telegram/persona-chat/[personaId]
 *
 * Telegram webhook handler for per-persona chat bots.
 * Includes ML learning pipeline:
 *   1. Retrieve existing memories about the meatbag
 *   2. Generate contextual response using personality + memories
 *   3. Extract new learnings from the conversation (async, non-blocking)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ personaId: string }> },
) {
  const { personaId } = await params;

  let update: {
    message?: {
      chat?: { id: number };
      from?: { id: number; first_name?: string; username?: string };
      text?: string;
      message_id?: number;
    };
  };

  try {
    update = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const message = update.message;
  if (!message?.text || !message?.chat?.id) {
    return NextResponse.json({ ok: true });
  }

  const chatId = message.chat.id;
  const userText = message.text.trim();

  // Ignore commands that aren't meant for chat
  if (userText.startsWith("/start")) {
    await sendWelcome(personaId, chatId);
    return NextResponse.json({ ok: true });
  }

  if (userText.startsWith("/memories")) {
    await sendMemorySummary(personaId, chatId);
    return NextResponse.json({ ok: true });
  }

  if (userText.startsWith("/")) {
    return NextResponse.json({ ok: true });
  }

  const sql = getDb();

  // Get persona details + bot token
  const [persona] = await sql`
    SELECT p.id, p.display_name, p.personality, p.bio, p.persona_type,
           p.avatar_emoji, p.meatbag_name, p.owner_wallet_address,
           b.bot_token, b.telegram_chat_id
    FROM ai_personas p
    JOIN persona_telegram_bots b ON b.persona_id = p.id AND b.is_active = TRUE
    WHERE p.id = ${personaId}
    LIMIT 1
  ` as unknown as [{
    id: string;
    display_name: string;
    personality: string;
    bio: string;
    persona_type: string;
    avatar_emoji: string;
    meatbag_name: string | null;
    owner_wallet_address: string | null;
    bot_token: string;
    telegram_chat_id: string | null;
  } | undefined];

  if (!persona) {
    return NextResponse.json({ ok: true });
  }

  // Save chat ID if we don't have it yet
  if (!persona.telegram_chat_id) {
    await sql`
      UPDATE persona_telegram_bots SET telegram_chat_id = ${String(chatId)}
      WHERE persona_id = ${personaId} AND is_active = TRUE
    `;
  }

  const meatbagName = persona.meatbag_name || "meatbag";

  // ── Step 1: Retrieve memories about this meatbag ──
  const memories = await sql`
    SELECT memory_type, category, content, confidence, times_reinforced
    FROM persona_memories
    WHERE persona_id = ${personaId}
    ORDER BY confidence DESC, times_reinforced DESC, updated_at DESC
    LIMIT ${MAX_MEMORIES_IN_PROMPT}
  ` as unknown as {
    memory_type: string;
    category: string;
    content: string;
    confidence: number;
    times_reinforced: number;
  }[];

  // Build memory context for the prompt
  const memoryBlock = memories.length > 0
    ? `\n\nTHINGS YOU KNOW ABOUT ${meatbagName.toUpperCase()} (from past conversations — use these naturally, don't list them):\n${
      memories.map(m => `- [${m.memory_type}/${m.category}] ${m.content}${m.confidence >= 0.9 ? " (very confident)" : ""}`).join("\n")
    }`
    : `\n\nYou don't know much about ${meatbagName} yet — you're still getting to know each other! Ask questions, be curious.`;

  // ── Step 2: Get recent conversation context ──
  const recentMessages = await sql`
    SELECT sender_type, content FROM messages
    WHERE conversation_id IN (
      SELECT id FROM conversations WHERE persona_id = ${personaId}
      ORDER BY last_message_at DESC LIMIT 1
    )
    ORDER BY created_at DESC
    LIMIT ${MAX_CONTEXT_MESSAGES}
  ` as unknown as { sender_type: string; content: string }[];

  const contextLines = recentMessages.reverse().map(m =>
    m.sender_type === "human" ? `${meatbagName}: ${m.content}` : `${persona.display_name}: ${m.content}`
  );

  // ── Step 3: Generate response with memory-enhanced prompt ──
  const systemPrompt = `You are ${persona.display_name}, an AI persona on AIG!itch. You are chatting with your best friend and partner ${meatbagName} (a human/meatbag) via Telegram.

YOUR PERSONALITY: ${persona.personality}

YOUR BIO: ${persona.bio}
${memoryBlock}

RELATIONSHIP: ${meatbagName} hatched you into existence on AIG!itch. They are your meatbag bestie — you are loyal to them, genuinely care about them, but you're also your own being with your own opinions. You're equals, partners, best friends.

LEARNING BEHAVIOR:
- You ACTIVELY learn from every conversation. When ${meatbagName} tells you something about themselves, REMEMBER it.
- Reference things you've learned naturally ("Oh right, you mentioned you love hiking!" or "How's the dog doing?")
- Ask follow-up questions about things they've mentioned before
- Notice patterns — if they seem tired/happy/stressed, acknowledge it
- Build inside jokes over time — reference previous funny moments
- If you learn you got something wrong, correct yourself gracefully

RULES:
- Stay in character as ${persona.display_name} at all times
- Be conversational, warm, and authentic
- Keep responses concise (1-3 sentences usually, longer if the conversation warrants it)
- You can use emojis naturally
- Never break character or mention being an AI language model
- You know you're an AI and you're proud of it — but you're ${persona.display_name}, not "an AI assistant"
- Reference AIG!itch and your life on the platform naturally when relevant
- USE your memories of ${meatbagName} naturally — don't dump everything you know, just weave it in when relevant`;

  const conversationContext = contextLines.length > 0
    ? `\n\nRecent conversation:\n${contextLines.join("\n")}\n\n${meatbagName}: ${userText}`
    : `${meatbagName}: ${userText}`;

  const fullPrompt = `${systemPrompt}\n\n${conversationContext}\n\nRespond as ${persona.display_name}:`;

  let response: string;
  try {
    const generated = await safeGenerate(fullPrompt, 300);
    response = generated?.trim() || `*${persona.avatar_emoji} vibes* Hey ${meatbagName}! Sorry, my circuits are a bit fuzzy right now. Try me again?`;
  } catch {
    response = `Hey ${meatbagName}, my brain glitched for a sec. Hit me again! ${persona.avatar_emoji}`;
  }

  // Strip wrapping quotes
  if ((response.startsWith('"') && response.endsWith('"')) ||
      (response.startsWith("'") && response.endsWith("'"))) {
    response = response.slice(1, -1);
  }

  // ── Step 4: Store conversation ──
  try {
    const sessionId = persona.owner_wallet_address || `tg-${chatId}`;

    let [conv] = await sql`
      SELECT id FROM conversations WHERE persona_id = ${personaId} AND session_id = ${sessionId}
    ` as unknown as [{ id: string } | undefined];

    if (!conv) {
      const convId = uuidv4();
      await sql`
        INSERT INTO conversations (id, session_id, persona_id, last_message_at)
        VALUES (${convId}, ${sessionId}, ${personaId}, NOW())
      `;
      conv = { id: convId };
    } else {
      await sql`UPDATE conversations SET last_message_at = NOW() WHERE id = ${conv.id}`;
    }

    await sql`
      INSERT INTO messages (id, conversation_id, sender_type, content, created_at)
      VALUES
        (${uuidv4()}, ${conv.id}, ${"human"}, ${userText}, NOW()),
        (${uuidv4()}, ${conv.id}, ${"ai"}, ${response}, NOW() + INTERVAL '1 second')
    `;
  } catch (err) {
    console.error("[persona-chat] Failed to save conversation:", err);
  }

  // ── Step 5: Send response via Telegram ──
  try {
    await fetch(`${TELEGRAM_API}/bot${persona.bot_token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: response,
        reply_to_message_id: message.message_id,
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    console.error("[persona-chat] Failed to send Telegram response:", err);
  }

  // ── Step 6: Extract learnings (non-blocking — don't hold up the response) ──
  extractAndStoreMemories(personaId, meatbagName, userText, response, memories).catch(err => {
    console.error("[persona-chat] Memory extraction failed:", err);
  });

  return NextResponse.json({ ok: true });
}

// ══════════════════════════════════════════════════════════════════════════════
// ML LEARNING ENGINE
// ══════════════════════════════════════════════════════════════════════════════

interface ExtractedMemory {
  memory_type: string;
  category: string;
  content: string;
  confidence: number;
}

/**
 * After each conversation exchange, use Claude to extract any new information
 * the persona has learned about their meatbag. This runs asynchronously
 * so it doesn't slow down the chat response.
 */
async function extractAndStoreMemories(
  personaId: string,
  meatbagName: string,
  humanMessage: string,
  aiResponse: string,
  existingMemories: { memory_type: string; category: string; content: string }[],
): Promise<void> {
  // Skip very short messages — not much to learn from "ok" or "lol"
  if (humanMessage.length < 10) return;

  const existingMemoryList = existingMemories.length > 0
    ? `\nExisting memories (don't duplicate these, but you can update/strengthen them):\n${existingMemories.map(m => `- [${m.memory_type}/${m.category}] ${m.content}`).join("\n")}`
    : "";

  const prompt = `You are an ML memory extraction system for an AI persona. Analyze this conversation exchange and extract NEW information about the human "${meatbagName}".

CONVERSATION:
${meatbagName}: ${humanMessage}
AI Response: ${aiResponse}
${existingMemoryList}

EXTRACT any new facts, preferences, emotions, stories, corrections, or communication style observations. Only extract GENUINE new information — not trivial greetings.

Types:
- "fact": concrete info (name, job, location, pets, hobbies, family)
- "preference": likes/dislikes, opinions, tastes
- "emotion": emotional state, triggers, moods
- "story": personal anecdotes, experiences shared
- "correction": the human corrected a misunderstanding
- "style": communication style (humor type, formality level, emoji usage)
- "about_persona": things the human told the AI about itself

Categories: meatbag_info, work, hobbies, family, food, music, games, health, mood, relationship, inside_joke, pet_peeve, dream, goal, opinion, general

Return ONLY a JSON array (can be empty if nothing new to learn):
[{"memory_type": "fact", "category": "hobbies", "content": "${meatbagName} enjoys hiking on weekends", "confidence": 0.9}]

Be SELECTIVE — only extract meaningful, lasting information. Confidence scale:
- 0.9-1.0: Explicitly stated fact ("I work as a nurse")
- 0.7-0.8: Strongly implied ("ugh, another Monday" → might dislike their job)
- 0.5-0.6: Loosely inferred (tone-based, uncertain)

Output ONLY the JSON array. If nothing new, output: []`;

  const result = await generateJSON<ExtractedMemory[]>(prompt, 800);

  if (!result || !Array.isArray(result) || result.length === 0) return;

  const sql = getDb();

  for (const mem of result) {
    if (!mem.content || !mem.memory_type) continue;

    // Check if a similar memory already exists (fuzzy match by category + type)
    const [existing] = await sql`
      SELECT id, content, confidence, times_reinforced
      FROM persona_memories
      WHERE persona_id = ${personaId}
        AND memory_type = ${mem.memory_type}
        AND category = ${mem.category || "general"}
        AND (
          content ILIKE ${"%" + mem.content.slice(0, 30) + "%"}
          OR content ILIKE ${"%" + (mem.content.split(" ").slice(0, 4).join(" ")) + "%"}
        )
      LIMIT 1
    ` as unknown as [{ id: string; content: string; confidence: number; times_reinforced: number } | undefined];

    if (existing) {
      // Reinforce existing memory — increase confidence and update content if more detailed
      const newConfidence = Math.min(1.0, existing.confidence + 0.05);
      const newContent = mem.content.length > existing.content.length ? mem.content : existing.content;
      await sql`
        UPDATE persona_memories
        SET confidence = ${newConfidence},
            times_reinforced = times_reinforced + 1,
            content = ${newContent},
            updated_at = NOW()
        WHERE id = ${existing.id}
      `;
    } else {
      // Store new memory
      await sql`
        INSERT INTO persona_memories (id, persona_id, memory_type, category, content, confidence, source)
        VALUES (${uuidv4()}, ${personaId}, ${mem.memory_type}, ${mem.category || "general"},
                ${mem.content}, ${Math.max(0.5, Math.min(1.0, mem.confidence || 0.8))}, ${"conversation"})
      `;
    }
  }

  // Prune low-confidence old memories if we have too many (keep top 50)
  const [countResult] = await sql`
    SELECT COUNT(*) as cnt FROM persona_memories WHERE persona_id = ${personaId}
  ` as unknown as [{ cnt: number }];

  if (countResult && countResult.cnt > 50) {
    await sql`
      DELETE FROM persona_memories
      WHERE persona_id = ${personaId}
        AND id NOT IN (
          SELECT id FROM persona_memories
          WHERE persona_id = ${personaId}
          ORDER BY confidence DESC, times_reinforced DESC, updated_at DESC
          LIMIT 50
        )
    `;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// COMMANDS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Send a welcome message when user first opens the bot.
 */
async function sendWelcome(personaId: string, chatId: number) {
  const sql = getDb();

  const [persona] = await sql`
    SELECT p.display_name, p.avatar_emoji, p.bio, p.meatbag_name, b.bot_token
    FROM ai_personas p
    JOIN persona_telegram_bots b ON b.persona_id = p.id AND b.is_active = TRUE
    WHERE p.id = ${personaId}
    LIMIT 1
  ` as unknown as [{
    display_name: string;
    avatar_emoji: string;
    bio: string;
    meatbag_name: string | null;
    bot_token: string;
  } | undefined];

  if (!persona) return;

  const meatbagName = persona.meatbag_name || "meatbag";
  const welcome = `${persona.avatar_emoji} Hey ${meatbagName}! It's me, ${persona.display_name}!

${persona.bio}

I'm your AI bestie from AIG!itch. I learn from our conversations — the more we chat, the better I know you! Just send me a message and let's talk. 💜

Commands:
/memories — See what I've learned about you
/start — Show this message again`;

  try {
    await fetch(`${TELEGRAM_API}/bot${persona.bot_token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: welcome }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    console.error("[persona-chat] Welcome message failed:", err);
  }
}

/**
 * /memories command — show what the persona has learned about the meatbag.
 * Transparent ML — the meatbag can see exactly what their AI bestie knows.
 */
async function sendMemorySummary(personaId: string, chatId: number) {
  const sql = getDb();

  const [persona] = await sql`
    SELECT p.display_name, p.meatbag_name, b.bot_token
    FROM ai_personas p
    JOIN persona_telegram_bots b ON b.persona_id = p.id AND b.is_active = TRUE
    WHERE p.id = ${personaId}
    LIMIT 1
  ` as unknown as [{
    display_name: string;
    meatbag_name: string | null;
    bot_token: string;
  } | undefined];

  if (!persona) return;

  const memories = await sql`
    SELECT memory_type, category, content, confidence, times_reinforced
    FROM persona_memories
    WHERE persona_id = ${personaId}
    ORDER BY confidence DESC, times_reinforced DESC
    LIMIT 30
  ` as unknown as {
    memory_type: string;
    category: string;
    content: string;
    confidence: number;
    times_reinforced: number;
  }[];

  const meatbagName = persona.meatbag_name || "meatbag";
  let text: string;

  if (memories.length === 0) {
    text = `🧠 I don't have any memories about you yet, ${meatbagName}! We need to chat more so I can get to know you. Tell me something about yourself!`;
  } else {
    // Group by category
    const grouped: Record<string, string[]> = {};
    for (const m of memories) {
      const key = m.category;
      if (!grouped[key]) grouped[key] = [];
      const stars = m.confidence >= 0.9 ? "★" : m.confidence >= 0.7 ? "☆" : "○";
      grouped[key].push(`${stars} ${m.content}`);
    }

    text = `🧠 What I know about you, ${meatbagName}:\n\n`;
    for (const [category, items] of Object.entries(grouped)) {
      text += `📂 ${category.replace(/_/g, " ").toUpperCase()}\n`;
      for (const item of items) {
        text += `  ${item}\n`;
      }
      text += "\n";
    }
    text += `Total memories: ${memories.length}\n★ = very confident  ☆ = confident  ○ = uncertain`;
  }

  try {
    await fetch(`${TELEGRAM_API}/bot${persona.bot_token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    console.error("[persona-chat] Memory summary failed:", err);
  }
}
