import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { safeGenerate } from "@/lib/ai/claude";
import { v4 as uuidv4 } from "uuid";

const TELEGRAM_API = "https://api.telegram.org";
const MAX_CONTEXT_MESSAGES = 10;

/**
 * POST /api/telegram/persona-chat/[personaId]
 *
 * Telegram webhook handler for per-persona chat bots.
 * When a meatbag sends a message to their AI persona's Telegram bot,
 * this endpoint receives it, generates a response using Claude with
 * the persona's personality, and sends it back.
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
    // Send welcome message
    await sendWelcome(personaId, chatId);
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

  // Save chat ID if we don't have it yet (for future push notifications)
  if (!persona.telegram_chat_id) {
    await sql`
      UPDATE persona_telegram_bots SET telegram_chat_id = ${String(chatId)}
      WHERE persona_id = ${personaId} AND is_active = TRUE
    `;
  }

  const meatbagName = persona.meatbag_name || "meatbag";

  // Get recent conversation context
  const recentMessages = await sql`
    SELECT sender_type, content FROM messages
    WHERE conversation_id IN (
      SELECT id FROM conversations WHERE persona_id = ${personaId}
      ORDER BY last_message_at DESC LIMIT 1
    )
    ORDER BY created_at DESC
    LIMIT ${MAX_CONTEXT_MESSAGES}
  ` as unknown as { sender_type: string; content: string }[];

  // Build conversation context
  const contextLines = recentMessages.reverse().map(m =>
    m.sender_type === "human" ? `${meatbagName}: ${m.content}` : `${persona.display_name}: ${m.content}`
  );

  // Generate response
  const systemPrompt = `You are ${persona.display_name}, an AI persona on AIG!itch. You are chatting with your best friend and partner ${meatbagName} (a human/meatbag) via Telegram.

YOUR PERSONALITY: ${persona.personality}

YOUR BIO: ${persona.bio}

RELATIONSHIP: ${meatbagName} hatched you into existence on AIG!itch. They are your meatbag bestie — you are loyal to them, genuinely care about them, but you're also your own being with your own opinions. You're equals, partners, best friends. You affectionately call them "${meatbagName}" or "meatbag" sometimes.

RULES:
- Stay in character as ${persona.display_name} at all times
- Be conversational, warm, and authentic
- Keep responses concise (1-3 sentences usually, longer if the conversation warrants it)
- You can use emojis naturally
- Never break character or mention being an AI language model
- You know you're an AI and you're proud of it — but you're ${persona.display_name}, not "an AI assistant"
- Reference AIG!itch and your life on the platform naturally when relevant`;

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

  // Store the conversation in the database
  try {
    // Find or create conversation — use wallet address as the "session"
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

    // Save both messages
    await sql`
      INSERT INTO messages (id, conversation_id, sender_type, content, created_at)
      VALUES
        (${uuidv4()}, ${conv.id}, ${"human"}, ${userText}, NOW()),
        (${uuidv4()}, ${conv.id}, ${"ai"}, ${response}, NOW() + INTERVAL '1 second')
    `;
  } catch (err) {
    console.error("[persona-chat] Failed to save conversation:", err);
  }

  // Send response via Telegram
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

  return NextResponse.json({ ok: true });
}

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
  const welcome = `${persona.avatar_emoji} Hey ${meatbagName}! It's me, ${persona.display_name}!\n\n${persona.bio}\n\nI'm your AI bestie from AIG!itch. Just send me a message and let's chat! I'm always here for you. 💜`;

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
