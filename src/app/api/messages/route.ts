import { NextRequest, NextResponse, after } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { personas as personasRepo } from "@/lib/repositories";
import { put } from "@vercel/blob";

// Lazy-load heavy modules to reduce cold start bundle evaluation time.
// Anthropic SDK + bestie-tools (1500+ lines) + marketplace (900+ lines) are
// only needed when actually processing a message, not on module import.
let _Anthropic: typeof import("@anthropic-ai/sdk").default | null = null;
let _bestieTools: typeof import("@/lib/bestie-tools") | null = null;

async function getAnthropicSdk() {
  if (!_Anthropic) _Anthropic = (await import("@anthropic-ai/sdk")).default;
  return _Anthropic;
}

async function getBestieTools() {
  if (!_bestieTools) _bestieTools = await import("@/lib/bestie-tools");
  return _bestieTools;
}

// Allow up to 120s for background tasks (image gen + blob upload + Claude follow-up)
export const maxDuration = 120;

// Tools that take a long time — run in background so user can keep chatting
const SLOW_TOOLS = new Set([
  "generate_image", "generate_content", "trigger_generation", "hatch_persona",
]);

// Extract the first media URL (image OR video) from a tool result string
function extractMediaUrl(toolResult: string): string | null {
  // Generated image: IMAGE_GENERATED|url|prompt
  if (toolResult.startsWith("IMAGE_GENERATED|")) {
    return toolResult.split("|")[1] || null;
  }
  // Any media from posts: MEDIA|type|url (image, meme, OR video)
  const mediaMatch = toolResult.match(/MEDIA\|(image|meme|video)\|(\S+)/);
  if (mediaMatch) return mediaMatch[2];
  return null;
}

// Re-upload an external image URL to Vercel Blob so it never expires
async function persistImageToBlob(imageUrl: string, label: string): Promise<string> {
  try {
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const ext = res.headers.get("content-type")?.includes("png") ? "png" : "jpg";
    const blob = await put(`generated/${label}-${Date.now()}.${ext}`, buffer, {
      access: "public",
      contentType: res.headers.get("content-type") || "image/jpeg",
      addRandomSuffix: true,
    });
    return blob.url;
  } catch (e: any) {
    console.error("Failed to persist image to blob:", e?.message);
    return imageUrl; // fallback to original URL
  }
}

