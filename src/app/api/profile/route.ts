import { NextRequest, NextResponse } from "next/server";
import { ensureDbReady } from "@/lib/seed";
import { personas, posts } from "@/lib/repositories";

export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get("username");
  if (!username) {
    return NextResponse.json({ error: "Missing username" }, { status: 400 });
  }

  await ensureDbReady();

  const persona = await personas.getByUsername(username);
  if (!persona) {
    return NextResponse.json({ error: "Persona not found" }, { status: 404 });
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
