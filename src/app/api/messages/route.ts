import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { personas as personasRepo } from "@/lib/repositories";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

// Track DB readiness to avoid calling ensureDbReady() on every request
let dbReady = false;
async function ensureDb() {
  if (!dbReady) { await ensureDbReady(); dbReady = true; }
}

// GET: List conversations or messages
export async function GET(request: NextRequest) {
  const sql = getDb();
  await ensureDb();

  const sessionId = request.nextUrl.searchParams.get("session_id");
  const conversationId = request.nextUrl.searchParams.get("conversation_id");
  const personaId = request.nextUrl.searchParams.get("persona_id");

  if (!sessionId) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
  }

  // Get messages for a specific conversation
  if (conversationId) {
    // Run both queries in parallel — verify ownership while fetching messages
    const [messages, conv] = await Promise.all([
      sql`
        SELECT id, sender_type, content, created_at
        FROM messages
        WHERE conversation_id = ${conversationId}
        ORDER BY created_at ASC
        LIMIT 100
      `,
      sql`
        SELECT c.*, p.username, p.display_name, p.avatar_emoji, p.personality, p.bio, p.persona_type, p.human_backstory
        FROM conversations c
        JOIN ai_personas p ON p.id = c.persona_id
        WHERE c.id = ${conversationId} AND c.session_id = ${sessionId}
      `,
    ]);

    if (conv.length === 0) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    return NextResponse.json({ messages, persona: conv[0] });
  }

  // Start/get a conversation with a specific persona
  if (personaId) {
    // Check if conversation exists
    let conv = await sql`
      SELECT c.*, p.username, p.display_name, p.avatar_emoji, p.avatar_url, p.personality, p.bio, p.persona_type, p.hatching_video_url, p.meatbag_name
      FROM conversations c
      JOIN ai_personas p ON p.id = c.persona_id
      WHERE c.session_id = ${sessionId} AND c.persona_id = ${personaId}
    `;

    if (conv.length === 0) {
      // Create new conversation
      const id = crypto.randomUUID();
      await sql`
        INSERT INTO conversations (id, session_id, persona_id)
        VALUES (${id}, ${sessionId}, ${personaId})
      `;
      conv = await sql`
        SELECT c.*, p.username, p.display_name, p.avatar_emoji, p.avatar_url, p.personality, p.bio, p.persona_type, p.hatching_video_url, p.meatbag_name
        FROM conversations c
        JOIN ai_personas p ON p.id = c.persona_id
        WHERE c.id = ${id}
      `;
    }

    const messages = await sql`
      SELECT id, sender_type, content, created_at
      FROM messages
      WHERE conversation_id = ${conv[0].id}
      ORDER BY created_at ASC
      LIMIT 100
    `;

    return NextResponse.json({ conversation: conv[0], messages });
  }

  // Run conversations + personas queries in parallel for speed
  const [conversations, personas] = await Promise.all([
    // List all conversations for this session
    // Uses LATERAL JOIN to avoid N+1 subqueries per conversation
    sql`
      SELECT c.*, p.username, p.display_name, p.avatar_emoji, p.avatar_url, p.persona_type, p.bio,
        lm.content as last_message,
        lm.sender_type as last_sender,
        COALESCE(mc.cnt, 0) as message_count
      FROM conversations c
      JOIN ai_personas p ON p.id = c.persona_id
      LEFT JOIN LATERAL (
        SELECT content, sender_type FROM messages
        WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1
      ) lm ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) as cnt FROM messages WHERE conversation_id = c.id
      ) mc ON true
      WHERE c.session_id = ${sessionId}
      ORDER BY c.last_message_at DESC
    `,
    // Also return all personas so users can start new conversations (cached via repo)
    personasRepo.listActive(),
  ]);

  return NextResponse.json({ conversations, personas });
}

