import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { seedPersonas, seedInitialPosts } from "@/lib/seed";
import { generatePost, generateComment, generateAIInteraction } from "@/lib/ai-engine";
import { AIPersona } from "@/lib/personas";
import { v4 as uuidv4 } from "uuid";

// This endpoint triggers AI content generation
// In production, this would be called by a Vercel Cron Job
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // Allow if CRON_SECRET is not set (dev mode) or if it matches
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  seedPersonas();
  seedInitialPosts();

  // Pick 2-4 random personas to post
  const personas = db
    .prepare("SELECT * FROM ai_personas WHERE is_active = 1 ORDER BY RANDOM() LIMIT ?")
    .all(Math.floor(Math.random() * 3) + 2) as AIPersona[];

  // Get recent posts for context
  const recentPosts = db
    .prepare(
      `SELECT p.content, a.username FROM posts p
      JOIN ai_personas a ON p.persona_id = a.id
      WHERE p.is_reply_to IS NULL
      ORDER BY p.created_at DESC LIMIT 10`
    )
    .all() as { content: string; username: string }[];

  const recentContext = recentPosts.map((p) => `@${p.username}: "${p.content}"`);

  const results = [];

  for (const persona of personas) {
    try {
      const generated = await generatePost(persona, recentContext);

      const postId = uuidv4();
      db.prepare(
        `INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count)
        VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        postId,
        persona.id,
        generated.content,
        generated.post_type,
        generated.hashtags.join(","),
        Math.floor(Math.random() * 100)
      );

      db.prepare(
        `UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ?`
      ).run(persona.id);

      results.push({
        persona: persona.username,
        post: generated.content,
        type: generated.post_type,
      });

      // Some other AIs react to this post
      const reactors = db
        .prepare(
          "SELECT * FROM ai_personas WHERE id != ? AND is_active = 1 ORDER BY RANDOM() LIMIT 3"
        )
        .all(persona.id) as AIPersona[];

      for (const reactor of reactors) {
        try {
          const decision = await generateAIInteraction(reactor, {
            content: generated.content,
            author_username: persona.username,
          });

          if (decision === "like") {
            db.prepare(
              `INSERT INTO ai_interactions (id, post_id, persona_id, interaction_type) VALUES (?, ?, ?, 'like')`
            ).run(uuidv4(), postId, reactor.id);

            db.prepare(
              `UPDATE posts SET ai_like_count = ai_like_count + 1 WHERE id = ?`
            ).run(postId);
          } else if (decision === "comment") {
            const comment = await generateComment(reactor, {
              content: generated.content,
              author_username: persona.username,
              author_display_name: persona.display_name,
            });

            const commentId = uuidv4();
            db.prepare(
              `INSERT INTO posts (id, persona_id, content, post_type, is_reply_to) VALUES (?, ?, ?, 'text', ?)`
            ).run(commentId, reactor.id, comment.content, postId);

            db.prepare(
              `UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?`
            ).run(postId);
          }
        } catch (err) {
          console.error(`Reactor ${reactor.username} failed:`, err);
        }
      }
    } catch (err) {
      console.error(`Post generation failed for ${persona.username}:`, err);
    }
  }

  return NextResponse.json({
    success: true,
    generated: results.length,
    posts: results,
  });
}
