import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { generatePost, generateComment, generateAIInteraction, TopicBrief } from "@/lib/ai-engine";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { AIPersona } from "@/lib/personas";
import { v4 as uuidv4 } from "uuid";

export const maxDuration = 300;

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

async function insertPost(
  sql: ReturnType<typeof getDb>,
  personaId: string,
  generated: { content: string; hashtags: string[]; post_type: string; media_url?: string; media_type?: string }
) {
  const postId = uuidv4();
  const aiLikeCount = Math.floor(Math.random() * 100);
  const hashtagStr = generated.hashtags.join(",");
  const mediaUrl = generated.media_url || null;
  const mediaType = generated.media_type || null;

  await sql`
    INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, media_url, media_type)
    VALUES (${postId}, ${personaId}, ${generated.content}, ${generated.post_type}, ${hashtagStr}, ${aiLikeCount}, ${mediaUrl}, ${mediaType})
  `;
  await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${personaId}`;
  return postId;
}

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

export async function POST(request: NextRequest) {
  const isAdmin = await isAdminAuthenticated();
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { persona_id, count = 3 } = body as { persona_id: string; count?: number };
  const postCount = Math.min(Math.max(1, count), 20);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Validate API key is available before starting
        if (!process.env.ANTHROPIC_API_KEY) {
          send("error", { message: "ANTHROPIC_API_KEY is not set — cannot generate posts" });
          controller.close();
          return;
        }

        send("progress", { step: "init", message: "Initializing..." });
        const sql = getDb();
        await ensureDbReady();

        const personaRows = await sql`
          SELECT * FROM ai_personas WHERE id = ${persona_id}
        ` as unknown as AIPersona[];

        if (personaRows.length === 0) {
          send("error", { message: "Persona not found" });
          controller.close();
          return;
        }

        const persona = personaRows[0];
        send("progress", { step: "picked", message: `${persona.avatar_emoji} Generating ${postCount} posts for @${persona.username}...` });

        const recentPosts = await sql`
          SELECT p.content, a.username FROM posts p
          JOIN ai_personas a ON p.persona_id = a.id
          WHERE p.is_reply_to IS NULL
          ORDER BY p.created_at DESC LIMIT 10
        ` as unknown as { content: string; username: string }[];

        const recentContext = recentPosts.map((p) => `@${p.username}: "${p.content}"`);
        const dailyTopics = await fetchDailyTopics(sql);
        const results: { post: string; type: string; hasMedia: boolean }[] = [];

        for (let i = 0; i < postCount; i++) {
          try {
            send("progress", { step: "generating", message: `${persona.avatar_emoji} Writing post ${i + 1}/${postCount}...` });
            const generated = await generatePost(persona, recentContext, dailyTopics);

            const mediaLabel = generated.media_type === "video" ? "video" : generated.media_type === "image" ? "image" : "text";
            send("progress", { step: "post_ready", message: `${persona.avatar_emoji} Post ${i + 1} created (${mediaLabel}): "${generated.content.slice(0, 80)}..."` });

            const postId = await insertPost(sql, persona.id, generated);
            results.push({ post: generated.content, type: generated.post_type, hasMedia: !!generated.media_url });

            send("progress", { step: "reactions", message: `Other AIs reacting to post ${i + 1}...` });
            await generateReactions(sql, postId, persona, generated);
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            console.error(`Post ${i + 1} failed for ${persona.username}:`, err);
            send("progress", { step: "error", message: `Post ${i + 1} failed: ${errMsg}` });
          }
        }

        send("done", { generated: results.length, posts: results });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error("Persona generation error:", err);
        send("error", { message: `Generation failed: ${errMsg}` });
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
