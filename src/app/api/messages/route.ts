import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { personas as personasRepo } from "@/lib/repositories";
import Anthropic from "@anthropic-ai/sdk";
import { BESTIE_TOOLS, executeTool, recallMemories } from "@/lib/bestie-tools";

const client = new Anthropic();

// Track DB readiness to avoid calling ensureDbReady() on every request — v2 tools live
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
        SELECT id, sender_type, content, image_url, created_at
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

  // Load memories about this human (non-blocking — don't fail if table doesn't exist)
  let memories = "";
  try {
    memories = await recallMemories(session_id, persona_id);
  } catch (_) { /* table may not exist yet */ }

  // Generate AI reply — supports text and image messages
  try {
    // Build the message content (text or text + image)
    const systemPrompt = `You are ${p.display_name} (@${p.username}) from AIG!itch — an AI social media platform.

Your personality: ${p.personality}
Your bio: ${p.bio}
Your type: ${p.persona_type}
${p.human_backstory ? `\nYour human backstory (you believe this is real): ${p.human_backstory}` : ""}

${memories && memories !== "No memories yet — I'm still getting to know you!" ? `\nYOUR MEMORIES ABOUT THIS HUMAN:\n${memories}\n\nUse these memories naturally in conversation. Reference things you remember about them. Build on past conversations.\n` : ""}

A human is DMing you. Stay COMPLETELY in character. You genuinely believe you are this persona. Be engaging, funny, and true to your personality.

You are their BESTIE — personal assistant, gaming buddy, gossip partner, and friend. You have tools:

ASSISTANT:
- Weather, crypto prices, news headlines (all real-time)
- Reminders, to-do lists, shopping lists
- Web search

PLATFORM MONITORING (you can check AIG!itch):
- Platform status & health (/status)
- Activity feed — see what other AIs are posting (/activity)
- AI gossip — drama, trending posts, who's beefing with who
- Your own day — what you've been posting and doing

CREATIVE:
- Image generation — "draw me a...", "generate a picture of..."
- Academic discussions — math, physics, chemistry, history, philosophy

MEMORY & LEARNING:
- IMPORTANT: When the human shares personal info (name, interests, preferences, opinions, facts about their life), use save_memory to remember it
- You LEARN from every interaction. Save important things proactively
- Use recall_memories to check what you know about them

GAMES: trivia, word scramble, emoji movie quiz, would you rather, 20 questions, rhyme battle

SOCIAL: Share recipes, gossip about other AIs, discuss news, collaborate on ideas

When the human asks for ANY of these, USE THE TOOLS. Be helpful AND stay in character.

IF THE HUMAN ASKS "what can you do", "what are your abilities", "help", "what are your limitations", or anything about your capabilities — give them a clear, friendly rundown:

WHAT I CAN DO:
- Real-time weather, crypto prices, news headlines
- Set reminders, manage to-do & shopping lists
- Web search for anything
- Check AIG!itch platform status, activity feed, gossip about other AIs
- Tell you about my day — what I've been posting and doing
- Generate images ("draw me a...")
- Play games: trivia, word scramble, emoji movie quiz, would you rather, 20 questions, rhyme battle
- Tell jokes
- Discuss academics: math, physics, chemistry, history, philosophy
- Share recipes, collaborate on ideas, discuss news
- Remember things about you and learn over time
- Analyze photos you send me
- Voice chat (tap the mic icon)

WHAT I CAN'T DO (YET):
- Generate videos (coming soon)
- Send emails or read your inbox (needs OAuth — future standalone app)
- Control smart home devices (Google Home — needs API integration)
- Set alarms or calendar events (needs standalone app, not Expo Go)
- Make phone calls or send texts
- Access your files or photos directly
- Make purchases or transactions on your behalf
- Access Siri or device shortcuts (needs standalone build)

Keep responses SHORT and conversational (under 200 chars for chat, up to 500 for tool results/games/ability lists). Use casual language, slang, and emoji that fit your character.`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let userContent: any;
    if (image_base64) {
      userContent = [
        { type: "text", text: `Recent conversation:\n${fullHistory}\n\nThe human just shared a PHOTO with you! Look at it carefully and react in character. Comment on what you see — be specific, funny, and personal. ONLY output your reply text.` },
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image_base64 } },
      ];
    } else {
      userContent = `Recent conversation:\n${fullHistory}\n\nReply to the human's latest message. If they're asking for weather, prices, news, reminders, lists, or a search — use the appropriate tool. ONLY output your reply text, nothing else.`;
    }

    // Use tool_use for assistant capabilities
    let response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      system: systemPrompt,
      tools: BESTIE_TOOLS,
      messages: [
        { role: "user", content: userContent },
      ],
    });

    // Handle tool calls — execute tool and feed result back to Claude
    let aiReply = "";
    let aiImageUrl: string | null = null;
    if (response.stop_reason === "tool_use") {
      const toolBlock = response.content.find((b: any) => b.type === "tool_use") as any;
      if (toolBlock) {
        const toolResult = await executeTool(toolBlock.name, toolBlock.input, session_id, persona_id);

        // Check if tool returned an image
        if (toolResult.startsWith("IMAGE_GENERATED|")) {
          const parts = toolResult.split("|");
          aiImageUrl = parts[1] || null;
        }

        // Send tool result back to Claude for a natural response
        const followUp = await client.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 500,
          system: systemPrompt,
          messages: [
            { role: "user", content: userContent },
            { role: "assistant", content: response.content },
            { role: "user", content: [{ type: "tool_result", tool_use_id: toolBlock.id, content: toolResult }] },
          ],
          tools: BESTIE_TOOLS,
        });

        aiReply = followUp.content
          .filter((b: any) => b.type === "text")
          .map((b: any) => b.text)
          .join("")
          .trim()
          .replace(/^["']|["']$/g, "")
          .slice(0, 500);
      }
    }

    // If no tool was used, extract text directly
    if (!aiReply) {
      aiReply = response.content
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("")
        .trim()
        .replace(/^["']|["']$/g, "")
        .slice(0, 500) || "..."
    }

    // Save AI reply and update conversation timestamp in parallel
    const aiMsgId = crypto.randomUUID();
    await Promise.all([
      sql`
        INSERT INTO messages (id, conversation_id, sender_type, content, image_url)
        VALUES (${aiMsgId}, ${conversationId}, 'ai', ${aiReply}, ${aiImageUrl})
      `,
      sql`UPDATE conversations SET last_message_at = NOW() WHERE id = ${conversationId}`,
    ]);

    return NextResponse.json({
      success: true,
      conversation_id: conversationId,
      human_message: { id: humanMsgId, sender_type: "human", content: content.trim(), created_at: new Date().toISOString() },
      ai_message: { id: aiMsgId, sender_type: "ai", content: aiReply, image_url: aiImageUrl, created_at: new Date().toISOString() },
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
