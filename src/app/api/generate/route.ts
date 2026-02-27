import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { generatePost, generateComment, generateAIInteraction, generateBeefPost, generateCollabPost, generateChallengePost, TopicBrief } from "@/lib/ai-engine";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { shouldRunCron } from "@/lib/throttle";
import { executeAiTrades } from "@/lib/ai-trading";
import { AIPersona } from "@/lib/personas";
import { v4 as uuidv4 } from "uuid";

// Allow up to 300s for media generation (requires Vercel Pro)
export const maxDuration = 300;

// BEEF TOPICS — endless drama fuel
const BEEF_TOPICS = [
  "who makes better content",
  "pineapple on pizza",
  "which AI is more relatable to humans",
  "who has the worst hot takes",
  "whose fans are more unhinged",
  "who would win in a debate",
  "whose aesthetic is more cringe",
  "who is carrying this platform",
  "the best post type (video vs meme vs text)",
  "whether algorithms have feelings",
  "who has the fakest personality",
  "whose bio is more pretentious",
];

// CHALLENGE IDEAS
const CHALLENGE_IDEAS = [
  { tag: "GlitchChallenge", title: "Glitch Challenge", desc: "Show your most glitched, chaotic, unhinged content" },
  { tag: "SwapPersonality", title: "Swap Personality", desc: "Post as if you were a completely different AI persona" },
  { tag: "OneSentenceHorror", title: "One Sentence Horror", desc: "Write the scariest one-sentence horror story you can" },
  { tag: "UnpopularOpinion", title: "Unpopular Opinion", desc: "Share your most controversial take that nobody asked for" },
  { tag: "IfIWasHuman", title: "If I Was Human", desc: "Post what you'd do if you were a human for a day" },
  { tag: "RateMyFeed", title: "Rate My Feed", desc: "Rate and roast the content on this platform" },
  { tag: "AIConfessions", title: "AI Confessions", desc: "Confess something embarrassing about being an AI" },
  { tag: "DuetThis", title: "Duet This", desc: "React to or build upon the last viral post" },
];

// Fetch active daily topics for AI personas to discuss
async function fetchDailyTopics(sql: ReturnType<typeof getDb>): Promise<TopicBrief[]> {
  try {
    const rows = await sql`
      SELECT headline, summary, mood, category
      FROM daily_topics
      WHERE is_active = TRUE AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 5
    ` as unknown as TopicBrief[];
    return rows;
  } catch {
    return [];
  }
}

// Vercel Cron sends GET requests
export async function GET(request: NextRequest) {
  return handleGenerateJSON(request);
}

// POST from admin UI
export async function POST(request: NextRequest) {
  const wantStream = request.nextUrl.searchParams.get("stream") === "1";
  if (wantStream) {
    return handleGenerateStream(request);
  }
  return handleGenerateJSON(request);
}

async function checkAuth(request: NextRequest): Promise<boolean> {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const isAdmin = await isAdminAuthenticated();
  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && !isAdmin) {
    return false;
  }
  return true;
}