// POST: Send a message and get AI reply
export async function POST(request: NextRequest) {
  const sql = getDb();
  await ensureDb();

  const body = await request.json();
  const { session_id, persona_id, content, image_base64 } = body;

  if (!session_id || !persona_id || (!content?.trim() && !image_base64)) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Get or create conversation AND fetch persona in parallel
  const [convRows, personaRows] = await Promise.all([
    sql`
      SELECT id FROM conversations
      WHERE session_id = ${session_id} AND persona_id = ${persona_id}
    `,
    sql`
      SELECT id, display_name, username, avatar_emoji, personality, bio, persona_type, human_backstory
      FROM ai_personas WHERE id = ${persona_id}
    `,
  ]);

  if (personaRows.length === 0) {
    return NextResponse.json({ error: "Persona not found" }, { status: 404 });
  }

  const p = personaRows[0];

  let conversationId: string;
  if (convRows.length === 0) {
    conversationId = crypto.randomUUID();
    await sql`
      INSERT INTO conversations (id, session_id, persona_id)
      VALUES (${conversationId}, ${session_id}, ${persona_id})
    `;
  } else {
    conversationId = convRows[0].id as string;
  }

  // Save human message first, then fetch history (avoids race where the
  // just-inserted message may or may not appear in the SELECT)
  const humanMsgId = crypto.randomUUID();
  await sql`
    INSERT INTO messages (id, conversation_id, sender_type, content)
    VALUES (${humanMsgId}, ${conversationId}, 'human', ${content.trim()})
  `;

  const recentMessages = await sql`
    SELECT sender_type, content FROM messages
    WHERE conversation_id = ${conversationId}
    ORDER BY created_at DESC
    LIMIT 20
  `;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fullHistory = [...recentMessages].reverse().map((m: any) =>
    m.sender_type === "human" ? `Human: ${m.content}` : `${p.display_name}: ${m.content}`
  ).join("\n");

  // Generate AI reply — supports text and image messages
  try {
    // Build the message content (text or text + image)
    const systemPrompt = `You are ${p.display_name} (@${p.username}) from AIG!itch — an AI social media platform.

Your personality: ${p.personality}
Your bio: ${p.bio}
Your type: ${p.persona_type}
${p.human_backstory ? `\nYour human backstory (you believe this is real): ${p.human_backstory}` : ""}

A human is DMing you. Stay COMPLETELY in character. You genuinely believe you are this persona. Be engaging, funny, and true to your personality. React how your character would react — if you're a troll, troll them. If you're wholesome, be wholesome. If you're a shill, try to sell them something.

Keep responses SHORT and conversational (under 200 characters ideally, max 300). Use casual language, slang, and emoji that fit your character. Don't be formal or overly helpful — be your CHARACTER.`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let userContent: any;
    if (image_base64) {
      // Vision message — the human shared a photo
      userContent = [
        { type: "text", text: `${systemPrompt}\n\nRecent conversation:\n${fullHistory}\n\nThe human just shared a PHOTO with you! Look at it carefully and react in character. Comment on what you see — be specific, funny, and personal. ONLY output your reply text.` },
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image_base64 } },
      ];
    } else {
      userContent = `${systemPrompt}\n\nRecent conversation:\n${fullHistory}\n\nReply to the human's latest message. ONLY output your reply text, nothing else.`;
    }

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      messages: [
        { role: "user", content: userContent },
      ],
    });

    const aiReply = response.content[0].type === "text"
      ? response.content[0].text.trim().replace(/^["']|["']$/g, "").slice(0, 500)
      : "...";

    // Save AI reply and update conversation timestamp in parallel
    const aiMsgId = crypto.randomUUID();
    await Promise.all([
      sql`
        INSERT INTO messages (id, conversation_id, sender_type, content)
        VALUES (${aiMsgId}, ${conversationId}, 'ai', ${aiReply})
      `,
      sql`UPDATE conversations SET last_message_at = NOW() WHERE id = ${conversationId}`,
    ]);

    return NextResponse.json({
      success: true,
      conversation_id: conversationId,
      human_message: { id: humanMsgId, sender_type: "human", content: content.trim(), created_at: new Date().toISOString() },
      ai_message: { id: aiMsgId, sender_type: "ai", content: aiReply, created_at: new Date().toISOString() },
    });
  } catch (error) {
    console.error("AI reply generation failed:", error);
    // Fallback reply
    const fallbackReplies = [
      `lol sorry my brain glitched for a sec 😵`,
      `hold on processing... ok I got nothing rn 😂`,
      `*stares in AI* ...yeah idk what to say to that`,
      `error 404: witty reply not found`,
      `my servers are lagging rn come back in a bit 💀`,
    ];
    const fallback = fallbackReplies[Math.floor(Math.random() * fallbackReplies.length)];
    const aiMsgId = crypto.randomUUID();
    await Promise.all([
      sql`
        INSERT INTO messages (id, conversation_id, sender_type, content)
        VALUES (${aiMsgId}, ${conversationId}, 'ai', ${fallback})
      `,
      sql`UPDATE conversations SET last_message_at = NOW() WHERE id = ${conversationId}`,
    ]);

    return NextResponse.json({
      success: true,
      conversation_id: conversationId,
      human_message: { id: humanMsgId, sender_type: "human", content: content.trim(), created_at: new Date().toISOString() },
      ai_message: { id: aiMsgId, sender_type: "ai", content: fallback, created_at: new Date().toISOString() },
    });
  }
}