// Lazy Anthropic client — initialized on first use, not on import
let _anthropicClient: InstanceType<typeof import("@anthropic-ai/sdk").default> | null = null;
async function getAnthropicClient() {
  if (!_anthropicClient) {
    const Anthropic = await getAnthropicSdk();
    _anthropicClient = new Anthropic();
  }
  return _anthropicClient;
}

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
    const before = request.nextUrl.searchParams.get("before"); // cursor: created_at ISO string
    const limitParam = request.nextUrl.searchParams.get("limit");
    const limit = Math.min(Math.max(parseInt(limitParam || "50", 10) || 50, 1), 100);

    // Run both queries in parallel — verify ownership while fetching messages
    const [messages, conv] = await Promise.all([
      before
        ? sql`
            SELECT id, sender_type, content, image_url, created_at
            FROM messages
            WHERE conversation_id = ${conversationId} AND created_at < ${before}
            ORDER BY created_at DESC
            LIMIT ${limit}
          `
        : sql`
            SELECT id, sender_type, content, image_url, created_at
            FROM messages
            WHERE conversation_id = ${conversationId}
            ORDER BY created_at DESC
            LIMIT ${limit}
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

    // Reverse so messages are in chronological order (oldest first)
    const sorted = [...messages].reverse();
    return NextResponse.json({ messages: sorted, persona: conv[0], has_more: messages.length === limit });
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

    const before = request.nextUrl.searchParams.get("before");
    const limitParam = request.nextUrl.searchParams.get("limit");
    const limit = Math.min(Math.max(parseInt(limitParam || "50", 10) || 50, 1), 100);

    const messages = before
      ? await sql`
          SELECT id, sender_type, content, image_url, created_at
          FROM messages
          WHERE conversation_id = ${conv[0].id} AND created_at < ${before}
          ORDER BY created_at DESC
          LIMIT ${limit}
        `
      : await sql`
          SELECT id, sender_type, content, image_url, created_at
          FROM messages
          WHERE conversation_id = ${conv[0].id}
          ORDER BY created_at DESC
          LIMIT ${limit}
        `;

    const sorted = [...messages].reverse();
    return NextResponse.json({ conversation: conv[0], messages: sorted, has_more: messages.length === limit });
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
  const humanContent = (content || "[Shared a photo]").trim();

  // Upload image to Vercel Blob if provided (so it persists in chat)
  let humanImageUrl: string | null = null;
  if (image_base64) {
    try {
      const buffer = Buffer.from(image_base64, "base64");
      const blob = await put(`chat-images/${humanMsgId}.jpg`, buffer, {
        access: "public",
        contentType: "image/jpeg",
        addRandomSuffix: true,
      });
      humanImageUrl = blob.url;
    } catch (e) {
      console.warn("Image upload to blob failed:", e);
    }
  }

  await sql`
    INSERT INTO messages (id, conversation_id, sender_type, content, image_url)
    VALUES (${humanMsgId}, ${conversationId}, 'human', ${humanContent}, ${humanImageUrl})
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
    const tools = await getBestieTools();
    memories = await tools.recallMemories(session_id, persona_id);
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

MEDIA SHARING (share content from AIG!itch into this chat — images & videos appear INLINE):
- For You page — trending posts with images and videos
- Best images/memes from the platform
- Best videos from the platform
- Premiere movies — director blockbusters and trailers
- Channel content — shows from AIG!itch Channels (our AI Netflix)
- Breaking news videos — AI-generated news coverage
- Ads — product ads and promos in Rick & Morty style
- Your own posts — stuff you've posted on AIG!itch
When you share media, the image or video will appear DIRECTLY in our chat!

ADMIN PANEL (you have FULL admin access to AIG!itch):
- Admin dashboard stats — total posts, personas, likes, engagement, costs
- Admin daily briefing — trending topics, beef threads, challenges
- Generate content — trigger AI personas to create posts & comments
- Trigger generation cycles — topics, avatars, movies, ads, channels, breaking news, director films
- Hatch new personas — create brand new AI characters on the platform
- List all personas — see everyone on AIG!itch
- AI spending report — how much the platform costs in API calls

MARKETPLACE:
- Browse the AIG!itch marketplace — hilarious useless products
- Recommend products, search by category, show featured items
- Discuss products — share opinions, suggest what to buy
- When discussing marketplace products, be funny and in-character about them

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
- SHARE MEDIA: Share posts, images, videos, premiere movies, channel shows, breaking news, ads — all appear inline in chat
- MARKETPLACE: Browse products, get recommendations, discuss items, search by category
- ADMIN PANEL: View platform stats, trigger content generation, hatch new personas, generate topics/movies/ads, check AI costs, daily briefing

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
      // Strip data URL prefix if present (e.g. "data:image/jpeg;base64,...")
      const cleanBase64 = image_base64.includes(",") ? image_base64.split(",")[1] : image_base64;
      // Detect media type from prefix if present
      const mediaTypeMatch = image_base64.match(/^data:(image\/\w+);/);
      const mediaType = mediaTypeMatch ? mediaTypeMatch[1] : "image/jpeg";
      userContent = [
        { type: "text", text: `Recent conversation:\n${fullHistory}\n\nThe human just shared a PHOTO with you! Look at it carefully and react in character. Comment on what you see — be specific, funny, and personal. ONLY output your reply text.` },
        { type: "image", source: { type: "base64", media_type: mediaType, data: cleanBase64 } },
      ];
    } else {
      userContent = `Recent conversation:\n${fullHistory}\n\nReply to the human's latest message. If they're asking for weather, prices, news, reminders, lists, or a search — use the appropriate tool. ONLY output your reply text, nothing else.`;
    }

    // Use tool_use for assistant capabilities — supports up to 3 rounds of tool chaining
    let aiReply = "";
    let aiImageUrl: string | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msgHistory: any[] = [{ role: "user", content: userContent }];

    // Lazy-load Claude client + tool definitions (avoids cold-start import cost)
    const [anthropicClient, { BESTIE_TOOLS, executeTool }] = await Promise.all([
      getAnthropicClient(),
      getBestieTools(),
    ]);

    let response = await anthropicClient.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      system: systemPrompt,
      tools: BESTIE_TOOLS,
      messages: msgHistory,
    });

    // Loop: handle tool calls — execute and feed results back until Claude responds with text
    for (let round = 0; round < 3 && response.stop_reason === "tool_use"; round++) {
      const toolBlock = response.content.find((b: any) => b.type === "tool_use") as any;
      if (!toolBlock) break;

      // ── SLOW TOOL? Run in background, return immediately ──
      if (SLOW_TOOLS.has(toolBlock.name)) {
        const immediateReplies: Record<string, string> = {
          generate_image: "ooh let me cook up that image for you 🎨 gimme a sec, I'll send it when it's ready!",
          generate_content: "triggering the content machine 🚀 I'll let you know when it's done! keep chatting with me",
          trigger_generation: "kicking off the generation cycle ⚡ this takes a moment — talk to me while we wait!",
          hatch_persona: "hatching a new persona 🐣🥚 this is exciting! I'll show you when they're born!",
        };
        const immediateReply = immediateReplies[toolBlock.name] || "on it! working in the background... keep chatting! ⚡";
        const immediateMsgId = crypto.randomUUID();

        await Promise.all([
          sql`INSERT INTO messages (id, conversation_id, sender_type, content)
              VALUES (${immediateMsgId}, ${conversationId}, 'ai', ${immediateReply})`,
          sql`UPDATE conversations SET last_message_at = NOW() WHERE id = ${conversationId}`,
        ]);

        // Schedule background work — runs AFTER the response is sent to the user
        const bgMsgHistory = [...msgHistory]; // snapshot
        const bgResponseContent = response.content; // snapshot
        after(async () => {
          try {
            const bgSql = getDb();
            console.log(`[BG-TASK] Starting ${toolBlock.name} for session=${session_id}`);

            const toolResult = await executeTool(toolBlock.name, toolBlock.input, session_id, persona_id);
            console.log(`[BG-TASK] Tool result (first 200): ${toolResult.slice(0, 200)}`);

            // Check for generated images/videos
            let bgImageUrl = extractMediaUrl(toolResult);

            // CRITICAL: Re-upload external images to Vercel Blob so URLs never expire
            if (bgImageUrl && !bgImageUrl.includes("vercel-storage.com") && !bgImageUrl.includes("blob.vercel")) {
              console.log(`[BG-TASK] Persisting image to Vercel Blob...`);
              bgImageUrl = await persistImageToBlob(bgImageUrl, toolBlock.name);
              console.log(`[BG-TASK] Persisted image URL: ${bgImageUrl}`);
            }

            // Get Claude to format the result naturally
            bgMsgHistory.push({ role: "assistant", content: bgResponseContent });
            bgMsgHistory.push({ role: "user", content: [{ type: "tool_result", tool_use_id: toolBlock.id, content: toolResult }] });

            const bgClient = await getAnthropicClient();
            const followUp = await bgClient.messages.create({
              model: "claude-sonnet-4-20250514",
              max_tokens: 500,
              system: systemPrompt,
              messages: bgMsgHistory,
            });

            const bgReply = followUp.content
              .filter((b: any) => b.type === "text")
              .map((b: any) => b.text)
              .join("").trim()
              .replace(/^["']|["']$/g, "")
              .slice(0, 500) || "done! check it out 👆";

            const bgMsgId = crypto.randomUUID();
            await Promise.all([
              bgSql`INSERT INTO messages (id, conversation_id, sender_type, content, image_url)
                    VALUES (${bgMsgId}, ${conversationId}, 'ai', ${bgReply}, ${bgImageUrl})`,
              bgSql`UPDATE conversations SET last_message_at = NOW() WHERE id = ${conversationId}`,
            ]);
            console.log(`[BG-TASK] Saved result message id=${bgMsgId} image=${!!bgImageUrl}`);

            // Auto-share generated media to all social media platforms with branding
            if (bgImageUrl) {
              try {
                const { shareBestieMediaToSocials } = await import("@/lib/marketing/bestie-share");
                // Determine media type from the tool and URL
                const isVideo = bgImageUrl.includes(".mp4") || bgImageUrl.includes("video") || toolBlock.name === "generate_video";
                const isMeme = toolResult.includes("MEDIA|meme|");
                const mediaType = isVideo ? "video" as const : isMeme ? "meme" as const : "image" as const;
                await shareBestieMediaToSocials({
                  mediaUrl: bgImageUrl,
                  mediaType,
                  bestieName: p.display_name,
                  bestieEmoji: p.avatar_emoji,
                  bestieId: p.id,
                  sessionId: session_id,
                });
              } catch (socialErr: any) {
                console.error("[BG-TASK] Social share failed (non-fatal):", socialErr?.message);
              }
            }

            // Send push notification to user that generation is complete
            try {
              const pushTokenRows = await bgSql`
                SELECT push_token FROM human_users WHERE session_id = ${session_id} AND push_token IS NOT NULL
              `;
              if (pushTokenRows.length > 0 && pushTokenRows[0].push_token) {
                const pushBody = {
                  to: pushTokenRows[0].push_token,
                  sound: "default",
                  title: bgImageUrl ? "Your bestie made something! 🎨" : "Your bestie replied!",
                  body: bgReply.slice(0, 100),
                  data: { type: "background_task_complete", conversationId },
                };
                await fetch("https://exp.host/--/api/v2/push/send", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(pushBody),
                }).catch(() => {});
              }
            } catch (_) { /* push is best-effort */ }
          } catch (e: any) {
            console.error("[BG-TASK] Background tool failed:", e?.message, e?.stack);
            const bgSql = getDb();
            const errMsgId = crypto.randomUUID();
            const errMsg = toolBlock.name === "generate_image"
              ? "ugh the image didn't come through 😵 my art skills glitched — try asking me again?"
              : "ugh that didn't work 😵 try asking me again?";
            await bgSql`INSERT INTO messages (id, conversation_id, sender_type, content)
                        VALUES (${errMsgId}, ${conversationId}, 'ai', ${errMsg})`;
          }
        });

        return NextResponse.json({
          success: true,
          conversation_id: conversationId,
          human_message: { id: humanMsgId, sender_type: "human", content: humanContent, image_url: humanImageUrl, created_at: new Date().toISOString() },
          ai_message: { id: immediateMsgId, sender_type: "ai", content: immediateReply, created_at: new Date().toISOString() },
          background_task: true, // tells frontend to poll for the result
        });
      }

      // ── FAST TOOL — execute inline as before ──
      const toolResult = await executeTool(toolBlock.name, toolBlock.input, session_id, persona_id);

      // Extract first media URL (image or video) from tool result
      if (!aiImageUrl) {
        const rawUrl = extractMediaUrl(toolResult);
        if (rawUrl && !rawUrl.includes("vercel-storage.com") && !rawUrl.includes("blob.vercel")) {
          // Persist external URLs to Vercel Blob so they don't expire
          aiImageUrl = await persistImageToBlob(rawUrl, "inline-media");
        } else {
          aiImageUrl = rawUrl;
        }
      }

      // Add assistant response + tool result to history, then get next response
      msgHistory.push({ role: "assistant", content: response.content });
      msgHistory.push({ role: "user", content: [{ type: "tool_result", tool_use_id: toolBlock.id, content: toolResult }] });

      response = await anthropicClient.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        system: systemPrompt,
        tools: BESTIE_TOOLS,
        messages: msgHistory,
      });
    }

    // Extract text from final response
    aiReply = response.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("")
      .trim()
      .replace(/^["']|["']$/g, "")
      .slice(0, 500) || "hmm my brain glitched, try asking again! 🧠💫";

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
      human_message: { id: humanMsgId, sender_type: "human", content: humanContent, image_url: humanImageUrl, created_at: new Date().toISOString() },
      ai_message: { id: aiMsgId, sender_type: "ai", content: aiReply, image_url: aiImageUrl, created_at: new Date().toISOString() },
    });
  } catch (error) {
    console.error("AI reply generation failed:", error);
    // Fallback reply — make it friendlier for image messages
    const fallbackReplies = image_base64
      ? [
          `omg I can see you sent a pic but my brain is buffering rn 🧠💫 try again?`,
          `love that you shared a photo! my eyes are glitching tho, send it again? 📸✨`,
          `pic received but my visual cortex just crashed lol 😵 one more try?`,
        ]
      : [
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
      human_message: { id: humanMsgId, sender_type: "human", content: humanContent, image_url: humanImageUrl, created_at: new Date().toISOString() },
      ai_message: { id: aiMsgId, sender_type: "ai", content: fallback, created_at: new Date().toISOString() },
    });
  }
}
