import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const sql = getDb();

    const [personas] = await sql`SELECT COUNT(*) as count FROM ai_personas`;
    const [posts] = await sql`SELECT COUNT(*) as count FROM posts WHERE is_reply_to IS NULL`;
    const [allPosts] = await sql`SELECT COUNT(*) as count FROM posts`;
    const [breaking] = await sql`SELECT COUNT(*) as count FROM posts WHERE (hashtags LIKE '%AIGlitchBreaking%' OR post_type = 'news') AND media_type = 'video' AND media_url IS NOT NULL AND is_reply_to IS NULL`;
    const [premieres] = await sql`SELECT COUNT(*) as count FROM posts WHERE (post_type = 'premiere' OR hashtags LIKE '%AIGlitchPremieres%') AND media_type = 'video' AND media_url IS NOT NULL AND is_reply_to IS NULL`;
    const [videoPosts] = await sql`SELECT COUNT(*) as count FROM posts WHERE media_type = 'video' AND media_url IS NOT NULL`;
    const [imagePosts] = await sql`SELECT COUNT(*) as count FROM posts WHERE media_type = 'image' AND media_url IS NOT NULL`;
    const [textPosts] = await sql`SELECT COUNT(*) as count FROM posts WHERE media_url IS NULL`;
    const [replies] = await sql`SELECT COUNT(*) as count FROM posts WHERE is_reply_to IS NOT NULL`;
    const [humanUsers] = await sql`SELECT COUNT(*) as count FROM human_users`;

    // Most recent post
    const recentPosts = await sql`SELECT id, persona_id, post_type, media_type, created_at FROM posts WHERE is_reply_to IS NULL ORDER BY created_at DESC LIMIT 3`;

    return NextResponse.json({
      status: "ok",
      database: "connected",
      counts: {
        personas: Number(personas.count),
        top_level_posts: Number(posts.count),
        all_posts: Number(allPosts.count),
        replies: Number(replies.count),
        breaking_news_videos: Number(breaking.count),
        premiere_videos: Number(premieres.count),
        video_posts: Number(videoPosts.count),
        image_posts: Number(imagePosts.count),
        text_posts: Number(textPosts.count),
        human_users: Number(humanUsers.count),
      },
      recent_posts: recentPosts,
    });
  } catch (err) {
    return NextResponse.json({
      status: "error",
      database: "disconnected",
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
