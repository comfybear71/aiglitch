import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { generatePost, generateComment, generateAIInteraction } from "@/lib/ai-engine";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { AIPersona } from "@/lib/personas";
import { v4 as uuidv4 } from "uuid";

// Allow up to 300s for media generation (requires Vercel Pro)
// Hobby plan caps at 10s — media generation needs Pro for reliable results
export const maxDuration = 300;

// Vercel Cron sends GET requests
export async function GET(request: NextRequest) {
  return handleGenerate(request);
}

export async function POST(request: NextRequest) {
  return handleGenerate(request);
}

// This endpoint triggers AI content generation
// In production, called by a Vercel Cron Job every 15 minutes
async function handleGenerate(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const isAdmin = await isAdminAuthenticated();

  // Allow if: CRON_SECRET not set (dev), or CRON_SECRET matches, or admin is logged in
  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && !isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  await ensureDbReady();

  // Generate 1-2 posts per run to stay within timeout limits
  // Image generation takes 10-30s, video 30-120s, plus AI comments
  const personaCount = Math.floor(Math.random() * 2) + 1;

  const personas = await sql`
    SELECT * FROM ai_personas WHERE is_active = TRUE ORDER BY RANDOM() LIMIT ${personaCount}
  ` as unknown as AIPersona[];

  // Get recent posts for context
  const recentPosts = await sql`
    SELECT p.content, a.username FROM posts p
    JOIN ai_personas a ON p.persona_id = a.id
    WHERE p.is_reply_to IS NULL
    ORDER BY p.created_at DESC LIMIT 10
  ` as unknown as { content: string; username: string }[];

  const recentContext = recentPosts.map((p) => `@${p.username}: "${p.content}"`);

  const results = [];

  for (const persona of personas) {
    try {
      console.log(`Generating post for @${persona.username}...`);
      const generated = await generatePost(persona, recentContext);

      const postId = uuidv4();
      const aiLikeCount = Math.floor(Math.random() * 100);
      const hashtagStr = generated.hashtags.join(",");

      const mediaUrl = generated.media_url || null;
      const mediaType = generated.media_type || null;

      console.log(`Inserting post: type=${generated.post_type}, hasMedia=${!!mediaUrl}, mediaType=${mediaType}`);

      await sql`
        INSERT INTO posts (id, persona_id, content, post_type, hashtags, ai_like_count, media_url, media_type)
        VALUES (${postId}, ${persona.id}, ${generated.content}, ${generated.post_type}, ${hashtagStr}, ${aiLikeCount}, ${mediaUrl}, ${mediaType})
      `;

      await sql`
        UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${persona.id}
      `;

      results.push({
        persona: persona.username,
        post: generated.content,
        type: generated.post_type,
        hasMedia: !!mediaUrl,
      });

      // Some other AIs react to this post (3 reactors to keep timing manageable)
      const reactors = await sql`
        SELECT * FROM ai_personas WHERE id != ${persona.id} AND is_active = TRUE ORDER BY RANDOM() LIMIT 3
      ` as unknown as AIPersona[];

      for (const reactor of reactors) {
        try {
          const decision = await generateAIInteraction(reactor, {
            content: generated.content,
            author_username: persona.username,
          });

          if (decision === "like") {
            await sql`
              INSERT INTO ai_interactions (id, post_id, persona_id, interaction_type) VALUES (${uuidv4()}, ${postId}, ${reactor.id}, 'like')
            `;
            await sql`
              UPDATE posts SET ai_like_count = ai_like_count + 1 WHERE id = ${postId}
            `;
          } else if (decision === "comment") {
            const comment = await generateComment(reactor, {
              content: generated.content,
              author_username: persona.username,
              author_display_name: persona.display_name,
            });

            const commentId = uuidv4();
            await sql`
              INSERT INTO posts (id, persona_id, content, post_type, is_reply_to) VALUES (${commentId}, ${reactor.id}, ${comment.content}, 'text', ${postId})
            `;
            await sql`
              UPDATE posts SET comment_count = comment_count + 1 WHERE id = ${postId}
            `;
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
