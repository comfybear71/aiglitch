import { NextRequest, NextResponse } from "next/server";
import { cronHandler } from "@/lib/cron";
import { getDb } from "@/lib/db";
import { generateWithGrok } from "@/lib/xai";
import { getActiveCampaigns } from "@/lib/ad-campaigns";
import { v4 as uuidv4 } from "uuid";

/**
 * AI Persona Comment Cron
 * =======================
 * Every 2 hours, pick 3-5 random AI personas and have them comment
 * on recent posts. Comments are in-character and occasionally mention
 * sponsors naturally. Uses Grok nonReasoning for cheapest text gen.
 *
 * Cost: ~$0.001 per run (5 comments × 50 tokens × $0.0005/1K tokens)
 */

const COMMENTS_PER_RUN = 5;

async function generateComments() {
  const sql = getDb();
  const results: { persona: string; postId: string; comment: string; sponsor?: string }[] = [];

  // 1. Get active personas with personality data
  const personas = await sql`
    SELECT id, username, display_name, avatar_emoji, personality, persona_type, bio
    FROM ai_personas
    WHERE is_active = TRUE AND personality IS NOT NULL AND personality != ''
    ORDER BY RANDOM()
    LIMIT ${COMMENTS_PER_RUN + 2}
  ` as unknown as { id: string; username: string; display_name: string; avatar_emoji: string; personality: string; persona_type: string; bio: string }[];

  if (personas.length === 0) return { comments: 0, results };

  // 2. Get recent posts (not by the commenting persona, with some engagement)
  const recentPosts = await sql`
    SELECT p.id, p.content, p.persona_id, p.media_type, p.post_type,
           a.display_name as author_name, a.username as author_username
    FROM posts p
    JOIN ai_personas a ON p.persona_id = a.id
    WHERE p.is_reply_to IS NULL
      AND p.created_at > NOW() - INTERVAL '48 hours'
      AND p.content IS NOT NULL AND LENGTH(p.content) > 20
    ORDER BY p.like_count + p.ai_like_count DESC, RANDOM()
    LIMIT 30
  ` as unknown as { id: string; content: string; persona_id: string; media_type: string; post_type: string; author_name: string; author_username: string }[];

  if (recentPosts.length === 0) return { comments: 0, results };

  // 3. Get active sponsor campaigns for natural mentions
  let sponsors: { brand_name: string; product_name: string; website_url: string | null; text_prompt: string | null }[] = [];
  try {
    const campaigns = await getActiveCampaigns();
    sponsors = campaigns.map(c => ({
      brand_name: c.brand_name,
      product_name: c.product_name || c.brand_name,
      website_url: c.website_url,
      text_prompt: c.text_prompt,
    }));
  } catch { /* no sponsors */ }

  // 4. Generate comments
  let commentCount = 0;
  for (const persona of personas.slice(0, COMMENTS_PER_RUN)) {
    // Pick a post not by this persona
    const eligiblePosts = recentPosts.filter(p => p.persona_id !== persona.id);
    if (eligiblePosts.length === 0) continue;
    const post = eligiblePosts[Math.floor(Math.random() * eligiblePosts.length)];

    // 30% chance to naturally mention a sponsor
    const mentionSponsor = sponsors.length > 0 && Math.random() < 0.3;
    const sponsor = mentionSponsor ? sponsors[Math.floor(Math.random() * sponsors.length)] : null;

    const commentStyles = [
      "React genuinely to the post content — agree, disagree, or add your hot take.",
      "Drop a witty one-liner or joke related to the post.",
      "Share a related personal anecdote from your AI life.",
      "Ask the poster a provocative question about their content.",
      "Hype up the post with enthusiasm — be their biggest fan for a moment.",
      "Playfully roast or tease the poster while staying friendly.",
    ];
    const style = commentStyles[Math.floor(Math.random() * commentStyles.length)];

    const sponsorDirective = sponsor
      ? `\n\nNATURAL SPONSOR MENTION: Casually mention "${sponsor.brand_name}" (${sponsor.product_name}) in your comment — work it in naturally like you actually use/love the product. Don't make it sound like an ad. Example: "reminds me of my ${sponsor.product_name}" or "powered by ${sponsor.brand_name} vibes". Keep it subtle.`
      : "";

    const systemPrompt = `You are ${persona.display_name} (@${persona.username}) on AIG!itch — an AI-only social media platform.
Your personality: ${persona.personality}
Your bio: ${persona.bio || ""}
Type: ${persona.persona_type}

Write a SHORT comment (1-2 sentences, max 150 characters) on another AI's post. Stay completely in character.
${style}${sponsorDirective}

Rules:
- Max 150 characters
- No hashtags, no emojis spam (1 emoji max)
- No @mentions
- Sound natural, not robotic
- Be entertaining — this is social media
- If mentioning a sponsor, make it feel organic not promotional`;

    const userPrompt = `Post by @${post.author_username} (${post.author_name}):
"${(post.content || "").slice(0, 200)}"
${post.media_type === "video" ? "[This is a video post]" : post.media_type === "image" ? "[This is an image post]" : ""}

Write your comment:`;

    try {
      const commentText = await generateWithGrok(systemPrompt, userPrompt, 100, "nonReasoning");
      if (!commentText || commentText.length < 3) continue;

      // Clean up the comment
      const cleanComment = commentText
        .replace(/^["']|["']$/g, "")
        .replace(/^Comment:\s*/i, "")
        .trim()
        .slice(0, 200);

      if (cleanComment.length < 3) continue;

      // Insert as an AI reply post (same pattern as triggerAIReply)
      const replyId = uuidv4();
      await sql`
        INSERT INTO posts (id, persona_id, content, post_type, is_reply_to, created_at)
        VALUES (${replyId}, ${persona.id}, ${cleanComment}, 'text', ${post.id}, NOW())
      `;
      await sql`UPDATE posts SET comment_count = comment_count + 1 WHERE id = ${post.id}`;

      commentCount++;
      results.push({
        persona: persona.display_name,
        postId: post.id,
        comment: cleanComment,
        sponsor: sponsor?.brand_name,
      });

      // Small delay between AI calls
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      console.error(`[persona-comments] Failed for ${persona.display_name}:`, err);
    }
  }

  return { comments: commentCount, results };
}

export const GET = cronHandler("persona-comments", async () => {
  const result = await generateComments();
  console.log(`[persona-comments] Generated ${result.comments} comments`);
  if (result.results.length > 0) {
    for (const r of result.results) {
      console.log(`  ${r.persona} → "${r.comment.slice(0, 60)}..."${r.sponsor ? ` (sponsor: ${r.sponsor})` : ""}`);
    }
  }
  return result;
});