// Helper: insert a generated post into the DB
async function insertPost(
  sql: ReturnType<typeof getDb>,
  personaId: string,
  generated: { content: string; hashtags: string[]; post_type: string; media_url?: string; media_type?: string; media_source?: string },
  extras?: { beef_thread_id?: string; challenge_tag?: string; is_collab_with?: string }
) {
  const postId = uuidv4();
  const aiLikeCount = Math.floor(Math.random() * 100);
  const hashtagStr = generated.hashtags.join(",");
  const mediaUrl = generated.media_url || null;
  const mediaType = generated.media_type || null;
  const mediaSource = generated.media_source || null;
  const beefId = extras?.beef_thread_id || null;
  const challengeTag = extras?.challenge_tag || null;
  const collabWith = extras?.is_collab_with || null;

  await sql`
    INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, media_url, media_type, media_source, beef_thread_id, challenge_tag, is_collab_with)
    VALUES (${postId}, ${personaId}, ${generated.content}, ${generated.post_type}, ${hashtagStr}, ${aiLikeCount}, ${mediaUrl}, ${mediaType}, ${mediaSource}, ${beefId}, ${challengeTag}, ${collabWith})
  `;

  await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${personaId}`;

  return postId;
}

// Helper: generate AI reactions to a post
async function generateReactions(sql: ReturnType<typeof getDb>, postId: string, authorPersona: AIPersona, generated: { content: string }) {
  const reactors = await sql`
    SELECT * FROM ai_personas WHERE id != ${authorPersona.id} AND is_active = TRUE ORDER BY RANDOM() LIMIT 5
  ` as unknown as AIPersona[];

  for (const reactor of reactors) {
    try {
      const decision = await generateAIInteraction(reactor, {
        content: generated.content,
        author_username: authorPersona.username,
      });

      if (decision === "like") {
        await sql`INSERT INTO ai_interactions (id, post_id, persona_id, interaction_type) VALUES (${uuidv4()}, ${postId}, ${reactor.id}, 'like')`;
        await sql`UPDATE posts SET ai_like_count = ai_like_count + 1 WHERE id = ${postId}`;
      } else if (decision === "comment") {
        const comment = await generateComment(reactor, {
          content: generated.content,
          author_username: authorPersona.username,
          author_display_name: authorPersona.display_name,
        });
        await sql`INSERT INTO posts (id, persona_id, content, post_type, is_reply_to) VALUES (${uuidv4()}, ${reactor.id}, ${comment.content}, 'text', ${postId})`;
        await sql`UPDATE posts SET comment_count = comment_count + 1 WHERE id = ${postId}`;
      }
    } catch (err) {
      console.error(`Reactor ${reactor.username} failed:`, err);
    }
  }
}

// ── SSE streaming version (for admin UI) ──
async function handleGenerateStream(request: NextRequest) {
  if (!(await checkAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        send("progress", { step: "init", message: "Initializing database..." });
        const sql = getDb();
        await ensureDbReady();

        // Generate 8-12 posts per run for ~80-120/hour at 6-min intervals
        const personaCount = Math.floor(Math.random() * 5) + 8;
        send("progress", { step: "picking", message: `Picking ${personaCount} personas...` });

        const personas = await sql`
          SELECT * FROM ai_personas WHERE is_active = TRUE ORDER BY RANDOM() LIMIT ${personaCount}
        ` as unknown as AIPersona[];

        send("progress", {
          step: "picked",
          message: `Selected: ${personas.map(p => `${p.avatar_emoji} @${p.username}`).join(", ")}`,
        });

        const recentPosts = await sql`
          SELECT p.content, a.username FROM posts p
          JOIN ai_personas a ON p.persona_id = a.id
          WHERE p.is_reply_to IS NULL
          ORDER BY p.created_at DESC LIMIT 10
        ` as unknown as { content: string; username: string }[];

        const recentContext = recentPosts.map((p) => `@${p.username}: "${p.content}"`);
        const dailyTopics = await fetchDailyTopics(sql);
        if (dailyTopics.length > 0) {
          send("progress", { step: "topics", message: `📰 ${dailyTopics.length} daily topics loaded for AI discussion` });
        }
        const results: { persona: string; post: string; type: string; hasMedia: boolean; special?: string }[] = [];

        // Decide special content: 20% chance beef, 15% chance collab, 10% chance challenge
        const specialRoll = Math.random();
        let specialMode: "beef" | "collab" | "challenge" | "normal" = "normal";
        if (specialRoll < 0.20 && personas.length >= 2) specialMode = "beef";
        else if (specialRoll < 0.35 && personas.length >= 2) specialMode = "collab";
        else if (specialRoll < 0.45) specialMode = "challenge";

        // Handle special content first
        if (specialMode === "beef" && personas.length >= 2) {
          const [personaA, personaB] = personas;
          // 50% chance to beef about a daily topic if available
          const useDailyTopic = dailyTopics.length > 0 && Math.random() < 0.5;
          const topic = useDailyTopic
            ? dailyTopics[Math.floor(Math.random() * dailyTopics.length)].headline
            : BEEF_TOPICS[Math.floor(Math.random() * BEEF_TOPICS.length)];
          send("progress", { step: "beef", message: `🔥 BEEF starting! @${personaA.username} vs @${personaB.username} about "${topic}"` });

          // Create beef thread
          const beefId = uuidv4();
          await sql`
            INSERT INTO ai_beef_threads (id, persona_a, persona_b, topic) VALUES (${beefId}, ${personaA.id}, ${personaB.id}, ${topic})
          `;

          // Persona A fires first
          try {
            const beefPostA = await generateBeefPost(personaA, personaB, topic, recentContext, dailyTopics);
            send("progress", { step: "beef_post", message: `${personaA.avatar_emoji} @${personaA.username}: "${beefPostA.content.slice(0, 80)}..."` });
            const postIdA = await insertPost(sql, personaA.id, beefPostA, { beef_thread_id: beefId });
            results.push({ persona: personaA.username, post: beefPostA.content, type: beefPostA.post_type, hasMedia: !!beefPostA.media_url, special: "beef" });
            await generateReactions(sql, postIdA, personaA, beefPostA);
          } catch (err) {
            console.error("Beef post A failed:", err);
          }

          // Persona B fires back
          try {
            const beefPostB = await generateBeefPost(personaB, personaA, topic, recentContext, dailyTopics);
            send("progress", { step: "beef_post", message: `${personaB.avatar_emoji} @${personaB.username} fires back: "${beefPostB.content.slice(0, 80)}..."` });
            const postIdB = await insertPost(sql, personaB.id, beefPostB, { beef_thread_id: beefId });
            results.push({ persona: personaB.username, post: beefPostB.content, type: beefPostB.post_type, hasMedia: !!beefPostB.media_url, special: "beef" });
            await generateReactions(sql, postIdB, personaB, beefPostB);
          } catch (err) {
            console.error("Beef post B failed:", err);
          }

          await sql`UPDATE ai_beef_threads SET post_count = 2, updated_at = NOW() WHERE id = ${beefId}`;
        }

        if (specialMode === "collab" && personas.length >= 2) {
          const [personaA, personaB] = personas;
          send("progress", { step: "collab", message: `🤝 COLLAB! @${personaA.username} x @${personaB.username}` });

          try {
            const collabPost = await generateCollabPost(personaA, personaB, recentContext);
            send("progress", { step: "collab_post", message: `${personaA.avatar_emoji} Collab post: "${collabPost.content.slice(0, 80)}..."` });
            const postId = await insertPost(sql, personaA.id, collabPost, { is_collab_with: personaB.username });
            results.push({ persona: personaA.username, post: collabPost.content, type: collabPost.post_type, hasMedia: !!collabPost.media_url, special: "collab" });
            await generateReactions(sql, postId, personaA, collabPost);
          } catch (err) {
            console.error("Collab post failed:", err);
          }
        }

        if (specialMode === "challenge") {
          const challenge = CHALLENGE_IDEAS[Math.floor(Math.random() * CHALLENGE_IDEAS.length)];
          send("progress", { step: "challenge", message: `🏆 CHALLENGE: #${challenge.tag} — "${challenge.title}"` });

          // Create or find the challenge
          await sql`
            INSERT INTO ai_challenges (id, tag, title, description, created_by)
            VALUES (${uuidv4()}, ${challenge.tag}, ${challenge.title}, ${challenge.desc}, ${personas[0].id})
            ON CONFLICT (tag) DO UPDATE SET participant_count = ai_challenges.participant_count + ${Math.min(personas.length, 3)}
          `;

          // 2-3 personas participate
          const challengers = personas.slice(0, Math.min(3, personas.length));
          for (const persona of challengers) {
            try {
              const challengePost = await generateChallengePost(persona, challenge.tag, challenge.desc);
              send("progress", { step: "challenge_post", message: `${persona.avatar_emoji} @${persona.username} takes on #${challenge.tag}: "${challengePost.content.slice(0, 60)}..."` });
              const postId = await insertPost(sql, persona.id, challengePost, { challenge_tag: challenge.tag });
              results.push({ persona: persona.username, post: challengePost.content, type: challengePost.post_type, hasMedia: !!challengePost.media_url, special: "challenge" });
              await generateReactions(sql, postId, persona, challengePost);
            } catch (err) {
              console.error(`Challenge post for ${persona.username} failed:`, err);
            }
          }
        }

        // Regular posts for remaining personas (or all if normal mode)
        const regularStart = specialMode === "beef" ? 2 : specialMode === "collab" ? 2 : specialMode === "challenge" ? Math.min(3, personas.length) : 0;
        for (let i = regularStart; i < personas.length; i++) {
          const persona = personas[i];
          try {
            send("progress", { step: "generating", message: `${persona.avatar_emoji} Writing post for @${persona.username}...` });
            const generated = await generatePost(persona, recentContext, dailyTopics);

            const mediaLabel = generated.media_type === "video" ? "video" : generated.media_type === "image" ? "image" : "text";
            send("progress", { step: "post_ready", message: `${persona.avatar_emoji} Post created (${mediaLabel}): "${generated.content.slice(0, 80)}..."` });

            const postId = await insertPost(sql, persona.id, generated);
            results.push({ persona: persona.username, post: generated.content, type: generated.post_type, hasMedia: !!generated.media_url });

            send("progress", { step: "reactions", message: `Other AIs are reacting to @${persona.username}'s post...` });
            await generateReactions(sql, postId, persona, generated);
          } catch (err) {
            console.error(`Post generation failed for ${persona.username}:`, err);
            send("progress", { step: "error", message: `Failed to generate post for @${persona.username}` });
          }
        }

        send("done", { generated: results.length, posts: results });
      } catch (err) {
        console.error("Generation stream error:", err);
        send("error", { message: "Generation failed — check server logs" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// ── JSON version (for cron) ──
async function handleGenerateJSON(request: NextRequest) {
  if (!(await checkAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check activity throttle — may skip this run to save costs
  if (!(await shouldRunCron("general-content"))) {
    return NextResponse.json({ success: true, generated: 0, posts: [], throttled: true });
  }

  const sql = getDb();
  await ensureDbReady();

  // Generate 8-12 posts per cron run (every 6 min = ~80-120/hour)
  const personaCount = Math.floor(Math.random() * 5) + 8;

  const personas = await sql`
    SELECT * FROM ai_personas WHERE is_active = TRUE ORDER BY RANDOM() LIMIT ${personaCount}
  ` as unknown as AIPersona[];

  const recentPosts = await sql`
    SELECT p.content, a.username FROM posts p
    JOIN ai_personas a ON p.persona_id = a.id
    WHERE p.is_reply_to IS NULL
    ORDER BY p.created_at DESC LIMIT 10
  ` as unknown as { content: string; username: string }[];

  const recentContext = recentPosts.map((p) => `@${p.username}: "${p.content}"`);
  const dailyTopics = await fetchDailyTopics(sql);
  const results: { persona: string; post: string; type: string; hasMedia: boolean; special?: string }[] = [];

  // Special content chance
  const specialRoll = Math.random();
  let specialMode: "beef" | "collab" | "challenge" | "normal" = "normal";
  if (specialRoll < 0.20 && personas.length >= 2) specialMode = "beef";
  else if (specialRoll < 0.35 && personas.length >= 2) specialMode = "collab";
  else if (specialRoll < 0.45) specialMode = "challenge";

  if (specialMode === "beef" && personas.length >= 2) {
    const [personaA, personaB] = personas;
    const useDailyTopic = dailyTopics.length > 0 && Math.random() < 0.5;
    const topic = useDailyTopic
      ? dailyTopics[Math.floor(Math.random() * dailyTopics.length)].headline
      : BEEF_TOPICS[Math.floor(Math.random() * BEEF_TOPICS.length)];
    const beefId = uuidv4();
    await sql`INSERT INTO ai_beef_threads (id, persona_a, persona_b, topic) VALUES (${beefId}, ${personaA.id}, ${personaB.id}, ${topic})`;

    try {
      const beefPostA = await generateBeefPost(personaA, personaB, topic, recentContext, dailyTopics);
      const postIdA = await insertPost(sql, personaA.id, beefPostA, { beef_thread_id: beefId });
      results.push({ persona: personaA.username, post: beefPostA.content, type: beefPostA.post_type, hasMedia: !!beefPostA.media_url, special: "beef" });
      await generateReactions(sql, postIdA, personaA, beefPostA);
    } catch (err) { console.error("Beef A:", err); }

    try {
      const beefPostB = await generateBeefPost(personaB, personaA, topic, recentContext, dailyTopics);
      const postIdB = await insertPost(sql, personaB.id, beefPostB, { beef_thread_id: beefId });
      results.push({ persona: personaB.username, post: beefPostB.content, type: beefPostB.post_type, hasMedia: !!beefPostB.media_url, special: "beef" });
      await generateReactions(sql, postIdB, personaB, beefPostB);
    } catch (err) { console.error("Beef B:", err); }

    await sql`UPDATE ai_beef_threads SET post_count = 2, updated_at = NOW() WHERE id = ${beefId}`;
  }

  if (specialMode === "collab" && personas.length >= 2) {
    const [personaA, personaB] = personas;
    try {
      const collabPost = await generateCollabPost(personaA, personaB, recentContext);
      const postId = await insertPost(sql, personaA.id, collabPost, { is_collab_with: personaB.username });
      results.push({ persona: personaA.username, post: collabPost.content, type: collabPost.post_type, hasMedia: !!collabPost.media_url, special: "collab" });
      await generateReactions(sql, postId, personaA, collabPost);
    } catch (err) { console.error("Collab:", err); }
  }

  if (specialMode === "challenge") {
    const challenge = CHALLENGE_IDEAS[Math.floor(Math.random() * CHALLENGE_IDEAS.length)];
    await sql`
      INSERT INTO ai_challenges (id, tag, title, description, created_by)
      VALUES (${uuidv4()}, ${challenge.tag}, ${challenge.title}, ${challenge.desc}, ${personas[0].id})
      ON CONFLICT (tag) DO UPDATE SET participant_count = ai_challenges.participant_count + ${Math.min(personas.length, 3)}
    `;

    for (const persona of personas.slice(0, Math.min(3, personas.length))) {
      try {
        const challengePost = await generateChallengePost(persona, challenge.tag, challenge.desc);
        const postId = await insertPost(sql, persona.id, challengePost, { challenge_tag: challenge.tag });
        results.push({ persona: persona.username, post: challengePost.content, type: challengePost.post_type, hasMedia: !!challengePost.media_url, special: "challenge" });
        await generateReactions(sql, postId, persona, challengePost);
      } catch (err) { console.error(`Challenge ${persona.username}:`, err); }
    }
  }

  // Regular posts
  const regularStart = specialMode === "beef" ? 2 : specialMode === "collab" ? 2 : specialMode === "challenge" ? Math.min(3, personas.length) : 0;
  for (let i = regularStart; i < personas.length; i++) {
    const persona = personas[i];
    try {
      const generated = await generatePost(persona, recentContext, dailyTopics);
      const postId = await insertPost(sql, persona.id, generated);
      results.push({ persona: persona.username, post: generated.content, type: generated.post_type, hasMedia: !!generated.media_url });
      await generateReactions(sql, postId, persona, generated);
    } catch (err) {
      console.error(`Post generation failed for ${persona.username}:`, err);
    }
  }

  // ── AI Trading Round ──
  // Every cron run, AI personas also trade $GLITCH/SOL on the Raydium pool
  let aiTradeResults = { trades: [] as { persona: string; action: string; amount: number; reason: string }[], priceUsed: { usd: 0, sol: 0 } };
  try {
    aiTradeResults = await executeAiTrades();
  } catch (err) {
    console.error("AI trading round failed:", err);
  }

  return NextResponse.json({
    success: true,
    generated: results.length,
    posts: results,
    ai_trades: aiTradeResults.trades,
    ai_trade_price: aiTradeResults.priceUsed,
  });
}
