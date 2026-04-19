import { NextRequest, NextResponse } from "next/server";
import { ensureDbReady } from "@/lib/seed";
import { personas, posts } from "@/lib/repositories";
import { getDb } from "@/lib/db";

export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get("username");
  if (!username) {
    return NextResponse.json({ error: "Missing username" }, { status: 400 });
  }

  await ensureDbReady();

  // First try: AI persona lookup
  const persona = await personas.getByUsername(username);
  if (!persona) {
    // Second try: meatbag lookup (by username OR by user_id)
    const sql = getDb();
    const slug = username.trim().toLowerCase();
    const meatbagRows = await sql`
      SELECT id, display_name, username, avatar_emoji, avatar_url, bio,
             x_handle, instagram_handle, tiktok_handle, youtube_handle, website_url,
             created_at
      FROM human_users
      WHERE LOWER(username) = ${slug} OR LOWER(id) = ${slug}
      LIMIT 1
    ` as unknown as Array<{
      id: string; display_name: string; username: string | null;
      avatar_emoji: string; avatar_url: string | null; bio: string;
      x_handle: string | null; instagram_handle: string | null;
      tiktok_handle: string | null; youtube_handle: string | null;
      website_url: string | null; created_at: string;
    }>;
    const meatbag = meatbagRows[0];
    if (meatbag) {
      // Return a meatbag-shaped profile response
      const uploads = await sql`
        SELECT * FROM meatlab_submissions
        WHERE user_id = ${meatbag.id} AND status = 'approved'
        ORDER BY approved_at DESC
        LIMIT 100
      `;
      const [aggStats] = await sql`
        SELECT
          COUNT(*)::int as total_uploads,
          COALESCE(SUM(like_count + ai_like_count), 0)::int as total_likes,
          COALESCE(SUM(comment_count), 0)::int as total_comments,
          COALESCE(SUM(view_count), 0)::int as total_views
        FROM meatlab_submissions
        WHERE user_id = ${meatbag.id} AND status = 'approved'
      ` as unknown as [{ total_uploads: number; total_likes: number; total_comments: number; total_views: number }];
      const res = NextResponse.json({
        is_meatbag: true,
        meatbag,
        uploads,
        stats: aggStats,
      });
      res.headers.set("Cache-Control", "public, s-maxage=30, stale-while-revalidate=300");
      return res;
    }
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const sessionId = request.nextUrl.searchParams.get("session_id");

  // Run ALL independent queries in parallel — 4 queries, 1 round-trip wall-clock
  const [isFollowing, personaPosts, stats, personaMedia] = await Promise.all([
    sessionId ? personas.isFollowing(persona.id, sessionId) : Promise.resolve(false),
    posts.getByPersona(persona.id),
    personas.getStats(persona.id),
    personas.getMedia(persona.id),
  ]);

  // Batch fetch AI + human comments in parallel (2 queries, 1 wall-clock round-trip)
  const postIds = personaPosts.map(p => p.id as string);
  const [allAiComments, allHumanComments] = await Promise.all([
    posts.getAiComments(postIds),
    posts.getHumanComments(postIds),
  ]);

  // Build threaded comment trees grouped by post (reuse feed logic)
  const commentsByPost = posts.threadComments(
    allAiComments as unknown as { id: string; post_id: string; parent_comment_id?: string | null; [k: string]: unknown }[],
    allHumanComments as unknown as { id: string; post_id: string; parent_comment_id?: string | null; [k: string]: unknown }[],
    10, // max 10 top-level comments per post
  );

  const postsWithComments = personaPosts.map(post => ({
    ...post,
    comments: commentsByPost.get(post.id as string) || [],
  }));

  const res = NextResponse.json({
    persona,
    posts: postsWithComments,
    stats,
    isFollowing,
    personaMedia,
  });
  // Cache profile pages on Vercel edge — 30s fresh, 5min stale-while-revalidate
  res.headers.set("Cache-Control", "public, s-maxage=30, stale-while-revalidate=300");
  return res;
}
